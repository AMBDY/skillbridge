-- Physical product lifecycle: additive migration, safe for existing listings.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_code text UNIQUE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS fulfillment_type text NOT NULL DEFAULT 'ready_made' CHECK (fulfillment_type IN ('ready_made','made_to_order','custom_design','made_to_order_measurements'));
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS measurement_template_id uuid;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supported_sizes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS production_days integer;

INSERT INTO public.platform_roles (role_key, name, description, permissions, is_system)
VALUES ('logistics_operator', 'Logistics Operator', 'Can view assigned shipment operations and record tracking events.', '["manage_logistics"]'::jsonb, false)
ON CONFLICT (role_key) DO UPDATE SET permissions = EXCLUDED.permissions, description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS public.measurement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  name text NOT NULL, description text, guide_image_url text, is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.measurement_template_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), template_id uuid NOT NULL REFERENCES public.measurement_templates(id) ON DELETE CASCADE,
  field_name text NOT NULL, unit text NOT NULL DEFAULT 'cm', description text, instructions text, guide_image_url text,
  is_required boolean NOT NULL DEFAULT false, default_value text, sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.product_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_code text NOT NULL UNIQUE,
  buyer_id uuid NOT NULL REFERENCES auth.users(id), seller_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'ORDER_CREATED', currency text NOT NULL DEFAULT 'NGN', subtotal numeric(12,2) NOT NULL DEFAULT 0,
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0, total_amount numeric(12,2) NOT NULL DEFAULT 0,
  delivery_address jsonb NOT NULL DEFAULT '{}'::jsonb, buyer_contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  seller_notes text, buyer_notes text, agreement_id uuid REFERENCES public.agreements(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.product_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.product_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id), product_code text NOT NULL, seller_id uuid NOT NULL REFERENCES auth.users(id),
  title_snapshot text NOT NULL, image_snapshot text, quantity integer NOT NULL CHECK (quantity > 0), unit_price numeric(12,2) NOT NULL,
  fulfillment_type text NOT NULL, production_days integer, custom_specification_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.custom_specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_item_id uuid NOT NULL REFERENCES public.product_order_items(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','seller_accepted','buyer_accepted','changes_requested','locked')),
  reference_images jsonb NOT NULL DEFAULT '[]'::jsonb, measurement_image_url text, markers jsonb NOT NULL DEFAULT '[]'::jsonb,
  measurements jsonb NOT NULL DEFAULT '[]'::jsonb, buyer_instructions text, design_instructions text,
  submitted_by uuid NOT NULL REFERENCES auth.users(id), seller_accepted_at timestamptz, buyer_accepted_at timestamptz, locked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_item_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.logistics_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_code text NOT NULL UNIQUE, company_name text NOT NULL, contact_name text, contact_email text, contact_phone text,
  api_base_url text, api_config jsonb NOT NULL DEFAULT '{}'::jsonb, webhook_secret_hint text, webhook_secret_encrypted text,
  supported_locations jsonb NOT NULL DEFAULT '[]'::jsonb, supported_services jsonb NOT NULL DEFAULT '[]'::jsonb,
  integration_mode text NOT NULL DEFAULT 'manual' CHECK (integration_mode IN ('manual','api')), is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shipment_code text NOT NULL UNIQUE, order_id uuid NOT NULL REFERENCES public.product_orders(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.logistics_providers(id) ON DELETE SET NULL, tracking_number text, status text NOT NULL DEFAULT 'READY_FOR_DISPATCH',
  current_location text, estimated_delivery_at timestamptz, dispatch_method text, dispatch_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  dispatch_images jsonb NOT NULL DEFAULT '[]'::jsonb, dispatched_at timestamptz, delivered_at timestamptz, created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shipments_provider_tracking_unique ON public.shipments(provider_id, tracking_number) WHERE tracking_number IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  provider_event_id text, status text NOT NULL, location text, description text, event_at timestamptz NOT NULL DEFAULT now(), source text NOT NULL CHECK (source IN ('manual','provider','admin')), created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tracking_events_provider_dedupe ON public.tracking_events(shipment_id, provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.product_transaction_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid REFERENCES public.product_orders(id) ON DELETE CASCADE, shipment_id uuid REFERENCES public.shipments(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id), action text NOT NULL, previous_value jsonb, next_value jsonb, reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_item_id uuid NOT NULL UNIQUE REFERENCES public.product_order_items(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id), buyer_id uuid NOT NULL REFERENCES auth.users(id), rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5), comment text, image_urls jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ADD CONSTRAINT products_measurement_template_fk FOREIGN KEY (measurement_template_id) REFERENCES public.measurement_templates(id) ON DELETE SET NULL;
ALTER TABLE public.product_order_items ADD CONSTRAINT order_items_custom_spec_fk FOREIGN KEY (custom_specification_id) REFERENCES public.custom_specifications(id) ON DELETE SET NULL;

ALTER TABLE public.product_orders ENABLE ROW LEVEL SECURITY; ALTER TABLE public.product_order_items ENABLE ROW LEVEL SECURITY; ALTER TABLE public.custom_specifications ENABLE ROW LEVEL SECURITY; ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY; ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY; ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY; ALTER TABLE public.measurement_templates ENABLE ROW LEVEL SECURITY; ALTER TABLE public.measurement_template_fields ENABLE ROW LEVEL SECURITY; ALTER TABLE public.logistics_providers ENABLE ROW LEVEL SECURITY; ALTER TABLE public.product_transaction_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_party_read" ON public.product_orders FOR SELECT TO authenticated USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.is_admin());
CREATE POLICY "order_party_insert" ON public.product_orders FOR INSERT TO authenticated WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "order_party_update" ON public.product_orders FOR UPDATE TO authenticated USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.is_admin());
CREATE POLICY "order_item_party_read" ON public.product_order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.product_orders o WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid() OR public.is_admin())));
CREATE POLICY "order_item_party_insert" ON public.product_order_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.product_orders o WHERE o.id = order_id AND o.buyer_id = auth.uid()));
CREATE POLICY "spec_party_read" ON public.custom_specifications FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.product_order_items i JOIN public.product_orders o ON o.id = i.order_id WHERE i.id = order_item_id AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid() OR public.is_admin())));
CREATE POLICY "spec_buyer_insert" ON public.custom_specifications FOR INSERT TO authenticated WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "spec_party_update" ON public.custom_specifications FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.product_order_items i JOIN public.product_orders o ON o.id = i.order_id WHERE i.id = order_item_id AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid() OR public.is_admin())));
CREATE POLICY "shipment_party_read" ON public.shipments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.product_orders o WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid() OR public.is_admin())));
CREATE POLICY "shipment_seller_manage" ON public.shipments FOR ALL TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.product_orders o WHERE o.id = order_id AND o.seller_id = auth.uid())) WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.product_orders o WHERE o.id = order_id AND o.seller_id = auth.uid()));
CREATE POLICY "tracking_party_read" ON public.tracking_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.shipments s JOIN public.product_orders o ON o.id = s.order_id WHERE s.id = shipment_id AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid() OR public.is_admin())));
CREATE POLICY "tracking_operator_insert" ON public.tracking_events FOR INSERT TO authenticated WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.shipments s JOIN public.product_orders o ON o.id = s.order_id WHERE s.id = shipment_id AND o.seller_id = auth.uid()));
CREATE POLICY "public_read_product_reviews" ON public.product_reviews FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "buyer_insert_product_review" ON public.product_reviews FOR INSERT TO authenticated WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "admin_manage_templates" ON public.measurement_templates FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_manage_template_fields" ON public.measurement_template_fields FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "template_public_read" ON public.measurement_templates FOR SELECT TO anon, authenticated USING (is_active = true OR public.is_admin());
CREATE POLICY "template_field_public_read" ON public.measurement_template_fields FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin_manage_logistics" ON public.logistics_providers FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "party_audit_read" ON public.product_transaction_audit FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.product_orders o WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())));
CREATE POLICY "party_audit_insert" ON public.product_transaction_audit FOR INSERT TO authenticated WITH CHECK (public.is_admin() OR actor_id = auth.uid());

CREATE INDEX IF NOT EXISTS products_product_code_idx ON public.products(product_code); CREATE INDEX IF NOT EXISTS product_orders_order_code_idx ON public.product_orders(order_code); CREATE INDEX IF NOT EXISTS product_orders_buyer_idx ON public.product_orders(buyer_id, created_at DESC); CREATE INDEX IF NOT EXISTS product_orders_seller_idx ON public.product_orders(seller_id, created_at DESC); CREATE INDEX IF NOT EXISTS shipments_order_idx ON public.shipments(order_id); CREATE INDEX IF NOT EXISTS tracking_events_shipment_idx ON public.tracking_events(shipment_id, event_at);
