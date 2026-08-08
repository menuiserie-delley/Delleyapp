import { getAll, put, remove, uid } from './db.js';

export async function listCustomers() {
  const all = await getAll('customers');
  return all.sort((a, b) => (a.nachname || '').localeCompare(b.nachname || '', 'de-CH'));
}

export async function nextKundennummer() {
  const all = await getAll('customers');
  const max = all.reduce((m, c) => Math.max(m, Number(c.kundennummer) || 0), 1000);
  return max + 1;
}

export async function saveCustomer(customer) {
  if (!customer.id) customer.id = uid();
  if (!customer.kundennummer) customer.kundennummer = await nextKundennummer();
  await put('customers', customer);
  return customer;
}

export async function deleteCustomer(id) {
  await remove('customers', id);
}

export function customerMatches(c, term) {
  if (!term) return true;
  const hay = [c.kundennummer, c.vorname, c.nachname, c.firma, c.adresse, c.plzOrt, c.email, c.telefon]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(term.toLowerCase());
}
