import { submitBookingRequest } from './bookingRequests.js';
import { tr } from './i18n.js';

let lang = 'de';

function render() {
  const B = tr(lang).booking;
  const root = document.getElementById('booking-root');
  root.innerHTML = `
    <img src="assets/logo-full-white.png" alt="Menuiserie Delley" class="login-logo">
    <div class="lang-toggle" id="lang-toggle" role="group" aria-label="Sprache / Langue" style="margin-bottom:22px">
      <button type="button" data-lang="de" class="${lang === 'de' ? 'active' : ''}">DE</button>
      <button type="button" data-lang="fr" class="${lang === 'fr' ? 'active' : ''}">FR</button>
    </div>
    <h1 style="color:#fff;font-size:19px;margin:0 0 6px">${B.title}</h1>
    <p style="color:rgba(255,255,255,0.75);font-size:13.5px;margin:0 0 22px">${B.subtitle}</p>
    <form id="booking-form">
      <div class="form-grid">
        <div class="field">
          <label>${B.fieldAnrede}</label>
          <select name="anrede" required>
            <option value="Herr">${B.anredeHerr}</option>
            <option value="Frau">${B.anredeFrau}</option>
          </select>
        </div>
        <div class="field">
          <label>${B.fieldFirma}</label>
          <input name="firma">
        </div>
        <div class="field">
          <label>${B.fieldVorname}</label>
          <input name="vorname" required>
        </div>
        <div class="field">
          <label>${B.fieldNachname}</label>
          <input name="nachname" required>
        </div>
        <div class="field span-2">
          <label>${B.fieldAdresse}</label>
          <input name="adresse" placeholder="${B.fieldAdresseHint}" required>
        </div>
        <div class="field">
          <label>${B.fieldPlzOrt}</label>
          <input name="plzOrt" placeholder="${B.fieldPlzOrtHint}" required>
        </div>
        <div class="field">
          <label>${B.fieldTelefon}</label>
          <input name="telefon" type="tel" required>
        </div>
        <div class="field span-2">
          <label>${B.fieldEmail}</label>
          <input name="email" type="email">
        </div>
        <div class="field">
          <label>${B.fieldWunschdatum}</label>
          <input name="wunschdatum" type="date" required>
        </div>
        <div class="field">
          <label>${B.fieldWunschzeit}</label>
          <input name="wunschzeit" type="time">
        </div>
        <div class="field span-2">
          <label>${B.fieldNachricht}</label>
          <textarea name="nachricht" rows="3" placeholder="${B.nachrichtPlaceholder}"></textarea>
        </div>
      </div>
      <div id="booking-error" class="login-error" style="display:none;margin-top:14px"></div>
      <button type="submit" class="btn btn-primary" id="booking-submit" style="width:100%;margin-top:18px">${B.btnSubmit}</button>
    </form>
  `;

  root.querySelectorAll('#lang-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.lang === lang) return;
      lang = btn.dataset.lang;
      render();
    });
  });

  const form = root.querySelector('#booking-form');
  const errorBox = root.querySelector('#booking-error');
  const submitBtn = root.querySelector('#booking-submit');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = B.submitting;
    const fd = new FormData(form);
    try {
      await submitBookingRequest({
        anrede: fd.get('anrede'),
        firma: (fd.get('firma') || '').trim(),
        vorname: fd.get('vorname').trim(),
        nachname: fd.get('nachname').trim(),
        adresse: fd.get('adresse').trim(),
        plzOrt: fd.get('plzOrt').trim(),
        email: (fd.get('email') || '').trim(),
        telefon: fd.get('telefon').trim(),
        wunschdatum: fd.get('wunschdatum'),
        wunschzeit: fd.get('wunschzeit') || '',
        nachricht: (fd.get('nachricht') || '').trim(),
      });
      renderSuccess();
    } catch (err) {
      errorBox.textContent = B.errorGeneric;
      errorBox.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = B.btnSubmit;
    }
  });
}

function renderSuccess() {
  const B = tr(lang).booking;
  const root = document.getElementById('booking-root');
  root.innerHTML = `
    <img src="assets/logo-full-white.png" alt="Menuiserie Delley" class="login-logo">
    <h1 style="color:#fff;font-size:19px;margin:0 0 10px">${B.successTitle}</h1>
    <p style="color:rgba(255,255,255,0.85);font-size:14px;line-height:1.5;margin:0">${B.successBody}</p>
  `;
}

render();
