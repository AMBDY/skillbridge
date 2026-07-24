/*
# Job Recruitment Module (recruitment_jobs, applications, AI screening)

This is the real Job Recruitment system (client posts a job with an AI plan,
optional video screening, AI-generated or manual questions; applicants apply
with documents/video; rule-based AI screening scores and flags fraud;
superadmin approves jobs before they go live).

1. Table naming — IMPORTANT
   The source code for this module used `job_applications` for its
   applications table. This app already has a `job_applications` table
   (added in an earlier migration) for a *different* feature — applying to
   the general `jobs` marketplace postings. Reusing the same name would
   either silently no-op (CREATE TABLE IF NOT EXISTS skips it) and then
   every insert here would fail on missing columns, or corrupt the other
   feature's data model. So every table in this module is prefixed
   `recruitment_` to keep the two systems completely separate.

2. RLS — every table gets both an owner-scoped policy AND an is_admin()
   bypass from the start (an earlier migration had to retrofit this for
   jobs/payments/subscriptions/profiles after the fact — doing it up front
   here instead).
*/

CREATE TABLE IF NOT EXISTS recruitment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  company_name text NOT NULL,
  description text NOT NULL,
  responsibilities text[] DEFAULT '{}',
  required_skills text[] DEFAULT '{}',
  experience_required int DEFAULT 0,
  education_requirement text,
  salary text,
  location text,
  deadline timestamptz,
  ai_plan text NOT NULL DEFAULT 'basic' CHECK (ai_plan IN ('basic','standard','premium','enterprise')),
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected','suspended')),
  video_enabled text NOT NULL DEFAULT 'disabled' CHECK (video_enabled IN ('disabled','optional','mandatory')),
  question_mode text NOT NULL DEFAULT 'manual' CHECK (question_mode IN ('manual','ai_generated')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE recruitment_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_approved_recruitment_jobs" ON recruitment_jobs;
CREATE POLICY "read_approved_recruitment_jobs" ON recruitment_jobs FOR SELECT TO anon, authenticated USING (approval_status = 'approved');
DROP POLICY IF EXISTS "read_own_recruitment_jobs" ON recruitment_jobs;
CREATE POLICY "read_own_recruitment_jobs" ON recruitment_jobs FOR SELECT TO authenticated USING (auth.uid() = recruiter_id);
DROP POLICY IF EXISTS "admin_read_recruitment_jobs" ON recruitment_jobs;
CREATE POLICY "admin_read_recruitment_jobs" ON recruitment_jobs FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "insert_own_recruitment_jobs" ON recruitment_jobs;
CREATE POLICY "insert_own_recruitment_jobs" ON recruitment_jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = recruiter_id);
DROP POLICY IF EXISTS "update_own_recruitment_jobs" ON recruitment_jobs;
CREATE POLICY "update_own_recruitment_jobs" ON recruitment_jobs FOR UPDATE TO authenticated USING (auth.uid() = recruiter_id) WITH CHECK (auth.uid() = recruiter_id);
DROP POLICY IF EXISTS "admin_update_recruitment_jobs" ON recruitment_jobs;
CREATE POLICY "admin_update_recruitment_jobs" ON recruitment_jobs FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS recruitment_required_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES recruitment_jobs(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  required boolean DEFAULT true
);
ALTER TABLE recruitment_required_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_recruitment_docs" ON recruitment_required_documents;
CREATE POLICY "read_recruitment_docs" ON recruitment_required_documents FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM recruitment_jobs WHERE id = job_id AND (approval_status = 'approved' OR recruiter_id = auth.uid())));
DROP POLICY IF EXISTS "owner_write_recruitment_docs" ON recruitment_required_documents;
CREATE POLICY "owner_write_recruitment_docs" ON recruitment_required_documents FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM recruitment_jobs WHERE id = job_id AND recruiter_id = auth.uid()));
DROP POLICY IF EXISTS "admin_all_recruitment_docs" ON recruitment_required_documents;
CREATE POLICY "admin_all_recruitment_docs" ON recruitment_required_documents FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS recruitment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES recruitment_jobs(id) ON DELETE CASCADE,
  question text NOT NULL,
  duration_limit int DEFAULT 120,
  attempts_allowed int DEFAULT 1
);
ALTER TABLE recruitment_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_recruitment_questions" ON recruitment_questions;
CREATE POLICY "read_recruitment_questions" ON recruitment_questions FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM recruitment_jobs WHERE id = job_id AND (approval_status = 'approved' OR recruiter_id = auth.uid())));
DROP POLICY IF EXISTS "owner_write_recruitment_questions" ON recruitment_questions;
CREATE POLICY "owner_write_recruitment_questions" ON recruitment_questions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM recruitment_jobs WHERE id = job_id AND recruiter_id = auth.uid()));
DROP POLICY IF EXISTS "admin_all_recruitment_questions" ON recruitment_questions;
CREATE POLICY "admin_all_recruitment_questions" ON recruitment_questions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS recruitment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES recruitment_jobs(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  phone text,
  cover_note text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewing','shortlisted','rejected','hired')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (job_id, applicant_id)
);
ALTER TABLE recruitment_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "insert_own_recruitment_application" ON recruitment_applications;
CREATE POLICY "insert_own_recruitment_application" ON recruitment_applications FOR INSERT TO authenticated WITH CHECK (auth.uid() = applicant_id);
DROP POLICY IF EXISTS "read_own_recruitment_application" ON recruitment_applications;
CREATE POLICY "read_own_recruitment_application" ON recruitment_applications FOR SELECT TO authenticated USING (auth.uid() = applicant_id);
DROP POLICY IF EXISTS "read_job_owner_recruitment_application" ON recruitment_applications;
CREATE POLICY "read_job_owner_recruitment_application" ON recruitment_applications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM recruitment_jobs WHERE id = job_id AND recruiter_id = auth.uid()));
DROP POLICY IF EXISTS "update_job_owner_recruitment_application" ON recruitment_applications;
CREATE POLICY "update_job_owner_recruitment_application" ON recruitment_applications FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM recruitment_jobs WHERE id = job_id AND recruiter_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM recruitment_jobs WHERE id = job_id AND recruiter_id = auth.uid()));
DROP POLICY IF EXISTS "admin_all_recruitment_application" ON recruitment_applications;
CREATE POLICY "admin_all_recruitment_application" ON recruitment_applications FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS recruitment_application_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_type text,
  document_type text
);
ALTER TABLE recruitment_application_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "insert_own_recruitment_app_docs" ON recruitment_application_documents;
CREATE POLICY "insert_own_recruitment_app_docs" ON recruitment_application_documents FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM recruitment_applications WHERE id = application_id AND applicant_id = auth.uid()));
DROP POLICY IF EXISTS "read_own_recruitment_app_docs" ON recruitment_application_documents;
CREATE POLICY "read_own_recruitment_app_docs" ON recruitment_application_documents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM recruitment_applications WHERE id = application_id AND applicant_id = auth.uid()));
DROP POLICY IF EXISTS "read_job_owner_recruitment_app_docs" ON recruitment_application_documents;
CREATE POLICY "read_job_owner_recruitment_app_docs" ON recruitment_application_documents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM recruitment_applications ra JOIN recruitment_jobs rj ON rj.id = ra.job_id WHERE ra.id = application_id AND rj.recruiter_id = auth.uid()));
DROP POLICY IF EXISTS "admin_all_recruitment_app_docs" ON recruitment_application_documents;
CREATE POLICY "admin_all_recruitment_app_docs" ON recruitment_application_documents FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS recruitment_application_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  video_url text NOT NULL,
  transcript text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE recruitment_application_videos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "insert_own_recruitment_app_videos" ON recruitment_application_videos;
