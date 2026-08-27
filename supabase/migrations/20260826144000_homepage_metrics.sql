ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS homepage_metrics jsonb NOT NULL DEFAULT '{}'::jsonb;
