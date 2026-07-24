document.addEventListener('DOMContentLoaded', async () => {
  renderAdSlot('#adSlotCategory', 'category');
  const params = new URLSearchParams(location.search);
  const ecosystem = params.get('ecosystem');
  const slug = params.get('slug');

  const cats = await API.get('/marketplace/categories').catch(() => []);
  const cat = cats.find(c => c.slug === slug && c.ecosystem === ecosystem);
  document.getElementById('catHead').innerHTML = `
    <span class="eyebrow">${ecosystem === 'hire' ? 'Hire Talent' : ecosystem === 'shop' ? 'Shop Products' : 'Find Jobs'}</span>
    <h1 class="section-title">${cat?.name || 'Category'}</h1>
    <p class="section-sub">${cat?.description || 'Browse listings in this category.'}</p>`;

  const el = document.getElementById('listings');
  Skeleton.grid(8, el);

  async function load() {
    const sort = document.getElementById('filterSort').value;
    const verified = document.getElementById('filterVerified').checked;
    const online = document.getElementById('filterOnline').checked;
    let endpoint = ecosystem === 'jobs'
      ? `/jobs?category_id=${cat?.id || ''}`
      : `/marketplace/${ecosystem === 'hire' ? 'services' : 'products'}?category_id=${cat?.id || ''}${sort !== 'recommended' ? `&sort=${sort}` : ''}`;
    let items = await API.get(endpoint).catch(() => []);
    if (verified) items = items.filter(i => i.profiles?.kyc_level >= 3);
    if (online) items = items.filter(i => i.profiles?.is_online);
    if (!items.length) {
      el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text-muted)">No listings in this category yet.</div>`;
      return;
    }
    if (ecosystem === 'jobs') {
      el.className = '';
      el.innerHTML = items.map(j => `
        <div class="card" style="grid-column:1/-1">
          <div class="card-body" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px">
            <div><div class="card-title" style="font-size:1.2rem"><a href="/job.html?id=${j.id}">${j.title}</a></div>
            <div class="card-meta"><span>${j.location || j.state || 'Nigeria'}</span><span>•</span><span>${j.duration || 'Flexible'}</span></div></div>
            <div style="text-align:right"><div class="card-price">${fmtPrice(j.budget || 0)}</div>
            <a href="/job.html?id=${j.id}" class="btn btn-gold btn-sm" style="margin-top:8px">View & Bid</a></div>
          </div>
        </div>`).join('');
    } else {
      el.className = 'grid grid-4';
      el.innerHTML = items.map(item => {
        const img = (item.images && item.images[0]) || 'https://images.pexels.com/photos/3184405/pexels-photo-3184405.jpeg';
        const seller = item.profiles || {};
        const type = ecosystem === 'hire' ? 'service' : 'product';
        return `<div class="card">
          <div class="card-img"><img src="${img}" alt="${item.title}"></div>
          <div class="card-body">
            <div class="card-title">${item.title}</div>
            <div class="card-price">${fmtPrice(item.price)}</div>
            <div class="card-meta"><span>by ${seller.display_name || 'Unknown'}</span>
            ${seller.kyc_level >= 3 ? '<span class="badge badge-verified">✓</span>' : ''}</div>
            <div class="card-actions">
              <a href="/listing.html?type=${type}&id=${item.id}" class="btn btn-outline btn-sm">View</a>
              <button class="btn btn-ghost btn-sm" onclick="saveItem('${item.id}')">♡</button>
              <button class="btn btn-ghost btn-sm" onclick="shareItem('${item.id}')">↗</button>
            </div>
          </div></div>`;
      }).join('');
    }
  }
  document.getElementById('filterSort').addEventListener('change', load);
  document.getElementById('filterVerified').addEventListener('change', load);
  document.getElementById('filterOnline').addEventListener('change', load);
  load();
});
