# Adding a PWA View

> **⚠️ STALE STACK — ported from personalassistant, not yet rewired for companygraph.** Describes the personalassistant vanilla-JS no-build PWA (`pwa/views/*.js`, hash router in `index.html`, `sw.js` precache, Telegram webapp server). companygraph's PWA is **Vite + React + TS under `pwa/src/`**: add views as `pwa/src/views/**/*.tsx`, wire them in `pwa/src/route.ts`, style with CSS modules over `var(--…)` tokens, and verify with `bun run typecheck` + `scripts/design-conformance.ts`. The component catalog is `design-system.manifest.yaml` (managed by `/wireframe-extract`). Reconcile against this repo before following any instruction below.

Guide for adding a new view to the Progressive Web App.

## Before you write markup — consult the component catalog

Read [`design-system.manifest.yaml`](../../../design-system.manifest.yaml) first. It maps every recurring UI scenario (state badges, cards, panels, action bars, empty states, …) to the default component the view should use. Hand-rolling markup that duplicates a catalog row is the most common drift in this codebase.

If the view needs a UI shape that isn't in the catalog and will repeat across 2+ views, run `/component new <scenario>` before continuing — the originating flow designs, reviews, deploys, and registers the component, after which you import it from the view.

**Adding this view from a design dropped in `docs/design/`?** Don't run this skill standalone — run `/design-apply` (`.claude/skills/design-apply/`). It decides fresh-vs-migrate, calls *this* skill for the fresh case, and enforces the deterministic companygraph-conformance gate (`scripts/design-conformance.ts`) plus a per-surface human review gate that a standalone `/add-pwa-view` would skip.

## Architecture

The PWA is a vanilla JS SPA with no build step. Files are served directly from S3 via CloudFront.

```
pwa/
├── index.html      — App shell, router, tab bar, shared styles
├── sw.js           — Service worker (cache strategy)
├── manifest.json   — PWA manifest
├── views/          — One JS file per view (lazy-loaded modules)
└── components/     — Shared components
```

## Files to Create/Modify

### 1. View File (CREATE): `pwa/views/<name>.js`

```javascript
// pwa/views/<name>.js
export function init(container) {
  // Called when view first loads
  container.innerHTML = `
    <div class="view-header">
      <h2>View Title</h2>
    </div>
    <div id="<name>-content" class="view-content">
      <!-- Content here -->
    </div>
  `;

  // Fetch data
  loadData();
}

export function cleanup() {
  // Called when navigating away (optional)
  // Clean up WebSocket connections, intervals, etc.
}

async function loadData() {
  try {
    const res = await fetch('/api/<name>/data');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderData(data);
  } catch (err) {
    document.getElementById('<name>-content').innerHTML =
      `<div class="error">Failed to load: ${err.message}</div>`;
  }
}

function renderData(data) {
  // DOM manipulation
}
```

### 2. Register in Router: `pwa/index.html`

In the `VIEWS` config object:

```javascript
const VIEWS = {
  // ... existing views ...
  '<name>': { module: 'views/<name>.js', icon: '📋', label: 'Name' },
};
```

Add a tab button in the tab bar HTML (max ~7 tabs):

```html
<button class="tab-btn" data-view="<name>">
  <span class="tab-icon">📋</span>
  <span class="tab-label">Name</span>
</button>
```

### 3. API Backend: `telegram/src/webapp-server.ts`

Add API routes for data:

```typescript
if (path.startsWith("/api/<name>/")) {
  // Handle CRUD operations
  if (method === "GET" && path === "/api/<name>/data") {
    const data = getData();
    return new Response(JSON.stringify(data), { headers: jsonHeaders });
  }
}
```

### 4. Service Worker Cache: `pwa/sw.js`

Add to precache list (update cache version):

```javascript
const PRECACHE_URLS = [
  // ... existing ...
  'views/<name>.js',
];
```

Bump cache name version: `personal-assistant-v7` (from v6).

### 5. WebSocket (if streaming needed)

In `webapp-server.ts`:

```typescript
if (path === "/ws/<name>") {
  server.upgrade(req, { data: { type: "<name>", chatId } });
  return;
}
```

In the view JS, connect:

```javascript
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${location.host}/ws/<name>`);
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  // Handle streaming updates
};
```

### Styling Conventions

- Use CSS custom properties from Telegram theme: `var(--tg-theme-bg-color)`, `var(--tg-theme-text-color)`, etc.
- Status dots: `.status-dot.todo`, `.status-dot.in-progress`, `.status-dot.done`
- Cards: Use `.card` class with `.card-header`, `.card-body`
- Loading: Use `.skeleton` class for shimmer loading states
- Spacing: 12px padding standard, 8px for compact

### Deploy

After creating the view:

```bash
cd /Users/frank/Documents/coding/personalassistant && ./scripts/deploy-pwa.sh
```

This syncs to S3 and invalidates CloudFront caches for `/views/*`.
