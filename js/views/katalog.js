import { listCatalog, saveCatalogItem, deleteCatalogItem, catalogMatches } from '../catalog.js';
import { escapeHtml, nl2br, chf, num } from '../utils.js';
import { openModal, confirmDialog, toast } from '../ui.js';
import { loadSettings } from '../settings.js';
import { tr } from '../i18n.js';

const PAGE_SIZE = 100;
const state = { articles: { term: '', page: 1 }, services: { term: '', page: 1 } };

export function catalogConfig(kind, lang) {
  const C = tr(lang).catalog;
  if (kind === 'articles') {
    return {
      store: 'articles', title: C.articlesTitle, subtitle: C.articlesSubtitle, singular: C.articlesSingular,
      newLabel: C.newArticle, editLabel: C.editArticle, numberLabel: C.articleNumberLabel, icon: '📦',
    };
  }
  return {
    store: 'services', title: C.servicesTitle, subtitle: C.servicesSubtitle, singular: C.servicesSingular,
    newLabel: C.newService, editLabel: C.editService, numberLabel: C.serviceNumberLabel, icon: '🛠️',
  };
}

function margeCell(item) {
  if (item.kostenpreis == null || item.kostenpreis === '') return '<span class="text-muted">–</span>';
  const margeChf = (Number(item.preis) || 0) - Number(item.kostenpreis);
  const margePct = item.preis > 0 ? (margeChf / Number(item.preis)) * 100 : null;
  const cls = margeChf < 0 ? 'style="color:var(--danger)"' : '';
  return `<span ${cls}>${chf(margeChf)}${margePct != null ? ` (${num(margePct, 0)}%)` : ''}</span>`;
}

