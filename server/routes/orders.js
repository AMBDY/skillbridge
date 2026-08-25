const crypto = require('crypto');
const router = require('express').Router();
const { supabase, createAuthedClient } = require('../utils/db');
const { authMiddleware, hasPermission } = require('../middleware/auth');
const { notify } = require('../utils/notify');

function client(req) { return createAuthedClient(req.headers.authorization?.replace('Bearer ', '')); }
function code(prefix, suffix = '') { return `${prefix}-${Date.now().toString().slice(-7)}${suffix}`.toUpperCase(); }
function orderReference() { return `SB-ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`; }
function paymentReference() { return `SB-PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`; }
const ORDER_TRANSITIONS = {
  ORDER_SUBMITTED: ['AWAITING_SELLER_APPROVAL', 'ORDER_CANCELLED'],
  AWAITING_SELLER_APPROVAL: ['SELLER_ACCEPTED', 'SELLER_REJECTED', 'ORDER_CANCELLED'],
  SELLER_ACCEPTED: ['AWAITING_PAYMENT', 'AWAITING_BUYER_ACCEPTANCE'],
  AWAITING_BUYER_ACCEPTANCE: ['AWAITING_PAYMENT', 'CORRECTION_REQUESTED'],
  CORRECTION_REQUESTED: ['AWAITING_SELLER_APPROVAL', 'ORDER_CANCELLED'],
  AWAITING_PAYMENT: ['PAYMENT_PROCESSING', 'PAYMENT_FAILED', 'PAYMENT_EXPIRED', 'ORDER_CANCELLED'],
  PAYMENT_PROCESSING: ['PAYMENT_VERIFIED', 'PAYMENT_FAILED', 'PAYMENT_EXPIRED'],
  PAYMENT_VERIFIED: ['READY_FOR_DISPATCH', 'DISPUTED', 'REFUND_REQUESTED'],
  READY_FOR_DISPATCH: ['DISPATCH_PREPARATION', 'DISPATCHED', 'DISPUTED'],
  DISPATCH_PREPARATION: ['DISPATCHED'], DISPATCHED: ['IN_TRANSIT'], IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED'], DELIVERED: ['BUYER_CONFIRMATION_PENDING', 'COMPLETED', 'DISPUTED'],
  BUYER_CONFIRMATION_PENDING: ['COMPLETED', 'DISPUTED'], REFUND_REQUESTED: ['REFUND_APPROVED', 'REFUND_REJECTED'],
  REFUND_APPROVED: ['REFUNDED']
};
function canonicalState(order) { return order.order_state || order.status; }
async function transition(c, order, next, actorId, actorType, eventCode, details = {}) {
  const previous = canonicalState(order);
  if (!(ORDER_TRANSITIONS[previous] || []).includes(next)) throw new Error(`Invalid order transition: ${previous} → ${next}.`);
  const { data, error } = await c.from('product_orders').update({ status: next, order_state: next, updated_at: new Date().toISOString() }).eq('id', order.id).select().single();
  if (error) throw error;
  await audit(c, order.id, actorId, eventCode || next.toLowerCase(), { status: previous }, { status: next });
  await c.from('transaction_events').insert({ order_id: order.id, event_code: eventCode || next, previous_state: previous, next_state: next, actor_type: actorType || 'user', actor_id: actorId, source: 'order_engine', details });
  return data;
}
function admin(req) { return req.user?.role === 'admin' || hasPermission(req, 'manage_orders'); }
async function audit(c, orderId, actorId, action, previous, next, reason, shipmentId = null) {
  await c.from('product_transaction_audit').insert({ order_id: orderId, shipment_id: shipmentId, actor_id: actorId, action, previous_value: previous || null, next_value: next || null, reason: reason || null });
}
async function getOrder(c, id) {
  const { data, error } = await c.from('product_orders').select('*, product_order_items(*, products(*), custom_specifications(*)), shipments(*, logistics_providers(*), tracking_events(*))').eq('id', id).maybeSingle();
  if (error) throw error; return data;
}
function party(order, req) { return order && (order.buyer_id === req.user.id || order.seller_id === req.user.id || admin(req)); }
async function ordersPaused() { const { data } = await supabase.from('emergency_controls').select('is_active').eq('control_key', 'pause_new_orders').maybeSingle(); return !!data?.is_active; }
function nextStatus(order, value) { return { ...order, status: value, updated_at: new Date().toISOString() }; }

