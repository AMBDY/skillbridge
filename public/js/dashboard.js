document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { location.href = '/signin.html'; return; }
  const main = document.getElementById('dashMain');
  const user = Auth.user();
  main.innerHTML = `
    <h1 class="section-title">Welcome, ${user?.display_name || 'User'}</h1>
    <p class="section-sub">Role: ${user?.role} • Tier: ${user?.subscription_tier || 'free'} • KYC: L${user?.kyc_level || 0}</p>

    <div class="grid grid-4" style="margin:24px 0">
      <a href="/post-job.html" class="stat-card"><div class="stat-num">+</div><div class="stat-label">Post a Job</div></a>
      <a href="/post-listing.html" class="stat-card"><div class="stat-num">🛍️</div><div class="stat-label">Post a Listing</div></a>
      <a href="${['client','admin'].includes(user?.role) ? '/recruiter-jobs.html' : '/recruitment-jobs.html'}" class="stat-card"><div class="stat-num">🧑‍💼</div><div class="stat-label">Job Recruitment</div></a>
      <a href="/chat.html" class="stat-card"><div class="stat-num">💬</div><div class="stat-label">Messages</div></a>
      <a href="/payments.html" class="stat-card"><div class="stat-num">💳</div><div class="stat-label">Payments</div></a>
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

    <h2 style="font-size:1.6rem;margin:32px 0 16px">My Jobs</h2>
    <div id="myJobs"></div>

    <h2 style="font-size:1.6rem;margin:32px 0 16px">My Payments</h2>
    <div id="myPayments"></div>
  `;

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
      <span class="badge badge-kyc">${j.status}</span>
    </div></div>`).join('') : '<p style="color:var(--text-muted)">No jobs yet.</p>';

  document.getElementById('myPayments').innerHTML = payments.length ? payments.map(p => `
    <div class="card" style="margin-bottom:10px"><div class="card-body" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div><div style="font-weight:500">${p.job?.title || 'Payment'}</div><div class="card-meta"><span>${fmtPrice(p.amount)}</span><span>•</span><span>${p.status}</span><span>•</span><span>${p.payment_method}</span></div></div>
      ${p.status === 'in_escrow' && p.client_id === user?.user_id ? `<button class="btn btn-gold btn-sm" onclick="markReceived('${p.id}')">Mark Received</button>` : ''}
    </div></div>`).join('') : '<p style="color:var(--text-muted)">No payments yet.</p>';
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
