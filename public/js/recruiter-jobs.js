document.addEventListener('DOMContentLoaded', loadRecruiterJobs);

const APPLICATION_FIELDS = [
  ['first_name', 'First name', 'text'], ['middle_name', 'Middle name', 'text'], ['last_name', 'Last name', 'text'],
  ['age', 'Age', 'number'], ['gender', 'Gender', 'select:Male|Female|Prefer not to say'], ['date_of_birth', 'Date of birth', 'date'],
  ['nationality', 'Nationality', 'text'], ['country', 'Country of residence', 'text'], ['city', 'City', 'text'],
  ['address', 'Residential address', 'text'], ['linkedin', 'LinkedIn profile', 'url'], ['portfolio_url', 'Portfolio URL', 'url'],
  ['github_url', 'GitHub URL', 'url'], ['experience_years', 'Years of experience', 'number'], ['expected_salary', 'Expected salary', 'number'],
  ['availability', 'Availability / start date', 'date'], ['work_authorization', 'Work authorization', 'text'],
  ['cover_letter', 'Cover letter', 'textarea'], ['cv', 'CV / résumé', 'document:application/pdf,.doc,.docx'],
  ['cover_letter_file', 'Cover-letter document', 'document:application/pdf,.doc,.docx'],
  ['contact_preferences', 'Contact preferences', 'textarea'], ['employment_history', 'Employment history (add each employer)', 'textarea'],
  ['education', 'Education (add each institution)', 'textarea'], ['certifications', 'Professional certifications', 'textarea'],
  ['skills', 'Skills and proficiency', 'textarea'], ['job_questions', 'Job-specific questions', 'textarea'],
  ['portfolio_samples', 'Portfolio and work samples', 'textarea'], ['references', 'Professional references', 'textarea'],
  ['salary_compensation', 'Salary and compensation expectations', 'textarea'], ['work_preferences', 'Work preferences', 'textarea'],
  ['identity_verification', 'Identity verification', 'textarea'], ['background_checks', 'Background check consent', 'textarea'],
  ['licenses', 'Professional licenses', 'textarea'], ['languages', 'Languages and proficiency', 'textarea'],
  ['awards', 'Achievements and awards', 'textarea'], ['publications', 'Publications and research', 'textarea'],
  ['memberships', 'Professional memberships', 'textarea'], ['training', 'Training and courses', 'textarea'],
  ['internships', 'Internships and volunteer experience', 'textarea'], ['career_breaks', 'Career breaks / employment gaps', 'textarea'],
  ['legal_declarations', 'Criminal / legal declarations', 'textarea'], ['conflicts', 'Conflict of interest declaration', 'textarea'],
  ['relatives', 'Relatives / existing employees', 'textarea'], ['diversity', 'Voluntary diversity / equal opportunity information', 'textarea'],
  ['accessibility', 'Accessibility / accommodation request', 'textarea'], ['emergency_contact', 'Emergency contact', 'textarea'],
  ['supporting_documents', 'Supporting documents', 'document:application/pdf,.doc,.docx,image/*'], ['consents', 'Consent and declarations', 'textarea']
];

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
        <p style="color:var(--text-soft);margin-top:8px">${job.description || ''}</p><div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-outline btn-sm" onclick="editRecruitmentPosting('${job.id}')">Edit / Replace</button><button class="btn btn-outline btn-sm" onclick="deleteRecruitmentPosting('${job.id}')">Delete</button></div>
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

            <div class="form-group"><label class="form-label">Manual screening questions (one per line)</label><textarea class="form-textarea" name="manual_questions" rows="4" placeholder="Why are you suited to this role?&#10;Describe relevant experience."></textarea></div>

            <details class="card" style="margin:12px 0;padding:12px"><summary style="cursor:pointer;font-weight:600">Application requirements</summary>
              <p style="color:var(--text-muted);font-size:.9rem;margin:8px 0">Choose exactly what applicants must complete for this job. These choices are saved with this job only.</p>
              <div class="grid grid-2">${APPLICATION_FIELDS.map(([key, label, type]) => `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" class="application-field" data-key="${key}" data-label="${label}" data-type="${type}"> ${label}</label>`).join('')}</div>
            </details>

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
    FormControls.apply('recruitment_posting', document.getElementById('recruitmentPostForm'));
  } else {
    box.style.display = 'none';
  }
};

window.editRecruitmentPosting = async function (id) {
  const jobs = await API.get('/recruitment/recruiter/jobs'); const job = jobs.find(j => j.id === id); if (!job) return Toast.show('Job not found');
  window.toggleRecruitmentForm(); const form = document.getElementById('recruitmentPostForm'); form.dataset.editId = id;
  Object.entries(job).forEach(([key, value]) => { if (form.elements[key] && value != null) form.elements[key].value = Array.isArray(value) ? value.join(', ') : value; });
  form.querySelector('button[type="submit"]').textContent = 'Submit Update for Approval';
  Toast.show('Update the job and submit it for a fresh admin review.');
};
window.deleteRecruitmentPosting = async function (id) { if (!confirm('Delete this recruitment job?')) return; try { await API.del(`/recruitment/recruiter/jobs/${id}`); Toast.show('Recruitment job deleted'); loadRecruiterJobs(); } catch(e) { Toast.show(e.message); } };

async function submitRecruitmentJob(e) {
  e.preventDefault();

  const data = Object.fromEntries(new FormData(e.target));
  data.application_fields = Array.from(e.target.querySelectorAll('.application-field:checked')).map(input => ({
    key: input.dataset.key, label: input.dataset.label, type: input.dataset.type, required: true
  }));
  data.questions = String(data.manual_questions || '').split('\n').map(question => question.trim()).filter(Boolean).map(question => ({ question, duration_limit: 120, attempts_allowed: 1 }));
  delete data.manual_questions;

  try {
    const editId = e.target.dataset.editId;
    if (editId) await API.put(`/recruitment/recruiter/jobs/${editId}`, data);
    else await API.post('/recruitment/jobs', data);
    Toast.show(editId ? 'Updated recruitment job submitted for approval' : 'Recruitment job submitted for approval');
    e.target.reset();
    await loadRecruiterJobs();
  } catch (err) {
    Toast.show(err.message);
  }
}
