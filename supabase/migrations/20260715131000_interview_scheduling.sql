/*
# Interview scheduling

Named in the original spec ("Client can: Schedule interviews... Set: Date,
Time, Timezone, Meeting link, Notes") and never built. Adding it to both
application tables since the platform ended up with two parallel
apply-to-a-job systems (general jobs and the dedicated recruitment module).
*/

ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS interview_at timestamptz;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS interview_link text;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS interview_notes text;

ALTER TABLE recruitment_applications ADD COLUMN IF NOT EXISTS interview_at timestamptz;
ALTER TABLE recruitment_applications ADD COLUMN IF NOT EXISTS interview_link text;
ALTER TABLE recruitment_applications ADD COLUMN IF NOT EXISTS interview_notes text;
