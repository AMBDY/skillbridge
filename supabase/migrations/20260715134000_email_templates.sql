/*
# Email Templates

Real templates for the transactional emails named in the original spec
(welcome, payment received, KYC approved, etc.), with {{variable}}
substitution. Actually sending requires a provider key (RESEND_API_KEY) —
without one, sends are logged as "skipped" rather than silently pretending
to work, so this is never a silent no-op.
*/

CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  subject text NOT NULL,
  body text NOT NULL,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_all_email_templates" ON email_templates;
CREATE POLICY "admin_all_email_templates" ON email_templates FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO email_templates (template_key, subject, body) VALUES
  ('welcome', 'Welcome to {{site_name}}!', 'Hi {{name}},\n\nWelcome to {{site_name}} — your account is ready. Start exploring services, products, and jobs right away.\n\nThe {{site_name}} Team'),
  ('payment_funded', 'Payment funded — {{site_name}}', 'Hi {{name}},\n\nA payment of {{amount}} has been funded into escrow for your job. It will be released once the client confirms delivery.\n\nThe {{site_name}} Team'),
  ('payment_released', 'Payment released — {{site_name}}', 'Hi {{name}},\n\n{{amount}} has been released to you. Thanks for using {{site_name}}!\n\nThe {{site_name}} Team'),
  ('kyc_approved', 'Identity verified — {{site_name}}', 'Hi {{name}},\n\nYour identity verification has been approved. You now have expanded access on {{site_name}}.\n\nThe {{site_name}} Team'),
  ('dispute_update', 'Dispute update — {{site_name}}', 'Hi {{name}},\n\nThere''s an update on your dispute: {{message}}\n\nThe {{site_name}} Team')
ON CONFLICT (template_key) DO NOTHING;
