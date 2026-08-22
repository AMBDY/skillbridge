// SkillBridge shared client logic
const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';

let sb = null;
let sbInitPromise = null;

function initSb() {
  if (sb) return Promise.resolve(sb);
  if (sbInitPromise) return sbInitPromise;
  sbInitPromise = new Promise((resolve) => {
    if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return resolve(sb);
    }
    const check = setInterval(() => {
      if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
        clearInterval(check);
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        resolve(sb);
      }
    }, 100);
    setTimeout(() => { clearInterval(check); resolve(null); }, 10000);
  });
  return sbInitPromise;
}

const API = (function () {
  const base = '/api';
  async function req(path, opts = {}) {
    const token = Auth.getToken();
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }
  return {
    get: (p) => req(p),
    post: (p, body) => req(p, { method: 'POST', body: JSON.stringify(body) }),
    put: (p, body) => req(p, { method: 'PUT', body: JSON.stringify(body) }),
    del: (p) => req(p, { method: 'DELETE' }),
  };
})();

const Auth = (function () {
  function getToken() { return localStorage.getItem('sb_token'); }
  function setSession(token, refreshToken, user) {
    localStorage.setItem('sb_token', token);
    localStorage.setItem('sb_refresh', refreshToken);
    localStorage.setItem('sb_user', JSON.stringify(user));
  }
  function clear() { localStorage.removeItem('sb_token'); localStorage.removeItem('sb_refresh'); localStorage.removeItem('sb_user'); }
  function user() { try { return JSON.parse(localStorage.getItem('sb_user')); } catch { return null; } }
  function isLoggedIn() { return !!getToken(); }

  async function signup(payload) {
    const client = await initSb();
    if (!client) throw new Error('Supabase not initialized');

    // 1. Check if email is in admin_emails table (anon can read it)
    const { data: adminRec } = await client.from('admin_emails').select('email').eq('email', payload.email.toLowerCase()).maybeSingle();
    const isAdmin = !!adminRec;

    // 2. Create auth user via Supabase auth
    const { data: authData, error: authErr } = await client.auth.signUp({ email: payload.email, password: payload.password });
    if (authErr) throw new Error(authErr.message);
    const userId = authData.user?.id;
    if (!userId) throw new Error('Failed to create auth user');

    // 3. Insert profile using the authenticated session
    const finalRole = isAdmin ? 'admin' : payload.role;
    const { data: profile, error: profErr } = await client.from('profiles').insert({
      user_id: userId,
      role: finalRole,
      first_name: payload.first_name,
      middle_name: payload.middle_name,
      last_name: payload.last_name,
      display_name: payload.display_name,
      email: payload.email,
      phone: payload.phone,
      country: payload.country || 'Nigeria',
      state: payload.state,
      city: payload.city,
      address: payload.address,
      bank_name: payload.bank_name,
      account_number: payload.account_number,
      account_holder_name: payload.account_holder_name,
      kyc_level: payload.kyc_selfie ? 1 : 0
    }).select().single();
    if (profErr) throw new Error(profErr.message);

    // 4. Submit KYC if selfie provided
    if (payload.kyc_selfie) {
      await client.from('kyc_submissions').insert({
        user_id: userId,
        selfie_url: payload.kyc_selfie,
        full_name: `${payload.first_name || ''} ${payload.last_name || ''}`.trim()
      });
    }

    // 5. Get session token
    const { data: session } = await client.auth.getSession();
    const token = session?.session?.access_token || '';
    const refreshToken = session?.session?.refresh_token || '';

    setSession(token, refreshToken, profile);
    fetch('/api/auth/welcome-email', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    return { user: profile, token, refreshToken };
  }

  async function signin(email, password) {
    const res = await fetch('/api/auth/signin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || 'Sign in failed');

    // Hand the session to the Supabase client so it can refresh tokens / stay in sync
    const client = await initSb();
    if (client && result.token && result.refreshToken) {
      await client.auth.setSession({ access_token: result.token, refresh_token: result.refreshToken }).catch(() => {});
    }
    setSession(result.token, result.refreshToken, result.user);
    return { user: result.user, token: result.token, refreshToken: result.refreshToken };
  }

  async function me() {
    const client = await initSb();
    if (!client) return { user: null };
    const { data: { session } } = await client.auth.getSession();
    if (!session) return { user: null };
    const { data: profile } = await client.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle();
    return { user: profile };
  }

  function logout() {
    clear();
    initSb().then(c => c?.auth.signOut().catch(() => {}));
    window.location.href = '/';
  }

  return { getToken, setSession, clear, user, isLoggedIn, me, signin, signup, logout };
})();

// Upload image to Supabase Storage
async function uploadImage(file, folder = 'kyc') {
  const client = await initSb();
  if (!client) throw new Error('Storage not configured');
  const ext = file.name.split('.').pop();
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await client.storage.from('kyc').upload(fileName, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data: pub } = client.storage.from('kyc').getPublicUrl(fileName);
  return pub.publicUrl;
}

const Theme = (function () {
  function get() { return localStorage.getItem('sb_theme') || 'light'; }
  function set(t) { localStorage.setItem('sb_theme', t); document.documentElement.setAttribute('data-theme', t); updateToggle(); }
  function toggle() { set(get() === 'light' ? 'dark' : 'light'); }
  function updateToggle() {
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = get() === 'light' ? '🌙' : '☀️';
  }
  function init() { set(get()); }
  return { get, set, toggle, init, updateToggle };
})();

const Upload = {
  async file(file) {
    if (!file) throw new Error('No file selected');
    const token = Auth.getToken();
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/uploads', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data.url;
  },
  async remove(url) {
    const token = Auth.getToken();
    const res = await fetch('/api/uploads', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ url }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'File removal failed');
  }
};

const FormControls = {
  async apply(formKey, root = document) {
    try {
      const controls = await API.get(`/marketplace/form-controls/${encodeURIComponent(formKey)}`);
      controls.forEach(control => {
        const field = root.querySelector(`[name="${CSS.escape(control.field_key)}"]`);
        if (!field) return;
        const group = field.closest('.form-group') || field.closest('details') || field.parentElement;
        if (group) group.style.display = control.is_visible === false ? 'none' : '';
        field.required = control.is_required === true;
        const label = group?.querySelector('label.form-label');
        if (label && control.label) label.textContent = control.label + (control.is_required ? ' *' : '');
        if (group && control.help_text) {
          let help = group.querySelector('.admin-field-help');
          if (!help) { help = document.createElement('small'); help.className = 'admin-field-help'; help.style.cssText = 'color:var(--text-muted);display:block;margin-top:4px'; group.appendChild(help); }
          help.textContent = control.help_text;
        }
      });
    } catch { /* controls are optional; keep the form functional */ }
  }
};

async function renderAdSlot(selector, page) {
  const el = document.querySelector(selector);
  if (!el) return;
  try {
    const ads = await API.get(`/marketplace/ads?page=${page}`);
    if (!ads.length) return; // leave the placeholder text if nothing is scheduled
    el.innerHTML = ads.map(ad => `
      <a href="${ad.link_url || '#'}" ${ad.link_new_tab ? 'target="_blank" rel="noopener"' : ''}
         onclick="fetch('/api/marketplace/ads/${ad.id}/click', {method:'POST'})"
         style="display:block;border-radius:var(--radius-lg);overflow:hidden">
        ${ad.media_url ? `<img src="${ad.media_url}" alt="${ad.title}" style="width:100%;display:block">` : `<div style="padding:16px;background:var(--bg-elev)"><strong>${ad.title}</strong><p style="color:var(--text-muted);margin-top:4px">${ad.description || ''}</p></div>`}
      </a>`).join('');
  } catch {}
}

async function initAdsenseSlots() {
  const slots = document.querySelectorAll('.adsense-slot[data-placement]');
  if (!slots.length) return;
  try {
    const config = await API.get('/marketplace/adsense');
    if (!config.enabled) return;
    const unitMap = new Map(config.units.map(u => [u.placement, u]));
    slots.forEach(slot => {
      const unit = unitMap.get(slot.dataset.placement);
      if (!unit) return; // no active unit for this placement — leave the slot empty
      slot.innerHTML = `<ins class="adsbygoogle" style="display:block" data-ad-client="${config.publisher_id}" data-ad-slot="${unit.slot_id}" data-ad-format="${unit.ad_format}" data-full-width-responsive="true"></ins>`;
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    });
  } catch { /* AdSense is non-critical — never break the page over it */ }
}

const Toast = (function () {
  function ensure() {
    let w = document.querySelector('.toast-wrap');
    if (!w) { w = document.createElement('div'); w.className = 'toast-wrap'; document.body.appendChild(w); }
    return w;
  }
  function show(msg, ms = 3500) {
    const w = ensure();
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    w.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, ms);
  }
  return { show };
})();

