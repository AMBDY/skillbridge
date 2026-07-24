const router = require('express').Router();
const { supabase, createAuthedClient } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');
const { notify } = require('../utils/notify');

function authedClient(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  return createAuthedClient(token);
}

async function attachProfiles(items, fk) {
  if (!items || !items.length) return [];
  const ids = [...new Set(items.map(i => i[fk]).filter(Boolean))];
  if (!ids.length) return items;
  const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, profile_image, rating, kyc_level, subscription_tier, is_online').in('user_id', ids);
  const map = new Map((profiles || []).map(p => [p.user_id, p]));
  return items.map(i => ({ ...i, profiles: map.get(i[fk]) || null }));
}

async function attachCategories(items, fk) {
  if (!items || !items.length) return [];
  const ids = [...new Set(items.map(i => i[fk]).filter(Boolean))];
  if (!ids.length) return items;
  const { data: cats } = await supabase.from('categories').select('id, name, slug, ecosystem').in('id', ids);
  const map = new Map((cats || []).map(c => [c.id, c]));
  return items.map(i => ({ ...i, categories: map.get(i[fk]) || null }));
}

// List jobs
router.get('/', async (req, res) => {
  const { category_id, status, search } = req.query;
  let q = supabase.from('jobs').select('*');
  if (category_id) q = q.eq('category_id', category_id);
  if (status) q = q.eq('status', status);
  else q = q.in('status', ['approved', 'open', 'assigned', 'completed']);
  if (search) q = q.ilike('title', `%${search}%`);
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q.limit(50);
  if (error) return res.status(400).json({ error: error.message });
  let enriched = await attachProfiles(data, 'user_id');
  enriched = await attachCategories(enriched, 'category_id');
  res.json(enriched);
});

router.get('/mine', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('jobs').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// Single job
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase.from('jobs').select('*').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });
  const [withProfile] = await attachProfiles([data], 'user_id');
  const [withCat] = await attachCategories([withProfile], 'category_id');
  const { data: bids } = await supabase.from('job_bids').select('*').eq('job_id', req.params.id);
  const bidUserIds = (bids || []).map(b => b.user_id).filter(Boolean);
  let bidsEnriched = bids || [];
  if (bidUserIds.length) {
    const { data: bidProfiles } = await supabase.from('profiles').select('user_id, display_name, profile_image, rating').in('user_id', bidUserIds);
    const pmap = new Map((bidProfiles || []).map(p => [p.user_id, p]));
    bidsEnriched = bids.map(b => ({ ...b, user: pmap.get(b.user_id) || null }));
  }
  res.json({ ...withCat, bids: bidsEnriched });
});

