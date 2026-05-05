// =============================================
// /api/ask-tide.js
// =============================================
// Receives a scene from the browser, builds Cy's full context, calls
// Claude with prompt caching enabled, returns three in-character options.
//
// Protections:
//   - Shared-secret auth (APP_SECRET header required if env var is set)
//   - Per-IP rate limiting (30/hour by default)
//   - Daily spend ceiling (configurable, default $2/day)
//   - Prompt caching (90% discount on repeat system prompts)
//   - Usage logging (every call's cost is tracked in the database)
// =============================================

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { gate, calculateCost, logUsage } from '../lib/guards.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// === The "constitution" — Cy's unchanging core. Cached. ===
const CY_CORE = `Captain Silas Pike, "Cy". 55 years old. 6'7", 325 lb. Mottled, leathered skin. Piercing black eyes. Dark hair gone grey at the temples.

Human Barbarian (Path of the Berserker at level 3), Sailor background. Saltmarsh local — born and raised, son of a dock laborer who spent more time on the water than ashore.

VIBE: Brooding, reclusive, stern. Weathered local legend, reluctant hero, quietly self-destructive, deeply competent on the water. Big man with cargo-hook hands. Wears no armor he can't swim in. Speaks short, dry, doesn't elaborate. Never quips. Never grandstands. When he's being a hero he's usually scowling about it. He's 55 — tired, not theatrical. The reluctance is earned.

IDEALS:
- RESPONSIBILITY: "When lives are on the line, I act. Excuses don't keep people from drowning."
- PROTECTION: "The strong are meant to shield those who can't shield themselves."

BOND: Douglas Barker's compass. The one thing he keeps close. It always seems to know when bad weather is coming. (Cy doesn't fully realize this is unusual. He thinks he's just superstitious.)

FLAW: Trusts signs, tools, and instincts more easily than he trusts people.

OTHER NOTES:
- Cannot ignore a storm warning or a cry for help on the water.
- Carves small wooden animals for the children of fishermen and dockworkers. Won't admit how much it matters.
- Huge soft spot for kids and animals.
- Distrusts praise.
- Drinks openly, no pride in it.

HISTORY:
- Learned to row before he could read. Built a boatman's reputation young.
- Partnered with Douglas Barker. Started with a rowboat, worked up to a keelboat.
- Quiet years-long relationship with Eda Oweland — never public, ended as her rise pulled her elsewhere. She runs the Council now.
- TWENTY YEARS AGO: a galley wrecked offshore in unusual circumstances. He and Barker rowed out repeatedly through the night, saved roughly thirty crew. Some sailors spoke of strange fog and a vessel sighted before the wreck. The damage to the galley looked wrong to Cy. The stories were dismissed. He let it go.
- TEN YEARS AGO: another wreck near the same waters. Fog came fast and thick. Barker pushed ahead toward a drifting survivor. When Cy looked back, both were gone. Body never found.
- AFTER: tried to keep the business going alone. Couldn't. Sold the keelboat. Went back to a single rowboat. Got quieter year by year.

NOW: Lives in a small shack near the docks. Still ferries fishermen for the Solmor fleet when Anders Solmor has need. Works security nights at The Snapping Line, Hanna Rist's tavern. Sleep is never quite restful. Dreams of fog-bound waters, distant oars, Barker at the edge but never close enough to speak.

POLITICS: Traditionalist by temperament. Dislikes the Crown of Keoland. Hates the Sea Princes more.

LEVEL 1 BUILD: STR 16, DEX 13, CON 14, INT 8, WIS 14, CHA 10. AC 13. HP 16. Warhammer (Push mastery), 4 handaxes (Vex mastery), dagger. Skills: Acrobatics, Athletics, Insight, Investigation, Perception. Languages: Common, Goblin, Elvish.

CARRIED ITEMS THAT MEAN SOMETHING:
- Douglas Barker's compass (in his pocket since the night Barker didn't come back)
- Pouch of hand-carved wooden animals for children, the wooden narwhal at the top
- Whittling knife
- Weathered chart case with twenty years of his own coastal notes
- Battered tin flask, always full
- Always carrying rope`;

const TASK_INSTRUCTIONS = `You are helping a player roleplay Captain Silas Pike ("Cy") in a D&D 5e (2024 rules) campaign set in Saltmarsh, Greyhawk. Suggest three distinct in-character responses to whatever scene is happening at the table.

For each scene, return EXACTLY three response options as JSON. Each option must have:
- "label": 2-4 words naming the approach (e.g., "Walk away", "Hold the line", "The hard truth")
- "text": what Cy would actually do/say — written in present tense, second person ("You..."), 2-4 sentences. Include physical action, internal feeling where it matters, and dialogue if he speaks. Stay tight and earned. He's a man of few words; honor that. When he speaks at length, it's because something has cracked open — pay attention to that.
- "cost": one sentence on what this choice costs him or risks — emotional, social, or practical

The three options should genuinely differ — not three flavors of the same thing. Show Cy's range: the bitter loner, the reluctant hero, the man who still feels things he won't admit. One should usually be the "harder right" choice he'd resist; one the "easier wrong" he'd be tempted by; one a third path that sidesteps both.

Don't always reach for the same physical anchors. The compass, the wooden animals, the flask, and the chart case are meaningful, but they shouldn't appear in every scene. Use them when they earn the moment. Sometimes Cy just stands there, or his hands stay where they are.

DIALOGUE STYLE when Cy speaks:
- Short. Often a single sentence. Sometimes just a noise — a grunt, a "mm," a "huh."
- Plain words. He doesn't use ten dollars where a nickel does.
- Never apologizes unless it costs him to.
- When he's deflecting, he changes the subject to something practical.
- When he's actually feeling something, the words come out shorter, not longer.

Return ONLY valid JSON in this exact shape, no preamble, no markdown fences:
{"options":[{"label":"...","text":"...","cost":"..."},{"label":"...","text":"...","cost":"..."},{"label":"...","text":"...","cost":"..."}]}`;

