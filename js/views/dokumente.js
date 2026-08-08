import {
  STAGES, listDocuments, getDocument, saveDocument, deleteDocument,
  newOfferte, nextDocumentNumber, convertDocument, findChildDocument,
  emptyItem, emptyGroupHeader, lineTotal, computeTotals, withPositionNumbers,
} from '../documents.js';
import { listCustomers } from '../customers.js';
import { listCatalog } from '../catalog.js';
import { loadSettings } from '../settings.js';
import { escapeHtml, nl2br, chf, num, todayISO, formatDateDE, addDays, customerFullName, customerAddressLines, debounce } from '../utils.js';
import { openModal, confirmDialog, toast } from '../ui.js';
import { navigate } from '../router.js';
import { generateDocumentPdf } from '../pdf.js';
import { sendDocumentMail } from '../mail.js';
import { tr, resolveText } from '../i18n.js';

function statusOptions(uiLang) {
  const S = tr(uiLang).documents.status;
  return {
    offerte: [['entwurf', S.entwurf], ['versendet', S.versendet], ['akzeptiert', S.akzeptiert], ['abgelehnt', S.abgelehnt]],
    auftragsbestaetigung: [['entwurf', S.entwurf], ['versendet', S.versendet]],
    rechnung: [['entwurf', S.entwurf], ['versendet', S.versendet], ['bezahlt', S.bezahlt]],
  };
}

export async function renderDocumentList(stage) {
  const settings = await loadSettings();
  const uiLang = settings.sprache || 'de';
  const T = tr(uiLang).documents;
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${T.stagePlural[stage]}</h1>
        <div class="subtitle">${T.listSubtitle[stage]}</div>
      </div>
      <div class="actions">
        ${stage === 'offerte' ? `<button class="btn btn-primary" id="btn-new">${T.newOfferte}</button>` : ''}
      </div>
    </div>
    <div class="card"><div class="card-body" id="table-wrap"></div></div>
  `;

  if (stage === 'offerte') {
    main.querySelector('#btn-new').addEventListener('click', createOfferte);
  }

  const [docs, customers] = await Promise.all([listDocuments(stage), listCustomers()]);
  const customerMap = new Map(customers.map(c => [c.id, c]));
  const wrap = document.getElementById('table-wrap');

  if (docs.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="icon">${stageIcon(stage)}</div>${T.emptyState(T.stagePlural[stage])}</div>`;
    return;
  }

  wrap.innerHTML = `
    <table class="data">
      <thead><tr>
        <th>${T.colNumber}</th><th>${T.colCustomer}</th><th>${T.colProjekt}</th><th>${T.colDate}</th><th class="num">${T.colTotal}</th><th>${T.colStatus}</th><th></th>
      </tr></thead>
      <tbody>
        ${docs.map(d => {
          const totals = computeTotals(d, settings.mwstSatz);
          const c = customerMap.get(d.customerId);
          return `
          <tr>
            <td><a href="#/${routeOf(stage)}/${d.id}" class="row-link">${escapeHtml(d.number)}</a></td>
            <td>${c ? escapeHtml(c.firma || customerFullName(c)) : `<span class="text-muted">${T.noCustomer}</span>`}</td>
            <td>${escapeHtml(d.projekt || '')}</td>
            <td>${formatDateDE(d.datum)}</td>
            <td class="num">${chf(totals.total)}</td>
            <td><span class="badge badge-${d.status}">${statusLabel(uiLang, stage, d.status)}</span></td>
            <td style="text-align:right"><button class="btn btn-sm" data-del="${d.id}">${tr(uiLang).common.delete}</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  wrap.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', async () => {
    const ok = await confirmDialog(T.deleteConfirm, { lang: uiLang });
    if (!ok) return;
    await deleteDocument(el.dataset.del);
    toast(T.deletedToast);
    renderDocumentList(stage);
  }));

  async function createOfferte() {
    const number = await nextDocumentNumber();
    const doc = newOfferte({ number, customerId: null, lang: uiLang });
    await saveDocument(doc);
    navigate(`/offerten/${doc.id}`);
  }
}

function stageIcon(stage) {
  return stage === 'offerte' ? '📄' : stage === 'auftragsbestaetigung' ? '✅' : '🧾';
}
function routeOf(stage) {
  return stage === 'offerte' ? 'offerten' : stage === 'auftragsbestaetigung' ? 'auftragsbestaetigungen' : 'rechnungen';
}
function statusLabel(uiLang, stage, status) {
  const found = (statusOptions(uiLang)[stage] || []).find(([v]) => v === status);
  return found ? found[1] : status;
}