router.get('/measurement-templates', async (req, res) => {
  let q = supabase.from('measurement_templates').select('*, measurement_template_fields(*)').eq('is_active', true).order('name');
  if (req.query.category_id) q = q.or(`category_id.eq.${req.query.category_id},category_id.is.null`);
  const { data, error } = await q; if (error) return res.status(400).json({ error: error.message }); res.json(data || []);
});

router.use(authMiddleware);
router.get('/mine', async (req, res) => {
  const c = client(req); const { data, error } = await c.from('product_orders').select('*, product_order_items(*, products(id,title,images,product_code)), shipments(id,tracking_number,status,current_location)').or(`buyer_id.eq.${req.user.id},seller_id.eq.${req.user.id}`).order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(400).json({ error: error.message }); res.json(data || []);
});
router.get('/admin/all', async (req, res) => {
  if (!admin(req)) return res.status(403).json({ error: 'Administrator access required.' });
  const c = client(req); let q = c.from('product_orders').select('*, product_order_items(*, products(id,title,images,product_code)), shipments(*, logistics_providers(company_name)), payments(id,status,amount)').order('created_at', { ascending: false }).limit(100);
  if (req.query.q) q = q.or(`order_code.ilike.%${req.query.q}%`);
  if (req.query.status) q = q.eq('status', req.query.status);
  const { data, error } = await q; if (error) return res.status(400).json({ error: error.message }); res.json(data || []);
});
router.get('/admin/templates', async (req, res) => { if (!admin(req)) return res.status(403).json({ error: 'Administrator access required.' }); const { data, error } = await client(req).from('measurement_templates').select('*, measurement_template_fields(*)').order('name'); if (error) return res.status(400).json({ error: error.message }); res.json(data || []); });
router.post('/admin/templates', async (req, res) => { if (!admin(req)) return res.status(403).json({ error: 'Administrator access required.' }); const c = client(req), b = req.body || {}; if (!b.name) return res.status(400).json({ error: 'Template name is required.' }); const { data, error } = await c.from('measurement_templates').insert({ category_id: b.category_id || null, name: b.name, description: b.description || null, guide_image_url: b.guide_image_url || null, is_active: b.is_active !== false, created_by: req.user.id }).select().single(); if (error) return res.status(400).json({ error: error.message }); if (Array.isArray(b.fields) && b.fields.length) { const { error: fieldsError } = await c.from('measurement_template_fields').insert(b.fields.map((f, index) => ({ template_id: data.id, field_name: f.field_name, unit: f.unit || 'cm', description: f.description || null, instructions: f.instructions || null, is_required: f.is_required === true, default_value: f.default_value || null, sort_order: index }))); if (fieldsError) return res.status(400).json({ error: fieldsError.message }); } res.status(201).json(data); });
router.put('/admin/templates/:id', async (req, res) => { if (!admin(req)) return res.status(403).json({ error: 'Administrator access required.' }); const c = client(req), b = req.body || {}; const { data, error } = await c.from('measurement_templates').update({ name: b.name, description: b.description || null, guide_image_url: b.guide_image_url || null, is_active: b.is_active !== false, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single(); if (error) return res.status(400).json({ error: error.message }); if (Array.isArray(b.fields)) { await c.from('measurement_template_fields').delete().eq('template_id', data.id); if (b.fields.length) { const { error: fieldsError } = await c.from('measurement_template_fields').insert(b.fields.map((f, index) => ({ template_id: data.id, field_name: f.field_name, unit: f.unit || 'cm', description: f.description || null, instructions: f.instructions || null, is_required: f.is_required === true, default_value: f.default_value || null, sort_order: index }))); if (fieldsError) return res.status(400).json({ error: fieldsError.message }); } } res.json(data); });
router.delete('/admin/templates/:id', async (req, res) => { if (!admin(req)) return res.status(403).json({ error: 'Administrator access required.' }); const { error } = await client(req).from('measurement_templates').delete().eq('id', req.params.id); if (error) return res.status(400).json({ error: error.message }); res.json({ ok: true }); });
router.get('/:id', async (req, res) => {
  try { const order = await getOrder(client(req), req.params.id); if (!party(order, req)) return res.status(404).json({ error: 'Order not found.' }); res.json(order); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.get('/:id/agreement-versions', async (req, res) => {
  try { const c = client(req), order = await getOrder(c, req.params.id); if (!party(order, req)) return res.status(404).json({ error: 'Order not found.' }); const { data, error } = await c.from('order_agreement_versions').select('*').eq('order_id', order.id).order('version_number', { ascending: false }); if (error) throw error; res.json(data || []); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/:id/agreement-versions', async (req, res) => {
  try {
    const c = client(req), order = await getOrder(c, req.params.id); if (!order || ![order.buyer_id, order.seller_id].includes(req.user.id)) return res.status(404).json({ error: 'Order not found.' });
    if (!['AWAITING_SELLER_APPROVAL','CORRECTION_REQUESTED','AWAITING_BUYER_ACCEPTANCE'].includes(canonicalState(order))) return res.status(409).json({ error: 'The accepted agreement is locked. Create changes only before payment.' });
    const { data: latest } = await c.from('order_agreement_versions').select('version_number').eq('order_id', order.id).order('version_number', { ascending: false }).limit(1).maybeSingle();
    const item = order.product_order_items?.[0] || {}, spec = item.custom_specifications?.sort((a,b) => b.version_number-a.version_number)[0] || {};
    const body = req.body || {};
    const { data, error } = await c.from('order_agreement_versions').insert({ order_id: order.id, agreement_id: order.agreement_id || null, version_number: (latest?.version_number || 0) + 1, buyer_snapshot: { delivery_address: order.delivery_address, buyer_contact: order.buyer_contact, buyer_notes: body.buyer_notes ?? order.buyer_notes, measurements: spec.measurements || [], markers: spec.markers || [] }, seller_snapshot: { seller_notes: body.seller_notes ?? order.seller_notes, dispatch_terms: body.dispatch_terms || null }, product_snapshot: { product_id: item.product_id, product_code: item.product_code, title: item.title_snapshot, image: item.image_snapshot, quantity: item.quantity, unit_price: item.unit_price, total_amount: order.total_amount }, terms_snapshot: body.terms || {}, status: 'DRAFT', created_by: req.user.id }).select().single();
    if (error) throw error; await audit(c, order.id, req.user.id, 'agreement_version_created', null, { version: data.version_number }); res.status(201).json(data);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  if (await ordersPaused()) return res.status(503).json({ error: 'New product orders are temporarily paused by platform operations.' });
  const c = client(req); const { product_id, quantity = 1, delivery_address = {}, buyer_contact = {}, buyer_notes = '', custom_specification } = req.body || {};
  const qty = Number(quantity); if (!product_id || !Number.isInteger(qty) || qty < 1) return res.status(400).json({ error: 'Choose a product and a valid quantity.' });
  const { data: product, error } = await c.from('products').select('*').eq('id', product_id).eq('status', 'active').maybeSingle();
  if (error || !product) return res.status(404).json({ error: 'This product is not available.' });
  if (product.user_id === req.user.id) return res.status(400).json({ error: 'You cannot order your own product.' });
  if (product.fulfillment_type === 'ready_made' && Number(product.stock || 0) < qty) return res.status(400).json({ error: 'This quantity is no longer available.' });
  const deliveryFee = Number(product.details?.delivery_fee || 0); const subtotal = Number(product.price) * qty; const orderCode = `${product.product_code || 'SB'}${new Date().getUTCFullYear().toString().slice(-2)}${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  const { data: order, error: orderError } = await c.from('product_orders').insert({ order_code: orderCode, internal_order_reference: orderReference(), buyer_id: req.user.id, seller_id: product.user_id, status: 'AWAITING_SELLER_APPROVAL', order_state: 'AWAITING_SELLER_APPROVAL', subtotal, delivery_fee: deliveryFee, total_amount: subtotal + deliveryFee, delivery_address, buyer_contact, buyer_notes }).select().single();
  if (orderError) return res.status(400).json({ error: orderError.message });
  const { data: item, error: itemError } = await c.from('product_order_items').insert({ order_id: order.id, product_id: product.id, product_code: product.product_code || 'PENDING', seller_id: product.user_id, title_snapshot: product.title, image_snapshot: product.images?.[0] || null, quantity: qty, unit_price: product.price, fulfillment_type: product.fulfillment_type, production_days: product.production_days || null }).select().single();
  if (itemError) return res.status(400).json({ error: itemError.message });
  // This is only a pending payment record. It is not escrow and does not make
  // the order payable until a verified provider webhook or admin review updates it.
  const { data: payment, error: paymentError } = await c.from('payments').insert({ client_id: req.user.id, worker_id: product.user_id, amount: order.total_amount, service_fee: 0, payment_method: 'bank_transfer', purpose: 'escrow', status: 'pending', proof_meta: { product_order_id: order.id, verification_state: 'pending_provider_verification' } }).select().single();
  if (paymentError) return res.status(400).json({ error: paymentError.message });
  await c.from('product_orders').update({ payment_id: payment.id }).eq('id', order.id);
  // This is an internal reference only. It is not a provider success signal.
  const { data: transaction, error: transactionError } = await c.from('payment_transactions').insert({
    payment_id: payment.id, order_id: order.id, buyer_id: req.user.id, seller_id: product.user_id,
    skillbridge_reference: paymentReference(), provider_code: 'UNASSIGNED', amount: order.total_amount,
    currency: order.currency || 'NGN', status: 'PAYMENT_CREATED', verification_status: 'UNVERIFIED'
  }).select('id,skillbridge_reference').single();
  if (transactionError) return res.status(400).json({ error: transactionError.message });
  await c.from('product_transaction_audit').insert({ order_id: order.id, actor_id: req.user.id, action: 'payment_transaction_created', next_value: { payment_transaction_id: transaction.id, skillbridge_reference: transaction.skillbridge_reference } });
  if (custom_specification && ['custom_design', 'made_to_order_measurements'].includes(product.fulfillment_type)) {
    const { data: spec, error: specError } = await c.from('custom_specifications').insert({ order_item_id: item.id, reference_images: custom_specification.reference_images || [], measurement_image_url: custom_specification.measurement_image_url || null, markers: custom_specification.markers || [], measurements: custom_specification.measurements || [], buyer_instructions: custom_specification.buyer_instructions || '', design_instructions: custom_specification.design_instructions || '', submitted_by: req.user.id }).select().single();
    if (specError) return res.status(400).json({ error: specError.message });
    await c.from('product_order_items').update({ custom_specification_id: spec.id }).eq('id', item.id);
    order.status = 'AWAITING_SELLER_APPROVAL';
  }
  await audit(c, order.id, req.user.id, 'order_submitted', null, { status: order.status, total_amount: order.total_amount });
  await c.from('transaction_events').insert({ order_id: order.id, event_code: 'ORDER_SUBMITTED', next_state: order.status, actor_type: 'buyer', actor_id: req.user.id, source: 'order_engine', details: { order_reference: order.internal_order_reference } });
  await notify(c, { userId: product.user_id, type: 'product_order_created', title: 'New product order', body: `${product.title} (${product.product_code || 'pending ID'}) was ordered.`, link: '/orders.html' });
  res.status(201).json({ order_id: order.id, order_code: order.order_code, payment_reference: transaction.skillbridge_reference, payment_required: true });
});

router.put('/:id/payment-verified', async (req, res) => {
  // Deliberately retained as a safe failure for older admin buttons. A person
  // cannot manufacture PAYMENT_VERIFIED; only a configured provider webhook
  // followed by server-side verification may do that.
  return res.status(409).json({ error: 'Manual payment verification is disabled. Use Reconcile Payment after the provider integration has independently verified the transaction.' });
});

router.put('/:id/specification', async (req, res) => {
  try { const c = client(req), order = await getOrder(c, req.params.id); if (!order || order.buyer_id !== req.user.id) return res.status(404).json({ error: 'Order not found.' }); if (!['CUSTOM_SPECIFICATION_REQUIRED', 'CORRECTION_REQUESTED'].includes(order.status)) return res.status(400).json({ error: 'This specification is locked or not needed.' }); const item = order.product_order_items[0]; const previous = [...(item.custom_specifications || [])].sort((a,b) => b.version_number-a.version_number)[0]; const b = req.body || {}; const { data: spec, error } = await c.from('custom_specifications').insert({ order_item_id: item.id, version_number: (previous?.version_number || 0) + 1, reference_images: b.reference_images || [], measurement_image_url: b.measurement_image_url || null, markers: b.markers || [], measurements: b.measurements || [], buyer_instructions: b.buyer_instructions || '', design_instructions: b.design_instructions || '', submitted_by: req.user.id }).select().single(); if (error) throw error; await c.from('product_order_items').update({ custom_specification_id: spec.id }).eq('id', item.id); await c.from('product_orders').update({ status: 'AWAITING_SELLER_ACCEPTANCE', updated_at: new Date().toISOString() }).eq('id', order.id); await audit(c, order.id, req.user.id, 'specification_submitted', previous || null, spec); await notify(c, { userId: order.seller_id, type: 'specification_review', title: 'Custom specification awaiting review', body: `Order ${order.order_code} needs your acceptance.`, link: '/orders.html' }); res.json(spec); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.put('/:id/seller-accept', async (req, res) => {
  try { const c = client(req), order = await getOrder(c, req.params.id); if (!order || order.seller_id !== req.user.id) return res.status(404).json({ error: 'Order not found.' }); if (canonicalState(order) !== 'AWAITING_SELLER_APPROVAL') return res.status(400).json({ error: 'This order is not awaiting seller approval.' }); const item = order.product_order_items[0]; if (item.custom_specification_id) await c.from('custom_specifications').update({ status: 'seller_accepted', seller_accepted_at: new Date().toISOString() }).eq('id', item.custom_specification_id); const { data: latest } = await c.from('order_agreement_versions').select('version_number').eq('order_id', order.id).order('version_number', { ascending: false }).limit(1).maybeSingle(); const spec = item.custom_specifications?.sort((a,b)=>b.version_number-a.version_number)[0] || {}; await c.from('order_agreement_versions').insert({ order_id: order.id, agreement_id: order.agreement_id || null, version_number: (latest?.version_number || 0)+1, buyer_snapshot: { delivery_address: order.delivery_address, buyer_contact: order.buyer_contact, buyer_notes: order.buyer_notes, measurements: spec.measurements || [], markers: spec.markers || [] }, seller_snapshot: { seller_notes: req.body?.seller_notes || null }, product_snapshot: { product_id: item.product_id, product_code: item.product_code, title: item.title_snapshot, image: item.image_snapshot, quantity: item.quantity, unit_price: item.unit_price, total_amount: order.total_amount }, terms_snapshot: req.body?.terms || {}, status: 'AWAITING_BUYER_ACCEPTANCE', seller_accepted_at: new Date().toISOString(), created_by: req.user.id }); await transition(c, order, 'SELLER_ACCEPTED', req.user.id, 'seller', 'SELLER_ACCEPTED'); const result = await transition(c, { ...order, order_state: 'SELLER_ACCEPTED' }, 'AWAITING_BUYER_ACCEPTANCE', req.user.id, 'seller', 'AGREEMENT_AWAITING_BUYER_ACCEPTANCE'); await c.from('product_orders').update({ seller_notes: req.body?.seller_notes || null, seller_approved_at: new Date().toISOString() }).eq('id', order.id); await notify(c, { userId: order.buyer_id, type: 'seller_accepted_order', title: 'Seller accepted your order', body: `Order ${order.order_code} agreement is ready for your acceptance.`, link: `/order.html?id=${order.id}` }); res.json(result); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.put('/:id/buyer-accept', async (req, res) => {
  try { const c = client(req), order = await getOrder(c, req.params.id); if (!order || order.buyer_id !== req.user.id) return res.status(404).json({ error: 'Order not found.' }); if (canonicalState(order) !== 'AWAITING_BUYER_ACCEPTANCE') return res.status(400).json({ error: 'This order is not awaiting your acceptance.' }); const item = order.product_order_items[0]; if (item.custom_specification_id) await c.from('custom_specifications').update({ status: 'locked', buyer_accepted_at: new Date().toISOString(), locked_at: new Date().toISOString() }).eq('id', item.custom_specification_id); const { data: version } = await c.from('order_agreement_versions').select('*').eq('order_id', order.id).eq('status', 'AWAITING_BUYER_ACCEPTANCE').order('version_number', { ascending: false }).limit(1).maybeSingle(); if (!version) throw new Error('No seller-approved agreement version is available.'); await c.from('order_agreement_versions').update({ status: 'ACCEPTED', buyer_accepted_at: new Date().toISOString(), locked_at: new Date().toISOString() }).eq('id', version.id); const result = await transition(c, order, 'AWAITING_PAYMENT', req.user.id, 'buyer', 'BUYER_ACCEPTED_AGREEMENT', { agreement_version: version.version_number }); await c.from('product_orders').update({ buyer_confirmed_at: new Date().toISOString() }).eq('id', order.id); res.json(result); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.put('/:id/ready', async (req, res) => {
  try { const c = client(req), order = await getOrder(c, req.params.id); if (!order || order.seller_id !== req.user.id) return res.status(404).json({ error: 'Order not found.' }); if (order.status !== 'IN_PRODUCTION') return res.status(400).json({ error: 'Only products in production can be submitted for review.' }); await c.from('product_orders').update({ status: 'READY_FOR_REVIEW', updated_at: new Date().toISOString() }).eq('id', order.id); await audit(c, order.id, req.user.id, 'product_ready_for_review', { status: order.status }, { status: 'READY_FOR_REVIEW' }); await notify(c, { userId: order.buyer_id, type: 'product_ready_review', title: 'Your product is ready for review', body: `Review order ${order.order_code} before dispatch.`, link: '/orders.html' }); res.json(nextStatus(order, 'READY_FOR_REVIEW')); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.put('/:id/review-ready', async (req, res) => {
  try { const c = client(req), order = await getOrder(c, req.params.id); if (!order || order.buyer_id !== req.user.id) return res.status(404).json({ error: 'Order not found.' }); if (order.status !== 'READY_FOR_REVIEW') return res.status(400).json({ error: 'The product is not awaiting review.' }); const approved = req.body?.approved === true; const status = approved ? 'READY_FOR_DISPATCH' : 'CORRECTION_REQUESTED'; await c.from('product_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', order.id); await audit(c, order.id, req.user.id, approved ? 'buyer_approved_ready_product' : 'buyer_requested_correction', { status: order.status }, { status }, req.body?.reason || null); await notify(c, { userId: order.seller_id, type: approved ? 'ready_for_dispatch' : 'correction_requested', title: approved ? 'Product approved for dispatch' : 'Correction requested', body: req.body?.reason || `Order ${order.order_code} status updated.`, link: '/orders.html' }); res.json(nextStatus(order, status)); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.put('/:id/confirm-delivery', async (req, res) => {
  try { const c = client(req), order = await getOrder(c, req.params.id); if (!order || order.buyer_id !== req.user.id) return res.status(404).json({ error: 'Order not found.' }); if (!['DELIVERED','BUYER_CONFIRMATION_PENDING'].includes(order.status)) return res.status(400).json({ error: 'Delivery has not been verified yet.' }); await c.from('product_orders').update({ status: 'COMPLETED', updated_at: new Date().toISOString() }).eq('id', order.id); await audit(c, order.id, req.user.id, 'buyer_confirmed_delivery', { status: order.status }, { status: 'COMPLETED' }); res.json(nextStatus(order, 'COMPLETED')); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/:id/refund-request', async (req, res) => {
  try { const c = client(req), order = await getOrder(c, req.params.id); if (!order || order.buyer_id !== req.user.id) return res.status(404).json({ error: 'Order not found.' }); if (!['PAYMENT_VERIFIED','READY_FOR_DISPATCH','DISPATCHED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','BUYER_CONFIRMATION_PENDING'].includes(canonicalState(order))) return res.status(409).json({ error: 'This order cannot enter refund review at its current stage.' }); const result = await transition(c, order, 'REFUND_REQUESTED', req.user.id, 'buyer', 'REFUND_REQUESTED', { reason: req.body?.reason || null }); await notify(c, { userId: order.seller_id, type: 'refund_requested', title: 'Refund requested', body: `A refund review was requested for ${order.order_code}.`, link: `/order.html?id=${order.id}` }); res.status(201).json(result); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.put('/:id/refund-review', async (req, res) => {
  try { if (!admin(req)) return res.status(403).json({ error: 'Finance or superadmin permission is required.' }); const c = client(req), order = await getOrder(c, req.params.id); if (!order) return res.status(404).json({ error: 'Order not found.' }); if (canonicalState(order) !== 'REFUND_REQUESTED') return res.status(409).json({ error: 'This order is not awaiting refund review.' }); const approved = req.body?.approved === true; const result = await transition(c, order, approved ? 'REFUND_APPROVED' : 'REFUND_REJECTED', req.user.id, 'admin', approved ? 'REFUND_APPROVED' : 'REFUND_REJECTED', { reason: req.body?.reason || null }); if (approved) await c.from('payment_transactions').update({ status: 'REFUND_APPROVED', updated_at: new Date().toISOString() }).eq('order_id', order.id); await notify(c, { userId: order.buyer_id, type: approved ? 'refund_approved' : 'refund_rejected', title: approved ? 'Refund approved for processing' : 'Refund request rejected', body: req.body?.reason || '', link: `/order.html?id=${order.id}` }); res.json(result); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/:id/reviews', async (req, res) => {
  try { const c = client(req), order = await getOrder(c, req.params.id); if (!order || order.buyer_id !== req.user.id || order.status !== 'COMPLETED') return res.status(403).json({ error: 'Only the buyer of a completed order can review it.' }); const item = order.product_order_items[0], b = req.body || {}; if (!Number.isInteger(Number(b.rating)) || Number(b.rating) < 1 || Number(b.rating) > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5.' }); const { data, error } = await c.from('product_reviews').insert({ order_item_id: item.id, product_id: item.product_id, buyer_id: req.user.id, rating: Number(b.rating), comment: b.comment || null, image_urls: b.image_urls || [] }).select().single(); if (error) throw error; const { data: ratings } = await c.from('product_reviews').select('rating').eq('product_id', item.product_id); const avg = (ratings || []).reduce((sum, row) => sum + Number(row.rating), 0) / (ratings || []).length; await c.from('products').update({ rating: +avg.toFixed(2), review_count: (ratings || []).length }).eq('id', item.product_id); res.status(201).json(data); } catch (e) { res.status(400).json({ error: e.message }); }
});
module.exports = router;
