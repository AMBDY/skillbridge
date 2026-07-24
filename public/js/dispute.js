document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { Toast.show('Please sign in'); setTimeout(() => location.href = '/signin.html', 1000); return; }

  const params = new URLSearchParams(location.search);
  const jobId = params.get('job');
  const paymentId = params.get('payment');

  if (jobId || paymentId) {
    document.getElementById('newDisputeCard').style.display = 'block';
    document.getElementById('disputeContext').textContent = jobId ? `Regarding job #${jobId.slice(0, 8)}` : `Regarding payment #${paymentId.slice(0, 8)}`;
  }

  document.getElementById('disputeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const reason = e.target.elements.reason.value.trim();
    if (!reason) return;
    try {
      await API.post('/disputes', { job_id: jobId || null, payment_id: paymentId || null, reason });
      Toast.show('Dispute submitted — a superadmin will review it.');
      e.target.reset();
      loadDisputes();
    } catch (err) { Toast.show(err.message); }
  });

  async function loadDisputes() {
    const disputes = await API.get('/disputes/mine').catch(() => []);
    document.getElementById('disputeList').innerHTML = disputes.length ? disputes.map(d => `
      <div class="card" style="margin-bottom:10px"><div class="card-body">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div>
            <strong>${d.jobs?.title || (d.payments ? `Payment (${fmtPrice(d.payments.amount)})` : 'Dispute')}</strong>
            <div class="card-meta">${new Date(d.created_at).toLocaleDateString()}</div>
          </div>
          <span class="badge badge-kyc">${d.status}</span>
        </div>
        <p style="margin-top:8px;color:var(--text-soft)">${d.reason}</p>
        ${d.resolution ? `<p style="margin-top:6px;color:var(--gold)"><strong>Resolution:</strong> ${d.resolution}</p>` : ''}
      </div></div>`).join('') : '<p style="color:var(--text-muted)">No disputes yet.</p>';
  }
  loadDisputes();
});
