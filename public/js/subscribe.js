document.addEventListener('DOMContentLoaded', async () => {
  const plans = await API.get('/marketplace/plans').catch(() => []);
  document.getElementById('plansGrid').innerHTML = plans.length ? plans.map(p => `
    <div class="card"><div class="card-body" style="text-align:center">
      ${p.badge ? `<span class="badge badge-elite">${p.badge}</span>` : ''}
      <h3 style="margin-top:8px">${p.name}</h3>
      <div style="font-size:1.6rem;font-weight:700;margin:8px 0">${fmtPrice(p.price)}<span style="font-size:0.85rem;color:var(--text-muted)"> / ${p.duration_days}d</span></div>
      <ul style="text-align:left;color:var(--text-soft);margin:12px 0;padding-left:18px">${(p.benefits || []).map(b => `<li>${b}</li>`).join('')}</ul>
      <button class="btn btn-gold btn-block" onclick="subscribe('${p.id}')">${p.price === 0 ? 'Select Free Plan' : 'Subscribe'}</button>
    </div></div>`).join('') : '<p style="color:var(--text-muted)">No plans available right now.</p>';
});

window.subscribe = async (planId) => {
  if (!Auth.isLoggedIn()) { Toast.show('Please sign in first'); setTimeout(() => location.href = '/signin.html', 1000); return; }
  try {
    const sub = await API.post('/marketplace/subscriptions', { plan_id: planId });
    if (sub.amount > 0) {
      Toast.show('Redirecting to payment...');
      setTimeout(() => location.href = `/payment.html?purpose=subscription&plan=${planId}&amount=${sub.amount}`, 800);
    } else {
      Toast.show('Free plan activated — awaiting admin confirmation');
      setTimeout(() => location.href = '/dashboard.html', 1200);
    }
  } catch (e) { Toast.show(e.message); }
};
