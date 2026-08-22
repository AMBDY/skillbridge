const router = require('express').Router();
const { supabase, createAuthedClient } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');
const { notify } = require('../utils/notify');

function authedClient(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  return createAuthedClient(token);
}
function ownUploadPaths(urls, userId) {
  const marker = '/storage/v1/object/public/kyc/';
  return (urls || []).map(url => { const n = String(url).indexOf(marker); return n < 0 ? null : decodeURIComponent(String(url).slice(n + marker.length).split('?')[0]); }).filter(path => path && path.startsWith(`${userId}/`));
}

async function attachProfiles(items, fk) {
  if (!items || !items.length) return [];
  const ids = [...new Set(items.map(i => i[fk]).filter(Boolean))];
  if (!ids.length) return items;
  const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, profile_image, rating, subscription_tier, kyc_level, is_online, state').in('user_id', ids);
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

// Categories
router.get('/features', async (req, res) => {
  const { data, error } = await supabase.from('platform_features').select('feature_key, enabled');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.get('/categories', async (req, res) => {
  const { ecosystem } = req.query;
  let q = supabase.from('categories').select('*').eq('is_active', true).order('sort_order');
  if (ecosystem) q = q.eq('ecosystem', ecosystem);
  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.get('/form-controls/:formKey', async (req, res) => {
  const { data, error } = await supabase.from('form_field_controls').select('field_key,label,help_text,is_visible,is_required,sort_order').eq('form_key', req.params.formKey).order('sort_order');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// Services (hire talent)
router.get('/services', async (req, res) => {
  const { category_id, search, sort } = req.query;
  let q = supabase.from('services').select('*');
  if (category_id) q = q.eq('category_id', category_id);
  if (search) q = q.ilike('title', `%${search}%`);
  if (sort === 'price_low') q = q.order('price', { ascending: true });
  else if (sort === 'price_high') q = q.order('price', { ascending: false });
  else if (sort === 'rating') q = q.order('rating', { ascending: false });
  else q = q.order('created_at', { ascending: false });
  const { data, error } = await q.limit(50);
  if (error) return res.status(400).json({ error: error.message });
  const enriched = await attachProfiles(data, 'user_id');
  res.json(enriched);
});

router.post('/services', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { category_id, title, description, price, delivery_days, images, video_url, location } = req.body;
  const { data, error } = await c.from('services').insert({
    user_id: req.user.id, category_id, title, description, price, delivery_days, images, video_url, location, status: 'pending'
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Products (shop)
router.get('/products', async (req, res) => {
  const { category_id, search, sort } = req.query;
  let q = supabase.from('products').select('*');
  if (category_id) q = q.eq('category_id', category_id);
  if (search) q = q.ilike('title', `%${search}%`);
  if (sort === 'price_low') q = q.order('price', { ascending: true });
  else if (sort === 'price_high') q = q.order('price', { ascending: false });
  else if (sort === 'rating') q = q.order('rating', { ascending: false });
  else q = q.order('created_at', { ascending: false });
  const { data, error } = await q.limit(50);
  if (error) return res.status(400).json({ error: error.message });
  const enriched = await attachProfiles(data, 'user_id');
  res.json(enriched);
});

router.post('/products', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { category_id, title, description, price, size, color, gender, images, video_url, stock, location, brand, details, fulfillment_type, measurement_template_id, supported_sizes, production_days } = req.body;
  const { data: category } = await supabase.from('categories').select('slug').eq('id', category_id).maybeSingle();
  const prefix = String(category?.slug || 'SB').replace(/[^a-z0-9]/ig, '').slice(0, 3).toUpperCase() || 'SB';
  const product_code = `${prefix}-${Date.now().toString().slice(-7)}`;
  const { data, error } = await c.from('products').insert({
    user_id: req.user.id, category_id, title, description, price, size, color, gender, images, video_url, stock, location, brand, details: details || {}, fulfillment_type: ['ready_made','made_to_order','custom_design','made_to_order_measurements'].includes(fulfillment_type) ? fulfillment_type : 'ready_made', measurement_template_id: measurement_template_id || null, supported_sizes: Array.isArray(supported_sizes) ? supported_sizes : [], production_days: production_days ? Number(production_days) : null, product_code, status: 'pending'
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/listings/:type/:id', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const table = req.params.type === 'service' ? 'services' : req.params.type === 'product' ? 'products' : null;
  if (!table) return res.status(400).json({ error: 'Invalid listing type.' });
  const fields = table === 'products' ? ['category_id','title','description','price','size','color','gender','images','video_url','stock','location','brand','details','fulfillment_type','measurement_template_id','supported_sizes','production_days'] : ['category_id','title','description','price','delivery_days','images','video_url','location'];
  const changes = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => fields.includes(key)));
  if (!Object.keys(changes).length) return res.status(400).json({ error: 'No editable listing fields supplied.' });
  const { data, error } = await c.from(table).update({ ...changes, status: 'pending' }).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
  if (error) return res.status(400).json({ error: error.message }); res.json(data);
});

router.delete('/listings/:type/:id', authMiddleware, async (req, res) => {
  const c = authedClient(req); const table = req.params.type === 'service' ? 'services' : req.params.type === 'product' ? 'products' : null;
  if (!table) return res.status(400).json({ error: 'Invalid listing type.' });
  const { data: existing } = await c.from(table).select('images,video_url').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Listing not found.' });
  const { data, error } = await c.from(table).delete().eq('id', req.params.id).eq('user_id', req.user.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  const paths = ownUploadPaths([...(existing.images || []), existing.video_url], req.user.id); if (paths.length) await c.storage.from('kyc').remove(paths);
  res.json({ ok: true, listing: data });
});

// Single service/product
router.get('/listing/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  const table = type === 'service' ? 'services' : 'products';
  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });
  const [withProfile] = await attachProfiles([data], 'user_id');
  const [withCat] = await attachCategories([withProfile], 'category_id');
  res.json(withCat);
});

// Reviews for a user
router.get('/reviews/:userId', async (req, res) => {
  const { data, error } = await supabase.from('reviews').select('*, reviewer:reviewer_id(display_name, profile_image)').eq('reviewee_id', req.params.userId).order('created_at', { ascending: false }).limit(50);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.post('/reviews', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { reviewee_id, job_id, stars, comment, hire_again } = req.body;
  const { data, error } = await c.from('reviews').insert({
    reviewer_id: req.user.id, reviewee_id, job_id, stars, comment, hire_again
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await notify(c, { userId: reviewee_id, type: 'review_received', title: 'New review received', body: `You received a ${stars}-star review`, link: `/profile.html?id=${reviewee_id}` });
  res.json(data);
});

// Product reviews are separate from profile/service reviews and can only be
// created through a completed product order in the orders route.
router.get('/product-reviews/:productId', async (req, res) => {
  const { data, error } = await supabase.from('product_reviews').select('*, buyer:buyer_id(display_name, profile_image)').eq('product_id', req.params.productId).order('created_at', { ascending: false }).limit(50);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// Profile
router.get('/profile/:userId', async (req, res) => {
  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', req.params.userId).maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Profile not found' });
  res.json(data);
});

router.put('/profile', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  // Only personal details are self-editable. role, kyc_level, subscription_tier,
  // account_status, rating, review_count, completion_rate are set by the
  // platform (KYC approval, subscription approval, moderation, reviews) —
  // never directly by the account owner. Also enforced at the database
  // level by a trigger, so this isn't the only line of defense.
  const allowedFields = [
    'first_name', 'middle_name', 'last_name', 'display_name', 'phone',
    'country', 'state', 'city', 'address', 'bank_name', 'account_number',
    'account_holder_name', 'profile_image', 'cover_image', 'about',
    'cover_letter', 'availability', 'response_time_hours', 'profile_sections'
  ];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  const { data, error } = await c.from('profiles').update(updates).eq('user_id', req.user.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Public: approved testimonials for the homepage
router.get('/testimonials', async (req, res) => {
  const { data, error } = await supabase.from('testimonials').select('*').eq('status', 'approved').order('created_at', { ascending: false }).limit(12);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// Public: submit a testimonial — works for guests too (RLS allows anon insert), goes to admin for approval
router.post('/testimonials', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const client = token ? createAuthedClient(token) : supabase;
  const { name, role_label, quote, rating, avatar_url } = req.body;
  if (!name || !quote) return res.status(400).json({ error: 'Name and testimonial text are required' });
  const insert = { name, role_label, quote, rating, avatar_url };
  if (token) {
    try {
      const { data: { user } } = await client.auth.getUser();
      if (user) insert.user_id = user.id;
    } catch {}
  }
  const { data, error } = await client.from('testimonials').insert(insert).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Public: submit a site comment/suggestion — same guest-friendly pattern
router.post('/comments', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const client = token ? createAuthedClient(token) : supabase;
  const { name, email, body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Please enter your feedback' });
  const insert = { name, email, body };
  if (token) {
    try {
      const { data: { user } } = await client.auth.getUser();
      if (user) insert.user_id = user.id;
    } catch {}
  }
  const { data, error } = await client.from('comments').insert(insert).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Public: site content blocks for a given page (About, Contact, FAQ, homepage hero, footer, etc.)
router.get('/site-content/:pageKey', async (req, res) => {
  const { data, error } = await supabase.from('site_content').select('section_key, content_type, value').eq('page_key', req.params.pageKey);
  if (error) return res.status(400).json({ error: error.message });
  const map = {};
  (data || []).forEach(row => { map[row.section_key] = row.value; });
  res.json(map);
});

// Public: featured items for a placement (homepage / category / search_top), resolved against their source table
router.get('/featured', async (req, res) => {
  const placement = req.query.placement || 'homepage';
  const { data: items, error } = await supabase.from('featured_items').select('*')
    .eq('placement', placement).eq('status', 'active')
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('position', { ascending: true });
  if (error) return res.status(400).json({ error: error.message });
  const byType = { service: [], product: [], job: [] };
  (items || []).forEach(i => byType[i.item_type]?.push(i.item_id));
  const [services, products, jobs] = await Promise.all([
    byType.service.length ? supabase.from('services').select('id, title, price, images').in('id', byType.service) : { data: [] },
    byType.product.length ? supabase.from('products').select('id, title, price, images').in('id', byType.product) : { data: [] },
    byType.job.length ? supabase.from('jobs').select('id, title, budget').in('id', byType.job) : { data: [] },
  ]);
  const svcMap = new Map((services.data || []).map(s => [s.id, s]));
  const prodMap = new Map((products.data || []).map(s => [s.id, s]));
  const jobMap = new Map((jobs.data || []).map(s => [s.id, s]));
  const resolved = (items || []).map(i => {
    const src = i.item_type === 'service' ? svcMap.get(i.item_id) : i.item_type === 'product' ? prodMap.get(i.item_id) : jobMap.get(i.item_id);
    if (!src) return null;
    return {
      id: i.id, item_type: i.item_type, item_id: i.item_id,
      title: src.title, price: src.price ?? src.budget ?? 0, image: src.images?.[0] || null,
      href: `/${i.item_type === 'job' ? 'job' : i.item_type}.html?id=${i.item_id}`
    };
  }).filter(Boolean);
  res.json(resolved);
});

// Public: active ads for a given page placement, with lightweight view tracking
router.get('/ads', async (req, res) => {
  const pages = (req.query.page || 'all').split(',').map(p => p.trim()).filter(Boolean);
  const matchPages = pages.includes('all') ? ['all'] : [...pages, 'all'];
  const { data, error } = await supabase.from('ads').select('*')
    .eq('status', 'active')
    .in('target_page', matchPages)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .lte('schedule_at', new Date().toISOString())
    .limit(3);
  if (error) return res.status(400).json({ error: error.message });
  const ads = data || [];
  if (ads.length) {
    const ids = ads.map(a => a.id);
    Promise.all(ids.map(id => supabase.rpc('increment_ad_view', { ad_id: id }))).catch(() => {});
  }
  res.json(ads);
});

router.post('/ads/:id/click', async (req, res) => {
  await supabase.rpc('increment_ad_click', { ad_id: req.params.id }).catch(() => {});
  res.json({ ok: true });
});

// Public: blog — list published posts, and a single post by slug
router.get('/blog', async (req, res) => {
  const { data, error } = await supabase.from('blog_posts').select('id, title, slug, excerpt, cover_image, published_at')
    .eq('status', 'published').order('published_at', { ascending: false }).limit(30);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.get('/blog/:slug', async (req, res) => {
  const { data, error } = await supabase.from('blog_posts').select('*').eq('slug', req.params.slug).eq('status', 'published').maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Post not found' });
  res.json(data);
});

// Public: AdSense config — publisher ID + active ad units
router.get('/adsense', async (req, res) => {
  const { data: settings } = await supabase.from('platform_settings').select('adsense_enabled, adsense_publisher_id').limit(1).maybeSingle();
  if (!settings?.adsense_enabled || !settings.adsense_publisher_id) return res.json({ enabled: false, units: [] });
  const { data: units } = await supabase.from('adsense_units').select('placement, slot_id, ad_format').eq('is_active', true);
  res.json({ enabled: true, publisher_id: settings.adsense_publisher_id, units: units || [] });
});

// Public: safe general settings (site name/logo/currency) for the frontend to render
router.get('/settings', async (req, res) => {
  const { data } = await supabase.from('platform_settings').select('site_name, logo_url, favicon_url, default_currency, default_timezone, homepage_sections').limit(1).maybeSingle();
  res.json(data || { site_name: 'SkillBridge' });
});

// Public: list active subscription plans
router.get('/plans', async (req, res) => {
  const { data, error } = await supabase.from('subscription_plans').select('*').eq('is_active', true).order('price', { ascending: true });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// Subscription request (user-facing)
router.post('/subscriptions', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  let { tier, amount, proof_url, plan_id } = req.body;
  if (plan_id) {
    const { data: plan } = await supabase.from('subscription_plans').select('*').eq('id', plan_id).maybeSingle();
    if (!plan) return res.status(400).json({ error: 'Plan not found' });
    tier = plan.tier_key;
    amount = plan.price;
  }
  const { data, error } = await c.from('subscriptions').insert({
    user_id: req.user.id, tier, amount, proof_url, plan_id: plan_id || null
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.get('/listings/mine', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const [products, services] = await Promise.all([
    c.from('products').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }),
    c.from('services').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false })
  ]);
  res.json([
    ...(products.data || []).map(p => ({ ...p, type: 'product' })),
    ...(services.data || []).map(s => ({ ...s, type: 'service' }))
  ]);
});

// Notifications
router.get('/notifications', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(30);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/notifications/:id/read', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('notifications').update({ read: true }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/notifications/read-all', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { error } = await c.from('notifications').update({ read: true }).eq('user_id', req.user.id).eq('read', false);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
