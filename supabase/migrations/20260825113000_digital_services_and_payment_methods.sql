-- Digital services use a project workflow; they never enter physical dispatch.
-- Payment method details are controlled by administrators, while provider secrets
-- remain server environment variables and are never stored in this database.

ALTER TABLE public.services ADD COLUMN IF NOT EXISTS revisions_included integer NOT NULL DEFAULT 2 CHECK (revisions_included >= 0);
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS deliverables jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS requirements_schema jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS terms_included text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS service_order_id uuid;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS service_order_id uuid;

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_code text NOT NULL UNIQUE, display_name text NOT NULL,
  method_type text NOT NULL CHECK (method_type IN ('online_provider','fiat_bank','crypto_wallet')),
  provider_code text, currency text NOT NULL DEFAULT 'NGN', network text,
  public_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  supported_purposes jsonb NOT NULL DEFAULT '["product","digital_service"]'::jsonb,
  is_enabled boolean NOT NULL DEFAULT false, priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.payment_methods(method_code, display_name, method_type, provider_code, currency, public_details, is_enabled, priority)
VALUES
  ('PAYSTACK','Paystack','online_provider','PAYSTACK','NGN','{"description":"Pay securely by card, bank transfer, USSD, or supported Paystack channels."}'::jsonb,false,10),
  ('MONNIFY','Monnify','online_provider','MONNIFY','NGN','{"description":"Pay securely through the configured Monnify checkout."}'::jsonb,false,20)
ON CONFLICT (method_code) DO NOTHING;
UPDATE public.payment_methods method
SET is_enabled = provider.is_enabled, updated_at = now()
FROM public.payment_provider_configs provider
WHERE method.provider_code = provider.provider_code;

