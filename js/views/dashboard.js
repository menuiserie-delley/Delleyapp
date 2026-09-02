import { getAll } from '../db.js';
import { listCustomers } from '../customers.js';
import { listTermine } from '../termine.js';
import { listBookingRequests } from '../bookingRequests.js';
import { computeTotals } from '../documents.js';
import { loadSettings } from '../settings.js';
import { chf, formatDateDE, customerFullName, escapeHtml, todayISO } from '../utils.js';
import { tr } from '../i18n.js';

export async function renderDashboard() {
  const main = document.getElementById('main');
  const [docs, customers, termine, bookingRequests, settings] = await Promise.all([getAll('documents'), listCustomers(), listTermine(), listBookingRequests(), loadSettings()]);
  const lang = settings.sprache || 'de';
  const T = tr(lang).dashboard;
  const K = tr(lang).kalender;
  const customerMap = new Map(customers.map(c => [c.id, c]));
  const today = todayISO();
  const upcoming = termine.filter(t => t.datum >= today).slice(0, 5);

  const offerten = docs.filter(d => d.stage === 'offerte');
  const abs = docs.filter(d => d.stage === 'auftragsbestaetigung');
  const rechnungen = docs.filter(d => d.stage === 'rechnung');

  const offeneOfferten = offerten.filter(d => d.status === 'entwurf' || d.status === 'versendet');
  const offeneRechnungen = rechnungen.filter(d => d.status !== 'bezahlt');
  const offenerBetrag = offeneRechnungen.reduce((sum, d) => sum + computeTotals(d, settings.mwstSatz).total, 0);

  const recent = [...docs].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 8);

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${T.title}</h1>
        <div class="subtitle">${T.subtitle}</div>
      </div>
    </div>

    ${bookingRequests.length ? `
    <div class="card">
      <div class="card-header">${K.bookingRequestsTitle}</div>
      <div class="card-body">
        <div class="notes-list">
          ${bookingRequests.map(r => `
            <a href="#/kalender" class="note-item" style="text-decoration:none;color:inherit">
              <div>
                <div class="note-date">${escapeHtml(K.requestWish(formatDateDE(r.wunschdatum), r.wunschzeit))} · <span class="badge badge-entwurf" style="padding:1px 7px;font-size:10.5px">${r.lang === 'fr' ? 'FR' : 'DE'}</span></div>
                <div class="note-text" style="font-weight:600">${escapeHtml([r.anrede, r.vorname, r.nachname].filter(Boolean).join(' '))}${r.firma ? escapeHtml(` (${r.firma})`) : ''}</div>
                <div class="text-muted" style="font-size:12.5px;margin-top:2px">${[r.telefon, r.email].filter(Boolean).map(escapeHtml).join(' · ')}</div>
              </div>
            </a>`).join('')}
        </div>
      </div>
    </div>` : ''}

    <div class="stat-grid">
      <div class="stat-card"><div class="label">${T.statOfferten}</div><div class="value">${offeneOfferten.length}</div></div>
      <div class="stat-card"><div class="label">${T.statAuftraege}</div><div class="value">${abs.length}</div></div>
      <div class="stat-card"><div class="label">${T.statRechnungen}</div><div class="value">${offeneRechnungen.length}</div></div>
      <div class="stat-card"><div class="label">${T.statBetrag}</div><div class="value">${chf(offenerBetrag)}</div></div>
    </div>

    <div class="card">
      <div class="card-header">${K.upcoming}</div>
      <div class="card-body">
        ${upcoming.length === 0 ? `<div class="text-muted" style="font-size:13px">${K.noUpcoming}</div>` : `
        <div class="notes-list">
          ${upcoming.map(t => {
            const c = customerMap.get(t.customerId);
            const meta = [c ? (c.firma || customerFullName(c)) : '', t.kommission].filter(Boolean).join(' · ');
            const time = [t.von, t.bis].filter(Boolean).join('–');
            return `<a href="#/kalender" class="note-item" style="text-decoration:none;color:inherit">
              <div>
                <div class="note-date">${[formatDateDE(t.datum), time, t.ort].filter(Boolean).map(escapeHtml).join(' · ')}</div>
                <div class="note-text" style="font-weight:600">${escapeHtml(t.titel || K.newTermin)}</div>
                ${meta ? `<div class="text-muted" style="font-size:12.5px;margin-top:2px">${escapeHtml(meta)}</div>` : ''}
              </div>
            </a>`;
          }).join('')}
        </div>`}
      </div>
    </div>

    <div class="card">
      <div class="card-header">${T.recent}</div>
      <div class="card-body">
        ${recent.length === 0 ? `<div class="empty-state"><div class="icon">📄</div>${T.emptyRecent}</div>` : `
        <table class="data">
          <thead><tr><th>${T.colType}</th><th>${T.colNumber}</th><th>${T.colCustomer}</th><th>${T.colDate}</th><th class="num">${T.colTotal}</th></tr></thead>
          <tbody>
            ${recent.map(d => {
              const totals = computeTotals(d, settings.mwstSatz);
              const c = customerMap.get(d.customerId);
              const route = d.stage === 'offerte' ? 'offerten' : d.stage === 'auftragsbestaetigung' ? 'auftragsbestaetigungen' : 'rechnungen';
              const label = d.stage === 'offerte' ? T.typeOfferte : d.stage === 'auftragsbestaetigung' ? T.typeAb : T.typeRechnung;
              return `<tr>
                <td>${label}</td>
                <td><a class="row-link" href="#/${route}/${d.id}">${escapeHtml(d.number)}</a></td>
                <td>${c ? escapeHtml(c.firma || customerFullName(c)) : '–'}</td>
                <td>${formatDateDE(d.datum)}</td>
                <td class="num">${chf(totals.total)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>
    </div>
  `;
}
