document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { location.href = '/signin.html'; return; }
  const main = document.getElementById('dashMain');
  const user = Auth.user();
  main.innerHTML = `
    <h1 class="section-title">Welcome, ${user?.display_name || 'User'}</h1>
    <p class="section-sub">Role: ${user?.role} • Tier: ${user?.subscription_tier || 'free'} • KYC: L${user?.kyc_level || 0}</p>

    <div class="grid grid-4" style="margin:24px 0">
      ${['client', 'admin'].includes(user?.role) ? '<a href="/post-job.html" class="stat-card"><div class="stat-num">+</div><div class="stat-label">Post a Job</div></a>' : ''}
      <a href="/post-listing.html" class="stat-card"><div class="stat-num">🛍️</div><div class="stat-label">Post a Listing</div></a>
      <a href="${['client','admin'].includes(user?.role) ? '/recruiter-jobs.html' : '/recruitment-jobs.html'}" class="stat-card"><div class="stat-num">🧑‍💼</div><div class="stat-label">Job Recruitment</div></a>
      <a href="/chat.html" class="stat-card"><div class="stat-num">💬</div><div class="stat-label">Messages</div></a>
      <a href="/payments.html" class="stat-card"><div class="stat-num">💳</div><div class="stat-label">Payments</div></a>
      <a href="/orders.html" class="stat-card"><div class="stat-num">📦</div><div class="stat-label">Product Orders</div></a>
      <a href="/profile.html?id=${user?.user_id}" class="stat-card"><div class="stat-num">👤</div><div class="stat-label">My Profile</div></a>
      <a href="/subscribe.html" class="stat-card"><div class="stat-num">⭐</div><div class="stat-label">Boost Visibility</div></a>
      <a href="/kyc.html" class="stat-card"><div class="stat-num">🪪</div><div class="stat-label">Verify Identity</div></a>
      <a href="/support.html" class="stat-card"><div class="stat-num">🎫</div><div class="stat-label">Support</div></a>
      <a href="/dispute.html" class="stat-card"><div class="stat-num">⚖️</div><div class="stat-label">Disputes</div></a>
    </div>

    <h2 style="font-size:1.6rem;margin:24px 0 16px">Subscription</h2>
    <div class="grid grid-4">
      ${['free','pro','featured','elite'].map(t => `
        <div class="card ${user?.subscription_tier === t ? '' : ''}"><div class="card-body">
          <h3 style="text-transform:capitalize;font-size:1.3rem">${t}</h3>
          <p style="color:var(--text-soft);font-size:0.85rem;min-height:48px">${{free:'Standard listing',pro:'Increased visibility',featured:'Homepage + search boost',elite:'Top ranking + AI boost'}[t]}</p>
          <button class="btn ${user?.subscription_tier === t ? 'btn-outline' : 'btn-gold'} btn-block btn-sm" onclick="requestSub('${t}')">${user?.subscription_tier === t ? 'Current' : 'Upgrade'}</button>
        </div></div>`).join('')}
    </div>

    <h2 style="font-size:1.6rem;margin:32px 0 16px">My Listings</h2>
    <div id="myListings"></div>

    <h2 style="font-size:1.6rem;margin:32px 0 16px">My Jobs</h2>
    <div id="myJobs"></div>

    <h2 style="font-size:1.6rem;margin:32px 0 16px">My Payments</h2>
    <div id="myPayments"></div>
    <h2 style="font-size:1.6rem;margin:32px 0 16px">My Digital Service Projects</h2>
    <div id="myServiceProjects"></div>
  `;

  API.get('/marketplace/listings/mine').then(listings => {
    document.getElementById('myListings').innerHTML = listings.length ? listings.map(l => `
      <div class="card" style="margin-bottom:10px"><div class="card-body" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div><div style="font-weight:500">${l.title}</div><div class="card-meta"><span>${l.type}</span><span>•</span><span>${fmtPrice(l.price || 0)}</span></div></div>
        <div style="display:flex;gap:6px;align-items:start;flex-wrap:wrap"><span class="badge ${l.status === 'active' ? 'badge-verified' : l.status === 'rejected' ? '' : 'badge-kyc'}" style="${l.status === 'rejected' ? 'background:#fee2e2;color:#b91c1c' : ''}">${l.status}</span><a class="btn btn-outline btn-sm" href="/post-listing.html?edit=${l.id}&type=${l.type}">Edit / Replace</a><button class="btn btn-outline btn-sm" onclick="deleteListing('${l.type}','${l.id}')">Delete</button></div>
      </div></div>`).join('') : '<p style="color:var(--text-muted)">No listings yet.</p>';
  }).catch(() => { document.getElementById('myListings').innerHTML = '<p style="color:var(--text-muted)">Could not load listings.</p>'; });

  const [ownJobs, publicJobs, payments] = await Promise.all([
    API.get('/jobs/mine').catch(() => []),
    API.get('/jobs').catch(() => []),
    API.get('/payments').catch(() => [])
  ]);
  const assignedToMe = publicJobs.filter(j => j.assigned_to === user?.user_id && j.user_id !== user?.user_id);
  const myJobs = [...ownJobs, ...assignedToMe];
  document.getElementById('myJobs').innerHTML = myJobs.length ? myJobs.map(j => `
    <div class="card" style="margin-bottom:10px"><div class="card-body" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div><a href="/job.html?id=${j.id}" style="font-weight:500">${j.title}</a><div class="card-meta"><span>${j.status}</span><span>•</span><span>${fmtPrice(j.budget || 0)}</span></div></div>
      <div style="display:flex;gap:6px;align-items:start;flex-wrap:wrap"><span class="badge badge-kyc">${j.status}</span>${j.user_id === user?.user_id && ['client', 'admin'].includes(user?.role) ? `<a class="btn btn-outline btn-sm" href="/post-job.html?edit=${j.id}">Edit / Replace</a><button class="btn btn-outline btn-sm" onclick="deleteJob('${j.id}')">Delete</button>` : ''}</div>
    </div></div>`).join('') : '<p style="color:var(--text-muted)">No jobs yet.</p>';

  document.getElementById('myPayments').innerHTML = payments.length ? payments.map(p => `
    <div class="card" style="margin-bottom:10px"><div class="card-body" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div><div style="font-weight:500">${p.job?.title || 'Payment'}</div><div class="card-meta"><span>${fmtPrice(p.amount)}</span><span>•</span><span>${p.status}</span><span>•</span><span>${p.payment_method}</span></div></div>
      ${p.status === 'in_escrow' && p.client_id === user?.user_id ? `<button class="btn btn-gold btn-sm" onclick="markReceived('${p.id}')">Mark Received</button>` : ''}
    </div></div>`).join('') : '<p style="color:var(--text-muted)">No payments yet.</p>';
  API.get('/digital-services/orders').then(orders => { document.getElementById('myServiceProjects').innerHTML = orders.length ? orders.map(order => `<div class="card" style="margin-bottom:10px"><div class="card-body" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><strong>${order.title_snapshot}</strong><div class="card-meta">${order.order_reference} · ${order.status.replaceAll('_',' ')} · ${fmtPrice(order.price)}</div></div><a class="btn btn-outline btn-sm" href="/service-order.html?id=${order.id}">Open project</a></div></div>`).join('') : '<p style="color:var(--text-muted)">No digital service projects yet.</p>'; }).catch(() => { document.getElementById('myServiceProjects').innerHTML = '<p style="color:var(--text-muted)">Projects become available after the database migration is run.</p>'; });
});

window.requestSub = async function (tier) {
  if (tier === 'free') return Toast.show('You are on the free tier');
  try {
    await API.post('/marketplace/subscriptions', { tier, amount: { pro: 5000, featured: 15000, elite: 30000 }[tier] || 0 });
    Toast.show('Subscription request sent for admin approval');
  } catch (e) { Toast.show(e.message); }
};

window.markReceived = async function (id) {
  try {
    await API.put(`/payments/${id}/received`);
    Toast.show('Marked as received! Admin will release funds.');
    setTimeout(() => location.reload(), 1000);
  } catch (e) { Toast.show(e.message); }
};

window.deleteJob = async function (id) {
  if (!confirm('Delete this job and its post data? This cannot be undone.')) return;
  try { await API.del(`/jobs/${id}`); Toast.show('Job deleted'); setTimeout(() => location.reload(), 500); } catch (e) { Toast.show(e.message); }
};
window.deleteListing = async function (type, id) {
  if (!confirm('Delete this listing and its post data? This cannot be undone.')) return;
  try { await API.del(`/marketplace/listings/${type}/${id}`); Toast.show('Listing deleted'); setTimeout(() => location.reload(), 500); } catch (e) { Toast.show(e.message); }
};
