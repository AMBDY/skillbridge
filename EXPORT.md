# SkillBridge — Full Website Code Export

## Overview
SkillBridge is a premium African marketplace platform with three ecosystems: Hire Talent (freelance services), Shop Products (e-commerce), and Find Jobs (job board). It includes escrow payments, real-time chat, AI ranking, KYC verification, and a superadmin moderation layer.

## Tech Stack
- **Frontend:** Vanilla HTML/CSS/JS (no build step)
- **Backend:** Node.js + Express + Socket.io
- **Database:** Supabase (PostgreSQL with RLS)
- **Auth:** Supabase client-side auth (email/password)
- **Storage:** Supabase Storage (for image uploads)

---

## 1. Database Schema

### Tables

#### `admin_emails`
List of emails granted admin role on signup.
- `id` uuid PK
- `email` text UNIQUE NOT NULL
- `created_at` timestamptz DEFAULT now()
- RLS: public read, admin-only write

#### `profiles`
Extends `auth.users` with role, KYC, display info, payment details.
- `id` uuid PK
- `user_id` uuid UNIQUE NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
- `role` text NOT NULL CHECK (client, freelancer, seller, worker, admin)
- `first_name`, `middle_name`, `last_name` text
- `display_name` text NOT NULL
- `email`, `phone` text
- `country` text DEFAULT 'Nigeria'
- `state`, `city`, `address` text
- `bank_name`, `account_number`, `account_holder_name` text
- `kyc_level` int DEFAULT 0 CHECK (0-4)
- `profile_image`, `cover_image` text
- `about`, `cover_letter` text
- `availability` boolean DEFAULT true
- `response_time_hours` int DEFAULT 24
- `completion_rate` numeric(5,2) DEFAULT 100
- `rating` numeric(3,2) DEFAULT 0
- `review_count` int DEFAULT 0
- `subscription_tier` text DEFAULT 'free' CHECK (free, pro, featured, elite)
- `is_online` boolean DEFAULT false
- `created_at` timestamptz DEFAULT now()
- RLS: public SELECT, owner INSERT/UPDATE

#### `categories`
Service/product/job categories.
- `id` uuid PK
- `name` text NOT NULL
- `slug` text UNIQUE NOT NULL
- `ecosystem` text NOT NULL CHECK (hire, shop, jobs)
- `icon`, `description` text
- `sort_order` int DEFAULT 0
- RLS: public read, admin-only write

#### `services`
Freelance service listings.
- `id` uuid PK
- `user_id` uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id)
- `category_id` uuid REFERENCES categories(id)
- `title` text NOT NULL
- `description` text
- `price` numeric(12,2) NOT NULL DEFAULT 0
- `delivery_days` int DEFAULT 7
- `images` text[]
- `video_url` text
- `rating` numeric(3,2) DEFAULT 0
- `review_count` int DEFAULT 0
- `status` text DEFAULT 'active' CHECK (active, paused, deleted)
- RLS: public SELECT (active only), owner INSERT/UPDATE/DELETE

#### `products`
E-commerce product listings.
- Same structure as services, plus: `size`, `color`, `gender`, `stock`

#### `jobs`
Job postings by clients.
- `id` uuid PK
- `user_id` uuid NOT NULL DEFAULT auth.uid()
- `category_id` uuid REFERENCES categories(id)
- `title` text NOT NULL
- `description` text
- `budget` numeric(12,2) DEFAULT 0
- `price_min`, `price_max` numeric(12,2)
- `gender`, `colors`, `size`, `duration`, `location`, `state` text
- `reference_images` text[]
- `additional_notes` text
- `status` text NOT NULL DEFAULT 'pending' CHECK (pending, approved, open, assigned, completed, cancelled)
- `assigned_to` uuid REFERENCES auth.users(id)
- RLS: public SELECT (approved+), owner INSERT/UPDATE

#### `job_bids`
Bids on jobs.
- `id` uuid PK
- `job_id` uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE
- `user_id` uuid NOT NULL DEFAULT auth.uid()
- `amount` numeric(12,2) NOT NULL
- `message`, `duration` text
- `status` text DEFAULT 'pending' CHECK (pending, accepted, rejected)

#### `agreements`
Sealed agreements between client and worker.
- `id` uuid PK
- `job_id` uuid NOT NULL REFERENCES jobs(id)
- `client_id`, `worker_id` uuid NOT NULL REFERENCES auth.users(id)
- `details` jsonb DEFAULT '{}'
- `price` numeric(12,2) NOT NULL
- `timeline` text
- `service_fee_percent` numeric(5,2) DEFAULT 10
- `client_agreed`, `worker_agreed`, `locked`, `sealed` boolean DEFAULT false

