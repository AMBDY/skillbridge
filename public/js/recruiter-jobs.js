document.addEventListener('DOMContentLoaded', loadRecruiterJobs);

async function loadRecruiterJobs() {
  if (!Auth.isLoggedIn()) {
    location.href = '/signin.html';
    return;
  }

  const user = Auth.user();
  if (!['client', 'admin'].includes(user?.role)) {
    document.getElementById('myRecruitmentJobs').innerHTML = '<p>Recruiter access required.</p>';
    return;
  }

  const jobs = await API.get('/recruitment/recruiter/jobs').catch(() => []);
  const box = document.getElementById('myRecruitmentJobs');

  box.innerHTML = jobs.length ? jobs.map(job => `
    <div class="card" style="margin-bottom:12px">
      <div class="card-body">
        <strong>${job.title}</strong>
        <div class="card-meta">${job.company_name} | ${job.approval_status} | ${job.ai_plan}</div>
        <p style="color:var(--text-soft);margin-top:8px">${job.description || ''}</p>
      </div>
    </div>
  `).join('') : '<p style="color:var(--text-muted)">No recruitment jobs posted yet.</p>';
}

window.toggleRecruitmentForm = function () {
  const box = document.getElementById('recruitmentFormBox');

  if (box.style.display === 'none') {
    box.style.display = 'block';
    box.innerHTML = `
      <div class="card" style="margin-bottom:24px">
        <div class="card-body">
          <h2 style="font-size:1.4rem;margin-bottom:14px">Post Recruitment Job</h2>

          <form id="recruitmentPostForm">
            <div class="form-row">
              <div class="form-group"><label class="form-label">Job Title</label><input class="form-input" name="title" required></div>
              <div class="form-group"><label class="form-label">Company Name</label><input class="form-input" name="company_name" required></div>
            </div>

            <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" name="description" required></textarea></div>
            <div class="form-group"><label class="form-label">Responsibilities comma separated</label><textarea class="form-textarea" name="responsibilities"></textarea></div>
            <div class="form-group"><label class="form-label">Required Skills comma separated</label><input class="form-input" name="required_skills"></div>

            <div class="form-row">
              <div class="form-group"><label class="form-label">Experience Required</label><input class="form-input" type="number" name="experience_required" value="0"></div>
              <div class="form-group"><label class="form-label">Education Requirement</label><input class="form-input" name="education_requirement"></div>
            </div>

            <div class="form-row">
              <div class="form-group"><label class="form-label">Salary optional</label><input class="form-input" name="salary"></div>
              <div class="form-group"><label class="form-label">Location</label><input class="form-input" name="location"></div>
            </div>

            <div class="form-row">
              <div class="form-group"><label class="form-label">Deadline</label><input class="form-input" type="datetime-local" name="deadline"></div>
              <div class="form-group">
                <label class="form-label">AI Plan</label>
                <select class="form-select" name="ai_plan">
                  <option value="basic">Basic</option>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Video Screening</label>
                <select class="form-select" name="video_enabled">
                  <option value="disabled">Disabled</option>
                  <option value="optional">Optional</option>
                  <option value="mandatory">Mandatory</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Question Mode</label>
                <select class="form-select" name="question_mode">
                  <option value="manual">Manual</option>
                  <option value="ai_generated">AI Generated</option>
                </select>
              </div>
            </div>

            <button class="btn btn-gold btn-block" type="submit">Submit For Superadmin Approval</button>
          </form>
        </div>
      </div>
    `;

    document.getElementById('recruitmentPostForm').addEventListener('submit', submitRecruitmentJob);
  } else {
    box.style.display = 'none';
  }
};

async function submitRecruitmentJob(e) {
  e.preventDefault();

  const data = Object.fromEntries(new FormData(e.target));

  try {
    await API.post('/recruitment/jobs', data);
    Toast.show('Recruitment job submitted for approval');
    e.target.reset();
    await loadRecruiterJobs();
  } catch (err) {
    Toast.show(err.message);
  }
}
