import { getAll, getOne, put, remove, uid } from './db.js';
import { loadSettings, saveSettings } from './settings.js';
import { todayISO, addDays } from './utils.js';
import { tr } from './i18n.js';

export const STAGES = {
  offerte: { label: 'Offerte', plural: 'Offerten', next: 'auftragsbestaetigung' },
  auftragsbestaetigung: { label: 'Auftragsbestätigung', plural: 'Auftragsbestätigungen', next: 'rechnung' },
  rechnung: { label: 'Rechnung', plural: 'Rechnungen', next: null },
};

export function emptyItem() {
  return { id: uid(), isHeader: false, description: '', qty: 1, unit: 'Std', unitPrice: 0 };
}

export function emptyGroupHeader(title = '') {
  return { id: uid(), isHeader: true, description: title, qty: null, unit: '', unitPrice: null };
}

export async function nextDocumentNumber() {
  const settings = await loadSettings();
  const year = new Date().getFullYear();
  const number = `${year}-${settings.naechsteNummer}`;
  settings.naechsteNummer = Number(settings.naechsteNummer) + 1;
  await saveSettings(settings);
  return number;
}

export function newOfferte({ number, customerId, lang = 'de' }) {
  const today = todayISO();
  const D = tr(lang).docDefaults;
  return {
    id: uid(),
    stage: 'offerte',
    number,
    lang,
    parentId: null,
    customerId: customerId || null,
    projekt: '',
    datum: today,
    gueltigBis: '',
    lieferfrist: D.lieferfrist,
    items: [emptyGroupHeader(D.defaultGroupTitle)],
    status: 'entwurf', // entwurf | versendet | akzeptiert | abgelehnt (offerte) ; entwurf|versendet (ab) ; entwurf|versendet|bezahlt (rechnung)
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function lineTotal(item) {
  if (item.isHeader) return 0;
  return (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
}

export function computeTotals(doc, mwstSatz) {
  const subtotal = (doc.items || []).reduce((sum, it) => sum + lineTotal(it), 0);
  const mwst = (subtotal * Number(mwstSatz)) / 100;
  return { subtotal, mwst, total: subtotal + mwst };
}

// Positionsnummern: Gruppenkopf bekommt naechste Zahl "N", Kinder danach "N.1","N.2"...
export function withPositionNumbers(items) {
  let groupNo = 0;
  let childNo = 0;
  let inGroup = false;
  return items.map(it => {
    if (it.isHeader) {
      groupNo += 1;
      childNo = 0;
      inGroup = true;
      return { ...it, pos: String(groupNo) };
    }
    if (inGroup) {
      childNo += 1;
      return { ...it, pos: `${groupNo}.${childNo}` };
    }
    groupNo += 1;
    return { ...it, pos: String(groupNo) };
  });
}

export async function listDocuments(stage) {
  const all = await getAll('documents');
  return all.filter(d => d.stage === stage).sort((a, b) => (b.number || '').localeCompare(a.number || ''));
}

export async function getDocument(id) {
  return getOne('documents', id);
}

export async function saveDocument(doc) {
  doc.updatedAt = new Date().toISOString();
  await put('documents', doc);
  return doc;
}

export async function deleteDocument(id) {
  await remove('documents', id);
}

export async function convertDocument(doc, settings) {
  const nextStage = STAGES[doc.stage].next;
  if (!nextStage) throw new Error('Kann nicht weiter umgewandelt werden');
  const today = todayISO();
  const copy = {
    ...doc,
    id: uid(),
    stage: nextStage,
    parentId: doc.id,
    items: doc.items.map(it => ({ ...it, id: uid() })),
    datum: today,
    status: 'entwurf',
    // Einleitungs-/Schlusstext sind pro Stufe unterschiedlich formuliert (Offerte/AB/Rechnung) —
    // daher hier zurücksetzen, damit die UI die passenden Standardtexte der neuen Stufe nachlädt.
    intro: null,
    closing: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (nextStage === 'rechnung') {
    copy.faelligAm = addDays(today, settings?.zahlungsfristTage ?? 14);
    copy.items.push(emptyGroupHeader(tr(doc.lang || 'de').docDefaults.nachtraege));
  }
  await put('documents', copy);
  return copy;
}

export async function findChildDocument(parentId, stage) {
  const all = await getAll('documents');
  return all.find(d => d.parentId === parentId && d.stage === stage) || null;
}
