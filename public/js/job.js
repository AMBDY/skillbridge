document.addEventListener('DOMContentLoaded', async () => {
  const id = new URLSearchParams(location.search).get('id');
  const main = document.getElementById('jobMain');
  main.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  const job = await API.get(`/jobs/${id}`).catch(() => null);
  if (!job) { main.innerHTML = '<p>Job not found.</p>'; return; }

  const client = job.profiles || {};
  main.innerHTML = `
    <span class="eyebrow">${job.categories?.name || 'Job'}</span>
    <h1 class="section-title">${job.title}</h1>
    <div class="card-meta" style="margin-bottom:16px">
      <span>by ${client.display_name || 'Client'}</span>
      <span>•</span><span>${job.location || job.state || 'Nigeria'}</span>
      <span>•</span><span>${job.duration || 'Flexible'}</span>
      <span>•</span><span class="badge badge-kyc">${job.status}</span>
    </div>
    <div class="card-price" style="font-size:1.6rem;margin-bottom:16px">Budget: ${fmtPrice(job.budget || job.price_max || 0)}</div>
    <p style="color:var(--text-soft);margin-bottom:16px">${job.description || 'No description.'}</p>
    ${job.gender ? `<div><strong>Gender:</strong> ${job.gender}</div>` : ''}
    ${job.colors ? `<div><strong>Colors:</strong> ${job.colors}</div>` : ''}
    ${job.size ? `<div><strong>Size:</strong> ${job.size}</div>` : ''}
    ${job.additional_notes ? `<div style="margin-top:12px"><strong>Notes:</strong> ${job.additional_notes}</div>` : ''}
    ${job.reference_images && job.reference_images.length ? `<div style="margin-top:16px"><strong>Reference images:</strong><div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">${job.reference_images.map(i => `<img src="${i}" style="width:100px;height:100px;object-fit:cover;border-radius:8px">`).join('')}</div></div>` : ''}

    <div class="card" style="margin:24px 0">
      <div class="card-body" style="display:flex;align-items:center;gap:14px">
        <img src="${client.profile_image || 'https://images.pexels.com/photos/3777943/pexels-photo-3777943.jpeg'}" style="width:48px;height:48px;border-radius:50%;object-fit:cover">
        <div style="flex:1"><div style="font-weight:500">${client.display_name}</div>
        <div class="card-meta"><span class="stars">${stars(client.rating)}</span>${client.kyc_level >= 3 ? '<span class="badge badge-verified">✓ KYC</span>' : ''}</div></div>
        <a href="/chat.html?to=${client.user_id}" class="btn btn-outline btn-sm">💬 Chat</a>
      </div>
    </div>

    <h2 style="font-size:1.5rem;margin:24px 0 16px">Place a Bid</h2>
    <div class="card"><div class="card-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Your offer (₦)</label><input class="form-input" type="number" id="bidAmount" value="${job.budget || job.price_max || 0}"></div>
        <div class="form-group"><label class="form-label">Duration</label><select class="form-select" id="bidDuration">
          <option>3 days</option><option>5 days</option><option>1 week</option><option>2 weeks</option><option>1 month</option><option>Permanent</option><option>Other</option>
        </select></div>
      </div>
      <div class="form-group"><label class="form-label">Message</label><textarea class="form-textarea" id="bidMessage" placeholder="Explain why you're the best fit..."></textarea></div>
      <button class="btn btn-gold btn-block" id="placeBid">Submit Bid</button>
    </div></div>

    <h2 style="font-size:1.5rem;margin:24px 0 16px">Bids (${job.bids?.length || 0})</h2>
    <div id="bidsList"></div>
  `;

  document.getElementById('bidsList').innerHTML = (job.bids || []).map(b => `
    <div class="card" style="margin-bottom:12px"><div class="card-body" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div><div style="font-weight:500">${b.user?.display_name || 'Bidder'}</div>
      <div class="card-meta"><span class="stars">${stars(b.user?.rating)}</span></div>
      <p style="color:var(--text-soft);margin-top:8px;font-size:0.9rem">${b.message || 'No message'}</p></div>
      <div style="text-align:right"><div class="card-price">${fmtPrice(b.amount)}</div><div style="font-size:0.82rem;color:var(--text-muted)">${b.duration || ''}</div>
      <span class="badge badge-kyc">${b.status}</span></div>
    </div></div>`).join('') || '<p style="color:var(--text-muted)">No bids yet.</p>';

  document.getElementById('placeBid').addEventListener('click', async () => {
    if (!Auth.isLoggedIn()) return Toast.show('Please sign in to bid');
    try {
      await API.post(`/jobs/${id}/bids`, {
        amount: +document.getElementById('bidAmount').value,
        message: document.getElementById('bidMessage').value,
        duration: document.getElementById('bidDuration').value
      });
      Toast.show('Bid placed! The client will review it.');
      setTimeout(() => location.reload(), 1000);
    } catch (e) { Toast.show(e.message); }
  });
});
