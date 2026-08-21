const router = require('express').Router();
const { createAuthedClient } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');
const { notify } = require('../utils/notify');
const { agreementPdf, zip } = require('../utils/document-export');

function client(req) { return createAuthedClient(req.headers.authorization?.replace('Bearer ', '')); }
function isAdmin(req) { return req.user?.role === 'admin'; }
function safeName(value) { return String(value || 'Agreement').replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80); }
async function audit(c, agreementId, actorId, action, previousStatus, nextStatus, note) {
  await c.from('agreement_audit_log').insert({ agreement_id: agreementId, actor_id: actorId, action, previous_status: previousStatus || null, next_status: nextStatus || null, note: note || null });
}
async function refreshStatus(c, agreement) {
  const { data: parties } = await c.from('agreement_parties').select('*').eq('agreement_id', agreement.id);
  const required = (parties || []).filter(p => p.required);
  if (required.length && required.every(p => p.accepted_at)) {
    const { data } = await c.from('agreements').update({ status: 'active', sealed: true, finalized_at: new Date().toISOString() }).eq('id', agreement.id).select().single();
    await audit(c, agreement.id, null, 'all_parties_accepted', agreement.status, 'active');
    return data;
  }
  return agreement;
}

router.use(authMiddleware);

router.get('/mine', async (req, res) => {
  const c = client(req);
  let q = c.from('agreements').select('*, agreement_parties(*), agreement_audit_log(*)').order('created_at', { ascending: false });
  if (req.query.status) q = q.eq('status', req.query.status);
  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.get('/admin', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
  const c = client(req);
  let q = c.from('agreements').select('*, agreement_parties(*), agreement_audit_log(*)').order('created_at', { ascending: false });
  if (req.query.status) q = q.eq('status', req.query.status);
  if (req.query.q) q = q.or(`agreement_number.ilike.%${req.query.q}%,title.ilike.%${req.query.q}%`);
  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.post('/', async (req, res) => {
  const c = client(req);
  const body = req.body || {};
  if (!body.title || !body.worker_id || !body.price) return res.status(400).json({ error: 'Title, worker, and price are required.' });
  const number = `AGR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const { data: agreement, error } = await c.from('agreements').insert({
    job_id: body.job_id || null, client_id: req.user.id, worker_id: body.worker_id, title: body.title,
    agreement_number: number, agreement_type: body.agreement_type || 'service', details: body.details || {},
    price: Number(body.price), timeline: body.timeline || null, status: 'submitted', locked: false, sealed: false
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  const parties = [{ user_id: req.user.id, party_name: body.client_name || 'Client', party_role: 'client' }, { user_id: body.worker_id, party_name: body.worker_name || 'Service provider', party_role: 'worker' }, ...(Array.isArray(body.additional_parties) ? body.additional_parties : [])];
  const { error: partyError } = await c.from('agreement_parties').insert(parties.map(p => ({ agreement_id: agreement.id, user_id: p.user_id || null, party_name: p.party_name || 'Additional party', party_role: p.party_role || 'party', required: p.required !== false })));
  if (partyError) return res.status(400).json({ error: partyError.message });
  await audit(c, agreement.id, req.user.id, 'submitted', 'draft', 'submitted');
  await notify(c, { userId: body.worker_id, type: 'agreement_submitted', title: 'Agreement requires review', body: `${body.title} was submitted for review.`, link: '/agreements.html' });
  res.json(agreement);
});

router.put('/:id/review', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
  const c = client(req); const { action, note } = req.body || {};
  const next = { approve: 'awaiting_acceptance', request_changes: 'changes_requested', reject: 'rejected', cancel: 'cancelled' }[action];
  if (!next) return res.status(400).json({ error: 'Invalid review action.' });
  const { data: before } = await c.from('agreements').select('*').eq('id', req.params.id).maybeSingle();
  if (!before) return res.status(404).json({ error: 'Agreement not found.' });
  const { data, error } = await c.from('agreements').update({ status: next, admin_notes: note || null, locked: next === 'awaiting_acceptance' }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await audit(c, data.id, req.user.id, action, before.status, next, note);
  for (const userId of [data.client_id, data.worker_id]) await notify(c, { userId, type: `agreement_${next}`, title: 'Agreement updated', body: note || `${data.title || 'Agreement'} is now ${next.replace('_', ' ')}.`, link: '/agreements.html' });
  res.json(data);
});

router.put('/:id/respond', async (req, res) => {
  const c = client(req); const { accept, note } = req.body || {};
  const { data: agreement } = await c.from('agreements').select('*').eq('id', req.params.id).maybeSingle();
  if (!agreement) return res.status(404).json({ error: 'Agreement not found.' });
  if (agreement.status !== 'awaiting_acceptance') return res.status(400).json({ error: 'This agreement is not awaiting acceptance.' });
  const values = accept ? { accepted_at: new Date().toISOString(), declined_at: null, response_note: note || null } : { declined_at: new Date().toISOString(), accepted_at: null, response_note: note || null };
  const { error } = await c.from('agreement_parties').update(values).eq('agreement_id', agreement.id).eq('user_id', req.user.id);
  if (error) return res.status(400).json({ error: error.message });
  if (!accept) {
    await c.from('agreements').update({ status: 'changes_requested', locked: false }).eq('id', agreement.id);
    await audit(c, agreement.id, req.user.id, 'declined_or_requested_changes', 'awaiting_acceptance', 'changes_requested', note);
    return res.json({ status: 'changes_requested' });
  }
  await audit(c, agreement.id, req.user.id, 'accepted', 'awaiting_acceptance', 'awaiting_acceptance', note);
  res.json(await refreshStatus(c, agreement));
});

router.put('/:id/complete', async (req, res) => {
  const c = client(req); const { data: before } = await c.from('agreements').select('*').eq('id', req.params.id).maybeSingle();
  if (!before) return res.status(404).json({ error: 'Agreement not found.' });
  if (before.status !== 'active') return res.status(400).json({ error: 'Only active agreements can be completed.' });
  const date = new Date(); const filename = `${safeName(req.body?.client_name || 'Client')} - ${safeName(before.agreement_type)} - ${date.toLocaleDateString('en-GB').replace(/\//g, '-') } - ${before.agreement_number}`;
  const { data, error } = await c.from('agreements').update({ status: 'completed', completion_at: date.toISOString(), completed_filename: filename }).eq('id', before.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await audit(c, data.id, req.user.id, 'completed', 'active', 'completed');
  res.json(data);
});

router.get('/admin/archives', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
  const { data, error } = await client(req).from('agreement_archives').select('*').order('archive_month', { ascending: false });
  if (error) return res.status(400).json({ error: error.message }); res.json(data || []);
});

router.post('/admin/archives/:month', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
  const c = client(req); const month = `${req.params.month}-01`;
  const start = new Date(`${req.params.month}-01T00:00:00Z`); const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const { data: agreements, error } = await c.from('agreements').select('id').eq('status', 'completed').gte('completion_at', start.toISOString()).lt('completion_at', end.toISOString());
  if (error) return res.status(400).json({ error: error.message });
  const { data, error: archiveError } = await c.from('agreement_archives').upsert({ archive_month: month, agreement_count: (agreements || []).length, created_by: req.user.id }, { onConflict: 'archive_month' }).select().single();
  if (archiveError) return res.status(400).json({ error: archiveError.message });
  res.json({ archive: data, agreements: agreements || [] });
});

router.get('/:id/pdf', async (req, res) => {
  const c = client(req);
  const { data: agreement, error } = await c.from('agreements').select('*').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!agreement) return res.status(404).json({ error: 'Agreement not found.' });
  const [{ data: parties }, { data: auditLog }] = await Promise.all([
    c.from('agreement_parties').select('*').eq('agreement_id', agreement.id),
    c.from('agreement_audit_log').select('*').eq('agreement_id', agreement.id).order('created_at')
  ]);
  const filename = `${safeName(agreement.completed_filename || agreement.agreement_number || 'agreement')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${filename}"`); res.send(agreementPdf(agreement, parties || [], auditLog || []));
});

router.get('/admin/archives/:month/download', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
  if (!/^\d{4}-\d{2}$/.test(req.params.month)) return res.status(400).json({ error: 'Month must be YYYY-MM.' });
  const c = client(req); const start = new Date(`${req.params.month}-01T00:00:00Z`); const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const { data: agreements, error } = await c.from('agreements').select('*').eq('status', 'completed').gte('completion_at', start.toISOString()).lt('completion_at', end.toISOString()).order('completion_at');
  if (error) return res.status(400).json({ error: error.message });
  const files = [];
  for (const agreement of agreements || []) {
    const [{ data: parties }, { data: auditLog }] = await Promise.all([c.from('agreement_parties').select('*').eq('agreement_id', agreement.id), c.from('agreement_audit_log').select('*').eq('agreement_id', agreement.id).order('created_at')]);
    files.push({ name: `${safeName(agreement.completed_filename || agreement.agreement_number)}.pdf`, data: agreementPdf(agreement, parties || [], auditLog || []) });
  }
  const archive = zip(files); const title = `AGREEMENTS - ${start.toLocaleString('en', { month: 'long', year: 'numeric' }).toUpperCase()}.zip`;
  res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Disposition', `attachment; filename="${title}"`); res.send(archive);
});

module.exports = router;
