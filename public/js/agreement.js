document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.isLoggedIn()) return location.href = '/signin.html';
  const params = new URLSearchParams(location.search);
  const worker = params.get('worker');
  const job = params.get('job');
  const listing = params.get('listing');
  const conversation = params.get('conv');
  const form = document.getElementById('agForm');
  form.innerHTML = `<form id="agreementCreateForm">
    <div class="form-row"><div class="form-group"><label class="form-label">Agreement title</label><input class="form-input" name="title" required></div><div class="form-group"><label class="form-label">Agreement type</label><select class="form-select" name="agreement_type"><option value="service">Service</option><option value="graphic_design">Graphic Design</option><option value="web_design">Web Design</option><option value="web_development">Web Development</option><option value="product">Physical Product</option><option value="contractor">Worker / Contractor</option></select></div></div>
    <div class="form-group"><label class="form-label">Other party account ID</label><input class="form-input" name="worker_id" value="${worker || ''}" required></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Price (₦)</label><input class="form-input" name="price" type="number" min="0" required></div><div class="form-group"><label class="form-label">Expected completion date</label><input class="form-input" name="timeline" type="date"></div></div>
    <div class="form-group"><label class="form-label">Scope, responsibilities, and deliverables</label><textarea class="form-textarea" name="scope" rows="5" required></textarea></div>
    <div class="form-group"><label class="form-label">Payment terms, milestones, conditions, and warranties</label><textarea class="form-textarea" name="terms" rows="5" required></textarea></div>
    <details class="card" style="padding:12px"><summary style="cursor:pointer">Additional required parties</summary><p style="color:var(--text-muted);font-size:.9rem">One party per line: account ID | name | role.</p><textarea class="form-textarea" name="additional_parties" rows="3"></textarea></details>
    <label style="display:flex;gap:8px;margin:16px 0"><input type="checkbox" required> I confirm this information is accurate and I am authorized to send it.</label><button class="btn btn-gold btn-block btn-lg">Send agreement to the other party</button>
  </form>`;
  form.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.job_id = job || null;
    data.source_listing_id = listing || null;
    data.conversation_id = conversation || null;
    data.details = { scope: data.scope, terms: data.terms };
    data.additional_parties = data.additional_parties.split('\n').map(line => line.trim()).filter(Boolean).map(line => { const [user_id, party_name, party_role] = line.split('|').map(v => v.trim()); return { user_id, party_name, party_role }; });
    delete data.scope; delete data.terms;
    try { const agreement = await API.post('/agreements', data); Toast.show('Agreement sent to the other party.'); setTimeout(() => location.href = conversation ? `/chat.html?to=${worker}${job ? `&job=${job}` : ''}${listing ? `&listing=${listing}` : ''}` : `/agreements.html?agreement=${agreement.id}`, 700); } catch (err) { Toast.show(err.message); }
  });
});
