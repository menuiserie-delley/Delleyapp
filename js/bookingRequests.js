import { db as firestore } from './firebase.js';
import {
  collection, doc, setDoc, getDocs, deleteDoc, query, where,
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';

const COLLECTION = 'bookingRequests';

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

// Öffentlich aufrufbar (auch ohne Login) — die Firestore-Regeln erlauben für diese
// Collection nur "create" ohne Anmeldung, lesen/löschen bleibt dem angemeldeten Nutzer vorbehalten.
export async function submitBookingRequest({ vorname, nachname, email, telefon, wunschdatum, wunschzeit, nachricht }) {
  const request = {
    id: uid(),
    vorname: vorname || '',
    nachname: nachname || '',
    email: email || '',
    telefon: telefon || '',
    wunschdatum: wunschdatum || '',
    wunschzeit: wunschzeit || '',
    nachricht: nachricht || '',
    createdAt: new Date().toISOString(),
    status: 'neu',
  };
  await setDoc(doc(firestore, COLLECTION, request.id), request);
  return request;
}

export async function listBookingRequests() {
  const snap = await getDocs(query(collection(firestore, COLLECTION), where('status', '==', 'neu')));
  return snap.docs.map(d => d.data()).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export async function deleteBookingRequest(id) {
  await deleteDoc(doc(firestore, COLLECTION, id));
}
