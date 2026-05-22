# PWA Component

**When to use:** Extracting a repeated UI pattern out of one or more `pwa/views/*.js` files, or creating a new shared visual primitive.
**Canonical examples:** `pwa/components/card.js` (builder API), `pwa/components/ux-primitives.js` (badge/lane/queue taxonomy), `pwa/components/inbox-panel.js` (panel-shape with WS bindings).
**Catalog:** [`pwa/components/CATALOG.md`](../../pwa/components/CATALOG.md) — the **scenario → default-component** map. Before authoring any new component, grep CATALOG for the scenario; if a default exists, use it. Every new component **must** be added to CATALOG as part of the same commit (the `/component` skill enforces this — see Gate 5 of `/component new`).
**Showcase — two surfaces:**
- **Local dev:** Storybook framework (npm) at `pwa/.storybook/` — run `cd pwa && bun install && bun x storybook dev -p 6006`. Stories live next to components (`pwa/components/<name>.stories.js`). Hot reload, controls panel, organized sidebar (Cards / Chrome / Controls / etc.). The IIFE component files are loaded via `pwa/.storybook/preview-head.html` `<script>` tags — stories call `window.<symbol>` directly, identical to production view code. **Dev-only** — never ships to prod.
- **Live URL:** `pwa/storybook.html` — a single static HTML file served from S3 at `https://app.frankwinkler.me/storybook.html`. No build step required for deploy. Both surfaces showcase the same component code. Keep both up to date as new components land — the static page is the no-tooling fallback that survives even when the dev environment is broken.
**Service worker:** `pwa/sw.js` — every component file consumed by a view must be precached.
**Index registration:** `pwa/index.html` — every component file must have a `<script>` tag in the head, before any view that consumes it.
**Related:** [pwa-view.md](pwa-view.md), [test-pwa-classic-script.md](test-pwa-classic-script.md)

## Why this exists

The PWA is deliberately framework-free, no-build, classic-script-tag. Components must work as plain JS files served straight from S3. We don't use Web Components custom elements, ES modules, or a bundler — and we shouldn't, because that constraint is what makes the PWA cheap, debuggable, and offline-capable.

What we *do* use, repeatedly:

- **One file per component**, IIFE-wrapped, idempotent on multiple loads.
- **Lazy single style injection** — the file's first execution adds a `<style>` tag with a unique `id`; subsequent loads short-circuit.
- **A factory or builder that returns either an HTML string or a DOM element** — never a React-flavored render-into-container API. View code decides where to put it.
- **CSS custom properties** (`var(--bg)`, `var(--bg2)`, `var(--text)`, `var(--hint)`, `var(--btn)`, `var(--link)`) for color — never hex literals — so dark/light themes flow through automatically.
- **Class names namespaced** with the component's own prefix (`.pwa-card`, `.ux-state`, `.inbox-panel`) so they don't collide with any view's local styles.

## Shape — string-builder component

For pure-presentation components that return HTML strings (cards, badges, panels with no interactive lifecycle):

```js
/**
 * <Name> — one-line purpose.
 *
 * Returns an HTML string. Drop into any view's container.innerHTML.
 *
 * Usage:
 *   const html = nameComponent({ icon: '🍅', title: 'Pomodoro' });
 *   container.innerHTML = html;
 */

(function () {
  if (window.__nameComponentLoaded) return;
  window.__nameComponentLoaded = true;

  const style = document.createElement('style');
  style.id = 'name-component-style';
  style.textContent = `
    .name-component { background: var(--bg2); border-radius: 12px; padding: 12px; }
    .name-component-title { font-size: 16px; font-weight: 700; color: var(--text); }
    .name-component-hint { font-size: 13px; color: var(--hint); }
  `;
  if (!document.getElementById(style.id)) {
    document.head.appendChild(style);
  }

  window.nameComponent = function nameComponent(opts = {}) {
    const { icon = '', title = '', hint = '' } = opts;
    return `
      <div class="name-component">
        <div class="name-component-title">${icon} ${esc(title)}</div>
        ${hint ? `<div class="name-component-hint">${esc(hint)}</div>` : ''}
      </div>
    `;
  };
})();
```

