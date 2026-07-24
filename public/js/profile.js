document.addEventListener('DOMContentLoaded', async () => {
  const id = new URLSearchParams(location.search).get('id') || Auth.user()?.user_id;
  const main = document.getElementById('profileMain');
  if (!id) { main.innerHTML = '<p class="container" style="padding:32px">No profile specified.</p>'; return; }
  main.innerHTML = '<div class="skeleton" style="height:300px"></div>';

  const [profile, reviews] = await Promise.all([
    API.get(`/marketplace/profile/${id}`).catch(() => null),
    API.get(`/marketplace/reviews/${id}`).catch(() => [])
  ]);
  if (!profile) { main.innerHTML = '<p class="container" style="padding:32px">Profile not found.</p>'; return; }

  const tierBadge = { elite: 'badge-elite', featured: 'badge-gold', pro: 'badge-gold', free: 'badge-kyc' }[profile.subscription_tier || 'free'];
  const kycLabels = ['Unverified', 'Phone verified', 'ID verified', 'KYC verified', 'Elite verified'];

  main.innerHTML = `
    <div style="background:var(--navy);height:200px;position:relative">
      ${profile.cover_image ? `<img src="${profile.cover_image}" style="width:100%;height:100%;object-fit:cover;opacity:0.6">` : ''}
    </div>
    <div class="container" style="margin-top:-60px;position:relative;z-index:2;padding-bottom:64px">
      <div style="display:flex;gap:20px;align-items:flex-end;flex-wrap:wrap">
        <img src="${profile.profile_image || 'https://images.pexels.com/photos/3777943/pexels-photo-3777943.jpeg'}" style="width:120px;height:120px;border-radius:50%;border:4px solid var(--bg-elev);object-fit:cover">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <h1 style="color:var(--text);font-size:2rem">${profile.display_name}</h1>
            <span class="badge ${tierBadge}">${profile.subscription_tier || 'free'}</span>
            <span class="badge badge-kyc">L${profile.kyc_level} ${kycLabels[profile.kyc_level]}</span>
          </div>
          <div class="card-meta"><span class="stars">${stars(profile.rating)}</span><span>${profile.review_count} reviews</span><span>•</span><span>${profile.role}</span></div>
        </div>
        <a href="/chat.html?to=${profile.user_id}" class="btn btn-gold">💬 Message</a>
      </div>

      <div class="grid grid-4" style="margin:24px 0">
        <div class="stat-card"><div class="stat-num">${profile.rating || 0}★</div><div class="stat-label">Rating</div></div>
        <div class="stat-card"><div class="stat-num">${profile.completion_rate || 100}%</div><div class="stat-label">Completion</div></div>
        <div class="stat-card"><div class="stat-num">${profile.response_time_hours || 24}h</div><div class="stat-label">Response time</div></div>
        <div class="stat-card"><div class="stat-num">${profile.availability ? 'Available' : 'Busy'}</div><div class="stat-label">Status</div></div>
      </div>

      <div class="grid grid-2" style="gap:32px">
        <div>
          <h2 style="font-size:1.5rem;margin-bottom:12px">About</h2>
          <p style="color:var(--text-soft)">${profile.about || 'No about section yet.'}</p>
          ${profile.cover_letter ? `<h3 style="margin-top:20px;font-size:1.2rem">Cover letter</h3><p style="color:var(--text-soft)">${profile.cover_letter}</p>` : ''}
          <div style="margin-top:20px;font-size:0.9rem;color:var(--text-muted)">
            ${profile.city ? `<div>📍 ${profile.city}, ${profile.state}, ${profile.country}</div>` : ''}
            <div>Member since ${new Date(profile.created_at).getFullYear()}</div>
          </div>
        </div>
        <div>
          <h2 style="font-size:1.5rem;margin-bottom:12px">Reviews (${reviews.length})</h2>
          <div style="max-height:500px;overflow-y:auto">
            ${reviews.length ? reviews.map(r => `
              <div class="card" style="margin-bottom:10px"><div class="card-body">
                <div style="display:flex;justify-content:space-between"><strong>${r.reviewer?.display_name || 'Anonymous'}</strong><span class="stars">${stars(r.stars)}</span></div>
                <p style="color:var(--text-soft);margin-top:6px;font-size:0.9rem">${r.comment}</p>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px">${timeAgo(r.created_at)}${r.hire_again ? ' • Would hire again' : ''}</div>
              </div></div>`).join('') : '<p style="color:var(--text-muted)">No reviews yet.</p>'}
          </div>
        </div>
      </div>
    </div>`;
});
