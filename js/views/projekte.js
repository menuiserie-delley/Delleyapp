import { listProjekte, getProjekt, saveProjekt, deleteProjekt, projektMatches } from '../projekte.js';
import { listCustomers } from '../customers.js';
import { listAusgabenByProjekt, saveAusgabe, deleteAusgabe } from '../ausgaben.js';
import { getAll } from '../db.js';
import { computeTotals } from '../documents.js';
import { listTermine } from '../termine.js';
import { listAvorEntries } from '../avor.js';
import { loadSettings } from '../settings.js';
import { escapeHtml, customerFullName, chf, todayISO, formatDateDE } from '../utils.js';
import { openModal, confirmDialog, toast } from '../ui.js';
import { navigate } from '../router.js';
import { attachPickerSearch } from '../picker.js';
import { tr } from '../i18n.js';

let searchTerm = '';

function customerLabel(c) {
  if (!c) return '';
  return `${c.kundennummer ?? ''} — ${c.firma ? c.firma + ' / ' : ''}${customerFullName(c)}`.replace(/^—\s*/, '').trim();
}

export async function renderProjekteList() {
  const settings = await loadSettings();
  const lang = settings.sprache || 'de';
  const T = tr(lang).projekte;
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

  const customers = await listCustomers();
  const customerMap = new Map(customers.map(c => [c.id, c]));

  main.querySelector('#btn-new').addEventListener('click', () => openProjektForm(lang, null, customers, renderProjekteList));
  const searchInput = main.querySelector('#search');
  searchInput.addEventListener('input', () => { searchTerm = searchInput.value; renderTable(); });
  searchInput.focus();
  searchInput.setSelectionRange(searchTerm.length, searchTerm.length);

  await renderTable();

  async function renderTable() {
    const all = await listProjekte();
    const filtered = all.filter(p => projektMatches(p, searchTerm));
    const wrap = document.getElementById('table-wrap');
    if (!wrap) return;
    if (filtered.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="icon">📁</div>${T.emptyState}</div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="data">
        <thead><tr><th>${T.colName}</th><th>${T.colKunde}</th><th>${T.colStatus}</th><th></th></tr></thead>
        <tbody>
          ${filtered.map(p => {
            const c = customerMap.get(p.customerId);
            return `<tr>
              <td><a href="#/projekte/${p.id}" class="row-link">${escapeHtml(p.name)}</a></td>
              <td>${c ? escapeHtml(c.firma || customerFullName(c)) : '<span class="text-muted">—</span>'}</td>
              <td>${p.status === 'abgeschlossen' ? T.statusAbgeschlossen : T.statusAktiv}</td>
              <td style="text-align:right"><button class="btn btn-sm" data-del="${p.id}">${tr(lang).common.delete}</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
    wrap.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', async () => {
      const ok = await confirmDialog(T.deleteConfirm, { lang });
      if (!ok) return;
      const linkedAusgaben = await listAusgabenByProjekt(el.dataset.del);
      await Promise.all(linkedAusgaben.map(a => deleteAusgabe(a.id)));
      await deleteProjekt(el.dataset.del);
      toast(T.deletedToast);
      renderTable();
    }));
  }
}

export function openProjektForm(lang, projekt, customers, onSaved) {
  const T = tr(lang).projekte;
  const p = projekt || { status: 'aktiv' };
  let selectedCustomerId = p.customerId || null;
  const customerMap = new Map(customers.map(c => [c.id, c]));

  const close = openModal({
    title: projekt ? T.modalEditTitle : T.modalNewTitle,
    width: '560px',
    bodyHtml: `
      <div class="form-grid cols-1">
        <div class="field">
          <label>${T.fieldName}</label>
          <input id="pj-name" value="${escapeHtml(p.name || '')}" placeholder="${T.namePlaceholder}">
        </div>
        <div class="field">
          <label>${T.fieldKunde}</label>
          <div class="picker">
            <input id="pj-customer-search" placeholder="${T.customerSearchPlaceholder}" value="${selectedCustomerId && customerMap.has(selectedCustomerId) ? escapeHtml(customerLabel(customerMap.get(selectedCustomerId))) : ''}" autocomplete="off">
            <div id="pj-customer-results" class="picker-results" style="display:none"></div>
          </div>
        </div>
        <div class="field">
          <label>${T.fieldStatus}</label>
          <select id="pj-status">
            <option value="aktiv" ${p.status !== 'abgeschlossen' ? 'selected' : ''}>${T.statusAktiv}</option>
            <option value="abgeschlossen" ${p.status === 'abgeschlossen' ? 'selected' : ''}>${T.statusAbgeschlossen}</option>
          </select>
        </div>
        <div class="field">
          <label>${T.fieldNotiz}</label>
          <textarea id="pj-notiz" rows="2">${escapeHtml(p.notiz || '')}</textarea>
        </div>
      </div>`,
    footerHtml: `
      <button class="btn" data-cancel>${tr(lang).common.cancel}</button>
      <button class="btn btn-primary" data-save>${tr(lang).common.save}</button>`,
    onMount: (root, closeFn) => {
      root.querySelector('[data-cancel]').addEventListener('click', closeFn);
      attachPickerSearch({
        input: root.querySelector('#pj-customer-search'),
        results: root.querySelector('#pj-customer-results'),
        items: customers,
        labelFn: (c) => escapeHtml(customerLabel(c)),
        metaFn: (c) => escapeHtml([c.adresse, c.plzOrt].filter(Boolean).join(' ')),
        matchFn: (c, term) => customerLabel(c).toLowerCase().includes(term.toLowerCase()),
        onSelect: (c) => { selectedCustomerId = c.id; root.querySelector('#pj-customer-search').value = customerLabel(c); },
        emptyLabel: T.noCustomerFound,
      });
      root.querySelector('[data-save]').addEventListener('click', async () => {
        const nameInput = root.querySelector('#pj-name');
        const name = nameInput.value.trim();
        if (!name) { nameInput.focus(); return; }
        const updated = {
          ...p,
          name,
          customerId: selectedCustomerId,
          status: root.querySelector('#pj-status').value,
          notiz: root.querySelector('#pj-notiz').value.trim(),
        };
        const saved = await saveProjekt(updated);
        toast(T.savedToast, 'success');
        closeFn();
        if (onSaved) onSaved(saved);
      });
    },
  });
  return close;
}

export async function renderProjektDetail(id) {
  const main = document.getElementById('main');
  main.innerHTML = `<div class="empty-state">…</div>`;

  const [projekt, customers, settings] = await Promise.all([getProjekt(id), listCustomers(), loadSettings()]);
  const lang = settings.sprache || 'de';
  const T = tr(lang).projekte;
  const DT = tr(lang).documents;

  if (!projekt) {
    main.innerHTML = `<div class="empty-state"><div class="icon">🤔</div>404</div>`;
    return;
  }
  const customerMap = new Map(customers.map(c => [c.id, c]));

  const [ausgaben, allDocs, allTermine, allAvor] = await Promise.all([
    listAusgabenByProjekt(id),
    getAll('documents'),
    listTermine(),
    listAvorEntries(),
  ]);
  const dokumente = allDocs.filter(d => d.projektId === id).sort((a, b) => (b.number || '').localeCompare(a.number || ''));
  const termine = allTermine.filter(t => t.projektId === id).sort((a, b) => (a.datum || '').localeCompare(b.datum || ''));
  const notizen = allAvor.filter(e => e.projektId === id);

  const ausgabenTotal = ausgaben.reduce((s, a) => s + (Number(a.betrag) || 0), 0);
  const rechnungen = dokumente.filter(d => d.stage === 'rechnung');
  const rechnungTotal = rechnungen.reduce((s, d) => s + computeTotals(d, settings.mwstSatz).total, 0);
  const bezahltTotal = rechnungen.filter(d => d.status === 'bezahlt').reduce((s, d) => s + computeTotals(d, settings.mwstSatz).total, 0);
  const marge = bezahltTotal - ausgabenTotal;

  const c = customerMap.get(projekt.customerId);

  main.innerHTML = `
    <div class="page-header">
      <div>
        <a href="#/projekte" class="text-muted" style="font-size:13px;text-decoration:none">${T.backToList}</a>
        <h1 style="margin-top:6px">${escapeHtml(projekt.name)}</h1>
        <div class="subtitle">${c ? escapeHtml(c.firma || customerFullName(c)) : ''}</div>
      </div>
      <div class="actions">
        <button class="btn" id="btn-edit-projekt">${tr(lang).common.edit}</button>
        <button class="btn btn-danger" id="btn-delete-projekt">${tr(lang).common.delete}</button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="label">${T.statAusgaben}</div><div class="value">${chf(ausgabenTotal)}</div></div>
      <div class="stat-card"><div class="label">${T.statRechnungen}</div><div class="value">${chf(rechnungTotal)}</div></div>
      <div class="stat-card"><div class="label">${T.statBezahlt}</div><div class="value">${chf(bezahltTotal)}</div></div>
      <div class="stat-card"><div class="label">${T.statMarge}</div><div class="value">${chf(marge)}</div></div>
    </div>

    <div class="card">
      <div class="card-header">${T.cardAusgaben}</div>
      <div class="card-body">
        <div id="ausgaben-list"></div>
        <div class="form-grid" style="margin-top:14px;align-items:end">
          <div class="field"><label>${T.fieldDatum}</label><input id="ag-datum" type="date" value="${todayISO()}"></div>
          <div class="field span-2"><label>${T.fieldBeschreibung}</label><input id="ag-beschreibung" placeholder="${T.beschreibungPlaceholder}"></div>
          <div class="field"><label>${T.fieldBetrag}</label><input id="ag-betrag" type="number" step="0.01" min="0" value="0"></div>
          <div class="field"><button class="btn btn-primary" id="btn-add-ausgabe">${T.btnAddAusgabe}</button></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">${T.cardDokumente}</div>
      <div class="card-body" id="dokumente-list"></div>
    </div>

    <div class="card">
      <div class="card-header">${T.cardTermine}</div>
      <div class="card-body" id="termine-list"></div>
    </div>

    <div class="card">
      <div class="card-header">${T.cardNotizen}</div>
      <div class="card-body" id="notizen-list"></div>
    </div>
  `;

  function renderAusgabenList() {
    const box = main.querySelector('#ausgaben-list');
    if (!ausgaben.length) { box.innerHTML = `<div class="text-muted" style="font-size:13px">${T.noAusgaben}</div>`; return; }
    box.innerHTML = `<div class="notes-list">${ausgaben.map(a => `
      <div class="note-item">
        <div>
          <div class="note-date">${formatDateDE(a.datum)}${a.belegnummer ? ` · ${escapeHtml(a.belegnummer)}` : ''}</div>
          <div class="note-text">${escapeHtml(a.beschreibung || '')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <strong>${chf(a.betrag)}</strong>
          <button class="btn btn-sm" data-del-ausgabe="${a.id}">${tr(lang).common.delete}</button>
        </div>
      </div>`).join('')}</div>`;
    box.querySelectorAll('[data-del-ausgabe]').forEach(el => el.addEventListener('click', async () => {
      const ok = await confirmDialog(T.deleteAusgabeConfirm, { lang });
      if (!ok) return;
      await deleteAusgabe(el.dataset.delAusgabe);
      toast(T.ausgabeDeletedToast);
      renderProjektDetail(id);
    }));
  }

  function renderDokumenteList() {
    const box = main.querySelector('#dokumente-list');
    if (!dokumente.length) { box.innerHTML = `<div class="text-muted" style="font-size:13px">${T.noDokumente}</div>`; return; }
    box.innerHTML = `<table class="data"><tbody>${dokumente.map(d => {
      const totals = computeTotals(d, settings.mwstSatz);
      const route = d.stage === 'offerte' ? 'offerten' : d.stage === 'auftragsbestaetigung' ? 'auftragsbestaetigungen' : 'rechnungen';
      return `<tr>
        <td>${DT.stageLabel[d.stage]}</td>
        <td><a class="row-link" href="#/${route}/${d.id}">${escapeHtml(d.number)}</a></td>
        <td>${formatDateDE(d.datum)}</td>
        <td class="num">${chf(totals.total)}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
  }

  function renderTermineList() {
    const box = main.querySelector('#termine-list');
    if (!termine.length) { box.innerHTML = `<div class="text-muted" style="font-size:13px">${T.noTermine}</div>`; return; }
    box.innerHTML = `<div class="notes-list">${termine.map(t => `
      <a href="#/kalender" class="note-item" style="text-decoration:none;color:inherit">
        <div>
          <div class="note-date">${formatDateDE(t.datum)}${t.von ? ' · ' + escapeHtml(t.von) : ''}</div>
          <div class="note-text">${escapeHtml(t.titel || '')}</div>
        </div>
      </a>`).join('')}</div>`;
  }

  function renderNotizenList() {
    const box = main.querySelector('#notizen-list');
    if (!notizen.length) { box.innerHTML = `<div class="text-muted" style="font-size:13px">${T.noNotizen}</div>`; return; }
    box.innerHTML = `<div class="notes-list">${notizen.map(e => {
      const ec = customerMap.get(e.customerId);
      return `<a href="#/avor/${e.id}" class="note-item" style="text-decoration:none;color:inherit">
        <div>
          <div class="note-date">${new Date(e.updatedAt).toLocaleDateString(lang === 'fr' ? 'fr-CH' : 'de-CH')}</div>
          <div class="note-text">${ec ? escapeHtml(ec.firma || customerFullName(ec)) : escapeHtml(T.cardNotizen)}</div>
        </div>
      </a>`;
    }).join('')}</div>`;
  }

  main.querySelector('#btn-add-ausgabe').addEventListener('click', async () => {
    const beschreibung = main.querySelector('#ag-beschreibung').value.trim();
    const betrag = Number(main.querySelector('#ag-betrag').value) || 0;
    if (!beschreibung || betrag <= 0) return;
    const datum = main.querySelector('#ag-datum').value || todayISO();
    await saveAusgabe({ projektId: id, datum, beschreibung, betrag });
    toast(T.ausgabeSavedToast, 'success');
    renderProjektDetail(id);
  });

  main.querySelector('#btn-edit-projekt').addEventListener('click', () => {
    openProjektForm(lang, projekt, customers, () => renderProjektDetail(id));
  });
  main.querySelector('#btn-delete-projekt').addEventListener('click', async () => {
    const ok = await confirmDialog(T.deleteConfirm, { lang });
    if (!ok) return;
    await Promise.all(ausgaben.map(a => deleteAusgabe(a.id)));
    await deleteProjekt(id);
    toast(T.deletedToast);
    navigate('/projekte');
  });

  renderAusgabenList();
  renderDokumenteList();
  renderTermineList();
  renderNotizenList();
}
