// =============================================
// /api/export-context.js
// =============================================
// Returns the full current character context as a markdown document
// that can be copied to clipboard and pasted into a Claude Project's
// uploaded files. Keeps the Project synced with the live Companion data.
// =============================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const [npcsRes, threadsRes, factionsRes, recapsRes, logRes] = await Promise.all([
      supabase.from('npcs').select('*').order('sort_order'),
      supabase.from('threads').select('*').order('sort_order'),
      supabase.from('factions').select('*').order('sort_order'),
      supabase.from('recaps').select('*').order('session_date'),
      supabase.from('log_entries').select('*').order('entry_date', { ascending: false }).limit(20),
    ]);

    const npcs = npcsRes.data || [];
    const threads = threadsRes.data || [];
    const factions = factionsRes.data || [];
    const recaps = recapsRes.data || [];
    const log = logRes.data || [];

    const tagLabels = {
      avoid: 'Avoiding', owe: 'Owes Them', owed: 'Owed', ally: 'Ally',
      cold: 'Cold', complicated: 'Complicated', dead: 'Lost'
    };

    const today = new Date().toISOString().split('T')[0];

    const markdown = `# Cy — Live Character Context
*Exported ${today} from Cy's Logbook*

---

## People in His Orbit

${npcs.map(n => `### ${n.name} — ${tagLabels[n.tag] || n.tag}\n${n.detail || ''}`).join('\n\n')}

---

## Open Threads

${threads.map(t => `### ${t.title} *(${t.status})*\n${t.detail || ''}`).join('\n\n')}

---

## Faction Standings

${factions.map(f => `- **${f.name}** — ${f.lean}% lean. ${f.note || ''}`).join('\n')}

---

## Session Recaps

${recaps.length === 0 ? '*No sessions recapped yet.*' : recaps.map(r => `### Session ${r.session_number || '?'} — ${r.session_date}\n\n${r.recap_text}\n\n${r.highlights ? `**Highlights:**\n${r.highlights}` : ''}`).join('\n\n---\n\n')}

---

## Recent Log Entries

${log.length === 0 ? '*No log entries.*' : log.map(l => `- **${l.entry_date}** — ${l.text}`).join('\n')}
`;

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="cy-context.md"');
    return res.status(200).send(markdown);
  } catch (error) {
    console.error('export error:', error);
    return res.status(500).json({
      error: 'Failed to export context',
      detail: error.message || 'Unknown error',
    });
  }
}
