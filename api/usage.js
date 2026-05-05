// =============================================
// /api/usage.js
// =============================================
// Returns today's API spend and the daily ceiling, so the UI can
// show a small spend indicator. No auth required for read-only stats.
// =============================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const ceiling = parseFloat(process.env.DAILY_SPEND_CEILING_USD || '2.00');

    const { data, error } = await supabase
      .from('api_usage')
      .select('cost_usd, kind')
      .eq('usage_date', today);

    if (error) throw error;

    const todayTotal = (data || []).reduce((sum, row) => sum + parseFloat(row.cost_usd || 0), 0);
    const callCount = (data || []).length;

    // Also get this month's total
    const monthStart = today.substring(0, 7) + '-01';
    const { data: monthData } = await supabase
      .from('api_usage')
      .select('cost_usd')
      .gte('usage_date', monthStart);

    const monthTotal = (monthData || []).reduce((sum, row) => sum + parseFloat(row.cost_usd || 0), 0);

    res.status(200).json({
      today: {
        total: todayTotal,
        ceiling,
        remaining: Math.max(0, ceiling - todayTotal),
        percentUsed: ceiling > 0 ? (todayTotal / ceiling) * 100 : 0,
        callCount,
      },
      month: {
        total: monthTotal,
      },
    });
  } catch (error) {
    console.error('usage error:', error);
    res.status(500).json({ error: error.message });
  }
}
