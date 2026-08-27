// Landing page logic
const HERO_SLIDES = [
  'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg',
  'https://images.pexels.com/photos/4467687/pexels-photo-4467687.jpeg',
  'https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg',
  'https://images.pexels.com/photos/3184339/pexels-photo-3184339.jpeg',
  'https://images.pexels.com/photos/5905798/pexels-photo-5905798.jpeg',
];

const WOTD = [
  { word: 'Bridge', def: 'A structure carrying a path over an obstacle — and a verb meaning to connect. At SkillBridge, we bridge talent and opportunity every day.' },
  { word: 'Trust', def: 'Firm belief in the reliability of someone. The foundation of every transaction on our platform.' },
  { word: 'Craft', def: 'Skill in making things by hand. Celebrated in every tailor, cobbler, and artisan on SkillBridge.' },
  { word: 'Trade', def: 'The exchange of goods and services. We make it safe, fast, and borderless.' },
];

const TOP_SELLERS = [
  { name: 'Grace Designs', cat: 'Graphics Design', rating: 4.9, img: 'https://images.pexels.com/photos/3184405/pexels-photo-3184405.jpeg', tier: 'elite' },
  { name: 'Tunde Tailors', cat: 'Tailoring', rating: 4.8, img: 'https://images.pexels.com/photos/5998392/pexels-photo-5998392.jpeg', tier: 'featured' },
  { name: 'Ngozi Crafts', cat: 'Bag Construction', rating: 5.0, img: 'https://images.pexels.com/photos/5998420/pexels-photo-5998420.jpeg', tier: 'elite' },
  { name: 'Emeka Plumbing', cat: 'Plumbing', rating: 4.7, img: 'https://images.pexels.com/photos/8961065/pexels-photo-8961065.jpeg', tier: 'pro' },
];