const Skeleton = (function () {
  function grid(count, container) {
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `<div class="skeleton card-img"></div><div class="card-body"><div class="skeleton" style="height:18px;width:80%;margin-bottom:8px"></div><div class="skeleton" style="height:14px;width:50%"></div></div>`;
      container.appendChild(el);
    }
  }
  return { grid };
})();

function fmtPrice(n) {
  return '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
}
function stars(n) {
  const full = Math.round(n || 0);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}
function timeAgo(date) {
  const d = new Date(date); const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

let siteSettings = { site_name: 'SkillBridge', logo_url: null };
let enabledPlatformFeatures = null;
API.get('/marketplace/settings').then(s => { siteSettings = s; if (document.getElementById('navbar')) renderNav(); if (document.getElementById('footer')) renderFooter(); }).catch(() => {});
API.get('/marketplace/features').then(features => { enabledPlatformFeatures = new Map(features.map(f => [f.feature_key, f.enabled])); if (document.getElementById('navbar')) renderNav(); }).catch(() => {});

function renderNav() {
  const nav = document.getElementById('navbar');
  if (!nav) return;
  const logged = Auth.isLoggedIn();
  const user = Auth.user();
  const brand = siteSettings.logo_url
    ? `<img src="${siteSettings.logo_url}" alt="${siteSettings.site_name}" style="height:32px">`
    : (siteSettings.site_name === 'SkillBridge' ? 'Skill<span>Bridge</span>' : (siteSettings.site_name || 'SkillBridge'));
  const recruitHref = (user && ['client', 'admin'].includes(user.role)) ? '/recruiter-jobs.html' : '/recruitment-jobs.html';
  const featureEnabled = key => !enabledPlatformFeatures || enabledPlatformFeatures.get(key) !== false;
  const roleLabels = { client: 'Client', freelancer: 'Freelancer', worker: 'Worker', seller: 'Seller', admin: 'Superadmin' };
  const authLinks = logged ? `
          <a href="/profile.html?id=${user?.user_id}" class="nav-identity" style="display:flex;align-items:center;gap:8px;text-decoration:none;color:inherit;padding:4px 10px;border-radius:20px;background:var(--bg-elev)">
            <span style="width:26px;height:26px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--gold);display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:#fff">
              ${user?.profile_image ? `<img src="${user.profile_image}" style="width:100%;height:100%;object-fit:cover">` : (user?.display_name || 'U').charAt(0).toUpperCase()}
            </span>
            <span style="display:flex;flex-direction:column;line-height:1.2">
              <span style="font-size:0.82rem;font-weight:600">${user?.display_name || 'User'}</span>
              <span style="font-size:0.7rem;color:var(--text-muted)">${roleLabels[user?.role] || user?.role || ''}</span>
            </span>
          </a>
          <a href="/chat.html" class="icon-btn" title="Messages">💬</a>
          <a href="/orders.html" class="icon-btn" title="Product orders">📦</a>
          <a href="/edit-profile.html" class="icon-btn" title="Edit my profile">✏️</a>
           ${featureEnabled('recruitment') ? `<a href="${recruitHref}" class="btn btn-outline btn-sm">Job Recruitment</a>` : ''}
          <a href="/dashboard.html" class="btn btn-outline btn-sm">Dashboard</a>
          ${user && user.role === 'admin' ? '<a href="/admin.html" class="btn btn-gold btn-sm">Admin</a>' : ''}
          <button class="btn btn-primary btn-sm js-logout">Sign out</button>
        ` : `
          <a href="/signin.html" class="btn btn-ghost btn-sm">Sign in</a>
          <a href="/signup.html" class="btn btn-gold btn-sm">Sign up</a>
        `;
  nav.style.position = 'relative';
  nav.innerHTML = `
    <div class="container nav-inner">
      <a href="/" class="logo">${brand}</a>
      <div class="nav-search"><input type="text" placeholder="Search services, products, jobs..." id="navSearchInput"></div>
      <div class="nav-actions">
        <button class="icon-btn" id="themeToggle" title="Toggle theme">🌙</button>
        <div style="position:relative;display:inline-block">
          <button class="icon-btn" id="notifBtn" title="Notifications">🔔${logged ? '<span class="badge" id="notifBadge" style="display:none">0</span>' : ''}</button>
          <div id="notifDropdown" style="display:none;position:absolute;right:0;top:100%;width:320px;max-height:400px;overflow-y:auto;background:var(--bg-elev);border-radius:var(--radius);box-shadow:var(--shadow-lg);z-index:200;margin-top:8px"></div>
        </div>
        ${authLinks}
        <button class="icon-btn hamburger" id="hamburger">☰</button>
      </div>
    </div>
    <div class="nav-mobile-menu" id="navMobileMenu">${authLinks}</div>`;
  Theme.updateToggle();
  document.getElementById('themeToggle').addEventListener('click', Theme.toggle);
  const si = document.getElementById('navSearchInput');
  if (si) si.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.location.href = `/search.html?q=${encodeURIComponent(si.value)}`; });
  document.querySelectorAll('.js-logout').forEach(btn => btn.addEventListener('click', () => { Auth.logout(); Toast.show('Signed out'); }));

  const notifBtn = document.getElementById('notifBtn');
  const notifDropdown = document.getElementById('notifDropdown');
  if (notifBtn && logged) {
    async function refreshNotifications(openAfter) {
      try {
        const items = await API.get('/marketplace/notifications');
        const unread = items.filter(n => !n.read);
        const badge = document.getElementById('notifBadge');
        if (badge) { badge.textContent = unread.length; badge.style.display = unread.length ? 'inline-block' : 'none'; }
        if (openAfter) {
          notifDropdown.innerHTML = items.length ? items.map(n => `
            <div class="notif-item" data-id="${n.id}" data-link="${n.link || ''}" style="padding:12px 14px;border-bottom:1px solid rgba(0,0,0,0.06);cursor:pointer;${n.read ? '' : 'background:var(--bg)'}">
              <div style="font-weight:${n.read ? '400' : '600'};font-size:0.9rem">${n.title || n.type}</div>
              ${n.body ? `<div style="font-size:0.82rem;color:var(--text-muted);margin-top:2px">${n.body}</div>` : ''}
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">${timeAgo(n.created_at)}</div>
            </div>`).join('') : '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.9rem">No notifications yet</div>';
          notifDropdown.querySelectorAll('.notif-item').forEach(el => el.addEventListener('click', async () => {
            await API.put(`/marketplace/notifications/${el.dataset.id}/read`).catch(() => {});
            if (el.dataset.link) location.href = el.dataset.link;
            else refreshNotifications(true);
          }));
        }
      } catch { /* non-critical */ }
    }
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = notifDropdown.style.display === 'block';
      notifDropdown.style.display = open ? 'none' : 'block';
      if (!open) refreshNotifications(true);
    });
    document.addEventListener('click', (e) => { if (!notifDropdown.contains(e.target) && e.target !== notifBtn) notifDropdown.style.display = 'none'; });
    refreshNotifications(false);
    setInterval(() => refreshNotifications(notifDropdown.style.display === 'block'), 45000);
  }

  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('navMobileMenu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
      hamburger.textContent = mobileMenu.classList.contains('open') ? '✕' : '☰';
    });
    // close the menu after tapping any link/button inside it
    mobileMenu.addEventListener('click', (e) => {
      if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') {
        mobileMenu.classList.remove('open');
        hamburger.textContent = '☰';
      }
    });
  }
}

