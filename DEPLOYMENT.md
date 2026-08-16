# SkillBridge — Deployment Guide

## 1. Supabase project

1. Create a project at supabase.com (or use an existing one).
2. Settings → API → copy **Project URL** and **anon public key**.
3. Open the SQL Editor and run every file in `supabase/migrations/` **in this
   exact order** (filenames are timestamp-ordered, so alphabetical = correct
   order — but they're listed explicitly here as a safety check):

   1. `20260626112734_skillbridge_core_schema.sql`
   2. `20260626112754_add_password_hash.sql`
   3. `20260626113540_fix_rls_security.sql`
   4. `20260626114724_create_storage_bucket.sql`
   5. `20260627160946_add_admin_emails_table.sql`
   6. `20260715120000_fix_products_rls_and_add_content_tables.sql`
   7. `20260715121500_job_recruitment_system.sql`
   8. `20260715122000_admin_rls_gaps.sql`
   9. `20260715123000_settings_and_plans.sql`
   10. `20260715124000_job_recruitment_module.sql`
   11. `20260715125000_ad_tracking.sql`
   12. `20260715126000_support_tickets.sql`
   13. `20260715127000_disputes_and_job_lifecycle.sql`
   14. `20260715128000_adsense.sql`
   15. `20260715129000_blog.sql`
   16. `20260715130000_notifications_fix.sql`
   17. `20260715131000_interview_scheduling.sql`
   18. `20260715132000_backups_bucket.sql`
   19. `20260715133000_homepage_sections.sql`
   20. `20260715134000_email_templates.sql`
   21. `20260715135000_fraud_flags.sql`
   22. `20260715136000_seed_categories.sql`
   23. `20260715137000_restrict_job_posting.sql`
   24. `20260715138000_listing_approval.sql`
   25. `20260715139000_account_status.sql`
   26. `20260715140000_hero_images_seed.sql`
   27. `20260715141000_protect_profile_fields.sql`
   28. `20260715142000_listing_location_brand.sql`

   Every migration is written to be safe to re-run (uses `IF NOT EXISTS` /
   `DROP POLICY IF EXISTS` throughout, never `DROP TABLE`/`TRUNCATE`), so if
   you're unsure whether one already ran, running it again is harmless.

4. Add the first admin: insert your email into the `admin_emails` table
   (Table Editor → admin_emails → Insert row) **before** you sign up with
   that email — signup checks this table and grants the `admin` role
   automatically to matching emails.

## 2. Environment variables

Copy `.env.example` to `.env` and fill in `SUPABASE_URL` and
`SUPABASE_ANON_KEY` at minimum — everything else is optional and the app
runs correctly with defaults. See `.env.example` for what each one does.

**Important:** the frontend gets its Supabase config from a server-generated
route (`GET /js/sb-config.js`), not a static file — so changing `.env` and
restarting the server is enough to point the whole app at a different
Supabase project. You never need to edit any file under `public/` to change
environments.

## 3. Hosting

Any Node host that runs a persistent process works (this app uses
Socket.IO for chat, so serverless/edge-function platforms that don't support
long-lived connections — e.g. pure Vercel serverless — won't work for the
chat feature). Straightforward options: Render, Railway, Fly.io, or a plain
VPS with a process manager (pm2/systemd).

Generic steps for any of them:

1. Push this repo (minus `.env` and `node_modules` — both are gitignored).
2. Set the environment variables from step 2 in the host's dashboard.
3. Build command: `npm install` (the `npm run build` script is a no-op —
   there's no separate frontend build step, `public/` is served as-is).
4. Start command: `npm start` (runs `node server/index.js`).
5. The app listens on `process.env.PORT` (falls back to 3000) — most hosts
   inject `PORT` automatically; you don't need to set it yourself unless
   running on a bare VPS.
6. Point your domain at the host, and put it behind HTTPS — either the
   host's built-in TLS (Render/Railway/Fly all provide this automatically)
   or a reverse proxy (Caddy/nginx + Let's Encrypt) on a VPS. The app sets
   `trust proxy` already, so it works correctly behind any of these.
7. Once you know your real domain, set `CORS_ORIGIN` to it (comma-separated
   if you have more than one, e.g. apex + www) instead of leaving it open to
   all origins.

## 4. Pre-launch checklist

- [ ] All 10 migrations run, in order, against your production Supabase
      project (not just a dev/staging one).
- [ ] `.env` has real `SUPABASE_URL` / `SUPABASE_ANON_KEY` for that same
      project.
- [ ] Your email is in `admin_emails` before you sign up, so you get admin
      access.
- [ ] `CORS_ORIGIN` set to your real domain(s).
- [ ] Logged in as admin → Settings tab → set your real site name, escrow
      hold time, commission rates, and AI screening fee (these all default
      to placeholder values).
- [ ] Logged in as admin → confirm you can approve a test job posting and a
      test recruitment job posting (these require superadmin approval before
      they go public).
- [ ] Decide whether to enable any paid AI provider (`ENABLE_OPENAI` etc. in
      `.env.example`) — everything works without one, using free rule-based
      logic; only add a key if you specifically want the upgraded behavior.
- [ ] Test the signup → KYC → post job → apply → escrow payment → release
      flow once end-to-end with two real accounts before opening it to the
      public.

## 5. What's still not built (genuinely, not silently)

- **AWS Textract** is real (hand-implemented SigV4 signing) but images-only, 5MB sync limit — no PDF support (needs the async API + S3 + polling).
- **Login lockout** is real now (5 attempts / 15 min, enforced server-side) — but this only protects the password-based path. There's no CAPTCHA.
- **Automated backups** run daily only if `SUPABASE_SERVICE_ROLE_KEY` is set. Restore is a safe merge (upsert by ID) — never a destructive wipe-and-replace, by deliberate design.
- **Homepage Builder** covers the 8 real sections that already exist on the homepage — it's reordering/hiding, not a true page-builder (can't add arbitrary new block types).
- **Email sending** needs `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (a Resend account + a verified sending domain) — without them, sends are logged as skipped, never silently pretended.
- **API Keys page** is intentionally read-only (shows configured/not + a masked last-4) — it does not store secrets in the database. Real values stay in your host's env vars, which is the correct place for them.
- **Fraud dashboard** is real now (payment-proof risk, KYC name-mismatch via OCR, repeated login failures) but only these three signals — no multi-account detection, no chargeback tracking.
- Translation is real (Google Cloud Translation API) when `GOOGLE_TRANSLATE_KEY` is set.
- Video scoring does real qualitative analysis against the job's questions when an LLM provider is configured; otherwise it's the original word-count heuristic.

## 6. New environment variables from this pass

Add to `.env` alongside the ones already documented:

- `GOOGLE_TRANSLATE_KEY` — real chat translation. Can reuse your `GOOGLE_VISION_KEY` if that Google Cloud project has the Translation API enabled too.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` — replaces the old single `AWS_TEXTRACT_KEY` slot, since real AWS auth needs an access key + secret, not one token.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — for real transactional emails (welcome, payment funded/released, KYC approved, dispute updates). Get a key at resend.com; `RESEND_FROM_EMAIL` must be an address on a domain you've verified with Resend.
- `SUPABASE_SERVICE_ROLE_KEY` was already documented as recommended — it's now required (not just recommended) if you want automated daily backups specifically.

## 7. A significant bug found and fixed during this pass

Every "paid AI upgrade" built in earlier sessions (CV screening, fraud-check,
price suggestions, message improvement) correctly *chose* Gemini or Groq
when configured, but then always called OpenAI's API regardless — meaning
these upgrades silently only worked if you specifically had an
`OPENAI_API_KEY` set, contradicting the earlier recommendation to run on
free-tier Groq. Fixed with a real multi-provider dispatcher
(`server/services/ai/llm-client.js`) that calls the correct API for
whichever provider was actually resolved.
