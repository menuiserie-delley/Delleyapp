import { listTermine, getTermin, newTermin, saveTermin, deleteTermin } from '../termine.js';
import { listCustomers } from '../customers.js';
import { listBookingRequests, deleteBookingRequest } from '../bookingRequests.js';
import { openCustomerForm } from './kunden.js';
import { loadSettings } from '../settings.js';
import { escapeHtml, customerFullName, debounce, todayISO, formatDateDE } from '../utils.js';
import { openModal, confirmDialog, toast } from '../ui.js';
import { tr } from '../i18n.js';

function customerLabel(c) {
  if (!c) return '';
  return `${c.kundennummer ?? ''} — ${c.firma ? c.firma + ' / ' : ''}${customerFullName(c)}`.replace(/^—\s*/, '').trim();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isoOf(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

// Baut ein Monatsraster (Mo-So) inkl. Rand-Tagen aus dem Vor-/Folgemonat, damit die Wochen vollständig sind.
function buildMonthGrid(year, month) {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Montag = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    cells.push({ day, year: y, month: m, currentMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, year, month, currentMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const m = last.month === 11 ? 0 : last.month + 1;
    const y = last.month === 11 ? last.year + 1 : last.year;
    cells.push({ day: last.day === new Date(last.year, last.month + 1, 0).getDate() ? 1 : last.day + 1, year: y, month: m, currentMonth: false });
  }
  return cells;
}

export async function renderKalender() {
  const main = document.getElementById('main');
  const settings = await loadSettings();
  const uiLang = settings.sprache || 'de';
  const K = tr(uiLang).kalender;

  const [termine, customers, bookingRequests] = await Promise.all([listTermine(), listCustomers(), listBookingRequests()]);
  const customerMap = new Map(customers.map(c => [c.id, c]));

  const now = new Date();
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth();
  let selectedDate = todayISO();

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${K.title}</h1>
        <div class="subtitle">${K.subtitle}</div>
      </div>
      <div class="actions">
        <button class="btn btn-primary" id="btn-new-termin">${K.newTermin}</button>
      </div>
    </div>
    <div id="booking-requests-section"></div>
    <div class="card">
      <div class="card-header">
        <div class="cal-nav">
          <button class="btn btn-sm btn-icon" id="cal-prev" aria-label="‹">‹</button>
          <span class="cal-month-label" id="cal-month-label"></span>
          <button class="btn btn-sm btn-icon" id="cal-next" aria-label="›">›</button>
        </div>
        <button class="btn btn-sm" id="cal-today">${K.today}</button>
      </div>
      <div class="card-body">
        <div class="cal-weekdays" id="cal-weekdays">${K.weekdaysShort.map(w => `<div class="cal-weekday">${w}</div>`).join('')}</div>
        <div class="cal-grid" id="cal-grid"></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header" id="cal-day-title"></div>
      <div class="card-body" id="cal-day-list"></div>
    </div>
  `;

  function byDate(iso) {
    return termine.filter(t => t.datum === iso).sort((a, b) => (a.von || '').localeCompare(b.von || ''));
  }

  function renderGrid() {
    document.getElementById('cal-month-label').textContent = `${K.monthNames[viewMonth]} ${viewYear}`;
    const cells = buildMonthGrid(viewYear, viewMonth);
    const todayIso = todayISO();
    const grid = document.getElementById('cal-grid');
    grid.innerHTML = cells.map(c => {
      const iso = isoOf(c.year, c.month, c.day);
      const items = byDate(iso);
      const shown = items.slice(0, 2);
      const extra = items.length - shown.length;
      const classes = ['cal-day'];
      if (!c.currentMonth) classes.push('cal-day-muted');
      if (iso === todayIso) classes.push('cal-day-today');
      if (iso === selectedDate) classes.push('cal-day-selected');
      return `<div class="${classes.join(' ')}" data-date="${iso}">
        <div class="cal-day-num">${c.day}</div>
        <div class="cal-day-items">
          ${shown.map(t => `<div class="cal-pill">${t.von ? `<span class="cal-pill-time">${escapeHtml(t.von)}</span> ` : ''}${escapeHtml(t.titel || K.newTermin)}</div>`).join('')}
          ${extra > 0 ? `<div class="cal-pill cal-pill-more">${K.moreCount(extra)}</div>` : ''}
        </div>
      </div>`;
    }).join('');
    grid.querySelectorAll('[data-date]').forEach(el => el.addEventListener('click', () => {
      selectedDate = el.dataset.date;
      renderGrid();
      renderDayList();
    }));
  }

  function renderDayList() {
    const items = byDate(selectedDate);
    const niceDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString(uiLang === 'fr' ? 'fr-CH' : 'de-CH', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    document.getElementById('cal-day-title').textContent = K.dayTitle(niceDate);
    const list = document.getElementById('cal-day-list');
    list.innerHTML = `
      ${items.length ? `<div class="notes-list">
        ${items.map(t => {
          const c = customerMap.get(t.customerId);
          const meta = [c ? (c.firma || customerFullName(c)) : '', t.kommission].filter(Boolean).join(' · ');
          const time = [t.von, t.bis].filter(Boolean).join('–');
          return `<div class="note-item" data-open="${t.id}" style="cursor:pointer">
            <div>
              <div class="note-date">${[time, t.ort].filter(Boolean).map(escapeHtml).join(' · ')}</div>
              <div class="note-text" style="font-weight:600">${escapeHtml(t.titel || K.newTermin)}</div>
              ${meta ? `<div class="text-muted" style="font-size:12.5px;margin-top:2px">${escapeHtml(meta)}</div>` : ''}
            </div>
            <button class="btn btn-sm" data-del="${t.id}">${tr(uiLang).common.delete}</button>
          </div>`;
        }).join('')}
      </div>` : `<div class="text-muted" style="font-size:13px">${K.noAppointmentsDay}</div>`}
      <div style="margin-top:12px"><button class="btn btn-sm" id="btn-add-day">${K.newTermin}</button></div>
    `;
    list.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) return;
      openTerminModal(el.dataset.open);
    }));
    list.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog(K.deleteConfirm, { lang: uiLang });
      if (!ok) return;
      await deleteTermin(el.dataset.del);
      toast(K.deletedToast);
      await refreshData();
    }));
    list.querySelector('#btn-add-day').addEventListener('click', () => openTerminModal(null));
  }

  async function refreshData() {
    const fresh = await listTermine();
    termine.length = 0;
    termine.push(...fresh);
    renderGrid();
    renderDayList();
  }

  function renderBookingRequests() {
    const box = document.getElementById('booking-requests-section');
    if (!bookingRequests.length) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <div class="card">
        <div class="card-header">${K.bookingRequestsTitle}</div>
        <div class="card-body">
          <div class="notes-list">
            ${bookingRequests.map(r => `
              <div class="note-item">
                <div>
                  <div class="note-date">${escapeHtml(K.requestWish(formatDateDE(r.wunschdatum), r.wunschzeit))} · <span class="badge badge-entwurf" style="padding:1px 7px;font-size:10.5px">${r.lang === 'fr' ? 'FR' : 'DE'}</span></div>
                  <div class="note-text" style="font-weight:600">${escapeHtml([r.anrede, r.vorname, r.nachname].filter(Boolean).join(' '))}${r.firma ? escapeHtml(` (${r.firma})`) : ''}</div>
                  <div class="text-muted" style="font-size:12.5px;margin-top:2px">${[r.adresse, r.plzOrt].filter(Boolean).map(escapeHtml).join(', ')}</div>
                  <div class="text-muted" style="font-size:12.5px;margin-top:2px">${[r.telefon, r.email].filter(Boolean).map(escapeHtml).join(' · ')}</div>
                  ${r.nachricht ? `<div class="text-muted" style="font-size:12.5px;margin-top:4px">${escapeHtml(r.nachricht)}</div>` : ''}
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0">
                  <button class="btn btn-sm btn-primary" data-accept="${r.id}">${K.btnAccept}</button>
                  <button class="btn btn-sm" data-reject="${r.id}">${K.btnReject}</button>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
    box.querySelectorAll('[data-accept]').forEach(el => el.addEventListener('click', () => {
      const req = bookingRequests.find(r => r.id === el.dataset.accept);
      if (req) acceptRequest(req);
    }));
    box.querySelectorAll('[data-reject]').forEach(el => el.addEventListener('click', async () => {
      const ok = await confirmDialog(K.rejectConfirm, { lang: uiLang });
      if (!ok) return;
      await deleteBookingRequest(el.dataset.reject);
      toast(K.rejectedToast);
      await refreshBookingRequests();
    }));
  }

  async function refreshBookingRequests() {
    const fresh = await listBookingRequests();
    bookingRequests.length = 0;
    bookingRequests.push(...fresh);
    renderBookingRequests();
  }

  function acceptRequest(req) {
    const prefillCustomer = {
      anrede: req.anrede || 'Herr',
      firma: req.firma || '',
      vorname: req.vorname,
      nachname: req.nachname,
      adresse: req.adresse || '',
      plzOrt: req.plzOrt || '',
      telefon: req.telefon,
      email: req.email,
    };
    openCustomerForm(uiLang, prefillCustomer, async (savedCustomer) => {
      await newTermin({
        titel: K.consultationTitle,
        datum: req.wunschdatum || todayISO(),
        von: req.wunschzeit || '',
        bis: '',
        ort: '',
        customerId: savedCustomer.id,
        kommission: '',
        notiz: req.nachricht || '',
      });
      await deleteBookingRequest(req.id);
      toast(K.acceptedToast, 'success');
      await refreshData();
      await refreshBookingRequests();
      openConfirmationMail(req);
    });
  }

  // Öffnet eine vorausgefüllte Bestätigungsmail in der Sprache, die der Kunde bei der
  // Anfrage gewählt hat (nicht zwingend die aktuelle App-Sprache).
  function openConfirmationMail(req) {
    if (!req.email) return;
    const mailLang = req.lang === 'fr' ? 'fr' : 'de';
    const KM = tr(mailLang).kalender;
    const G = tr(mailLang).greeting;
    const greeting = req.anrede === 'Frau' ? G.Frau(req.nachname) : G.Herr(req.nachname);
    const body = KM.confirmationMailBody(greeting, formatDateDE(req.wunschdatum), req.wunschzeit || '');
    const subject = encodeURIComponent(KM.confirmationMailSubject);
    window.location.href = `mailto:${req.email}?subject=${subject}&body=${encodeURIComponent(body)}`;
  }

  function openTerminModal(id) {
    openTerminEditor(uiLang, customers, customerMap, id, selectedDate, async () => { await refreshData(); });
  }

  document.getElementById('btn-new-termin').addEventListener('click', () => openTerminModal(null));
  document.getElementById('cal-prev').addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderGrid();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderGrid();
  });
  document.getElementById('cal-today').addEventListener('click', () => {
    const t = new Date();
    viewYear = t.getFullYear();
    viewMonth = t.getMonth();
    selectedDate = todayISO();
    renderGrid();
    renderDayList();
  });

  renderBookingRequests();
  renderGrid();
  renderDayList();
}