#### `reviews`
Ratings left by clients on workers.
- `id` uuid PK
- `reviewer_id` uuid NOT NULL DEFAULT auth.uid()
- `reviewee_id` uuid NOT NULL
- `job_id` uuid REFERENCES jobs(id)
- `stars` int NOT NULL CHECK (1-5)
- `comment` text
- `hire_again` boolean DEFAULT true
- RLS: public SELECT, owner INSERT

#### `chat_conversations`
Conversation rooms between two users.
- `id` uuid PK
- `user_a`, `user_b` uuid NOT NULL REFERENCES auth.users(id)
- `related_job_id` uuid REFERENCES jobs(id)
- CONSTRAINT unique_pair UNIQUE (user_a, user_b)

#### `chat_messages`
Messages within conversations.
- `id` uuid PK
- `conversation_id` uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE
- `sender_id` uuid NOT NULL DEFAULT auth.uid()
- `body` text
- `message_type` text DEFAULT 'text' CHECK (text, image, video, file, voice, contract, payment_proof)
- `file_url` text
- `seen` boolean DEFAULT false
- `original_language`, `translated_body` text

#### `payments`
Escrow payment records.
- `id` uuid PK
- `job_id`, `agreement_id` uuid
- `client_id` uuid NOT NULL DEFAULT auth.uid()
- `worker_id` uuid
- `amount` numeric(12,2) NOT NULL
- `service_fee` numeric(12,2) DEFAULT 0
- `payment_method` text CHECK (crypto_usdt, fiat_naira, bank_transfer)
- `proof_url` text
- `proof_meta` jsonb
- `status` text NOT NULL DEFAULT 'pending' CHECK (pending, in_escrow, released, disputed, refunded)
- `received_at`, `released_at` timestamptz

#### `notifications`
User notifications.
- `id` uuid PK
- `user_id` uuid NOT NULL DEFAULT auth.uid()
- `type` text NOT NULL
- `title`, `body`, `link` text
- `read` boolean DEFAULT false

#### `subscriptions`
Worker subscription tier requests.
- `id` uuid PK
- `user_id` uuid NOT NULL DEFAULT auth.uid()
- `tier` text NOT NULL CHECK (free, pro, featured, elite)
- `amount` numeric(12,2) DEFAULT 0
- `proof_url` text
- `status` text DEFAULT 'pending' CHECK (pending, approved, rejected, refunded)

#### `ads`
Superadmin-managed ads.
- `id` uuid PK
- `title` text NOT NULL
- `description`, `media_url`, `link_url` text
- `link_new_tab` boolean DEFAULT true
- `ad_type` text NOT NULL CHECK (banner, sidebar, popup, feed, hero)
- `target_page` text NOT NULL CHECK (landing, homepage, market, category, chat, payment, jobs, all)
- `schedule_at` timestamptz DEFAULT now()
- `expires_at` timestamptz
- `status` text DEFAULT 'active' CHECK (active, paused, expired)

#### `audit_logs`
Admin audit trail.
- `id` uuid PK
- `actor_id` uuid REFERENCES auth.users(id)
- `action` text NOT NULL
- `target_type` text
- `target_id` uuid
- `meta` jsonb

#### `disputes`
Dispute records.
- `id` uuid PK
- `job_id`, `payment_id` uuid
- `raised_by` uuid NOT NULL DEFAULT auth.uid()
- `reason` text NOT NULL
- `status` text DEFAULT 'open' CHECK (open, reviewing, resolved, dismissed)
- `resolution` text

#### `kyc_submissions`
KYC verification uploads.
- `id` uuid PK
- `user_id` uuid NOT NULL DEFAULT auth.uid()
- `selfie_url` text NOT NULL
- `full_name` text
- `submission_date` date DEFAULT CURRENT_DATE
- `status` text DEFAULT 'pending' CHECK (pending, approved, rejected)
- `reviewer_note` text

#### `platform_settings`
Single-row config table.
- `id` uuid PK
- `service_fee_percent` numeric(5,2) NOT NULL DEFAULT 10
- `escrow_hold_hours` int NOT NULL DEFAULT 1
- `updated_at` timestamptz DEFAULT now()

### Storage Bucket
- `kyc` — public bucket for KYC selfies, profile images, listing images
- RLS: public read, authenticated write

### Helper Function
```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin');
$$;
```

### Admin Email
The email `abdulmajidyakubu970@gmail.com` is seeded in the `admin_emails` table. When someone signs up with this email, they automatically get `role = 'admin'`.

---

