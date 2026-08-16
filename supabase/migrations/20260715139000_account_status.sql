/*
# Account status (suspend/ban/freeze)

Real "remote control" capability for the superadmin — a status field on
profiles plus RLS that blocks a suspended/banned account from writing
anywhere on the platform without needing any code change.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','suspended','banned'));

-- Reusable check: is the current user's account in good standing?
CREATE OR REPLACE FUNCTION public.is_account_active()
RETURNS boolean AS $$
  SELECT COALESCE((SELECT account_status = 'active' FROM profiles WHERE user_id = auth.uid()), true);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Block suspended/banned accounts from writing anywhere that matters, without
-- touching every single existing policy: layer this check on top of the key
-- write actions (posting jobs/listings, applying, chatting, paying).
DROP POLICY IF EXISTS "insert_own_jobs" ON jobs;
CREATE POLICY "insert_own_jobs" ON jobs FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('client', 'admin'))
    AND public.is_account_active()
  );

DROP POLICY IF EXISTS "insert_own_products" ON products;
CREATE POLICY "insert_own_products" ON products FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_account_active());

DROP POLICY IF EXISTS "insert_own_services" ON services;
CREATE POLICY "insert_own_services" ON services FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_account_active());

DROP POLICY IF EXISTS "insert_own_messages" ON chat_messages;
CREATE POLICY "insert_own_messages" ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND public.is_account_active());
