require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

const authRoutes = require('./routes/auth');
const marketplaceRoutes = require('./routes/marketplace');
const jobRoutes = require('./routes/jobs');
const chatRoutes = require('./routes/chat');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const aiRoutes = require('./routes/ai');
const recruitmentRoutes = require('./routes/recruitment');
const agreementRoutes = require('./routes/agreements');
const uploadRoutes = require('./routes/uploads');
const supportRoutes = require('./routes/support');
const disputeRoutes = require('./routes/disputes');
const orderRoutes = require('./routes/orders');
const logisticsRoutes = require('./routes/logistics');
const digitalServiceRoutes = require('./routes/digital-services');
const { initChatSockets } = require('./sockets/chat');

const app = express();
const server = http.createServer(app);
const CORS_ORIGIN = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : '*';
const io = new Server(server, { cors: { origin: CORS_ORIGIN } });

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '10mb', verify: (req, res, buffer) => { if (req.originalUrl.startsWith('/api/payments/webhooks/')) req.rawBody = Buffer.from(buffer); } }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
app.locals.supabase = supabase;
app.locals.io = io;
app.set('trust proxy', 1);

// Supabase config snippet injected into all HTML pages
const SB_CONFIG = `<script>window.SUPABASE_URL="${SUPABASE_URL}";window.SUPABASE_ANON_KEY="${ANON_KEY}";</script><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase-js.min.js"></script>`;

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Dynamically serve sb-config.js from env vars — must come before the static
// middleware below, since public/js/sb-config.js is a checked-in placeholder
// (fixed: previously the Supabase URL/anon key were hardcoded directly into
// that static file, so changing .env did nothing for the frontend at all).
app.get('/js/sb-config.js', (req, res) => {
  res.type('application/javascript').send(
`// Auto-generated from server environment — do not hardcode credentials here.
window.SUPABASE_URL = ${JSON.stringify(SUPABASE_URL || '')};
window.SUPABASE_ANON_KEY = ${JSON.stringify(ANON_KEY || '')};
(function () {
  if (window.supabase) return;
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  s.async = false;
  document.head.appendChild(s);
})();`
  );
});

// Serve static non-HTML assets directly (skip .html so we can inject config)
app.use((req, res, next) => {
  if (path.extname(req.path).toLowerCase() === '.html') return next();
  express.static(PUBLIC_DIR)(req, res, next);
});

// API routes
let maintenanceCache = { value: false, checkedAt: 0 };
async function isMaintenanceMode() {
  if (Date.now() - maintenanceCache.checkedAt < 30000) return maintenanceCache.value;
  const { data } = await supabase.from('platform_settings').select('maintenance_mode').limit(1).maybeSingle();
  maintenanceCache = { value: !!data?.maintenance_mode, checkedAt: Date.now() };
  return maintenanceCache.value;
}
const { rateLimit } = require('./middleware/rate-limit');
const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, message: 'Too many requests. Please slow down.' });
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, message: 'Too many attempts. Please wait a minute and try again.' });

app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/uploads', authLimiter);

app.use('/api', async (req, res, next) => {
  // Always allow auth (so the admin can still sign in) and the admin API itself (so they can turn it back off)
  if (req.path.startsWith('/auth') || req.path.startsWith('/admin') || req.path === '/health') return next();
  if (await isMaintenanceMode()) return res.status(503).json({ error: 'SkillBridge is temporarily down for maintenance. Please check back soon.' });
  next();
});
let featureCache = { disabled: new Set(), checkedAt: 0 };
async function disabledFeatures() {
  if (Date.now() - featureCache.checkedAt < 30000) return featureCache.disabled;
  const { data } = await supabase.from('platform_features').select('feature_key').eq('enabled', false);
  featureCache = { disabled: new Set((data || []).map(row => row.feature_key)), checkedAt: Date.now() };
  return featureCache.disabled;
}
app.use('/api', async (req, res, next) => {
  if (req.path.startsWith('/admin') || req.path.startsWith('/auth') || req.path === '/health') return next();
  const map = [['/recruitment','recruitment'],['/chat','chat'],['/payments','payments'],['/agreements','agreements'],['/support','support'],['/marketplace/products','shop'],['/marketplace/services','hire']];
  const found = map.find(([prefix]) => req.path.startsWith(prefix));
  if (found && (await disabledFeatures()).has(found[1])) return res.status(503).json({ error: `The ${found[1]} feature is currently unavailable.` });
  next();
});
app.use('/api/auth', authRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/recruitment', recruitmentRoutes);
app.use('/api/agreements', agreementRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/logistics', logisticsRoutes);
app.use('/api/digital-services', digitalServiceRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'skillbridge' }));

// Serve HTML files with Supabase config + SEO meta tags injected
const PAGE_KEY_MAP = { '': 'homepage_hero', 'index.html': 'homepage_hero', 'about.html': 'about', 'contact.html': 'contact', 'faq.html': 'faq', 'hire.html': 'hire', 'shop.html': 'shop', 'jobs.html': 'jobs' };
let metaCache = { data: {}, checkedAt: 0 };
async function getMeta(pageKey) {
  if (Date.now() - metaCache.checkedAt > 60000) {
    const { data } = await supabase.from('site_content').select('page_key, section_key, value').in('section_key', ['meta_title', 'meta_description']);
    const grouped = {};
    (data || []).forEach(row => {
      grouped[row.page_key] = grouped[row.page_key] || {};
      grouped[row.page_key][row.section_key] = row.value;
    });
    metaCache = { data: grouped, checkedAt: Date.now() };
  }
  return metaCache.data[pageKey] || {};
}

