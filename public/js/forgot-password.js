document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('forgotPasswordForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.getElementById('sendResetButton');
    button.disabled = true;
    try {
      await Auth.requestPasswordReset(document.getElementById('resetEmail').value);
      Toast.show('If this email has an account, a password-reset link has been sent.');
    } catch (error) {
      Toast.show(error.message);
      button.disabled = false;
    }
  });
});
