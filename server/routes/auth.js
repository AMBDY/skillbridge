const router = require('express').Router();
const { supabase, createAuthedClient } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');

function authedClient(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  return createAuthedClient(token);
}

// Login lockout — in-memory, per email. Good enough for a single-process
// deployment; scale to Redis if you run multiple instances behind a
// load balancer, same caveat as server/middleware/rate-limit.js.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const attempts = new Map(); // email -> { count, lockedUntil }
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of attempts) if ((entry.lockedUntil || 0) < now && entry.count === 0) attempts.delete(email);
}, 60 * 60 * 1000).unref?.();

// Real sign-in proxy — the frontend used to call supabase.auth.signInWithPassword()
// directly from the browser, which bypassed this backend (and any lockout)
// entirely. Now the frontend calls this endpoint instead, which enforces
// lockout, then signs in via the same Supabase Auth API on the server.
router.post('/signin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const key = email.toLowerCase();
  const entry = attempts.get(key) || { count: 0, lockedUntil: 0 };

  if (entry.lockedUntil > Date.now()) {
    const minutes = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${minutes} minute(s).` });
  }

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) {
    entry.count += 1;
    if (entry.count >= MAX_ATTEMPTS) {
      entry.lockedUntil = Date.now() + LOCKOUT_MS;
      entry.count = 0;
      const { data: existingProfile } = await supabase.from('profiles').select('user_id').eq('email', email).maybeSingle();
      await supabase.rpc('create_fraud_flag', {
        p_user_id: existingProfile?.user_id || null, p_flag_type: 'repeated_login_failures',
        p_details: { email }, p_risk_score: 50
      }).catch(() => {});
    }
    attempts.set(key, entry);
    return res.status(401).json({ error: authErr.message });
  }

  attempts.delete(key);
  const userId = authData.user?.id;
  const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
  if (!profile) return res.status(400).json({ error: 'Profile not found. Contact support.' });

  res.json({
    user: profile,
    token: authData.session?.access_token || '',
    refreshToken: authData.session?.refresh_token || ''
  });
});

// Sign up is now handled client-side (frontend calls supabase.auth.signUp directly).
// This endpoint is kept for backwards compatibility but delegates to the same flow.
router.post('/signup', async (req, res) => {
  res.status(400).json({ error: 'Signup is handled client-side. Use the signup page.' });
});

// Called by the frontend right after a successful signup (profile already
// created client-side). Kept separate from a full server-side signup proxy —
// that flow is multi-step and non-trivial (admin-email check, auth user,
// full profile insert, optional KYC), and rebuilding it just to add an email
// hook would risk breaking something that already works correctly.
router.post('/welcome-email', authMiddleware, async (req, res) => {
  const { data: profile } = await supabase.from('profiles').select('email, display_name').eq('user_id', req.user.id).maybeSingle();
  if (profile?.email) await sendEmail('welcome', profile.email, { name: profile.display_name || 'there' });
  res.json({ ok: true });
});

// Get current user profile — validates the Supabase JWT and looks up the profile
router.get('/me', authMiddleware, async (req, res) => {
  const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', req.user.id).maybeSingle();
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  res.json({ user: profile });
});

// KYC submission
router.post('/kyc', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { selfie_url, full_name } = req.body;
  const { data, error } = await c.from('kyc_submissions').insert({
    user_id: req.user.id, selfie_url, full_name
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });

  if (selfie_url && full_name) {
    try {
      const { extractText } = require('../services/ai/ocr');
      const result = await extractText({ url: selfie_url });
      if (result.text) {
        const found = result.text.toLowerCase().includes(full_name.toLowerCase().trim());
        if (!found) {
          await c.rpc('create_fraud_flag', {
            p_user_id: req.user.id, p_flag_type: 'kyc_name_mismatch',
            p_details: { submitted_name: full_name, kyc_id: data.id }, p_risk_score: 40
          }).catch(() => {});
        }
      }
    } catch { /* OCR/fraud-flag failure should never block KYC submission itself */ }
  }
  res.json(data);
});

// Refresh token (client-side Supabase handles this, but keep for API clients)
router.post('/refresh', (req, res) => {
  res.status(400).json({ error: 'Token refresh is handled client-side by Supabase auth.' });
});

module.exports = router;
