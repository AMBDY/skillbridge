/*
# Require admin approval for products and services

Previously both went live immediately (status defaulted to 'active').
Widening the CHECK to add 'pending' and 'rejected', changing the default to
'pending', and giving admin the same read/update access already used
elsewhere (is_admin() bypass). Public read (status = 'active') is unchanged,
so nothing pending or rejected is visible until approved — existing live
rows are untouched since this only changes the constraint and the default
for new rows.
*/

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE products ADD CONSTRAINT products_status_check CHECK (status IN ('pending','active','rejected','paused','deleted'));
ALTER TABLE products ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_status_check;
ALTER TABLE services ADD CONSTRAINT services_status_check CHECK (status IN ('pending','active','rejected','paused','deleted'));
ALTER TABLE services ALTER COLUMN status SET DEFAULT 'pending';

DROP POLICY IF EXISTS "admin_read_products" ON products;
CREATE POLICY "admin_read_products" ON products FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "admin_update_products" ON products;
CREATE POLICY "admin_update_products" ON products FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_read_services" ON services;
CREATE POLICY "admin_read_services" ON services FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "admin_update_services" ON services;
CREATE POLICY "admin_update_services" ON services FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Also let the owner see their own listing regardless of status (so a
-- seller can see "pending" or "rejected" on their own dashboard — this was
-- missing the same way jobs.read_own_jobs was missing earlier)
DROP POLICY IF EXISTS "read_own_products" ON products;
CREATE POLICY "read_own_products" ON products FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "read_own_services" ON services;
CREATE POLICY "read_own_services" ON services FOR SELECT TO authenticated USING (auth.uid() = user_id);
