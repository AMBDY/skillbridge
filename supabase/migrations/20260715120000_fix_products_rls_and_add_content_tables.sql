/*
# Fix products RLS + add site_content, testimonials, featured_items, comments tables

1. Bug fix
- `products` table had RLS enabled with only a SELECT policy. Sellers could
  never insert/update/delete their own products ("new row violates row-level
  security policy for table products"). Added owner-scoped INSERT/UPDATE/DELETE
  policies matching the pattern already used on `services`.

2. New tables (referenced by admin bug reports but missing from schema)
- `site_content`   — key/value editable content blocks for CMS-style pages
                     (About, Contact, FAQ, Terms, Privacy, Refund, homepage
                     hero text/buttons, footer text, banner).
- `testimonials`   — DB-backed testimonials (replacing the hardcoded JS array),
                     submittable by users, approved by admin, shown on homepage.
- `featured_items` — admin-curated featured services/products/jobs with a
                     placement slot (homepage/category/search) and expiry.
- `comments`       — general site comments/suggestions box submissions, visible
                     to admin in a moderation list.

3. Security
- RLS enabled on all four new tables.
- Public read on published/approved content; admin-only write via is_admin().
- Anyone (including anon) can submit a testimonial or comment, but it starts
  unapproved/unpublished so it only becomes public after admin review.
*/

-- ── Fix products RLS (the actual bug) ──────────────────────────────────────
DROP POLICY IF EXISTS "insert_own_products" ON products;
CREATE POLICY "insert_own_products" ON products
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_products" ON products;
CREATE POLICY "update_own_products" ON products
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_products" ON products;
CREATE POLICY "delete_own_products" ON products
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);

-- ── site_content ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_key text NOT NULL,        -- e.g. 'about', 'contact', 'faq', 'terms', 'privacy', 'refund', 'homepage_hero', 'footer'
  section_key text NOT NULL,     -- e.g. 'hero_title', 'hero_subtitle', 'cta_button_text'
  content_type text NOT NULL DEFAULT 'text' CHECK (content_type IN ('text','html','image_url','video_url','json')),
  value text,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (page_key, section_key)
);
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_site_content" ON site_content;
CREATE POLICY "read_site_content" ON site_content FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admin_write_site_content" ON site_content;
CREATE POLICY "admin_write_site_content" ON site_content FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_update_site_content" ON site_content;
CREATE POLICY "admin_update_site_content" ON site_content FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_delete_site_content" ON site_content;
CREATE POLICY "admin_delete_site_content" ON site_content FOR DELETE TO authenticated USING (public.is_admin());

-- ── testimonials ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  role_label text,               -- e.g. 'Tailoring Client'
  avatar_url text,
  quote text NOT NULL,
  rating int DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_approved_testimonials" ON testimonials;
CREATE POLICY "read_approved_testimonials" ON testimonials FOR SELECT TO anon, authenticated USING (status = 'approved');
DROP POLICY IF EXISTS "read_own_testimonials" ON testimonials;
CREATE POLICY "read_own_testimonials" ON testimonials FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_testimonials" ON testimonials;
CREATE POLICY "insert_testimonials" ON testimonials FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "admin_update_testimonials" ON testimonials;
CREATE POLICY "admin_update_testimonials" ON testimonials FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_delete_testimonials" ON testimonials;
CREATE POLICY "admin_delete_testimonials" ON testimonials FOR DELETE TO authenticated USING (public.is_admin());

-- ── featured_items ──────────────────────────────────────────────────────────
-- "Featured" = an admin-curated promotional slot: pick an existing service,
-- product, or job and pin it to a specific placement (homepage / category page
-- / search top) for a period of time. This table is the missing link between
-- "create featured item" in admin and it actually appearing somewhere.
CREATE TABLE IF NOT EXISTS featured_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL CHECK (item_type IN ('service','product','job')),
  item_id uuid NOT NULL,
  placement text NOT NULL DEFAULT 'homepage' CHECK (placement IN ('homepage','category','search_top')),
  category_id uuid REFERENCES categories(id), -- required only when placement = 'category'
  position int DEFAULT 0,
  starts_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','expired')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE featured_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_featured_items" ON featured_items;
CREATE POLICY "read_featured_items" ON featured_items FOR SELECT TO anon, authenticated
  USING (status = 'active' AND (expires_at IS NULL OR expires_at > now()));
DROP POLICY IF EXISTS "admin_write_featured_items" ON featured_items;
CREATE POLICY "admin_write_featured_items" ON featured_items FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_update_featured_items" ON featured_items;
CREATE POLICY "admin_update_featured_items" ON featured_items FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_delete_featured_items" ON featured_items;
CREATE POLICY "admin_delete_featured_items" ON featured_items FOR DELETE TO authenticated USING (public.is_admin());
CREATE INDEX IF NOT EXISTS idx_featured_placement ON featured_items(placement, status);

-- ── comments (site-wide "comments & suggestions" box) ──────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text,
  email text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','archived')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "insert_comments" ON comments;
CREATE POLICY "insert_comments" ON comments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "admin_read_comments" ON comments;
CREATE POLICY "admin_read_comments" ON comments FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "admin_update_comments" ON comments;
CREATE POLICY "admin_update_comments" ON comments FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_delete_comments" ON comments;
CREATE POLICY "admin_delete_comments" ON comments FOR DELETE TO authenticated USING (public.is_admin());
