/*
# CRITICAL: lock down self-editable profile fields

PUT /marketplace/profile did `profiles.update(req.body)` with no field
whitelist — any authenticated user could include `role: "admin"`,
`kyc_level: 3`, `subscription_tier: "elite"`, or `account_status: "active"`
in their own profile update and it would silently succeed. This is a real
privilege-escalation vulnerability, not a UX gap.

Fixed in two layers:
1. API layer (server/routes/marketplace.js) — now whitelists which fields a
   user can send on their own profile.
2. THIS migration — a trigger that is the real backstop. Even if the API
   whitelist is ever bypassed, weakened, or a new endpoint is added without
   remembering this rule, the database itself refuses to let a non-admin
   change these fields on their own row.
*/

CREATE OR REPLACE FUNCTION public.protect_privileged_profile_fields()
RETURNS trigger AS $$
BEGIN
  -- Admins can change anything (e.g. via the superadmin panel)
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Anyone else editing their own row cannot change these fields —
  -- silently keep them at their old value rather than erroring, so a
  -- normal "save profile" request that happens to include an unrelated
  -- field doesn't hard-fail.
  NEW.role := OLD.role;
  NEW.kyc_level := OLD.kyc_level;
  NEW.subscription_tier := OLD.subscription_tier;
  NEW.account_status := OLD.account_status;
  NEW.rating := OLD.rating;
  NEW.review_count := OLD.review_count;
  NEW.completion_rate := OLD.completion_rate;
  NEW.is_online := OLD.is_online;
  NEW.user_id := OLD.user_id;
  NEW.created_at := OLD.created_at;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_privileged_profile_fields_trigger ON profiles;
CREATE TRIGGER protect_privileged_profile_fields_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_privileged_profile_fields();
