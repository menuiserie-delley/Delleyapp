// Datenschicht auf Firestore statt IndexedDB — jeder Nutzer (per Login) hat seinen eigenen
// Bereich "users/{uid}/{store}/{id}", automatisch zwischen allen Geräten synchronisiert.
// Alle Funktionsnamen/Signaturen bleiben identisch zur vorherigen IndexedDB-Version, damit
// der restliche Code (customers.js, documents.js, catalog.js, avor.js, termine.js, ...)
// unverändert bleiben kann.
import { db as firestore, auth } from './firebase.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';

const STORES = ['customers', 'articles', 'services', 'documents', 'settings', 'photos', 'notes', 'avor', 'termine', 'projekte', 'ausgaben', 'belege'];
const BATCH_CHUNK = 450; // unter dem Firestore-Limit von 500 Schreib-/Löschvorgängen pro Batch

export function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function userId() {
  const user = auth.currentUser;
  if (!user) throw new Error('Nicht angemeldet');
  return user.uid;
}

function storeCollection(storeName) {
  return collection(firestore, 'users', userId(), storeName);
}

export async function getAll(storeName) {
  const snap = await getDocs(storeCollection(storeName));
  return snap.docs.map(d => d.data());
}

export async function getOne(storeName, id) {
  const snap = await getDoc(doc(storeCollection(storeName), id));
  return snap.exists() ? snap.data() : null;
}

export async function put(storeName, obj) {
  if (!obj.id) obj.id = uid();
  await setDoc(doc(storeCollection(storeName), obj.id), obj);
  return obj;
}

export async function putMany(storeName, items) {
  const col = storeCollection(storeName);
  for (let i = 0; i < items.length; i += BATCH_CHUNK) {
    const batch = writeBatch(firestore);
    for (const item of items.slice(i, i + BATCH_CHUNK)) {
      if (!item.id) item.id = uid();
      batch.set(doc(col, item.id), item);
    }
    await batch.commit();
  }
}

export async function remove(storeName, id) {
  await deleteDoc(doc(storeCollection(storeName), id));
}

async function clearStore(storeName) {
  const snap = await getDocs(storeCollection(storeName));
  const refs = snap.docs.map(d => d.ref);
  for (let i = 0; i < refs.length; i += BATCH_CHUNK) {
    const batch = writeBatch(firestore);
    for (const ref of refs.slice(i, i + BATCH_CHUNK)) batch.delete(ref);
    await batch.commit();
  }
}

export async function exportAll() {
  const dump = {};
  for (const name of STORES) {
    dump[name] = await getAll(name);
  }
  dump._exportedAt = new Date().toISOString();
  return dump;
}

// Voller Restore: bestehende Stores werden zuerst geleert, dann komplett aus dem Dump
// wiederhergestellt — entspricht bewusst "alles überschreiben" (siehe Warnhinweis in der UI).
export async function importAll(dump) {
  for (const name of STORES) {
    if (!Array.isArray(dump[name])) continue;
    await clearStore(name);
    await putMany(name, dump[name]);
  }
}
