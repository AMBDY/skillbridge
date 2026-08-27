-- Chat agreements remain visible to their parties while they negotiate.
-- Administrators gain read access only after every required party accepts.

DROP POLICY IF EXISTS "admin_read_finalized_agreements" ON public.agreements;
CREATE POLICY "admin_read_finalized_agreements" ON public.agreements FOR SELECT TO authenticated
  USING (public.is_admin() AND status IN ('active', 'completed'));

DROP POLICY IF EXISTS "admin_read_finalized_agreement_parties" ON public.agreement_parties;
CREATE POLICY "admin_read_finalized_agreement_parties" ON public.agreement_parties FOR SELECT TO authenticated
  USING (public.is_admin() AND EXISTS (
    SELECT 1 FROM public.agreements a
    WHERE a.id = agreement_id AND a.status IN ('active', 'completed')
  ));

DROP POLICY IF EXISTS "admin_read_finalized_agreement_audit" ON public.agreement_audit_log;
CREATE POLICY "admin_read_finalized_agreement_audit" ON public.agreement_audit_log FOR SELECT TO authenticated
  USING (public.is_admin() AND EXISTS (
    SELECT 1 FROM public.agreements a
    WHERE a.id = agreement_id AND a.status IN ('active', 'completed')
  ));
