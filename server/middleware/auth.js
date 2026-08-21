const { supabase } = require('../utils/db');

// Fixed: this used to manually verify the token with jwt.verify() against
// process.env.SUPABASE_ANON_KEY (or a hardcoded 'skillbridge-dev-secret'
// fallback) as the signing secret. Neither is correct — Supabase signs
// session tokens with its own project JWT secret, a separate value nobody
// had configured. That meant every authenticated request failed with 401 in
// any real deployment, and the hardcoded fallback string was a latent
// auth-bypass risk if it were ever mistakenly used to sign a token.
// Delegating verification to Supabase itself removes both problems and also
// works whether the project uses legacy HS256 or newer asymmetric signing.
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired token' });
    const userId = data.user.id;

    // Look up the user's role from profiles table
    const { data: profile } = await supabase.from('profiles').select('role, email, display_name, account_status').eq('user_id', userId).maybeSingle();
    if (profile?.account_status === 'banned') {
      return res.status(403).json({ error: 'This account has been banned. Contact support if you believe this is a mistake.' });
    }
    const { data: roleDefinition } = profile?.role ? await supabase.from('platform_roles').select('permissions').eq('role_key', profile.role).maybeSingle() : { data: null };
    req.user = {
      id: userId,
      email: profile?.email || data.user.email || '',
      role: profile?.role || '',
      display_name: profile?.display_name || '',
      account_status: profile?.account_status || 'active',
      permissions: roleDefinition?.permissions || []
    };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function hasPermission(req, permission) {
  return req.user?.role === 'admin' || req.user?.permissions?.includes('all') || req.user?.permissions?.includes(permission);
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

module.exports = { authMiddleware, adminOnly, hasPermission };
