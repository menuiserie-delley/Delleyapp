import { getAll, put, remove, uid } from './db.js';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
const MAX_PDF_BYTES = 700 * 1024; // grob unter dem Firestore-Dokumentlimit von 1 MB nach Base64-Kodierung

// Fotos werden komprimiert und direkt als Base64 in Firestore gespeichert (kein separater
// Storage-Bucket nötig — der wäre bei Firebase nur mit kostenpflichtigem Blaze-Tarif nutzbar).
// Ein komprimiertes Foto liegt normalerweise deutlich unter dem Firestore-Dokumentlimit von 1 MB.
async function compressImageToDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

export async function listPhotos(documentId) {
  const all = await getAll('photos');
  return all
    .filter(p => p.documentId === documentId)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function addPhoto(documentId, file) {
  const dataUrl = await compressImageToDataUrl(file);
  const photo = {
    id: uid(),
    documentId,
    dataUrl,
    filename: file.name || 'foto.jpg',
    createdAt: new Date().toISOString(),
  };
  // Firestores Offline-Cache übernimmt Warteschlange + automatische Synchronisation
  // von selbst — kein eigener Offline-Mechanismus für Fotos nötig.
  await put('photos', photo);
  return photo;
}

export async function deletePhoto(id) {
  await remove('photos', id);
}

// Für Fotos aus einem alten lokalen Backup (Blob als Base64-Data-URL unter `_blobDataUrl`) —
// das Feld einfach umbenennen, kein Upload nötig.
export function migrateLegacyPhotosInDump(dump) {
  if (!Array.isArray(dump.photos)) return;
  for (const p of dump.photos) {
    if (p._blobDataUrl && !p.dataUrl) {
      p.dataUrl = p._blobDataUrl;
      delete p._blobDataUrl;
    }
  }
}

export async function listNotes(documentId) {
  const all = await getAll('notes');
  return all
    .filter(n => n.documentId === documentId)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function addNote(documentId, text) {
  const note = {
    id: uid(),
    documentId,
    text,
    createdAt: new Date().toISOString(),
  };
  await put('notes', note);
  return note;
}

export async function deleteNote(id) {
  await remove('notes', id);
}

// Belege (Quittungen/Rechnungen) zu Ausgaben — gleiches Prinzip wie Fotos: direkt als
// Base64 in Firestore, kein Storage-Bucket nötig. Fotos werden wie oben komprimiert;
// PDFs werden roh eingelesen (lassen sich clientseitig nicht sinnvoll verkleinern) und
// müssen darum unter MAX_PDF_BYTES bleiben, um sicher unter dem Firestore-Limit zu bleiben.
export class BelegTooLargeError extends Error {}

export async function listBelege(ownerId) {
  const all = await getAll('belege');
  return all
    .filter(b => b.ownerId === ownerId)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function addBeleg(ownerId, file) {
  const isPdf = file.type === 'application/pdf';
  let dataUrl, mime;
  if (isPdf) {
    if (file.size > MAX_PDF_BYTES) throw new BelegTooLargeError();
    dataUrl = await fileToDataUrl(file);
    mime = 'application/pdf';
  } else {
    dataUrl = await compressImageToDataUrl(file);
    mime = 'image/jpeg';
  }
  const beleg = {
    id: uid(),
    ownerId,
    dataUrl,
    mime,
    filename: file.name || (isPdf ? 'beleg.pdf' : 'beleg.jpg'),
    createdAt: new Date().toISOString(),
  };
  await put('belege', beleg);
  return beleg;
}

export async function deleteBeleg(id) {
  await remove('belege', id);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
