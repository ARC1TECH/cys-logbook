// =============================================
// /api/recap.js
// =============================================
// Takes raw session notes, returns a polished recap plus suggested
// updates to threads and NPCs. Same protection layer as ask-tide.
// =============================================

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { gate, calculateCost, logUsage } from '../lib/guards.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const RECAP_TASK_INSTRUCTIONS = `You help a player keep track of their D&D campaign by turning raw session notes into a polished recap. The player is Captain Silas Pike ("Cy"), a 55-year-old human Barbarian in Saltmarsh, Greyhawk.

The player will give you raw session notes — possibly disorganized, possibly fragmentary. Your job is to:

1. Write a clean, readable RECAP of what happened this session, told from a third-person perspective, focused on Cy's experience and what mattered. 3-6 paragraphs. Match the dry, weathered tone of Cy's world. Don't mythologize — keep it grounded.

2. Identify HIGHLIGHTS — 2-4 single-sentence bullet points capturing the most important moments to remember. These get shown in quick-glance views.

3. Suggest UPDATES to the live tracker — new NPCs encountered, NPCs whose status with Cy changed, threads that got hotter/colder/closed, new threads opened. ONLY suggest changes that are clearly supported by the session notes. Don't invent.

Return ONLY valid JSON in this exact shape, no preamble, no markdown fences:
{
  "recap": "...full recap text, 3-6 paragraphs...",
  "highlights": "• highlight one\\n• highlight two\\n• highlight three",
  "suggested_updates": {
    "new_npcs": [{"name":"...","tag":"avoid|owe|owed|ally|cold|complicated|dead","detail":"..."}],
    "npc_changes": [{"name":"...","new_tag":"...","reason":"..."}],
    "new_threads": [{"title":"...","status":"open|hot|cold|closed","detail":"..."}],
    "thread_changes": [{"title":"...","new_status":"...","reason":"..."}]
  }
}

If a category has no suggestions, use an empty array. Always include all four arrays.`;

async function getCurrentState() {
  const [npcsRes, threadsRes] = await Promise.all([
    supabase.from('npcs').select('name, tag, detail').order('sort_order'),
    supabase.from('threads').select('title, status, detail').order('sort_order'),
  ]);

  const npcs = (npcsRes.data || []).map(n => `- ${n.name} [${n.tag}]: ${n.detail}`).join('\n');
  const threads = (threadsRes.data || []).map(t => `- ${t.title} [${t.status}]: ${t.detail}`).join('\n');

  return `CURRENT STATE — only flag what CHANGED this session, don't repeat:\n\nEXISTING NPCs:\n${npcs}\n\nEXISTING THREADS:\n${threads}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const blocked = await gate(req, 'recap');
  if (blocked) {
    return res.status(blocked.status || 403).json({ error: blocked.error });
  }

  try {
    const { notes, sessionNumber, sessionDate } = req.body || {};

    if (!notes || typeof notes !== 'string' || notes.trim().length === 0) {
      return res.status(400).json({ error: 'Session notes required' });
    }
    if (notes.length > 20000) {
      return res.status(400).json({ error: 'Notes too long (max 20000 characters)' });
    }

    const currentState = await getCurrentState();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: [
        {
          type: 'text',
          text: RECAP_TASK_INSTRUCTIONS,
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: currentState,
        },
      ],
      messages: [{
        role: 'user',
        content: `Session ${sessionNumber || '?'}, ${sessionDate || 'today'}.\n\nRAW NOTES:\n${notes}`
      }],
    });

    const cost = calculateCost(response.usage);
    await logUsage('recap', response.usage, cost);

    const text = response.content
      .map(c => (c.type === 'text' ? c.text : ''))
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    const parsed = JSON.parse(text);

    return res.status(200).json({
      ...parsed,
      _meta: {
        cost: cost.toFixed(4),
        cached: (response.usage.cache_read_input_tokens || 0) > 0,
      },
    });
  } catch (error) {
    console.error('recap error:', error);
    return res.status(500).json({
      error: 'Failed to process recap',
      detail: error.message || 'Unknown error',
    });
  }
}
