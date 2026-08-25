document.addEventListener('DOMContentLoaded', () => {
  const password = document.getElementById('signinPassword');
  const togglePassword = document.getElementById('toggleSigninPassword');
  togglePassword?.addEventListener('click', () => {
    const isHidden = password.type === 'password';
    password.type = isHidden ? 'text' : 'password';
    togglePassword.textContent = isHidden ? 'Hide' : 'Show';
    togglePassword.setAttribute('aria-pressed', String(isHidden));
  });
  document.getElementById('signinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    const btn = document.getElementById('signinBtn');
    btn.disabled = true; btn.textContent = 'Signing in...';
    try {
      // Accept both field names so cached pages from the previous release do
      // not send blank credentials during a staged deployment.
      await Auth.signin(data.identifier || data.email, data.password);
      Toast.show('Signed in!');
      setTimeout(() => window.location.href = '/dashboard.html', 600);
    } catch (err) {
      Toast.show(err.message);
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  });
});
