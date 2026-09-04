import { getAll } from './db.js';
import { listAusgaben } from './ausgaben.js';
import { listProjekte } from './projekte.js';
import { listCustomers } from './customers.js';
import { computeTotals } from './documents.js';
import { loadSettings } from './settings.js';
import { customerFullName, formatDateDE } from './utils.js';

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[;"\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

// Schweizer/deutsches Excel erwartet bei Semikolon-getrennten CSVs i.d.R. Komma als
// Dezimaltrennzeichen — sonst werden die Beträge als Text statt als Zahl importiert.
function formatAmountCsv(n) {
  return (Number(n) || 0).toFixed(2).replace('.', ',');
}

// Baut ein einfaches Kassabuch (Einnahmen + Ausgaben in einer Liste, Ausgaben negativ)
// für ein Kalenderjahr — als CSV zum Import in Excel/Banana o.ä. Einnahmen = bezahlte
// Rechnungen (Rechnungsnummer dient als Belegnummer); Ausgaben nutzen ihre eigene,
// fortlaufende Belegnummer (siehe ausgaben.js).
export async function buildBuchhaltungsCsv(year) {
  const [ausgaben, allDocs, projekte, customers, settings] = await Promise.all([
    listAusgaben(),
    getAll('documents'),
    listProjekte(),
    listCustomers(),
    loadSettings(),
  ]);
  const customerMap = new Map(customers.map(c => [c.id, c]));
  const projektMap = new Map(projekte.map(p => [p.id, p]));
  const yearStr = String(year);

  const rows = [];

  const rechnungen = allDocs.filter(d => d.stage === 'rechnung' && d.status === 'bezahlt' && (d.datum || '').startsWith(yearStr));
  for (const d of rechnungen) {
    const totals = computeTotals(d, settings.mwstSatz);
    const c = customerMap.get(d.customerId);
    rows.push({
      datum: d.datum,
      belegnummer: d.number,
      typ: 'Einnahme',
      beschreibung: 'Rechnung',
      wer: c ? (c.firma || customerFullName(c)) : '',
      betrag: totals.total,
    });
  }

  const jahrAusgaben = ausgaben.filter(a => (a.datum || '').startsWith(yearStr));
  for (const a of jahrAusgaben) {
    const p = projektMap.get(a.projektId);
    rows.push({
      datum: a.datum,
      belegnummer: a.belegnummer || '',
      typ: 'Ausgabe',
      beschreibung: a.beschreibung || '',
      wer: p ? p.name : '',
      betrag: -Math.abs(Number(a.betrag) || 0),
    });
  }

  rows.sort((a, b) => (a.datum || '').localeCompare(b.datum || ''));

  const header = ['Datum', 'Belegnummer', 'Typ', 'Beschreibung', 'Kunde/Projekt', 'Betrag'];
  const lines = [header.join(';')];
  for (const r of rows) {
    lines.push([
      formatDateDE(r.datum),
      csvEscape(r.belegnummer),
      r.typ,
      csvEscape(r.beschreibung),
      csvEscape(r.wer),
      formatAmountCsv(r.betrag),
    ].join(';'));
  }
  const saldo = rows.reduce((sum, r) => sum + r.betrag, 0);
  lines.push(['', '', '', '', 'Saldo', formatAmountCsv(saldo)].join(';'));

  return lines.join('\r\n');
}
