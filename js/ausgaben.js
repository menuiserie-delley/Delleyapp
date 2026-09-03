import { getAll, put, remove, uid } from './db.js';

export async function listAusgaben() {
  const all = await getAll('ausgaben');
  return all.sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
}

export async function listAusgabenByProjekt(projektId) {
  const all = await listAusgaben();
  return all.filter(a => a.projektId === projektId);
}

export async function saveAusgabe(ausgabe) {
  if (!ausgabe.id) ausgabe.id = uid();
  const now = new Date().toISOString();
  ausgabe.createdAt = ausgabe.createdAt || now;
  ausgabe.updatedAt = now;
  await put('ausgaben', ausgabe);
  return ausgabe;
}

export async function deleteAusgabe(id) {
  await remove('ausgaben', id);
}
