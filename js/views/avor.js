import { listAvorEntries, getAvorEntry, newAvorEntry, saveAvorEntry, deleteAvorEntry } from '../avor.js';
import { listCustomers } from '../customers.js';
import { listProjekte, saveProjekt, projektLabel } from '../projekte.js';
import { listPhotos, addPhoto, deletePhoto, listNotes, addNote, deleteNote } from '../attachments.js';
import { loadSettings } from '../settings.js';
import { escapeHtml, customerFullName, customerAddressLines, debounce } from '../utils.js';
import { openModal, confirmDialog, toast } from '../ui.js';
import { navigate } from '../router.js';
import { attachPickerSearch } from '../picker.js';
import { tr } from '../i18n.js';

function customerLabel(c) {
  if (!c) return '';
  return `${c.kundennummer ?? ''} — ${c.firma ? c.firma + ' / ' : ''}${customerFullName(c)}`.replace(/^—\s*/, '').trim();
}

export async function renderAvorList() {
  const settings = await loadSettings();
  const uiLang = settings.sprache || 'de';
  const A = tr(uiLang).avor;
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${A.title}</h1>
        <div class="subtitle">${A.subtitle}</div>
      </div>
      <div class="actions">
        <button class="btn btn-primary" id="btn-new-avor">${A.newEntry}</button>
      </div>
    </div>
    <div class="card"><div class="card-body" id="table-wrap"></div></div>
  `;

  const [entries, customers, projekte] = await Promise.all([listAvorEntries(), listCustomers(), listProjekte()]);
  const customerMap = new Map(customers.map(c => [c.id, c]));
  const projektMap = new Map(projekte.map(p => [p.id, p]));
  const wrap = document.getElementById('table-wrap');

  main.querySelector('#btn-new-avor').addEventListener('click', () => openNewEntryModal(uiLang, customers, projekte));

  if (!entries.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="icon">🗒️</div>${A.emptyState}</div>`;
    return;
  }

  const counts = await Promise.all(entries.map(async e => ({
    id: e.id,
    photos: (await listPhotos(e.id)).length,
    notes: (await listNotes(e.id)).length,
  })));
  const countMap = new Map(counts.map(c => [c.id, c]));

  wrap.innerHTML = `
    <table class="data">
      <thead><tr>
        <th>${A.colKunde}</th><th>${A.colProjekt}</th><th>${A.colCounts}</th><th>${A.colUpdated}</th><th></th>
      </tr></thead>
      <tbody>
        ${entries.map(e => {
          const c = customerMap.get(e.customerId);
          const p = projektMap.get(e.projektId);
          const cnt = countMap.get(e.id) || { photos: 0, notes: 0 };
          return `
          <tr>
            <td><a href="#/avor/${e.id}" class="row-link">${c ? escapeHtml(c.firma || customerFullName(c)) : `<span class="text-muted">${A.noCustomerOptional}</span>`}</a></td>
            <td>${escapeHtml(p ? p.name : (e.kommission || ''))}</td>
            <td class="text-muted">${A.countsLabel(cnt.photos, cnt.notes)}</td>
            <td>${new Date(e.updatedAt).toLocaleString(uiLang === 'fr' ? 'fr-CH' : 'de-CH')}</td>
            <td style="text-align:right"><button class="btn btn-sm" data-del="${e.id}">${tr(uiLang).common.delete}</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  wrap.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', async () => {
    const ok = await confirmDialog(A.deleteEntryConfirm, { lang: uiLang });
    if (!ok) return;
    await deleteAvorEntry(el.dataset.del);
    toast(A.deletedToast);
    renderAvorList();
  }));
}

