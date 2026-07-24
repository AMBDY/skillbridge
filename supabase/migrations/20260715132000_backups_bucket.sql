/*
# Backups storage bucket

Private (not public like the kyc bucket) — backups contain full table dumps
including profiles, payments, KYC records. Only admins can read or write.
*/

INSERT INTO storage.buckets (id, name, public) VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "admin_read_backups_bucket" ON storage.objects;
CREATE POLICY "admin_read_backups_bucket" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'backups' AND public.is_admin());

DROP POLICY IF EXISTS "admin_write_backups_bucket" ON storage.objects;
CREATE POLICY "admin_write_backups_bucket" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'backups' AND public.is_admin());

DROP POLICY IF EXISTS "admin_delete_backups_bucket" ON storage.objects;
CREATE POLICY "admin_delete_backups_bucket" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'backups' AND public.is_admin());
