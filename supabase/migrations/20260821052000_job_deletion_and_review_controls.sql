-- Run once after the earlier SkillBridge migrations.
-- Retains a poster-deleted job for the administrator's Deleted tab.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('pending','approved','open','assigned','completed','cancelled','paused','closed','deleted_by_owner'));

-- A signed-in poster must still be able to see their own soft-deleted job in
-- their dashboard, while it remains hidden from public job feeds.
DROP POLICY IF EXISTS "read_own_jobs" ON public.jobs;
CREATE POLICY "read_own_jobs" ON public.jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Preserve the listing that started a conversation so an agreement can be
-- created only by that listing's seller, just as job agreements are restricted
-- to the job poster.
ALTER TABLE public.chat_conversations ADD COLUMN IF NOT EXISTS related_listing_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
