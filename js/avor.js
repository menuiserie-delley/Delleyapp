import { getAll, getOne, put, remove, uid } from './db.js';
import { deletePhoto, listPhotos, deleteNote, listNotes } from './attachments.js';

export async function listAvorEntries() {
  const all = await getAll('avor');
  return all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function getAvorEntry(id) {
  return getOne('avor', id);
}

export async function newAvorEntry({ customerId, kommission }) {
  const now = new Date().toISOString();
  const entry = {
    id: uid(),
    customerId: customerId || null,
    kommission: kommission || '',
    createdAt: now,
    updatedAt: now,
  };
  await put('avor', entry);
  return entry;
}

export async function saveAvorEntry(entry) {
  entry.updatedAt = new Date().toISOString();
  await put('avor', entry);
  return entry;
}

export async function deleteAvorEntry(id) {
  const [photos, notes] = await Promise.all([listPhotos(id), listNotes(id)]);
  await Promise.all([
    ...photos.map(p => deletePhoto(p.id)),
    ...notes.map(n => deleteNote(n.id)),
  ]);
  await remove('avor', id);
}