CREATE POLICY "insert_own_recruitment_app_videos" ON recruitment_application_videos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM recruitment_applications WHERE id = application_id AND applicant_id = auth.uid()));
DROP POLICY IF EXISTS "read_own_recruitment_app_videos" ON recruitment_application_videos;
CREATE POLICY "read_own_recruitment_app_videos" ON recruitment_application_videos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM recruitment_applications WHERE id = application_id AND applicant_id = auth.uid()));
DROP POLICY IF EXISTS "read_job_owner_recruitment_app_videos" ON recruitment_application_videos;
CREATE POLICY "read_job_owner_recruitment_app_videos" ON recruitment_application_videos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM recruitment_applications ra JOIN recruitment_jobs rj ON rj.id = ra.job_id WHERE ra.id = application_id AND rj.recruiter_id = auth.uid()));
DROP POLICY IF EXISTS "admin_all_recruitment_app_videos" ON recruitment_application_videos;
CREATE POLICY "admin_all_recruitment_app_videos" ON recruitment_application_videos FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS recruitment_screening_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  score numeric(5,2) NOT NULL DEFAULT 0,
  risk_score numeric(5,2) DEFAULT 0,
  ranking_label text,
  strengths text[] DEFAULT '{}',
  weaknesses text[] DEFAULT '{}',
  recommendation text,
  provider_used text DEFAULT 'fallback',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE recruitment_screening_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "insert_own_recruitment_screening" ON recruitment_screening_results;
CREATE POLICY "insert_own_recruitment_screening" ON recruitment_screening_results FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM recruitment_applications WHERE id = application_id AND applicant_id = auth.uid()));
DROP POLICY IF EXISTS "read_own_recruitment_screening" ON recruitment_screening_results;
CREATE POLICY "read_own_recruitment_screening" ON recruitment_screening_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM recruitment_applications WHERE id = application_id AND applicant_id = auth.uid()));
DROP POLICY IF EXISTS "read_job_owner_recruitment_screening" ON recruitment_screening_results;
CREATE POLICY "read_job_owner_recruitment_screening" ON recruitment_screening_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM recruitment_applications ra JOIN recruitment_jobs rj ON rj.id = ra.job_id WHERE ra.id = application_id AND rj.recruiter_id = auth.uid()));
DROP POLICY IF EXISTS "admin_all_recruitment_screening" ON recruitment_screening_results;
CREATE POLICY "admin_all_recruitment_screening" ON recruitment_screening_results FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_recruitment_jobs_status ON recruitment_jobs(approval_status);
CREATE INDEX IF NOT EXISTS idx_recruitment_apps_job ON recruitment_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_apps_applicant ON recruitment_applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_screening_app ON recruitment_screening_results(application_id);
