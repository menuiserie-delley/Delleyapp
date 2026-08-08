import { login } from './auth.js';

export function renderLogin() {
  const root = document.getElementById('login-screen');
  root.innerHTML = `
    <div class="login-card">
      <img src="assets/logo-full-white.png" alt="Menuiserie Delley" class="login-logo">
      <form id="login-form">
        <div class="field">
          <label>E-Mail</label>
          <input type="email" id="login-email" required autocomplete="username">
        </div>
        <div class="field">
          <label>Passwort</label>
          <input type="password" id="login-password" required autocomplete="current-password">
        </div>
        <div id="login-error" class="login-error" style="display:none"></div>
        <button type="submit" class="btn btn-primary" id="login-submit" style="width:100%">Anmelden</button>
      </form>
    </div>
  `;

  const form = root.querySelector('#login-form');
  const errorBox = root.querySelector('#login-error');
  const submitBtn = root.querySelector('#login-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = root.querySelector('#login-email').value.trim();
    const password = root.querySelector('#login-password').value;
    errorBox.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Anmelden …';
    try {
      await login(email, password);
    } catch (err) {
      errorBox.textContent = 'Anmeldung fehlgeschlagen — E-Mail/Passwort prüfen.';
      errorBox.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Anmelden';
    }
  });
}
