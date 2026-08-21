-- Flexible job-specific application requirements and optional featured media.
-- Each recruitment job owns its schema, so later jobs never alter older applications.
ALTER TABLE recruitment_jobs
  ADD COLUMN IF NOT EXISTS application_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE recruitment_applications
  ADD COLUMN IF NOT EXISTS application_data jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE featured_items
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS display_note text;
