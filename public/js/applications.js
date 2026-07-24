document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { location.href = '/signin.html'; return; }
  const params = new URLSearchParams(location.search);
  const jobId = params.get('job');
  const main = document.getElementById('appsMain');
  if (!jobId) { main.innerHTML = '<p>No job specified.</p>'; return; }

  async function render() {
    let payload;
    try { payload = await API.get(`/jobs/${jobId}/applications`); }
    catch (e) { main.innerHTML = `<p>Error: ${e.message}</p>`; return; }
    const { job, applications } = payload;

    const screeningCard = job.ai_screening_enabled ? `
      <div class="card" style="margin:20px 0"><div class="card-body">
        <h3>AI Screening — Enabled</h3>
        <div class="form-group" style="max-width:280px">
          <label class="form-label">Screening mode</label>
          <select class="form-select" id="modeSel">
            <option value="manual" ${job.screening_mode === 'manual' ? 'selected' : ''}>Manual — I click Begin Screening</option>
            <option value="automatic" ${job.screening_mode === 'automatic' ? 'selected' : ''}>Automatic — score every application instantly</option>
          </select>
        </div>
        ${job.screening_mode === 'manual' ? '<button class="btn btn-gold btn-sm" id="screenAllBtn">Begin Screening All Unscreened</button>' : ''}
      </div></div>
    ` : `
      <div class="card" style="margin:20px 0"><div class="card-body">
        <h3>AI Screening — Not enabled</h3>
        <p style="color:var(--text-soft)">Turning this on lets SkillBridge automatically score and rank applicants by skill match, rating, verification, location, and budget fit. This attracts an additional platform fee, charged once per job.</p>
        <button class="btn btn-gold btn-sm" id="requestAiBtn">Enable AI Screening</button>
      </div></div>`;

    const sections = [
      { label: 'Strong Matches (75%+)', min: 75 },
      { label: 'Good Matches (50–74%)', min: 50 },
      { label: 'Low Matches (below 50%)', min: 0 },
    ];
    const scored = applications.filter(a => a.ai_score != null);
    const unscored = applications.filter(a => a.ai_score == null);

    function appCard(a) {
      const p = a.applicant;
      return `<div class="card" style="margin-bottom:12px"><div class="card-body">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <strong>${p?.display_name || 'Applicant'}</strong>
            ${p?.kyc_level >= 3 ? '<span class="badge badge-verified">Verified</span>' : ''}
            <div class="card-meta"><span>⭐ ${p?.rating || 0}</span><span>•</span><span>${fmtPrice(a.expected_price || 0)}</span><span>•</span><span>${a.duration || ''}</span></div>
          </div>
          ${a.ai_score != null ? `<div style="text-align:right"><div style="font-size:1.4rem;font-weight:700;color:var(--gold)">${a.ai_score}%</div><div style="font-size:0.8rem;color:var(--text-muted)">AI match</div></div>` : '<span class="badge badge-kyc">Not yet screened</span>'}
        </div>
        <p style="margin-top:10px;color:var(--text-soft)">${a.cover_letter || ''}</p>
        ${a.ai_reasons?.length ? `<div style="margin-top:6px;font-size:0.85rem;color:var(--text-muted)">${a.ai_reasons.map(r => `✓ ${r}`).join(' &nbsp; ')}</div>` : ''}
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <span class="badge badge-kyc">${a.status}</span>
          ${a.status !== 'hired' ? `
            <button class="btn btn-outline btn-sm" onclick="setStatus('${a.id}','shortlisted')">Shortlist</button>
            <button class="btn btn-outline btn-sm" onclick="setStatus('${a.id}','rejected')">Reject</button>
            <button class="btn btn-gold btn-sm" onclick="setStatus('${a.id}','hired')">Hire</button>
          ` : ''}
          <button class="btn btn-outline btn-sm" onclick="toggleInterviewForm('${a.id}')">${a.interview_at ? 'Edit Interview' : 'Schedule Interview'}</button>
        </div>
        ${a.interview_at ? `<div style="margin-top:8px;font-size:0.85rem;color:var(--text-muted)">📅 Interview: ${new Date(a.interview_at).toLocaleString()} ${a.interview_link ? `— <a href="${a.interview_link}" target="_blank" rel="noopener">Join link</a>` : ''}</div>` : ''}
        <div id="interviewForm_${a.id}" style="display:none;margin-top:10px;padding:12px;background:var(--bg);border-radius:var(--radius)">
          <div class="form-row">
            <div class="form-group"><label class="form-label">Date & time</label><input class="form-input" type="datetime-local" id="ivAt_${a.id}" value="${a.interview_at ? a.interview_at.slice(0, 16) : ''}"></div>
            <div class="form-group"><label class="form-label">Meeting link</label><input class="form-input" id="ivLink_${a.id}" placeholder="https://meet.google.com/..." value="${a.interview_link || ''}"></div>
          </div>
          <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="ivNotes_${a.id}" rows="2">${a.interview_notes || ''}</textarea></div>
          <button class="btn btn-gold btn-sm" onclick="saveInterview('${a.id}')">Save Interview</button>
        </div>
      </div></div>`;
    }

    main.innerHTML = `
      <h1 class="section-title">Applicants: ${job.title}</h1>
      <p class="section-sub">${applications.length} application(s) • Job status: ${job.status}</p>
      ${screeningCard}
      ${sections.map(s => {
        const items = scored.filter(a => a.ai_score >= s.min && (s.min === 75 ? true : s.min === 50 ? a.ai_score < 75 : a.ai_score < 50));
        return items.length ? `<h3 style="margin:20px 0 10px">${s.label}</h3>${items.map(appCard).join('')}` : '';
      }).join('')}
      ${unscored.length ? `<h3 style="margin:20px 0 10px">Not Yet Screened</h3>${unscored.map(appCard).join('')}` : ''}
      ${!applications.length ? '<p style="color:var(--text-muted);margin-top:24px">No applications yet.</p>' : ''}
    `;

    const reqBtn = document.getElementById('requestAiBtn');
    if (reqBtn) reqBtn.addEventListener('click', async () => {
      try {
        const { payment, fee } = await API.post(`/jobs/${jobId}/request-ai-screening`);
        Toast.show(`AI screening fee: ${fmtPrice(fee)}. Redirecting to payment...`);
        setTimeout(() => location.href = `/payment.html?job=${jobId}&purpose=ai_screening&payment=${payment.id}`, 1200);
      } catch (e) { Toast.show(e.message); }
    });
    const modeSel = document.getElementById('modeSel');
    if (modeSel) modeSel.addEventListener('change', async () => {
      try { await API.put(`/jobs/${jobId}/screening-mode`, { screening_mode: modeSel.value }); Toast.show('Screening mode updated'); render(); }
      catch (e) { Toast.show(e.message); }
    });
    const screenAllBtn = document.getElementById('screenAllBtn');
    if (screenAllBtn) screenAllBtn.addEventListener('click', async () => {
      try { const r = await API.post(`/jobs/${jobId}/screen`, {}); Toast.show(`Screened ${r.screened} application(s)`); render(); }
      catch (e) { Toast.show(e.message); }
    });
  }

  window.setStatus = async (id, status) => {
    try { await API.put(`/jobs/applications/${id}/status`, { status }); Toast.show(`Applicant ${status}`); render(); }
    catch (e) { Toast.show(e.message); }
  };

  window.toggleInterviewForm = (id) => {
    const el = document.getElementById(`interviewForm_${id}`);
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };
  window.saveInterview = async (id) => {
    const interview_at = document.getElementById(`ivAt_${id}`).value;
    const interview_link = document.getElementById(`ivLink_${id}`).value.trim();
    const interview_notes = document.getElementById(`ivNotes_${id}`).value.trim();
    try {
      await API.put(`/jobs/applications/${id}/interview`, {
        interview_at: interview_at ? new Date(interview_at).toISOString() : null, interview_link, interview_notes
      });
      Toast.show('Interview scheduled');
      render();
    } catch (e) { Toast.show(e.message); }
  };

  render();
});
