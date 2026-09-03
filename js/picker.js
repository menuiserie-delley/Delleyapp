import { debounce } from './utils.js';

// Verkabelt ein Such-Eingabefeld mit einer Ergebnisliste (Muster: Kunde-Picker in
// kalender.js/dokumente.js/avor.js). Optional mit "+ Neu anlegen"-Option, wenn `onCreate`
// übergeben wird — damit z.B. ein Projekt direkt aus einer Notiz/Offerte heraus entstehen kann.
export function attachPickerSearch({ input, results, items, idOf = (it) => it.id, labelFn, metaFn, matchFn, onSelect, onCreate, createLabel, emptyLabel }) {
  input.addEventListener('input', debounce(() => {
    const term = input.value.trim();
    if (!term) { results.style.display = 'none'; return; }
    const matches = items.filter((it) => matchFn(it, term)).slice(0, 8);
    let html = matches.map((it) => `<div class="item" role="button" tabindex="0" data-id="${idOf(it)}">${labelFn(it)}${metaFn ? `<div class="meta">${metaFn(it)}</div>` : ''}</div>`).join('');
    if (onCreate) html += `<div class="item" role="button" tabindex="0" data-create="1">${createLabel(term)}</div>`;
    results.innerHTML = html || `<div class="empty">${emptyLabel}</div>`;
    results.style.display = 'block';
    results.querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => {
      onSelect(items.find((it) => String(idOf(it)) === el.dataset.id));
      results.style.display = 'none';
    }));
    const createEl = results.querySelector('[data-create]');
    if (createEl) createEl.addEventListener('click', async () => {
      const created = await onCreate(term);
      results.style.display = 'none';
      if (created) onSelect(created);
    });
  }, 150));
  document.addEventListener('click', (e) => {
    if (!results.contains(e.target) && e.target !== input) results.style.display = 'none';
  });
}
