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
    await loadListings(ecosystem);

    document.getElementById('sortSel').addEventListener('change', () => loadListings(ecosystem));
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
