document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { location.href = '/signin.html'; return; }
  const user = Auth.user();
  if (!['client', 'admin'].includes(user?.role)) {
    document.getElementById('applicantsBox').innerHTML = '<p>Recruiter access required.</p>';
    return;
  }

  const myJobs = await API.get('/recruitment/recruiter/jobs').catch(() => []);
  document.getElementById('jobFilter').innerHTML += myJobs.map(j => `<option value="${j.id}">${j.title}</option>`).join('');
  document.getElementById('jobFilter').addEventListener('change', render);

  async function render() {
    const jobId = document.getElementById('jobFilter').value;
    const box = document.getElementById('applicantsBox');
    box.innerHTML = '<div class="skeleton" style="height:120px"></div>';
    const url = jobId ? `/recruitment/recruiter/applicants?job_id=${jobId}` : '/recruitment/recruiter/applicants';
    const apps = await API.get(url).catch(err => { Toast.show(err.message); return []; });

    if (!apps.length) { box.innerHTML = '<p style="color:var(--text-muted)">No applicants yet.</p>'; return; }

    box.innerHTML = apps.map(a => {
      const result = a.recruitment_screening_results?.[0];
      return `<div class="card" style="margin-bottom:12px"><div class="card-body">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <strong>${a.full_name || 'Applicant'}</strong>
            <div class="card-meta">${a.email || ''} ${a.phone ? '• ' + a.phone : ''}</div>
            <div class="card-meta">Applying for: ${a.recruitment_jobs?.title || ''}</div>
          </div>
          ${result ? `<div style="text-align:right">
            <div style="font-size:1.4rem;font-weight:700;color:var(--gold)">${result.score}%</div>
            <div style="font-size:0.8rem;color:var(--text-muted)">${result.ranking_label}</div>
          </div>` : '<span class="badge badge-kyc">Screening pending</span>'}
        </div>
        <p style="margin-top:10px;color:var(--text-soft)">${a.cover_note || ''}</p>
        ${result ? `
          <div style="margin-top:8px;font-size:0.85rem">
            <strong style="color:var(--gold)">${result.recommendation}</strong>
            ${result.risk_score > 25 ? `<span class="badge" style="background:#fee2e2;color:#b91c1c;margin-left:8px">Risk: ${result.risk_score}</span>` : ''}
          </div>
          ${result.strengths?.length ? `<div style="margin-top:6px;font-size:0.85rem;color:var(--text-muted)">${result.strengths.map(s => `✓ ${s}`).join(' &nbsp; ')}</div>` : ''}
          ${result.weaknesses?.length ? `<div style="margin-top:4px;font-size:0.85rem;color:var(--text-muted)">${result.weaknesses.map(s => `⚠ ${s}`).join(' &nbsp; ')}</div>` : ''}
        ` : ''}
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <span class="badge badge-kyc">${a.status}</span>
          ${a.status !== 'hired' ? `
            <button class="btn btn-outline btn-sm" onclick="setAppStatus('${a.id}','reviewing')">Reviewing</button>
            <button class="btn btn-outline btn-sm" onclick="setAppStatus('${a.id}','shortlisted')">Shortlist</button>
            <button class="btn btn-outline btn-sm" onclick="setAppStatus('${a.id}','rejected')">Reject</button>
            <button class="btn btn-gold btn-sm" onclick="setAppStatus('${a.id}','hired')">Hire</button>
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
    }).join('');
  }

  window.setAppStatus = async (id, status) => {
    try { await API.put(`/recruitment/applications/${id}/status`, { status }); Toast.show(`Marked ${status}`); render(); }
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
      await API.put(`/recruitment/applications/${id}/interview`, {
        interview_at: interview_at ? new Date(interview_at).toISOString() : null, interview_link, interview_notes
      });
      Toast.show('Interview scheduled');
      render();
    } catch (e) { Toast.show(e.message); }
  };

  render();
});
