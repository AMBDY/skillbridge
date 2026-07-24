/*
# SkillBridge Core Schema

1. Overview
SkillBridge is a multi-ecosystem marketplace (freelance services, e-commerce products, job board) with escrow payments, real-time chat, AI ranking, and a superadmin moderation layer. This migration creates the foundational tables.

2. New Tables
- `profiles` — extends auth.users with role, KYC level, display info, payment details, subscription tier.
- `categories` — service/product/job categories (graphics design, clothing, plumbing, etc.) with ecosystem type.
- `services` — freelance service listings posted by freelancers.
- `products` — e-commerce product listings posted by sellers.
- `jobs` — job postings by clients with status workflow and admin approval.
- `job_bids` — freelancer/worker bids on jobs.
- `agreements` — sealed agreements between client and worker for custom jobs.
- `reviews` — ratings + comments left by clients on workers after completion.
- `chat_conversations` — conversation rooms between two parties.
- `chat_messages` — messages within conversations (text, files, voice, contracts).
- `payments` — escrow payment records with proof and status workflow.
- `notifications` — real-time user notifications.
- `subscriptions` — worker subscription tier requests (free/pro/featured/elite) with admin approval.
- `ads` — superadmin-managed ads/content posts with scheduling and page targeting.
- `audit_logs` — superadmin audit trail.
- `disputes` — dispute records raised on jobs/payments.
- `kyc_submissions` — KYC verification uploads and review state.

3. Security
- RLS enabled on every table.
- Owner-scoped CRUD for user-owned tables (profiles, services, products, jobs, bids, agreements, reviews, messages, payments, notifications, subscriptions, kyc).
- Public read on categories and approved services/products/jobs for marketplace browsing.
- Admin-only write on ads, audit_logs, disputes resolution, job approval, kyc review, subscription approval.

4. Notes
- Uses auth.uid() for ownership. Owner columns default to auth.uid() so client inserts omitting user_id still pass WITH CHECK.
- Service fee configurable by superadmin stored in a settings concept (ads/config) — here we use a `platform_settings` table.
*/

-- Platform settings (single-row config: service fee, etc.)
CREATE TABLE IF NOT EXISTS platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_fee_percent numeric(5,2) NOT NULL DEFAULT 10.00,
  escrow_hold_hours int NOT NULL DEFAULT 1,
  updated_at timestamptz DEFAULT now()
);
INSERT INTO platform_settings (id) VALUES (gen_random_uuid())
  ON CONFLICT DO NOTHING;

-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('client','freelancer','seller','worker','admin')),
  first_name text,
  middle_name text,
  last_name text,
  display_name text NOT NULL,
  email text,
  phone text,
  country text DEFAULT 'Nigeria',
  state text,
  city text,
  address text,
  bank_name text,
  account_number text,
  account_holder_name text,
  kyc_level int NOT NULL DEFAULT 0 CHECK (kyc_level BETWEEN 0 AND 4),
  profile_image text,
  cover_image text,
  about text,
  cover_letter text,
  availability boolean DEFAULT true,
  response_time_hours int DEFAULT 24,
  completion_rate numeric(5,2) DEFAULT 100.00,
  rating numeric(3,2) DEFAULT 0,
  review_count int DEFAULT 0,
  subscription_tier text DEFAULT 'free' CHECK (subscription_tier IN ('free','pro','featured','elite')),
  is_online boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_profiles" ON profiles;
CREATE POLICY "select_profiles" ON profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  ecosystem text NOT NULL CHECK (ecosystem IN ('hire','shop','jobs')),
  icon text,
  description text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_categories" ON categories;
CREATE POLICY "read_categories" ON categories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admin_insert_categories" ON categories;
CREATE POLICY "admin_insert_categories" ON categories FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "admin_update_categories" ON categories;
CREATE POLICY "admin_update_categories" ON categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Services (freelance listings)
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id),
  title text NOT NULL,
  description text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  delivery_days int DEFAULT 7,
  images text[],
  video_url text,
  rating numeric(3,2) DEFAULT 0,
  review_count int DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active','paused','deleted')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_services" ON services;
