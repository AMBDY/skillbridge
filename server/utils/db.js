const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Default client (anon key) — for public reads
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Create an authenticated client from a user's access token
function createAuthedClient(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}

module.exports = { supabase, createAuthedClient };
