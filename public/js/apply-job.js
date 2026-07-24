document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { Toast.show('Please sign in to apply'); setTimeout(() => location.href = '/signin.html', 1000); return; }
  const params = new URLSearchParams(location.search);
  const jobId = params.get('job');
  if (!jobId) { Toast.show('No job specified'); return; }

  const job = await API.get(`/jobs/${jobId}`).catch(() => null);
  if (job) {
    document.getElementById('applyTitle').textContent = `Apply: ${job.title}`;
    document.getElementById('applySub').textContent = `Posted by ${job.profiles?.display_name || 'a client'} • Budget ${fmtPrice(job.budget || 0)}`;
  }

  document.getElementById('applyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.expected_price = +data.expected_price;
    const resumeFile = document.getElementById('resumeInput').files[0];
    try {
      if (resumeFile) data.resume_url = await Upload.file(resumeFile);
      await API.post(`/jobs/${jobId}/apply`, data);
      Toast.show('Application submitted! Screening begins based on the client\'s plan.');
      setTimeout(() => location.href = '/recruitment.html', 1400);
    } catch (err) { Toast.show(err.message); }
  });
});
