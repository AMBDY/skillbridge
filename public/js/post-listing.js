document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { Toast.show('Please sign in'); setTimeout(() => location.href = '/signin.html', 1000); return; }

  const typeSel = document.getElementById('listingType');
  const catSel = document.getElementById('catSel');
  let uploadedImages = [];
  const params = new URLSearchParams(location.search);
  const editId = params.get('edit');
  const editType = params.get('type') || 'product';
  typeSel.value = editType;

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
  const fulfillment = document.getElementById('fulfillmentType');
  async function loadMeasurementTemplates() {
    if (!fulfillment || !['custom_design', 'made_to_order_measurements'].includes(fulfillment.value)) return;
    const templates = await API.get(`/orders/measurement-templates?category_id=${encodeURIComponent(catSel.value || '')}`).catch(() => []);
    const select = document.getElementById('measurementTemplate');
    select.innerHTML = '<option value="">No template selected</option>' + templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  }
  function toggleFulfillment() {
    if (!fulfillment) return;
    const custom = ['custom_design', 'made_to_order_measurements'].includes(fulfillment.value);
    document.getElementById('measurementTemplateWrap').style.display = custom ? '' : 'none';
    document.getElementById('sizeSupportWrap').style.display = fulfillment.value === 'ready_made' ? '' : 'none';
    if (custom) loadMeasurementTemplates();
  }
  fulfillment?.addEventListener('change', toggleFulfillment);
  catSel.addEventListener('change', loadMeasurementTemplates);
  toggleFulfillment();
  FormControls.apply('product_listing', document.getElementById('listingForm'));

  const imagesInput = document.getElementById('imagesInput');
  const imagesPreview = document.getElementById('imagesPreview');
  imagesInput.addEventListener('change', async () => {
    // Copy File objects before resetting the picker.  Some browsers clear the
    // live FileList as soon as the picker is reset, which previously made the
    // form report “add at least one image” after a successful upload.
    const files = [...imagesInput.files];
    if (!files.length) return;
    Toast.show('Uploading images...');
    try {
      const urls = await Promise.all(files.map(file => Upload.file(file)));
      uploadedImages = [...uploadedImages, ...urls.filter(Boolean)];
      if (!uploadedImages.length) throw new Error('No image URL was returned. Please try the upload again.');
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
    typeSel.value = editType; await loadCategories(); toggleFields();
    document.querySelector('.auth-title').textContent = `Edit ${editType === 'service' ? 'Digital Service' : 'Product'} Listing`;
    document.querySelector('.auth-sub').textContent = 'Replace any information or media. The updated listing will wait for admin approval.';
    document.querySelector('#listingForm button[type="submit"]').textContent = 'Submit Update for Approval';
    ['title','description','price','stock','location','brand','size','color','gender','fulfillment_type','production_days','delivery_days','revisions_included','terms_included'].forEach(key => { if (document.getElementById('listingForm').elements[key] && listing[key] != null) document.getElementById('listingForm').elements[key].value = listing[key]; });
    if (editType === 'service') { document.getElementById('listingForm').elements.deliverables.value = (listing.deliverables || []).join(', '); document.getElementById('listingForm').elements.requirements_schema.value = (listing.requirements_schema || []).map(x => x.label || x.name || '').filter(Boolean).join('\n'); }
    catSel.value = listing.category_id || catSel.value;
    uploadedImages = [...(listing.images || [])]; renderImages();
    if (listing.supported_sizes?.length) document.getElementById('listingForm').elements.supported_sizes.value = listing.supported_sizes.join(', ');
    toggleFulfillment();
    if (listing.measurement_template_id) { await loadMeasurementTemplates(); document.getElementById('measurementTemplate').value = listing.measurement_template_id; }
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
    data.supported_sizes = String(data.supported_sizes || '').split(',').map(size => size.trim()).filter(Boolean);
    data.revisions_included = Number(data.revisions_included || 0);
    data.deliverables = String(data.deliverables || '').split(',').map(x => x.trim()).filter(Boolean);
    data.requirements_schema = String(data.requirements_schema || '').split('\n').map((label, index) => ({ key: `requirement_${index + 1}`, label: label.trim(), required: false })).filter(x => x.label);
    if (data.delivery_days) data.delivery_days = +data.delivery_days;
    if (data.stock) data.stock = +data.stock;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Publishing...';
    try {
      const videoFile = document.getElementById('videoInput').files[0];
      if (videoFile) { btn.textContent = 'Uploading video...'; data.video_url = await Upload.file(videoFile); }
      if (editId) await API.put(`/marketplace/listings/${editType}/${editId}`, data);
      else await API.post(typeSel.value === 'service' ? '/marketplace/services' : '/marketplace/products', data);
      Toast.show(editId ? 'Update submitted for admin approval.' : 'Submitted! A superadmin will review it before it goes live.');
      setTimeout(() => location.href = '/dashboard.html', 1200);
    } catch (err) {
      Toast.show(err.message);
      btn.disabled = false; btn.textContent = 'Submit for Approval';
    }
  });
});