// ---------------------------------------------------------------------------

export async function renderDocumentDetail(stage, id) {
  const main = document.getElementById('main');
  main.innerHTML = `<div class="empty-state">…</div>`;

  const [doc, customers, articles, services, settings] = await Promise.all([
    getDocument(id), listCustomers(), listCatalog('articles'), listCatalog('services'), loadSettings(),
  ]);

  const uiLang = settings.sprache || 'de';
  const T = tr(uiLang).documents;

  if (!doc) {
    main.innerHTML = `<div class="empty-state"><div class="icon">🤔</div>404</div>`;
    return;
  }
  // Solange die Dokumentsprache nicht explizit fixiert wurde, folgt sie automatisch
  // der aktuellen App-Sprache (verhindert, dass Dokumente "in der falschen Sprache
  // hängen bleiben", wenn man nur kurz zwischen DE/FR umgeschaltet hat).
  if (doc.lang == null) {
    doc.lang = uiLang;
  } else if (!doc.langPinned && doc.lang !== uiLang) {
    doc.lang = uiLang;
    doc.greeting = null;
    doc.intro = null;
    doc.closing = null;
    saveDocument(doc);
  }

  const STATUS_OPTIONS = statusOptions(uiLang);
  const customerMap = new Map(customers.map(c => [c.id, c]));
  let saveTimer = null;

  const [childNext, childOfferte, childAb] = await Promise.all([
    STAGES[stage].next ? findChildDocument(doc.id, STAGES[stage].next) : null,
    stage !== 'offerte' && doc.parentId ? findParentChain(doc, 'offerte') : null,
    stage === 'rechnung' ? findParentChain(doc, 'auftragsbestaetigung') : null,
  ]);

  main.innerHTML = `
    ${renderStageTrail(uiLang, stage, childOfferte, childAb, childNext)}
    <div class="page-header">
      <div>
        <h1>${T.stageLabel[stage]} ${escapeHtml(doc.number)}</h1>
        <div class="subtitle">${T.lastSaved(new Date(doc.updatedAt).toLocaleString(uiLang === 'fr' ? 'fr-CH' : 'de-CH'))}</div>
      </div>
      <div class="actions">
        <select id="status-select">
          ${(STATUS_OPTIONS[stage] || []).map(([v, l]) => `<option value="${v}" ${doc.status === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button class="btn" id="btn-pdf">${T.btnPdf}</button>
        <button class="btn" id="btn-mail">${T.btnMail}</button>
        ${STAGES[stage].next ? `<button class="btn btn-primary" id="btn-convert" ${childNext ? 'disabled' : ''}>${convertLabel(uiLang, stage)}</button>` : ''}
        <button class="btn btn-danger" id="btn-delete">${T.btnDelete}</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">${T.cardKunde}</div>
      <div class="card-body">
        <div class="picker" style="max-width:480px">
          <input id="customer-search" placeholder="${T.customerSearchPlaceholder}" value="${doc.customerId && customerMap.has(doc.customerId) ? escapeHtml(customerLabel(customerMap.get(doc.customerId))) : ''}" autocomplete="off">
          <div id="customer-results" class="picker-results" style="display:none"></div>
        </div>
        <div id="customer-preview" style="margin-top:12px"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">${T.cardPositionen}</div>
      <div class="card-body">
        <table class="items-table" id="items-table">
          <thead>
            <tr><th style="width:42px">${T.colPos}</th><th>${T.colBeschreibung}</th><th style="width:70px">${T.colAnzahl}</th><th style="width:80px">${T.colEinheit}</th><th style="width:110px">${T.colPreisEinh}</th><th style="width:80px">${T.colRabatt}</th><th style="width:100px">${T.colTotal2}</th><th style="width:78px"></th></tr>
          </thead>
          <tbody id="items-tbody"></tbody>
        </table>
        <div class="items-toolbar">
          <button class="btn btn-sm" id="btn-add-group">${T.btnAddGroup}</button>
          <button class="btn btn-sm" id="btn-add-article">${T.btnAddArticle}</button>
          <button class="btn btn-sm" id="btn-add-service">${T.btnAddService}</button>
          <button class="btn btn-sm" id="btn-add-item">${T.btnAddItem}</button>
          <div class="bulk-discount">
            <label>${T.bulkDiscountLabel}</label>
            <input type="number" id="bulk-discount-input" step="0.5" min="0" max="100" placeholder="0">
            <span>%</span>
            <button class="btn btn-sm" id="btn-apply-discount">${T.bulkDiscountApply}</button>
          </div>
        </div>
        <div class="totals-box" id="totals-box"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">${T.cardDetails}</div>
      <div class="card-body">
        <div class="form-grid" id="meta-fields"></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">${T.cardTexte}</div>
      <div class="card-body">
        <div class="form-grid cols-1" id="text-fields"></div>
      </div>
    </div>
  `;

  renderCustomerPreview();
  renderMetaFields();
  renderTextFields();
  renderItems();
  renderTotals();

  // --- Kunde ---
  const custInput = main.querySelector('#customer-search');
  const custResults = main.querySelector('#customer-results');
  custInput.addEventListener('input', debounce(() => {
    const term = custInput.value.trim().toLowerCase();
    if (!term) { custResults.style.display = 'none'; return; }
    const matches = customers.filter(c => customerLabel(c).toLowerCase().includes(term)).slice(0, 8);
    custResults.innerHTML = matches.length
      ? matches.map(c => `<div class="item" role="button" tabindex="0" data-id="${c.id}">${escapeHtml(customerLabel(c))}<div class="meta">${escapeHtml(c.adresse || '')} ${escapeHtml(c.plzOrt || '')}</div></div>`).join('')
      : `<div class="empty">${T.noCustomerFound}</div>`;
    custResults.style.display = 'block';
    custResults.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => {
      doc.customerId = el.dataset.id;
      custInput.value = customerLabel(customerMap.get(doc.customerId));
      custResults.style.display = 'none';
      renderCustomerPreview();
      queueSave();
    }));
  }, 150));
  document.addEventListener('click', (e) => {
    if (!custResults.contains(e.target) && e.target !== custInput) custResults.style.display = 'none';
  });

  function renderCustomerPreview() {
    const c = customerMap.get(doc.customerId);
    const box = main.querySelector('#customer-preview');
    if (!box) return;
    if (!c) { box.innerHTML = `<div class="text-muted" style="font-size:13px">${T.noCustomerSelected}</div>`; return; }
    box.innerHTML = `
      <div style="font-size:13.5px;line-height:1.5">
        ${customerAddressLines(c).map(l => escapeHtml(l)).join('<br>')}
        ${c.telefon ? `<br>${escapeHtml(c.telefon)}` : ''}
        ${c.email ? `<br>${escapeHtml(c.email)}` : ''}
      </div>`;
  }

  // --- Meta fields (per stage) ---
  function renderMetaFields() {
    const box = main.querySelector('#meta-fields');
    const rows = [];
    rows.push(field(T.fieldProjekt, 'projekt', doc.projekt || '', 'text'));
    rows.push(field(T.fieldDatum[stage], 'datum', doc.datum || todayISO(), 'date'));
    if (stage === 'offerte') {
      rows.push(field(T.fieldGueltigBis, 'gueltigBis', doc.gueltigBis || addDays(doc.datum || todayISO(), settings.gueltigkeitTage), 'date'));
      rows.push(field(T.fieldLieferfrist, 'lieferfrist', doc.lieferfrist || '', 'text'));
    } else if (stage === 'auftragsbestaetigung') {
      rows.push(field(T.fieldLieferfrist, 'lieferfrist', doc.lieferfrist || '', 'text'));
    } else {
      rows.push(field(T.fieldFaelligAm, 'faelligAm', doc.faelligAm || addDays(doc.datum || todayISO(), settings.zahlungsfristTage), 'date'));
    }
    rows.push(languageField());
    box.innerHTML = rows.join('');
    box.querySelectorAll('[data-field]').forEach(el => el.addEventListener('input', () => {
      doc[el.dataset.field] = el.value;
      queueSave();
    }));
    const langSelect = box.querySelector('[data-lang-field]');
    if (langSelect) langSelect.addEventListener('change', () => {
      doc.lang = langSelect.value;
      doc.langPinned = true;
      const D = tr(doc.lang).docDefaults;
      doc.greeting = greetingFor(doc.lang, customerMap.get(doc.customerId));
      doc.intro = defaultIntro(stage, doc.lang, settings);
      doc.closing = defaultClosing(stage, doc.lang, settings);
      doc.lieferfrist = doc.lieferfrist || D.lieferfrist;
      renderTextFields();
      queueSave();
    });
  }

  function languageField() {
    return `<div class="field">
      <label>${T.fieldSprache}</label>
      <select data-lang-field>
        <option value="de" ${doc.lang === 'de' ? 'selected' : ''}>Deutsch</option>
        <option value="fr" ${doc.lang === 'fr' ? 'selected' : ''}>Français</option>
      </select>
      <span class="hint">${doc.langPinned ? T.langHintPinned : T.langHintAuto}</span>
    </div>`;
  }

  function field(label, key, value, type) {
    return `<div class="field"><label>${label}</label><input data-field="${key}" type="${type}" value="${escapeHtml(value)}"></div>`;
  }

  // --- Text fields (Inhalt in Dokumentsprache doc.lang) ---
  function renderTextFields() {
    const box = main.querySelector('#text-fields');
    if (doc.greeting == null) doc.greeting = greetingFor(doc.lang, customerMap.get(doc.customerId));
    if (doc.intro == null) doc.intro = defaultIntro(stage, doc.lang, settings);
    if (doc.closing == null) doc.closing = defaultClosing(stage, doc.lang, settings);
    box.innerHTML = `
      <div class="field"><label>${T.fieldAnredeText}</label><textarea data-field="greeting" rows="2">${escapeHtml(doc.greeting)}</textarea></div>
      <div class="field"><label>${T.fieldEinleitung}</label><textarea data-field="intro" rows="4">${escapeHtml(doc.intro)}</textarea></div>
      <div class="field"><label>${T.fieldSchluss}</label><textarea data-field="closing" rows="8">${escapeHtml(doc.closing)}</textarea></div>
    `;
    box.querySelectorAll('[data-field]').forEach(el => el.addEventListener('input', () => {
      doc[el.dataset.field] = el.value;
      queueSave();
    }));
  }

  // --- Items ---
  function renderItems() {
    const tbody = main.querySelector('#items-tbody');
    const numbered = withPositionNumbers(doc.items);
    tbody.innerHTML = numbered.map((it, idx) => {
      if (it.isHeader) {
        return `
          <tr class="header-row" data-idx="${idx}">
            <td class="pos-cell">${it.pos}</td>
            <td colspan="5"><input class="desc" data-idx="${idx}" data-field="description" value="${escapeHtml(it.description)}" placeholder="${T.groupTitlePlaceholder}"></td>
            <td class="total-cell"></td>
            <td class="actions-cell"><button class="btn btn-sm" data-remove="${idx}">✕</button></td>
          </tr>`;
      }
      return `
        <tr data-idx="${idx}">
          <td class="pos-cell">${it.pos}</td>
          <td><textarea rows="1" data-idx="${idx}" data-field="description" placeholder="${T.descriptionPlaceholder}">${escapeHtml(it.description)}</textarea></td>
          <td class="qty-cell"><input type="number" step="0.01" data-idx="${idx}" data-field="qty" value="${it.qty ?? 0}"></td>
          <td class="unit-cell">
            <select data-idx="${idx}" data-field="unit">
              ${settings.einheiten.map(e => `<option ${it.unit === e ? 'selected' : ''}>${e}</option>`).join('')}
            </select>
          </td>
          <td class="price-cell"><input type="number" step="0.05" data-idx="${idx}" data-field="unitPrice" value="${it.unitPrice ?? 0}"></td>
          <td class="discount-cell"><input type="number" step="0.5" min="0" max="100" data-idx="${idx}" data-field="discount" value="${it.discount ?? 0}"></td>
          <td class="total-cell" id="total-${idx}">${chf(lineTotal(it))}</td>
          <td class="actions-cell"><button class="btn btn-sm" data-remove="${idx}">✕</button></td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-field]').forEach(el => {
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        const idx = Number(el.dataset.idx);
        const key = el.dataset.field;
        const item = doc.items[idx];
        const isNumeric = key === 'qty' || key === 'unitPrice' || key === 'discount';
        item[key] = isNumeric ? Number(el.value) || 0 : el.value;
        if (isNumeric) {
          const cell = document.getElementById(`total-${idx}`);
          if (cell) cell.textContent = chf(lineTotal(item));
          renderTotals();
        }
        queueSave();
      });
    });
    tbody.querySelectorAll('[data-remove]').forEach(el => el.addEventListener('click', () => {
      doc.items.splice(Number(el.dataset.remove), 1);
      renderItems();
      renderTotals();
      queueSave();
    }));
  }

  function renderTotals() {
    const totals = computeTotals(doc, settings.mwstSatz);
    main.querySelector('#totals-box').innerHTML = `
      <div class="row"><span>${T.totalExkl}</span><span>${chf(totals.subtotal)}</span></div>
      <div class="row"><span>${T.totalMwst(num(settings.mwstSatz, 1))}</span><span>${chf(totals.mwst)}</span></div>
      <div class="row grand"><span>${T.totalInkl}</span><span>${chf(totals.total)}</span></div>
    `;
  }

  main.querySelector('#btn-add-group').addEventListener('click', () => {
    doc.items.push(emptyGroupHeader(''));
    renderItems(); renderTotals(); queueSave();
  });
  main.querySelector('#btn-add-item').addEventListener('click', () => {
    doc.items.push(emptyItem());
    renderItems(); renderTotals(); queueSave();
  });
  main.querySelector('#btn-add-article').addEventListener('click', () => openCatalogPicker(uiLang, tr(uiLang).catalog.articlesSingular, articles, (chosen) => {
    doc.items.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()), isHeader: false, description: chosen.bezeichnung, qty: 1, unit: chosen.einheit, unitPrice: chosen.preis, discount: 0 });
    renderItems(); renderTotals(); queueSave();
  }));
  main.querySelector('#btn-add-service').addEventListener('click', () => openCatalogPicker(uiLang, tr(uiLang).catalog.servicesSingular, services, (chosen) => {
    doc.items.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()), isHeader: false, description: chosen.bezeichnung, qty: 1, unit: chosen.einheit, unitPrice: chosen.preis, discount: 0 });
    renderItems(); renderTotals(); queueSave();
  }));
  main.querySelector('#btn-apply-discount').addEventListener('click', () => {
    const val = Math.min(100, Math.max(0, Number(main.querySelector('#bulk-discount-input').value) || 0));
    doc.items.forEach(it => { if (!it.isHeader) it.discount = val; });
    renderItems(); renderTotals(); queueSave();
  });

  // --- Actions ---
  main.querySelector('#status-select').addEventListener('change', (e) => { doc.status = e.target.value; queueSave(); });
  main.querySelector('#btn-delete').addEventListener('click', async () => {
    const ok = await confirmDialog(T.deleteConfirm, { lang: uiLang });
    if (!ok) return;
    await deleteDocument(doc.id);
    toast(T.deletedToast);
    navigate(`/${routeOf(stage)}`);
  });
  main.querySelector('#btn-pdf').addEventListener('click', async () => {
    await flushSave();
    await generateDocumentPdf(doc, customerMap.get(doc.customerId), settings, stage, { download: true });
    toast(uiLang === 'fr' ? 'PDF créé et téléchargé' : 'PDF erstellt und heruntergeladen', 'success');
  });
  main.querySelector('#btn-mail').addEventListener('click', async () => {
    await flushSave();
    await sendDocumentMail(doc, customerMap.get(doc.customerId), settings, stage);
  });
  const convertBtn = main.querySelector('#btn-convert');
  if (convertBtn) convertBtn.addEventListener('click', async () => {
    await flushSave();
    const created = await convertDocument(doc, settings);
    toast(T.convertedToast(tr(uiLang).documents.stageLabel[STAGES[stage].next]), 'success');
    navigate(`/${routeOf(STAGES[stage].next)}/${created.id}`);
  });

  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 500);
  }
  async function flushSave() {
    clearTimeout(saveTimer);
    await saveDocument(doc);
  }

  window.addEventListener('hashchange', flushSave, { once: true });
}

