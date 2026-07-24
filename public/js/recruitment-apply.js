document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { Toast.show('Please sign in to apply'); setTimeout(() => location.href = '/signin.html', 1000); return; }
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { document.getElementById('applySub').textContent = 'No job specified.'; return; }

  const job = await API.get(`/recruitment/jobs/${id}`).catch(() => null);
  if (!job) { document.getElementById('applySub').textContent = 'Job not found or no longer accepting applications.'; return; }

  document.getElementById('applyTitle').textContent = `Apply: ${job.title}`;
  document.getElementById('applySub').textContent = `${job.company_name} • ${job.location || 'Location not stated'}`;

  const uploadedDocs = {}; // document_type -> url

  if (job.documents?.length) {
    document.getElementById('docsSection').innerHTML = `
      <h3 style="margin:16px 0 8px">Required documents</h3>
      ${job.documents.map((d, i) => `
        <div class="form-group"><label class="form-label">${d.document_type}${d.required ? ' *' : ' (optional)'}</label>
          <input class="form-input doc-file-input" type="file" data-type="${d.document_type}" data-required="${d.required}" accept="image/*,.pdf,.doc,.docx">
          <div class="doc-status" data-type="${d.document_type}" style="font-size:0.85rem;color:var(--text-muted);margin-top:4px"></div>
        </div>`).join('')}`;

    document.querySelectorAll('.doc-file-input').forEach(input => {
      input.addEventListener('change', async () => {
        const file = input.files[0];
        const statusEl = document.querySelector(`.doc-status[data-type="${input.dataset.type}"]`);
        if (!file) return;
        statusEl.textContent = 'Uploading...';
        try {
          uploadedDocs[input.dataset.type] = { url: await Upload.file(file), file_type: file.type };
          statusEl.textContent = `✓ ${file.name}`;
        } catch (e) { statusEl.textContent = 'Upload failed: ' + e.message; }
      });
    });
  }

  if (job.questions?.length) {
    document.getElementById('questionsBox').innerHTML = `
      <div class="card" style="margin-bottom:16px"><div class="card-body">
        <h3>Screening questions</h3>
        <p style="color:var(--text-muted);font-size:0.9rem">These will be asked during your video response, or answer them in your cover note if this role doesn't require video.</p>
        <ol style="padding-left:18px;color:var(--text-soft)">${job.questions.map(q => `<li style="margin-bottom:6px">${q.question}</li>`).join('')}</ol>
      </div></div>`;
  }

  let videoFile = null;
  if (job.video_enabled !== 'disabled') {
    document.getElementById('videoSection').style.display = 'block';
    document.querySelector('#videoSection input[name="video_url"]')?.remove();
    document.getElementById('videoSection').innerHTML = `
      <div class="form-group"><label class="form-label">Video response ${job.video_enabled === 'mandatory' ? '(required for this role)' : '(optional)'}</label>
        <input class="form-input" type="file" id="videoFileInput" accept="video/*" ${job.video_enabled === 'mandatory' ? 'required' : ''}>
        <div id="videoStatus" style="font-size:0.85rem;color:var(--text-muted);margin-top:4px"></div>
      </div>`;
    document.getElementById('videoFileInput').addEventListener('change', () => {
      videoFile = document.getElementById('videoFileInput').files[0];
      document.getElementById('videoStatus').textContent = videoFile ? `Selected: ${videoFile.name}` : '';
    });
  }

  document.getElementById('recruitApplyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const missingRequired = (job.documents || []).some(d => d.required && !uploadedDocs[d.document_type]);
    if (missingRequired) return Toast.show('Please upload all required documents');
    if (job.video_enabled === 'mandatory' && !videoFile) return Toast.show('This role requires a video response');

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Submitting...';
    try {
      data.documents = Object.entries(uploadedDocs).map(([document_type, v]) => ({ document_type, file_url: v.url, file_type: v.file_type }));
      if (videoFile) {
        btn.textContent = 'Uploading video...';
        data.video_url = await Upload.file(videoFile);
      }
      await API.post(`/recruitment/apply/${id}`, data);
      Toast.show('Application submitted! AI screening begins based on the recruiter\'s plan.');
      setTimeout(() => location.href = '/recruitment-jobs.html', 1400);
    } catch (err) {
      Toast.show(err.message);
      btn.disabled = false; btn.textContent = 'Submit Application';
    }
  });
});
