document.addEventListener('DOMContentLoaded', async () => {
  const id = new URLSearchParams(location.search).get('id');
  const main = document.getElementById('jobDetail');

  if (!id) {
    main.innerHTML = '<p>No job selected.</p>';
    return;
  }

  const job = await API.get(`/recruitment/jobs/${id}`).catch(() => null);

  if (!job) {
    main.innerHTML = '<p>Job not found.</p>';
    return;
  }

  main.innerHTML = `
    <span class="eyebrow">Recruitment Job</span>
    <h1 class="section-title">${job.title}</h1>
    <p class="section-sub">${job.company_name} | ${job.location || 'Location not stated'}</p>

    <div class="card" style="margin-top:24px">
      <div class="card-body">
        <h3>Description</h3>
        <p style="color:var(--text-soft);margin-top:8px">${job.description || ''}</p>

        <h3 style="margin-top:20px">Required Skills</h3>
        <p style="color:var(--text-soft)">${(job.required_skills || []).join(', ') || 'Not stated'}</p>

        <h3 style="margin-top:20px">Experience</h3>
        <p style="color:var(--text-soft)">${job.experience_required || 0} years</p>

        <h3 style="margin-top:20px">Education</h3>
        <p style="color:var(--text-soft)">${job.education_requirement || 'Not stated'}</p>

        <a href="/recruitment-apply.html?id=${job.id}" class="btn btn-gold" style="margin-top:24px">Apply Now</a>
      </div>
    </div>
  `;
});
