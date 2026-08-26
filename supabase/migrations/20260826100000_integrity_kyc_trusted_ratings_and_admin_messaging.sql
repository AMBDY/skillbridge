-- Enforce marketplace ownership rules at the database layer as well as the API.
CREATE OR REPLACE FUNCTION public.prevent_self_job_participation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.jobs WHERE id = NEW.job_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'A job owner cannot bid on their own job.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS prevent_self_bid ON public.job_bids;
CREATE TRIGGER prevent_self_bid BEFORE INSERT OR UPDATE ON public.job_bids FOR EACH ROW EXECUTE FUNCTION public.prevent_self_job_participation();
CREATE OR REPLACE FUNCTION public.prevent_self_application()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.jobs WHERE id = NEW.job_id AND user_id = NEW.applicant_id) THEN
    RAISE EXCEPTION 'A job owner cannot apply to their own job.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS prevent_self_application ON public.job_applications;
CREATE TRIGGER prevent_self_application BEFORE INSERT OR UPDATE ON public.job_applications FOR EACH ROW EXECUTE FUNCTION public.prevent_self_application();
CREATE OR REPLACE FUNCTION public.prevent_self_product_order()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.buyer_id = NEW.seller_id THEN RAISE EXCEPTION 'A seller cannot buy their own product.'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS prevent_self_product_order ON public.product_orders;
CREATE TRIGGER prevent_self_product_order BEFORE INSERT OR UPDATE ON public.product_orders FOR EACH ROW EXECUTE FUNCTION public.prevent_self_product_order();

-- Duplicate KYC/account signals are stored as review flags, never silently rejected.
ALTER TABLE public.kyc_submissions ADD COLUMN IF NOT EXISTS normalized_full_name text;
ALTER TABLE public.kyc_submissions ADD COLUMN IF NOT EXISTS duplicate_risk text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.kyc_submissions ADD COLUMN IF NOT EXISTS duplicate_matches jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE IF NOT EXISTS public.kyc_duplicate_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kyc_submission_id uuid NOT NULL REFERENCES public.kyc_submissions(id) ON DELETE CASCADE,
  matched_submission_id uuid REFERENCES public.kyc_submissions(id) ON DELETE SET NULL, match_type text NOT NULL,
  confidence numeric(5,2) NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'open', details jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid REFERENCES auth.users(id), reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kyc_duplicate_checks_unique_match ON public.kyc_duplicate_checks(kyc_submission_id, matched_submission_id, match_type);
ALTER TABLE public.kyc_duplicate_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_kyc_duplicate_checks" ON public.kyc_duplicate_checks;
CREATE POLICY "admin_manage_kyc_duplicate_checks" ON public.kyc_duplicate_checks FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Trusted rating aggregates use only reviews submitted by KYC-approved accounts.
CREATE OR REPLACE FUNCTION public.recalculate_trusted_product_rating(target_product uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE avg_rating numeric; rating_count integer;
BEGIN
  SELECT COALESCE(avg(r.rating),0), count(*) INTO avg_rating, rating_count
  FROM public.product_reviews r JOIN public.profiles p ON p.user_id = r.buyer_id
  WHERE r.product_id = target_product AND p.kyc_level >= 3;
  UPDATE public.products SET rating = round(avg_rating,2), review_count = rating_count WHERE id = target_product;
END; $$;
CREATE OR REPLACE FUNCTION public.trusted_product_review_refresh()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recalculate_trusted_product_rating(COALESCE(NEW.product_id, OLD.product_id));
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS trusted_product_review_refresh_trigger ON public.product_reviews;
CREATE TRIGGER trusted_product_review_refresh_trigger AFTER INSERT OR UPDATE OR DELETE ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION public.trusted_product_review_refresh();
CREATE OR REPLACE FUNCTION public.recalculate_profile_metrics(target_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE profile_role text; total_count integer := 0; success_count integer := 0; avg_rating numeric := 0; rating_count integer := 0;
BEGIN
  SELECT role INTO profile_role FROM public.profiles WHERE user_id = target_user;
  IF profile_role = 'client' THEN SELECT count(*), count(*) FILTER (WHERE status IN ('assigned','completed')) INTO total_count, success_count FROM public.jobs WHERE user_id = target_user;
  ELSE SELECT count(*), count(*) FILTER (WHERE status = 'completed') INTO total_count, success_count FROM public.jobs WHERE assigned_to = target_user; END IF;
  SELECT COALESCE(avg(r.stars),0), count(*) INTO avg_rating, rating_count FROM public.reviews r JOIN public.profiles reviewer ON reviewer.user_id = r.reviewer_id WHERE r.reviewee_id = target_user AND reviewer.kyc_level >= 3;
  UPDATE public.profiles SET completion_rate = CASE WHEN total_count = 0 THEN 0 ELSE round((success_count::numeric / total_count::numeric) * 100, 2) END, rating = round(avg_rating, 2), review_count = rating_count WHERE user_id = target_user;
END; $$;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT user_id FROM public.profiles LOOP PERFORM public.recalculate_profile_metrics(p.user_id); END LOOP; END $$;

CREATE TABLE IF NOT EXISTS public.admin_message_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, body text NOT NULL, reason_code text NOT NULL,
  custom_reason text, delivery_mode text NOT NULL DEFAULT 'manual' CHECK (delivery_mode IN ('manual','automatic')),
  target_role text, target_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  target_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb, media_url text, is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id), sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_message_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_message_campaigns" ON public.admin_message_campaigns;
CREATE POLICY "admin_manage_message_campaigns" ON public.admin_message_campaigns FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