CREATE TABLE IF NOT EXISTS public.digital_service_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), require_provider_approval boolean NOT NULL DEFAULT true,
  require_client_acceptance boolean NOT NULL DEFAULT true, allow_revisions boolean NOT NULL DEFAULT true,
  default_revisions integer NOT NULL DEFAULT 2 CHECK (default_revisions >= 0), allow_milestones boolean NOT NULL DEFAULT true,
  auto_release boolean NOT NULL DEFAULT false, max_file_size_mb integer NOT NULL DEFAULT 25,
  allowed_file_types jsonb NOT NULL DEFAULT '["image/*","video/*","application/pdf","application/zip"]'::jsonb,
  updated_by uuid REFERENCES auth.users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.digital_service_settings(id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.digital_service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_reference text NOT NULL UNIQUE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  title_snapshot text NOT NULL, price numeric(12,2) NOT NULL CHECK (price >= 0), currency text NOT NULL DEFAULT 'NGN',
  delivery_days integer NOT NULL CHECK (delivery_days > 0), revisions_included integer NOT NULL DEFAULT 2 CHECK (revisions_included >= 0),
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb, requirements_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  agreement_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, status text NOT NULL DEFAULT 'AWAITING_PROVIDER_ACCEPTANCE',
  provider_note text, client_note text, accepted_at timestamptz, paid_at timestamptz, due_at timestamptz,
  completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ADD CONSTRAINT payments_service_order_fk FOREIGN KEY (service_order_id) REFERENCES public.digital_service_orders(id) ON DELETE SET NULL;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_service_order_fk FOREIGN KEY (service_order_id) REFERENCES public.digital_service_orders(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.digital_service_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_order_id uuid NOT NULL REFERENCES public.digital_service_orders(id) ON DELETE RESTRICT,
  version_number integer NOT NULL, files jsonb NOT NULL DEFAULT '[]'::jsonb, note text, submitted_by uuid NOT NULL REFERENCES auth.users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(), client_accepted_at timestamptz, UNIQUE(service_order_id, version_number)
);
CREATE TABLE IF NOT EXISTS public.digital_service_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_order_id uuid NOT NULL REFERENCES public.digital_service_orders(id) ON DELETE RESTRICT,
  delivery_id uuid REFERENCES public.digital_service_deliveries(id) ON DELETE SET NULL,
  instructions text NOT NULL, requested_by uuid NOT NULL REFERENCES auth.users(id), requested_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.digital_service_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_order_id uuid NOT NULL REFERENCES public.digital_service_orders(id) ON DELETE RESTRICT,
  title text NOT NULL, description text, amount numeric(12,2) NOT NULL CHECK (amount > 0), deadline date,
  position integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'PENDING', client_approved_at timestamptz, provider_submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.digital_service_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_order_id uuid NOT NULL REFERENCES public.digital_service_orders(id) ON DELETE RESTRICT,
  event_code text NOT NULL, previous_status text, next_status text, actor_id uuid REFERENCES auth.users(id), details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS digital_service_orders_client_idx ON public.digital_service_orders(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS digital_service_orders_provider_idx ON public.digital_service_orders(provider_id, created_at DESC);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_service_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_service_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_service_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_service_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_service_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_active_payment_methods" ON public.payment_methods;
DROP POLICY IF EXISTS "admin_manage_payment_methods" ON public.payment_methods;
DROP POLICY IF EXISTS "digital_service_settings_read" ON public.digital_service_settings;
DROP POLICY IF EXISTS "admin_manage_digital_service_settings" ON public.digital_service_settings;
DROP POLICY IF EXISTS "digital_service_order_party_access" ON public.digital_service_orders;
DROP POLICY IF EXISTS "digital_service_delivery_party_access" ON public.digital_service_deliveries;
DROP POLICY IF EXISTS "digital_service_revision_party_access" ON public.digital_service_revisions;
DROP POLICY IF EXISTS "digital_service_milestone_party_access" ON public.digital_service_milestones;
DROP POLICY IF EXISTS "digital_service_event_party_read" ON public.digital_service_events;
CREATE POLICY "public_read_active_payment_methods" ON public.payment_methods FOR SELECT TO anon, authenticated USING (is_enabled);
CREATE POLICY "admin_manage_payment_methods" ON public.payment_methods FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "digital_service_settings_read" ON public.digital_service_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_manage_digital_service_settings" ON public.digital_service_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "digital_service_order_party_access" ON public.digital_service_orders FOR ALL TO authenticated USING (client_id = auth.uid() OR provider_id = auth.uid() OR public.is_admin()) WITH CHECK (client_id = auth.uid() OR provider_id = auth.uid() OR public.is_admin());
CREATE POLICY "digital_service_delivery_party_access" ON public.digital_service_deliveries FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.digital_service_orders o WHERE o.id = service_order_id AND (o.client_id = auth.uid() OR o.provider_id = auth.uid() OR public.is_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.digital_service_orders o WHERE o.id = service_order_id AND (o.client_id = auth.uid() OR o.provider_id = auth.uid() OR public.is_admin())));
CREATE POLICY "digital_service_revision_party_access" ON public.digital_service_revisions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.digital_service_orders o WHERE o.id = service_order_id AND (o.client_id = auth.uid() OR o.provider_id = auth.uid() OR public.is_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.digital_service_orders o WHERE o.id = service_order_id AND (o.client_id = auth.uid() OR o.provider_id = auth.uid() OR public.is_admin())));
CREATE POLICY "digital_service_milestone_party_access" ON public.digital_service_milestones FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.digital_service_orders o WHERE o.id = service_order_id AND (o.client_id = auth.uid() OR o.provider_id = auth.uid() OR public.is_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.digital_service_orders o WHERE o.id = service_order_id AND (o.client_id = auth.uid() OR o.provider_id = auth.uid() OR public.is_admin())));
CREATE POLICY "digital_service_event_party_read" ON public.digital_service_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.digital_service_orders o WHERE o.id = service_order_id AND (o.client_id = auth.uid() OR o.provider_id = auth.uid() OR public.is_admin())));
