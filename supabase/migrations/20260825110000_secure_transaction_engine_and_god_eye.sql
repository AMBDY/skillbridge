-- Additive transaction engine. SkillBridge references and events are the source
-- of truth; provider references are evidence only and never primary keys.
ALTER TABLE public.product_orders ADD COLUMN IF NOT EXISTS internal_order_reference text;
ALTER TABLE public.product_orders ADD COLUMN IF NOT EXISTS order_state text;
ALTER TABLE public.product_orders ADD COLUMN IF NOT EXISTS seller_approved_at timestamptz;
ALTER TABLE public.product_orders ADD COLUMN IF NOT EXISTS buyer_confirmed_at timestamptz;
ALTER TABLE public.product_orders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.product_orders ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);
UPDATE public.product_orders SET internal_order_reference = COALESCE(internal_order_reference, order_code), order_state = COALESCE(order_state, status) WHERE internal_order_reference IS NULL OR order_state IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_orders_internal_reference_unique ON public.product_orders(internal_order_reference) WHERE internal_order_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_code text NOT NULL UNIQUE,
  display_name text NOT NULL, is_enabled boolean NOT NULL DEFAULT false, is_default boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100, countries jsonb NOT NULL DEFAULT '[]'::jsonb,
  supported_currencies jsonb NOT NULL DEFAULT '["NGN"]'::jsonb,
  secret_env_key text NOT NULL, webhook_secret_env_key text, verification_mode text NOT NULL DEFAULT 'server_verify',
  routing_rules jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.payment_provider_configs(provider_code, display_name, secret_env_key, webhook_secret_env_key)
