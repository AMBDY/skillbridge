-- Configurable platform controls, rich product records, and agreement lifecycle.
-- All additions are additive so existing rows and integrations remain valid.

CREATE TABLE IF NOT EXISTS platform_features (
  feature_key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_manage_platform_features" ON platform_features FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "public_read_enabled_platform_features" ON platform_features FOR SELECT TO anon, authenticated USING (enabled);
CREATE POLICY "public_read_platform_feature_states" ON platform_features FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS platform_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
INSERT INTO platform_roles (role_key, name, description, permissions, is_system) VALUES
  ('client','Client','Posts jobs and creates agreements.', '["post_jobs","create_agreements"]'::jsonb, true),
  ('freelancer','Freelancer','Provides professional services.', '["apply_jobs","provide_services"]'::jsonb, true),
  ('seller','Seller','Lists products for sale.', '["sell_products"]'::jsonb, true),
  ('worker','Worker','Applies for roles and delivers work.', '["apply_jobs","accept_agreements"]'::jsonb, true),
  ('admin','Administrator','Controls platform content and moderation.', '["all"]'::jsonb, true)
ON CONFLICT (role_key) DO NOTHING;
ALTER TABLE platform_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_manage_platform_roles" ON platform_roles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "read_platform_roles" ON platform_roles FOR SELECT TO authenticated USING (true);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_sections jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE recruitment_applications ADD COLUMN IF NOT EXISTS question_answers jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE recruitment_applications ADD COLUMN IF NOT EXISTS interview_due_at timestamptz;
ALTER TABLE recruitment_applications ADD COLUMN IF NOT EXISTS interview_status text NOT NULL DEFAULT 'not_required' CHECK (interview_status IN ('not_required','pending','completed','expired'));
CREATE TABLE IF NOT EXISTS recruitment_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  response_mode text NOT NULL CHECK (response_mode IN ('video','audio')),
  response_url text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE recruitment_interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "applicant_manage_own_interview" ON recruitment_interviews FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM recruitment_applications a WHERE a.id = application_id AND a.applicant_id = auth.uid())
) WITH CHECK (EXISTS (SELECT 1 FROM recruitment_applications a WHERE a.id = application_id AND a.applicant_id = auth.uid()));
CREATE POLICY "recruiter_read_interviews" ON recruitment_interviews FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM recruitment_applications a JOIN recruitment_jobs j ON j.id = a.job_id WHERE a.id = application_id AND (j.recruiter_id = auth.uid() OR public.is_admin()))
);

ALTER TABLE agreements ADD COLUMN IF NOT EXISTS agreement_number text UNIQUE;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS agreement_type text NOT NULL DEFAULT 'service';
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft','submitted','under_review','changes_requested','approved','sent','awaiting_acceptance','active','completed','rejected','cancelled'));
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS admin_notes text;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS completion_at timestamptz;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS completed_filename text;
ALTER TABLE agreements ALTER COLUMN job_id DROP NOT NULL;

UPDATE agreements
SET agreement_number = COALESCE(agreement_number, 'AGR-' || to_char(created_at, 'YYYY') || '-' || lpad(substring(id::text, 1, 6), 6, '0')),
    title = COALESCE(title, 'Service Agreement'),
    status = CASE WHEN sealed THEN 'active' ELSE 'submitted' END
WHERE agreement_number IS NULL OR title IS NULL;

CREATE TABLE IF NOT EXISTS agreement_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  party_name text NOT NULL,
  party_role text NOT NULL DEFAULT 'party',
  required boolean NOT NULL DEFAULT true,
  accepted_at timestamptz,
  declined_at timestamptz,
  response_note text,
  UNIQUE (agreement_id, user_id)
);
ALTER TABLE agreement_parties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agreement_party_read" ON agreement_parties FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR EXISTS (SELECT 1 FROM agreements a WHERE a.id = agreement_id AND (a.client_id = auth.uid() OR a.worker_id = auth.uid() OR public.is_admin()))
);
CREATE POLICY "agreement_party_insert" ON agreement_parties FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM agreements a WHERE a.id = agreement_id AND (a.client_id = auth.uid() OR public.is_admin()))
);
CREATE POLICY "agreement_party_update" ON agreement_parties FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin()) WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE TABLE IF NOT EXISTS agreement_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  previous_status text,
  next_status text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE agreement_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agreement_audit_read" ON agreement_audit_log FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM agreements a WHERE a.id = agreement_id AND (a.client_id = auth.uid() OR a.worker_id = auth.uid() OR public.is_admin()))
);
CREATE POLICY "agreement_audit_insert" ON agreement_audit_log FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM agreements a WHERE a.id = agreement_id AND (a.client_id = auth.uid() OR a.worker_id = auth.uid() OR public.is_admin()))
);

CREATE TABLE IF NOT EXISTS agreement_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_month date NOT NULL UNIQUE,
  agreement_count int NOT NULL DEFAULT 0,
  archive_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE agreement_archives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_manage_agreement_archives" ON agreement_archives FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_agreements_status ON agreements(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agreement_parties_user ON agreement_parties(user_id);
CREATE INDEX IF NOT EXISTS idx_agreement_audit_agreement ON agreement_audit_log(agreement_id, created_at DESC);

-- Owner-controlled file replacement/removal: only the uploader's folder is removable.
DROP POLICY IF EXISTS "delete_own_kyc_uploads" ON storage.objects;
CREATE POLICY "delete_own_kyc_uploads" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'kyc' AND (storage.foldername(name))[1] = auth.uid()::text);

INSERT INTO storage.buckets (id, name, public) VALUES ('agreement_archives', 'agreement_archives', false)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "admin_manage_agreement_archives_bucket" ON storage.objects;
CREATE POLICY "admin_manage_agreement_archives_bucket" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'agreement_archives' AND public.is_admin()) WITH CHECK (bucket_id = 'agreement_archives' AND public.is_admin());

DROP POLICY IF EXISTS "delete_own_recruitment_jobs" ON recruitment_jobs;
CREATE POLICY "delete_own_recruitment_jobs" ON recruitment_jobs FOR DELETE TO authenticated
  USING (recruiter_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "delete_own_jobs" ON jobs;
CREATE POLICY "delete_own_jobs" ON jobs FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_admin());