function openNewEntryModal(uiLang, customers, projekte) {
  const A = tr(uiLang).avor;
  let selectedCustomerId = null;
  let selectedProjektId = null;
  const customerMap = new Map(customers.map(c => [c.id, c]));
  const close = openModal({
    title: A.newModalTitle,
    width: '520px',
    bodyHtml: `
      <div class="form-grid cols-1">
        <div class="field">
          <label>${A.fieldKunde}</label>
          <div class="picker">
            <input id="avor-customer-search" placeholder="${A.customerSearchPlaceholder}" autocomplete="off">
            <div id="avor-customer-results" class="picker-results" style="display:none"></div>
          </div>
        </div>
        <div class="field">
          <label>${A.fieldProjekt}</label>
          <div class="picker">
            <input id="avor-projekt-search" placeholder="${A.projektSearchPlaceholder}" autocomplete="off">
            <div id="avor-projekt-results" class="picker-results" style="display:none"></div>
          </div>
        </div>
      </div>`,
    footerHtml: `
      <button class="btn" data-cancel>${tr(uiLang).common.cancel}</button>
      <button class="btn btn-primary" data-save>${tr(uiLang).common.save}</button>`,
    onMount: (root, closeFn) => {
      root.querySelector('[data-cancel]').addEventListener('click', closeFn);
      const input = root.querySelector('#avor-customer-search');
      const results = root.querySelector('#avor-customer-results');
      input.addEventListener('input', debounce(() => {
        const term = input.value.trim().toLowerCase();
        if (!term) { results.style.display = 'none'; return; }
        const matches = customers.filter(c => customerLabel(c).toLowerCase().includes(term)).slice(0, 8);
        results.innerHTML = matches.length
          ? matches.map(c => `<div class="item" role="button" tabindex="0" data-id="${c.id}">${escapeHtml(customerLabel(c))}<div class="meta">${escapeHtml(c.adresse || '')} ${escapeHtml(c.plzOrt || '')}</div></div>`).join('')
          : `<div class="empty">${A.noCustomerFound}</div>`;
        results.style.display = 'block';
        results.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => {
          selectedCustomerId = el.dataset.id;
          input.value = customerLabel(customers.find(c => c.id === selectedCustomerId));
          results.style.display = 'none';
        }));
      }, 150));
      attachPickerSearch({
        input: root.querySelector('#avor-projekt-search'),
        results: root.querySelector('#avor-projekt-results'),
        items: projekte,
        labelFn: (p) => escapeHtml(projektLabel(p, customerMap)),
        matchFn: (p, term) => (p.name || '').toLowerCase().includes(term.toLowerCase()),
        onSelect: (p) => { selectedProjektId = p.id; root.querySelector('#avor-projekt-search').value = projektLabel(p, customerMap); },
        onCreate: async (name) => {
          const created = await saveProjekt({ name, status: 'aktiv', customerId: selectedCustomerId || null });
          projekte.push(created);
          return created;
        },
        createLabel: A.createProjektOption,
        emptyLabel: A.noProjektFound,
      });
      root.querySelector('[data-save]').addEventListener('click', async () => {
        const entry = await newAvorEntry({ customerId: selectedCustomerId, projektId: selectedProjektId });
        toast(A.createdToast, 'success');
        closeFn();
        navigate(`/avor/${entry.id}`);
      });
    },
  });
  return close;
}

