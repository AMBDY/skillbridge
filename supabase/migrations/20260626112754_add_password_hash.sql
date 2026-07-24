/*
# Add password_hash to profiles

1. Modified Tables
- `profiles`: add `password_hash` text column for custom bcrypt auth (Supabase auth is used for the user record, but we store a hash for the custom signin endpoint to verify against without exposing the auth admin API to the client).
2. Security
- RLS unchanged. The column is only ever read server-side via the service role.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash text;