## 2. File Structure
```
project/
├── .env                          # Supabase URL + anon key
├── package.json                  # Dependencies
├── index.js                      # Entry point
├── public/                       # Frontend
│   ├── css/styles.css            # All styles
│   ├── js/
│   │   ├── sb-config.js          # Supabase config + CDN loader
│   │   ├── app.js                # Shared client logic (Auth, API, uploadImage)
│   │   ├── signup.js             # Signup with image upload
│   │   ├── signin.js             # Signin
│   │   ├── home.js               # Homepage
│   │   ├── marketplace.js        # Hire/Shop pages
│   │   ├── jobs.js               # Jobs listing
│   │   ├── job.js                # Single job
│   │   ├── post-job.js           # Post job form
│   │   ├── dashboard.js          # User dashboard
│   │   ├── admin.js              # Admin panel
│   │   ├── chat.js               # Real-time chat
│   │   ├── profile.js            # User profile
│   │   ├── listing.js            # Service/product detail
│   │   ├── category.js           # Category browse
│   │   └── agreement.js          # Agreement sealing
│   ├── index.html                # Homepage
│   ├── signup.html               # Sign up (with image upload)
│   ├── signin.html               # Sign in
│   ├── dashboard.html            # Dashboard
│   ├── admin.html                # Admin panel
│   ├── hire.html                 # Hire talent
│   ├── shop.html                 # Shop products
│   ├── jobs.html                 # Browse jobs
│   ├── job.html                  # Job detail
│   ├── post-job.html             # Post a job
│   ├── chat.html                 # Chat
│   ├── profile.html              # Profile
│   ├── listing.html              # Listing detail
│   ├── category.html             # Category
│   ├── search.html               # Search
│   ├── about.html                # About
│   ├── agreement.html            # Agreement
│   ├── payment.html              # Payment hub
│   ├── pay-fiat.html             # Fiat payment
│   ├── pay-crypto.html           # Crypto payment
│   ├── pay-proof.html            # Payment proof
│   ├── payments.html             # Payments list
│   └── signin.html               # Sign in
├── server/                       # Backend
│   ├── index.js                  # Express server + HTML injection
│   ├── utils/db.js               # Supabase client factory
│   ├── middleware/auth.js        # JWT validation + admin check
│   ├── routes/
│   │   ├── auth.js               # Auth endpoints
│   │   ├── admin.js              # Admin CRUD
│   │   ├── marketplace.js        # Services, products, reviews, profiles
│   │   ├── jobs.js               # Jobs, bids, agreements
│   │   ├── chat.js               # Chat REST API
│   │   ├── payments.js           # Escrow payments
│   │   └── ai.js                 # AI placeholders
│   └── sockets/chat.js           # Socket.io chat handler
└── supabase/migrations/          # SQL migrations (applied via MCP)
```

---

## 3. Authentication Flow

### Signup (client-side)
1. User fills form on `signup.html` (role, name, email, password, phone, location, payment details, KYC selfie)
2. `signup.js` calls `Auth.signup()` in `app.js`
3. `Auth.signup()`:
   - Checks `admin_emails` table (anon read) — if email matches, role = 'admin'
   - Calls `supabase.auth.signUp({ email, password })` — creates auth user
   - Inserts profile into `profiles` table using the authenticated session
   - If KYC selfie uploaded, inserts into `kyc_submissions`
   - Gets session tokens and stores in localStorage
   - Redirects to dashboard

### Signin (client-side)
1. User enters email/password on `signin.html`
2. `signin.js` calls `Auth.signin()` in `app.js`
3. `Auth.signin()`:
   - Calls `supabase.auth.signInWithPassword({ email, password })`
   - Fetches profile from `profiles` table
   - Stores tokens and profile in localStorage
   - Redirects to dashboard

### Admin Access
- The `admin_emails` table contains `abdulmajidyakubu970@gmail.com`
- On signup, if the email is in this table, the user gets `role = 'admin'`
- The navbar shows an "Admin" button for users with `role = 'admin'`
- The admin panel (`admin.html`) uses the user's authenticated Supabase token for all API calls
- The backend `authMiddleware` looks up the user's role from `profiles` and `adminOnly` middleware checks `role === 'admin'`

### Token Handling
- Frontend stores Supabase access token in `localStorage.sb_token`
- All API calls send `Authorization: Bearer <token>`
- Backend validates the JWT and looks up the user's role from `profiles`
- Backend creates an authenticated Supabase client using the user's token for RLS-protected writes

---

## 4. Key Fixes Applied

1. **Removed hardcoded admin email** — Replaced with `admin_emails` database table. The email `abdulmajidyakubu970@gmail.com` is seeded in the table.

2. **Fixed auth flow** — Moved from broken server-side `auth.admin.createUser()` (which needed the service role key) to client-side `supabase.auth.signUp()` (which works with the anon key + authenticated session).

3. **Fixed RLS compatibility** — Backend creates authenticated Supabase clients from the user's JWT token, so RLS policies work correctly for writes. Public reads use the anon client.

4. **Fixed image upload** — Signup page has a drag-and-drop file upload zone that uploads to Supabase Storage `kyc` bucket. The Supabase JS library loads lazily (waits for CDN to load before initializing).

5. **Fixed signin** — Removed the fake 2FA OTP step that was blocking signin.

6. **Fixed profiles SELECT policy** — Changed from `authenticated`-only to `anon, authenticated` so marketplace browsing works without login.