## Shape — interactive component

For components with behavior (WS subscriptions, timers, focus management) — see `pwa/components/inbox-panel.js`:

```js
(function () {
  if (window.__inboxPanelLoaded) return;
  window.__inboxPanelLoaded = true;

  // ... style inject as above ...

  window.mountInboxPanel = function mountInboxPanel(container, opts = {}) {
    container.innerHTML = '<div class="inbox-panel">…</div>';
    const ws = openSocket();
    const cleanup = () => { ws.close(); };
    return cleanup; // caller stores in viewCleanup[viewName]
  };
})();
```

The interactive shape returns a **cleanup function**. The consuming view stores it in `viewCleanup[<name>]` so route changes tear down WebSockets, intervals, and listeners.

## Required (acceptance checklist)

- [ ] One file at `pwa/components/<name>.js`, IIFE-wrapped, classic script (no `import`/`export`).
- [ ] `if (window.__<name>Loaded) return;` guard at the top — multi-load is a no-op.
- [ ] Style injected exactly once via `document.getElementById(<style-id>)` check.
- [ ] All colors reference CSS custom properties (`var(--bg)`, `var(--text)`, etc.) — no hex literals or named colors.
- [ ] Class names prefixed with the component name — no bare `.title`, `.row`, `.badge`.
- [ ] Public API exposed on `window.<name>...` — never `globalThis`, never module exports.
- [ ] Output uses `esc()` (defined in `pwa/index.html`) on any user-supplied string before interpolation.
- [ ] Registered in `pwa/index.html` `<head>` with a `<script src="/components/<name>.js"></script>` tag, **before** any view that consumes it.
- [ ] Listed in `pwa/sw.js` precache array.
- [ ] Showcased in **both** `pwa/storybook.html` (static, live URL) and `pwa/components/<name>.stories.js` (Storybook framework, local dev) with realistic examples covering each meaningful state.
- [ ] Registered in `pwa/components/CATALOG.md` with a one-line scenario, the public-API one-liner, and a `file:line` pointer.
- [ ] If it accepts user-supplied HTML or content, the docstring explicitly states the escaping contract.
- [ ] If interactive, returns a cleanup function and the consuming view registers it in `viewCleanup[<view-name>]`.

## Lazy DOM access — components load before `<body>` is ready

Component `<script>` tags in `pwa/index.html` execute as the browser parses the head, **before** the `<body>` has rendered. A component that touches `document.body` synchronously at module load — or in a function called synchronously by the head — will get `null` and crash.

The canonical guard, used by `pwa/components/toast.js` for the lazy-element-create path:

```js
function getToastEl() {
  if (toastEl && toastEl.isConnected) return toastEl;
  toastEl = document.createElement('div');
  if (document.body) {
    document.body.appendChild(toastEl);
  } else {
    document.addEventListener(
      'DOMContentLoaded',
      () => document.body.appendChild(toastEl),
      { once: true },
    );
  }
  return toastEl;
}
```

Style injection into `document.head` is safe at module-load time (the `<head>` is being parsed *while* the script runs, so it always exists). It's `document.body` and `document.querySelector('#some-app-element')` that need the deferral. Test for this in your component test by calling its API before any `DOMContentLoaded` event fires.

## Backward compatibility when extracting from `pwa/index.html`

When a component formalizes a function that already lives in `index.html` (called from many views — `showToast`, `haptic`, `apiFetch`, etc.), the new component **must** preserve the existing call signature. Existing call sites must not need to change in the same PR.

Concretely:
- New optional parameters only (`showToast(msg)` keeps working; `showToast(msg, kind)` adds the explicit form).
- Return shape unchanged (no swap from `void` → `Promise`, etc.).
- Window symbol unchanged (`window.showToast` stays attached at the same path; new namespaced helpers like `window.Toast.<kind>` are additive).

Why the discipline: extracting from `index.html` always touches a globally-used symbol. If the new shape requires migrating call sites, you've doubled the surface area of the change and made every consumer view a potential breakage. Add the new namespace, keep the old one, migrate views opportunistically in later PRs.

