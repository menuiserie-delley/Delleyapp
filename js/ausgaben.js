import { getAll, put, remove, uid } from './db.js';
import { listBelege, deleteBeleg } from './attachments.js';

export async function listAusgaben() {
  const all = await getAll('ausgaben');
  return all.sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
}

export async function listAusgabenByProjekt(projektId) {
  const all = await listAusgaben();
  return all.filter(a => a.projektId === projektId);
}

const BELEG_PREFIX = 'A';

// Belegnummer wird pro Jahr fortlaufend vergeben (A-2026-1, A-2026-2, …) und einmalig
// beim ersten Speichern fix zugewiesen — bleibt danach unverändert, auch wenn das Datum
// später bearbeitet wird (Nachvollziehbarkeit für die Buchführung). Wie bei den
// Dokumentnummern wird der Höchstwert immer frisch aus den bestehenden Ausgaben berechnet,
// statt einem gespeicherten Zähler zu vertrauen, der aus dem Tritt geraten könnte.
async function nextBelegnummer(year) {
  const prefix = `${BELEG_PREFIX}-${year}-`;
  const all = await getAll('ausgaben');
  let max = 0;
  for (const a of all) {
    if (typeof a.belegnummer === 'string' && a.belegnummer.startsWith(prefix)) {
      const seq = Number(a.belegnummer.slice(prefix.length));
      if (Number.isFinite(seq) && seq > max) max = seq;
    }
  }
  return `${prefix}${max + 1}`;
}

export async function saveAusgabe(ausgabe) {
  if (!ausgabe.id) ausgabe.id = uid();
  if (!ausgabe.belegnummer) {
    const year = Number((ausgabe.datum || '').slice(0, 4)) || new Date().getFullYear();
    ausgabe.belegnummer = await nextBelegnummer(year);
  }
  const now = new Date().toISOString();
  ausgabe.createdAt = ausgabe.createdAt || now;
  ausgabe.updatedAt = now;
  await put('ausgaben', ausgabe);
  return ausgabe;
}

export async function deleteAusgabe(id) {
  const belege = await listBelege(id);
  await Promise.all(belege.map(b => deleteBeleg(b.id)));
  await remove('ausgaben', id);
}
