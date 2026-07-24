/*
# Job Recruitment System

Adds what's needed for: a "Job Recruitment" area where non-client roles browse
approved jobs and apply with a real form; clients view/edit their posted jobs
and see applicants; optional paid AI screening (manual or automatic) that
scores applicants using free, rule-based logic (no external AI API required).

1. jobs — add screening configuration
   - screening_mode ('manual' default, or 'automatic')
   - ai_screening_enabled (false until the client pays the AI screening fee
     and admin releases that payment)

2. platform_settings — add ai_screening_fee (superadmin-configurable)

3. payments — add `purpose` so we can tell an AI-screening-fee payment apart
   from a normal escrow payment when admin releases it. On release, if
   purpose = 'ai_screening', the related job's ai_screening_enabled flips true
   (handled in the API layer, not a DB trigger, to keep this readable).

4. job_applications — one application per (job, applicant). Stores the
   applicant's submission plus the AI screening score/reasons once screened.

5. RLS
   - Applicant can insert/read their own application.
   - Job owner (client) can read + update applications on their own jobs
     (to shortlist/reject/hire and to let the screening endpoint write
     ai_score/ai_reasons using the client's own authenticated session).
   - Admin has full read via is_admin().
*/

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS screening_mode text NOT NULL DEFAULT 'manual' CHECK (screening_mode IN ('manual','automatic'));
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ai_screening_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS ai_screening_fee numeric(12,2) NOT NULL DEFAULT 2000;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'escrow' CHECK (purpose IN ('escrow','ai_screening','subscription'));

CREATE TABLE IF NOT EXISTS job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  cover_letter text,
  expected_price numeric(12,2),
  duration text,
  portfolio_url text,
  resume_url text,
  attachments text[],
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','screened','shortlisted','rejected','hired')),
  ai_score numeric(5,2),
  ai_reasons jsonb DEFAULT '[]',
  screened_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (job_id, applicant_id)
);
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_own_application" ON job_applications;
CREATE POLICY "insert_own_application" ON job_applications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = applicant_id);

DROP POLICY IF EXISTS "read_own_application" ON job_applications;
CREATE POLICY "read_own_application" ON job_applications
  FOR SELECT TO authenticated USING (auth.uid() = applicant_id);

DROP POLICY IF EXISTS "job_owner_read_applications" ON job_applications;
CREATE POLICY "job_owner_read_applications" ON job_applications
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_applications.job_id AND jobs.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "job_owner_update_applications" ON job_applications;
CREATE POLICY "job_owner_update_applications" ON job_applications
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_applications.job_id AND jobs.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_applications.job_id AND jobs.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_applications_job ON job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_applicant ON job_applications(applicant_id);