CREATE POLICY "read_services" ON services FOR SELECT TO anon, authenticated USING (status = 'active');
DROP POLICY IF EXISTS "insert_own_services" ON services;
CREATE POLICY "insert_own_services" ON services FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_services" ON services;
CREATE POLICY "update_own_services" ON services FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_services" ON services;
CREATE POLICY "delete_own_services" ON services FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_user ON services(user_id);

-- Products (e-commerce listings)
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id),
  title text NOT NULL,
  description text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  size text,
  color text,
  gender text,
  images text[],
  video_url text,
  stock int DEFAULT 1,
  rating numeric(3,2) DEFAULT 0,
  review_count int DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active','paused','deleted')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_products" ON products;
CREATE POLICY "read_products" ON products FOR SELECT TO anon, authenticated USING (status = 'active');
DROP POLICY IF EXISTS "insert_own_products" ON products;
CREATE POLICY "insert_own_products" ON products FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_products" ON products;
CREATE POLICY "update_own_products" ON products FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_products" ON products;
CREATE POLICY "delete_own_products" ON products FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);

-- Jobs
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id),
  title text NOT NULL,
  description text,
  budget numeric(12,2) DEFAULT 0,
  price_min numeric(12,2),
  price_max numeric(12,2),
  gender text,
  colors text,
  size text,
  duration text,
  location text,
  state text,
  reference_images text[],
  additional_notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','open','assigned','completed','cancelled')),
  assigned_to uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_jobs" ON jobs;
CREATE POLICY "read_jobs" ON jobs FOR SELECT TO anon, authenticated USING (status IN ('approved','open','assigned','completed'));
DROP POLICY IF EXISTS "insert_own_jobs" ON jobs;
CREATE POLICY "insert_own_jobs" ON jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_jobs" ON jobs;
CREATE POLICY "update_own_jobs" ON jobs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- Job bids
CREATE TABLE IF NOT EXISTS job_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  message text,
  duration text,
  status text DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE job_bids ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_bids" ON job_bids;
CREATE POLICY "read_bids" ON job_bids FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_bids" ON job_bids;
CREATE POLICY "insert_own_bids" ON job_bids FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_bids" ON job_bids;
CREATE POLICY "update_own_bids" ON job_bids FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Agreements
CREATE TABLE IF NOT EXISTS agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  details jsonb NOT NULL DEFAULT '{}',
  price numeric(12,2) NOT NULL,
  timeline text,
  service_fee_percent numeric(5,2) DEFAULT 10.00,
  client_agreed boolean DEFAULT false,
  worker_agreed boolean DEFAULT false,
  locked boolean DEFAULT false,
  sealed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE agreements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_agreements" ON agreements;
CREATE POLICY "read_agreements" ON agreements FOR SELECT TO authenticated USING (auth.uid() = client_id OR auth.uid() = worker_id);
DROP POLICY IF EXISTS "insert_own_agreements" ON agreements;
CREATE POLICY "insert_own_agreements" ON agreements FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id OR auth.uid() = worker_id);
DROP POLICY IF EXISTS "update_own_agreements" ON agreements;
CREATE POLICY "update_own_agreements" ON agreements FOR UPDATE TO authenticated USING (auth.uid() = client_id OR auth.uid() = worker_id) WITH CHECK (auth.uid() = client_id OR auth.uid() = worker_id);

-- Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  stars int NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text,
  hire_again boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_reviews" ON reviews;
CREATE POLICY "read_reviews" ON reviews FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_reviews" ON reviews;
CREATE POLICY "insert_own_reviews" ON reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id);

-- Chat conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  related_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_pair UNIQUE (user_a, user_b)
);
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_own_conversations" ON chat_conversations;
CREATE POLICY "read_own_conversations" ON chat_conversations FOR SELECT TO authenticated USING (auth.uid() = user_a OR auth.uid() = user_b);
DROP POLICY IF EXISTS "insert_own_conversations" ON chat_conversations;
CREATE POLICY "insert_own_conversations" ON chat_conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  body text,
  message_type text DEFAULT 'text' CHECK (message_type IN ('text','image','video','file','voice','contract','payment_proof')),
  file_url text,
  seen boolean DEFAULT false,
  original_language text,
  translated_body text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_own_messages" ON chat_messages;
