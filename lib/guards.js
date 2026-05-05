// =============================================
// /lib/guards.js
// =============================================
// Shared protections for all AI-powered API endpoints:
//   - Shared-secret auth (only requests with the right header proceed)
//   - Per-IP rate limiting (prevents runaway loops and abuse)
//   - Daily spend ceiling (hard stop if costs go higher than expected)
//   - Cost calculation from Claude API usage
// =============================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// === Pricing for Claude Sonnet 4 (per million tokens) ===
// Update if you change the model or if pricing changes.
const PRICING = {
  input: 3.00,           // $/M tokens
  output: 15.00,         // $/M tokens
  cache_write: 3.75,     // $/M tokens (one-time cost when caching)
  cache_read: 0.30,      // $/M tokens (90% discount on cached reads)
};

// === Limits — adjust to taste ===
const LIMITS = {
  asksPerHour: 30,
  recapsPerHour: 5,
  dailySpendCeilingUsd: parseFloat(process.env.DAILY_SPEND_CEILING_USD || '2.00'),
};

// === 1. Shared-secret auth ===
// The frontend sends a passphrase header that only it knows.
// If a stranger hits the API directly, they're rejected.
export function checkAuth(req) {
  const expected = process.env.APP_SECRET;
  if (!expected) {
    // If no secret is set, allow (for first deploy / debugging).
    // Once you set APP_SECRET in Vercel, this enforces it.
    return { ok: true };
  }
  const provided = req.headers['x-app-secret'];
  if (provided !== expected) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}

// === 2. Rate limiting ===
// Tracks calls in the database. Resets every hour.
// Uses the request IP as the key.
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

export async function checkRateLimit(req, kind = 'ask') {
  const ip = getClientIp(req);
  const key = `ratelimit:${kind}:${ip}`;
  const limit = kind === 'recap' ? LIMITS.recapsPerHour : LIMITS.asksPerHour;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Count recent calls for this IP+kind
  const { count, error } = await supabase
    .from('rate_limit_log')
    .select('*', { count: 'exact', head: true })
    .eq('key', key)
    .gte('created_at', oneHourAgo);

  if (error) {
    // If rate limiting itself fails, fail open (don't block the user)
    console.error('Rate limit check failed:', error);
    return { ok: true };
  }

  if ((count || 0) >= limit) {
    return {
      ok: false,
      status: 429,
      error: `Rate limit reached (${limit}/hour). Try again later.`,
    };
  }

  // Log this request (don't await — fire and forget)
  supabase.from('rate_limit_log').insert({ key }).then(() => {});

  return { ok: true };
}

// === 3. Daily spend ceiling ===
// Reads today's accumulated cost; if over the ceiling, blocks further calls.
export async function checkBudget() {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('api_usage')
    .select('cost_usd')
    .eq('usage_date', today);

  if (error) {
    console.error('Budget check failed:', error);
    return { ok: true }; // fail open
  }

  const todayTotal = (data || []).reduce((sum, row) => sum + parseFloat(row.cost_usd || 0), 0);

  if (todayTotal >= LIMITS.dailySpendCeilingUsd) {
    return {
      ok: false,
      status: 429,
      error: `Daily spend limit reached ($${LIMITS.dailySpendCeilingUsd.toFixed(2)}). Resets at midnight UTC.`,
      todayTotal,
    };
  }

  return { ok: true, todayTotal };
}

// === 4. Cost calculation ===
// Given an Anthropic API response's usage object, return the dollar cost.
export function calculateCost(usage) {
  if (!usage) return 0;

  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;

  const cost =
    (inputTokens / 1_000_000) * PRICING.input +
    (outputTokens / 1_000_000) * PRICING.output +
    (cacheWriteTokens / 1_000_000) * PRICING.cache_write +
    (cacheReadTokens / 1_000_000) * PRICING.cache_read;

  return cost;
}

// === 5. Log usage to database (fire and forget) ===
export async function logUsage(kind, usage, cost) {
  try {
    await supabase.from('api_usage').insert({
      kind,
      input_tokens: usage?.input_tokens || 0,
      output_tokens: usage?.output_tokens || 0,
      cache_write_tokens: usage?.cache_creation_input_tokens || 0,
      cache_read_tokens: usage?.cache_read_input_tokens || 0,
      cost_usd: cost,
    });
  } catch (e) {
    // Don't fail the whole request if logging fails
    console.error('Usage log failed:', e);
  }
}

// === 6. Combined gate: run all checks ===
// Use this at the top of an API handler. Returns null if OK,
// or a response object to send if blocked.
export async function gate(req, kind) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth;

  const budget = await checkBudget();
  if (!budget.ok) return budget;

  const rate = await checkRateLimit(req, kind);
  if (!rate.ok) return rate;

  return null; // proceed
}
