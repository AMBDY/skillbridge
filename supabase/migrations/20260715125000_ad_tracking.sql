/*
# Ad tracking + display fix

Ads could be created in the Superadmin panel, but every "Advertisement"
slot across the public site (homepage, category, hire, shop, listing pages)
was hardcoded static placeholder text — never querying the `ads` table at
all. Same root issue as the earlier Featured Items gap. This migration adds
the click/view counters the original spec asked for; the actual display
wiring is in marketplace.js + the frontend pages (no schema change needed
for that part).
*/

ALTER TABLE ads ADD COLUMN IF NOT EXISTS view_count int NOT NULL DEFAULT 0;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS click_count int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_ad_view(ad_id uuid) RETURNS void AS $$
  UPDATE ads SET view_count = view_count + 1 WHERE id = ad_id;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_ad_click(ad_id uuid) RETURNS void AS $$
  UPDATE ads SET click_count = click_count + 1 WHERE id = ad_id;
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_ad_view(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_ad_click(uuid) TO anon, authenticated;
