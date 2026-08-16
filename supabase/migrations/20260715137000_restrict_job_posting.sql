/*
# Restrict job posting to client/admin roles at the database level

The API route already checks this, but RLS is the real enforcement layer —
an API check alone can be bypassed by anyone who calls Supabase directly
with a valid token. This makes the restriction actually unbypassable.
*/

DROP POLICY IF EXISTS "insert_own_jobs" ON jobs;
CREATE POLICY "insert_own_jobs" ON jobs FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('client', 'admin'))
  );
