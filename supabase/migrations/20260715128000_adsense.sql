/*
# Google AdSense integration

This is Google's actual ad network (different from the existing `ads` table,
which is a custom sponsored-content system where the platform controls what
shows and gets paid by advertisers). AdSense is the reverse: Google chooses
the ad content and pays the site owner. The site's only job is to embed
Google's script correctly with the right IDs.

1. platform_settings — global AdSense toggle + Publisher ID (one per site).
2. adsense_units — per-placement Ad Slot ID from Google's AdSense dashboard.
   Public read (needed so any visitor's page can render ads, including
   guests), admin-only write.
*/

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS adsense_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS adsense_publisher_id text;

CREATE TABLE IF NOT EXISTS adsense_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement text NOT NULL UNIQUE CHECK (placement IN ('homepage_banner','category_between_listings','footer','sidebar','blog_news')),
  slot_id text NOT NULL,
  ad_format text NOT NULL DEFAULT 'auto' CHECK (ad_format IN ('auto','rectangle','in-feed','in-article')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE adsense_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_adsense_units" ON adsense_units;
CREATE POLICY "read_adsense_units" ON adsense_units FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "admin_write_adsense_units" ON adsense_units;
CREATE POLICY "admin_write_adsense_units" ON adsense_units FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_update_adsense_units" ON adsense_units;
CREATE POLICY "admin_update_adsense_units" ON adsense_units FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_delete_adsense_units" ON adsense_units;
CREATE POLICY "admin_delete_adsense_units" ON adsense_units FOR DELETE TO authenticated USING (public.is_admin());
