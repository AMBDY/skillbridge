document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { Toast.show('Please sign in'); setTimeout(() => location.href = '/signin.html', 1000); return; }

  const typeSel = document.getElementById('listingType');
  const catSel = document.getElementById('catSel');
  let uploadedImages = [];
  const params = new URLSearchParams(location.search);
  const editId = params.get('edit');
  const editType = params.get('type') || 'product';

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
      renderImages();
      Toast.show('Images uploaded');
    } catch (e) { Toast.show(e.message); }
    imagesInput.value = '';
  });

  function renderImages() {
    imagesPreview.innerHTML = uploadedImages.map((url, index) => `<div style="position:relative"><img src="${url}" style="width:64px;height:64px;object-fit:cover;border-radius:8px"><button type="button" class="remove-listing-image" data-index="${index}" aria-label="Remove image" style="position:absolute;top:-7px;right:-7px;border:0;border-radius:50%;background:#b91c1c;color:white;width:20px;height:20px;cursor:pointer">×</button></div>`).join('');
    imagesPreview.querySelectorAll('.remove-listing-image').forEach(button => button.addEventListener('click', async () => {
      const [url] = uploadedImages.splice(Number(button.dataset.index), 1);
      renderImages();
      try { await Upload.remove(url); } catch (e) { Toast.show(`Image removed from this listing, but storage cleanup failed: ${e.message}`); }
    }));
  }

  if (editId) {
    const listing = await API.get('/marketplace/listings/mine').then(rows => rows.find(row => row.id === editId && row.type === editType)).catch(() => null);
    if (!listing) { Toast.show('Listing not found'); return; }
    document.querySelector('.auth-title').textContent = 'Edit Product Listing';
    document.querySelector('.auth-sub').textContent = 'Replace any information or media. The updated listing will wait for admin approval.';
    document.querySelector('#listingForm button[type="submit"]').textContent = 'Submit Update for Approval';
    ['title','description','price','stock','location','brand','size','color','gender'].forEach(key => { if (document.getElementById('listingForm').elements[key] && listing[key] != null) document.getElementById('listingForm').elements[key].value = listing[key]; });
    catSel.value = listing.category_id || catSel.value;
    uploadedImages = [...(listing.images || [])]; renderImages();
    Object.entries(listing.details || {}).forEach(([key, value]) => { const input = document.getElementById('listingForm').elements[`detail_${key}`]; if (input && typeof value !== 'object') input.value = value; });
    if (Array.isArray(listing.details?.variations)) document.getElementById('listingForm').elements.detail_variations.value = listing.details.variations.map(v => [v.name, v.option, v.price_adjustment, v.stock].join(' | ')).join('\n');
  }

  document.getElementById('listingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!uploadedImages.length) return Toast.show('Please add at least one image');
    const data = Object.fromEntries(new FormData(e.target));
    data.category_id = catSel.value;
    data.price = +data.price;
    data.images = uploadedImages;
    data.details = Object.fromEntries(Array.from(e.target.querySelectorAll('[name^="detail_"]')).map(input => [input.name.slice(7), input.type === 'checkbox' ? input.checked : input.value]));
    data.details.variations = String(data.details.variations || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => { const [name, option, price_adjustment, stock] = line.split('|').map(v => v.trim()); return { name, option, price_adjustment: Number(price_adjustment || 0), stock: Number(stock || 0) }; });
    if (data.delivery_days) data.delivery_days = +data.delivery_days;
    if (data.stock) data.stock = +data.stock;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Publishing...';
    try {
      const videoFile = document.getElementById('videoInput').files[0];
      if (videoFile) { btn.textContent = 'Uploading video...'; data.video_url = await Upload.file(videoFile); }
      if (editId) await API.put(`/marketplace/listings/${editType}/${editId}`, data);
      else await API.post('/marketplace/products', data);
      Toast.show(editId ? 'Update submitted for admin approval.' : 'Submitted! A superadmin will review it before it goes live.');
      setTimeout(() => location.href = '/dashboard.html', 1200);
    } catch (err) {
      Toast.show(err.message);
      btn.disabled = false; btn.textContent = 'Submit for Approval';
    }
  });
});