let adsenseCache = { data: null, checkedAt: 0 };
async function getAdsenseScript() {
  if (Date.now() - adsenseCache.checkedAt > 60000) {
    const { data } = await supabase.from('platform_settings').select('adsense_enabled, adsense_publisher_id').limit(1).maybeSingle();
    adsenseCache = { data, checkedAt: Date.now() };
  }
  if (!adsenseCache.data?.adsense_enabled || !adsenseCache.data?.adsense_publisher_id) return '';
  const pubId = adsenseCache.data.adsense_publisher_id;
  return `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${pubId}" crossorigin="anonymous"></script>`;
}

let brandCache = { data: null, checkedAt: 0 };
async function getBrandAssets() {
  if (Date.now() - brandCache.checkedAt > 60000) {
    const { data } = await supabase.from('platform_settings').select('favicon_url').limit(1).maybeSingle();
    brandCache = { data, checkedAt: Date.now() };
  }
  return brandCache.data || {};
}

function serveHtml(filename, res, req) {
  const file = path.join(PUBLIC_DIR, filename);
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) return res.status(404).send('Not found');
    let injected = data.includes('sb-config.js')
      ? data
      : data.replace('<script src="/js/app.js">', SB_CONFIG + '<script src="/js/app.js">');

    let meta = {};
    if (filename === 'blog-post.html' && req?.query?.slug) {
      try {
        const { data: post } = await supabase.from('blog_posts').select('title, excerpt').eq('slug', req.query.slug).eq('status', 'published').maybeSingle();
        if (post) meta = { meta_title: `${post.title} — Blog`, meta_description: post.excerpt || undefined };
      } catch { /* fall through to no per-post meta */ }
    } else {
      const pageKey = PAGE_KEY_MAP[filename];
      if (pageKey) { try { meta = await getMeta(pageKey); } catch { /* non-critical */ } }
    }

    try {
      if (meta.meta_title) {
        injected = /<title>.*<\/title>/.test(injected)
          ? injected.replace(/<title>.*<\/title>/, `<title>${meta.meta_title}</title>`)
          : injected.replace('</head>', `<title>${meta.meta_title}</title></head>`);
      }
      if (meta.meta_description) {
        injected = /<meta name="description"[^>]*>/.test(injected)
          ? injected.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${meta.meta_description.replace(/"/g, '&quot;')}">`)
          : injected.replace('</head>', `<meta name="description" content="${meta.meta_description.replace(/"/g, '&quot;')}"></head>`);
      }
    } catch { /* SEO tags are non-critical — never block page load on this */ }

    try {
      const adsenseScript = await getAdsenseScript();
      if (adsenseScript) injected = injected.replace('</head>', `${adsenseScript}</head>`);
    } catch { /* AdSense script injection is non-critical — never block page load on this */ }

    try {
      const brand = await getBrandAssets();
      if (brand.favicon_url) injected = injected.replace('</head>', `<link rel="icon" href="${brand.favicon_url}"></head>`);
    } catch { /* Branding is non-critical — never block page load on this */ }

    res.type('html').send(injected);
  });
}

app.get('/robots.txt', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(
`User-agent: *
Disallow: /api/
Disallow: /dashboard.html
Disallow: /admin.html
Disallow: /chat.html
Disallow: /applications.html
Disallow: /recruiter-applicants.html
Sitemap: ${host}/sitemap.xml`
  );
});

app.get('/sitemap.xml', async (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  const staticPages = ['/', '/hire.html', '/shop.html', '/jobs.html', '/recruitment-jobs.html', '/about.html', '/contact.html', '/faq.html', '/blog.html', '/signin.html', '/signup.html'];
  let dynamicUrls = [];
  try {
    const [posts, jobs, services, products] = await Promise.all([
      supabase.from('blog_posts').select('slug, published_at').eq('status', 'published').order('published_at', { ascending: false }).limit(500),
      supabase.from('jobs').select('id, created_at').in('status', ['approved', 'open', 'assigned', 'completed']).order('created_at', { ascending: false }).limit(500),
      supabase.from('services').select('id, created_at').eq('status', 'active').order('created_at', { ascending: false }).limit(500),
      supabase.from('products').select('id, created_at').eq('status', 'active').order('created_at', { ascending: false }).limit(500),
    ]);
    dynamicUrls = [
      ...(posts.data || []).map(p => ({ loc: `/blog-post.html?slug=${p.slug}`, lastmod: p.published_at })),
      ...(jobs.data || []).map(j => ({ loc: `/job.html?id=${j.id}`, lastmod: j.created_at })),
      ...(services.data || []).map(s => ({ loc: `/listing.html?type=service&id=${s.id}`, lastmod: s.created_at })),
      ...(products.data || []).map(p => ({ loc: `/listing.html?type=product&id=${p.id}`, lastmod: p.created_at })),
    ];
  } catch { /* sitemap is non-critical — serve what we have (static pages) on any DB error */ }

  const urls = [
    ...staticPages.map(p => `  <url><loc>${host}${p}</loc></url>`),
    ...dynamicUrls.map(u => `  <url><loc>${host}${u.loc}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`)
  ].join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
});

app.get('/', (req, res) => serveHtml('index.html', res, req));
app.get('*.html', (req, res) => serveHtml(path.basename(req.path), res, req));

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  serveHtml('index.html', res);
});

initChatSockets(io, supabase);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SkillBridge running on port ${PORT}`);
  require('./jobs/backup-scheduler').startBackupScheduler();
  require('./jobs/agreement-archive-scheduler').startAgreementArchiveScheduler();
});

module.exports = app;
