import { db as firestore } from './firebase.js';
import { collection, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';
import { tr } from './i18n.js';
import { loadSettings } from './settings.js';

let watcherStarted = false;

export function isSupported() {
  return 'Notification' in window;
}

export function permissionState() {
  return isSupported() ? Notification.permission : 'unsupported';
}

export async function requestPermission() {
  if (!isSupported()) return 'unsupported';
  const result = await Notification.requestPermission();
  if (result === 'granted') startBookingRequestWatcher();
  return result;
}

// Beobachtet neue Terminanfragen in Echtzeit und zeigt eine Systembenachrichtigung,
// solange die App in einem Tab geöffnet ist (auch im Hintergrund). Der erste Snapshot
// enthält alle bereits bestehenden Anfragen — der wird übersprungen, damit nicht bei
// jedem App-Start für alte Anfragen benachrichtigt wird.
export function startBookingRequestWatcher() {
  if (watcherStarted) return;
  if (!isSupported() || Notification.permission !== 'granted') return;
  watcherStarted = true;

  let initial = true;
  const q = query(collection(firestore, 'bookingRequests'), where('status', '==', 'neu'));
  onSnapshot(q, (snapshot) => {
    if (initial) { initial = false; return; }
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') notifyNewRequest(change.doc.data());
    });
  });
}

async function notifyNewRequest(req) {
  const settings = await loadSettings();
  const lang = settings.sprache || 'de';
  const K = tr(lang).kalender;
  const name = [req.vorname, req.nachname].filter(Boolean).join(' ');
  const title = K.pushNewRequestTitle;
  const options = {
    body: K.pushNewRequestBody(name),
    icon: './assets/icon-192.png',
    badge: './assets/icon-192.png',
    tag: `booking-${req.id}`,
    data: { url: './#/kalender' },
  };
  if (navigator.serviceWorker) {
    try {
      // Timeout, falls der Service Worker (noch) nicht bereit wird — sonst direkt zurückfallen.
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('sw-timeout')), 1500)),
      ]);
      await reg.showNotification(title, options);
      return;
    } catch (err) { /* fällt auf normale Notification zurück */ }
  }
  new Notification(title, options);
}
