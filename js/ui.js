export function toast(message, type = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3600);
}

export function openModal({ title, bodyHtml, footerHtml, onMount, width }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" style="${width ? `max-width:${width}` : ''}">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" data-close>&times;</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    </div>`;
  const backdrop = root.querySelector('.modal-backdrop');
  const close = () => { root.innerHTML = ''; };
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  root.querySelector('[data-close]').addEventListener('click', close);
  if (onMount) onMount(root, close);
  return close;
}

export async function confirmDialog(message, { confirmLabel, danger = true, lang = 'de' } = {}) {
  const isFr = lang === 'fr';
  const title = isFr ? 'Veuillez confirmer' : 'Bitte bestätigen';
  const cancelLabel = isFr ? 'Annuler' : 'Abbrechen';
  const okLabel = confirmLabel || (isFr ? 'Supprimer' : 'Löschen');
  return new Promise(resolve => {
    const close = openModal({
      title,
      bodyHtml: `<p style="margin:0;color:var(--ink)">${message}</p>`,
      footerHtml: `
        <button class="btn" data-cancel>${cancelLabel}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${okLabel}</button>`,
      onMount: (root) => {
        root.querySelector('[data-cancel]').addEventListener('click', () => { close(); resolve(false); });
        root.querySelector('[data-ok]').addEventListener('click', () => { close(); resolve(true); });
      },
    });
  });
}
