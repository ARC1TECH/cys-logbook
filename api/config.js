// =============================================
// /api/config.js
// =============================================
// The frontend calls this to get the public config it needs.
//
// Note on APP_SECRET: this is a passphrase used to prevent random API
// scrapers from hitting your endpoints. Since the frontend needs to
// send it, it's necessarily visible to anyone who opens DevTools on
// your site. That's by design — its job is to filter out drive-by
// scanners, not stop a determined attacker. The real protection
// against runaway costs is the daily spend ceiling and rate limiting.
// =============================================

export default function handler(req, res) {
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    appSecret: process.env.APP_SECRET || '',
  });
}