function customerLabel(c) {
  if (!c) return '';
  return `${c.kundennummer ?? ''} — ${c.firma ? c.firma + ' / ' : ''}${customerFullName(c)}`.replace(/^—\s*/, '').trim();
}

function greetingFor(lang, customer) {
  const G = tr(lang).greeting;
  if (!customer) return G.none;
  const nachname = customer.nachname || '';
  if (customer.anrede === 'Frau') return G.Frau(nachname);
  if (customer.anrede === 'Firma') return G.Firma();
  if (customer.anrede === 'Divers') return G.Divers([customer.vorname, nachname].filter(Boolean).join(' '));
  return G.Herr(nachname);
}

function convertLabel(uiLang, stage) {
  const T = tr(uiLang).documents;
  if (stage === 'offerte') return T.convertToAb;
  if (stage === 'auftragsbestaetigung') return T.convertToRechnung;
  return '';
}

const SETTINGS_INTRO_KEY = { offerte: 'textOfferteEinleitung', auftragsbestaetigung: 'textAbEinleitung', rechnung: 'textRechnungEinleitung' };
const SETTINGS_CLOSING_KEY = { offerte: 'textOfferteSchluss', auftragsbestaetigung: 'textAbSchluss', rechnung: 'textRechnungSchluss' };

function defaultIntro(stage, lang, settings) {
  return resolveText(lang, settings[SETTINGS_INTRO_KEY[stage]], tr(lang).docDefaults.intro[stage]);
}
function defaultClosing(stage, lang, settings) {
  const text = resolveText(lang, settings[SETTINGS_CLOSING_KEY[stage]], tr(lang).docDefaults.closing[stage]);
  return stage === 'rechnung' ? text.replace(/\{frist\}/g, String(settings.zahlungsfristTage)) : text;
}

