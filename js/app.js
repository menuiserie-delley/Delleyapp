import { route, startRouter } from './router.js';
import { renderDashboard } from './views/dashboard.js';
import { renderKundenList } from './views/kunden.js';
import { renderCatalogList } from './views/katalog.js';
import { renderDocumentList, renderDocumentDetail } from './views/dokumente.js';
import { renderAvorList, renderAvorDetail } from './views/avor.js';
import { renderKalender } from './views/kalender.js';
import { renderEinstellungen } from './views/einstellungen.js';
import { loadSettings, saveSettings } from './settings.js';
import { tr } from './i18n.js';
import { onAuthChange } from './auth.js';
import { renderLogin } from './login.js';
import { startBookingRequestWatcher } from './notifications.js';

async function initSidebar() {
  const settings = await loadSettings();
  const lang = settings.sprache || 'de';
  const N = tr(lang).nav;

  document.getElementById('nav-dashboard').textContent = N.dashboard;
  document.getElementById('nav-kalender').textContent = N.kalender;
  document.getElementById('nav-section-docs').textContent = N.sectionDocs;
  document.getElementById('nav-offerten').textContent = N.offerten;
  document.getElementById('nav-auftragsbestaetigungen').textContent = N.auftragsbestaetigungen;
  document.getElementById('nav-rechnungen').textContent = N.rechnungen;
  document.getElementById('nav-avor').textContent = N.avor;
  document.getElementById('nav-section-master').textContent = N.sectionMaster;
  document.getElementById('nav-kunden').textContent = N.kunden;
  document.getElementById('nav-artikel').textContent = N.artikel;
  document.getElementById('nav-dienstleistungen').textContent = N.dienstleistungen;
  document.getElementById('nav-section-admin').textContent = N.sectionAdmin;
  document.getElementById('nav-einstellungen').textContent = N.einstellungen;
  document.getElementById('nav-data-note').textContent = N.dataNote;
  document.title = lang === 'fr' ? 'Menuiserie Delley — Devis & Factures' : 'Menuiserie Delley — Offerten & Rechnungen';

  // Mobile Tab-Leiste (kurze Labels)
  document.getElementById('nav-m-avor').textContent = N.short.avor;
  document.getElementById('nav-m-dashboard').textContent = N.short.dashboard;
  document.getElementById('nav-m-kunden').textContent = N.short.kunden;
  document.getElementById('nav-m-mehr').textContent = N.short.mehr;

  // "Mehr"-Sheet (volle Labels)
  document.getElementById('nav-m2-kalender').textContent = N.kalender;
  document.getElementById('nav-m2-offerten').textContent = N.offerten;
  document.getElementById('nav-m2-auftragsbestaetigungen').textContent = N.auftragsbestaetigungen;
  document.getElementById('nav-m2-rechnungen').textContent = N.rechnungen;
  document.getElementById('nav-m2-artikel').textContent = N.artikel;
  document.getElementById('nav-m2-dienstleistungen').textContent = N.dienstleistungen;
  document.getElementById('nav-m2-einstellungen').textContent = N.einstellungen;

  async function setLang(newLang) {
    settings.sprache = newLang;
    await saveSettings(settings);
    window.location.reload();
  }

  [document.getElementById('lang-toggle'), document.getElementById('lang-toggle-mobile')].forEach(toggle => {
    toggle.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
      btn.onclick = () => { if (btn.dataset.lang !== lang) setLang(btn.dataset.lang); };
    });
  });

  // "Mehr"-Sheet öffnen/schliessen
  const sheet = document.getElementById('mobile-more-sheet');
  const openSheet = () => sheet.classList.add('open');
  const closeSheet = () => sheet.classList.remove('open');
  document.getElementById('mobile-more-btn').addEventListener('click', openSheet);
  document.getElementById('mobile-more-backdrop').addEventListener('click', closeSheet);
  sheet.querySelectorAll('a').forEach(a => a.addEventListener('click', closeSheet));
}

route('/dashboard', renderDashboard);
route('/kalender', renderKalender);
route('/kunden', renderKundenList);
route('/artikel', () => renderCatalogList('articles'));
route('/dienstleistungen', () => renderCatalogList('services'));

route('/offerten', () => renderDocumentList('offerte'));
route('/offerten/:id', ({ id }) => renderDocumentDetail('offerte', id));
route('/auftragsbestaetigungen', () => renderDocumentList('auftragsbestaetigung'));
route('/auftragsbestaetigungen/:id', ({ id }) => renderDocumentDetail('auftragsbestaetigung', id));
route('/rechnungen', () => renderDocumentList('rechnung'));
route('/rechnungen/:id', ({ id }) => renderDocumentDetail('rechnung', id));

route('/avor', renderAvorList);
route('/avor/:id', ({ id }) => renderAvorDetail(id));

route('/einstellungen', renderEinstellungen);

let appStarted = false;

onAuthChange(async (user) => {
  document.body.classList.toggle('authenticated', !!user);
  if (!user) {
    renderLogin();
    return;
  }
  if (appStarted) return; // z.B. Token-Refresh im Hintergrund — App bleibt wie sie ist
  appStarted = true;
  await initSidebar();
  startRouter();
  startBookingRequestWatcher();
});
