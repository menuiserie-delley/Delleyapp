import { loadSettings, saveSettings } from '../settings.js';
import { exportAll, importAll } from '../db.js';
import { bulkImportCatalog } from '../catalog.js';
import { migrateLegacyPhotosInDump } from '../attachments.js';
import { logout } from '../auth.js';
import { escapeHtml } from '../utils.js';
import { toast, confirmDialog } from '../ui.js';
import { tr } from '../i18n.js';

export async function renderEinstellungen() {
  const main = document.getElementById('main');
  const settings = await loadSettings();
  const lang = settings.sprache || 'de';
  const T = tr(lang).settings;

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${T.title}</h1>
        <div class="subtitle">${T.subtitle}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">${T.cardFirma}</div>
      <div class="card-body">
        <div class="form-grid" id="firma-fields"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">${T.cardBank}</div>
      <div class="card-body">
        <div class="form-grid" id="bank-fields"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">${T.cardNumbering}</div>
      <div class="card-body">
        <div class="form-grid" id="numbering-fields"></div>
        <p class="text-muted" style="font-size:12.5px;margin-top:10px">${T.numberingHint}</p>
      </div>
    </div>

    <div class="card">
      <div class="card-header">${T.cardTexts}</div>
      <div class="card-body">
        <div class="form-grid cols-1" id="text-fields"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">${tr(lang).catalogImport.title}</div>
      <div class="card-body" id="import-card-body"></div>
    </div>

    <div class="card">
      <div class="card-header">${T.cardBackup}</div>
      <div class="card-body">
        <p style="margin-top:0">${T.backupIntro}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" id="btn-export">${T.btnExport}</button>
          <label class="btn" style="cursor:pointer">
            ${T.btnImport}
            <input type="file" id="import-file" accept="application/json" style="display:none">
          </label>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">${T.cardAccount}</div>
      <div class="card-body">
        <p style="margin-top:0">${T.accountIntro}</p>
        <button class="btn btn-danger" id="btn-logout">${T.btnLogout}</button>
      </div>
    </div>

    <div class="page-header" style="margin-top:8px">
      <div></div>
      <div class="actions"><button class="btn btn-primary" id="btn-save-all">${T.btnSaveAll}</button></div>
    </div>
  `;

  const s = { ...settings };

  main.querySelector('#firma-fields').innerHTML = [
    f(T.fFirma, 'firma', s.firma),
    f(T.fInhaber, 'inhaber', s.inhaber),
    f(T.fAdresse, 'adresse', s.adresse),
    f(T.fPlzOrt, 'plzOrt', s.plzOrt),
    f(T.fTelefon, 'telefon', s.telefon),
    f(T.fEmail, 'email', s.email, 'email'),
    f(T.fWebsite, 'website', s.website),
    fColor(T.fFarbe, 'farbe', s.farbe),
  ].join('');

  main.querySelector('#bank-fields').innerHTML = [
    f(T.fBank, 'bankName', s.bankName),
    f(T.fKontoinhaber, 'kontoinhaber', s.kontoinhaber),
    f(T.fIban, 'iban', s.iban),
  ].join('');

  main.querySelector('#numbering-fields').innerHTML = [
    f(T.fNaechsteNummer, 'naechsteNummer', s.naechsteNummer, 'number'),
    f(T.fMwst, 'mwstSatz', s.mwstSatz, 'number', '0.1'),
    f(T.fZahlungsfrist, 'zahlungsfristTage', s.zahlungsfristTage, 'number'),
    f(T.fGueltigkeit, 'gueltigkeitTage', s.gueltigkeitTage, 'number'),
  ].join('');

  main.querySelector('#text-fields').innerHTML = [
    ta(T.tGrussformel, 'grussformel', s.grussformel, 1),
    ta(T.tOfferteEinleitung, 'textOfferteEinleitung', s.textOfferteEinleitung, 3),
    ta(T.tOfferteSchluss, 'textOfferteSchluss', s.textOfferteSchluss, 6),
    ta(T.tAbEinleitung, 'textAbEinleitung', s.textAbEinleitung, 3),
    ta(T.tAbSchluss, 'textAbSchluss', s.textAbSchluss, 6),
    ta(T.tRechnungEinleitung, 'textRechnungEinleitung', s.textRechnungEinleitung, 3),
    ta(T.tRechnungZahlung, 'textRechnungZahlung', s.textRechnungZahlung, 2),
    ta(T.tRechnungSchluss, 'textRechnungSchluss', s.textRechnungSchluss, 4),
  ].join('');

  main.querySelectorAll('[data-field]').forEach(el => el.addEventListener('input', () => {
    const key = el.dataset.field;
    s[key] = el.type === 'number' ? Number(el.value) : el.value;
  }));

  main.querySelector('#btn-save-all').addEventListener('click', async () => {
    await saveSettings(s);
    toast(T.savedToast, 'success');
  });

  renderImportCard();
  async function renderImportCard() {
    const CI = tr(lang).catalogImport;
    const box = main.querySelector('#import-card-body');
    box.innerHTML = `<p style="margin-top:0">${CI.intro}</p><p class="text-muted" style="font-size:12.5px">…</p>`;
    let data;
    try {
      const res = await fetch('assets/artikelstamm-import.json');
      data = await res.json();
    } catch (err) {
      box.innerHTML = `<p style="margin-top:0">${CI.intro}</p><p style="color:var(--danger)">${CI.loadError}</p>`;
      return;
    }
    const lastImported = s.lastArtikelImportAt
      ? CI.lastImported(new Date(s.lastArtikelImportAt).toLocaleString(lang === 'fr' ? 'fr-CH' : 'de-CH'))
      : CI.neverImported;
    box.innerHTML = `
      <p style="margin-top:0">${CI.intro}</p>
      <p class="text-muted" style="font-size:12.5px">${escapeHtml(data.source || '')} — ${lastImported}</p>
      <button class="btn btn-primary" id="btn-import-artikel">${CI.button(data.items.length)}</button>
    `;
    box.querySelector('#btn-import-artikel').addEventListener('click', async () => {
      const ok = await confirmDialog(CI.confirm(data.items.length), { lang, danger: false, confirmLabel: tr(lang).common.save });
      if (!ok) return;
      const { created, updated } = await bulkImportCatalog('articles', data.items);
      s.lastArtikelImportAt = new Date().toISOString();
      await saveSettings(s);
      toast(CI.resultToast(created, updated), 'success');
      renderImportCard();
    });
  }

  main.querySelector('#btn-export').addEventListener('click', async () => {
    const dump = await exportAll();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `menuiserie-delley-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(T.exportedToast, 'success');
  });

  main.querySelector('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ok = await confirmDialog(T.importConfirm, { lang });
    if (!ok) { e.target.value = ''; return; }
    try {
      const text = await file.text();
      const dump = JSON.parse(text);
      await migrateLegacyPhotosInDump(dump);
      await importAll(dump);
      toast(T.importedToast, 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast(T.importError(err.message), 'error');
    }
  });

  main.querySelector('#btn-logout').addEventListener('click', async () => {
    const ok = await confirmDialog(T.logoutConfirm, { lang, danger: false, confirmLabel: T.btnLogout });
    if (!ok) return;
    await logout();
  });

  function f(label, key, value, type = 'text', step) {
    return `<div class="field"><label>${label}</label><input data-field="${key}" type="${type}" ${step ? `step="${step}"` : ''} value="${escapeHtml(value ?? '')}"></div>`;
  }
  function fColor(label, key, value) {
    return `<div class="field"><label>${label}</label><input data-field="${key}" type="color" value="${escapeHtml(value ?? '#2e5254')}" style="height:40px;padding:4px"></div>`;
  }
  function ta(label, key, value, rows) {
    return `<div class="field"><label>${label}</label><textarea data-field="${key}" rows="${rows}">${escapeHtml(value ?? '')}</textarea></div>`;
  }
}