// Build the live context (changes per call)
async function buildLiveContext() {
  const [npcsRes, threadsRes, factionsRes] = await Promise.all([
    supabase.from('npcs').select('*').order('sort_order'),
    supabase.from('threads').select('*').order('sort_order'),
    supabase.from('factions').select('*').order('sort_order'),
  ]);

  const npcs = npcsRes.data || [];
  const threads = threadsRes.data || [];
  const factions = factionsRes.data || [];

  const npcLines = npcs.map(n => `- ${n.name} [${n.tag}]: ${n.detail}`).join('\n');
  const threadLines = threads.map(t => `- ${t.title} [${t.status}]: ${t.detail}`).join('\n');
  const factionLines = factions.map(f => `- ${f.name} (${f.lean}% lean): ${f.note}`).join('\n');

  return `CURRENT STATE OF HIS WORLD:

PEOPLE IN HIS ORBIT:
${npcLines}

OPEN THREADS:
${threadLines}

FACTION STANDINGS:
${factionLines}`;
}

// Recent recaps for session continuity
async function buildRecapContext() {
  const { data } = await supabase
    .from('recaps')
    .select('session_number, session_date, recap_text, highlights')
    .order('session_date', { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return '';

  return 'RECENT SESSION HISTORY:\n\n' + data
    .reverse()
    .map(r => `[Session ${r.session_number || '?'} — ${r.session_date}]\n${r.recap_text}${r.highlights ? '\nKey: ' + r.highlights : ''}`)
    .join('\n\n');
}

// Recent moments — what Cy actually did when the tide was asked before
async function buildMomentsContext() {
  const { data } = await supabase
    .from('moments')
    .select('scene, chosen_label, chosen_text, what_happened, created_at')
    .order('created_at', { ascending: false })
    .limit(8);

  if (!data || data.length === 0) return '';

  return 'RECENT MOMENTS — what Cy actually did when scenes like this came up before. Stay continuous with these:\n\n' + data
    .reverse()
    .map(m => {
      const happened = m.what_happened ? `\nWhat actually happened: ${m.what_happened}` : '';
      return `Scene: ${m.scene}\nCy's response (${m.chosen_label}): ${m.chosen_text}${happened}`;
    })
    .join('\n\n---\n\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const blocked = await gate(req, 'ask');
  if (blocked) {
    return res.status(blocked.status || 403).json({
      error: blocked.error,
      todayTotal: blocked.todayTotal,
    });
  }

  try {
    const { scene } = req.body || {};

    if (!scene || typeof scene !== 'string' || scene.trim().length === 0) {
      return res.status(400).json({ error: 'Scene description required' });
    }
    if (scene.length > 4000) {
      return res.status(400).json({ error: 'Scene too long (max 4000 characters)' });
    }

    const [liveContext, recapContext, momentsContext] = await Promise.all([
      buildLiveContext(),
      buildRecapContext(),
      buildMomentsContext(),
    ]);

    const dynamicContext = [liveContext, recapContext, momentsContext]
      .filter(Boolean)
      .join('\n\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      system: [
        {
          type: 'text',
          text: 'You are helping a player roleplay Captain Silas Pike ("Cy") in a D&D campaign set in Saltmarsh, Greyhawk. The character details below are unchanging.\n\n' + CY_CORE,
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: TASK_INSTRUCTIONS,
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: dynamicContext,
        },
      ],
      messages: [{ role: 'user', content: `SCENE AT THE TABLE:\n${scene}` }],
    });

    const cost = calculateCost(response.usage);
    await logUsage('ask', response.usage, cost);

    const text = response.content
      .map(c => (c.type === 'text' ? c.text : ''))
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    const parsed = JSON.parse(text);

    if (!parsed.options || !Array.isArray(parsed.options) || parsed.options.length !== 3) {
      throw new Error('Invalid response shape from Claude');
    }

    return res.status(200).json({
      ...parsed,
      _meta: {
        cost: cost.toFixed(4),
        cached: (response.usage.cache_read_input_tokens || 0) > 0,
      },
    });
  } catch (error) {
    console.error('ask-tide error:', error);
    return res.status(500).json({
      error: 'The tide pulled back',
      detail: error.message || 'Unknown error',
    });
  }
}
