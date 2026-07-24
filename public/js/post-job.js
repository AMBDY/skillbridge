document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { Toast.show('Please sign in'); setTimeout(() => location.href = '/signin.html', 1000); return; }
  const cats = await API.get('/marketplace/categories').catch(() => []);
  document.getElementById('catSel').innerHTML = '<option value="">Select category</option>' + cats.map(c => `<option value="${c.id}">${c.name} (${c.ecosystem})</option>`).join('');

  const editId = new URLSearchParams(location.search).get('edit');
  const form = document.getElementById('postJobForm');
  let existingRefImages = [];

  const refInput = document.getElementById('refImagesInput');
  const refPreview = document.getElementById('refImagesPreview');
  function renderRefPreview() {
    refPreview.innerHTML = existingRefImages.map((url, i) => `
      <div style="position:relative">
        <img src="${url}" style="width:64px;height:64px;object-fit:cover;border-radius:8px">
        <button type="button" onclick="window.__removeRefImage(${i})" style="position:absolute;top:-6px;right:-6px;background:#b91c1c;color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:12px;cursor:pointer">×</button>
      </div>`).join('');
  }
  window.__removeRefImage = (i) => { existingRefImages.splice(i, 1); renderRefPreview(); };
  refInput.addEventListener('change', async () => {
    const files = Array.from(refInput.files);
    if (!files.length) return;
    Toast.show('Uploading images...');
    try {
      for (const file of files) existingRefImages.push(await Upload.file(file));
      renderRefPreview();
      Toast.show('Images uploaded');
    } catch (e) { Toast.show(e.message); }
    refInput.value = '';
  });

  if (editId) {
    document.querySelector('.auth-title').textContent = 'Edit Job';
    document.querySelector('.auth-sub').textContent = 'Update your job details. Changes to an already-approved job may require re-approval.';
    form.querySelector('button[type="submit"]').textContent = 'Save Changes';
    try {
      const job = await API.get(`/jobs/${editId}`);
      ['category_id', 'title', 'description', 'budget', 'duration', 'price_min', 'price_max', 'gender', 'colors', 'size', 'state', 'location', 'additional_notes'].forEach(f => {
        const el = form.elements[f];
        if (el && job[f] != null) el.value = job[f];
      });
      if (job.reference_images?.length) { existingRefImages = [...job.reference_images]; renderRefPreview(); }
    } catch (e) { Toast.show('Could not load job for editing'); }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.reference_images = existingRefImages;
    try {
      if (editId) {
        await API.put(`/jobs/${editId}`, data);
        Toast.show('Job updated!');
        setTimeout(() => location.href = '/recruitment.html', 1200);
      } else {
        await API.post('/jobs', data);
        Toast.show('Job submitted! Awaiting admin approval.');
        setTimeout(() => location.href = '/dashboard.html', 1200);
      }
    } catch (err) { Toast.show(err.message); }
  });
});
