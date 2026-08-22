document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { location.href = '/signin.html'; return; }
  const main = document.getElementById('recruitMain');
  const user = Auth.user();
  const isClient = ['client', 'admin'].includes(user?.role);

  if (isClient) {
    main.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <h1 class="section-title">Job Recruitment</h1>
          <p class="section-sub">Your posted jobs, applicants, and AI screening.</p>
        </div>
        <a href="/post-job.html" class="btn btn-gold">+ Post Job Recruitment</a>
      </div>
      <div id="clientJobs" style="margin-top:24px"></div>
      <h2 style="font-size:1.5rem;margin:32px 0 12px">All approved job recruitment listings</h2>
      <p class="section-sub">These listings are visible to every role. Open a job to read the full description, then select Apply to complete the employer’s required form.</p>
      <div id="openJobs"></div>`;

    async function renderClientJobs() {
      const mine = await API.get('/jobs/mine').catch(() => []);
      document.getElementById('clientJobs').innerHTML = mine.length ? mine.map(j => `
        <div class="card" style="margin-bottom:12px"><div class="card-body" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <a href="/job.html?id=${j.id}" style="font-weight:600;font-size:1.05rem">${j.title}</a>
            <div class="card-meta"><span class="badge badge-kyc">${j.status}</span><span>•</span><span>${fmtPrice(j.budget || 0)}</span>
              ${j.status === 'pending' ? '<span>•</span><span style="color:var(--text-muted)">Awaiting superadmin approval</span>' : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <a href="/post-job.html?edit=${j.id}" class="btn btn-outline btn-sm">Edit</a>
            <a href="/applications.html?job=${j.id}" class="btn btn-gold btn-sm">View Applicants</a>
            ${['approved', 'open'].includes(j.status) ? `<button class="btn btn-outline btn-sm" onclick="jobAction('${j.id}','pause')">Pause</button>` : ''}
            ${['paused', 'closed'].includes(j.status) ? `<button class="btn btn-outline btn-sm" onclick="jobAction('${j.id}','reopen')">Reopen</button>` : ''}
            ${!['completed', 'cancelled', 'closed'].includes(j.status) ? `<button class="btn btn-outline btn-sm" onclick="jobAction('${j.id}','close')">Close</button>` : ''}
            <button class="btn btn-outline btn-sm" onclick="duplicateJob('${j.id}')">Duplicate</button>
          </div>
        </div></div>`).join('') : '<p style="color:var(--text-muted)">You haven\'t posted any jobs yet.</p>';
    }
    window.jobAction = async (id, action) => {
      try { await API.put(`/jobs/${id}/${action}`); Toast.show(`Job ${action}d`); renderClientJobs(); }
      catch (e) { Toast.show(e.message); }
    };
    window.duplicateJob = async (id) => {
      try { await API.post(`/jobs/${id}/duplicate`); Toast.show('Job duplicated — awaiting approval'); renderClientJobs(); }
      catch (e) { Toast.show(e.message); }
    };
    renderClientJobs();
    const publicJobs = await API.get('/jobs').catch(() => []);
    document.getElementById('openJobs').innerHTML = publicJobs.length ? publicJobs.map(j => `
      <div class="card" style="margin-bottom:12px"><div class="card-body" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px"><div><a href="/job.html?id=${j.id}" style="font-weight:600;font-size:1.05rem">${j.title}</a><div class="card-meta"><span>${j.categories?.name || ''}</span><span>•</span><span>${fmtPrice(j.budget || 0)}</span><span>•</span><span>${j.location || j.state || 'Remote'}</span></div></div><div style="display:flex;gap:8px"><a href="/job.html?id=${j.id}" class="btn btn-outline btn-sm">View full job</a><a href="/apply-job.html?job=${j.id}" class="btn btn-gold btn-sm">Apply</a></div></div></div>`).join('') : '<p style="color:var(--text-muted)">No approved jobs right now.</p>';
    return;
  }

  // Every other role: browse approved/open jobs and apply
  main.innerHTML = `
    <h1 class="section-title">Job Recruitment</h1>
    <p class="section-sub">Jobs posted by clients and approved by SkillBridge. Apply directly below.</p>
    <div id="openJobs" style="margin-top:24px"></div>`;

  const jobs = await API.get('/jobs?status=open').catch(() => []);
  const approved = await API.get('/jobs?status=approved').catch(() => []);
  const all = [...jobs, ...approved];
  document.getElementById('openJobs').innerHTML = all.length ? all.map(j => `
    <div class="card" style="margin-bottom:12px"><div class="card-body" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div>
        <a href="/job.html?id=${j.id}" style="font-weight:600;font-size:1.05rem">${j.title}</a>
        <div class="card-meta"><span>${j.categories?.name || ''}</span><span>•</span><span>${fmtPrice(j.budget || 0)}</span><span>•</span><span>${j.location || j.state || 'Remote'}</span></div>
      </div>
      <a href="/apply-job.html?job=${j.id}" class="btn btn-gold btn-sm">Apply</a>
    </div></div>`).join('') : '<p style="color:var(--text-muted)">No open jobs right now — check back soon.</p>';
});
