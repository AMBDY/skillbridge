CREATE TABLE IF NOT EXISTS public.profile_metric_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text NOT NULL CHECK (metric_name IN ('completion','hiring')),
  scope_type text NOT NULL CHECK (scope_type IN ('user','role','specialty','service_type','new_user')),
  scope_value text,
  rate numeric(5,2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_metric_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_active_profile_metric_rules" ON public.profile_metric_rules FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "admin_manage_profile_metric_rules" ON public.profile_metric_rules FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
