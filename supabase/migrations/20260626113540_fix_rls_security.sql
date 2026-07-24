/*
# Fix RLS security issues

1. Security Changes
- Enable RLS on `platform_settings` (was missing).
- Create a reusable SQL function `is_admin()` that checks the authenticated user's role in `profiles` equals 'admin'. This avoids `USING (true)` on admin-only policies.
- Replace all admin-only policies on `ads`, `audit_logs`, `categories`, `disputes`, `kyc_submissions` with role-scoped checks using `is_admin()`.
- Public read policies on `ads` and `categories` remain unchanged (intentionally public).
- `audit_logs` read policy remains `TO authenticated USING (true)` (admin-only reads are enforced at the API layer; the table contains no user-private data, only admin action records).

2. Notes
- `is_admin()` returns true only when `auth.uid()` matches a `profiles` row with `role = 'admin'`.
- This closes the bypass where any authenticated user could insert/update/delete ads, categories, disputes, KYC decisions, and audit logs.
*/

-- Helper: is the current authenticated user an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  );
$$;

-- Enable RLS on platform_settings (was missing)
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_settings" ON public.platform_settings;
CREATE POLICY "read_settings" ON public.platform_settings
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admin_update_settings" ON public.platform_settings;
CREATE POLICY "admin_update_settings" ON public.platform_settings
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ads: restrict admin write policies to actual admins
DROP POLICY IF EXISTS "admin_insert_ads" ON public.ads;
CREATE POLICY "admin_insert_ads" ON public.ads
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_ads" ON public.ads;
CREATE POLICY "admin_update_ads" ON public.ads
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_ads" ON public.ads;
CREATE POLICY "admin_delete_ads" ON public.ads
  FOR DELETE TO authenticated USING (public.is_admin());

-- audit_logs: restrict insert to admins
DROP POLICY IF EXISTS "insert_audit_logs" ON public.audit_logs;
CREATE POLICY "insert_audit_logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- categories: restrict admin write to admins
DROP POLICY IF EXISTS "admin_insert_categories" ON public.categories;
CREATE POLICY "admin_insert_categories" ON public.categories
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_categories" ON public.categories;
CREATE POLICY "admin_update_categories" ON public.categories
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- disputes: restrict admin update to admins
DROP POLICY IF EXISTS "admin_update_disputes" ON public.disputes;
CREATE POLICY "admin_update_disputes" ON public.disputes
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- kyc_submissions: restrict admin update to admins
DROP POLICY IF EXISTS "admin_update_kyc" ON public.kyc_submissions;
CREATE POLICY "admin_update_kyc" ON public.kyc_submissions
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
