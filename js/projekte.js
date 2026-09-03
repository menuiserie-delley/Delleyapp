import { getAll, getOne, put, remove, uid } from './db.js';
import { customerFullName } from './utils.js';

export async function listProjekte() {
  const all = await getAll('projekte');
  return all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function getProjekt(id) {
  return getOne('projekte', id);
}

export async function saveProjekt(projekt) {
  if (!projekt.id) projekt.id = uid();
  const now = new Date().toISOString();
  projekt.createdAt = projekt.createdAt || now;
  projekt.updatedAt = now;
  await put('projekte', projekt);
  return projekt;
}

export async function deleteProjekt(id) {
  await remove('projekte', id);
}

export function projektMatches(p, term) {
  if (!term) return true;
  const hay = [p.name, p.notiz].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(term.toLowerCase());
}

export function projektLabel(p, customerMap) {
  if (!p) return '';
  const c = customerMap ? customerMap.get(p.customerId) : null;
  const kundenName = c ? (c.firma || customerFullName(c)) : '';
  return kundenName ? `${p.name} — ${kundenName}` : p.name;
}
