const router = require('express').Router();
const { supabase, createAuthedClient } = require('../utils/db');
const { authMiddleware, hasPermission } = require('../middleware/auth');
const { notify } = require('../utils/notify');

function client(req) { return createAuthedClient(req.headers.authorization?.replace('Bearer ', '')); }
function reference() { return `SB-DG-${Date.now().toString().slice(-8)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`; }
async function getOrder(c, id) { const { data, error } = await c.from('digital_service_orders').select('*, service:services(*)').eq('id', id).maybeSingle(); if (error) throw error; return data; }
async function event(c, order, previous, next, eventCode, actorId, details = {}) { await c.from('digital_service_events').insert({ service_order_id: order.id, event_code: eventCode, previous_status: previous, next_status: next, actor_id: actorId, details }); }
async function allowedProvider(userId) { const { data } = await supabase.from('profiles').select('role,account_status').eq('user_id', userId).maybeSingle(); return data?.role === 'freelancer' && data?.account_status !== 'banned'; }

router.get('/settings', authMiddleware, async (req, res) => {
  const { data, error } = await client(req).from('digital_service_settings').select('*').eq('id', true).maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || {});
});

router.put('/settings', authMiddleware, async (req, res) => {
  if (!hasPermission(req, 'manage_settings')) return res.status(403).json({ error: 'Superadmin permission is required.' });
  const allowed = ['require_provider_approval', 'require_client_acceptance', 'allow_revisions', 'default_revisions', 'allow_milestones', 'auto_release', 'max_file_size_mb', 'allowed_file_types'];
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
  const { data, error } = await client(req).from('digital_service_settings').update({ ...patch, updated_by: req.user.id, updated_at: new Date().toISOString() }).eq('id', true).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.post('/orders', authMiddleware, async (req, res) => {
  try {
    const c = client(req); const { service_id, requirements = {}, requirements_files = [], client_note = '' } = req.body || {};
    const { data: service, error } = await c.from('services').select('*').eq('id', service_id).eq('status', 'active').maybeSingle();
    if (error || !service) return res.status(404).json({ error: 'This digital service is not available.' });
    if (service.user_id === req.user.id) return res.status(400).json({ error: 'You cannot order your own service.' });
    if (!await allowedProvider(service.user_id)) return res.status(409).json({ error: 'This listing is not attached to an eligible freelancer account.' });
    const { data: settings } = await supabase.from('digital_service_settings').select('*').eq('id', true).maybeSingle();
    const revisions = Number.isInteger(Number(service.revisions_included)) ? Number(service.revisions_included) : Number(settings?.default_revisions || 2);
    const agreement = { type: 'DIGITAL_SERVICE_AGREEMENT', service: service.title, price: service.price, currency: 'NGN', delivery_days: service.delivery_days, revisions_included: revisions, deliverables: service.deliverables || [], requirements, terms: service.terms_included || null };
    const { data: order, error: orderError } = await c.from('digital_service_orders').insert({ order_reference: reference(), service_id: service.id, client_id: req.user.id, provider_id: service.user_id, title_snapshot: service.title, price: service.price, delivery_days: service.delivery_days || 7, revisions_included: revisions, requirements, requirements_files: Array.isArray(requirements_files) ? requirements_files : [], agreement_snapshot: agreement, client_note, status: settings?.require_provider_approval === false ? 'AWAITING_PAYMENT' : 'AWAITING_PROVIDER_ACCEPTANCE' }).select().single();
    if (orderError) throw orderError;
    await event(c, order, null, order.status, 'DIGITAL_SERVICE_ORDER_CREATED', req.user.id);
    await notify(c, { userId: service.user_id, type: 'digital_service_order_created', title: 'New digital service request', body: `${service.title} requires your review before payment.`, link: `/service-order.html?id=${order.id}` });
    res.status(201).json(order);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.get('/orders', authMiddleware, async (req, res) => {
  const c = client(req); const { data, error } = await c.from('digital_service_orders').select('*, service:services(id,images)').or(`client_id.eq.${req.user.id},provider_id.eq.${req.user.id}`).order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message }); res.json(data || []);
});
router.get('/admin/orders', authMiddleware, async (req, res) => {
  if (!hasPermission(req, 'manage_orders')) return res.status(403).json({ error: 'Finance or superadmin permission is required.' });
  const { data, error } = await client(req).from('digital_service_orders').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(400).json({ error: error.message }); res.json(data || []);
});

router.get('/orders/:id', authMiddleware, async (req, res) => {
  try { const c = client(req); const order = await getOrder(c, req.params.id); if (!order) return res.status(404).json({ error: 'Project not found.' }); const [deliveries, revisions, milestones, events, payment] = await Promise.all([c.from('digital_service_deliveries').select('*').eq('service_order_id', order.id).order('version_number'), c.from('digital_service_revisions').select('*').eq('service_order_id', order.id).order('requested_at'), c.from('digital_service_milestones').select('*').eq('service_order_id', order.id).order('position'), c.from('digital_service_events').select('*').eq('service_order_id', order.id).order('created_at'), c.from('payment_transactions').select('*').eq('service_order_id', order.id).maybeSingle()]); res.json({ ...order, deliveries: deliveries.data || [], revisions: revisions.data || [], milestones: milestones.data || [], events: events.data || [], payment: payment.data || null }); } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/orders/:id/milestones', authMiddleware, async (req, res) => {
  try { const c = client(req); const order = await getOrder(c, req.params.id); if (!order || order.client_id !== req.user.id) return res.status(404).json({ error: 'Project not found.' }); if (!['AWAITING_PROVIDER_ACCEPTANCE','AWAITING_PAYMENT'].includes(order.status)) return res.status(409).json({ error: 'Milestones are locked after payment begins.' }); const { data: settings } = await supabase.from('digital_service_settings').select('allow_milestones').eq('id', true).maybeSingle(); if (settings?.allow_milestones === false) return res.status(409).json({ error: 'Milestones are disabled by platform settings.' }); const rows = Array.isArray(req.body?.milestones) ? req.body.milestones : []; if (!rows.length) return res.status(400).json({ error: 'Add at least one milestone.' }); const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0); if (Math.abs(total - Number(order.price)) > 0.01) return res.status(400).json({ error: 'Milestone amounts must equal the agreed project price.' }); const { error } = await c.from('digital_service_milestones').delete().eq('service_order_id', order.id); if (error) throw error; const { data, error: insertError } = await c.from('digital_service_milestones').insert(rows.map((row, index) => ({ service_order_id: order.id, title: String(row.title || '').trim(), description: row.description || null, amount: Number(row.amount), deadline: row.deadline || null, position: index + 1 }))).select(); if (insertError) throw insertError; await event(c, order, order.status, order.status, 'MILESTONES_CONFIGURED', req.user.id, { count: data.length }); res.status(201).json(data); } catch (error) { res.status(400).json({ error: error.message }); }
});

router.put('/orders/:id/provider-review', authMiddleware, async (req, res) => {
  try { const c = client(req); const order = await getOrder(c, req.params.id); if (!order || order.provider_id !== req.user.id) return res.status(404).json({ error: 'Project not found.' }); if (order.status !== 'AWAITING_PROVIDER_ACCEPTANCE') return res.status(409).json({ error: 'This project is not awaiting provider review.' }); const accepted = req.body?.accepted === true; const next = accepted ? 'AWAITING_PAYMENT' : 'CLARIFICATION_REQUESTED'; const note = String(req.body?.note || '').trim(); await c.from('digital_service_orders').update({ status: next, provider_note: note || null, accepted_at: accepted ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', order.id); await event(c, order, order.status, next, accepted ? 'PROVIDER_ACCEPTED' : 'CLARIFICATION_REQUESTED', req.user.id, { note }); await notify(c, { userId: order.client_id, type: accepted ? 'digital_service_accepted' : 'digital_service_clarification', title: accepted ? 'Service request accepted' : 'Provider needs clarification', body: note || `Your ${order.title_snapshot} request was updated.`, link: `/service-order.html?id=${order.id}` }); res.json({ ...order, status: next }); } catch (error) { res.status(400).json({ error: error.message }); }
});

// Exceptional recovery for a verified offline/manual payment. This never
// claims a provider verified payment; the mandatory reason and event record
// preserve an auditable distinction from a webhook-confirmed payment.
router.put('/orders/:id/admin-payment-override', authMiddleware, async (req, res) => {
  try {
    if (!hasPermission(req, 'manage_orders')) return res.status(403).json({ error: 'Finance or superadmin permission is required.' });
    const reason = String(req.body?.reason || '').trim(); if (!reason) return res.status(400).json({ error: 'A reason is required for a manual payment override.' });
    const c = client(req), order = await getOrder(c, req.params.id); if (!order) return res.status(404).json({ error: 'Project not found.' });
    if (!['AWAITING_PAYMENT', 'PAYMENT_PROCESSING'].includes(order.status)) return res.status(409).json({ error: 'This project is not eligible for a payment override.' });
    let { data: payment } = await c.from('payments').select('*').eq('service_order_id', order.id).maybeSingle();
    if (!payment) { const { data, error } = await c.from('payments').insert({ service_order_id: order.id, client_id: order.client_id, worker_id: order.provider_id, amount: order.price, service_fee: 0, payment_method: 'admin_override', purpose: 'escrow', status: 'in_escrow', proof_meta: { admin_override: true, reason, approved_by: req.user.id } }).select().single(); if (error) throw error; payment = data; }
    else await c.from('payments').update({ status: 'in_escrow', proof_meta: { ...(payment.proof_meta || {}), admin_override: true, reason, approved_by: req.user.id } }).eq('id', payment.id);
    let { data: transaction } = await c.from('payment_transactions').select('*').eq('service_order_id', order.id).maybeSingle();
    if (!transaction) { const { data, error } = await c.from('payment_transactions').insert({ payment_id: payment.id, service_order_id: order.id, buyer_id: order.client_id, seller_id: order.provider_id, skillbridge_reference: `SB-DG-ADM-${Date.now().toString().slice(-8)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`, provider_code: 'ADMIN_OVERRIDE', amount: order.price, currency: order.currency, status: 'ADMIN_OVERRIDE_VERIFIED', verification_status: 'ADMIN_OVERRIDE', verified_at: new Date().toISOString(), metadata: { reason, approved_by: req.user.id } }).select().single(); if (error) throw error; transaction = data; }
    else await c.from('payment_transactions').update({ status: 'ADMIN_OVERRIDE_VERIFIED', verification_status: 'ADMIN_OVERRIDE', verified_at: new Date().toISOString(), metadata: { ...(transaction.metadata || {}), reason, approved_by: req.user.id } }).eq('id', transaction.id);
    await c.from('digital_service_orders').update({ status: 'PAID', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', order.id);
    await event(c, order, order.status, 'PAID', 'ADMIN_PAYMENT_OVERRIDE', req.user.id, { reason, payment_id: payment.id, payment_transaction_id: transaction.id });
    await notify(c, { userId: order.provider_id, type: 'admin_payment_override', title: 'Project payment authorized by administrator', body: `${order.title_snapshot} was manually authorized after payment review. You may begin work.`, link: `/service-order.html?id=${order.id}` });
    await notify(c, { userId: order.client_id, type: 'admin_payment_override', title: 'Project payment review completed', body: `Your project ${order.title_snapshot} was manually authorized by an administrator.`, link: `/service-order.html?id=${order.id}` });
    res.json({ ok: true, service_order_id: order.id, status: 'PAID' });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/orders/:id/deliveries', authMiddleware, async (req, res) => {
  try { const c = client(req); const order = await getOrder(c, req.params.id); if (!order || order.provider_id !== req.user.id) return res.status(404).json({ error: 'Project not found.' }); if (!['PAID','IN_PROGRESS','REVISION_REQUESTED'].includes(order.status)) return res.status(409).json({ error: 'Payment must be verified before delivery can be submitted.' }); const files = Array.isArray(req.body?.files) ? req.body.files.filter(Boolean) : []; if (!files.length) return res.status(400).json({ error: 'Attach at least one completed digital file.' }); const { data: last } = await c.from('digital_service_deliveries').select('version_number').eq('service_order_id', order.id).order('version_number', { ascending: false }).limit(1).maybeSingle(); const { data, error } = await c.from('digital_service_deliveries').insert({ service_order_id: order.id, version_number: (last?.version_number || 0) + 1, files, note: String(req.body?.note || ''), submitted_by: req.user.id }).select().single(); if (error) throw error; const { data: settings } = await supabase.from('digital_service_settings').select('require_client_acceptance,auto_release').eq('id', true).maybeSingle(); const next = settings?.require_client_acceptance === false ? (settings?.auto_release ? 'COMPLETED' : 'COMPLETED_PENDING_RELEASE') : 'READY_FOR_REVIEW'; await c.from('digital_service_orders').update({ status: next, completed_at: next === 'READY_FOR_REVIEW' ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', order.id); if (next === 'COMPLETED') await c.from('payments').update({ status: 'released', received_at: new Date().toISOString(), released_at: new Date().toISOString() }).eq('service_order_id', order.id); await event(c, order, order.status, next, 'DIGITAL_DELIVERY_SUBMITTED', req.user.id, { version: data.version_number }); await notify(c, { userId: order.client_id, type: 'digital_delivery_ready', title: 'Digital delivery ready for review', body: `${order.title_snapshot} delivery v${data.version_number} is ready.`, link: `/service-order.html?id=${order.id}` }); res.status(201).json(data); } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/orders/:id/revisions', authMiddleware, async (req, res) => {
  try { const c = client(req); const order = await getOrder(c, req.params.id); if (!order || order.client_id !== req.user.id) return res.status(404).json({ error: 'Project not found.' }); if (order.status !== 'READY_FOR_REVIEW') return res.status(409).json({ error: 'A revision can only be requested after a delivery.' }); const { data: settings } = await supabase.from('digital_service_settings').select('allow_revisions').eq('id', true).maybeSingle(); if (settings?.allow_revisions === false) return res.status(409).json({ error: 'Revisions are currently disabled by platform settings.' }); const { count } = await c.from('digital_service_revisions').select('id', { count: 'exact', head: true }).eq('service_order_id', order.id); if ((count || 0) >= order.revisions_included) return res.status(409).json({ error: 'Included revisions have been exhausted.' }); const instructions = String(req.body?.instructions || '').trim(); if (!instructions) return res.status(400).json({ error: 'Revision instructions are required.' }); const { data: delivery } = await c.from('digital_service_deliveries').select('id').eq('service_order_id', order.id).order('version_number', { ascending: false }).limit(1).maybeSingle(); const { data, error } = await c.from('digital_service_revisions').insert({ service_order_id: order.id, delivery_id: delivery?.id || null, instructions, requested_by: req.user.id }).select().single(); if (error) throw error; await c.from('digital_service_orders').update({ status: 'REVISION_REQUESTED', updated_at: new Date().toISOString() }).eq('id', order.id); await event(c, order, order.status, 'REVISION_REQUESTED', 'REVISION_REQUESTED', req.user.id, { revision_number: (count || 0) + 1 }); await notify(c, { userId: order.provider_id, type: 'digital_revision_requested', title: 'Revision requested', body: instructions, link: `/service-order.html?id=${order.id}` }); res.status(201).json(data); } catch (error) { res.status(400).json({ error: error.message }); }
});

router.put('/orders/:id/accept-delivery', authMiddleware, async (req, res) => {
  try { const c = client(req); const order = await getOrder(c, req.params.id); if (!order || order.client_id !== req.user.id) return res.status(404).json({ error: 'Project not found.' }); if (order.status !== 'READY_FOR_REVIEW') return res.status(409).json({ error: 'No delivery is awaiting your review.' }); const { data: delivery } = await c.from('digital_service_deliveries').select('id').eq('service_order_id', order.id).order('version_number', { ascending: false }).limit(1).maybeSingle(); if (delivery) await c.from('digital_service_deliveries').update({ client_accepted_at: new Date().toISOString() }).eq('id', delivery.id); const { data: settings } = await supabase.from('digital_service_settings').select('auto_release').eq('id', true).maybeSingle(); const next = settings?.auto_release ? 'COMPLETED' : 'COMPLETED_PENDING_RELEASE'; await c.from('digital_service_orders').update({ status: next, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', order.id); await c.from('payments').update(settings?.auto_release ? { status: 'released', received_at: new Date().toISOString(), released_at: new Date().toISOString() } : { received_at: new Date().toISOString() }).eq('service_order_id', order.id); await event(c, order, order.status, next, 'CLIENT_ACCEPTED_DELIVERY', req.user.id); await notify(c, { userId: order.provider_id, type: 'digital_delivery_accepted', title: 'Digital delivery accepted', body: `${order.title_snapshot} has been accepted and ${settings?.auto_release ? 'payment was released.' : 'awaits payment release.'}`, link: `/service-order.html?id=${order.id}` }); res.json({ ...order, status: next }); } catch (error) { res.status(400).json({ error: error.message }); }
});

module.exports = router;
