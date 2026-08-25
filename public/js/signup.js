document.addEventListener('DOMContentLoaded', () => {
  let role = 'client';
  let kycSelfieUrl = null;
  document.getElementById('toggleSignupPasswords')?.addEventListener('change', (event) => {
    ['signupPassword', 'signupConfirm'].forEach(id => {
      const input = document.getElementById(id);
      if (input) input.type = event.target.checked ? 'text' : 'password';
    });
  });
  document.querySelectorAll('.role-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.role-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      role = opt.dataset.role;
    });
  });

  const dropZone = document.getElementById('kycDropZone');
  const fileInput = document.getElementById('kycFileInput');
  const preview = document.getElementById('kycPreview');
  const placeholder = document.getElementById('kycPlaceholder');

  if (dropZone) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--gold)'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--border)'; });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border)';
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); });
  }

  async function handleFile(file) {
    if (!file.type.startsWith('image/')) return Toast.show('Please upload an image file');
    if (file.size > 5 * 1024 * 1024) return Toast.show('Image must be under 5MB');
    placeholder.innerHTML = '<div style="color:var(--text-soft)">Uploading...</div>';
    try {
      const url = await uploadImage(file, 'kyc');
      kycSelfieUrl = url;
      preview.src = URL.createObjectURL(file);
      preview.style.display = 'block';
      placeholder.innerHTML = '<p style="color:var(--success);font-size:0.85rem">Uploaded. Click to change.</p>';
    } catch (err) {
      Toast.show('Upload failed: ' + err.message);
      placeholder.innerHTML = '<div style="font-size:2rem;margin-bottom:8px">📷</div><p style="color:var(--text-soft);font-size:0.9rem">Click to upload or drag and drop</p>';
    }
  }

  document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    if (data.password !== data.confirm) return Toast.show('Passwords do not match');
    if (data.password.length < 6) return Toast.show('Password must be at least 6 characters');
    const btn = document.getElementById('signupBtn');
    btn.disabled = true; btn.textContent = 'Creating...';
    try {
      const result = await Auth.signup({ ...data, role, kyc_selfie: kycSelfieUrl });
      if (result.requiresConfirmation) {
        Toast.show('Account created. Open the verification email, then sign in with this email and password.');
        setTimeout(() => window.location.href = '/signin.html', 1800);
      } else {
        Toast.show('Welcome to SkillBridge!');
        setTimeout(() => window.location.href = '/dashboard.html', 800);
      }
    } catch (err) {
      Toast.show(err.message);
      btn.disabled = false; btn.textContent = 'Create Account';
    }
  });
});
