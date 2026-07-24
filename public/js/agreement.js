document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { location.href = '/signin.html'; return; }
  const user = Auth.user();
  const params = new URLSearchParams(location.search);
  const workerId = params.get('worker');
  const jobId = params.get('job');
  const form = document.getElementById('agForm');

  form.innerHTML = `
    <div class="form-group"><label class="form-label">Job / Service details</label><textarea class="form-textarea" id="agDetails" placeholder="Describe deliverables, scope, requirements..."></textarea></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Price (₦)</label><input class="form-input" type="number" id="agPrice" value="50000"></div>
      <div class="form-group"><label class="form-label">Timeline</label><select class="form-select" id="agTimeline">
        <option>3 days</option><option>5 days</option><option>1 week</option><option>2 weeks</option><option>1 month</option>
      </select></div>
    </div>
    <div class="form-group"><label class="form-label">Terms & deliverables</label><textarea class="form-textarea" id="agTerms" placeholder="Terms, milestones, deliverables..."></textarea></div>
    <div class="agreement-row"><span>Service fee (platform):</span><span id="feeDisplay">10%</span></div>
    <div class="agreement-row"><span>Worker receives:</span><span id="workerReceives">₦45,000</span></div>
    <div style="margin:24px 0">
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
        <span class="tick tick-blue" title="Accepted candidate">✓</span>
        <span>Blue tick: candidate accepted</span>
      </div>
      <div style="display:flex;gap:12px;align-items:center">
        <span class="tick tick-green" title="Agreement sealed">✓</span>
        <span>Green tick: final agreement sealed (both agreed)</span>
      </div>
    </div>
    <div id="agreeStep">
      <button class="btn btn-gold btn-block" id="reviewBtn">Submit for Review</button>
    </div>
    <div id="lockStep" style="display:none">
      <p style="text-align:center;margin-bottom:16px"><strong>Have you reviewed all details?</strong></p>
      <div style="display:flex;gap:12px">
        <button class="btn btn-outline btn-block" id="disagreeBtn">Disagree</button>
        <button class="btn btn-gold btn-block" id="agreeBtn">Agree</button>
      </div>
      <p style="text-align:center;margin-top:12px;color:var(--text-muted);font-size:0.85rem" id="agreeStatus">Waiting for both parties to agree...</p>
    </div>
    <div id="sealed" style="display:none;text-align:center;padding:24px">
      <span class="tick tick-green" style="width:64px;height:64px;font-size:2rem">✓</span>
      <h2 style="margin:16px 0">Agreement Sealed</h2>
      <p style="color:var(--text-soft)">Green tick added. Proceed to payment.</p>
      <a href="/payment.html?worker=${workerId}&job=${jobId || ''}" class="btn btn-gold btn-lg" style="margin-top:16px">Proceed to Payment →</a>
    </div>
  `;

  const priceInput = document.getElementById('agPrice');
  function updateCalc() {
    const p = +priceInput.value || 0;
    document.getElementById('workerReceives').textContent = fmtPrice(p * 0.9);
  }
  priceInput.addEventListener('input', updateCalc); updateCalc();

  let agreementId = null;
  let clientAgreed = false, workerAgreed = false;

  document.getElementById('reviewBtn').addEventListener('click', async () => {
    if (!jobId) return Toast.show('No job linked to this agreement');
    try {
      const res = await API.post('/jobs/agreements', {
        job_id: jobId, worker_id: workerId,
        details: { scope: document.getElementById('agDetails').value, terms: document.getElementById('agTerms').value },
        price: +priceInput.value, timeline: document.getElementById('agTimeline').value
      });
      agreementId = res.id;
      document.getElementById('agreeStep').style.display = 'none';
      document.getElementById('lockStep').style.display = 'block';
      Toast.show('Agreement submitted. Both parties must now agree.');
    } catch (e) { Toast.show(e.message); }
  });

  document.getElementById('agreeBtn').addEventListener('click', async () => {
    if (!agreementId) return;
    clientAgreed = true;
    await API.put(`/jobs/agreements/${agreementId}`, { client_agreed: true, worker_agreed: workerAgreed, locked: true });
    checkSealed();
  });
  document.getElementById('disagreeBtn').addEventListener('click', async () => {
    if (!agreementId) return;
    await API.put(`/jobs/agreements/${agreementId}`, { client_agreed: false, locked: false });
    Toast.show('Agreement unlocked. Edit and resubmit.');
    document.getElementById('lockStep').style.display = 'none';
    document.getElementById('agreeStep').style.display = 'block';
  });

  function checkSealed() {
    if (clientAgreed && workerAgreed) {
      API.put(`/jobs/agreements/${agreementId}`, { sealed: true }).then(() => {
        document.getElementById('lockStep').style.display = 'none';
        document.getElementById('sealed').style.display = 'block';
      });
    } else {
      document.getElementById('agreeStatus').textContent = `You agreed. ${workerAgreed ? 'Worker agreed.' : 'Waiting for worker...'}`;
    }
  }
  // Simulate worker agreeing after a delay (demo)
  setTimeout(() => { workerAgreed = true; if (clientAgreed) checkSealed(); else document.getElementById('agreeStatus').textContent = 'Worker agreed. Waiting for you...'; }, 3000);
});
