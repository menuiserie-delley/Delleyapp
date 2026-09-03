import { getAll, getOne, put, remove, uid } from './db.js';

export async function listTermine() {
  const all = await getAll('termine');
  return all.sort((a, b) => (a.datum + (a.von || '')).localeCompare(b.datum + (b.von || '')));
}

export async function getTermin(id) {
  return getOne('termine', id);
}

export async function newTermin({ titel, datum, von, bis, ort, customerId, projektId, kommission, notiz }) {
  const now = new Date().toISOString();
  const termin = {
    id: uid(),
    titel: titel || '',
    datum,
    von: von || '',
    bis: bis || '',
    ort: ort || '',
    customerId: customerId || null,
    projektId: projektId || null,
    kommission: kommission || '',
    notiz: notiz || '',
    createdAt: now,
    updatedAt: now,
  };
  await put('termine', termin);
  return termin;
}

export async function saveTermin(termin) {
  termin.updatedAt = new Date().toISOString();
  await put('termine', termin);
  return termin;
}

export async function deleteTermin(id) {
  await remove('termine', id);
}
