const router = require('express').Router();
const { supabase, createAuthedClient } = require('../utils/db');
const { authMiddleware, hasPermission } = require('../middleware/auth');
const { notify } = require('../utils/notify');
const { sendEmail } = require('../utils/email');
const { deterministicRiskScore } = require('../services/ai/fraud-score');
const paystack = require('../services/payments/paystack');
const monnify = require('../services/payments/monnify');
const crypto = require('crypto');

function authedClient(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  return createAuthedClient(token);
}

async function providerEnabled(code) { const { data } = await supabase.from('payment_provider_configs').select('is_enabled').eq('provider_code', code).maybeSingle(); return !!data?.is_enabled; }
async function emergencyActive(key) { const { data } = await supabase.from('emergency_controls').select('is_active').eq('control_key', key).maybeSingle(); return !!data?.is_active; }
async function recordEvent(orderId, transactionId, eventCode, previous, next, details = {}) { await supabase.from('transaction_events').insert({ order_id: orderId, payment_transaction_id: transactionId, event_code: eventCode, previous_state: previous || null, next_state: next || null, actor_type: 'system', source: 'payment_engine', details }); }

// Payment initialization is server-only: the browser receives a hosted checkout URL,
// never a provider secret. A redirect does not change payment/order state.
router.post('/product-orders/:orderId/initialize/paystack', authMiddleware, async (req, res) => {
  try {
    if (await emergencyActive('pause_payment_initialization')) return res.status(503).json({ error: 'Payment initialization is temporarily paused by platform operations.' });
    if (!await providerEnabled('PAYSTACK')) return res.status(503).json({ error: 'Paystack is not enabled by the superadmin.' });
    const c = authedClient(req);
    const { data: order } = await c.from('product_orders').select('*, payment_transactions(*)').eq('id', req.params.orderId).maybeSingle();
    if (!order || order.buyer_id !== req.user.id) return res.status(404).json({ error: 'Order not found.' });
    if (order.order_state !== 'AWAITING_PAYMENT' && order.status !== 'AWAITING_PAYMENT') return res.status(409).json({ error: 'This order is not ready for payment.' });
    const transaction = (order.payment_transactions || [])[0];
    if (!transaction) return res.status(409).json({ error: 'Internal payment transaction has not been created.' });
    const result = await paystack.initialize({ email: req.user.email, amount: transaction.amount, reference: transaction.skillbridge_reference, callbackUrl: `${req.protocol}://${req.get('host')}/payment.html?order=${order.id}`, metadata: { skillbridge_order_id: order.id, skillbridge_reference: transaction.skillbridge_reference } });
    await c.from('payment_transactions').update({ provider_code: 'PAYSTACK', provider_reference: result.reference, status: 'PAYMENT_INITIALIZED', metadata: { authorization_url: result.authorization_url, access_code: result.access_code } }).eq('id', transaction.id);
    await c.from('product_orders').update({ status: 'PAYMENT_PROCESSING', order_state: 'PAYMENT_PROCESSING', updated_at: new Date().toISOString() }).eq('id', order.id);
    await recordEvent(order.id, transaction.id, 'PAYMENT_INITIALIZED', transaction.status, 'PAYMENT_INITIALIZED', { provider: 'PAYSTACK' });
    res.json({ checkout_url: result.authorization_url, reference: transaction.skillbridge_reference });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
router.get('/product-orders/:orderId/options', authMiddleware, async (req, res) => { const c = authedClient(req); const { data: order } = await c.from('product_orders').select('buyer_id,status,order_state').eq('id', req.params.orderId).maybeSingle(); if (!order || order.buyer_id !== req.user.id) return res.status(404).json({ error: 'Order not found.' }); if ((order.order_state || order.status) !== 'AWAITING_PAYMENT') return res.status(409).json({ error: 'This order is not ready for payment.' }); const { data } = await supabase.from('payment_provider_configs').select('provider_code,display_name,is_default').eq('is_enabled', true).in('provider_code', ['PAYSTACK','MONNIFY']).order('priority'); res.json(data || []); });
router.post('/product-orders/:orderId/initialize/monnify', authMiddleware, async (req, res) => { try { if (await emergencyActive('pause_payment_initialization')) return res.status(503).json({ error: 'Payment initialization is temporarily paused by platform operations.' }); if (!await providerEnabled('MONNIFY')) return res.status(503).json({ error: 'Monnify is not enabled by the superadmin.' }); const c = authedClient(req); const { data: order } = await c.from('product_orders').select('*,payment_transactions(*)').eq('id', req.params.orderId).maybeSingle(); if (!order || order.buyer_id !== req.user.id || (order.order_state || order.status) !== 'AWAITING_PAYMENT') return res.status(409).json({ error: 'This order is not ready for payment.' }); const transaction = order.payment_transactions?.[0]; if (!transaction) throw new Error('Internal transaction missing.'); const result = await monnify.initialize({ amount: transaction.amount, reference: transaction.skillbridge_reference, email: req.user.email, name: req.user.display_name, redirectUrl: `${req.protocol}://${req.get('host')}/payment.html?order=${order.id}`, metadata: { skillbridge_order_id: order.id } }); await c.from('payment_transactions').update({ provider_code: 'MONNIFY', provider_reference: transaction.skillbridge_reference, status: 'PAYMENT_INITIALIZED', metadata: { checkout_url: result.checkoutUrl } }).eq('id', transaction.id); await c.from('product_orders').update({ status: 'PAYMENT_PROCESSING', order_state: 'PAYMENT_PROCESSING' }).eq('id', order.id); await recordEvent(order.id, transaction.id, 'PAYMENT_INITIALIZED', transaction.status, 'PAYMENT_INITIALIZED', { provider: 'MONNIFY' }); res.json({ checkout_url: result.checkoutUrl, reference: transaction.skillbridge_reference }); } catch (error) { res.status(400).json({ error: error.message }); } });

router.post('/webhooks/paystack', async (req, res) => {
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  if (!paystack.signatureIsValid(raw, req.headers['x-paystack-signature'])) return res.status(401).json({ error: 'Invalid Paystack signature.' });
  const payload = req.body || {}, eventId = String(payload.data?.id || ''), reference = String(payload.data?.reference || '');
  const payloadHash = crypto.createHash('sha256').update(raw).digest('hex');
  const { error: receiptError } = await supabase.from('payment_webhook_events').insert({ provider_code: 'PAYSTACK', provider_event_id: eventId || null, provider_reference: reference || null, event_type: payload.event || 'unknown', payload, payload_hash: payloadHash, signature_valid: true });
  if (receiptError?.code === '23505') return res.status(200).json({ ok: true, duplicate: true });
  if (receiptError) return res.status(500).json({ error: receiptError.message });
  try {
    if (payload.event !== 'charge.success' || !reference) throw new Error('Webhook does not represent a successful charge.');
    const { data: transaction } = await supabase.from('payment_transactions').select('*').eq('skillbridge_reference', reference).maybeSingle();
    if (!transaction) throw new Error('Unknown SkillBridge payment reference.');
    const verified = await paystack.verify(reference);
    const expectedKobo = Math.round(Number(transaction.amount) * 100);
    if (verified.status !== 'success' || verified.reference !== reference || Number(verified.amount) !== expectedKobo || String(verified.currency || '').toUpperCase() !== String(transaction.currency).toUpperCase()) throw new Error('Provider verification did not match the expected SkillBridge transaction.');
    await supabase.from('payment_transactions').update({ provider_code: 'PAYSTACK', provider_reference: verified.reference, provider_transaction_id: String(verified.id), status: 'PAYMENT_VERIFIED', verification_status: 'VERIFIED', verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', transaction.id);
    if (transaction.payment_id) await supabase.from('payments').update({ status: 'in_escrow' }).eq('id', transaction.payment_id);
    await supabase.from('product_orders').update({ status: 'PAYMENT_VERIFIED', order_state: 'PAYMENT_VERIFIED', updated_at: new Date().toISOString() }).eq('id', transaction.order_id);
    await recordEvent(transaction.order_id, transaction.id, 'PAYMENT_VERIFIED', transaction.status, 'PAYMENT_VERIFIED', { provider_transaction_id: verified.id });
    await supabase.from('product_orders').update({ status: 'READY_FOR_DISPATCH', order_state: 'READY_FOR_DISPATCH', updated_at: new Date().toISOString() }).eq('id', transaction.order_id);
    await recordEvent(transaction.order_id, transaction.id, 'DISPATCH_AUTHORIZED', 'PAYMENT_VERIFIED', 'READY_FOR_DISPATCH', { automation: 'payment_verified' });
    const { data: order } = await supabase.from('product_orders').select('buyer_id,seller_id,order_code').eq('id', transaction.order_id).maybeSingle();
    if (order) { await notify(supabase, { userId: order.buyer_id, type: 'payment_verified', title: 'Payment verified', body: `Payment for ${order.order_code} has been verified.`, link: `/order.html?id=${transaction.order_id}` }); await notify(supabase, { userId: order.seller_id, type: 'dispatch_authorized', title: 'Order ready for dispatch', body: `Payment for ${order.order_code} is verified. Prepare dispatch.`, link: `/order.html?id=${transaction.order_id}` }); }
    await supabase.from('payment_webhook_events').update({ processing_status: 'PROCESSED', processed_at: new Date().toISOString() }).eq('provider_code', 'PAYSTACK').eq('payload_hash', payloadHash);
    res.status(200).json({ ok: true });
  } catch (error) { await supabase.from('payment_webhook_events').update({ processing_status: 'REJECTED', processing_error: error.message, processed_at: new Date().toISOString() }).eq('provider_code', 'PAYSTACK').eq('payload_hash', payloadHash); res.status(200).json({ ok: true }); }
});

router.post('/webhooks/monnify', async (req, res) => {
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  if (!monnify.signatureIsValid(raw, req.headers['monnify-signature'])) return res.status(401).json({ error: 'Invalid Monnify signature.' });
  const payload = req.body || {}, event = payload.eventData || {}, reference = String(event.paymentReference || ''); const payloadHash = crypto.createHash('sha256').update(raw).digest('hex');
  const { error } = await supabase.from('payment_webhook_events').insert({ provider_code: 'MONNIFY', provider_event_id: event.transactionReference || null, provider_reference: reference || null, event_type: payload.eventType || 'unknown', payload, payload_hash: payloadHash, signature_valid: true });
  if (error?.code === '23505') return res.status(200).json({ ok: true, duplicate: true }); if (error) return res.status(500).json({ error: error.message });
  try { if (payload.eventType !== 'SUCCESSFUL_TRANSACTION' || !reference) throw new Error('Not a successful Monnify transaction.'); const { data: transaction } = await supabase.from('payment_transactions').select('*').eq('skillbridge_reference', reference).maybeSingle(); if (!transaction) throw new Error('Unknown SkillBridge payment reference.'); const verified = await monnify.verify(reference); if (verified.paymentStatus !== 'PAID' || Number(verified.amountPaid) !== Number(transaction.amount) || String(verified.currencyCode || verified.currency || '').toUpperCase() !== String(transaction.currency).toUpperCase()) throw new Error('Monnify verification did not match expected payment.'); await supabase.from('payment_transactions').update({ provider_code: 'MONNIFY', provider_reference: reference, provider_transaction_id: verified.transactionReference, status: 'PAYMENT_VERIFIED', verification_status: 'VERIFIED', verified_at: new Date().toISOString() }).eq('id', transaction.id); await supabase.from('payments').update({ status: 'in_escrow' }).eq('id', transaction.payment_id); await supabase.from('product_orders').update({ status: 'READY_FOR_DISPATCH', order_state: 'READY_FOR_DISPATCH', updated_at: new Date().toISOString() }).eq('id', transaction.order_id); await recordEvent(transaction.order_id, transaction.id, 'PAYMENT_VERIFIED', transaction.status, 'READY_FOR_DISPATCH', { provider: 'MONNIFY', provider_transaction_id: verified.transactionReference }); await supabase.from('payment_webhook_events').update({ processing_status: 'PROCESSED', processed_at: new Date().toISOString() }).eq('provider_code', 'MONNIFY').eq('payload_hash', payloadHash); res.json({ ok: true }); } catch (failure) { await supabase.from('payment_webhook_events').update({ processing_status: 'REJECTED', processing_error: failure.message, processed_at: new Date().toISOString() }).eq('provider_code', 'MONNIFY').eq('payload_hash', payloadHash); res.status(200).json({ ok: true }); }
});

// A finance/admin recovery action: it repeats provider-side verification; it
// never accepts a user assertion or changes payment state without that result.
router.post('/product-orders/:orderId/reconcile', authMiddleware, async (req, res) => {
  try {
    if (!hasPermission(req, 'manage_orders')) return res.status(403).json({ error: 'Finance or superadmin permission is required.' });
    const c = authedClient(req); const { data: transaction } = await c.from('payment_transactions').select('*').eq('order_id', req.params.orderId).eq('provider_code', 'PAYSTACK').maybeSingle();
    if (!transaction) return res.status(404).json({ error: 'No Paystack transaction exists for this order.' });
    const verified = await paystack.verify(transaction.provider_reference || transaction.skillbridge_reference);
    if (verified.status !== 'success' || Number(verified.amount) !== Math.round(Number(transaction.amount) * 100) || String(verified.currency || '').toUpperCase() !== String(transaction.currency).toUpperCase()) return res.status(409).json({ error: 'Provider verification did not confirm the expected amount and currency.' });
    await c.from('payment_transactions').update({ status: 'PAYMENT_VERIFIED', verification_status: 'VERIFIED', provider_transaction_id: String(verified.id), verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', transaction.id);
    await c.from('payments').update({ status: 'in_escrow' }).eq('id', transaction.payment_id);
    await c.from('product_orders').update({ status: 'READY_FOR_DISPATCH', order_state: 'READY_FOR_DISPATCH', updated_at: new Date().toISOString() }).eq('id', transaction.order_id);
    await recordEvent(transaction.order_id, transaction.id, 'PAYMENT_RECONCILED_VERIFIED', transaction.status, 'PAYMENT_VERIFIED', { reconciled_by: req.user.id, provider_transaction_id: verified.id });
    res.json({ ok: true, transaction_id: transaction.id });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

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
  const { data: payment } = await c.from('payments').select('proof_meta').eq('id', req.params.id).maybeSingle();
  if (payment?.proof_meta?.product_order_id) return res.status(409).json({ error: 'Manual proof upload is disabled for product orders. Payment must be confirmed by a configured provider and server-side verification.' });
  const { proof_url, proof_meta } = req.body;
  const { data, error } = await c.from('payments').update({ proof_url, proof_meta }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
