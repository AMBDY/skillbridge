const router = require('express').Router();
const { supabase, createAuthedClient } = require('../utils/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { notify } = require('../utils/notify');
const { sendEmail } = require('../utils/email');

// All admin routes require auth + admin role
router.use(authMiddleware, adminOnly);

// Helper: get an authenticated client for the current user
function authedClient(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  return createAuthedClient(token);
}

async function profilesByIds(client, ids) {
  if (!ids || !ids.length) return new Map();
  const { data } = await client.from('profiles').select('user_id, display_name, email, profile_image, rating, kyc_level, subscription_tier, role').in('user_id', ids);
  return new Map((data || []).map(p => [p.user_id, p]));
}

// Overview stats
router.get('/overview', async (req, res) => {
  const c = authedClient(req);
  const [users, jobs, payments, disputes, kyc, subs] = await Promise.all([
    c.from('profiles').select('id', { count: 'exact', head: true }),
    c.from('jobs').select('id', { count: 'exact', head: true }),
    c.from('payments').select('amount, service_fee, status'),
    c.from('disputes').select('id, status', { count: 'exact', head: true }),
    c.from('kyc_submissions').select('id', { count: 'exact', head: true }),
    c.from('subscriptions').select('id', { count: 'exact', head: true })
  ]);
  const revenue = payments.data?.filter(p => p.status === 'released').reduce((s, p) => s + Number(p.service_fee || 0), 0) || 0;
  res.json({ users: users.count || 0, jobs: jobs.count || 0, revenue, disputes: disputes.count || 0, kycPending: kyc.count || 0, subsPending: subs.count || 0 });
});

// Users
router.get('/users', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('profiles').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/users/:id', async (req, res) => {
  const c = authedClient(req);
  const { reason, ...updates } = req.body;
  if (updates.role !== undefined) {
    const { data: role } = await c.from('platform_roles').select('role_key').eq('role_key', updates.role).maybeSingle();
    if (!role) return res.status(400).json({ error: 'Choose a configured platform role.' });
  }
  const { data, error } = await c.from('profiles').update(updates).eq('user_id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  if (data && updates.account_status && updates.account_status !== 'active') {
    await notify(c, {
      userId: req.params.id, type: `account_${updates.account_status}`, title: `Account ${updates.account_status}`,
      body: reason ? `Your account has been ${updates.account_status}. Reason: ${reason}` : `Your account has been ${updates.account_status}.`,
      link: '/support.html'
    });
  }
  if (data && updates.account_status === 'active') {
    await notify(c, { userId: req.params.id, type: 'account_restored', title: 'Account restored', body: 'Your account is back to normal standing.', link: '/dashboard.html' });
  }
  res.json(data);
});

// KYC review
router.get('/kyc', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('kyc_submissions').select('*').eq('status', 'pending').order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  const ids = (data || []).map(k => k.user_id).filter(Boolean);
  const pmap = await profilesByIds(c, ids);
  res.json((data || []).map(k => ({ ...k, user: pmap.get(k.user_id) || null })));
});

router.put('/kyc/:id', async (req, res) => {
  const c = authedClient(req);
  const { status, reviewer_note } = req.body;
  const { data: kyc } = await c.from('kyc_submissions').update({ status, reviewer_note }).eq('id', req.params.id).select().single();
  if (kyc && status === 'approved') {
    await c.from('profiles').update({ kyc_level: 3 }).eq('user_id', kyc.user_id);
    await notify(c, { userId: kyc.user_id, type: 'kyc_approved', title: 'Identity verified', body: 'Your KYC verification was approved.', link: '/dashboard.html' });
    const { data: userProfile } = await c.from('profiles').select('email, display_name').eq('user_id', kyc.user_id).maybeSingle();
    if (userProfile?.email) sendEmail('kyc_approved', userProfile.email, { name: userProfile.display_name }).catch(() => {});
  }
  if (kyc && status === 'rejected') {
    await notify(c, {
      userId: kyc.user_id, type: 'kyc_rejected', title: 'KYC verification rejected',
      body: reviewer_note ? `Your KYC submission was rejected. Reason: ${reviewer_note}` : 'Your KYC submission was rejected.',
      link: '/kyc.html'
    });
  }
  res.json(kyc);
});

// Job moderation
router.get('/jobs', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('jobs').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(400).json({ error: error.message });
  const ids = (data || []).map(j => j.user_id).filter(Boolean);
  const pmap = await profilesByIds(c, ids);
  res.json((data || []).map(j => ({ ...j, profiles: pmap.get(j.user_id) || null })));
});