async function openTerminEditor(uiLang, customers, customerMap, id, prefillDate, onSaved) {
  const K = tr(uiLang).kalender;
  const termin = id ? await getTermin(id) : null;
  const isEdit = !!termin;
  let selectedCustomerId = termin?.customerId || null;

  openModal({
    title: isEdit ? K.editModalTitle : K.newModalTitle,
    width: '560px',
    bodyHtml: `
      <div class="form-grid">
        <div class="field span-2">
          <label>${K.fieldTitel}</label>
          <input id="t-titel" placeholder="${K.titelPlaceholder}" value="${escapeHtml(termin?.titel || '')}">
        </div>
        <div class="field">
          <label>${K.fieldDatum}</label>
          <input id="t-datum" type="date" value="${termin?.datum || prefillDate || todayISO()}">
        </div>
        <div class="field">
          <label>${K.fieldOrt}</label>
          <input id="t-ort" placeholder="${K.ortPlaceholder}" value="${escapeHtml(termin?.ort || '')}">
        </div>
        <div class="field">
          <label>${K.fieldVon}</label>
          <input id="t-von" type="time" value="${termin?.von || ''}">
        </div>
        <div class="field">
          <label>${K.fieldBis}</label>
          <input id="t-bis" type="time" value="${termin?.bis || ''}">
        </div>
        <div class="field span-2">
          <label>${K.fieldKunde}</label>
          <div class="picker">
            <input id="t-customer-search" placeholder="${K.customerSearchPlaceholder}" value="${selectedCustomerId && customerMap.has(selectedCustomerId) ? escapeHtml(customerLabel(customerMap.get(selectedCustomerId))) : ''}" autocomplete="off">
            <div id="t-customer-results" class="picker-results" style="display:none"></div>
          </div>
        </div>
        <div class="field span-2">
          <label>${K.fieldKommission}</label>
          <input id="t-kommission" placeholder="${K.kommissionPlaceholder}" value="${escapeHtml(termin?.kommission || '')}">
        </div>
        <div class="field span-2">
          <label>${K.fieldNotiz}</label>
          <textarea id="t-notiz" rows="2">${escapeHtml(termin?.notiz || '')}</textarea>
        </div>
      </div>`,
    footerHtml: `
      ${isEdit ? `<button class="btn btn-danger" data-delete style="margin-right:auto">${tr(uiLang).common.delete}</button>` : ''}
      <button class="btn" data-cancel>${tr(uiLang).common.cancel}</button>
      <button class="btn btn-primary" data-save>${tr(uiLang).common.save}</button>`,
    onMount: (root, closeFn) => {
      root.querySelector('[data-cancel]').addEventListener('click', closeFn);

      const input = root.querySelector('#t-customer-search');
      const results = root.querySelector('#t-customer-results');
      input.addEventListener('input', debounce(() => {
        const term = input.value.trim().toLowerCase();
        if (!term) { results.style.display = 'none'; return; }
        const matches = customers.filter(c => customerLabel(c).toLowerCase().includes(term)).slice(0, 8);
        results.innerHTML = matches.length
          ? matches.map(c => `<div class="item" role="button" tabindex="0" data-id="${c.id}">${escapeHtml(customerLabel(c))}<div class="meta">${escapeHtml(c.adresse || '')} ${escapeHtml(c.plzOrt || '')}</div></div>`).join('')
          : `<div class="empty">${K.noCustomerFound}</div>`;
        results.style.display = 'block';
        results.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => {
          selectedCustomerId = el.dataset.id;
          input.value = customerLabel(customers.find(c => c.id === selectedCustomerId));
          results.style.display = 'none';
        }));
      }, 150));

      if (isEdit) {
        root.querySelector('[data-delete]').addEventListener('click', async () => {
          const ok = await confirmDialog(K.deleteConfirm, { lang: uiLang });
          if (!ok) return;
          await deleteTermin(termin.id);
          toast(K.deletedToast);
          closeFn();
          onSaved();
        });
      }

      root.querySelector('[data-save]').addEventListener('click', async () => {
        const payload = {
          titel: root.querySelector('#t-titel').value.trim(),
          datum: root.querySelector('#t-datum').value || todayISO(),
          von: root.querySelector('#t-von').value,
          bis: root.querySelector('#t-bis').value,
          ort: root.querySelector('#t-ort').value.trim(),
          customerId: selectedCustomerId,
          kommission: root.querySelector('#t-kommission').value.trim(),
          notiz: root.querySelector('#t-notiz').value.trim(),
        };
        if (isEdit) {
          Object.assign(termin, payload);
          await saveTermin(termin);
          toast(K.savedToast, 'success');
        } else {
          await newTermin(payload);
          toast(K.createdToast, 'success');
        }
        closeFn();
        onSaved();
      });
    },
  });
}