function renderFooter() {
  const f = document.getElementById('footer');
  if (!f) return;
  f.innerHTML = `
    <div class="container">
      <div class="adsense-slot" data-placement="footer" style="margin-bottom:24px"></div>
      <div class="footer-grid">
        <div>
          <div class="logo" style="color:#fff;margin-bottom:12px">${siteSettings.site_name === 'SkillBridge' ? 'Skill<span style="color:var(--gold)">Bridge</span>' : (siteSettings.site_name || 'SkillBridge')}</div>
          <p style="color:#b8b4ac;font-size:0.9rem;max-width:320px">Africa's premium marketplace for talent, products, and jobs. Built for trust, designed for growth.</p>
          <div class="social-row" style="margin-top:16px">
            <a href="#" title="Twitter">𝕏</a><a href="#" title="Instagram">📷</a><a href="#" title="LinkedIn">in</a><a href="#" title="Facebook">f</a>
          </div>
        </div>
        <div><h4>Ecosystems</h4><a href="/hire.html">Hire Talent</a><a href="/shop.html">Shop Products</a><a href="/jobs.html">Find Jobs</a></div>
        <div><h4>Company</h4><a href="/about.html">About</a><a href="/about.html#mission">Mission</a><a href="/blog.html">Blog</a><a href="/contact.html">Contact</a><a href="/faq.html">FAQ</a><a href="/signup.html">Sign up</a><a href="/signin.html">Sign in</a></div>
        <div><h4>Support</h4><a href="#">Help Center</a><a href="#">Contact</a><a href="#">Terms</a><a href="#">Privacy</a></div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} SkillBridge. All rights reserved.</span>
        <span>Made with care in Nigeria 🇳🇬</span>
      </div>
    </div>`;
}

document.addEventListener('DOMContentLoaded', () => { Theme.init(); renderNav(); renderFooter(); initAdsenseSlots(); });