// Create job
router.post('/', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('jobs').insert({
    user_id: req.user.id, ...req.body, status: 'pending'
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Update job
router.put('/:id', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('jobs').update(req.body).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Job lifecycle actions
router.put('/:id/pause', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data: job } = await c.from('jobs').select('status').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!['approved', 'open'].includes(job.status)) return res.status(400).json({ error: 'Only an approved/open job can be paused.' });
  const { data, error } = await c.from('jobs').update({ status: 'paused' }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/:id/reopen', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data: job } = await c.from('jobs').select('status').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!['paused', 'closed'].includes(job.status)) return res.status(400).json({ error: 'Only a paused/closed job can be reopened.' });
  const { data, error } = await c.from('jobs').update({ status: 'open' }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/:id/close', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data: job } = await c.from('jobs').select('status').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (['completed', 'cancelled'].includes(job.status)) return res.status(400).json({ error: 'This job is already finished.' });
  const { data, error } = await c.from('jobs').update({ status: 'closed' }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.post('/:id/duplicate', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data: job } = await c.from('jobs').select('*').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const { id, created_at, status, assigned_to, screening_mode, ai_screening_enabled, ...rest } = job;
  const { data, error } = await c.from('jobs').insert({ ...rest, status: 'pending' }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Bids
router.post('/:id/bids', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { amount, message, duration } = req.body;
  const { data, error } = await c.from('job_bids').insert({
    job_id: req.params.id, user_id: req.user.id, amount, message, duration
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  const { data: job } = await supabase.from('jobs').select('user_id, title').eq('id', req.params.id).maybeSingle();
  if (job) await notify(c, { userId: job.user_id, type: 'new_bid', title: 'New bid on your job', body: `Someone bid ${amount} on "${job.title}"`, link: `/job.html?id=${req.params.id}` });
  res.json(data);
});

// Agreements
router.post('/agreements', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { job_id, worker_id, details, price, timeline } = req.body;
  const { data: settings } = await supabase.from('platform_settings').select('service_fee_percent').limit(1).maybeSingle();
  const fee = settings?.service_fee_percent || 10;
  const { data, error } = await c.from('agreements').insert({
    job_id, client_id: req.user.id, worker_id, details, price, timeline, service_fee_percent: fee
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/agreements/:id', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { client_agreed, worker_agreed, locked, sealed } = req.body;
  const { data, error } = await c.from('agreements').update({
    client_agreed, worker_agreed, locked, sealed
  }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── Job Recruitment: applications ──────────────────────────────────────────

// Apply to a job (any signed-in freelancer/worker/seller)
router.post('/:id/apply', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data: job } = await supabase.from('jobs').select('*').eq('id', req.params.id).maybeSingle();
  if (!job) return res.status(404).json({ error: 'Not found' });
  if (!['approved', 'open'].includes(job.status)) return res.status(400).json({ error: 'This job is not open for applications' });

  const { cover_letter, expected_price, duration, portfolio_url, resume_url, attachments } = req.body;
  const { data, error } = await c.from('job_applications').insert({
    job_id: job.id, applicant_id: req.user.id, cover_letter, expected_price, duration, portfolio_url, resume_url, attachments
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });

  // If the client has paid for AI screening and set it to automatic, score this application immediately.
  if (job.ai_screening_enabled && job.screening_mode === 'automatic') {
    const { data: applicant } = await supabase.from('profiles').select('*').eq('user_id', req.user.id).maybeSingle();
    const { scoreJobApplication } = require('../utils/scoring');
    const { score, reasons } = scoreJobApplication(job, applicant, data);
    await c.from('job_applications').update({ ai_score: score, ai_reasons: reasons, status: 'screened', screened_at: new Date().toISOString() }).eq('id', data.id);
  }
  await notify(c, { userId: job.user_id, type: 'new_application', title: 'New job application', body: `Someone applied to "${job.title}"`, link: `/applications.html?job=${job.id}` });
  res.json(data);
});

// Client: list applications for one of their jobs (with AI scores, sorted best-first)
router.get('/:id/applications', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data: job } = await c.from('jobs').select('*').eq('id', req.params.id).maybeSingle();
  if (!job) return res.status(404).json({ error: 'Not found' });
  if (job.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Only the job owner can view applicants' });

  const { data, error } = await c.from('job_applications').select('*').eq('job_id', req.params.id)
    .order('ai_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  const ids = (data || []).map(a => a.applicant_id).filter(Boolean);
  const { data: profiles } = ids.length ? await supabase.from('profiles').select('user_id, display_name, profile_image, rating, kyc_level, completion_rate, subscription_tier, state').in('user_id', ids) : { data: [] };
  const map = new Map((profiles || []).map(p => [p.user_id, p]));
  res.json({ job, applications: (data || []).map(a => ({ ...a, applicant: map.get(a.applicant_id) || null })) });
});

// Client: request AI screening for a job — creates a pending payment for the AI screening fee.
// The frontend redirects to the normal payment flow; once admin releases that payment,
// ai_screening_enabled is flipped on (see server/routes/admin.js).
router.post('/:id/request-ai-screening', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data: job } = await c.from('jobs').select('*').eq('id', req.params.id).maybeSingle();
  if (!job) return res.status(404).json({ error: 'Not found' });
  if (job.user_id !== req.user.id) return res.status(403).json({ error: 'Only the job owner can request AI screening' });
  if (job.ai_screening_enabled) return res.status(400).json({ error: 'AI screening is already enabled for this job' });

  const { data: settings } = await supabase.from('platform_settings').select('ai_screening_fee').limit(1).maybeSingle();
  const fee = settings?.ai_screening_fee ?? 2000;
  const { data: payment, error } = await c.from('payments').insert({
    job_id: job.id, client_id: req.user.id, amount: fee, purpose: 'ai_screening', payment_method: 'fiat_naira', status: 'pending'
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ payment, fee });
});

// Client: set manual vs automatic screening (only once AI screening is enabled)
router.put('/:id/screening-mode', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data: job } = await c.from('jobs').select('*').eq('id', req.params.id).maybeSingle();
  if (!job) return res.status(404).json({ error: 'Not found' });
  if (job.user_id !== req.user.id) return res.status(403).json({ error: 'Only the job owner can change this' });
  if (!job.ai_screening_enabled) return res.status(400).json({ error: 'AI screening is not enabled for this job yet' });
  const { screening_mode } = req.body;
  if (!['manual', 'automatic'].includes(screening_mode)) return res.status(400).json({ error: 'Invalid screening mode' });
  const { data, error } = await c.from('jobs').update({ screening_mode }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Client: run screening now (manual mode) — screens all un-screened applications, or a chosen subset.
router.post('/:id/screen', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data: job } = await c.from('jobs').select('*').eq('id', req.params.id).maybeSingle();
  if (!job) return res.status(404).json({ error: 'Not found' });
  if (job.user_id !== req.user.id) return res.status(403).json({ error: 'Only the job owner can run screening' });
  if (!job.ai_screening_enabled) return res.status(400).json({ error: 'AI screening is not enabled for this job. Request it first — it attracts an additional fee.' });

  const { applicant_ids } = req.body || {};
  let q = c.from('job_applications').select('*').eq('job_id', job.id);
  q = applicant_ids?.length ? q.in('applicant_id', applicant_ids) : q.eq('status', 'submitted');
  const { data: applications, error } = await q;
  if (error) return res.status(400).json({ error: error.message });

  const applicantIds = (applications || []).map(a => a.applicant_id);
  const { data: profiles } = applicantIds.length ? await supabase.from('profiles').select('*').in('user_id', applicantIds) : { data: [] };
  const pmap = new Map((profiles || []).map(p => [p.user_id, p]));
  const { scoreJobApplication } = require('../utils/scoring');

  const results = [];
  for (const app of applications || []) {
    const { score, reasons } = scoreJobApplication(job, pmap.get(app.applicant_id), app);
    const { data: updated } = await c.from('job_applications').update({
      ai_score: score, ai_reasons: reasons, status: 'screened', screened_at: new Date().toISOString()
    }).eq('id', app.id).select().single();
    results.push(updated);
  }
  res.json({ screened: results.length, applications: results });
});

// Client: shortlist / reject / hire an applicant
router.put('/applications/:id/status', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { status } = req.body;
  if (!['shortlisted', 'rejected', 'hired'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const { data, error } = await c.from('job_applications').update({ status }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  if (data && status === 'hired') {
    await c.from('jobs').update({ status: 'assigned', assigned_to: data.applicant_id }).eq('id', data.job_id);
  }
  res.json(data);
});

// Client: schedule (or update) an interview with an applicant
router.put('/applications/:id/interview', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { interview_at, interview_link, interview_notes } = req.body;
  const { data, error } = await c.from('job_applications').update({ interview_at, interview_link, interview_notes }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  if (data) await notify(c, { userId: data.applicant_id, type: 'interview_scheduled', title: 'Interview scheduled', body: interview_at ? `Interview set for ${new Date(interview_at).toLocaleString()}` : 'Your interview details were updated', link: '/dashboard.html' });
  res.json(data);
});

module.exports = router;