export async function renderCatalogList(kind) {
  const settings = await loadSettings();
  const lang = settings.sprache || 'de';
  const C = tr(lang).catalog;
  const cfg = catalogConfig(kind, lang);
  const s = state[kind];
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${cfg.title}</h1>
        <div class="subtitle">${cfg.subtitle} ${C.subtitleSuffix}</div>
      </div>
      <div class="actions">
        <input id="search" type="search" placeholder="${tr(lang).common.search}" style="width:220px" value="${escapeHtml(s.term)}">
        <button class="btn btn-primary" id="btn-new">${cfg.newLabel}</button>
      </div>
    </div>
    <div class="card"><div class="card-body" id="table-wrap"></div></div>
  `;

  main.querySelector('#btn-new').addEventListener('click', () => openCatalogForm(kind, lang, null, settings, refresh));
  const searchInput = main.querySelector('#search');
  searchInput.addEventListener('input', () => { s.term = searchInput.value; s.page = 1; refresh(); });
  searchInput.focus();
  searchInput.setSelectionRange(s.term.length, s.term.length);

  await refresh();

  async function refresh() {
    const all = await listCatalog(cfg.store);
    const filtered = all.filter(item => catalogMatches(item, s.term));
    const wrap = document.getElementById('table-wrap');
    if (!wrap) return;
    if (filtered.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="icon">${cfg.icon}</div>${C.emptyState(cfg.title)}</div>`;
      return;
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    s.page = Math.min(Math.max(1, s.page), totalPages);
    const from = (s.page - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(from, from + PAGE_SIZE);

    wrap.innerHTML = `
      <table class="data">
        <thead><tr>
          <th>${cfg.numberLabel}</th><th>${C.colDescription}</th><th>${C.colUnit}</th><th class="num">${C.colKostenpreis}</th><th class="num">${C.colPrice}</th><th class="num">${C.colMarge}</th><th></th>
        </tr></thead>
        <tbody>
          ${pageItems.map(item => `
            <tr>
              <td>${escapeHtml(item.nummer || '–')}</td>
              <td><a href="#" class="row-link" data-edit="${item.id}" style="display:block;line-height:1.4">${nl2br(item.bezeichnung || '')}</a></td>
              <td>${escapeHtml(item.einheit || '')}</td>
              <td class="num">${item.kostenpreis != null ? chf(item.kostenpreis) : '<span class="text-muted">–</span>'}</td>
              <td class="num">${chf(item.preis)}</td>
              <td class="num">${margeCell(item)}</td>
              <td style="text-align:right"><button class="btn btn-sm" data-del="${item.id}">${tr(lang).common.delete}</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${totalPages > 1 ? `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px">
          <span class="text-muted" style="font-size:13px">${C.pageInfo(from + 1, Math.min(from + PAGE_SIZE, filtered.length), filtered.length)}</span>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm" id="btn-prev-page" ${s.page <= 1 ? 'disabled' : ''}>${C.prevPage}</button>
            <button class="btn btn-sm" id="btn-next-page" ${s.page >= totalPages ? 'disabled' : ''}>${C.nextPage}</button>
          </div>
        </div>` : ''}
    `;
    wrap.querySelectorAll('[data-edit]').forEach(el => el.addEventListener('click', (e) => {
      e.preventDefault();
      const item = all.find(x => x.id === el.dataset.edit);
      openCatalogForm(kind, lang, item, settings, refresh);
    }));
    wrap.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', async () => {
      const ok = await confirmDialog(C.deleteConfirm[kind], { lang });
      if (!ok) return;
      await deleteCatalogItem(cfg.store, el.dataset.del);
      toast(C.deletedToast[kind]);
      refresh();
    }));
    const prevBtn = wrap.querySelector('#btn-prev-page');
    const nextBtn = wrap.querySelector('#btn-next-page');
    if (prevBtn) prevBtn.addEventListener('click', () => { s.page -= 1; refresh(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { s.page += 1; refresh(); });
  }
}

export function openCatalogForm(kind, lang, item, settings, onSaved) {
  const C = tr(lang).catalog;
  const cfg = catalogConfig(kind, lang);
  const it = item || { einheit: settings.einheiten[0] };
  const close = openModal({
    title: item ? cfg.editLabel : cfg.newLabel,
    width: '560px',
    bodyHtml: `
      <form id="cat-form">
        <div class="form-grid">
          <div class="field">
            <label>${C.fieldNumberOptional(cfg.numberLabel)}</label>
            <input name="nummer" value="${escapeHtml(it.nummer || '')}">
          </div>
          <div class="field">
            <label>${C.fieldUnit}</label>
            <select name="einheit">
              ${settings.einheiten.map(e => `<option value="${e}" ${it.einheit === e ? 'selected' : ''}>${e}</option>`).join('')}
            </select>
          </div>
          <div class="field span-2">
            <label>${C.fieldDescription}</label>
            <textarea name="bezeichnung" required rows="3">${escapeHtml(it.bezeichnung || '')}</textarea>
          </div>
          <div class="field">
            <label>${C.fieldKostenpreis}</label>
            <input name="kostenpreis" type="number" step="0.01" value="${it.kostenpreis ?? ''}">
          </div>
          <div class="field">
            <label>${C.fieldPrice}</label>
            <input name="preis" type="number" step="0.05" value="${it.preis ?? ''}">
          </div>
        </div>
      </form>`,
    footerHtml: `
      <button class="btn" data-cancel>${tr(lang).common.cancel}</button>
      <button class="btn btn-primary" data-save>${tr(lang).common.save}</button>`,
    onMount: (root, closeFn) => {
      root.querySelector('[data-cancel]').addEventListener('click', closeFn);
      root.querySelector('[data-save]').addEventListener('click', async () => {
        const form = root.querySelector('#cat-form');
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        const updated = { ...it };
        for (const [k, v] of fd.entries()) {
          if (k === 'preis') updated[k] = Number(v) || 0;
          else if (k === 'kostenpreis') updated[k] = v === '' ? null : Number(v);
          else updated[k] = v;
        }
        await saveCatalogItem(cfg.store, updated);
        toast(C.savedToast[kind], 'success');
        closeFn();
        if (onSaved) onSaved(updated);
      });
    },
  });
  return close;
}