VALUES ('MONNIFY','Monnify','MONNIFY_SECRET_KEY','MONNIFY_WEBHOOK_SECRET'), ('PAYSTACK','Paystack','PAYSTACK_SECRET_KEY','PAYSTACK_WEBHOOK_SECRET'), ('ESCROW','Escrow Provider','ESCROW_PROVIDER_SECRET','ESCROW_PROVIDER_WEBHOOK_SECRET')
ON CONFLICT (provider_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.product_orders(id) ON DELETE RESTRICT, agreement_id uuid REFERENCES public.agreements(id) ON DELETE SET NULL,
  buyer_id uuid NOT NULL REFERENCES auth.users(id), seller_id uuid REFERENCES auth.users(id),
  skillbridge_reference text NOT NULL UNIQUE, provider_code text NOT NULL, provider_reference text, provider_transaction_id text,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0), currency text NOT NULL DEFAULT 'NGN', status text NOT NULL DEFAULT 'PAYMENT_CREATED',
  verification_status text NOT NULL DEFAULT 'UNVERIFIED', metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz, expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_provider_reference_unique ON public.payment_transactions(provider_code, provider_reference) WHERE provider_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_code text NOT NULL, provider_event_id text, provider_reference text,
  event_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, payload_hash text NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false, processing_status text NOT NULL DEFAULT 'RECEIVED', processing_error text,
  received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_dedup_event ON public.payment_webhook_events(provider_code, provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_dedup_hash ON public.payment_webhook_events(provider_code, payload_hash);

CREATE TABLE IF NOT EXISTS public.transaction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid REFERENCES public.product_orders(id) ON DELETE RESTRICT,
  payment_transaction_id uuid REFERENCES public.payment_transactions(id) ON DELETE RESTRICT, event_code text NOT NULL,
  previous_state text, next_state text, actor_type text NOT NULL DEFAULT 'system', actor_id uuid REFERENCES auth.users(id),
  source text NOT NULL DEFAULT 'skillbridge', details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_agreement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.product_orders(id) ON DELETE RESTRICT,
  agreement_id uuid REFERENCES public.agreements(id) ON DELETE SET NULL, version_number integer NOT NULL,
  buyer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, seller_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, terms_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'DRAFT', buyer_accepted_at timestamptz, seller_accepted_at timestamptz, locked_at timestamptz,
  created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(order_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.automation_controls (
  control_key text PRIMARY KEY, is_automatic boolean NOT NULL DEFAULT true, requires_admin_approval boolean NOT NULL DEFAULT false,
  allow_manual_trigger boolean NOT NULL DEFAULT true, recipients jsonb NOT NULL DEFAULT '[]'::jsonb, message_template text, updated_by uuid REFERENCES auth.users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.automation_controls(control_key, is_automatic, requires_admin_approval, recipients) VALUES
  ('payment_verified_notification', true, false, '["buyer","seller","admin"]'::jsonb),
  ('seller_dispatch_instruction', true, false, '["seller","admin"]'::jsonb),
  ('logistics_notification', false, false, '["logistics","admin"]'::jsonb)
ON CONFLICT (control_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.top_seller_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), ai_recommendations_enabled boolean NOT NULL DEFAULT true,
  automatic_ranking_enabled boolean NOT NULL DEFAULT true, manual_curation_enabled boolean NOT NULL DEFAULT true,
  ranking_weights jsonb NOT NULL DEFAULT '{"sales":30,"ratings":20,"delivery":15,"satisfaction":10,"repeat_buyers":5,"refunds":10,"disputes":5,"recent_activity":5}'::jsonb,
  updated_by uuid REFERENCES auth.users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.top_seller_settings(id) VALUES (true) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.top_seller_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  display_position integer NOT NULL, selection_source text NOT NULL DEFAULT 'manual' CHECK (selection_source IN ('manual','automatic')),
  promotion_ends_at timestamptz, reason text, selected_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS top_seller_position_unique ON public.top_seller_features(display_position);
CREATE TABLE IF NOT EXISTS public.emergency_controls (
  control_key text PRIMARY KEY, is_active boolean NOT NULL DEFAULT false, reason text,
  activated_by uuid REFERENCES auth.users(id), activated_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.emergency_controls(control_key) VALUES ('pause_new_orders'),('pause_new_listings'),('pause_withdrawals'),('pause_payment_initialization'),('pause_dispatch_automation') ON CONFLICT (control_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.reorder_featured_top_sellers(p_user_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item uuid; position_number integer := 1;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  UPDATE public.top_seller_features SET display_position = display_position + 100000, updated_at = now();
  FOREACH item IN ARRAY p_user_ids LOOP
    UPDATE public.top_seller_features SET display_position = position_number, updated_at = now() WHERE user_id = item;
    position_number := position_number + 1;
  END LOOP;
  WITH remaining AS (
    SELECT id, row_number() OVER (ORDER BY display_position, created_at) AS row_position
    FROM public.top_seller_features WHERE display_position >= 100000
  )
  UPDATE public.top_seller_features feature
  SET display_position = position_number + remaining.row_position::integer, updated_at = now()
  FROM remaining WHERE feature.id = remaining.id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.reorder_featured_top_sellers(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_featured_top_sellers(uuid[]) TO authenticated;

ALTER TABLE public.payment_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_agreement_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.top_seller_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.top_seller_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_controls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_transaction_party_read" ON public.payment_transactions;
DROP POLICY IF EXISTS "buyer_create_payment_transaction" ON public.payment_transactions;
DROP POLICY IF EXISTS "transaction_event_party_read" ON public.transaction_events;
DROP POLICY IF EXISTS "transaction_event_party_insert" ON public.transaction_events;
DROP POLICY IF EXISTS "agreement_version_party_read" ON public.order_agreement_versions;
DROP POLICY IF EXISTS "agreement_version_party_insert" ON public.order_agreement_versions;
DROP POLICY IF EXISTS "agreement_version_party_update" ON public.order_agreement_versions;
DROP POLICY IF EXISTS "top_sellers_public_read" ON public.top_seller_features;
DROP POLICY IF EXISTS "admin_manage_payment_provider_configs" ON public.payment_provider_configs;
DROP POLICY IF EXISTS "admin_manage_payment_transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "admin_manage_webhooks" ON public.payment_webhook_events;
DROP POLICY IF EXISTS "admin_manage_transaction_events" ON public.transaction_events;
DROP POLICY IF EXISTS "admin_manage_order_agreement_versions" ON public.order_agreement_versions;
DROP POLICY IF EXISTS "admin_manage_automation_controls" ON public.automation_controls;
DROP POLICY IF EXISTS "admin_manage_top_seller_settings" ON public.top_seller_settings;
DROP POLICY IF EXISTS "admin_manage_top_seller_features" ON public.top_seller_features;
DROP POLICY IF EXISTS "admin_manage_emergency_controls" ON public.emergency_controls;
CREATE POLICY "payment_transaction_party_read" ON public.payment_transactions FOR SELECT TO authenticated USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.is_admin());
CREATE POLICY "buyer_create_payment_transaction" ON public.payment_transactions FOR INSERT TO authenticated WITH CHECK (buyer_id = auth.uid() AND status = 'PAYMENT_CREATED' AND verification_status = 'UNVERIFIED');
CREATE POLICY "transaction_event_party_read" ON public.transaction_events FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.product_orders o WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())));
CREATE POLICY "transaction_event_party_insert" ON public.transaction_events FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.product_orders o WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())));
CREATE POLICY "agreement_version_party_read" ON public.order_agreement_versions FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.product_orders o WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())));
CREATE POLICY "agreement_version_party_insert" ON public.order_agreement_versions FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.product_orders o WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())));
CREATE POLICY "agreement_version_party_update" ON public.order_agreement_versions FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.product_orders o WHERE o.id = order_id AND o.buyer_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.product_orders o WHERE o.id = order_id AND o.buyer_id = auth.uid()));
CREATE POLICY "top_sellers_public_read" ON public.top_seller_features FOR SELECT TO anon, authenticated USING (promotion_ends_at IS NULL OR promotion_ends_at > now());
CREATE POLICY "admin_manage_payment_provider_configs" ON public.payment_provider_configs FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_manage_payment_transactions" ON public.payment_transactions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_manage_webhooks" ON public.payment_webhook_events FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_manage_transaction_events" ON public.transaction_events FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_manage_order_agreement_versions" ON public.order_agreement_versions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_manage_automation_controls" ON public.automation_controls FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_manage_top_seller_settings" ON public.top_seller_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_manage_top_seller_features" ON public.top_seller_features FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_manage_emergency_controls" ON public.emergency_controls FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.write_transaction_event(p_order_id uuid, p_payment_transaction_id uuid, p_event_code text, p_previous_state text, p_next_state text, p_actor_type text, p_actor_id uuid, p_source text, p_details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.transaction_events(order_id, payment_transaction_id, event_code, previous_state, next_state, actor_type, actor_id, source, details)
  VALUES (p_order_id, p_payment_transaction_id, p_event_code, p_previous_state, p_next_state, COALESCE(p_actor_type, 'system'), p_actor_id, COALESCE(p_source, 'skillbridge'), COALESCE(p_details, '{}'::jsonb));
END; $$;
REVOKE EXECUTE ON FUNCTION public.write_transaction_event(uuid,uuid,text,text,text,text,uuid,text,jsonb) FROM PUBLIC;
