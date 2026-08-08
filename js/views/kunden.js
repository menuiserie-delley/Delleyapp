import { listCustomers, saveCustomer, deleteCustomer, customerMatches } from '../customers.js';
import { escapeHtml, customerFullName } from '../utils.js';
import { openModal, confirmDialog, toast } from '../ui.js';
import { loadSettings } from '../settings.js';
import { tr } from '../i18n.js';

let searchTerm = '';

export async function renderKundenList() {
  const settings = await loadSettings();
  const lang = settings.sprache || 'de';
  const T = tr(lang).customers;
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${T.title}</h1>
        <div class="subtitle">${T.subtitle}</div>
      </div>
      <div class="actions">
        <input id="search" type="search" placeholder="${tr(lang).common.search}" style="width:220px" value="${escapeHtml(searchTerm)}">
        <button class="btn btn-primary" id="btn-new">${T.newButton}</button>
      </div>
    </div>
    <div class="card"><div class="card-body" id="table-wrap"></div></div>
  `;

  main.querySelector('#btn-new').addEventListener('click', () => openCustomerForm(lang, null, renderKundenList));
  const searchInput = main.querySelector('#search');
  searchInput.addEventListener('input', () => { searchTerm = searchInput.value; renderTable(); });
  searchInput.focus();
  searchInput.setSelectionRange(searchTerm.length, searchTerm.length);

  await renderTable();

  async function renderTable() {
    const all = await listCustomers();
    const filtered = all.filter(c => customerMatches(c, searchTerm));
    const wrap = document.getElementById('table-wrap');
    if (!wrap) return;
    if (filtered.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="icon">👤</div>${T.emptyState}</div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="data">
        <thead><tr>
          <th>${T.colNr}</th><th>${T.colName}</th><th>${T.colAddress}</th><th>${T.colPhone}</th><th>${T.colEmail}</th><th></th>
        </tr></thead>
        <tbody>
          ${filtered.map(c => `
            <tr data-id="${c.id}">
              <td>${c.kundennummer ?? ''}</td>
              <td><a href="#" class="row-link" data-edit="${c.id}">${escapeHtml(c.firma ? c.firma : customerFullName(c))}</a>${c.firma ? `<div class="text-muted" style="font-size:12px">${escapeHtml(customerFullName(c))}</div>` : ''}</td>
              <td>${escapeHtml(c.adresse || '')}${c.adresse && c.plzOrt ? ', ' : ''}${escapeHtml(c.plzOrt || '')}</td>
              <td>${escapeHtml(c.telefon || '')}</td>
              <td>${escapeHtml(c.email || '')}</td>
              <td style="text-align:right"><button class="btn btn-sm" data-del="${c.id}">${tr(lang).common.delete}</button></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    wrap.querySelectorAll('[data-edit]').forEach(el => el.addEventListener('click', (e) => {
      e.preventDefault();
      const c = all.find(x => x.id === el.dataset.edit);
      openCustomerForm(lang, c, renderKundenList);
    }));
    wrap.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', async () => {
      const ok = await confirmDialog(T.deleteConfirm, { lang });
      if (!ok) return;
      await deleteCustomer(el.dataset.del);
      toast(T.deletedToast);
      renderTable();
    }));
  }
}

export function openCustomerForm(lang, customer, onSaved) {
  const T = tr(lang).customers;
  const c = customer || { anrede: 'Herr' };
  const close = openModal({
    title: customer ? T.modalEditTitle : T.modalNewTitle,
    width: '600px',
    bodyHtml: `
      <form id="customer-form">
        <div class="form-grid">
          <div class="field">
            <label>${T.fieldAnrede}</label>
            <select name="anrede">
              ${['Herr', 'Frau', 'Firma', 'Divers'].map(a => `<option value="${a}" ${c.anrede === a ? 'selected' : ''}>${T.anrede[a]}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>${T.fieldFirma} (${tr(lang).common.optional})</label>
            <input name="firma" value="${escapeHtml(c.firma || '')}">
          </div>
          <div class="field">
            <label>${T.fieldVorname}</label>
            <input name="vorname" value="${escapeHtml(c.vorname || '')}">
          </div>
          <div class="field">
            <label>${T.fieldNachname}</label>
            <input name="nachname" value="${escapeHtml(c.nachname || '')}" required>
          </div>
          <div class="field span-2">
            <label>${T.fieldAdresse}</label>
            <input name="adresse" value="${escapeHtml(c.adresse || '')}" placeholder="${T.fieldAdresseHint}">
          </div>
          <div class="field">
            <label>${T.fieldPlzOrt}</label>
            <input name="plzOrt" value="${escapeHtml(c.plzOrt || '')}" placeholder="${T.fieldPlzOrtHint}">
          </div>
          <div class="field">
            <label>${T.fieldTelefon}</label>
            <input name="telefon" value="${escapeHtml(c.telefon || '')}">
          </div>
          <div class="field span-2">
            <label>${T.fieldEmail}</label>
            <input name="email" type="email" value="${escapeHtml(c.email || '')}">
          </div>
        </div>
      </form>`,
    footerHtml: `
      <button class="btn" data-cancel>${tr(lang).common.cancel}</button>
      <button class="btn btn-primary" data-save>${tr(lang).common.save}</button>`,
    onMount: (root, closeFn) => {
      root.querySelector('[data-cancel]').addEventListener('click', closeFn);
      root.querySelector('[data-save]').addEventListener('click', async () => {
        const form = root.querySelector('#customer-form');
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        const updated = { ...c };
        for (const [k, v] of fd.entries()) updated[k] = v;
        await saveCustomer(updated);
        toast(T.savedToast, 'success');
        closeFn();
        if (onSaved) onSaved(updated);
      });
    },
  });
  return close;
}