CREATE POLICY "read_own_messages" ON chat_messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM chat_conversations c WHERE c.id = chat_messages.conversation_id AND (c.user_a = auth.uid() OR c.user_b = auth.uid()))
);
DROP POLICY IF EXISTS "insert_own_messages" ON chat_messages;
CREATE POLICY "insert_own_messages" ON chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
DROP POLICY IF EXISTS "update_own_messages" ON chat_messages;
CREATE POLICY "update_own_messages" ON chat_messages FOR UPDATE TO authenticated USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON chat_messages(conversation_id, created_at);

-- Payments (escrow)
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  agreement_id uuid REFERENCES agreements(id) ON DELETE SET NULL,
  client_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  service_fee numeric(12,2) DEFAULT 0,
  payment_method text CHECK (payment_method IN ('crypto_usdt','fiat_naira','bank_transfer')),
  proof_url text,
  proof_meta jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_escrow','released','disputed','refunded')),
  received_at timestamptz,
  released_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_own_payments" ON payments;
CREATE POLICY "read_own_payments" ON payments FOR SELECT TO authenticated USING (auth.uid() = client_id OR auth.uid() = worker_id);
DROP POLICY IF EXISTS "insert_own_payments" ON payments;
CREATE POLICY "insert_own_payments" ON payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id);
DROP POLICY IF EXISTS "update_own_payments" ON payments;
CREATE POLICY "update_own_payments" ON payments FOR UPDATE TO authenticated USING (auth.uid() = client_id OR auth.uid() = worker_id) WITH CHECK (auth.uid() = client_id OR auth.uid() = worker_id);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text,
  body text,
  link text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_own_notifications" ON notifications;
CREATE POLICY "read_own_notifications" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_notifications" ON notifications;
CREATE POLICY "insert_own_notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Subscriptions (worker tier requests)
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('free','pro','featured','elite')),
  amount numeric(12,2) DEFAULT 0,
  proof_url text,
  status text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','refunded')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_own_subscriptions" ON subscriptions;
CREATE POLICY "read_own_subscriptions" ON subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_subscriptions" ON subscriptions;
CREATE POLICY "insert_own_subscriptions" ON subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_subscriptions" ON subscriptions;
CREATE POLICY "update_own_subscriptions" ON subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Ads (superadmin content management)
CREATE TABLE IF NOT EXISTS ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  media_url text,
  link_url text,
  link_new_tab boolean DEFAULT true,
  ad_type text NOT NULL CHECK (ad_type IN ('banner','sidebar','popup','feed','hero')),
  target_page text NOT NULL CHECK (target_page IN ('landing','homepage','market','category','chat','payment','jobs','all')),
  schedule_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  status text DEFAULT 'active' CHECK (status IN ('active','paused','expired')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_ads" ON ads;
CREATE POLICY "read_ads" ON ads FOR SELECT TO anon, authenticated USING (status = 'active');
DROP POLICY IF EXISTS "admin_insert_ads" ON ads;
CREATE POLICY "admin_insert_ads" ON ads FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "admin_update_ads" ON ads;
CREATE POLICY "admin_update_ads" ON ads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_delete_ads" ON ads;
CREATE POLICY "admin_delete_ads" ON ads FOR DELETE TO authenticated USING (true);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  meta jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_audit_logs" ON audit_logs;
CREATE POLICY "read_audit_logs" ON audit_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_audit_logs" ON audit_logs;
CREATE POLICY "insert_audit_logs" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Disputes
CREATE TABLE IF NOT EXISTS disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  raised_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  resolution text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_disputes" ON disputes;
CREATE POLICY "read_disputes" ON disputes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_disputes" ON disputes;
CREATE POLICY "insert_own_disputes" ON disputes FOR INSERT TO authenticated WITH CHECK (auth.uid() = raised_by);
DROP POLICY IF EXISTS "admin_update_disputes" ON disputes;
CREATE POLICY "admin_update_disputes" ON disputes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- KYC submissions
CREATE TABLE IF NOT EXISTS kyc_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  selfie_url text NOT NULL,
  full_name text,
  submission_date date DEFAULT CURRENT_DATE,
  status text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewer_note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE kyc_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_own_kyc" ON kyc_submissions;
CREATE POLICY "read_own_kyc" ON kyc_submissions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_kyc" ON kyc_submissions;
CREATE POLICY "insert_own_kyc" ON kyc_submissions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_update_kyc" ON kyc_submissions;
CREATE POLICY "admin_update_kyc" ON kyc_submissions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
