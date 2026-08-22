-- Reassert the normal-account self-edit policy. This does not permit users to
-- alter protected role, KYC, subscription, rating, or account-status fields;
-- the existing trigger continues to protect those platform-managed values.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
