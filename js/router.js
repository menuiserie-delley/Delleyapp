const routes = [];

export function route(pattern, handler) {
  // pattern like '/offerten/:id'
  const paramNames = [];
  const regex = new RegExp(
    '^' + pattern.replace(/:[^/]+/g, (m) => { paramNames.push(m.slice(1)); return '([^/]+)'; }) + '$'
  );
  routes.push({ regex, paramNames, handler });
}

export function navigate(path) {
  window.location.hash = '#' + path;
}

async function resolve() {
  const hash = window.location.hash.replace(/^#/, '') || '/dashboard';
  const [pathPart] = hash.split('?');
  for (const r of routes) {
    const m = pathPart.match(r.regex);
    if (m) {
      const params = {};
      r.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
      document.querySelectorAll('#nav a, #mobile-tabbar a, .mobile-more-panel a').forEach(a => a.classList.remove('active'));
      const topSegment = pathPart.split('/').filter(Boolean)[0];
      document.querySelectorAll(`#nav a[data-route="${topSegment}"], #mobile-tabbar a[data-route="${topSegment}"], .mobile-more-panel a[data-route="${topSegment}"]`)
        .forEach(a => a.classList.add('active'));
      window.scrollTo(0, 0);
      await r.handler(params);
      return;
    }
  }
  document.getElementById('main').innerHTML = '<div class="empty-state"><div class="icon">🤔</div>Seite nicht gefunden.</div>';
}

export function startRouter() {
  window.addEventListener('hashchange', resolve);
  resolve();
}
