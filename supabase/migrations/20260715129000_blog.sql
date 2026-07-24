/*
# Blog / News

Resolves the two AdSense placements flagged as having no physical home:
- "Blog/News" — the blog listing and post pages built here.
- "Sidebar" — the post detail page has a sidebar column (recent posts +
  the sidebar ad slot), so both placements now render for real.

blog_posts: public read of published posts, admin-only write.
*/

CREATE TABLE IF NOT EXISTS blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid REFERENCES auth.users(id),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  excerpt text,
  body text NOT NULL,
  cover_image text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_published_posts" ON blog_posts;
CREATE POLICY "read_published_posts" ON blog_posts FOR SELECT TO anon, authenticated USING (status = 'published');
DROP POLICY IF EXISTS "admin_read_posts" ON blog_posts;
CREATE POLICY "admin_read_posts" ON blog_posts FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "admin_write_posts" ON blog_posts;
CREATE POLICY "admin_write_posts" ON blog_posts FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_update_posts" ON blog_posts;
CREATE POLICY "admin_update_posts" ON blog_posts FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_delete_posts" ON blog_posts;
CREATE POLICY "admin_delete_posts" ON blog_posts FOR DELETE TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status, published_at DESC);
