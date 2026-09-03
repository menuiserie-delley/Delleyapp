import { listAusgaben, saveAusgabe, deleteAusgabe } from '../ausgaben.js';
import { listProjekte, saveProjekt, projektLabel } from '../projekte.js';
import { listCustomers } from '../customers.js';
import { listBelege, addBeleg, deleteBeleg, BelegTooLargeError } from '../attachments.js';
import { loadSettings } from '../settings.js';
import { escapeHtml, chf, todayISO, formatDateDE } from '../utils.js';
import { openModal, confirmDialog, toast } from '../ui.js';
import { attachPickerSearch } from '../picker.js';
import { tr } from '../i18n.js';

export async function renderAusgabenList() {
  const settings = await loadSettings();
  const lang = settings.sprache || 'de';
  const T = tr(lang).ausgaben;
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${T.title}</h1>
        <div class="subtitle">${T.subtitle}</div>
      </div>
      <div class="actions">
        <button class="btn btn-primary" id="btn-new">${T.newButton}</button>
      </div>
    </div>
    <div class="card"><div class="card-body" id="table-wrap"></div></div>
  `;

  const [projekte, customers] = await Promise.all([listProjekte(), listCustomers()]);
  const customerMap = new Map(customers.map(c => [c.id, c]));
  const projektMap = new Map(projekte.map(p => [p.id, p]));

  main.querySelector('#btn-new').addEventListener('click', () => openAusgabeForm(lang, null, projekte, customerMap, renderAusgabenList));

  await renderTable();

  async function renderTable() {
    const all = await listAusgaben();
    const wrap = document.getElementById('table-wrap');
    if (!wrap) return;
    if (!all.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="icon">🧾</div>${T.emptyState}</div>`;
      return;
    }
    const total = all.reduce((s, a) => s + (Number(a.betrag) || 0), 0);
    wrap.innerHTML = `
      <table class="data">
        <thead><tr><th>${T.colDatum}</th><th>${T.colBeschreibung}</th><th>${T.colProjekt}</th><th class="num">${T.colBetrag}</th><th></th></tr></thead>
        <tbody>
          ${all.map(a => {
            const p = projektMap.get(a.projektId);
            return `<tr>
              <td>${formatDateDE(a.datum)}</td>
              <td><a href="#" class="row-link" data-edit="${a.id}">${escapeHtml(a.beschreibung || '')}</a></td>
              <td>${p ? `<a href="#/projekte/${p.id}" class="row-link">${escapeHtml(p.name)}</a>` : `<span class="text-muted">${T.noProjektLinked}</span>`}</td>
              <td class="num">${chf(a.betrag)}</td>
              <td style="text-align:right"><button class="btn btn-sm" data-del="${a.id}">${tr(lang).common.delete}</button></td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="3" style="text-align:right;font-weight:600">${T.totalLabel}</td><td class="num" style="font-weight:600">${chf(total)}</td><td></td></tr>
        </tfoot>
      </table>`;
    wrap.querySelectorAll('[data-edit]').forEach(el => el.addEventListener('click', (e) => {
      e.preventDefault();
      const a = all.find(x => x.id === el.dataset.edit);
      openAusgabeForm(lang, a, projekte, customerMap, renderAusgabenList);
    }));
    wrap.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', async () => {
      const ok = await confirmDialog(T.deleteConfirm, { lang });
      if (!ok) return;
      await deleteAusgabe(el.dataset.del);
      toast(T.deletedToast);
      renderTable();
    }));
  }
}

function openAusgabeForm(lang, ausgabe, projekte, customerMap, onSaved) {
  const T = tr(lang).ausgaben;
  const a = ausgabe || { datum: todayISO(), betrag: 0 };
  let selectedProjektId = a.projektId || null;
  const projektMap = new Map(projekte.map(p => [p.id, p]));

  const close = openModal({
    title: ausgabe ? T.modalEditTitle : T.modalNewTitle,
    width: '520px',
    bodyHtml: `
      <form id="ausgabe-form">
        <div class="form-grid">
          <div class="field">
            <label>${T.fieldDatum}</label>
            <input id="ag-datum" type="date" value="${a.datum || todayISO()}">
          </div>
          <div class="field">
            <label>${T.fieldBetrag}</label>
            <input id="ag-betrag" type="number" step="0.01" min="0.01" required value="${Number(a.betrag) || ''}">
          </div>
          <div class="field span-2">
            <label>${T.fieldBeschreibung}</label>
            <input id="ag-beschreibung" required value="${escapeHtml(a.beschreibung || '')}" placeholder="${T.beschreibungPlaceholder}">
          </div>
          <div class="field span-2">
            <label>${T.fieldProjekt}</label>
            <div class="picker">
              <input id="ag-projekt-search" required placeholder="${T.projektSearchPlaceholder}" value="${selectedProjektId && projektMap.has(selectedProjektId) ? escapeHtml(projektLabel(projektMap.get(selectedProjektId), customerMap)) : ''}" autocomplete="off">
              <div id="ag-projekt-results" class="picker-results" style="display:none"></div>
            </div>
          </div>
        </div>
      </form>
      <div class="card-header" style="padding:0;margin:18px 0 8px;border:none;font-weight:600">${T.cardBeleg}</div>
      ${ausgabe ? `
        <div id="beleg-dropzone" class="dropzone">
          <div class="dropzone-hint">${T.belegDropHint}</div>
          <input type="file" id="beleg-input" accept="image/*,application/pdf" multiple style="display:none">
        </div>
        <div id="beleg-list" style="margin-top:10px"></div>
      ` : `<p class="text-muted" style="font-size:13px;margin:0">${T.saveFirstHint}</p>`}`,
    footerHtml: `
      ${ausgabe ? `<button class="btn btn-danger" data-delete style="margin-right:auto">${tr(lang).common.delete}</button>` : ''}
      <button class="btn" data-cancel>${tr(lang).common.cancel}</button>
      <button class="btn btn-primary" data-save>${tr(lang).common.save}</button>`,
    onMount: (root, closeFn) => {
      root.querySelector('[data-cancel]').addEventListener('click', closeFn);
      attachPickerSearch({
        input: root.querySelector('#ag-projekt-search'),
        results: root.querySelector('#ag-projekt-results'),
        items: projekte,
        labelFn: (p) => escapeHtml(projektLabel(p, customerMap)),
        matchFn: (p, term) => (p.name || '').toLowerCase().includes(term.toLowerCase()),
        onSelect: (p) => { selectedProjektId = p.id; root.querySelector('#ag-projekt-search').value = projektLabel(p, customerMap); },
        onCreate: async (name) => {
          const created = await saveProjekt({ name, status: 'aktiv', customerId: null });
          projekte.push(created);
          projektMap.set(created.id, created);
          return created;
        },
        createLabel: T.createProjektOption,
        emptyLabel: T.noProjektFound,
      });

      if (ausgabe) {
        const dropzone = root.querySelector('#beleg-dropzone');
        const belegInput = root.querySelector('#beleg-input');
        dropzone.addEventListener('click', () => belegInput.click());
        dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
        dropzone.addEventListener('drop', async (e) => {
          e.preventDefault();
          dropzone.classList.remove('drag-over');
          await handleBelegFiles(Array.from(e.dataTransfer.files || []));
        });
        belegInput.addEventListener('change', async () => {
          await handleBelegFiles(Array.from(belegInput.files || []));
          belegInput.value = '';
        });

        async function handleBelegFiles(files) {
          let addedCount = 0;
          for (const file of files) {
            try {
              await addBeleg(a.id, file);
              addedCount += 1;
            } catch (err) {
              if (err instanceof BelegTooLargeError) toast(T.belegTooLargeError, 'error');
              else throw err;
            }
          }
          if (addedCount) toast(T.belegAddedToast, 'success');
          renderBelege();
        }

        async function renderBelege() {
          const box = root.querySelector('#beleg-list');
          if (!box) return;
          const belege = await listBelege(a.id);
          if (!belege.length) {
            box.innerHTML = `<div class="text-muted" style="font-size:13px">${T.noBelege}</div>`;
            return;
          }
          box.innerHTML = belege.map((b) => b.mime === 'application/pdf'
            ? `<div class="note-item">
                <div class="note-text">📄 ${escapeHtml(b.filename)}</div>
                <div style="display:flex;align-items:center;gap:10px">
                  <a href="${b.dataUrl}" target="_blank" rel="noopener" class="btn btn-sm">${T.belegOpenLabel}</a>
                  <button class="btn btn-sm" data-del-beleg="${b.id}">${tr(lang).common.delete}</button>
                </div>
              </div>`
            : `<div class="photo-thumb" data-open-beleg="${b.id}" style="display:inline-block;margin:0 8px 8px 0">
                <img src="${b.dataUrl}" alt="" style="width:90px;height:90px;object-fit:cover;border-radius:6px">
                <button class="photo-del" data-del-beleg="${b.id}" title="${tr(lang).common.delete}">✕</button>
              </div>`).join('');
          box.querySelectorAll('[data-open-beleg]').forEach((el) => el.addEventListener('click', (e) => {
            if (e.target.closest('[data-del-beleg]')) return;
            const b = belege.find((x) => x.id === el.dataset.openBeleg);
            if (b) window.open(b.dataUrl, '_blank', 'noopener');
          }));
          // Kein confirmDialog hier: der teilt sich #modal-root mit diesem Formular-Modal
          // und würde es beim Öffnen/Schliessen unterbrechen. Ein Beleg ist unkritisch
          // (jederzeit neu hochladbar) — daher direktes Löschen ohne Rückfrage.
          box.querySelectorAll('[data-del-beleg]').forEach((el) => el.addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteBeleg(el.dataset.delBeleg);
            toast(T.belegDeletedToast);
            renderBelege();
          }));
        }
        renderBelege();

        root.querySelector('[data-delete]').addEventListener('click', async () => {
          const ok = await confirmDialog(T.deleteConfirm, { lang });
          if (!ok) return;
          await deleteAusgabe(a.id);
          toast(T.deletedToast);
          closeFn();
          onSaved();
        });
      }
      root.querySelector('[data-save]').addEventListener('click', async () => {
        const form = root.querySelector('#ausgabe-form');
        if (!form.reportValidity()) return;
        const beschreibung = root.querySelector('#ag-beschreibung').value.trim();
        const betrag = Number(root.querySelector('#ag-betrag').value) || 0;
        if (!selectedProjektId) { root.querySelector('#ag-projekt-search').focus(); return; }
        const updated = {
          ...a,
          datum: root.querySelector('#ag-datum').value || todayISO(),
          beschreibung,
          betrag,
          projektId: selectedProjektId,
        };
        await saveAusgabe(updated);
        toast(T.savedToast, 'success');
        closeFn();
        onSaved();
      });
    },
  });
  return close;
}
