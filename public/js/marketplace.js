// Marketplace page logic (hire + shop)
const Marketplace = (function () {
  const CAT_ICONS = {
        'graphics-design': '🎨', 'web-design': '💻', 'tailoring': '🧵', 'shoe-construction': '👟',
        'bag-construction': '👜', 'plumbing': '🔧', 'furniture-construction': '🪑', 'event-planning': '🎉',
        'interior-decoration': '🏠', 'painting': '🖌️', 'catering': '🍳',
        'clothes': '👕', 'shoes': '👟', 'bags': '👜', 'caps': '🧢', 'underwear': '🩲',
        'kitchen-items': '🍳', 'foodstuffs': '🥘', 'gadgets': '📱', 'furniture': '🛋️',
        'cars': '🚗', 'bikes': '🏍️', 'land': '🌍', 'thrift-items': '♻️',
        'remote-jobs': '🌐', 'office-jobs': '🏢', 'contract-jobs': '📄', 'hybrid-jobs': '🔀', 'internship': '🎓'
  };

  async function init(ecosystem) {
    if (typeof renderAdSlot === 'function') renderAdSlot(ecosystem === 'hire' ? '#adSlotHire' : '#adSlotShop', 'market');
    const cats = await API.get(`/marketplace/categories?ecosystem=${ecosystem}`).catch(() => []);
    document.getElementById('catGrid').innerHTML = cats.map(c => `
      <a href="/category.html?ecosystem=${c.ecosystem}&slug=${c.slug}" class="cat-tile">
        <span class="cat-icon">${CAT_ICONS[c.slug] || '📦'}</span>
        <span class="cat-name">${c.name}</span>
      </a>`).join('');

    const listingsEl = document.getElementById('listings');
    Skeleton.grid(8, listingsEl);
    if (ecosystem === 'hire') await loadTalent();
    await loadListings(ecosystem);

    document.getElementById('sortSel').addEventListener('change', () => loadListings(ecosystem));
  }

  async function loadTalent() {
    const root = document.getElementById('talentCards'); if (!root) return;
    const people = await API.get('/marketplace/talent').catch(() => []);
    root.innerHTML = people.length ? people.map(person => {
      const p = person.profile_sections || {}, tags = (p.skills || p.specialties || []).slice(0, 3).join(' • ');
      return `<div class="card"><div class="card-body"><img src="${person.profile_image || 'https://images.pexels.com/photos/3777943/pexels-photo-3777943.jpeg'}" style="width:60px;height:60px;border-radius:50%;object-fit:cover"><div class="card-title" style="margin-top:8px">${person.display_name || 'Freelancer'}</div><div class="card-meta">${p.headline || 'Digital professional'}</div><div class="card-meta"><span class="stars">${stars(person.rating)}</span> ${person.review_count || 0} reviews · ${person.completion_rate || 0}% completion</div><div class="card-meta">${tags || 'Professional profile in progress'}</div><div class="card-actions" style="margin-top:12px"><a class="btn btn-outline btn-sm" href="/profile.html?id=${person.user_id}">View profile</a><a class="btn btn-gold btn-sm" href="/chat.html?to=${person.user_id}">Discuss project</a></div></div></div>`;
    }).join('') : '<p style="grid-column:1/-1;color:var(--text-muted)">No available freelancer profiles yet.</p>';
  }

  async function loadListings(ecosystem) {
    const sort = document.getElementById('sortSel').value;
    const endpoint = ecosystem === 'hire' ? '/marketplace/services' : '/marketplace/products';
    const items = await API.get(endpoint + (sort !== 'recommended' ? `?sort=${sort}` : '')).catch(() => []);
    const el = document.getElementById('listings');
    if (!items.length) {
      el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text-muted)">No listings yet. Be the first to ${ecosystem === 'hire' ? 'offer a service' : 'list a product'}!</div>`;
      return;
    }
    el.innerHTML = items.map(item => card(item, ecosystem)).join('');
    el.querySelectorAll('[data-longpress]').forEach(bindLongPress);
  }

  function card(item, ecosystem) {
    const img = (item.images && item.images[0]) || 'https://images.pexels.com/photos/3184405/pexels-photo-3184405.jpeg';
    const seller = item.profiles || {};
    return `
      <div class="card" data-longpress data-id="${item.id}" data-type="${ecosystem === 'hire' ? 'service' : 'product'}">
        <div class="card-img"><img src="${img}" alt="${item.title}"></div>
        <div class="card-body">
          <div class="card-title">${item.title}</div>
          <div class="card-price">${fmtPrice(item.price)}</div>
          <div class="card-meta">
            <span>by ${seller.display_name || 'Unknown'}</span>
            ${seller.kyc_level >= 3 ? '<span class="badge badge-verified">✓ KYC</span>' : ''}
            ${seller.subscription_tier && seller.subscription_tier !== 'free' ? `<span class="badge badge-gold">${seller.subscription_tier}</span>` : ''}
          </div>
          <div class="card-meta"><span class="stars">${stars(item.rating)}</span><span>${item.review_count || 0} reviews</span></div>
          <div class="card-actions">
            <a href="/listing.html?type=${ecosystem === 'hire' ? 'service' : 'product'}&id=${item.id}" class="btn btn-outline btn-sm">View</a>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();saveItem('${item.id}')">♡ Save</button>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();shareItem('${item.id}')">↗ Share</button>
          </div>
        </div>
      </div>`;
  }

  function bindLongPress(el) {
    let timer;
    el.addEventListener('touchstart', () => { timer = setTimeout(() => openLongPressMenu(el), 600); });
    el.addEventListener('touchend', () => clearTimeout(timer));
    el.addEventListener('mousedown', () => { timer = setTimeout(() => openLongPressMenu(el), 600); });
    el.addEventListener('mouseup', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => clearTimeout(timer));
  }

  function openLongPressMenu(el) {
    const id = el.dataset.id, type = el.dataset.type;
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal"><h3 style="margin-bottom:20px">Quick actions</h3>
      <a href="/listing.html?type=${type}&id=${id}" class="btn btn-outline btn-block" style="margin-bottom:8px">View details</a>
      <a href="/chat.html" class="btn btn-outline btn-block" style="margin-bottom:8px">Chat seller</a>
      <button class="btn btn-outline btn-block" style="margin-bottom:8px" onclick="saveItem('${id}')">♡ Save</button>
      <button class="btn btn-outline btn-block" style="margin-bottom:16px" onclick="shareItem('${id}')">↗ Share</button>
      <button class="btn btn-ghost btn-block" onclick="this.closest('.modal-overlay').remove()">Close</button></div>`;
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
  }

  return { init, openLongPressMenu };
})();

window.saveItem = function (id) { Toast.show('Saved to your favorites'); };
window.shareItem = function (id) {
  if (navigator.share) navigator.share({ url: location.href }).catch(() => {});
  else { navigator.clipboard?.writeText(location.href); Toast.show('Link copied'); }
};
