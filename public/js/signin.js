document.addEventListener('DOMContentLoaded', () => {
  const password = document.getElementById('signinPassword');
  const togglePassword = document.getElementById('toggleSigninPassword');
  togglePassword?.addEventListener('click', () => {
    const isHidden = password.type === 'password';
    password.type = isHidden ? 'text' : 'password';
    togglePassword.textContent = isHidden ? 'Hide' : 'Show';
    togglePassword.setAttribute('aria-pressed', String(isHidden));
  });
  document.getElementById('forgotPassword')?.addEventListener('click', async (event) => {
    event.preventDefault();
    const identifier = document.querySelector('[name="identifier"]')?.value.trim();
    try {
      await Auth.requestPasswordReset(identifier);
      Toast.show('If this email has an account, a password-reset link has been sent.');
    } catch (error) { Toast.show(error.message); }
  });
  document.getElementById('signinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    const btn = document.getElementById('signinBtn');
    btn.disabled = true; btn.textContent = 'Signing in...';
    try {
      await Auth.signin(data.identifier, data.password);
      Toast.show('Signed in!');
      setTimeout(() => window.location.href = '/dashboard.html', 600);
    } catch (err) {
      Toast.show(err.message);
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  });
});
