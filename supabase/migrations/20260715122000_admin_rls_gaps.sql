/*
# Fix missing admin-bypass RLS policies

While wiring up the Job Recruitment system, I audited every table the admin
panel touches against its RLS policies and found the same class of bug as
the `products` INSERT issue in several more places: the admin panel calls
these endpoints using the *admin's own* authenticated Supabase client (correct
pattern — see server/routes/admin.js), but several tables only had
owner-scoped policies with no is_admin() bypass. That means, even though the
UI shows an "Approve"/"Release"/"Make Admin" button, the write silently fails
under RLS for any row the admin doesn't personally own:

- `jobs`      — admin could not approve/reject a job that belonged to another
                user (SELECT was also public-approved-only, so pending jobs
                awaiting moderation weren't even visible to the admin query).
- `payments`  — admin could not view other users' payments (breaks Revenue,
                Payments list, Google Sheets export) or release escrow.
- `subscriptions` — admin could not view or approve other users' subscription
                requests.
- `profiles`  — admin could not promote a user to admin, nor set kyc_level /
                subscription_tier on approval (the KYC-approve and
                subscription-approve handlers both write to profiles).
- `kyc_submissions` — admin could not see anyone's pending KYC besides their
                own (their own UPDATE was already fixed by is_admin() in the
                previous migration; SELECT was still owner-only).

Fix: add an is_admin() bypass alongside the existing owner-scoped policies.
Postgres RLS policies are OR'd together, so this doesn't remove any existing
owner access — it only adds admin access on top.
*/

-- profiles: allow admin to update any profile (role changes, kyc_level, subscription_tier, suspensions)
DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
CREATE POLICY "admin_update_profiles" ON profiles
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- jobs: admin can see every job regardless of status, and approve/reject/edit any job
DROP POLICY IF EXISTS "admin_read_jobs" ON jobs;
CREATE POLICY "admin_read_jobs" ON jobs
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "admin_update_jobs" ON jobs;
CREATE POLICY "admin_update_jobs" ON jobs
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- payments: admin can see and release/refund any payment
DROP POLICY IF EXISTS "admin_read_payments" ON payments;
CREATE POLICY "admin_read_payments" ON payments
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "admin_update_payments" ON payments;
CREATE POLICY "admin_update_payments" ON payments
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- subscriptions: admin can see and approve/reject any subscription request
DROP POLICY IF EXISTS "admin_read_subscriptions" ON subscriptions;
CREATE POLICY "admin_read_subscriptions" ON subscriptions
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "admin_update_subscriptions" ON subscriptions;
CREATE POLICY "admin_update_subscriptions" ON subscriptions
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- kyc_submissions: admin can see every pending submission, not just their own
DROP POLICY IF EXISTS "admin_read_kyc" ON kyc_submissions;
CREATE POLICY "admin_read_kyc" ON kyc_submissions
  FOR SELECT TO authenticated USING (public.is_admin());
