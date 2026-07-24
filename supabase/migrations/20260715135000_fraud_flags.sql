/*
# Fraud Flags — real signals, not a demo button

The existing "Fraud Monitoring" admin tab just ran a manual demo check with
empty data — it never looked at anything real. This table gets populated
automatically from actual signals:
  - High/medium risk deterministic fraud-check result on a submitted payment proof
  - KYC selfie where the OCR'd text doesn't contain the submitted full name
    (only meaningful now that OCR is real — see server/services/ai/ocr.js)
  - Repeated failed login attempts triggering lockout
*/

CREATE TABLE IF NOT EXISTS fraud_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_type text NOT NULL,
  details jsonb DEFAULT '{}',
  risk_score numeric(5,2) DEFAULT 0,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE fraud_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_all_fraud_flags" ON fraud_flags;
CREATE POLICY "admin_all_fraud_flags" ON fraud_flags FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_fraud_flags_resolved ON fraud_flags(resolved, created_at DESC);

CREATE OR REPLACE FUNCTION create_fraud_flag(p_user_id uuid, p_flag_type text, p_details jsonb, p_risk_score numeric)
RETURNS void AS $$
  INSERT INTO fraud_flags (user_id, flag_type, details, risk_score) VALUES (p_user_id, p_flag_type, p_details, p_risk_score);
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_fraud_flag(uuid, text, jsonb, numeric) TO authenticated, anon;
