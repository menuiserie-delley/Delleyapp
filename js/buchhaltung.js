import { getAll } from './db.js';
import { listAusgaben } from './ausgaben.js';
import { listProjekte } from './projekte.js';
import { listCustomers } from './customers.js';
import { computeTotals } from './documents.js';
import { loadSettings } from './settings.js';
import { customerFullName, formatDateDE } from './utils.js';

// SheetJS wird erst beim Export nachgeladen (liegt lokal in vendor/), damit es den
// App-Start nicht verlangsamt.
let xlsxPromise = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/xlsx.mini.min.js';
      script.onload = () => resolve(window.XLSX);
      script.onerror = () => { xlsxPromise = null; reject(new Error('Excel-Bibliothek konnte nicht geladen werden')); };
      document.head.appendChild(script);
    });
  }
  return xlsxPromise;
}

const HEADER = ['Datum', 'Belegnummer', 'Typ', 'Beschreibung', 'Kunde/Projekt', 'Betrag'];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function buildSheet(XLSX, rows) {
  const aoa = [HEADER, ...rows.map(r => [formatDateDE(r.datum), r.belegnummer, r.typ, r.beschreibung, r.wer, round2(r.betrag)])];
  aoa.push(['', '', '', '', 'Saldo', round2(rows.reduce((sum, r) => sum + r.betrag, 0))]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (let i = 1; i < aoa.length; i++) {
    const cell = ws[XLSX.utils.encode_cell({ r: i, c: 5 })];
    if (cell) cell.z = '#,##0.00';
  }
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 38 }, { wch: 32 }, { wch: 14 }];
  return ws;
}

// Einfaches Kassabuch für ein Kalenderjahr. Einnahmen = bezahlte Rechnungen (die
// Rechnungsnummer dient als Belegnummer), Ausgaben nutzen ihre eigene Belegnummer.
// Blatt 1 "Buchhaltung": Einnahmen mit MwSt + alle Ausgaben (Ausgaben negativ).
// Blatt 2 "Ohne MwSt": bezahlte Rechnungen, bei denen die MwSt ausgeschaltet war.
export async function buildBuchhaltungsXlsx(year) {
  const [XLSX, ausgaben, allDocs, projekte, customers, settings] = await Promise.all([
    loadXlsx(),
    listAusgaben(),
    getAll('documents'),
    listProjekte(),
    listCustomers(),
    loadSettings(),
  ]);
  const customerMap = new Map(customers.map(c => [c.id, c]));
  const projektMap = new Map(projekte.map(p => [p.id, p]));
  const yearStr = String(year);

  const mitMwst = [];
  const ohneMwst = [];

  const rechnungen = allDocs.filter(d => d.stage === 'rechnung' && d.status === 'bezahlt' && (d.datum || '').startsWith(yearStr));
  for (const d of rechnungen) {
    const c = customerMap.get(d.customerId);
    const row = {
      datum: d.datum,
      belegnummer: d.number,
      typ: 'Einnahme',
      beschreibung: 'Rechnung',
      wer: c ? (c.firma || customerFullName(c)) : '',
      betrag: computeTotals(d, settings.mwstSatz).total,
    };
    (d.mwstAktiv === false ? ohneMwst : mitMwst).push(row);
  }

  for (const a of ausgaben.filter(a => (a.datum || '').startsWith(yearStr))) {
    const p = projektMap.get(a.projektId);
    mitMwst.push({
      datum: a.datum,
      belegnummer: a.belegnummer || '',
      typ: 'Ausgabe',
      beschreibung: a.beschreibung || '',
      wer: p ? p.name : '',
      betrag: -Math.abs(Number(a.betrag) || 0),
    });
  }

  const byDatum = (a, b) => (a.datum || '').localeCompare(b.datum || '');
  mitMwst.sort(byDatum);
  ohneMwst.sort(byDatum);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, mitMwst), 'Buchhaltung');
  XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, ohneMwst), 'Ohne MwSt');
  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
