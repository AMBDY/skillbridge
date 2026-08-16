const router = require('express').Router();
const { supabase, createAuthedClient } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');
const { notify } = require('../utils/notify');
const { sendEmail } = require('../utils/email');
const { deterministicRiskScore } = require('../services/ai/fraud-score');

function authedClient(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  return createAuthedClient(token);
}

// Create payment (client pays into escrow, or pays a platform fee like AI screening)
router.post('/', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { job_id, agreement_id, worker_id, amount, payment_method, proof_url, proof_meta, purpose } = req.body;
  const paymentPurpose = ['escrow', 'ai_screening', 'subscription'].includes(purpose) ? purpose : 'escrow';
  let fee = 0;
  if (paymentPurpose === 'escrow') {
    const { data: settings } = await supabase.from('platform_settings')
      .select('service_fee_percent, commission_freelancer, commission_worker, commission_seller').limit(1).maybeSingle();
    let feePercent = settings?.service_fee_percent || 10;
    if (worker_id) {
      const { data: workerProfile } = await supabase.from('profiles').select('role').eq('user_id', worker_id).maybeSingle();
      const roleCommission = { freelancer: settings?.commission_freelancer, worker: settings?.commission_worker, seller: settings?.commission_seller }[workerProfile?.role];
      if (roleCommission != null) feePercent = roleCommission;
    }
    fee = +(amount * feePercent / 100).toFixed(2);
  }
  const { data, error } = await c.from('payments').insert({
    job_id, agreement_id, client_id: req.user.id, worker_id, amount,
    service_fee: fee, payment_method, proof_url, proof_meta, purpose: paymentPurpose,
    status: paymentPurpose === 'escrow' ? 'in_escrow' : 'pending'
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  if (paymentPurpose === 'escrow' && worker_id) {
    await notify(c, { userId: worker_id, type: 'payment_funded', title: 'Payment funded', body: `A client funded ${amount} into escrow for your job`, link: '/payments.html' });
    const { data: workerProfile } = await supabase.from('profiles').select('email, display_name').eq('user_id', worker_id).maybeSingle();
    if (workerProfile?.email) sendEmail('payment_funded', workerProfile.email, { name: workerProfile.display_name, amount }).catch(() => {});
  }
  if (proof_url) {
    const { data: clientProfile } = await supabase.from('profiles').select('kyc_level').eq('user_id', req.user.id).maybeSingle();
    const risk = deterministicRiskScore({ amount, reason: JSON.stringify(proof_meta || ''), user_kyc_level: clientProfile?.kyc_level });
    if (risk.risk !== 'low') {
      await c.rpc('create_fraud_flag', { p_user_id: req.user.id, p_flag_type: 'payment_proof', p_details: { payment_id: data.id, amount, risk_score: risk.score }, p_risk_score: risk.score }).catch(() => {});
    }
  }
  res.json(data);
});

// List my payments
router.get('/', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('payments').select('*, job:jobs(title), agreement:agreements(*)')
    .or(`client_id.eq.${req.user.id},worker_id.eq.${req.user.id}`)
    .order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Client marks received (only 1hr after acceptance)
router.put('/:id/received', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data: payment } = await c.from('payments').select('*').eq('id', req.params.id).maybeSingle();
  if (!payment) return res.status(404).json({ error: 'Not found' });
  if (payment.client_id !== req.user.id) return res.status(403).json({ error: 'Only client can mark received' });
  const acceptedAt = payment.received_at || payment.created_at;
  const elapsed = (Date.now() - new Date(acceptedAt).getTime()) / 3600000;
  if (elapsed < 1) return res.status(400).json({ error: 'Received button activates 1 hour after acceptance' });
  const { data, error } = await c.from('payments').update({ received_at: new Date().toISOString(), status: 'released' }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Upload proof
router.put('/:id/proof', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { proof_url, proof_meta } = req.body;
  const { data, error } = await c.from('payments').update({ proof_url, proof_meta }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
