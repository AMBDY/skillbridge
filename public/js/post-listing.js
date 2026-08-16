document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { Toast.show('Please sign in'); setTimeout(() => location.href = '/signin.html', 1000); return; }

  const typeSel = document.getElementById('listingType');
  const catSel = document.getElementById('catSel');
  let uploadedImages = [];

  async function loadCategories() {
    const ecosystem = typeSel.value === 'service' ? 'hire' : 'shop';
    const cats = await API.get(`/marketplace/categories?ecosystem=${ecosystem}`).catch(() => []);
    catSel.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('') || '<option value="">No categories yet</option>';
  }
  function toggleFields() {
    const isProduct = typeSel.value === 'product';
    document.querySelectorAll('.svc-only').forEach(el => el.style.display = isProduct ? 'none' : '');
    document.querySelectorAll('.prod-only').forEach(el => el.style.display = isProduct ? '' : 'none');
  }
  typeSel.addEventListener('change', () => { loadCategories(); toggleFields(); });
  await loadCategories();
  toggleFields();

  const imagesInput = document.getElementById('imagesInput');
  const imagesPreview = document.getElementById('imagesPreview');
  imagesInput.addEventListener('change', async () => {
    const files = Array.from(imagesInput.files);
    if (!files.length) return;
    Toast.show('Uploading images...');
    try {
      for (const file of files) uploadedImages.push(await Upload.file(file));
      imagesPreview.innerHTML = uploadedImages.map(url => `<img src="${url}" style="width:64px;height:64px;object-fit:cover;border-radius:8px">`).join('');
      Toast.show('Images uploaded');
    } catch (e) { Toast.show(e.message); }
    imagesInput.value = '';
  });

  document.getElementById('listingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!uploadedImages.length) return Toast.show('Please add at least one image');
    const data = Object.fromEntries(new FormData(e.target));
    data.category_id = catSel.value;
    data.price = +data.price;
    data.images = uploadedImages;
    if (data.delivery_days) data.delivery_days = +data.delivery_days;
    if (data.stock) data.stock = +data.stock;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Publishing...';
    try {
      const videoFile = document.getElementById('videoInput').files[0];
      if (videoFile) { btn.textContent = 'Uploading video...'; data.video_url = await Upload.file(videoFile); }
      const endpoint = typeSel.value === 'service' ? '/marketplace/services' : '/marketplace/products';
      await API.post(endpoint, data);
      Toast.show('Submitted! A superadmin will review it before it goes live.');
      setTimeout(() => location.href = '/dashboard.html', 1200);
    } catch (err) {
      Toast.show(err.message);
      btn.disabled = false; btn.textContent = 'Submit for Approval';
    }
  });
});
