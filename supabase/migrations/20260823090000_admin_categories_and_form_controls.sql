-- Superadmin-managed categories and form-field presentation controls.
CREATE TABLE IF NOT EXISTS public.form_field_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), form_key text NOT NULL, field_key text NOT NULL,
  label text, help_text text, is_visible boolean NOT NULL DEFAULT true, is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0, updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(form_key, field_key)
);
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.form_field_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_visible_form_controls" ON public.form_field_controls FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin_manage_form_controls" ON public.form_field_controls FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- The existing categories table already uses RLS; reassert administrator CRUD.
DROP POLICY IF EXISTS "admin_manage_categories" ON public.categories;
CREATE POLICY "admin_manage_categories" ON public.categories FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