export async function renderAvorDetail(id) {
  const main = document.getElementById('main');
  main.innerHTML = `<div class="empty-state">…</div>`;

  const [entry, customers, projekte, settings] = await Promise.all([getAvorEntry(id), listCustomers(), listProjekte(), loadSettings()]);
  const uiLang = settings.sprache || 'de';
  const A = tr(uiLang).avor;
  const AT = tr(uiLang).attachments;

  if (!entry) {
    main.innerHTML = `<div class="empty-state"><div class="icon">🤔</div>404</div>`;
    return;
  }

  const customerMap = new Map(customers.map(c => [c.id, c]));
  const projektMap = new Map(projekte.map(p => [p.id, p]));
  let saveTimer = null;

  const currentProjektName = () => {
    const p = projektMap.get(entry.projektId);
    return p ? p.name : (entry.kommission || '');
  };

  main.innerHTML = `
    <div class="page-header">
      <div>
        <a href="#/avor" class="text-muted" style="font-size:13px;text-decoration:none">${A.backToList}</a>
        <h1 style="margin-top:6px">${escapeHtml(currentProjektName() || A.title)}</h1>
      </div>
      <div class="actions">
        <button class="btn btn-danger" id="btn-delete-entry">${tr(uiLang).common.delete}</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">${A.fieldKunde} &amp; ${A.fieldProjekt}</div>
      <div class="card-body">
        <div class="form-grid">
          <div class="field">
            <label>${A.fieldKunde}</label>
            <div class="picker">
              <input id="avor-customer-search" placeholder="${A.customerSearchPlaceholder}" value="${entry.customerId && customerMap.has(entry.customerId) ? escapeHtml(customerLabel(customerMap.get(entry.customerId))) : ''}" autocomplete="off">
              <div id="avor-customer-results" class="picker-results" style="display:none"></div>
            </div>
            <div id="avor-customer-preview" style="margin-top:8px"></div>
          </div>
          <div class="field">
            <label>${A.fieldProjekt}</label>
            <div class="picker">
              <input id="avor-projekt-search" placeholder="${A.projektSearchPlaceholder}" value="${entry.projektId && projektMap.has(entry.projektId) ? escapeHtml(projektLabel(projektMap.get(entry.projektId), customerMap)) : escapeHtml(entry.kommission || '')}" autocomplete="off">
              <div id="avor-projekt-results" class="picker-results" style="display:none"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">${AT.photosLabel}</div>
      <div class="card-body">
        <div id="dropzone" class="dropzone">
          <div class="dropzone-hint">${A.dropHint}</div>
          <input type="file" id="photo-input" accept="image/*" multiple style="display:none">
        </div>
        <div id="photo-grid" class="photo-grid"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">${AT.notesLabel}</div>
      <div class="card-body">
        <div id="notes-list" class="notes-list"></div>
        <div class="note-add-row">
          <textarea id="note-input" rows="2" placeholder="${AT.notePlaceholder}"></textarea>
          <button class="btn btn-primary btn-sm" id="btn-add-note">${AT.addNote}</button>
        </div>
      </div>
    </div>
  `;

  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await saveAvorEntry(entry);
      toast(A.savedToast);
    }, 500);
  }

  // --- Kunde ---
  renderCustomerPreview();
  const custInput = main.querySelector('#avor-customer-search');
  const custResults = main.querySelector('#avor-customer-results');
  custInput.addEventListener('input', debounce(() => {
    const term = custInput.value.trim().toLowerCase();
    if (!term) { custResults.style.display = 'none'; return; }
    const matches = customers.filter(c => customerLabel(c).toLowerCase().includes(term)).slice(0, 8);
    custResults.innerHTML = matches.length
      ? matches.map(c => `<div class="item" role="button" tabindex="0" data-id="${c.id}">${escapeHtml(customerLabel(c))}<div class="meta">${escapeHtml(c.adresse || '')} ${escapeHtml(c.plzOrt || '')}</div></div>`).join('')
      : `<div class="empty">${A.noCustomerFound}</div>`;
    custResults.style.display = 'block';
    custResults.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => {
      entry.customerId = el.dataset.id;
      custInput.value = customerLabel(customerMap.get(entry.customerId));
      custResults.style.display = 'none';
      renderCustomerPreview();
      queueSave();
    }));
  }, 150));
  document.addEventListener('click', (e) => {
    if (!custResults.contains(e.target) && e.target !== custInput) custResults.style.display = 'none';
  });

  function renderCustomerPreview() {
    const c = customerMap.get(entry.customerId);
    const box = main.querySelector('#avor-customer-preview');
    if (!box) return;
    if (!c) { box.innerHTML = ''; return; }
    box.innerHTML = `<div style="font-size:13px;color:var(--ink-soft);line-height:1.5">${customerAddressLines(c).map(l => escapeHtml(l)).join('<br>')}</div>`;
  }

  attachPickerSearch({
    input: main.querySelector('#avor-projekt-search'),
    results: main.querySelector('#avor-projekt-results'),
    items: projekte,
    labelFn: (p) => escapeHtml(projektLabel(p, customerMap)),
    matchFn: (p, term) => (p.name || '').toLowerCase().includes(term.toLowerCase()),
    onSelect: (p) => {
      entry.projektId = p.id;
      main.querySelector('#avor-projekt-search').value = projektLabel(p, customerMap);
      main.querySelector('h1').textContent = currentProjektName() || A.title;
      queueSave();
    },
    onCreate: async (name) => {
      const created = await saveProjekt({ name, status: 'aktiv', customerId: entry.customerId || null });
      projekte.push(created);
      projektMap.set(created.id, created);
      return created;
    },
    createLabel: A.createProjektOption,
    emptyLabel: A.noProjektFound,
  });

  main.querySelector('#btn-delete-entry').addEventListener('click', async () => {
    const ok = await confirmDialog(A.deleteEntryConfirm, { lang: uiLang });
    if (!ok) return;
    await deleteAvorEntry(entry.id);
    toast(A.deletedToast);
    navigate('/avor');
  });

  // --- Fotos (Drag & Drop + Auswahl) ---
  const dropzone = main.querySelector('#dropzone');
  const photoInput = main.querySelector('#photo-input');
  dropzone.addEventListener('click', () => photoInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
    await handlePhotoFiles(files);
  });
  photoInput.addEventListener('change', async () => {
    const files = Array.from(photoInput.files || []);
    await handlePhotoFiles(files);
    photoInput.value = '';
  });

  async function handlePhotoFiles(files) {
    for (const file of files) {
      await addPhoto(entry.id, file);
    }
    if (files.length) toast(AT.photoAddedToast, 'success');
    renderPhotos();
  }

  async function renderPhotos() {
    const grid = main.querySelector('#photo-grid');
    const photos = await listPhotos(entry.id);
    if (!photos.length) {
      grid.innerHTML = `<div class="text-muted" style="font-size:13px;margin-top:8px">${AT.noPhotos}</div>`;
      return;
    }
    grid.innerHTML = photos.map(p => `<div class="photo-thumb" data-open="${p.id}"><img src="${p.dataUrl}" alt=""><button class="photo-del" data-del-photo="${p.id}" title="${tr(uiLang).common.delete}">✕</button></div>`).join('');
    grid.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', (e) => {
      if (e.target.closest('[data-del-photo]')) return;
      const photo = photos.find(p => p.id === el.dataset.open);
      openLightbox(photo.dataUrl);
    }));
    grid.querySelectorAll('[data-del-photo]').forEach(el => el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog(AT.deletePhotoConfirm, { lang: uiLang });
      if (!ok) return;
      await deletePhoto(el.dataset.delPhoto);
      toast(AT.photoDeletedToast);
      renderPhotos();
    }));
  }

  function openLightbox(url) {
    const root = document.getElementById('modal-root');
    const backdrop = document.createElement('div');
    backdrop.className = 'lightbox-backdrop';
    backdrop.innerHTML = `<button class="lightbox-close">&times;</button><img src="${url}" alt="">`;
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    backdrop.querySelector('.lightbox-close').addEventListener('click', close);
    root.appendChild(backdrop);
  }

  // --- Notizen ---
  main.querySelector('#btn-add-note').addEventListener('click', async () => {
    const textarea = main.querySelector('#note-input');
    const text = textarea.value.trim();
    if (!text) return;
    await addNote(entry.id, text);
    textarea.value = '';
    toast(AT.noteAddedToast, 'success');
    renderNotes();
  });

  async function renderNotes() {
    const list = main.querySelector('#notes-list');
    const notes = await listNotes(entry.id);
    if (!notes.length) {
      list.innerHTML = `<div class="text-muted" style="font-size:13px">${AT.noNotes}</div>`;
      return;
    }
    list.innerHTML = notes.map(n => `
      <div class="note-item">
        <div>
          <div class="note-date">${new Date(n.createdAt).toLocaleString(uiLang === 'fr' ? 'fr-CH' : 'de-CH')}</div>
          <div class="note-text">${escapeHtml(n.text)}</div>
        </div>
        <button class="btn btn-sm note-del" data-del-note="${n.id}">${tr(uiLang).common.delete}</button>
      </div>`).join('');
    list.querySelectorAll('[data-del-note]').forEach(el => el.addEventListener('click', async () => {
      const ok = await confirmDialog(AT.deleteNoteConfirm, { lang: uiLang });
      if (!ok) return;
      await deleteNote(el.dataset.delNote);
      toast(AT.noteDeletedToast);
      renderNotes();
    }));
  }

  renderPhotos();
  renderNotes();
}
