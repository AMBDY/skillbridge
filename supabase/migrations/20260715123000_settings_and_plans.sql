/*
# Superadmin Settings — Phase 1 (General + Commissions + Subscription Plans)

This is a first, real slice of the much larger 28-section settings request —
scoped to the parts with the most immediate value: general site settings,
per-role commission rates, and turning the hardcoded free/pro/featured/elite
tiers into an actual admin-editable subscription_plans table ("create
unlimited plans" from the spec). The remaining sections (CMS drag-drop,
backups, SEO meta editor, API key vault, support tickets, etc.) are not in
this migration — see chat for what's deferred.

1. platform_settings — add general site fields, feature toggles, and
   per-role commission percentages (replacing the single global
   service_fee_percent as the source of truth; service_fee_percent stays as
   a fallback default so existing code/rows keep working unchanged).

2. subscription_plans — a real table admins can add/edit/deactivate plans
   in, instead of the fixed 4-tier CHECK constraint. Seeded with the same
   4 starter plans so nothing currently relying on 'free'/'pro'/'featured'/
   'elite' breaks.

3. subscriptions — loosen the old fixed-tier CHECK (superadmin can now name
   tiers anything) and add an optional plan_id link to the new table. This
   does not touch any existing subscription rows.

4. RLS — public can read active plans; only admins can create/edit/deactivate
   them (is_admin() bypass, same pattern used everywhere else in this app).
*/

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS site_name text NOT NULL DEFAULT 'SkillBridge';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS favicon_url text;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS default_currency text NOT NULL DEFAULT 'NGN';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS default_timezone text NOT NULL DEFAULT 'Africa/Lagos';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS maintenance_mode boolean NOT NULL DEFAULT false;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS registrations_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS guest_browsing_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS commission_freelancer numeric(5,2) NOT NULL DEFAULT 10.00;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS commission_worker numeric(5,2) NOT NULL DEFAULT 7.00;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS commission_seller numeric(5,2) NOT NULL DEFAULT 5.00;

CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_key text NOT NULL UNIQUE,      -- stable machine key, e.g. 'free', 'pro', or a custom one an admin creates
  name text NOT NULL,
  price numeric(12,2) NOT NULL DEFAULT 0,
  duration_days int NOT NULL DEFAULT 30,
  badge text,
  benefits text[] DEFAULT '{}',
  priority_boost int NOT NULL DEFAULT 0,   -- used by AI search ranking
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_active_plans" ON subscription_plans;
CREATE POLICY "read_active_plans" ON subscription_plans FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.is_admin());
DROP POLICY IF EXISTS "admin_write_plans" ON subscription_plans;
CREATE POLICY "admin_write_plans" ON subscription_plans FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_update_plans" ON subscription_plans;
CREATE POLICY "admin_update_plans" ON subscription_plans FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_delete_plans" ON subscription_plans;
CREATE POLICY "admin_delete_plans" ON subscription_plans FOR DELETE TO authenticated USING (public.is_admin());

INSERT INTO subscription_plans (tier_key, name, price, duration_days, badge, benefits, priority_boost)
VALUES
  ('free', 'Free', 0, 36500, NULL, ARRAY['Standard listing'], 0),
  ('pro', 'Pro', 5000, 30, 'Pro', ARRAY['Increased visibility'], 10),
  ('featured', 'Featured', 15000, 30, 'Featured', ARRAY['Homepage visibility', 'Search boost'], 25),
  ('elite', 'Elite', 30000, 30, 'Elite', ARRAY['Top ranking', 'Premium badge', 'AI boosted recommendation'], 50)
ON CONFLICT (tier_key) DO NOTHING;

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_tier_check;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES subscription_plans(id);
