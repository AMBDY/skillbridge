/*
# Create storage bucket for KYC and image uploads

1. New Storage
- Create public bucket `kyc` for KYC selfies, profile images, and listing images.
- Public read, authenticated write.
2. Notes
- Used by signup (KYC selfie), profile images, and listing images.
*/

INSERT INTO storage.buckets (id, name, public) VALUES ('kyc', 'kyc', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "read_kyc_bucket" ON storage.objects;
CREATE POLICY "read_kyc_bucket" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'kyc');

DROP POLICY IF EXISTS "insert_kyc_bucket" ON storage.objects;
CREATE POLICY "insert_kyc_bucket" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'kyc');

DROP POLICY IF EXISTS "update_kyc_bucket" ON storage.objects;
CREATE POLICY "update_kyc_bucket" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'kyc') WITH CHECK (bucket_id = 'kyc');