router.put('/jobs/:id/status', async (req, res) => {
  const c = authedClient(req);
  const { status, reason } = req.body;
  const { data: before } = await c.from('jobs').select('*').eq('id', req.params.id).maybeSingle();
  if (!before) return res.status(404).json({ error: 'Job not found.' });
  // Rejection is final: notify the poster first, then remove the job from the
  // public and poster views. It is deliberately not retained as an owner delete.
  if (status === 'cancelled') {
    await notify(c, { userId: before.user_id, type: 'job_rejected', title: 'Job rejected', body: reason ? `"${before.title}" was rejected. Reason: ${reason}` : `"${before.title}" was rejected.`, link: '/dashboard.html' });
    const { error } = await c.from('jobs').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ ok: true, deleted: true });
  }
  const { data, error } = await c.from('jobs').update({ status }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  if (data) {
    const label = status === 'approved' ? 'approved' : status === 'cancelled' ? 'rejected' : status;
    await notify(c, {
      userId: data.user_id, type: `job_${status}`, title: `Job ${label}`,
      body: reason ? `"${data.title}" was ${label}. Reason: ${reason}` : `"${data.title}" was ${label}.`,
      link: `/job.html?id=${data.id}`
    });
  }
  res.json(data);
});

// Permanent administrator purge for an owner-deleted job, including its files.
router.delete('/jobs/:id', async (req, res) => {
  const c = authedClient(req);
  const { data: job } = await c.from('jobs').select('user_id, reference_images').eq('id', req.params.id).maybeSingle();
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  const { error } = await c.from('jobs').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  const marker = '/storage/v1/object/public/kyc/';
  const paths = (job.reference_images || []).map(url => { const i = String(url).indexOf(marker); return i < 0 ? null : decodeURIComponent(String(url).slice(i + marker.length).split('?')[0]); }).filter(p => p && p.startsWith(`${job.user_id}/`));
  if (paths.length) await c.storage.from('kyc').remove(paths);
  res.json({ ok: true });
});

router.put('/jobs/:id', async (req, res) => {
  const c = authedClient(req);
  const allowed = ['title', 'description', 'budget', 'duration', 'location', 'state', 'additional_notes', 'reference_images', 'status'];
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'No editable job fields supplied.' });
  const { data, error } = await c.from('jobs').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Disputes
