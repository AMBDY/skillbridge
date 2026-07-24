document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { Toast.show('Please sign in first'); setTimeout(() => location.href = '/signin.html', 1000); return; }

  const user = Auth.user();
  const statusBox = document.getElementById('kycStatus');
  const level = user?.kyc_level ?? 0;
  const labels = ['Unverified', 'Phone Verified', 'ID Verified', 'KYC Verified', 'Elite Verified'];
  statusBox.innerHTML = `<span class="badge badge-kyc">Current level: ${level} — ${labels[level] || 'Unverified'}</span>`;

  document.getElementById('selfieInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { document.getElementById('selfiePreview').innerHTML = `<img src="${reader.result}" style="max-width:100%;border-radius:var(--radius)">`; };
    reader.readAsDataURL(file);
  });

  document.getElementById('kycForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('kycSubmitBtn');
    const file = document.getElementById('selfieInput').files[0];
    const full_name = e.target.elements.full_name.value.trim();
    if (!file) return Toast.show('Please add your selfie photo');
    btn.disabled = true;
    btn.textContent = 'Uploading...';
    try {
      const selfie_url = await Upload.file(file);
      btn.textContent = 'Submitting...';
      await API.post('/auth/kyc', { selfie_url, full_name });
      Toast.show('Submitted! An admin will review it shortly.');
      setTimeout(() => location.href = '/dashboard.html', 1400);
    } catch (err) {
      Toast.show(err.message);
      btn.disabled = false;
      btn.textContent = 'Submit for Verification';
    }
  });
});
