document.addEventListener('DOMContentLoaded', async () => {
  const target = document.getElementById('recruitmentJobs');
  target.innerHTML = '<div class="skeleton" style="height:120px"></div>';

  const jobs = await API.get('/recruitment/jobs').catch((err) => {
    Toast.show(err.message);
    return [];
  });

  if (!jobs.length) {
    target.innerHTML = '<p style="color:var(--text-muted)">No approved recruitment jobs yet.</p>';
    return;
  }

  target.innerHTML = jobs.map(job => `
    <div class="card" style="margin-bottom:12px">
      <div class="card-body" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <strong>${job.title}</strong>
          <div class="card-meta">${job.company_name} | ${job.location || 'Remote/Not stated'} | ${job.ai_plan}</div>
          <p style="color:var(--text-soft);margin-top:8px">${job.description || ''}</p>
        </div>

        <div style="display:flex;gap:8px;align-items:start;flex-wrap:wrap">
          <a href="/recruitment-job.html?id=${job.id}" class="btn btn-outline btn-sm">View</a>
          <a href="/recruitment-apply.html?id=${job.id}" class="btn btn-gold btn-sm">Apply</a>
        </div>
      </div>
    </div>
  `).join('');
});
