import { getAll, put, putMany, remove, uid } from './db.js';

export async function listCatalog(store) {
  const all = await getAll(store);
  return all.sort((a, b) => (a.bezeichnung || '').localeCompare(b.bezeichnung || '', 'de-CH'));
}

export async function saveCatalogItem(store, item) {
  if (!item.id) item.id = uid();
  await put(store, item);
  return item;
}

export async function deleteCatalogItem(store, id) {
  await remove(store, id);
}

// Importiert/aktualisiert Artikel per Artikelnummer (Upsert) — bestehende Einträge
// werden anhand ihrer Artikelnummer erkannt und aktualisiert statt dupliziert.
export async function bulkImportCatalog(store, items) {
  const existing = await getAll(store);
  const byNummer = new Map(existing.filter(i => i.nummer).map(i => [i.nummer, i]));
  let created = 0, updated = 0;
  const toWrite = items.map(item => {
    const match = byNummer.get(item.nummer);
    if (match) {
      updated++;
      return { ...match, bezeichnung: item.bezeichnung, einheit: item.einheit, preis: item.preis, kostenpreis: item.kostenpreis };
    }
    created++;
    return { id: uid(), nummer: item.nummer, bezeichnung: item.bezeichnung, einheit: item.einheit, preis: item.preis, kostenpreis: item.kostenpreis };
  });
  await putMany(store, toWrite);
  return { created, updated };
}

export function catalogMatches(item, term) {
  if (!term) return true;
  const hay = [item.nummer, item.bezeichnung, item.einheit].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(term.toLowerCase());
}
