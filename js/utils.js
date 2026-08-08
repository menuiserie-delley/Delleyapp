export function chf(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' CHF';
}

export function num(value, decimals = 2) {
  const n = Number(value) || 0;
  return n.toLocaleString('de-CH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toLocalISO(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO() {
  return toLocalISO(new Date());
}

export function formatDateDE(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function addDays(iso, days) {
  // Rechnet rein mit lokalen Datumsteilen, um UTC-Rundungsfehler rund um Mitternacht zu vermeiden.
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + Number(days || 0));
  return toLocalISO(dt);
}

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function nl2br(str) {
  return escapeHtml(str).replace(/\n/g, '<br>');
}

export function customerFullName(c) {
  if (!c) return '';
  return [c.vorname, c.nachname].filter(Boolean).join(' ');
}

export function customerAddressLines(c) {
  if (!c) return [];
  const lines = [];
  if (c.firma) lines.push(c.firma);
  lines.push(customerFullName(c));
  if (c.adresse) lines.push(c.adresse);
  if (c.plzOrt) lines.push(c.plzOrt);
  return lines.filter(Boolean);
}

export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