## When to extend, when to redesign, when to spec

Three questions, asked in order. The first "yes" decides the path.

### 1. Does the change require any existing consumer's call site to change before the new code ships?

If **no** → the change is **additive**. Use `/component extend <name>`. The component grows new methods / parameters / namespaced helpers; old call sites work unchanged; consumers adopt the new capability opportunistically in follow-up PRs.

If **yes** → continue to question 2.

### 2. Does the change require simultaneous changes to backend API shape, schema, or scheduler-job behavior?

If **no** → the change is a **breaking PWA-only redesign**. Drive it from a spec under `.claude/specs/component-<name>-redesign/`. The spec's tasks file becomes the migration plan: one task for the new component shape, one task per consumer migration, optional deprecation-cleanup task. The `/component` skill still handles the per-task mechanics (storybook, CATALOG row, sw.js precache); `/spec` handles the multi-PR coordination, status, and review discipline.

Why a spec: breaking changes touch N+1 PRs, span weeks, require explicit dependency ordering, and benefit from the spec-workflow's review cap and gate discipline. The single-PR `/component` flow can't track multi-PR state.

If **yes** → continue to question 3.

### 3. Acknowledge the cross-stack scope.

Backend-coupled redesigns (component behavior changes drive API shape changes — e.g. the `inbox-panel` component needing a new `/api/inbox/*` shape) **always** spec-driven. The spec's design must include a "Backend coordination" section sequencing the work:

1. **Additive backend endpoint ships first** — new shape lives alongside old, no consumers yet.
2. **Component PR adopts the new endpoint** — component test confirms both old and new shapes parse cleanly until the rollout completes.
3. **Consumer views migrate opportunistically** — same as the breaking-redesign flow in question 2.
4. **Old endpoint deprecated** — flagged in code, telemetry counts remaining callers.
5. **Old endpoint removed** — final PR after telemetry confirms zero callers for the cooldown window.

The `/component` skill is invoked from inside the spec's task execution, not as the orchestrator. Don't try to drive a backend-coupled migration from `/component` alone.

### Decision summary

| Question 1 (additive?) | Question 2 (PWA-only?) | Question 3 (backend?) | Use |
|---|---|---|---|
| yes | — | — | `/component extend` |
| no | yes | no | `/spec` (PWA-only redesign) |
| no | no | yes | `/spec` (backend-coupled, with explicit "Backend coordination" section) |

The skill's `/component status` command surfaces all currently in-flight work in any of these tiers so the multi-PR coordination stays visible.

## Anti-patterns

- **Inline `<style>` blocks in view files for shared patterns.** If two views render a status badge, the third one shouldn't introduce a third copy. Extract.
- **Web Components / `customElements.define()`.** Adds cross-browser quirks the rest of the codebase doesn't pay for. Out of scope.
- **ES modules (`import`/`export`).** The PWA is loaded as classic scripts; mixing module/non-module breaks the order guarantee.
- **Hex color literals.** Locks the component out of theme switching. Use `var(--*)` and add a token if needed.
- **Returning DOM nodes when an HTML string would do.** String concatenation composes; appended nodes don't, and they fight `innerHTML` resets.
- **Side effects at file load** beyond style injection (WS connections, fetches, timers). The component should be inert until called.
- **Bare class names** like `.title`, `.list`, `.button`. They will collide with a view's local CSS. Always namespace.
- **Skipping `pwa/storybook.html`.** A component without a story isn't reviewable, isn't reusable, and rots invisibly.

## Extending — adding a new component

1. Run `/component audit` to confirm the pattern actually appears in 2+ views (don't extract a one-off).
2. Run `/component extract <view> <pattern-name>` to scaffold the component file, swap the source view's usage, and add a storybook section.
3. Open `pwa/storybook.html` locally (`open pwa/storybook.html` or via `python3 -m http.server` from `pwa/`) and confirm the section renders correctly across the realistic states.
4. Migrate other consuming views one at a time; each migration is its own commit.
5. Bump `CACHE_VERSION` in `pwa/sw.js` when the file is added or its public API changes.