const RECENT_JOBS = [
  { title: 'Custom Wedding Gown', price: 85000, cat: 'Tailoring', img: 'https://images.pexels.com/photos/5998392/pexels-photo-5998392.jpeg' },
  { title: 'Logo & Brand Identity', price: 45000, cat: 'Graphics Design', img: 'https://images.pexels.com/photos/3184405/pexels-photo-3184405.jpeg' },
  { title: 'Living Room Interior', price: 320000, cat: 'Interior Decoration', img: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg' },
];

async function initHero() {
  const hero = document.getElementById('hero');
  const dots = document.getElementById('heroDots');
  let slides = HERO_SLIDES;
  try {
    const content = await API.get('/marketplace/site-content/homepage_hero');
    if (content.hero_images) {
      const parsed = JSON.parse(content.hero_images);
      if (Array.isArray(parsed) && parsed.length) slides = parsed;
    }
  } catch { /* fall back to the default slides */ }

  slides.forEach((url, i) => {
    const slide = document.createElement('div');
    slide.className = 'hero-slide' + (i === 0 ? ' active' : '');
    slide.style.backgroundImage = `url('${url}')`;
    hero.insertBefore(slide, hero.firstChild);
    const dot = document.createElement('div');
    dot.className = 'hero-dot' + (i === 0 ? ' active' : '');
    dot.addEventListener('click', () => goTo(i));
    dots.appendChild(dot);
  });
  let cur = 0;
  function goTo(i) {
    document.querySelectorAll('.hero-slide').forEach((s, idx) => s.classList.toggle('active', idx === i));
    document.querySelectorAll('.hero-dot').forEach((d, idx) => d.classList.toggle('active', idx === i));
    cur = i;
  }
  setInterval(() => goTo((cur + 1) % slides.length), 5000);
}

function renderFeaturedCats() {
  const el = document.getElementById('featuredCats');
  const cats = [
    { icon: '🎨', name: 'Graphics Design', href: '/category.html?ecosystem=hire&slug=graphics-design' },
    { icon: '🧵', name: 'Tailoring', href: '/category.html?ecosystem=hire&slug=tailoring' },
    { icon: '👟', name: 'Shoes', href: '/category.html?ecosystem=shop&slug=shoes' },
    { icon: '👜', name: 'Bags', href: '/category.html?ecosystem=shop&slug=bags' },
    { icon: '📱', name: 'Gadgets', href: '/category.html?ecosystem=shop&slug=gadgets' },
    { icon: '🪑', name: 'Furniture', href: '/category.html?ecosystem=shop&slug=furniture' },
    { icon: '🔧', name: 'Plumbing', href: '/category.html?ecosystem=hire&slug=plumbing' },
    { icon: '🍳', name: 'Catering', href: '/category.html?ecosystem=hire&slug=catering' },
    { icon: '🚗', name: 'Cars', href: '/category.html?ecosystem=shop&slug=cars' },
    { icon: '💼', name: 'Remote Jobs', href: '/category.html?ecosystem=jobs&slug=remote-jobs' },
  ];
  el.innerHTML = cats.map(c => `<a href="${c.href}" class="cat-tile"><span class="cat-icon">${c.icon}</span><span class="cat-name">${c.name}</span></a>`).join('');
}

async function renderTopSellers() {
  let sellers = TOP_SELLERS;
  try {
    const featured = await API.get('/marketplace/top-sellers');
    if (featured.length) sellers = featured.map(person => ({ name: person.display_name, cat: person.role, rating: person.rating || 0, img: person.profile_image || '', tier: person.subscription_tier || 'featured', user_id: person.user_id }));
  } catch { /* retain the existing visual fallback until the admin has curated sellers */ }
  document.getElementById('topSellers').innerHTML = sellers.map(s => `
    <a class="card" href="${s.user_id ? `/profile.html?id=${s.user_id}` : '/hire.html'}">
      <div class="card-img">${s.img ? `<img src="${s.img}" alt="${s.name}">` : '<div style="height:180px;display:grid;place-items:center;font-size:3rem;background:var(--surface-2)">⭐</div>'}</div>
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div><div class="card-title">${s.name}</div><div style="color:var(--text-muted);font-size:0.82rem">${s.cat}</div></div>
          <span class="badge badge-elite">${s.tier}</span>
        </div>
        <div class="card-meta"><span class="stars">${stars(s.rating)}</span><span>${s.rating}</span></div>
      </div>
    </a>`).join('');
}

function renderRecentJobs() {
  document.getElementById('recentJobs').innerHTML = RECENT_JOBS.map(j => `
    <div class="card">
      <div class="card-img"><img src="${j.img}" alt="${j.title}"></div>
      <div class="card-body">
        <div class="card-title">${j.title}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
          <span class="card-price">${fmtPrice(j.price)}</span>
          <span class="badge badge-verified">✓ Completed</span>
        </div>
        <div class="card-meta"><span>${j.cat}</span></div>
      </div>
    </div>`).join('');
}

async function renderTestimonials() {
  const el = document.getElementById('testimonials');
  try {
    const list = await API.get('/marketplace/testimonials');
    el.innerHTML = list.length ? list.map(t => `
      <div class="testimonial">
        <p class="testimonial-text">"${t.quote}"</p>
        <div class="testimonial-author">
          ${t.avatar_url ? `<img class="testimonial-avatar" src="${t.avatar_url}" alt="${t.name}">` : ''}
          <div><div style="font-weight:500">${t.name}</div><div style="color:var(--text-muted);font-size:0.82rem">${t.role_label || ''}</div></div>
        </div>
      </div>`).join('') : '<p style="color:var(--text-muted)">Be the first to share your experience!</p>';
  } catch { el.innerHTML = ''; }
}

async function renderFeatured() {
  try {
    const items = await API.get('/marketplace/featured?placement=homepage');
    if (!items.length) return;
    document.getElementById('featuredSection').style.display = '';
    document.getElementById('featuredItems').innerHTML = items.map(i => `
      <a href="${i.href}" class="card">
        <div class="card-img">${i.image ? `<img src="${i.image}" alt="${i.title}">` : ''}</div>
        <div class="card-body"><div class="card-title">${i.title}</div><div class="card-price">${fmtPrice(i.price)}</div></div>
      </a>`).join('');
  } catch {}
}

function renderWOTD() {
  const w = WOTD[Math.floor(Date.now() / 86400000) % WOTD.length];
  document.getElementById('wotdWord').textContent = w.word;
  document.getElementById('wotdDef').textContent = w.def;
}

async function applyHomepageSectionOrder() {
  try {
    const settings = await API.get('/marketplace/settings');
    const config = settings.homepage_sections;
    if (!Array.isArray(config) || !config.length) return; // no custom order saved — leave the default markup order
    const sections = Array.from(document.querySelectorAll('[data-section]'));
    if (!sections.length) return;
    const map = new Map(sections.map(el => [el.dataset.section, el]));
    const parent = sections[0].parentElement;
    const anchor = sections[sections.length - 1].nextSibling; // whatever originally came after the last section (keeps footer/other content in place)
    config.forEach(({ key, visible }) => {
      const el = map.get(key);
      if (!el) return;
      el.style.display = visible === false ? 'none' : '';
      parent.insertBefore(el, anchor);
    });
  } catch { /* homepage layout is non-critical — fall back to default order on any error */ }
}

async function applyHomepageMetrics() {
  try {
    const settings = await API.get('/marketplace/settings');
    const m = settings.homepage_metrics || {};
    const ids = { verified_users: 'metricVerifiedUsers', total_transactions: 'metricTransactions', satisfaction_rate: 'metricSatisfaction', support_availability: 'metricSupport' };
    Object.entries(ids).forEach(([key, id]) => { if (m[key]?.value) document.getElementById(id).textContent = m[key].value; });
  } catch { /* keep the safe starter figures when settings are unavailable */ }
}

document.addEventListener('DOMContentLoaded', () => {
  renderAdSlot('#adSlotHomepage', 'homepage,landing');
  applyHomepageSectionOrder();
  applyHomepageMetrics();
  initHero();
  renderFeaturedCats();
  renderTopSellers();
  renderRecentJobs();
  renderTestimonials();
  renderFeatured();
  renderWOTD();

  document.getElementById('showTestimonialForm').addEventListener('click', () => {
    const f = document.getElementById('testimonialForm');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('submitTestimonial').addEventListener('click', async () => {
    const name = document.getElementById('tName').value.trim();
    const role_label = document.getElementById('tRole').value.trim();
    const quote = document.getElementById('tQuote').value.trim();
    if (!name || !quote) return Toast.show('Please enter your name and testimonial');
    try {
      await API.post('/marketplace/testimonials', { name, role_label, quote });
      Toast.show('Thank you! Your testimonial is awaiting review.');
      document.getElementById('tName').value = '';
      document.getElementById('tRole').value = '';
      document.getElementById('tQuote').value = '';
      document.getElementById('testimonialForm').style.display = 'none';
    } catch (e) { Toast.show(e.message); }
  });

  document.getElementById('submitSuggestion').addEventListener('click', async () => {
    const v = document.getElementById('suggestionBox').value.trim();
    if (!v) return Toast.show('Please enter your feedback');
    try {
      await API.post('/marketplace/comments', { body: v });
      Toast.show('Thank you! Your feedback has been received.');
      document.getElementById('suggestionBox').value = '';
    } catch (e) { Toast.show(e.message); }
  });
});
