# PWA View

**When to use:** Adding a new vanilla-JS SPA route under `pwa/views/`.
**Canonical examples:** `pwa/views/inbox.js`, `pwa/views/backlog.js`, `pwa/views/finance.js`
**Router:** `pwa/index.html::handleRoute` (hash-based, ~line 2056)
**Service worker:** `pwa/sw.js` (CACHE_NAME templated as `%%CACHE_VERSION%%`)
**REST backend:** `telegram/src/webapp/routes/<domain>.ts`
**Related:** [websocket-auth.md](websocket-auth.md), [notifications.md](notifications.md)

## Shape

View file — `pwa/views/<name>.js` (classic script, no build step):

```js
/* global api, navigate, showToast, viewCleanup, esc, timeAgo, getAuthToken */

function renderXxxView(app, opts = {}) {
  // 1. Inject scoped styles once.
  const style = document.createElement('style');
  style.textContent = `
    .xxx-view { padding: 16px; }
    .xxx-card { background: var(--bg2); border-radius: 12px; padding: 12px; }
  `;
  if (!document.getElementById('xxx-style')) {
    style.id = 'xxx-style';
    document.head.appendChild(style);
  }

  // 2. Build DOM into the app container.
  app.innerHTML = '<div class="xxx-view"><div id="xxx-list">Loading...</div></div>';

  // 3. Fetch via dedupFetch (defined on window in pwa/components/fetch-dedup.js).
  const load = async () => {
    const data = await window.dedupFetch('/api/xxx/list', {}, window.api);
    document.getElementById('xxx-list').innerHTML = renderList(data.items);
  };
  load();

  // 4. Register cleanup if the view opens WebSockets, timers, or listeners.
  viewCleanup['xxx'] = () => { /* close ws, clearInterval, remove listeners */ };
}

window.renderXxxView = renderXxxView;
```

Register the route — `pwa/index.html`, inside `handleRoute`'s `switch (hash)`:

```js
case 'xxx': renderXxxView(app); break;
```

And include the script tag in `pwa/index.html`'s `<head>`/before the router
script (order matters — classic scripts, no modules).

Backend route — add an endpoint in `telegram/src/webapp/routes/<domain>.ts`
and wire it into `webapp/router.ts` so `/api/xxx/...` resolves. CloudFront only
forwards paths that match `/api/*` or `/ws/*`; static `/views/*.js` is served
straight from S3.

Service worker — `pwa/sw.js` line 1 reads `const CACHE_NAME = '%%CACHE_VERSION%%';`,
substituted by CI on every deploy. You do **not** hand-bump it. What you must do
is add the new view file to the `PRECACHE_URLS` array; without that line, the
file is served on first hit but missing on offline reload.

## Required (acceptance checklist)

- [ ] View file at `pwa/views/<name>.js`, exports `renderXxxView` on `window`.
- [ ] Registered in `pwa/index.html::handleRoute` switch *and* the `<script>` tag list.
- [ ] GETs use `window.dedupFetch(url, opts, window.api)` — never raw `fetch()` for list/detail loads.
- [ ] Styles scoped under a `.xxx-view` / `.xxx-card` namespace.
- [ ] Card-shaped UI built via `pwa/components/card.js` (not ad-hoc HTML string builders).
- [ ] Cleanup registered in `viewCleanup['xxx']` if the view opens sockets, timers, or global listeners.
- [ ] Backend route lives under `/api/<domain>/...` (CloudFront-forwarded) and is registered in `webapp/router.ts`.
- [ ] Admin-only data gated by `/api/user/me` permissions + nav entry hidden for non-admin.
- [ ] `sw.js` `PRECACHE_URLS` lists the new view file (CI templates `CACHE_NAME` automatically).
- [ ] If the view surfaces real-time updates, WS reconnect/keepalive follows `pwa/components/chat-connection.js`.

## Anti-patterns

- Pulling in a framework (React, Vue, Svelte, …) — the PWA is deliberately
  framework-free and served as static files from S3. Adding a build step
  breaks the zero-build invariant and CI/CD assumptions.
- Raw `fetch()` on route entry — duplicated in-flight requests fire on every
  remount; `dedupFetch` coalesces identical URLs.
- Forgetting to add the new view file to `sw.js` `PRECACHE_URLS` — users stay pinned to the old
  precache and never see the new view or fixes.
- Adding a non-`/api/*` / non-`/ws/*` path expecting the webapp server to
  handle it — CloudFront routes those to S3 and the SPA fallback returns
  `index.html`. See CLAUDE.md "CloudFront routing blindspot".
- Mutating `document.body` or top-level DOM outside the `app` container —
  router cleanup only wipes `#app`, so stray nodes leak across routes.
- ES modules / `type="module"` scripts — the rest of the PWA loads as
  classic scripts; mixing modes breaks global exports that other views rely
  on (`renderXxxView`, `api`, `navigate`).

## Extending

1. Create `pwa/views/<name>.js` with `renderXxxView(app, opts)`.
2. Add the `<script src="views/<name>.js">` tag in `pwa/index.html`.
3. Add the `case '<name>': renderXxxView(app); break;` arm in `handleRoute`.
4. Add a nav entry (tab bar or submenu) that calls `navigate('<name>')`.
5. Add REST routes under `telegram/src/webapp/routes/<domain>.ts` and register in `webapp/router.ts`.
6. Bump `sw.js` CACHE_VERSION in the deploy.
7. Transpile check + push via CI/CD.