router.get('/disputes', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('disputes').select('*').order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.put('/disputes/:id', async (req, res) => {
  const c = authedClient(req);
  const { status, resolution } = req.body;
  const { data, error } = await c.from('disputes').update({ status, resolution }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  if (data) {
    await notify(c, { userId: data.raised_by, type: 'dispute_update', title: 'Dispute updated', body: resolution || `Your dispute status is now: ${status}`, link: '/dispute.html' });
    const { data: userProfile } = await c.from('profiles').select('email, display_name').eq('user_id', data.raised_by).maybeSingle();
    if (userProfile?.email) sendEmail('dispute_update', userProfile.email, { name: userProfile.display_name, message: resolution || `Status: ${status}` }).catch(() => {});
  }
  res.json(data);
});

router.delete('/disputes/:id', async (req, res) => {
  const c = authedClient(req);
  const { error } = await c.from('disputes').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Payments
router.get('/payments', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('payments').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(400).json({ error: error.message });
  const ids = [...new Set((data || []).flatMap(p => [p.client_id, p.worker_id]).filter(Boolean))];
  const pmap = await profilesByIds(c, ids);
  res.json((data || []).map(p => ({ ...p, client: pmap.get(p.client_id) || null, worker: pmap.get(p.worker_id) || null })));
});

router.put('/payments/:id/release', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('payments').update({ status: 'released', released_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  if (data && data.purpose === 'ai_screening' && data.job_id) {
    await c.from('jobs').update({ ai_screening_enabled: true }).eq('id', data.job_id);
  }
  if (data && data.purpose === 'escrow' && data.worker_id) {
    await notify(c, { userId: data.worker_id, type: 'payment_released', title: 'Payment released', body: `${data.amount} has been released to you.`, link: '/payments.html' });
    const { data: workerProfile } = await c.from('profiles').select('email, display_name').eq('user_id', data.worker_id).maybeSingle();
    if (workerProfile?.email) sendEmail('payment_released', workerProfile.email, { name: workerProfile.display_name, amount: data.amount }).catch(() => {});
  }
  res.json(data);
});

// Subscriptions
router.get('/subscriptions', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('subscriptions').select('*').eq('status', 'pending').order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  const ids = (data || []).map(s => s.user_id).filter(Boolean);
  const pmap = await profilesByIds(c, ids);
  res.json((data || []).map(s => ({ ...s, user: pmap.get(s.user_id) || null })));
});

router.put('/subscriptions/:id', async (req, res) => {
  const c = authedClient(req);
  const { status, reason } = req.body;
  const { data: sub } = await c.from('subscriptions').update({ status }).eq('id', req.params.id).select().single();
  if (sub && status === 'approved') {
    await c.from('profiles').update({ subscription_tier: sub.tier }).eq('user_id', sub.user_id);
    await notify(c, { userId: sub.user_id, type: 'subscription_approved', title: 'Subscription approved', body: `Your ${sub.tier} plan is now active.`, link: '/dashboard.html' });
  }
  if (sub && (status === 'rejected' || status === 'refunded')) {
    await notify(c, {
      userId: sub.user_id, type: `subscription_${status}`, title: `Subscription ${status}`,
      body: reason ? `Your ${sub.tier} plan request was ${status}. Reason: ${reason}` : `Your ${sub.tier} plan request was ${status}.`,
      link: '/subscribe.html'
    });
  }
  res.json(sub);
});

// Blog / News
router.get('/blog', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('blog_posts').select('*').order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.post('/blog', async (req, res) => {
  const c = authedClient(req);
  const payload = { ...req.body, author_id: req.user.id };
  if (payload.status === 'published' && !payload.published_at) payload.published_at = new Date().toISOString();
  const { data, error } = await c.from('blog_posts').insert(payload).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/blog/:id', async (req, res) => {
  const c = authedClient(req);
  const payload = { ...req.body };
  if (payload.status === 'published') {
    const { data: existing } = await c.from('blog_posts').select('published_at').eq('id', req.params.id).maybeSingle();
    if (!existing?.published_at) payload.published_at = new Date().toISOString();
  }
  const { data, error } = await c.from('blog_posts').update(payload).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/blog/:id', async (req, res) => {
  const c = authedClient(req);
  const { error } = await c.from('blog_posts').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Google AdSense units (real Google ad network — distinct from the custom ads/featured system above)
router.get('/adsense-units', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('adsense_units').select('*').order('placement');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.post('/adsense-units', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('adsense_units').insert(req.body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/adsense-units/:id', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('adsense_units').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/adsense-units/:id', async (req, res) => {
  const c = authedClient(req);
  const { error } = await c.from('adsense_units').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Email Templates
router.get('/email-templates', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('email_templates').select('*').order('template_key');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.put('/email-templates/:id', async (req, res) => {
  const c = authedClient(req);
  const { subject, body } = req.body;
  const { data, error } = await c.from('email_templates').update({ subject, body, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Read-only API key status — never exposes actual key values, just whether
// each provider is configured. Deliberately not a "vault" that stores raw
// secrets in the database: env vars are already the correct, secure place
// for these, and duplicating them into a DB table (even encrypted) would be
// a downgrade in practice, not an upgrade.
router.get('/api-keys-status', (req, res) => {
  const config = require('../services/ai/config');
  const mask = (key) => key ? `••••${String(key).slice(-4)}` : null;
  res.json({
    openai: { configured: config.providers.openai.enabled, masked: mask(config.providers.openai.key) },
    gemini: { configured: config.providers.gemini.enabled, masked: mask(config.providers.gemini.key) },
    groq: { configured: config.providers.groq.enabled, masked: mask(config.providers.groq.key) },
    googleVision: { configured: config.providers.googleVision.enabled, masked: mask(config.providers.googleVision.key) },
    googleTranslate: { configured: config.providers.googleTranslate.enabled, masked: mask(config.providers.googleTranslate.key) },
    textract: { configured: config.providers.textract.enabled, masked: config.providers.textract.accessKeyId ? mask(config.providers.textract.accessKeyId) : null },
    whisper: { configured: config.providers.whisper.enabled, masked: mask(config.providers.whisper.key) },
    resendEmail: { configured: !!process.env.RESEND_API_KEY, masked: mask(process.env.RESEND_API_KEY) },
    supabaseServiceRole: { configured: !!process.env.SUPABASE_SERVICE_ROLE_KEY, masked: mask(process.env.SUPABASE_SERVICE_ROLE_KEY) }
  });
});

router.get('/fraud-flags', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('fraud_flags').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(400).json({ error: error.message });
  const ids = [...new Set((data || []).map(f => f.user_id).filter(Boolean))];
  const { data: profiles } = ids.length ? await c.from('profiles').select('user_id, display_name, email').in('user_id', ids) : { data: [] };
  const map = new Map((profiles || []).map(p => [p.user_id, p]));
  res.json((data || []).map(f => ({ ...f, profile: map.get(f.user_id) || null })));
});

router.put('/fraud-flags/:id/resolve', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('fraud_flags').update({ resolved: true }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Listing Moderation (products & services)
router.get('/listings/pending', async (req, res) => {
  const c = authedClient(req);
  const [products, services] = await Promise.all([
    c.from('products').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
    c.from('services').select('*').eq('status', 'pending').order('created_at', { ascending: false })
  ]);
  res.json({ products: products.data || [], services: services.data || [] });
});

router.get('/listings/all', async (req, res) => {
  const c = authedClient(req);
  const [products, services] = await Promise.all([
    c.from('products').select('*').order('created_at', { ascending: false }),
    c.from('services').select('*').order('created_at', { ascending: false })
  ]);
  res.json({ products: products.data || [], services: services.data || [] });
});

// Site taxonomy and form configuration are admin-controlled, not hard-coded
// into the public interface.
router.get('/categories', async (req, res) => {
  const { data, error } = await authedClient(req).from('categories').select('*').order('ecosystem').order('sort_order');
  if (error) return res.status(400).json({ error: error.message }); res.json(data || []);
});
router.post('/categories', async (req, res) => {
  const b = req.body || {}; if (!b.name || !b.ecosystem) return res.status(400).json({ error: 'Category name and ecosystem are required.' });
  const slug = String(b.slug || b.name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const { data, error } = await authedClient(req).from('categories').insert({ name: b.name, slug, ecosystem: b.ecosystem, description: b.description || null, icon: b.icon || null, sort_order: Number(b.sort_order || 0), is_active: b.is_active !== false }).select().single();
  if (error) return res.status(400).json({ error: error.message }); res.status(201).json(data);
});
router.put('/categories/:id', async (req, res) => {
  const allowed = ['name','slug','ecosystem','description','icon','sort_order','is_active']; const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
  const { data, error } = await authedClient(req).from('categories').update(patch).eq('id', req.params.id).select().single(); if (error) return res.status(400).json({ error: error.message }); res.json(data);
});
router.delete('/categories/:id', async (req, res) => {
  const c = authedClient(req); const [{ count: products }, { count: services }, { count: jobs }] = await Promise.all([c.from('products').select('id',{count:'exact',head:true}).eq('category_id',req.params.id),c.from('services').select('id',{count:'exact',head:true}).eq('category_id',req.params.id),c.from('jobs').select('id',{count:'exact',head:true}).eq('category_id',req.params.id)]);
  if ((products || 0) + (services || 0) + (jobs || 0) > 0) return res.status(400).json({ error: 'This category is in use. Disable it instead of deleting it.' }); const { error } = await c.from('categories').delete().eq('id',req.params.id); if (error) return res.status(400).json({ error: error.message }); res.json({ ok:true });
});
router.get('/form-controls', async (req, res) => { const { data, error } = await authedClient(req).from('form_field_controls').select('*').order('form_key').order('sort_order'); if (error) return res.status(400).json({ error:error.message }); res.json(data || []); });
router.put('/form-controls/:formKey/:fieldKey', async (req, res) => { const b=req.body || {}; const { data,error }=await authedClient(req).from('form_field_controls').upsert({form_key:req.params.formKey,field_key:req.params.fieldKey,label:b.label||null,help_text:b.help_text||null,is_visible:b.is_visible!==false,is_required:b.is_required===true,sort_order:Number(b.sort_order||0),updated_by:req.user.id,updated_at:new Date().toISOString()},{onConflict:'form_key,field_key'}).select().single(); if(error)return res.status(400).json({error:error.message});res.json(data); });

router.put('/listings/:type/:id/status', async (req, res) => {
  const { type, id } = req.params;
  if (!['products', 'services'].includes(type)) return res.status(400).json({ error: 'Invalid listing type' });
  const { status, reason } = req.body;
  if (!['active', 'rejected', 'paused', 'deleted'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const c = authedClient(req);
  const { data, error } = await c.from(type).update({ status }).eq('id', id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  const labels = { active: 'approved and is now live', rejected: 'rejected', paused: 'paused', deleted: 'discontinued' };
  if (data) {
    await notify(c, {
      userId: data.user_id, type: `listing_${status}`, title: `Listing ${status}`,
      body: reason ? `"${data.title}" was ${labels[status]}. Reason: ${reason}` : `"${data.title}" was ${labels[status]}.`,
      link: '/dashboard.html'
    });
  }
  res.json(data);
});

// Broadcast messaging — real notification to every account, or a role subset
router.post('/broadcast', async (req, res) => {
  const c = authedClient(req);
  const { title, body, target_role } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and message are required.' });

  let q = c.from('profiles').select('user_id');
  if (target_role && target_role !== 'all') q = q.eq('role', target_role);
  const { data: targets, error } = await q;
  if (error) return res.status(400).json({ error: error.message });

  let sent = 0;
  for (const t of targets || []) {
    await notify(c, { userId: t.user_id, type: 'announcement', title, body, link: '/dashboard.html' });
    sent++;
  }
  res.json({ sent });
});

// Site Content (CMS-style key/value blocks)
router.get('/site-content', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('site_content').select('*').order('page_key', { ascending: true });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.put('/site-content', async (req, res) => {
  const c = authedClient(req);
  const { page_key, section_key, content_type, value } = req.body;
  if (!page_key || !section_key) return res.status(400).json({ error: 'page_key and section_key are required' });
  const { data, error } = await c.from('site_content')
    .upsert({ page_key, section_key, content_type: content_type || 'text', value, updated_by: req.user.id, updated_at: new Date().toISOString() }, { onConflict: 'page_key,section_key' })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/site-content/:id', async (req, res) => {
  const c = authedClient(req);
  const { error } = await c.from('site_content').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Testimonials moderation
router.get('/testimonials', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('testimonials').select('*').order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.put('/testimonials/:id', async (req, res) => {
  const c = authedClient(req);
  const { status } = req.body;
  const { data, error } = await c.from('testimonials').update({ status }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/testimonials/:id', async (req, res) => {
  const c = authedClient(req);
  const { error } = await c.from('testimonials').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Featured Items — search helper so the admin can find a service/product/job to feature without pasting raw UUIDs
router.get('/featured/search', async (req, res) => {
  const c = authedClient(req);
  const { type, q } = req.query;
  const table = type === 'product' ? 'products' : type === 'job' ? 'jobs' : 'services';
  let query = c.from(table).select('id, title').limit(10);
  if (q) query = query.ilike('title', `%${q}%`);
  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.get('/featured', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('featured_items').select('*').order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.post('/featured', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('featured_items').insert({ ...req.body, created_by: req.user.id }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/featured/:id', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('featured_items').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/featured/:id', async (req, res) => {
  const c = authedClient(req);
  const { error } = await c.from('featured_items').update({ status: 'paused' }).eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Comments & Suggestions moderation
router.get('/comments', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('comments').select('*').order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.put('/comments/:id', async (req, res) => {
  const c = authedClient(req);
  const { status } = req.body;
  const { data, error } = await c.from('comments').update({ status }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/comments/:id', async (req, res) => {
  const c = authedClient(req);
  const { error } = await c.from('comments').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Subscription Plans (admin-configurable, replaces hardcoded tiers)
router.get('/plans', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('subscription_plans').select('*').order('price', { ascending: true });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.post('/plans', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('subscription_plans').insert(req.body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/plans/:id', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('subscription_plans').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/plans/:id', async (req, res) => {
  const c = authedClient(req);
  const { data: plan, error: lookupError } = await c.from('subscription_plans').select('is_active').eq('id', req.params.id).maybeSingle();
  if (lookupError) return res.status(400).json({ error: lookupError.message });
  if (!plan) return res.status(404).json({ error: 'Plan not found.' });
  if (plan.is_active) return res.status(400).json({ error: 'Deactivate the plan before deleting it.' });
  const { error } = await c.from('subscription_plans').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Site builder: centrally enable pages/features and maintain custom role definitions.
router.get('/builder/features', async (req, res) => {
  const { data, error } = await authedClient(req).from('platform_features').select('*').order('feature_key');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});
router.put('/builder/features/:key', async (req, res) => {
  const c = authedClient(req);
  const { enabled, configuration } = req.body || {};
  const { data, error } = await c.from('platform_features').upsert({ feature_key: req.params.key, enabled: enabled !== false, configuration: configuration || {}, updated_by: req.user.id, updated_at: new Date().toISOString() }, { onConflict: 'feature_key' }).select().single();
  if (error) return res.status(400).json({ error: error.message }); res.json(data);
});
router.get('/builder/roles', async (req, res) => {
  const { data, error } = await authedClient(req).from('platform_roles').select('*').order('name');
  if (error) return res.status(400).json({ error: error.message }); res.json(data || []);
});
router.post('/builder/roles', async (req, res) => {
  const { role_key, name, description, permissions } = req.body || {};
  if (!role_key || !name) return res.status(400).json({ error: 'Role key and name are required.' });
  const { data, error } = await authedClient(req).from('platform_roles').insert({ role_key, name, description: description || null, permissions: Array.isArray(permissions) ? permissions : [] }).select().single();
  if (error) return res.status(400).json({ error: error.message }); res.json(data);
});
router.put('/builder/roles/:id', async (req, res) => {
  const { name, description, permissions } = req.body || {};
  const { data, error } = await authedClient(req).from('platform_roles').update({ name, description: description || null, permissions: Array.isArray(permissions) ? permissions : [] }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message }); res.json(data);
});
router.delete('/builder/roles/:id', async (req, res) => {
  const c = authedClient(req); const { data: role } = await c.from('platform_roles').select('is_system').eq('id', req.params.id).maybeSingle();
  if (!role) return res.status(404).json({ error: 'Role not found.' });
  if (role.is_system) return res.status(400).json({ error: 'System roles cannot be deleted.' });
  const { error } = await c.from('platform_roles').delete().eq('id', req.params.id); if (error) return res.status(400).json({ error: error.message }); res.json({ ok: true });
});

// Ads
router.get('/ads', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('ads').select('*').order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.post('/ads', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('ads').insert(req.body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/ads/:id', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('ads').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/ads/:id', async (req, res) => {
  const c = authedClient(req);
  const { error } = await c.from('ads').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Audit logs
router.get('/audit', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// Settings
router.get('/settings', async (req, res) => {
  const c = authedClient(req);
  const { data } = await c.from('platform_settings').select('*').limit(1).single();
  res.json(data);
});

router.put('/settings', async (req, res) => {
  const c = authedClient(req);
  const { data: existing, error: lookupError } = await c.from('platform_settings').select('id').limit(1).maybeSingle();
  if (lookupError) return res.status(400).json({ error: lookupError.message });
  const query = existing
    ? c.from('platform_settings').update(req.body).eq('id', existing.id)
    : c.from('platform_settings').insert(req.body);
  const { data, error } = await query.select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Export
// Support Tickets
router.get('/support/tickets', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('support_tickets').select('*').order('updated_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.get('/support/tickets/:id', async (req, res) => {
  const c = authedClient(req);
  const { data: ticket, error } = await c.from('support_tickets').select('*').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  const { data: messages } = await c.from('support_ticket_messages').select('*').eq('ticket_id', req.params.id).order('created_at', { ascending: true });
  res.json({ ticket, messages: messages || [] });
});

router.put('/support/tickets/:id', async (req, res) => {
  const c = authedClient(req);
  const { status, priority, assigned_to } = req.body;
  const patch = { updated_at: new Date().toISOString() };
  if (status) patch.status = status;
  if (priority) patch.priority = priority;
  if (assigned_to !== undefined) patch.assigned_to = assigned_to;
  const { data, error } = await c.from('support_tickets').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/support/tickets/:id', async (req, res) => {
  const c = authedClient(req);
  // Remove child messages first so the ticket can be permanently removed even
  // when its foreign key is configured without ON DELETE CASCADE.
  await c.from('support_ticket_messages').delete().eq('ticket_id', req.params.id);
  const { error } = await c.from('support_tickets').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

router.post('/support/tickets/:id/messages', async (req, res) => {
  const c = authedClient(req);
  const { body } = req.body;
  const { data, error } = await c.from('support_ticket_messages').insert({ ticket_id: req.params.id, sender_id: req.user.id, body }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await c.from('support_tickets').update({ updated_at: new Date().toISOString() }).eq('id', req.params.id);
  res.json(data);
});

// Backup & Recovery — full data export as one downloadable JSON bundle.
// Backup & Recovery. Manual download always works. Automated daily backups
// run if SUPABASE_SERVICE_ROLE_KEY is set (see server/jobs/backup-scheduler.js —
// this endpoint needs no bearer token from a live admin, so it needs
// service-role privileges to read every table unattended).
const { BACKUP_TABLES, runBackup } = require('../jobs/backup-scheduler');

router.get('/backup/status', async (req, res) => {
  res.json({ automatedEnabled: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
});

router.get('/backup/export', async (req, res) => {
  const c = authedClient(req);
  const bundle = { exportedAt: new Date().toISOString(), tables: {} };
  for (const table of BACKUP_TABLES) {
    const { data, error } = await c.from(table).select('*');
    bundle.tables[table] = error ? { error: error.message } : data;
  }
  res.setHeader('Content-Disposition', `attachment; filename="skillbridge-backup-${Date.now()}.json"`);
  res.json(bundle);
});

router.get('/backup/list', async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.storage.from('backups').list('auto', { sortBy: { column: 'created_at', order: 'desc' }, limit: 30 });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.post('/backup/run-now', async (req, res) => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(400).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured — set it to enable server-side backups.' });
  try { await runBackup(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Restore: safe merge only — upserts each row by its existing id, never
// deletes anything currently live. A destructive delete-then-replace restore
// is intentionally not offered here; the risk of wiping real user data on a
// mistake or a bad backup file is too high for a one-click action.
router.post('/backup/restore', async (req, res) => {
  const c = authedClient(req);
  const { bundle } = req.body;
  if (!bundle?.tables) return res.status(400).json({ error: 'Invalid backup file.' });
  const results = {};
  for (const table of BACKUP_TABLES) {
    const rows = bundle.tables[table];
    if (!Array.isArray(rows) || !rows.length) { results[table] = 'skipped (empty)'; continue; }
    const { error } = await c.from(table).upsert(rows, { onConflict: 'id' });
    results[table] = error ? `error: ${error.message}` : `merged ${rows.length} row(s)`;
  }
  res.json({ results });
});

router.get('/export/:sheet', async (req, res) => {
  const c = authedClient(req);
  const sheet = req.params.sheet;
  let rows = [];
  if (sheet === 'processing') {
    const { data } = await c.from('payments').select('*').in('status', ['pending', 'in_escrow']);
    rows = data || [];
  } else if (sheet === 'completed') {
    const { data } = await c.from('payments').select('*').eq('status', 'released');
    rows = data || [];
  }
  res.json({ sheet, rows, exportedAt: new Date().toISOString() });
});

// God-Eye: a compact, cross-record transaction monitor plus curated Top Sellers.
router.get('/god-eye', async (req, res) => {
  const c = authedClient(req); const q = String(req.query.q || '').trim(); const status = String(req.query.status || '').trim();
  const [orders, transactions, agreements, shipments] = await Promise.all([
    c.from('product_orders').select('id,order_code,internal_order_reference,status,total_amount,buyer_id,seller_id,created_at').or(q ? `order_code.ilike.%${q}%,internal_order_reference.ilike.%${q}%` : 'id.not.is.null').limit(50),
    c.from('payment_transactions').select('*').or(q ? `skillbridge_reference.ilike.%${q}%,provider_reference.ilike.%${q}%` : 'id.not.is.null').limit(50),
    c.from('agreements').select('id,agreement_number,title,status,price,client_id,worker_id').or(q ? `agreement_number.ilike.%${q}%,title.ilike.%${q}%` : 'id.not.is.null').limit(50),
    c.from('shipments').select('id,shipment_code,tracking_number,status,order_id,current_location').or(q ? `shipment_code.ilike.%${q}%,tracking_number.ilike.%${q}%` : 'id.not.is.null').limit(50)
  ]);
  const filteredOrders = (orders.data || []).filter(row => !status || row.status === status || row.order_state === status);
  const filteredTransactions = (transactions.data || []).filter(row => !status || row.status === status);
  const filteredAgreements = (agreements.data || []).filter(row => !status || row.status === status);
  const filteredShipments = (shipments.data || []).filter(row => !status || row.status === status);
  res.json({ orders: filteredOrders, transactions: filteredTransactions, agreements: filteredAgreements, shipments: filteredShipments });
});
router.get('/god-eye/orders/:id', async (req, res) => { const c = authedClient(req); const [order, events, versions, transaction, audit] = await Promise.all([c.from('product_orders').select('*,product_order_items(*,products(id,title,product_code)),shipments(*,tracking_events(*))').eq('id', req.params.id).maybeSingle(),c.from('transaction_events').select('*').eq('order_id', req.params.id).order('created_at'),c.from('order_agreement_versions').select('*').eq('order_id', req.params.id).order('version_number',{ascending:false}),c.from('payment_transactions').select('*').eq('order_id', req.params.id).maybeSingle(),c.from('product_transaction_audit').select('*').eq('order_id', req.params.id).order('created_at')]); if (!order.data) return res.status(404).json({ error: 'Order not found.' }); res.json({ order: order.data, events: events.data || [], agreement_versions: versions.data || [], payment: transaction.data || null, audit: audit.data || [] }); });
router.post('/listings/bulk-status', async (req, res) => { const { type, ids, status } = req.body || {}; const table = type === 'product' ? 'products' : type === 'service' ? 'services' : null; if (!table || !Array.isArray(ids) || !ids.length || ids.length > 100 || !['active','pending','rejected','suspended'].includes(status)) return res.status(400).json({ error: 'Invalid safe bulk action.' }); const c = authedClient(req); const { error } = await c.from(table).update({ status }).in('id', ids); if (error) return res.status(400).json({ error: error.message }); await c.from('audit_logs').insert({ actor_id: req.user.id, action: 'bulk_listing_status_updated', target_type: table, meta: { ids, status } }); res.json({ ok: true, updated: ids.length }); });

router.get('/top-sellers', async (req, res) => {
  const c = authedClient(req);
  const [{ data: settings }, { data: features }, { data: orders }, { data: profiles }] = await Promise.all([
    c.from('top_seller_settings').select('*').eq('id', true).maybeSingle(),
    c.from('top_seller_features').select('*').order('display_position'),
    c.from('product_orders').select('seller_id,total_amount,status,created_at'),
    c.from('profiles').select('user_id,display_name,profile_image,role,rating,review_count,kyc_level')
  ]);
  const metrics = new Map();
  (orders || []).forEach(order => { const m = metrics.get(order.seller_id) || { completed_sales: 0, sales_value: 0 }; if (order.status === 'COMPLETED') { m.completed_sales++; m.sales_value += Number(order.total_amount || 0); } metrics.set(order.seller_id, m); });
  const people = (profiles || []).map(profile => ({ ...profile, ...(metrics.get(profile.user_id) || { completed_sales: 0, sales_value: 0 }), ai_score: Math.min(100, Math.round((metrics.get(profile.user_id)?.completed_sales || 0) * 3 + Number(profile.rating || 0) * 10 + (profile.kyc_level >= 2 ? 10 : 0))) }));
  const featureMap = new Map((features || []).map(feature => [feature.user_id, feature]));
  res.json({ settings, featured: (features || []).map(feature => ({ ...feature, profile: people.find(person => person.user_id === feature.user_id) || null })), recommendations: people.filter(person => person.completed_sales > 0 && !featureMap.has(person.user_id)).sort((a,b) => b.ai_score - a.ai_score).slice(0, 20), accounts: people.sort((a,b) => b.completed_sales - a.completed_sales) });
});

router.put('/top-sellers/settings', async (req, res) => {
  const allowed = ['ai_recommendations_enabled','automatic_ranking_enabled','manual_curation_enabled','ranking_weights'];
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
  patch.updated_by = req.user.id; patch.updated_at = new Date().toISOString();
  const { data, error } = await authedClient(req).from('top_seller_settings').update(patch).eq('id', true).select().single();
  if (error) return res.status(400).json({ error: error.message }); await authedClient(req).from('audit_logs').insert({ actor_id: req.user.id, action: 'top_seller_settings_updated', target_type: 'top_seller_settings', meta: patch }); res.json(data);
});

router.post('/top-sellers/:userId', async (req, res) => {
  const c = authedClient(req); const { data: all } = await c.from('top_seller_features').select('display_position').order('display_position', { ascending: false }).limit(1);
  const promotionEndsAt = req.body?.promotion_ends_at || null;
  const { data, error } = await c.from('top_seller_features').upsert({ user_id: req.params.userId, display_position: (all?.[0]?.display_position || 0) + 1, selection_source: 'manual', promotion_ends_at: promotionEndsAt, reason: req.body?.reason || null, selected_by: req.user.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select().single();
  if (error) return res.status(400).json({ error: error.message }); await c.from('audit_logs').insert({ actor_id: req.user.id, action: 'top_seller_promoted', target_type: 'profile', target_id: req.params.userId, meta: { position: data.display_position, selection_source: data.selection_source } }); res.status(201).json(data);
});
router.delete('/top-sellers/:userId', async (req, res) => { const c = authedClient(req); const { error } = await c.from('top_seller_features').delete().eq('user_id', req.params.userId); if (error) return res.status(400).json({ error: error.message }); await c.from('audit_logs').insert({ actor_id: req.user.id, action: 'top_seller_removed', target_type: 'profile', target_id: req.params.userId }); res.json({ ok: true }); });
router.put('/top-sellers/reorder', async (req, res) => { const ids = Array.isArray(req.body?.user_ids) ? req.body.user_ids : []; const c = authedClient(req); const { error } = await c.rpc('reorder_featured_top_sellers', { p_user_ids: ids }); if (error) return res.status(400).json({ error: error.message }); await c.from('audit_logs').insert({ actor_id: req.user.id, action: 'top_sellers_reordered', target_type: 'top_seller_features', meta: { user_ids: ids } }); res.json({ ok: true }); });

router.get('/payment-providers', async (req, res) => { const { data, error } = await authedClient(req).from('payment_provider_configs').select('id,provider_code,display_name,is_enabled,is_default,priority,countries,supported_currencies,secret_env_key,webhook_secret_env_key,verification_mode,routing_rules,updated_at').order('priority'); if (error) return res.status(400).json({ error: error.message }); res.json(data || []); });
router.put('/payment-providers/:id', async (req, res) => { const allowed = ['is_enabled','is_default','priority','countries','supported_currencies','routing_rules']; const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key))); patch.updated_at = new Date().toISOString(); const c = authedClient(req); if (patch.is_default === true) await c.from('payment_provider_configs').update({ is_default: false }).neq('id', req.params.id); const { data, error } = await c.from('payment_provider_configs').update(patch).eq('id', req.params.id).select().single(); if (error) return res.status(400).json({ error: error.message }); if (patch.is_enabled !== undefined) await c.from('payment_methods').update({ is_enabled: patch.is_enabled, updated_at: new Date().toISOString() }).eq('provider_code', data.provider_code); res.json(data); });
router.get('/payment-methods', async (req, res) => { const { data, error } = await authedClient(req).from('payment_methods').select('*').order('priority'); if (error) return res.status(400).json({ error: error.message }); res.json(data || []); });
router.post('/payment-methods', async (req, res) => { const b = req.body || {}; const code = String(b.method_code || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'); if (!code || !b.display_name || !['online_provider','fiat_bank','crypto_wallet'].includes(b.method_type)) return res.status(400).json({ error: 'Method code, display name, and a valid type are required.' }); const row = { method_code: code, display_name: String(b.display_name).trim(), method_type: b.method_type, provider_code: b.provider_code ? String(b.provider_code).trim().toUpperCase() : null, currency: String(b.currency || 'NGN').trim().toUpperCase(), network: b.network ? String(b.network).trim() : null, public_details: b.public_details && typeof b.public_details === 'object' ? b.public_details : {}, supported_purposes: Array.isArray(b.supported_purposes) ? b.supported_purposes : ['product','digital_service'], is_enabled: b.is_enabled === true, priority: Number(b.priority || 100) }; const { data, error } = await authedClient(req).from('payment_methods').insert(row).select().single(); if (error) return res.status(400).json({ error: error.message }); res.status(201).json(data); });
router.put('/payment-methods/:id', async (req, res) => { const allowed = ['display_name','provider_code','currency','network','public_details','supported_purposes','is_enabled','priority']; const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key))); patch.updated_at = new Date().toISOString(); const { data, error } = await authedClient(req).from('payment_methods').update(patch).eq('id', req.params.id).select().single(); if (error) return res.status(400).json({ error: error.message }); res.json(data); });
router.delete('/payment-methods/:id', async (req, res) => { const { error } = await authedClient(req).from('payment_methods').delete().eq('id', req.params.id); if (error) return res.status(400).json({ error: error.message }); res.json({ ok: true }); });
router.get('/emergency-controls', async (req, res) => { const { data, error } = await authedClient(req).from('emergency_controls').select('*').order('control_key'); if (error) return res.status(400).json({ error: error.message }); res.json(data || []); });
router.put('/emergency-controls/:key', async (req, res) => { const active = req.body?.is_active === true; const reason = String(req.body?.reason || '').trim(); if (!reason) return res.status(400).json({ error: 'A reason is required for an emergency control change.' }); const c = authedClient(req); const { data, error } = await c.from('emergency_controls').update({ is_active: active, reason, activated_by: req.user.id, activated_at: active ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('control_key', req.params.key).select().single(); if (error) return res.status(400).json({ error: error.message }); await c.from('audit_logs').insert({ actor_id: req.user.id, action: active ? 'emergency_control_activated' : 'emergency_control_released', target_type: 'emergency_control', meta: { key: req.params.key, reason } }); res.json(data); });

module.exports = router;
