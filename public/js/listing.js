document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const type = params.get('type');
  const id = params.get('id');
  const main = document.getElementById('listingMain');
  main.innerHTML = '<div class="skeleton" style="height:400px"></div>';

  const item = await API.get(`/marketplace/listing/${type}/${id}`).catch(() => null);
  if (!item) { main.innerHTML = '<p>Listing not found.</p>'; return; }

  const seller = item.profiles || {};
  const images = item.images && item.images.length ? item.images : ['https://images.pexels.com/photos/3184405/pexels-photo-3184405.jpeg'];
  let slideIdx = 0;
  main.innerHTML = `
    <div class="grid grid-2" style="gap:40px;align-items:start">
      <div>
        <div class="card" style="overflow:hidden">
          <div class="card-img" style="aspect-ratio:1/1;cursor:pointer" id="mainImg"><img src="${images[0]}" alt="${item.title}"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;overflow-x:auto">
          ${images.map((img, i) => `<img src="${img}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid ${i === 0 ? 'var(--gold)' : 'var(--border)'}" data-img="${i}">`).join('')}
        </div>
        ${item.video_url ? `<video controls style="width:100%;margin-top:12px;border-radius:var(--radius)"><source src="${item.video_url}"></video>` : ''}
      </div>
      <div>
        <span class="eyebrow">${type === 'service' ? 'Service' : 'Product'}</span>
        <h1 class="section-title">${item.title}</h1>
        <div class="card-price" style="font-size:1.8rem;margin:8px 0">${fmtPrice(item.price)}</div>
        <div class="card-meta" style="margin-bottom:16px"><span class="stars">${stars(item.rating)}</span><span>${item.review_count || 0} reviews</span></div>
        ${item.size ? `<div style="margin:8px 0"><strong>Size:</strong> ${item.size}</div>` : ''}
        ${item.color ? `<div style="margin:8px 0"><strong>Color:</strong> ${item.color}</div>` : ''}
        ${item.gender ? `<div style="margin:8px 0"><strong>Gender:</strong> ${item.gender}</div>` : ''}
        ${item.delivery_days ? `<div style="margin:8px 0"><strong>Delivery:</strong> ${item.delivery_days} days</div>` : ''}
        <p style="margin:16px 0;color:var(--text-soft)">${item.description || 'No description provided.'}</p>

        <div class="card" style="margin:20px 0">
          <div class="card-body" style="display:flex;align-items:center;gap:14px">
            <img src="${seller.profile_image || 'https://images.pexels.com/photos/3777943/pexels-photo-3777943.jpeg'}" style="width:56px;height:56px;border-radius:50%;object-fit:cover">
            <div style="flex:1">
              <div style="font-weight:500">${seller.display_name || 'Seller'}</div>
              <div class="card-meta"><span class="stars">${stars(seller.rating)}</span>
              ${seller.kyc_level >= 3 ? '<span class="badge badge-verified">✓ KYC</span>' : ''}
              ${seller.subscription_tier && seller.subscription_tier !== 'free' ? `<span class="badge badge-gold">${seller.subscription_tier}</span>` : ''}</div>
            </div>
            <a href="/profile.html?id=${seller.user_id}" class="btn btn-outline btn-sm">View profile</a>
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <a href="/chat.html?to=${seller.user_id}&listing=${item.id}" class="btn btn-primary">💬 Chat</a>
          <button class="btn btn-outline" onclick="saveItem('${item.id}')">♡ Save</button>
          <button class="btn btn-outline" onclick="shareItem('${item.id}')">↗ Share</button>
          ${type === 'service' ? `<a href="/post-job.html?service=${id}" class="btn btn-gold">Hire now</a>` : `<button class="btn btn-gold" onclick="Toast.show('Added to cart (demo)')">Add to cart</button>`}
        </div>
      </div>
    </div>
    <div class="ad-slot" id="adSlotListing" style="margin:32px 0">Advertisement</div>
    <h2 style="font-size:1.6rem;margin-bottom:16px">Reviews</h2>
    <div id="reviews"></div>`;
  renderAdSlot('#adSlotListing', 'category');

  document.querySelectorAll('[data-img]').forEach(t => t.addEventListener('click', () => {
    slideIdx = +t.dataset.img;
    document.getElementById('mainImg').querySelector('img').src = images[slideIdx];
    document.querySelectorAll('[data-img]').forEach((x, i) => x.style.borderColor = i === slideIdx ? 'var(--gold)' : 'var(--border)');
  }));
  document.getElementById('mainImg').addEventListener('click', () => {
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.innerHTML = `<img src="${images[slideIdx]}" style="max-width:90%;max-height:90%;border-radius:var(--radius)">`;
    m.addEventListener('click', () => m.remove());
    document.body.appendChild(m);
  });

  const reviews = await API.get(`/marketplace/reviews/${seller.user_id}`).catch(() => []);
  document.getElementById('reviews').innerHTML = reviews.length ? reviews.map(r => `
    <div class="card" style="margin-bottom:12px"><div class="card-body">
      <div style="display:flex;justify-content:space-between"><strong>${r.reviewer?.display_name || 'Anonymous'}</strong><span class="stars">${stars(r.stars)}</span></div>
      <p style="color:var(--text-soft);margin-top:8px">${r.comment}</p>
      <div style="font-size:0.8rem;color:var(--text-muted);margin-top:8px">${timeAgo(r.created_at)}${r.hire_again ? ' • Would hire again' : ''}</div>
    </div></div>`).join('') : '<p style="color:var(--text-muted)">No reviews yet.</p>';
});