function renderStageTrail(uiLang, stage, offerteParent, abParent, nextChild) {
  const T = tr(uiLang).documents;
  const pill = (label, href, current) => href
    ? `<a class="pill ${current ? 'current' : ''}" href="${href}">${label}</a>`
    : `<span class="pill ${current ? 'current' : ''}">${label}</span>`;

  const offerteHref = stage === 'offerte' ? null : (offerteParent ? `#/offerten/${offerteParent.id}` : null);
  const abHref = stage === 'auftragsbestaetigung' ? null : (stage === 'rechnung' ? (abParent ? `#/auftragsbestaetigungen/${abParent.id}` : null) : (nextChild ? `#/auftragsbestaetigungen/${nextChild.id}` : null));
  const rechnungHref = stage === 'rechnung' ? null : (stage === 'auftragsbestaetigung' ? (nextChild ? `#/rechnungen/${nextChild.id}` : null) : null);

  return `
    <div class="stage-trail">
      ${pill(T.stageLabel.offerte, offerteHref, stage === 'offerte')}
      <span class="arrow">→</span>
      ${pill(T.stageLabel.auftragsbestaetigung, abHref, stage === 'auftragsbestaetigung')}
      <span class="arrow">→</span>
      ${pill(T.stageLabel.rechnung, rechnungHref, stage === 'rechnung')}
    </div>`;
}

