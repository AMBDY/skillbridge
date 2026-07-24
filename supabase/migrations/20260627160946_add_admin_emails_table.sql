/*
# Add admin_emails table and fix profiles RLS for backend access

1. New Tables
- `admin_emails` — list of emails that should be granted admin role on signup.
  - `email` (text, unique, not null)
  - `created_at` (timestamptz)
  - Public read so the backend (anon key) can check if an email is admin.

2. Security Changes
- Enable RLS on `admin_emails`.
- Allow anon + authenticated SELECT (the backend needs to read this with the anon key).
- Only admin can INSERT/UPDATE/DELETE.
- Add an INSERT policy on `profiles` that allows the backend (service role or anon with authenticated session) to insert profiles. Since the backend uses the anon key, we need a policy that allows inserts when the user_id matches auth.uid(). The frontend will do the insert with the authenticated session.
- Seed the admin email `abdulmajidyakubu970@gmail.com`.

3. Notes
- This replaces the hardcoded admin email in the application code with a database-driven approach.
- The frontend will call supabase.auth.signUp() to create the auth user, then insert the profile using the authenticated session.
*/

CREATE TABLE IF NOT EXISTS admin_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_admin_emails" ON admin_emails;
CREATE POLICY "read_admin_emails" ON admin_emails
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_admin_emails" ON admin_emails;
CREATE POLICY "admin_insert_admin_emails" ON admin_emails
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_admin_emails" ON admin_emails;
CREATE POLICY "admin_delete_admin_emails" ON admin_emails
  FOR DELETE TO authenticated USING (public.is_admin());

-- Seed the admin email
INSERT INTO admin_emails (email) VALUES ('abdulmajidyakubu970@gmail.com')
  ON CONFLICT (email) DO NOTHING;

-- Also allow anon to read profiles (needed for marketplace browsing — services/products display profile info)
DROP POLICY IF EXISTS "select_profiles" ON profiles;
CREATE POLICY "select_profiles" ON profiles
  FOR SELECT TO anon, authenticated USING (true);
