/*
# Dispute visibility fix + job lifecycle actions

1. disputes — the original read policy was `USING (true)` for any
   authenticated user, meaning every user could read every dispute's reason
   text, including ones they have nothing to do with. Scoped to: the person
   who raised it, the job's client/assigned worker, the payment's
   client/worker, or admin.

2. jobs — the status CHECK only allowed
   ('pending','approved','open','assigned','completed','cancelled'), so
   there was no way to represent a paused or closed job. Widened to add
   'paused' and 'closed'. Existing rows are unaffected — this only adds
   permitted values, it doesn't change any data.
*/

DROP POLICY IF EXISTS "read_disputes" ON disputes;
CREATE POLICY "read_disputes" ON disputes FOR SELECT TO authenticated USING (
  raised_by = auth.uid()
  OR public.is_admin()
  OR EXISTS (SELECT 1 FROM jobs WHERE jobs.id = disputes.job_id AND (jobs.user_id = auth.uid() OR jobs.assigned_to = auth.uid()))
  OR EXISTS (SELECT 1 FROM payments WHERE payments.id = disputes.payment_id AND (payments.client_id = auth.uid() OR payments.worker_id = auth.uid()))
);

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('pending','approved','open','assigned','completed','cancelled','paused','closed'));

-- Missing entirely until now: the job owner could not see their own job
-- unless its status happened to already be public (approved/open/assigned/
-- completed). A pending, paused, closed, or cancelled job was invisible
-- even to the person who posted it.
DROP POLICY IF EXISTS "read_own_jobs" ON jobs;
CREATE POLICY "read_own_jobs" ON jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);