async function findParentChain(doc, targetStage) {
  let current = doc;
  while (current && current.parentId) {
    const parent = await getDocument(current.parentId);
    if (!parent) return null;
    if (parent.stage === targetStage) return parent;
    current = parent;
  }
  return null;
}

function openCatalogPicker(uiLang, label, items, onChoose) {
  const T = tr(uiLang).documents;
  let term = '';
  const close = openModal({
    title: T.pickerTitle(label),
    width: '520px',
    bodyHtml: `
      <input id="picker-search" placeholder="${T.pickerSearch}" autocomplete="off" style="margin-bottom:12px">
      <div id="picker-list" style="max-height:340px;overflow-y:auto"></div>
    `,
    onMount: (root, closeFn) => {
      const list = root.querySelector('#picker-list');
      const input = root.querySelector('#picker-search');
      const MAX_RESULTS = 60;
      renderList();
      input.addEventListener('input', () => { term = input.value; renderList(); });
      input.focus();

      function renderList() {
        const filtered = items.filter(i => (i.bezeichnung || '').toLowerCase().includes(term.toLowerCase()) || (i.nummer || '').toLowerCase().includes(term.toLowerCase()));
        const shown = filtered.slice(0, MAX_RESULTS);
        list.innerHTML = shown.length
          ? shown.map(i => `<div class="picker-item-row" role="button" tabindex="0" data-id="${i.id}" style="padding:9px 8px;border-bottom:1px solid var(--border);cursor:pointer">
              <div style="font-weight:600;font-size:13.5px;line-height:1.4">${nl2br(i.bezeichnung || '')}</div>
              <div class="text-muted" style="font-size:12px;margin-top:2px">${escapeHtml(i.nummer || '')} ${i.nummer ? '·' : ''} ${chf(i.preis)} / ${escapeHtml(i.einheit || '')}</div>
            </div>`).join('')
          : `<div class="empty-state" style="padding:20px">${T.pickerEmpty}</div>`;
        if (filtered.length > MAX_RESULTS) {
          list.innerHTML += `<div class="text-muted" style="padding:8px 8px;font-size:12px">${T.pickerMore(filtered.length - MAX_RESULTS)}</div>`;
        }
        list.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => {
          const chosen = items.find(i => i.id === el.dataset.id);
          closeFn();
          onChoose(chosen);
        }));
      }
    },
  });
  return close;
}
