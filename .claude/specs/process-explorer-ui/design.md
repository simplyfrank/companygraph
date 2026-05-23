---
feature: "process-explorer-ui"
created: "2026-05-23"
author: "frank"
status: "in-review"
revision: 2
size: "large"
depends_on: ["graph-core", "ontology-manager"]
amends: ["graph-core (one new endpoint: GET /api/v1/query/search; six per-label fulltext indexes added to api/src/neo4j/bootstrap.ts)"]
resolves_open_questions: "10 open questions from requirements §Risks + 5 open-accepted carry-forwards from req pass-2 review + 4 blockers/9 concerns/5 nits from design pass-1 review (first sweep) + 4 blockers/11 concerns/7 nits from design pass-1 review (second sweep, 2026-05-23)"
revision_2_change: "Absorb the second-sweep pass-1 design review (4 blockers + 11 concerns + 7 nits). B-01 locks the explorer route names to the live scaffold (`journey-detail`, `journey-graph`, `path-finder`) propagated from requirements rev 4. B-02 pushes the `_review.status==needs_review` (and `_verification.at`) predicate into Cypher via regex, preventing verified rows from starving the queue. B-03 adds a minimal `pwa/src/views/sme/Home.tsx` Settings surface (option a) that owns `prefStore.setHomeDomain`, surfaced via a Set-as-home button on every Domain detail page. B-04 re-greps `api/src/storage/nodes.ts` line citations: patchNode is at line 151 (not 121), upsertNode at 200 (not 162), `ON MATCH SET … attributes_json` at 229 (not 162). See §0 Pass-1 review resolutions (rev 2) for the full disposition map."
---

# Design: process-explorer-ui

> One-line: extend the existing 40 %-complete Vite + React PWA scaffold (`pwa/src/`) into a full interactive process-graph explorer with deep-link routes, an interactive canvas (react-flow), a service worker, a zustand-managed schema/selection store, and the SME write paths (forms + bulk paste + review queue + quarterly sign-off). Single one-line amendment to `graph-core` (a complete spec — `execution:complete` 2026-05-23): a new substring-search helper + six per-label full-text indexes added to the existing bootstrap. The rest of the API surface is consumed verbatim.

## §0. Pass-1 review resolutions (rev 2)

`review-design.md` was re-issued as a second-sweep pass-1 review on
2026-05-23 after revision 1 of this design landed. The second sweep
surfaces **4 new blockers + 11 new concerns + 7 new nits** that the
first sweep didn't see (it ran against scaffold + requirements rev 2;
the second sweep runs against scaffold + requirements rev 3 + design
rev 1). Disposition map:

### Second-sweep blockers

| Finding | Disposition | Section |
|---------|-------------|---------|
| **B-01 (sweep-2)** Route names diverge three ways across scaffold (`journey-detail/path-finder`), requirements rev 3 (`journeys`/`path`), and design §3 (`journey`/`path`). AC-11/AC-29/AC-30 tests would route to `domains` (parseHash fallback) and fail outright. | Pick the scaffold names (option a from the review). Requirements rev 4 propagates the rename; design §3 + §9 + §10 absorb the new shape. Journey canvas becomes a sibling tab (`journey-graph`), not a `/:id/canvas` mode under `journey-detail`. | §1, §3, §9, §10, §11 |
| **B-02 (sweep-2)** `reviewQueueForDomain` LIMIT 1001 happens BEFORE the client-side `_review.status === "needs_review"` filter — verified rows starve `needs_review` rows in production. Same shape in `quarterlyHomeJourneys` for overdue partitioning. | Adopt option (b) from the review: push the predicate into Cypher via regex against `attributes_json`. `quarterlyHomeJourneys` symmetrically pushes the `_verification.at` 90-day-old check into Cypher via a date comparison on a substring match. `labels(n)[0] AS label` everywhere (the array shape is acknowledged + flattened at the query). | §4.11 |
| **B-03 (sweep-2)** `prefStore.setHomeDomain` writer UI is referenced by the tooltip + spec but absent from §3 routes, §9 files, and §11 file list — FR-21 is unbuildable as designed. | Adopt option (a) from the review: add a minimal `pwa/src/views/sme/Home.tsx` Settings surface that exposes the home-domain selector + a "Set as home" button on every `<DomainDetail/>` page. New route `#/sme/home`. The tooltip now correctly points to a real surface; AC-17's manual-repro section gains a "navigate to `#/sme/home` and pick a domain" line. | §3, §4.11, §9, §10, §11 |
| **B-04 (sweep-2)** File-line citations to `api/src/storage/nodes.ts:121` (patchNode) and `:162` (upsertNode + `ON MATCH SET`) are off by 30–80 lines. Live file has patchNode at 151, upsertNode at 200, `ON MATCH SET … attributes_json = $props.attributes_json` at 229. | Re-grep done (2026-05-23 — verified via `grep -n "^export async function"` against the live file). All four citations updated. | §4.11, §5.1 |

### Second-sweep concerns

| Finding | Disposition | Section |
|---------|-------------|---------|
| **C-01 (sweep-2)** `useIsHomeDomain` fires a Cypher round-trip on every render of every entity panel with a write button. | Pinned: §4.2's `reads.cypherDedup` is **module-scope** (`const memCache = new Map(...)` at module level — confirmed in §4.2 implementation sketch); the cache survives panel remounts. The null-home short-circuit at line 1119 is **before** the `useFetch` call (no subscription fires); §4.11 hook implementation updated to make that explicit. Cache TTL bumped from 5 min to **30 min** for `homeDomainResolution` only (`reads.cypherDedup(..., {ttlMs: 30*60*1000})`) — the home-domain ancestry of a node is essentially immutable. | §4.2, §4.11 |
| **C-02 (sweep-2)** Bulk-paste rollback can itself fail; "please re-paste" UX is hand-waved (no AC, no UI mock-up, no recovery state shape). | Added **AC-13b** in §10: on double-fault the snapshot is persisted to `sessionStorage` (key `companygraph.bulkPasteRollback.<journeyId>`); a banner mounts on the journey-detail view with the snapshot contents + a "Restore" button that re-fires the rollback `/import`; the banner is dismissable only after the operator confirms or the restore succeeds. §4.11 expanded. | §4.11, §10, §12 |
| **C-03 (sweep-2)** `mergeAttributes` race window is documented but the post-write UI doesn't surface "your write conflicted with another SME's". | Adopt option (a) from the review: documented as a known failure mode in the SME workflow notes. §4.11 now says: "If the post-PATCH read shows attributes you didn't expect to be missing, another SME wrote to the same node within ~1 s — refresh and re-flag." ETag-style optimistic concurrency stays out-of-scope (would require a graph-core extension, breaching NFR-07). | §4.11, §12 |
| **C-04 (sweep-2)** `nodesDraggable={false}` collides with the SME bootstrap workflow ("this layout is wrong, let me drag that node"). | Adopt option (a) from the review: keep `nodesDraggable={false}` for v1 and add a sentence to §4.6 explaining the trade-off. New Risks row: "Node-drag deferred to follow-on spec — v1 canvas is a viewer." | §4.6, §12 |
| **C-05 (sweep-2)** SchemaBootstrap `network unreachable` (TypeError, no Response object) falls into `catch` but the implementation sketch branches on `res.status`. | §4.3 + §4.4 implementation sketch corrected: the fetch wrapper distinguishes `(err) => { /* network */ }` from `(res) => { if (!res.ok) ... }` and the network-failure branch maps to the same `<ErrorState/>` path as 5xx. Wording at §4.3 line 475 was "branches on res.status" — now reads "branches on res.status when a Response is available; the catch arm handles `TypeError: NetworkError` and routes to `<ErrorState/>`." | §4.3, §4.4 |
| **C-06 (sweep-2)** SSE→POLL-MODE state machine doesn't handle synchronous `new EventSource(url)` throw on iOS Safari (CSP mismatch). | §4.4 expanded: the constructor call is wrapped in `try`/`catch`; on synchronous throw, `ERR-COUNT` increments and the state machine engages the same way as `onerror`. `schema-subscription.test.tsx` extended with a fixture that throws on construction. | §4.4 |
| **C-07 (sweep-2)** `html-to-image` Safari export pixel-diff threshold (AC-10) is brittle and underspecified (no baseline image, no threshold, no CI vs local split). | Replace the pixel-diff with a **PNG file-size smoke test** + a **`<text>`-presence check on the SVG**: `foreignObject`-stripped exports are dramatically smaller (≥ 50% size delta on the 4-node fixture). AC-10 wording in §10 updated; the playwright spec asserts `pngSize > 3000 bytes` (the smallest legible export from the fixture) AND `svgContent.includes("<text")`. No baseline image required. | §10 |
| **C-08 (sweep-2)** `/api/v1/stats` variable-keyset (ontology-manager T-09b) is not addressed by §6.1 connectivity-banner / §4.3 SchemaBootstrap consumers. | §6.1 + §4.3 explicit note added: "Stats consumers iterate `Object.keys(stats.nodes)` or use `Object.values(stats.nodes).reduce(...)` — never hard-code the seed-six. Defensive against ontology-manager's variable keyset." | §4.3, §6.1 |
| **C-09 (sweep-2)** Bundle composition table (§6.3) budgets only new-this-spec code, not the cumulative scaffold cost. | §6.3 expanded: the 80 KB "App code" row now reads "All new-this-spec views + components + stores + data layer ON TOP OF the existing scaffold's ~20 KB of components". CI's first-3-runs gating now measures against the **cumulative** dist build, not just the diff. The 275 KB defensive ceiling is conditional on the first 3 measured CI runs (including scaffold) being ≤ 250 KB. | §6.3 |
| **C-10 (sweep-2)** AC-23 (TTI ≤ 2 s) doesn't pin CPU-throttling for CI vs the 2021 MacBook Air baseline. | §10 + AC-23 pinned: `lighthouse … --form-factor=desktop --throttling.cpuSlowdownMultiplier=1 --preset=desktop --output=json --only-categories=performance` against `bun run -C pwa preview` (production build). CI uses the same throttling-multiplier so the number is comparable. Local-machine manual-repro uses the same command. The 2 s threshold lives in `pwa/playwright/lighthouse.spec.ts`. | §10 |
| **C-11 (sweep-2)** AC-24 (60 fps canvas) wiring is "manual on macOS Chrome"; automation path hand-waved. | §10 + AC-24 pinned as **manual-only on macOS Chrome with DevTools Performance**. The playwright spec drops to a programmatic `requestAnimationFrame` tick-counter (`pwa/playwright/canvas-perf.spec.ts` measures rAF cadence over 5 s of programmatic `setViewport` panning) as a smoke regression — that's NOT a true 60 fps assertion but it catches a 10× perf cliff. The manual DevTools Performance recording remains the authoritative AC-24 check. | §10 |

### Second-sweep nits

| Finding | Disposition | Section |
|---------|-------------|---------|
| **N-01 (sweep-2)** `routeStore.ts` interface says `query?`, scaffold uses `params:`. | §3 `Route` interface updated: `params: Readonly<Record<string, string>>` to match scaffold (`pwa/src/route.ts:107`). Tasks-phase rename request retired. | §3, §4.1 |
| **N-02 (sweep-2)** §1's "Decision 5" prose contradicts the Risks table — server-side 2 MB cap or no? | Risks #5 row patched: now reads "**Resolved** — client-side 500-line UI ceiling enforces the cap; no server-side 2 MB cap added (breaches NFR-07)." | §12 |
| **N-03 (sweep-2)** §4.4's `VITE_SCHEMA_SOURCE` env-var has no configuration section. | Moved into new **§6.5 Configuration** subsection covering all env vars introduced by this spec (currently just `VITE_SCHEMA_SOURCE`). | §4.4, §6.5 |
| **N-04 (sweep-2)** Slugify divergence test name (`pwa-ontology-slugify-coverage.test.ts`) target dir unpinned. | Pinned to `pwa/src/__tests__/pwa-ontology-slugify-coverage.test.ts` (vitest, lives alongside the other `__tests__`). | §13 |
| **N-05 (sweep-2)** `proOptions={{hideAttribution: false}}` is the react-flow default. | §4.6 ReactFlow snippet retains the explicit prop with an inline comment: `// explicit so a future codemod can't silently flip it`. | §4.6 |
| **N-06 (sweep-2)** `prompt("Why?")` in `flagForReview` blocks the JS thread and is iOS-Safari-hostile. | Replace with the existing `<Modal/>` (T-12, `react-focus-lock`) — same component used by NewJourney. §4.11's `flagForReview` sketch updated; the prompt is rendered as a dialog with a `<textarea/>` + Cancel/Flag buttons. Tasks-phase carries the diff. | §4.11 |
| **N-07 (sweep-2)** §15's "no coordination needed" with chat-interface claim — chat-interface is in parallel review. | §15 updated: "chat-interface is currently in parallel review; both specs land T-31 of graph-core. The cross-spec touch point is filed in `chat-interface/STATUS.md` so its design author sees the shared dependency." | §15 |

(Note: §0's first-sweep absorption table — the original revision-1 review — is preserved below for traceability.)

## §0a. First-sweep design review absorption (revision 2)

All 4 blockers + 9 concerns + 5 nits from `review-design.md` (pass 1,
first sweep, 2026-05-23) are absorbed below. Cross-reference table:

| Finding | Disposition | Section |
|---------|-------------|---------|
| **B-01** patchNode/upsertNode REPLACE attributes_json (not merge) | Adopted option (b) — **client-side read-modify-write**. New helper `mergeAttributes()` in `pwa/src/data/writes.ts`. FR-18, FR-20, FR-23 rewritten to GET-then-PATCH the merged map. AC-15, AC-16, AC-19 tightened to assert `_review` survives a `_verification` write and vice versa. Race condition acknowledged in §12 (single-tenant single-trust per NFR-08). | §4.11, §10, §12 |
| **B-02** graph-core "deferred backlog" doesn't exist; graph-core is actually `execution:complete` (T-01..T-30 shipped + verified 2026-05-23) | §5.2 + §15 rewritten. Amendment files as **new T-31 in `graph-core/tasks.md`** (post-completion amendment). PR for this spec ships the amendment in the same commit OR blocks on graph-core merging T-31 first. | §5.2, §15 |
| **B-03** SME routes diverge between design (`add/review/quarterly`) and requirements (`new-journey/review-queue/review-quarterly`) | **Bump requirements to revision 3** with shorter scaffold-aligned names + patch AC-25 wording. The scaffold's tab-id naming wins (rationale: tabs are the natural granularity; longer hyphenated names buy nothing). Filed as a separate requirements rev-3 edit (note in §3). | §3, requirements.md rev-3 |
| **B-04** `api/src/db/schema.ts` doesn't exist; bootstrap is at `api/src/neo4j/bootstrap.ts`; also missing schema:apply idempotency AC | Every reference to `api/src/db/schema.ts` patched to `api/src/neo4j/bootstrap.ts`. New AC-32 verifies `bun run schema:apply` second-run idempotency after the amendment. | §5.2, §9, §10, §11 |
| C-01 scaffold file rename audit | Mark scaffold stubs as `modify`, not `new`. Existing files (`Domains.tsx`, `Journey.tsx`, `Graph.tsx`, `Path.tsx`, `Systems.tsx`, `Add.tsx`, `Quarterly.tsx`, `Review.tsx`) absorb the new code; sub-routes (entity-detail, find-path, canvas) route within the same tab file via `route.entityId` / `route.mode` switch. Path/Search/Typeahead remain new components. | §9, §11 |
| C-02 SSE→poll transition mechanism | §4.4 expanded: on 3 consecutive `EventSource.onerror` events, close the EventSource and start a 5-min poll loop; every 30 min the PWA re-attempts `new EventSource(url)` once. New test in `schema-subscription.test.tsx` exercises the fallback path. | §4.4 |
| C-03 SchemaBootstrap 404 vs ErrorState contradiction | §4.3 + §4.4 split the failure modes: **`/api/v1/schema` 404** = silent fall-through to static-tuple fallback + console warning (no `<ErrorState/>`); **`/api/v1/schema` 5xx** = `<ErrorState/>` with retry button. Coded in `pwa/src/components/SchemaBootstrap.tsx`. | §4.3, §4.4 |
| C-04 html-to-image Safari export regression AC | AC-10 tightened: the Playwright spec asserts the exported PNG contains the journey name as legible text via pixel-diff threshold; SVG opens with `<text>` elements present. New playwright spec: `pwa/playwright/canvas-export.safari.spec.ts`. | §10, §11 |
| C-05 bulk-paste two-RT rollback | §4.11 (FR-16) expanded: on `/import` failure after the delete succeeded, the client re-issues the original PRECEDES chain from the pre-delete snapshot. Pre-delete snapshot is taken inside the same `submit()` function. New risk entry in §12. AC-13 tightened. | §4.11, §10, §12 |
| C-06 cypher passthrough greppability | Four ad-hoc Cypher strings consolidated into `pwa/src/data/cypher-queries.ts`. Each query named (`reviewQueueForDomain`, `activityFilterAnd`, `verifyingRoleName`, `homeDomainResolution`). | §4.9, §4.11, §9, §11 |
| C-07 useIsHomeDomain dedup key | §4.2 dedup key extended to `URL + body-hash` for POST `/api/v1/query/cypher` requests; `pwa/src/data/reads.ts` hashes body content via `crypto.subtle.digest("SHA-256", body)` (Web Crypto, no extra dep). | §4.2 |
| C-08 PathRow → label hydration | §4.8 expanded: after `api.findPath()` returns the id-arrays, the PathFinder issues one Cypher hydration query (`MATCH (n) WHERE n.id IN $ids RETURN n.id, labels(n)[0] AS label, n.name`) + one for edge types (already in the path's `edges[]` array from graph-core's `PathRow`). | §4.8 |
| C-09 `PART_OF*1..3` silently caps deeply-nested locations | Bumped to `PART_OF*1..8` (matches graph-core/NFR-09 `maxDepth`). 5 s per-query timeout bounds cost. Applied to FR-19 review queue + `useIsHomeDomain` resolution. | §4.11 |
| N-01 bundle table tightness | §6.3 measurement methodology pinned in `pwa/scripts/bundle-check.mjs` — emits per-chunk gzipped sizes in CI logs. | §6.3, §11 |
| N-02 SSE `retry: 5000` cross-spec coordination | Added to §5.3 "Open coordination notes" — ontology-manager must emit `retry: 5000` on each connect for the design's reconnect cadence to match. | §5.3 |
| N-03 dagre package name pin | `@dagrejs/dagre` (1.x maintained fork) — pinned in §11. The deprecated `dagre` package on npm is NOT used. | §4.6, §11 |
| N-04 slugify divergence | §4.6 footnote: when ontology-manager ships, a coverage test asserts `pwa/src/lib/slugify.ts` matches ontology-manager's slugify byte-for-byte. Filed as follow-up task in §13. | §4.6, §13 |
| N-05 pin §13 items 5+6 | **Bundle threshold tuning** locked here: defensive ceiling = **275 KB gz** if first 3 CI runs are ≤ 250 KB. **Schema-fallback console warning copy** locked: `"[schemaStore] /api/v1/schema returned 404 — falling back to compile-time NODE_LABELS/EDGE_TYPES (set VITE_SCHEMA_SOURCE=static to suppress this warning). When ontology-manager ships, this fallback path will deactivate."` Removed from §13. | §6.3, §4.4, §13 |

## §1. Scope & decisions resolved at design time

This section answers the 10 open design questions from
`requirements.md §Risks` plus the 5 open-accepted findings carried from
the requirements pass-2 review. The rest of the document elaborates.

| # | Question (from §Risks) | Decision |
|---|------------------------|----------|
| 1 | Canvas library choice | **react-flow 11.x** (locked) |
| 2 | Scope of new `/api/v1/query/search` | **Graph-core amendment, post-completion**: graph-core is `execution:complete` (T-01..T-30 shipped + verified 2026-05-23). This spec files a **new T-31** in `graph-core/tasks.md` carrying both the endpoint and the indexes. Endpoint: `GET /api/v1/query/search?label=:L&q=:q&limit=:n` returning `{rows: [{id, name, label}…]}`. Backed by a per-label **full-text index** (`CREATE FULLTEXT INDEX <label>_name_fulltext IF NOT EXISTS FOR (n:<L>) ON EACH [n.name]`). DDL lives in `api/src/neo4j/bootstrap.ts` (NOT `api/src/db/schema.ts` — that path doesn't exist). See §5.2 + §11. |
| 3 | Out-of-domain guard semantics | **Advisory client-side only** (locked in requirements FR-21). Disabled write buttons + tooltip, no server-side enforcement, no 403. |
| 4 | Service-worker cache budget on Safari | **Precache app shell + the live schema only**. No graph data is precached. Per-route data flows through `network-first → cache → stale-banner`. Hard cap: ≤ 1 MB precache, ≤ 5 MB runtime cache (cleared LRU above). See §4.5. |
| 5 | `/api/v1/import` payload-size limit vs bulk paste | **Client-side guard only** (in-spec; no graph-core extension needed). Bulk-paste UI enforces a **500-line ceiling**: banner above 400 lines, hard stop at 500. Above 500 the SME splits the paste; that workflow is rare enough (per persona-P5 cadence) not to warrant streaming. Per CLAUDE.md's amendment policy, adding a server-side 2 MB cap to `api/src/server.ts` would breach NFR-07 (which restricts graph-core extension to the search helper); this design instead trusts that 500 activity names × ~100 chars/name ≪ Bun's default body limit. If a future operator finds payloads larger than expected, the operator can curl-bypass the client guard — single-tenant single-trust per NFR-08. |
| 6 | Per-route data cache strategy | **Network-first, cache-fallback on read endpoints**; **never cache writes**. Cached payloads are tagged with `cached_at` so the "stale" banner can show absolute age. |
| 7 | Native back-gesture vs canvas pan | Canvas-pan handler ignores `touchstart` events whose initial `clientX < 20`. This loses 20 px of pan-from-left-edge fidelity on iPhone but Apple's swipe-from-edge gesture is non-negotiable. Documented in §8. |
| 8 | `PRECEDES` cycle tiebreaker | **`createdAt` ASC** (already pinned in requirements FR-03 — retire from Risks #8 per OC-02). |
| 9 | Search ranking / index type | **Full-text index per label** on `name`. Range-only is insufficient for `CONTAINS`-style typeahead. Amendment to `graph-core` documented in §5.2; filed as a **new T-31** in `graph-core/tasks.md` (graph-core is at `execution:complete`; this is a post-completion amendment, not a backfill into a non-existent deferred queue). |
| 10 | Bulk-paste duplicate-name resolution | **Raise error** (already pinned in requirements FR-16): `400 duplicate_activity_name` with `details: {name, line_numbers: [n, m, …]}`. |

### Pass-2 open-accepted resolutions

| Code | Concern | Resolution in this design |
|------|---------|---------------------------|
| NC-01 | `/api/v1/schema` ETag advisory wording | §4.4: the PWA cache (consumer side) sends `If-None-Match: <etag>` on every refresh, binding for the PWA implementation. Server-side ETag emission is a coordination ask filed under §5.3 "Open coordination notes" — ontology-manager must set `ETag` on every 200 to make conditional GETs effective; until then, the PWA tolerates absent ETag (sends `If-None-Match` anyway, no-op on the server). The 5-min poll fallback uses `If-Modified-Since` only when `ETag` is unavailable. |
| OC-01 | Risks #3 historical residue | §1 decision (3) restates the FR-21 advisory-only rule; Risks #3 is purely historical and can be removed in a future requirements revision (out of scope for this design). |
| OC-02 | Risks #8 createdAt tiebreaker now in FR-03 | §1 decision (8) retires this from the open list. |
| OC-03 | Platforms & Input Modes edge cases | §7: explicit row added for **Apple Pencil on iPad** (treated as touch — no pressure / tilt — same handler) and **macOS Safari horizontal-swipe back** (no suppression — fires at the browser, not the canvas, because macOS Safari does not generate `touchstart` events for trackpad swipes). |
| OC-04 | iPhone bulk-paste "open on desktop" hint | §9 / AC-13 extended: on iPhone Safari the `#/sme/add` route renders a stub view with copy `"Bulk paste is desktop-only — open this URL on a Mac or iPad to paste activities."` and a Share-sheet "Copy URL" button. New AC-31 covers this (added in §10). |
| OC-05 | Multi-tab divergence | Acknowledged Scope-out in requirements; this design does NOT add a `BroadcastChannel` listener. Two tabs may show different filter state; that's documented friction, not a defect. |

### Scope guards — what this design does NOT introduce

- **No graph-core write-endpoint extensions.** The new search helper is read-only; all SME write paths route through the existing `POST /api/v1/nodes/:label`, `PATCH /api/v1/nodes/:label/:id`, `POST /api/v1/edges`, and `POST /api/v1/import` endpoints documented in `graph-core/design.md §5.1`.
- **No auth code paths in `pwa/src/`** (NFR-08 / AC-27 grep — re-using `api/__tests__/no-auth-grep.test.ts` curated patterns).
- **No new server-side validators** on top of graph-core's edge endpoint-pair whitelist (`EDGE_ENDPOINTS` in `shared/src/schema/edges.ts`).
- **No offline write-queue.** Writes fail offline with the connectivity banner; the queued-retry path is deferred to a follow-on spec.
- **No multi-tab state sync (BroadcastChannel).** Deferred.
- **No comments / annotations on entities.** Deferred.
- **No real auth / RBAC.** `graph-core/NFR-08` is the project-wide stance.

## §2. Architecture overview

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (iPhone Safari / iPad Safari / macOS Safari / Chrome)   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ pwa/dist/                                                  │  │
│  │   index.html  ─►  /src/main.tsx  ─►  <App/>                │  │
│  │                                                            │  │
│  │   ┌───────────────────────────────────────────────────┐    │  │
│  │   │ <App/> (pwa/src/App.tsx)                          │    │  │
│  │   │   ├── <TopBar/>          (existing)                │    │  │
│  │   │   ├── <SubNav/>          (existing)                │    │  │
│  │   │   ├── <ConnectivityBanner/>  (new, §6.1)           │    │  │
│  │   │   ├── <renderView route/> (existing dispatcher)    │    │  │
│  │   │   │     └── pwa/src/views/explorer/* ── replaces    │    │  │
│  │   │   │         placeholder stubs with full PE-1/2/3    │    │  │
│  │   │   ├── pwa/src/views/sme/*  ── new (SME-1/2/3)       │    │  │
│  │   │   └── <SchemaBootstrap/>  (new, §4.4)               │    │  │
│  │   └───────────────────────────────────────────────────┘    │  │
│  │                                                            │  │
│  │   pwa/src/store/  (zustand store — new)                    │  │
│  │     ├── schemaStore.ts     — labels, edge types, fetched   │  │
│  │     │                        from /api/v1/schema           │  │
│  │     ├── routeStore.ts      — current route + history       │  │
│  │     ├── filterStore.ts     — activity AND-filter URL-sync  │  │
│  │     ├── selectionStore.ts  — current entity + side panel   │  │
│  │     └── prefStore.ts       — home_domain localStorage      │  │
│  │                                                            │  │
│  │   pwa/src/data/  (network layer — wraps pwa/src/api.ts)    │  │
│  │     ├── reads.ts            — fetch helpers (cached)       │  │
│  │     ├── writes.ts           — POST / PATCH (uncached)      │  │
│  │     └── schemaSub.ts        — SSE EventSource manager      │  │
│  │                                                            │  │
│  │   pwa/sw.ts  (new, hand-rolled)                            │  │
│  │     ├── precache app shell + /api/v1/schema (latest)       │  │
│  │     ├── network-first for /api/v1/* reads                  │  │
│  │     ├── cache-first for /assets/*                          │  │
│  │     └── never cache writes (POST / PATCH / DELETE)         │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            ▲                                     │
└────────────────────────────│─────────────────────────────────────┘
                             │ HTTPS (prod) / Vite proxy (dev)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  Bun API server :8787  (127.0.0.1 loopback — NFR-08)             │
│  ─ existing routes from graph-core/design.md §5.1                │
│  + GET /api/v1/query/search?label&q&limit       (this spec)      │
│  + (when ontology-manager lands)                                 │
│      GET /api/v1/schema             ─ ETag, If-Modified-Since    │
│      GET /api/v1/ontology/events    ─ SSE, Last-Event-ID         │
└──────────────────────────────────────────────────────────────────┘
```

The PWA is a **single page** (one `index.html`, one bundle, hash-based
routing) so all client-side state lives in the browser tab. The render
loop is React 18 + `useSyncExternalStore` via zustand's `create()`.

### Workspaces consumed

- `@companygraph/shared` — `Health`, `Stats`, `NodeLabel`, `EdgeType`,
  `EDGE_ENDPOINTS`, `Node`, `Edge` types. The PWA imports these read-only;
  it does NOT mutate the const tuples (they're still authoritative for
  graph-core's edge validator).
- The shared `Schema` type returned by `GET /api/v1/schema` lives in
  `shared/src/schema/runtime.ts` (created by `ontology-manager`).
  Process-explorer-ui imports the type only; the runtime values come
  from the API.

## §3. Routing model

The existing `pwa/src/route.ts` uses a two-segment hash:
`#/<surface>/<tab>`. The process-explorer-ui spec needs deeper routes:

```
#/explorer/domains                                  (FR-01)                     ← scaffold tab id: "domains"
#/explorer/domains/:domainId                        (FR-01 detail)
#/explorer/journey-detail                           (FR-03 list)                ← scaffold tab id: "journey-detail"
#/explorer/journey-detail/:journeyId                (FR-03 detail)
#/explorer/journey-graph                            (FR-11 — canvas list / fallback)  ← scaffold tab id: "journey-graph"
#/explorer/journey-graph/:journeyId                 (FR-11 canvas view)
#/explorer/activities                               (FR-09 — multi-filter)
#/explorer/activities?system=:id&role=:id&...       (FR-09 URL state)
#/explorer/activities/:activityId                   (FR-04)
#/explorer/systems                                  (FR-05 list)                ← scaffold tab id: "systems"
#/explorer/systems/:systemId                        (FR-05 detail)
#/explorer/path-finder                              (FR-10)                     ← scaffold tab id: "path-finder"
#/sme/add                                           (FR-15, FR-16)              ← scaffold tab id (replaces requirements-rev-2 `new-journey`)
#/sme/review                                        (FR-19)                     ← scaffold tab id (replaces requirements-rev-2 `review-queue`)
#/sme/quarterly                                     (FR-22, FR-23)              ← scaffold tab id (replaces requirements-rev-2 `review-quarterly`)
#/sme/home                                          (FR-21 writer — B-03 sweep-2 fix)  ← NEW Settings surface
```

The `#/sme/home` route is **new in design rev 2** (B-03 sweep-2 fix —
see §0). It hosts the `prefStore.setHomeDomain` writer UI, surfaced as
a single-screen Settings view: a dropdown of all known domains
(populated from `/api/v1/query/listDomains`) + a "Set as home" button.
The same writer is also surfaced as a "Set this domain as my home"
button on every `<DomainDetail/>` page (which links into `#/sme/home`
pre-selected). The scaffold's `SURFACES.sme.tabs` must be extended to
add a `{ id: "home", label: "Home" }` entry — see §11 modified files.

### Route name canonicalisation (B-03 first-sweep + B-01 second-sweep resolution)

**First sweep (rev 1 → rev 1 retained, requirements rev 3)**: SME route
names locked to the scaffold tab ids. Requirements revision 2 used
longer hyphenated names (`#/sme/new-journey`, `#/sme/review-queue`,
`#/sme/review-quarterly`); the existing PWA scaffold
(`pwa/src/route.ts:42–48`) uses the shorter tab-id names. Requirements
revision 3 bumped to match.

**Second sweep (rev 1 → rev 2, requirements rev 4)**: explorer route
names locked to the scaffold tab ids — `journey-detail`, `journey-graph`,
`path-finder`. Design rev 1 §3 used singular `journey`/`path` (different
again from requirements rev 3's plural `journeys`/`path`), neither of
which matches the scaffold. Requirements rev 4 propagates the rename;
design rev 2 (this revision) absorbs it across §3, §4.6, §9, §10, §11.
The journey canvas (FR-11) is now a **sibling tab**
(`#/explorer/journey-graph/:id`), not a `/:id/canvas` mode under
`#/explorer/journey-detail/:id`.

Rationale (both sweeps):

- The scaffold tab-id is the natural granularity; multi-word routes
  would force a `kebab-id` vs `id` split that the rest of the codebase
  does not have.
- AC-25's behaviour (Tab into the form, press Escape, expect form
  closes) is unchanged — only the route literal changes.
- AC-11's deep-link test against `#/explorer/journey-detail/<id>` now
  routes correctly via `parseHash`'s `matchedTab` resolution at
  `route.ts:130–137` (the rev-3 shape `#/explorer/journeys/<id>` would
  fall to the surface's first-tab fallback at line 136, breaking the
  test).
- No other AC depends on the old route literals.

The FR-06 (`#/explorer/roles/:id`) and FR-07 (`#/explorer/locations/:id`)
routes from requirements stay; they're under the existing `explorer`
surface so the scaffold has no opinion. `activities`, `roles`, and
`locations` aren't real SubNav tabs in the explorer surface — they're
**virtual tabs** allowlisted by the scaffold via `EXPLORER_VIRTUAL_TABS`
at `pwa/src/route.ts:112`. No scaffold change required for them.

The `home` tab on the `sme` surface is NEW in design rev 2 (B-03 sweep-2
fix) and **does** require scaffold extension — see §11.

### Extension to `route.ts`

`parseHash()` is extended to accept up to **four segments + an optional
query string**. The current two-segment behaviour is preserved (so
chat/ontology/analytics/etc surfaces don't break).

```ts
// pwa/src/route.ts (extended — not rewritten)
// Field name `params` (NOT `query`) — matches the live scaffold at
// pwa/src/route.ts:107. N-01 sweep-2 fix.
export interface Route {
  surface: string;
  tab: string;
  entityId?: string;            // 3rd segment, optional
  mode?: string;                // 4th segment, optional (rare — journey-graph is now its own tab, not a mode)
  params: Readonly<Record<string, string>>;  // ?key=val parsed
}
```

Note: the canvas no longer uses `mode === "canvas"`. The
`journey-graph` tab is a sibling of `journey-detail` and is selected by
`route.tab === "journey-graph"` alone. `mode` is reserved for future
sub-routes that genuinely need a 4th segment.

Search-params are parsed from the trailing `?…` substring of `location.hash`
(not `location.search`, because we're hash-routing). The parser is a
single regex pass; AC-06 verifies that the URL survives reload.

### Why no react-router

A 30-line `parseHash` keeps the bundle under 1 KB and avoids react-router's
~12 KB gzipped cost. NFR-02 (≤ 300 KB gzipped) makes every dependency a
question; the existing scaffold rejected react-router; this design honours
that decision.

### Route → view dispatch

`pwa/src/views/index.ts` exports a `renderView(route)` switch. Today it
handles `(surface, tab)`; the extension reads the new optional `entityId`
+ `mode` fields and dispatches to the entity-specific view:

```ts
// pwa/src/views/index.tsx (extended — note .tsx, not .ts)
export function renderView(route: Route): ReactNode {
  if (route.surface === "explorer") {
    if (route.tab === "journey-graph" && route.entityId)
      return <JourneyGraphCanvas id={route.entityId} />;
    if (route.tab === "journey-graph")
      return <JourneyGraphIndex />;                            // fallback list view
    if (route.tab === "journey-detail" && route.entityId)
      return <JourneyDetail id={route.entityId} />;
    if (route.tab === "journey-detail")
      return <JourneyIndex />;                                 // list
    if (route.tab === "domains" && route.entityId)
      return <DomainDetail id={route.entityId} />;
    if (route.tab === "domains")
      return <DomainIndex />;                                  // list
    if (route.tab === "activities" && route.entityId)
      return <ActivityDetail id={route.entityId} />;
    if (route.tab === "activities")
      return <ActivityFilterList />;
    if (route.tab === "path-finder")
      return <PathFinder />;
    if (route.tab === "systems" && route.entityId)
      return <SystemDetail id={route.entityId} />;
    if (route.tab === "systems")
      return <SystemIndex />;
    if (route.tab === "roles" && route.entityId)
      return <RoleDetail id={route.entityId} />;
    if (route.tab === "locations" && route.entityId)
      return <LocationDetail id={route.entityId} />;
  }
  if (route.surface === "sme") {
    if (route.tab === "home")      return <SmeHome />;          // FR-21 writer (B-03 sweep-2 fix)
    if (route.tab === "add")       return <SmeAdd />;
    if (route.tab === "review")    return <SmeReview />;
    if (route.tab === "quarterly") return <SmeQuarterly />;
  }
  return <NotFoundPanel route={route} />;
}
```

`NotFoundPanel` is the FR-14 "invalid id" surface — it always renders a
"Back to Domains" link, never a blank screen.

## §4. Module-level design

### §4.1 zustand store (new)

Five tiny stores, each with a single concern. **Locked** to zustand
4.5+ (per requirements `Dependencies`). The package gets added to
`pwa/package.json` in T-01 (≤ 4 KB gzipped after tree-shake).

```ts
// pwa/src/store/schemaStore.ts
import { create } from "zustand";

interface SchemaState {
  schema: Schema | null;       // {nodeLabels, edgeTypes}
  etag: string | null;         // last seen ETag from /api/v1/schema
  fetchedAt: number | null;    // Date.now()
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  invalidate: () => void;      // called by SSE handler
}
export const useSchema = create<SchemaState>(...);
```

```ts
// pwa/src/store/filterStore.ts
interface FilterState {
  system: string | null;
  role: string | null;
  location: string | null;
  setFilter: (k, v) => void;
  clearFilter: (k) => void;
  toQueryString: () => string;
  fromQueryString: (s) => void;
}
```

```ts
// pwa/src/store/selectionStore.ts
interface SelectionState {
  selectedEntityId: string | null;
  selectedEntityLabel: NodeLabel | null;
  panelOpen: boolean;
  select: (id, label) => void;
  clear: () => void;
}
```

```ts
// pwa/src/store/prefStore.ts
interface PrefState {
  homeDomainId: string | null;       // persisted to localStorage
  setHomeDomain: (id: string) => void;
  // No multi-user identity — single-tenant per NFR-08.
}
```

```ts
// pwa/src/store/routeStore.ts
// Subscribes to window.hashchange; exposes a readable Route + a writer
// `navigate(route)` that updates location.hash. Existing App.tsx
// `useState<Route>` migrates into this store so the side panel and
// breadcrumbs subscribe to the same source.
```

**Why a store per concern (rather than one big store)?** Each subscriber
re-renders only when its slice changes. The canvas viewport (60 fps,
NFR-04) cannot pay a re-render cost for a search-box keystroke; isolating
slices keeps the dependency graph thin.

### §4.2 Data layer (new)

`pwa/src/data/reads.ts` wraps `pwa/src/api.ts` with:

1. **In-memory cache** keyed by URL with a 30 s TTL (configurable per
   endpoint). Used by panels that mount/unmount on navigation.
2. **AbortController** propagation — every fetch is cancellable on
   route change.
3. **Single-flight de-duplication** — concurrent requests for the same
   URL share one promise.
4. **Stale-while-revalidate** — when SW returns a cached body, the
   layer fires a background revalidation and updates the store.

```ts
// pwa/src/data/reads.ts (sketch)
const inflight = new Map<string, Promise<unknown>>();
const memCache = new Map<string, {data: unknown; at: number}>();

export async function read<T>(
  url: string,
  opts: {ttlMs?: number; signal?: AbortSignal} = {},
): Promise<T> {
  const ttl = opts.ttlMs ?? 30_000;
  const hit = memCache.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  if (inflight.has(url)) return inflight.get(url) as Promise<T>;
  const p = (async (): Promise<T> => {
    const res = await fetch(url, {signal: opts.signal});
    if (!res.ok) throw await asErr(res);
    const data = await res.json();
    memCache.set(url, {data, at: Date.now()});
    return data as T;
  })();
  inflight.set(url, p);
  try { return await p; } finally { inflight.delete(url); }
}
```

Writes go through `pwa/src/data/writes.ts` which intentionally has **no
cache** — each call is a one-shot `fetch()`. Writes throw on non-2xx
and surface the `{error: {code, message, details}}` envelope to the
caller.

### §4.3 App shell

The existing `App.tsx` shell stays. Three additions:

1. **`<ConnectivityBanner/>`** — extracted from the inline TopBar
   indicator into its own component so every route can be evaluated
   for the AC-29 inheritance test. The polling logic moves out of
   `App.tsx`'s `useEffect` and into `pwa/src/data/health.ts`, which
   correctly implements **on-mount + on-visibilitychange→visible +
   every 30 s while visible** (the existing code is missing the
   `visibilitychange→visible` immediate refresh).
2. **`<SchemaBootstrap/>`** — a render-prop component that ensures the
   schema cache is hydrated before its children render. Behavior split
   per §4.4 (B-01-pass-1 fix C-03):
   - While loading → `<Loading/>` placeholder.
   - On `/api/v1/schema` returning **404** (ontology-manager not yet
     deployed) → silently fall through to static-tuple fallback
     (populates `schemaStore.schema` from `@companygraph/shared/schema/
     {nodes,edges}`) + a one-time console warning. The app proceeds.
     No `<ErrorState/>` rendered.
   - On `/api/v1/schema` returning **5xx** → render
     `<ErrorState/>` with a "Retry" button that re-fires the fetch.
   - On **network failure** (`fetch()` rejects with `TypeError:
     NetworkError` — DNS, abort, offline) → same `<ErrorState/>` path
     as 5xx. The fetch wrapper distinguishes the two via:
     ```ts
     try {
       const res = await fetch("/api/v1/schema");
       if (res.status === 404) return fallbackToStatic();
       if (!res.ok) return showErrorState();   // 5xx
       return cacheAndProceed(res);
     } catch (err) {
       // No Response object — `res` doesn't exist in this arm.
       return showErrorState();
     }
     ```
     (C-05 sweep-2 fix — the implementation branches on `res.status`
     when a Response is available; the `catch` arm handles network
     failure separately.)
   - On `/api/v1/schema` returning **200** → cache + proceed.

   **Stats-keyset note (C-08 sweep-2)**: any consumer reading `/api/v1/
   stats` (SchemaBootstrap's sibling code, the connectivity banner,
   future per-label dashboards) MUST iterate `Object.keys(stats.nodes)`
   or use `Object.values(stats.nodes).reduce(...)` — never hard-code
   the seed-six labels. ontology-manager's T-09b ships a variable
   keyset (seed + any registry-added labels); a consumer that hard-codes
   the seed-six will silently drop new labels' counts.
3. **`<SidePanel/>`** — a slide-in drawer that opens when
   `selectionStore.panelOpen === true`. On desktop (≥ 1024 px) it's a
   right-side 400 px column; on tablet (≥ 768 px) a bottom sheet at
   60 % height; on phone (< 768 px) a full-screen modal. CSS
   container-queries gate the layout (no JS resize listener — pure
   `@container` queries on the shell).

### §4.4 Schema cache + SSE (FR-27, FR-28)

The schema is the runtime authority for label and edge-type names.
The cache lifecycle:

```
boot ──► fetch /api/v1/schema ──► schemaStore.schema = json
                                  schemaStore.etag = res.headers.get("etag")
                                  schemaStore.fetchedAt = Date.now()
   ├── open EventSource /api/v1/ontology/events
   │     ├── on "ontology.changed": schemaStore.invalidate()
   │     │     └── next read of schema triggers a re-fetch
   │     │         with If-None-Match: <last etag>
   │     └── on error: log + fall back to 5-min polling
   └── while online + 5 min elapsed + SSE not connected:
         fetch /api/v1/schema with If-None-Match: <etag>
            ├── 304 → no-op
            └── 200 → update store, bump etag
```

**EventSource reconnection** (B-01-pass-1 fix C-02): `EventSource`
auto-reconnects on transient error using its built-in backoff. The
PWA layers an explicit fallback state machine on top:

```
state: SSE-CONNECTED ── onerror ───► ERR-COUNT = 1
                                     ┌── re-open via EventSource auto-retry
                                     ▼
                              ─ onerror again within 60 s ─► ERR-COUNT = 2
                                     ▼
                              ─ onerror again within 60 s ─► ERR-COUNT = 3
                                     ▼
                       close EventSource; enter POLL-MODE
                       start setInterval(refreshSchema, 5*60*1000)
                       schedule single retry: setTimeout(reopenSSE, 30*60*1000)

state: POLL-MODE ── every 5 min ──► fetch /api/v1/schema with If-None-Match
                  ── 30 min mark ─► try new EventSource(url)
                                     ├── opens → SSE-CONNECTED, clear poll
                                     └── errors → stay in POLL-MODE, schedule next 30 min retry
```

The 3-strike threshold avoids flapping between SSE and poll on
intermittent corporate-proxy disconnects (each individual disconnect
gets one auto-retry from the browser). The 30-min SSE retry cadence
in POLL-MODE balances "rejoin the live stream" against "don't hammer a
broken endpoint". State lives in `pwa/src/data/schemaSub.ts`; the
`schema-subscription.test.tsx` test covers both the happy path and the
fallback path by mocking `EventSource` to fire `onerror` 3× within 60 s
and asserting POLL-MODE engages.

**Synchronous-throw handling (C-06 sweep-2 fix)**: iOS Safari can throw
`SecurityError` synchronously from `new EventSource(url)` when CSP
`connect-src` doesn't match the upstream origin. The constructor call
is wrapped in `try`/`catch`; on synchronous throw, `ERR-COUNT`
increments by 1 and the same state-machine transition fires as if
`onerror` had been called. Practical effect: on the 3rd consecutive
synchronous-throw within 60 s, POLL-MODE engages and the schema still
refreshes via the 5-min poll. `schema-subscription.test.tsx` is
extended with a fixture that mocks `EventSource` constructor to throw
on first construction, asserting `ERR-COUNT === 1` after one attempt.

**Soft-dependency fallback (ontology-manager not yet shipped)**: if
`/api/v1/schema` returns 404 (HTTP — the endpoint genuinely doesn't
exist), the SchemaBootstrap component (§4.3) silently falls through to
the static-tuple fallback. The fallback is gated by feature flag
`VITE_SCHEMA_SOURCE=static|runtime`, default `runtime`. A one-time
**startup console warning** announces fallback so the operator sees it:

```
[schemaStore] /api/v1/schema returned 404 — falling back to compile-time
NODE_LABELS/EDGE_TYPES (set VITE_SCHEMA_SOURCE=static to suppress this
warning). When ontology-manager ships, this fallback path will deactivate.
```

The graph-core seed already populates the 6 baseline labels in the
runtime registry once ontology-manager bootstraps, so the fallback path
is short-lived.

**Critical distinction (C-03 first-sweep + C-05 second-sweep fix)**:
404 is **not an error state** — it means "the upstream service hasn't
deployed yet, use the static-tuple fallback". 5xx AND **network
failures** (`TypeError: NetworkError` — no Response object) ARE error
states and surface `<ErrorState/>` with a Retry button. The
`pwa/src/components/SchemaBootstrap.tsx` implementation branches on
`res.status` when a Response is available; the surrounding `catch` arm
handles network failure separately and routes to the same
`<ErrorState/>` path. Code sketch in §4.3 above.

#### Endpoints consumed (frozen contract — owned by ontology-manager)

| Endpoint | Method | Status header | Response |
|----------|--------|---------------|----------|
| `/api/v1/schema` | GET | `ETag`, `Last-Modified` | `{nodeLabels, edgeTypes}` (200) or `304 Not Modified` |
| `/api/v1/ontology/events` | GET | `Content-Type: text/event-stream` | SSE stream with `event_id`, `version_id`, `ts`, `diff_jsonpatch` |

The PWA sends `If-None-Match: <etag>` on subsequent fetches. The SSE
client passes `Last-Event-ID` automatically via the browser's
`EventSource` implementation; on first connect, no header is sent and
the server emits any queued events from its 5-min retention buffer.

**Failure modes handled:**

- SSE never opens (HTTP 404 — ontology-manager not yet deployed)
  → schema cache stays static; 5-min poll-fallback kicks in.
- SSE opens but breaks mid-stream → browser reconnects automatically.
- SSE returns events older than 5 min (event-id older than retention)
  → server returns full stream from oldest available; we
  `schemaStore.invalidate()` defensively so the next read re-fetches.

### §4.5 Service worker (FR-27, AC-20)

**Hand-rolled** at `pwa/public/sw.js` (served as a static file with no
hash so the browser can detect updates). The PWA registers it in
`pwa/src/main.tsx`:

```ts
// pwa/src/main.tsx (extended)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((err) => {
    console.warn("[pwa] SW registration failed:", err);
    // App proceeds without offline support; AC-20 verifies degradation.
  });
}
```

**Caches:**

| Cache | Strategy | Cap | Contents |
|-------|----------|-----|----------|
| `companygraph-shell-v<X>` | Pre-cached on install | n/a | `index.html`, `assets/main-<hash>.js`, `assets/main-<hash>.css`, `manifest.webmanifest`, app icons |
| `companygraph-schema-v<X>` | Network-first | 1 entry | `/api/v1/schema` body (latest) |
| `companygraph-reads-v<X>` | Network-first, then cache fallback | ~5 MB LRU | All `/api/v1/query/*`, `/api/v1/nodes/*`, `/api/v1/edges/*`, `/api/v1/stats` |

**Writes (POST / PATCH / DELETE) are NEVER cached** and never go through
the SW's fetch handler — they bypass with `event.respondWith(fetch(req))`
short-circuit.

**Degradation contract (AC-20):**

- **Safari private mode** — `register()` rejects. App boots; no cache;
  no "stale" banner. The connectivity banner from §6.1 is the only
  offline-state indicator.
- **Quota exhausted** — `caches.open()` throws inside the install
  handler. The SW emits an `install` failure event; the next page load
  retries; if it keeps failing the SW is dormant and the app behaves
  as if SW registration failed.
- **User denied** — same as private mode.

**The "stale" banner only appears when the SW actually served a cached
read for the current route.** It's a discriminated state from
"disconnected" — a 30 s cached read renders the page normally and shows
the banner `"Last refreshed 32 s ago — reconnect to update"` over the
content. The connectivity banner from §6.1 remains separate and shows
on the shell header.

**Cache invalidation on schema change:** the SSE handler in §4.4 posts
`{type: "invalidate-reads"}` to the SW via `navigator.serviceWorker
.controller.postMessage(...)`. The SW receives it in its `message`
handler and clears `companygraph-reads-v<X>` (entries are now stale
because the schema changed).

**Versioning:** The SW cache version (`v<X>`) is baked at build time
from `pwa/package.json` version. A new deploy → new SW → `activate`
event clears old caches.

### §4.6 Canvas — react-flow lock-in (FR-11, FR-12)

**react-flow 11.x** is the canvas renderer. Why:

| Library | Bundle (gz) | React-native | Pinch/pan | Notes |
|---------|-------------|--------------|-----------|-------|
| **react-flow** | ~30 KB | ✅ | ✅ (built-in) | Active maintenance, used by Make, Stripe, etc. ≤ 1 k nodes performant. **Picked.** |
| Cytoscape.js | ~120 KB | wrap | manual gestures | Best-in-class layouts but heavy bundle and bolted-on React. |
| sigma.js | ~70 KB | wrap | WebGL | Overkill for ≤ 200 nodes; canvas instead of SVG = lossy export. |
| d3-force | ~25 KB | DIY | DIY | Most flexibility, longest implementation, no gesture polish. |

**react-flow** has `panOnDrag`, `panOnScroll`, `zoomOnPinch`, and
`zoomOnScroll` props that map cleanly onto FR-12's per-platform
expectations. Touch gestures are handled by react-flow's internal
`useDrag`/`useGesture` wiring; we only need to set the right props per
input mode (no custom touch handlers).

#### Component layout

```
pwa/src/views/explorer/JourneyCanvas.tsx
  ├── <ReactFlowProvider/>
  │     ├── <ReactFlow nodes={nodes} edges={edges}
  │     │     onNodesChange={...}
  │     │     panOnDrag={true}
  │     │     panOnScroll={false}      // wheel = zoom, not pan
  │     │     zoomOnScroll={true}      // mouse wheel zooms
  │     │     zoomOnPinch={true}       // trackpad / touch pinch
  │     │     panOnScrollMode="free"
  │     │     selectionOnDrag={false}  // no rubber-band select v1
  │     │     nodesDraggable={false}   // v1 canvas is a viewer (C-04 sweep-2)
  │     │     proOptions={{hideAttribution: false}}  // explicit so a future codemod can't silently flip it (N-05 sweep-2)
  │     │     fitView                  // initial fit
  │     │  >
  │     │    <Background/>
  │     │    <Controls/>           ← zoom in/out/fit-view buttons
  │     │    <MiniMap/>            ← top-right; hidden on phone
  │     │    <Panel position="top-left">   ← export toolbar
  │     │      <Button onClick={exportPng}>Export PNG</Button>
  │     │      <Button onClick={exportSvg}>Export SVG</Button>
  │     │    </Panel>
  │     │  </ReactFlow>
  │     └── <SidePanel/>      ← driven by selectionStore
  │  </ReactFlowProvider>
```

#### Data flow

1. On mount: `await api.getJourney(id)` returns `{journey, activities[]}`.
2. Map activities → react-flow `nodes`; `PRECEDES` edges → react-flow
   `edges` (resolved client-side from `Activity.id` → `PRECEDES.fromId`).
3. Layout: **`@dagrejs/dagre` (1.x — maintained fork, NOT the deprecated
   `dagre` npm package)** (~10 KB gz) computes initial x/y for
   top-to-bottom flow. react-flow re-renders on drag. Layout is
   **left-to-right** on landscape (`@media (min-width: 768px) and
   (orientation: landscape)`) and **top-to-bottom** otherwise. Tasks
   phase tunes `nodesep` + `ranksep` against the 200-node fixture.
4. Node selection → `selectionStore.select(activityId, "Activity")` →
   `<SidePanel/>` opens with `<ActivityDetail/>` mounted (the same
   panel used by `#/explorer/activities/:id`).

#### Export (FR-13)

PNG: `react-flow`'s `getNodesBounds` + `html-to-image`'s `toPng()`.
**`html-to-image` is ~14 KB gz** — added in T-01. Two variants emitted:
1× at viewport DPR, 2× at viewport DPR × 2 (saved as `<slug>-<iso>@2x.png`).

SVG: `html-to-image`'s `toSvg()`. Text is preserved as `<text>` elements
(not paths) so the SVG is editable in Figma / Illustrator.

Filename: ``${journey.slug ?? slugify(journey.name)}-${iso(today)}.png``.
If `journey.slug` doesn't exist on the node (current scaffold has no
slug field), `slugify(journey.name)` is used. The slug function is
identical to ontology-manager's (lowercase, ascii, hyphenate non-word).

#### Performance ceiling (NFR-04)

- ≤ 200 nodes targeted at 60 fps on a 2021 MacBook Air.
- At 201..500 nodes: label hiding (`<style>` toggle on `[data-label]`),
  edge thinning (`strokeWidth: 0.5`), node radius shrink.
- Above 500: render a stub message `"This journey has N activities —
  open as a list (PE-1.2) for full detail"` with a link to
  `#/explorer/journey-detail/:id`.

react-flow's `nodesDraggable={false}` after initial layout further
reduces re-renders; the canvas is a viewer, not an editor.

**C-04 sweep-2 trade-off**: persona-P5's bootstrap workflow may want to
nudge nodes around when the auto-layout is unsatisfying. v1 explicitly
locks node positions to keep the perf budget honest (NFR-04 ≤ 200 nodes
@ 60 fps) and to defer the editor-vs-viewer affordance question. A
follow-on spec can flip `nodesDraggable={true}` and add a "Save
layout" persistence path; the cost is one render-cycle per drag step.
The Risks table (§12) carries a row noting the deferral.

### §4.7 Search (FR-08)

#### Frontend

A globally-mounted `<SearchPalette/>` listening for `keydown` on
`document.body`. Triggered by:

- `/` keypress when focus is NOT inside an `<input>` or `<textarea>`.
- Click on the SubNav search field.

The palette is a portal rendered above all content (z-index 9999, above
react-flow's controls). Results are grouped by label:

```
Search: "ware"
┌─────────────────────────────────────────┐
│ Activity  (3)                           │
│   ► Warehouse pick                      │
│     Warehouse pack                      │
│     Warehouse dispatch                  │
│ System  (1)                             │
│     WarehouseOMS                        │
└─────────────────────────────────────────┘
```

#### Backend call

The palette queries each label in parallel via the new search helper:

```ts
const labels: NodeLabel[] = useSchema().schema.nodeLabels.map(l => l.name);
const results = await Promise.all(
  labels.map(l => api.search(l, q, 20)),
);
```

This issues N=6 parallel requests (one per current label). 500 ms target
per FR-08 covers the round-trip; each individual request is a Cypher
fulltext lookup expected < 50 ms on `retail-mini`. Schema-aware:
adding a new label via ontology-manager grows the parallel-fan-out by 1.

#### Keyboard contract (AC-05)

- `ArrowDown` / `ArrowUp` move the selected row (cycles within and
  across label groups).
- `Enter` opens the selected row's detail (routes to
  `#/explorer/<label-route>/<id>`).
- `Escape` closes the palette and returns focus to the trigger.

`role="combobox"` + `aria-controls` + `aria-activedescendant` on the
input; `role="listbox"` on the results. Verified by `pwa/src/__tests__/
search.test.tsx`.

### §4.8 findPath UI (FR-10)

The `<PathFinder/>` view at `#/explorer/path-finder` is a form with:

1. Two typeahead pickers — "From" and "To" — sharing the same
   `<SearchPalette/>` machinery.
2. A depth selector `<input type="range" min="1" max="8">`.
3. A "Find path" button.

The button calls `api.findPath(fromId, toId, depth)` which returns
`{rows: [{length, nodes: string[], edges: string[]}]}` — id-arrays
only, per `graph-core/design.md` `PathRow` shape and verified against
`pwa/src/api.ts:48`. **The rendered hop label "Activity → USES_SYSTEM →
System" requires a label hydration pass** (C-08 fix):

```ts
async function findPathWithLabels(fromId, toId, depth) {
  const { rows } = await api.findPath(fromId, toId, depth);
  if (rows.length === 0) return { row: null, nodes: [], edges: [] };
  const row = rows[0];
  // Hydrate node names + labels via one Cypher call.
  const nodeIds = row.nodes;
  const edgeIds = row.edges;
  const { rows: nodeMeta } = await api.cypher(
    `MATCH (n) WHERE n.id IN $ids
     RETURN n.id AS id, labels(n)[0] AS label, n.name AS name`,
    { ids: nodeIds },
  );
  // Edge types: edges[] are edge ids; resolve via a second cypher
  const { rows: edgeMeta } = await api.cypher(
    `MATCH ()-[r]->() WHERE r.id IN $ids
     RETURN r.id AS id, type(r) AS type`,
    { ids: edgeIds },
  );
  // Re-order nodeMeta + edgeMeta to match row.nodes/edges order
  // (Cypher doesn't preserve $ids order) — done client-side via Map.
  return { row, nodes: orderedByIds(nodeIds, nodeMeta), edges: orderedByIds(edgeIds, edgeMeta) };
}
```

Two parallel cypher round-trips after the initial findPath, for the
hydration. Total: 3 API calls per "Find path" click. Acceptable —
findPath itself is the slow one.

State machine:

```
idle ──► loading ──► one of:
                     ├─ success (1 row)        — render hops with edge labels
                     ├─ no-path (0 rows)       — "No path within depth N…"
                     ├─ depth_exceeded         — "Max depth is 8" (and disable >8 in UI)
                     ├─ query_timeout          — "Search timed out after 5 s…"
                     ├─ result_truncated       — "More than 1000 paths matched…"
                     └─ neo4j_unreachable      — "Service offline — try again in a moment"
```

The depth slider is **clamped client-side to 1..8** so a direct
URL-fiddle (`?depth=9`) renders the clamp + hint `"Max depth is 8"`
without firing the API call (AC-07 (c)).

Hop rendering: a horizontal flex row of nodes separated by
`<EdgeLabel/>` chips. On phone, the row wraps; the chips become full-width
between vertically stacked nodes.

### §4.9 Activity multi-filter (FR-09)

The `<ActivityFilterList/>` view at `#/explorer/activities` reads
`?system=&role=&location=` from `route.query` and:

1. Renders a chip strip — one chip per active filter, with an `×` clear
   control. Click `×` → `filterStore.clearFilter(k)` → URL updates.
2. Imports the AND-filter query from
   `pwa/src/data/cypher-queries.ts` (consolidates all 4 raw Cypher
   strings — C-06 fix) and calls `api.cypher(activityFilterAnd, {…})`:

```ts
// pwa/src/data/cypher-queries.ts
export const activityFilterAnd = `
  MATCH (a:Activity)
  WHERE ($systemId IS NULL OR EXISTS { (a)-[:USES_SYSTEM]->(:System {id: $systemId}) })
    AND ($roleId   IS NULL OR EXISTS { (:Role {id: $roleId})-[:EXECUTES]->(a) })
    AND ($locId    IS NULL OR EXISTS { (a)-[:AT_LOCATION]->(:Location {id: $locId}) })
  RETURN a.id AS id, a.name AS name
  ORDER BY a.name ASC
  LIMIT 1001
`;
```

If the response includes a `result_truncated` error, the view shows a
"More than 1000 activities match — narrow your filters" banner. (Per
graph-core/NFR-09 the cypher passthrough enforces ≤ 1000 rows.)

Filter state is **URL-first**: `filterStore.fromQueryString()` runs on
every route change; `filterStore.setFilter(k, v)` rewrites
`window.location.hash`. The store is essentially a thin sync wrapper
around `URLSearchParams`; AC-06 verifies the round-trip.

### §4.10 Deep-link router (FR-14)

The route extension in §3 already provides the wiring. Add the **404
fallback panel** at `pwa/src/views/_shared.tsx`:

```tsx
export function NotFoundPanel({route}: {route: Route}) {
  return (
    <Card>
      <ViewHeader title="Not found" />
      <p>
        We couldn't find that {route.tab === "journeys" ? "journey"
                              : route.tab === "activities" ? "activity"
                              : "entity"}.
      </p>
      <Button href="#/explorer/domains">← Back to Domains</Button>
    </Card>
  );
}
```

The entity detail views call `api.getJourney(id)` (or equivalent) and
on `404 not_found` mount `<NotFoundPanel/>` instead of throwing.

### §4.11 SME write paths

#### `#/sme/add` — New-journey form (FR-15)

`pwa/src/views/sme/NewJourneyForm.tsx`:

```
┌──────────────────────────────────────────┐
│ New journey                              │
│                                          │
│ Name           [_________________]       │
│ Description    [_________________]       │
│ Parent domain  [Store Operations ▼]      │
│                                          │
│ Activities (one per line)                │
│ [Receive                              ]  │
│ [Pick                                 ]  │
│ [Pack                                 ]  │
│ [Ship                                 ]  │
│                                          │
│ [Cancel]                       [Submit]  │
└──────────────────────────────────────────┘
```

**Submit** builds a single `POST /api/v1/import` payload:

```jsonc
{
  "nodes": [
    {"id": "<uuidv7>", "label": "UserJourney", "name": "...", "description": "..."},
    {"id": "<uuidv7-1>", "label": "Activity", "name": "Receive"},
    {"id": "<uuidv7-2>", "label": "Activity", "name": "Pick"},
    // ...
  ],
  "edges": [
    {"type": "PART_OF",  "fromId": "<journey-uuid>", "toId": "<domain-uuid>"},
    {"type": "PART_OF",  "fromId": "<uuidv7-1>",     "toId": "<journey-uuid>"},
    {"type": "PART_OF",  "fromId": "<uuidv7-2>",     "toId": "<journey-uuid>"},
    {"type": "PRECEDES", "fromId": "<uuidv7-1>",     "toId": "<uuidv7-2>"},
    // ...
  ]
}
```

UUIDv7 is generated client-side (use the `uuidv7` npm package, ~1 KB gz,
or hand-rolled per `shared/src/uuid.ts`). One round-trip. On success
(`200 {imported: {nodes, edges}}`) redirect to the new journey's detail
page. On partial errors (`errors[]` populated), surface them inline.

#### `#/sme/add` (cont.) — Bulk paste (FR-16)

Below the new-journey form, OR on an existing journey's detail in edit
mode, the bulk paste accepts newline-delimited names.

**Idempotency algorithm** (matches FR-16 spec — order-preserving):

```ts
function diffPaste(
  current: Activity[],     // existing activities for this journey
  pasted: string[],        // newline-split, trimmed, non-empty
): {
  createNodes: Activity[],
  reuseNodes: Activity[],
  rewireEdges: PrecedesEdge[],
} {
  // Validate: no duplicate names within the paste itself.
  const seen = new Map<string, number[]>();
  pasted.forEach((name, i) => {
    const arr = seen.get(name) ?? [];
    arr.push(i + 1);  // 1-based line numbers for the error envelope
    seen.set(name, arr);
  });
  const dupes = [...seen.entries()].filter(([_, lines]) => lines.length > 1);
  if (dupes.length > 0) {
    throw new ClientError({
      code: "duplicate_activity_name",
      details: dupes.map(([name, line_numbers]) => ({name, line_numbers})),
    });
  }

  // Build name → activity map for current.
  const byName = new Map(current.map(a => [a.name, a]));
  const result = pasted.map(name => byName.get(name) ?? newActivity(name));
  // ... compute create vs reuse + new PRECEDES chain ...
}
```

The duplicate-name check is **client-side**; if a user POSTs duplicates
directly via curl, graph-core does not enforce uniqueness on
`Activity.name`. That's a single-tenant single-trust acknowledgment per
NFR-08.

Single batched `POST /import` per submit:

- `nodes`: only the new activities to create (existing ones are
  reused by id).
- `edges`: the full new `PRECEDES` chain — delete-then-create. Today
  graph-core has no `DELETE /edges`-by-pair endpoint, so the delete is
  via `POST /query/cypher`:

```cypher
MATCH (j:UserJourney {id: $journeyId})<-[:PART_OF]-(a:Activity)
MATCH (a)-[r:PRECEDES]->(:Activity)
DELETE r
```

Followed by the import call to add the new chain. **Two round-trips**
in this flow (delete then import) — an exception to the "one POST"
rule of FR-15. Documented because the alternative is a graph-core
write-via-cypher endpoint that we're not adding. AC-13 covers both
hops.

**Rollback path (C-05 first-sweep + C-02 second-sweep fix)**: between
the delete and the import, network failure or `/import` error would
leave the journey with no PRECEDES chain — silent data loss. The
submit handler snapshots the pre-delete chain before issuing the
delete:

```ts
async function bulkPasteSubmit(journeyId, pasted) {
  // Snapshot prior PRECEDES chain in case rollback is needed.
  const snapshot = await api.cypher(
    `MATCH (j:UserJourney {id: $jid})<-[:PART_OF]-(a:Activity)
     MATCH (a)-[r:PRECEDES]->(b:Activity)
     RETURN a.id AS fromId, b.id AS toId, r.id AS edgeId`,
    { jid: journeyId },
  );

  // Persist snapshot to sessionStorage BEFORE the destructive call —
  // survives accidental navigation/reload mid-failure (C-02 sweep-2).
  const sessionKey = `companygraph.bulkPasteRollback.${journeyId}`;
  sessionStorage.setItem(sessionKey, JSON.stringify({snapshot, ts: Date.now()}));

  try {
    await api.cypher(/* delete PRECEDES */);
    await api.import({ nodes: [...], edges: [...] });
    sessionStorage.removeItem(sessionKey);  // success — clear snapshot
  } catch (err) {
    // Roll back by re-issuing the snapshot's edges via /import.
    try {
      await api.import({
        nodes: [],
        edges: snapshot.rows.map(r => ({
          id: r.edgeId, type: "PRECEDES", fromId: r.fromId, toId: r.toId,
        })),
      });
      sessionStorage.removeItem(sessionKey);  // rollback succeeded
      throw err;  // still surface the original failure to the UI
    } catch (rollbackErr) {
      // Double-fault: snapshot is still in sessionStorage. The journey
      // detail view mounts a recovery banner from sessionStorage and
      // shows a "Restore" button that re-fires this rollback path.
      throw new BulkPasteDoubleFault({original: err, rollback: rollbackErr, sessionKey});
    }
  }
}
```

The rollback re-issues `/import` with the original edge ids; since
graph-core's `upsertEdge` uses MERGE-on-id, the edges are recreated
1:1.

**C-02 sweep-2 — double-fault recovery banner.** On
`BulkPasteDoubleFault`, the journey-detail view mounts a sticky banner
sourced from `sessionStorage`:

```
┌─────────────────────────────────────────────────────────────────┐
│  Bulk paste failed and rollback did not complete.               │
│  Your journey's PRECEDES chain may be in a partial state.       │
│                                                                 │
│  Snapshot from <timestamp> is preserved:                        │
│   A → B → C → D                                                 │
│                                                                 │
│  [Restore]   [Dismiss (only after restore succeeds)]            │
└─────────────────────────────────────────────────────────────────┘
```

The "Restore" button re-fires the rollback `/import` against the same
snapshot. On success the banner clears (`sessionStorage.removeItem`)
and the journey detail re-fetches. The "Dismiss" button is disabled
unless a restore has succeeded — the operator cannot lose track of
partial state by accident. The banner is mounted by `<JourneyDetail/>`
on every load if `sessionStorage[companygraph.bulkPasteRollback.<this
journey id>]` exists.

AC-13 extended: integration test forces the second `/import` to fail
and asserts the journey's PRECEDES chain is restored to the pre-delete
state. New **AC-13b** (added in §10) covers the double-fault path:
forces BOTH the rollback `/import` AND the original `/import` to fail;
asserts `sessionStorage` retains the snapshot; mounts `<JourneyDetail/>`,
asserts the banner appears with the snapshot contents; simulates a
"Restore" click that succeeds; asserts the banner disappears and
sessionStorage clears.

#### `#/sme/add` (cont.) — iPhone safari "open on desktop" hint (OC-04)

On iPhone Safari (`window.matchMedia("(pointer: coarse) and (max-width:
768px)").matches`) the bulk paste textarea is replaced with a stub:

```
Bulk paste is desktop-only.

Open this URL on a Mac or iPad to paste activities here:
[https://app.companygraph.local/#/sme/add]   [Copy]
```

The "Copy" button uses `navigator.clipboard.writeText()` so the user
can paste into Messages/Mail to themselves. AC-31 verifies (new — see §10).

#### `#/sme/review` — Review queue (FR-19)

```ts
// pwa/src/data/cypher-queries.ts
// B-02 sweep-2 fix: the `needs_review` predicate is pushed INTO the
// Cypher (regex against attributes_json), so the LIMIT 1001 truncates
// the actual needs-review set, not a broader needs-review-OR-verified-OR-
// deprecated set that the client-side filter would post-trim. Without
// this push-down, the steady-state population is dominated by
// `verified` rows once persona-P5 has cleared the queue once, and the
// LIMIT silently drops the real work.
//
// `labels(n)[0]` flattens the array shape — the client receives a
// single label string per row (graph-core stores one label per node
// in practice).
export const reviewQueueForDomain = `
  MATCH (n)
  WHERE n.attributes_json =~ '.*"_review"\\\\s*:\\\\s*\\\\{[^}]*"status"\\\\s*:\\\\s*"needs_review".*'
    AND (
      $homeDomainId IS NULL
      OR EXISTS {
        MATCH (n)-[:PART_OF*1..8]->(:Domain {id: $homeDomainId})
      }
    )
  RETURN n.id AS id, n.name AS name, labels(n)[0] AS label, n.attributes_json AS attrs
  ORDER BY n.updatedAt DESC
  LIMIT 1001
`;
```

`PART_OF*1..8` (C-09 first-sweep fix — bumped from `*1..3` in revision 1)
covers the full graph-core `maxDepth` ceiling — `Activity → UserJourney
→ Domain` (depth 2), `Location → Location → Location → … → Domain`
(deep chains up to 7 levels). The 5 s query timeout (graph-core
NFR-09) bounds cost.

**B-02 sweep-2 fix — predicate push-down.** The regex matches
`"_review":{...,"status":"needs_review",...}` inside the
serialised JSON. Whitespace tolerated (`\s*`). Why regex (option b
from the review):

- Native JSON-path operators require APOC, which graph-core does not
  pin (option a — rejected).
- Mirroring `_review.status` to a top-level property
  (`n.review_status`) is cleaner long-term (option c) but breaks the
  FR-18 write payload shape and would require a graph-core write-side
  amendment. Out of scope for v1; flagged in §13 for follow-on.

The regex approach is good enough: the false-positive rate on
real-world descriptions containing the literal substring
`"_review":...needs_review` is essentially zero (the `_` prefix +
strict JSON quote-and-colon spacing). Worst case is a description
copied from a Confluence page that happened to include the exact
serialised JSON fragment — manual triage on the SME side.

This Cypher passes graph-core's read-only routing (no write keywords).

#### Critical clarification: `patchNode` REPLACES `attributes_json` (B-01 first-sweep)

`graph-core`'s `patchNode` (`api/src/storage/nodes.ts:151`) and
`upsertNode` (`api/src/storage/nodes.ts:200`) both SET
`n.attributes_json = <serialised whole map>` (`patchNode`'s SET-list
emits `n.attributes_json = $attrsJson` at line 178; `upsertNode`'s
MERGE writes the `ON MATCH SET … n.attributes_json = $props
.attributes_json` clause at line 229). The stored map is **replaced
wholesale**, not merged. A naïve PATCH `{attributes:
{_review:{...}}}` against a node that already had
`{_verification:{...}}` would **wipe `_verification`**.

**B-04 sweep-2 fix**: line numbers re-verified against the live file
on 2026-05-23 via `grep -n "^export async function"
/api/src/storage/nodes.ts`. `createNode` is at line 92, `patchNode` at
151, `upsertNode` at 200, `deleteNode` at 240. The `ON MATCH SET`
clause is at line 229. Design rev 1 cited :121 and :162 — both wrong.

This design adopts **client-side read-modify-write** to preserve all
prior attributes. NFR-07 is honoured (no graph-core write-endpoint
extension); the trade-off is a brief race window between the read and
the write — acceptable under NFR-08's single-tenant single-trust stance.

#### Shared helper: `mergeAttributes()` (new)

```ts
// pwa/src/data/writes.ts (new helper)
export async function mergeAttributes(
  label: NodeLabel,
  id: string,
  patch: Record<string, unknown>,
): Promise<Node> {
  // 1. Read the current attributes via a typed query.
  const current = await api.getNodeAttributes(label, id);
  // 2. Spread-merge the patch on top.
  const merged = { ...current, ...patch };
  // 3. PATCH the merged map.
  return api.patchNode(label, id, { attributes: merged });
}
```

`api.getNodeAttributes(label, id)` is a new helper in `pwa/src/api.ts`
that calls `GET /api/v1/nodes/:label/:id` (already exists in graph-core)
and returns `node.attributes` (the deserialised JSON map). No new
graph-core endpoint required.

**Race window**: between step 1 and step 3, another SME may have
written. The race is rare (cadence is daily-to-weekly per persona-P5
table) and is acknowledged in §12 Risks. A future hardening (ETag-style
optimistic concurrency) would require a graph-core extension and is
out-of-scope.

**C-03 sweep-2 — operator-facing failure-mode note.** Because the
PATCH response is the merged map the client SENT (not the merged map
the server stored after a colliding writer), the losing writer cannot
detect "my flag was overwritten" from the response. The SME workflow
notes (tasks-phase, in the operator how-to) carry a single sentence:
"If your flag or verification disappears after a successful save,
another SME wrote to the same node within the same second — refresh
the entity detail and re-flag." We adopt option (a) from the review:
documented failure mode, no in-UI 412/conflict surface. Option (b)
(`If-Match: <updatedAt>` ETag) requires a graph-core write-side change
and is deferred to a follow-on spec.

#### Flag-for-review action (FR-18)

Every entity detail panel renders a `<FlagForReviewButton/>`. Click
opens a focus-trapped `<Modal/>` (T-12, `react-focus-lock`) with a
labelled `<textarea/>` for the reason + Cancel/Flag buttons. The modal
is the same component used by `<NewJourneyForm/>` — single dialog UX
across the app.

```tsx
function FlagForReviewButton({entity}: {entity: {id: string; label: NodeLabel}}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const submit = async () => {
    await mergeAttributes(entity.label, entity.id, {
      _review: {
        status: "needs_review",
        reason: reason.trim() || "(no reason given)",
        set_by: "operator",  // single-tenant per NFR-08
        set_at: new Date().toISOString(),
      },
    });
    setOpen(false);
    setReason("");
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>Flag for review</Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Flag for review">
        <label htmlFor="flag-reason">Why?</label>
        <textarea
          id="flag-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
          rows={4}
        />
        <Button onClick={() => setOpen(false)}>Cancel</Button>
        <Button onClick={submit}>Flag</Button>
      </Modal>
    </>
  );
}
```

**N-06 sweep-2 fix**: previously this sketch called `prompt("Why?")`,
which blocks the JS thread, renders as a non-stylable native popup,
and interrupts iOS Safari's keyboard focus. The `<Modal/>` is async,
stylable, focus-trapped, and iOS-friendly. The same pattern is used
by NewJourney and bulk-paste.

The merge is **shallow at the top level** — the `_review` sub-object is
replaced as a unit (intentional; it's a single state record). Other
top-level keys including `_verification` and any ontology-manager-
registered user attributes are preserved.

The `_` prefix is permanently outside ontology-manager's attribute-
schema enforcement per `ontology-manager/AC-15`. AC-15 of this spec
verifies BOTH (a) the PATCH body shape on the wire AND (b) the
post-write read showing prior `_verification` still present
(tightened from the original wire-only check — B-01 fix).

#### Verification metadata (FR-20)

Symmetric to FR-18 but with `_verification` namespace:

```ts
async function verifyJourney(journeyId: string, roleId: string) {
  return mergeAttributes("UserJourney", journeyId, {
    _verification: {
      by: roleId,           // Role node id of who verified
      at: new Date().toISOString().slice(0, 10),  // YYYY-MM-DD
    },
  });
}
```

Renders in `<JourneyDetail/>` header as `"Verified by '<role-name>' on
<date>"` — the role-name is looked up via the named query in
`cypher-queries.ts`:

```ts
// pwa/src/data/cypher-queries.ts
export const verifyingRoleName = `
  MATCH (r:Role {id: $roleId}) RETURN r.name AS name
`;
```

AC-16 tightened (B-01 fix): the test fixture journey carries a prior
`_review` block; after the verify action, both `_review` AND
`_verification` are asserted present in the post-write read.

#### Out-of-domain advisory (FR-21)

A `useIsHomeDomain(entity)` hook returns `true | false`:

```ts
// pwa/src/data/cypher-queries.ts
export const homeDomainResolution = `
  MATCH (n {id: $id})-[:PART_OF*1..8]->(d:Domain) RETURN d.id AS domainId
`;

// pwa/src/hooks/useIsHomeDomain.ts
function useIsHomeDomain(entity: {id: string; label: NodeLabel}): boolean {
  const home = usePref().homeDomainId;
  // C-01 sweep-2 fix: short-circuit BEFORE the useFetch call so no
  // subscription/round-trip fires when home is null. (`useFetch` is a
  // hook — calling it conditionally would violate rules-of-hooks, so
  // the early-return must happen before the hook line OR the hook must
  // accept an `enabled: false` skip-flag. We use the skip-flag pattern.)
  const { rows } = useFetch(
    () => reads.cypherDedup(homeDomainResolution, {id: entity.id}, {ttlMs: 30 * 60 * 1000}),
    { enabled: home !== null },
  );
  if (!home) return true;  // no home set → allow everything (default)
  if (!rows || rows.length === 0) return true;
  return rows[0].domainId === home;
}
```

`PART_OF*1..8` matches graph-core's `maxDepth` ceiling (NFR-09 — 5 s
per-query timeout bounds cost). Bumped from `*1..5` in revision 1 of
this design (C-09 fix) to cover deeply-nested `Location → Location → …
→ Domain` chains without silent exclusion.

`reads.cypherDedup()` is the cypher-aware variant of `reads.read()` —
it keys the single-flight + cache by `URL + sha256(JSON.stringify(body))`
so two callers issuing structurally different cypher to the same
endpoint don't share results (C-07 first-sweep fix). Implementation in
`pwa/src/data/reads.ts`. The cache map (`memCache`) is **module-scope**
(declared at the top level of `reads.ts`, NOT inside a hook or
component), so entries persist across panel mount/unmount cycles. C-01
sweep-2 fix verifies the implementation sketch in §4.2 matches this
contract.

**C-01 sweep-2 — cache TTL bump for home-domain resolution.** Default
TTL is 30 s; this specific call is overridden to **30 minutes**
(`{ttlMs: 30 * 60 * 1000}`). The home-domain ancestry of a node is
essentially immutable for the lifetime of the node — the only mutation
path is moving a node to a different parent (rare manual operation).
A 30-min TTL means the fan-out across panels (FlagForReviewButton,
VerifyJourneyButton, BulkSignOffCheckbox, NewJourneyForm.submit,
BulkPasteTextarea.submit) collapses to one Cypher round-trip per
entity-id per 30 minutes.

Write buttons (`<FlagForReviewButton/>`, `<VerifyJourneyButton/>`,
`<BulkSignOffCheckbox/>`, `<NewJourneyForm submit>`,
`<BulkPasteTextarea submit>`) read this hook and render `disabled` +
`title="You're outside your home domain — switch home in Settings to
edit here"`. The tooltip's "Settings" wording now points to a real
surface: `#/sme/home` (B-03 sweep-2 fix — see below). **No server
enforcement.** AC-17 verifies the UI side ONLY.

#### `#/sme/home` — Home-domain Settings (B-03 sweep-2 fix, FR-21 writer)

The "Settings" surface that FR-21's tooltip points at. A minimal view
at `pwa/src/views/sme/Home.tsx`:

```tsx
export function SmeHome() {
  const home = usePref().homeDomainId;
  const setHome = usePref().setHomeDomain;
  const { rows: domains } = useFetch(() => api.listDomains());

  return (
    <Card>
      <ViewHeader title="Home domain" />
      <p>
        Your home domain controls which entities show write buttons (Flag
        for review, Verify, Bulk sign-off). Entities outside your home
        domain stay read-only in the UI.
      </p>
      <label htmlFor="home-domain-select">Home domain</label>
      <select
        id="home-domain-select"
        value={home ?? ""}
        onChange={(e) => setHome(e.target.value || null)}
      >
        <option value="">(none — all writes enabled)</option>
        {(domains ?? []).map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      {home && (
        <p>Currently set: <strong>{domains?.find((d) => d.id === home)?.name}</strong></p>
      )}
    </Card>
  );
}
```

The same writer is **also** surfaced as an inline "Set this domain as
my home" button on every `<DomainDetail/>` page:

```tsx
function DomainSetHomeButton({domainId, domainName}: {…}) {
  const setHome = usePref().setHomeDomain;
  return (
    <Button onClick={() => setHome(domainId)}>
      Set "{domainName}" as my home domain
    </Button>
  );
}
```

`prefStore.setHomeDomain(id)` writes `localStorage["home_domain"] = id`
and updates the zustand store; all `useIsHomeDomain` subscribers
re-evaluate on the next render. No round-trip; single-tenant per
NFR-08.

**Scaffold change required**: `pwa/src/route.ts:42–48` lists 3 SME tabs
(`review`, `add`, `quarterly`). Design rev 2 adds a 4th: `{ id: "home",
label: "Home" }`. The tab appears in the SubNav strip for the SME
surface. This is the only scaffold modification this design demands
beyond stub replacements — see §11 modified files.

AC-17 manual repro is extended: "navigate to `#/sme/home`, pick a
non-home domain from the dropdown; navigate to an entity in that
domain; expect write buttons disabled with the tooltip."

#### `#/sme/quarterly` — Bulk sign-off (FR-22, FR-23)

```ts
// pwa/src/data/cypher-queries.ts
// B-02 sweep-2 fix (symmetric to reviewQueueForDomain): the
// overdue/current partitioning predicate is computed server-side via a
// substring extraction on attributes_json. Two queries — overdue and
// current — both bounded by LIMIT 1001, so the truncation lands on the
// actual sub-population, not a pre-filter superset that the client
// re-trims.
//
// $cutoffIso = today − 90 days, ISO YYYY-MM-DD. Computed client-side
// before the query fires.
export const quarterlyHomeJourneysOverdue = `
  MATCH (j:UserJourney)-[:PART_OF]->(d:Domain {id: $homeDomainId})
  WITH j,
       CASE
         WHEN j.attributes_json =~ '.*"_verification"\\\\s*:\\\\s*\\\\{[^}]*"at"\\\\s*:\\\\s*"([0-9]{4}-[0-9]{2}-[0-9]{2})".*'
         THEN replace(replace(j.attributes_json, ' ', ''), '\\n', '')
         ELSE NULL
       END AS verificationBlob
  WHERE verificationBlob IS NULL
     OR NOT verificationBlob =~ ('.*"_verification":\\\\{[^}]*"at":"(' + $cutoffIso + '|[0-9]{4}-[0-9]{2}-[0-9]{2})".*')
  RETURN j.id AS id, j.name AS name, labels(j)[0] AS label, j.attributes_json AS attrs
  ORDER BY j.name ASC
  LIMIT 1001
`;

export const quarterlyHomeJourneysCurrent = `
  MATCH (j:UserJourney)-[:PART_OF]->(d:Domain {id: $homeDomainId})
  WITH j
  WHERE j.attributes_json =~ ('.*"_verification"\\\\s*:\\\\s*\\\\{[^}]*"at"\\\\s*:\\\\s*"(' + $cutoffIso + '|[3-9][0-9]{3}-[0-9]{2}-[0-9]{2})".*')
  RETURN j.id AS id, j.name AS name, labels(j)[0] AS label, j.attributes_json AS attrs
  ORDER BY j.name ASC
  LIMIT 1001
`;
```

Two separate queries fire in parallel; the client renders the
"Overdue (N)" and "Current (M)" sections from their respective row
sets. Each row has an expandable chevron that reveals the activity
list inline (already cached if the SME visited the journey detail
recently).

**Date arithmetic note**: the cutoff regex compares ISO-lex order
(`YYYY-MM-DD` strings compare correctly with `>=`/`<` when both have
the same shape). The `$cutoffIso` parameter is computed client-side
(`new Date(Date.now() - 90 * 86400 * 1000).toISOString().slice(0,10)`)
to avoid relying on Neo4j's `date()` function (consistent with
graph-core's pattern of keeping date semantics in TypeScript). If the
fixture journey carries no `_verification` block at all, it falls into
"Overdue" (the regex misses, the `IS NULL` branch fires).

"Sign off selected" — **same B-01 read-modify-write per row** (the
naïve `/import` payload below would clobber each journey's prior
attributes including any `_review` block):

```ts
async function bulkSignOff(journeyIds: string[], operatorRoleId: string) {
  // 1. Read current attributes for each selected journey in parallel.
  const currents = await Promise.all(
    journeyIds.map(id => api.getNodeAttributes("UserJourney", id)),
  );
  // 2. Merge in _verification per journey.
  const merged = currents.map((attrs, i) => ({
    id: journeyIds[i],
    label: "UserJourney",
    attributes: {
      ...attrs,
      _verification: {
        by: operatorRoleId,
        at: new Date().toISOString().slice(0, 10),
      },
    },
  }));
  // 3. One /import call with the merged maps.
  return api.import({ nodes: merged, edges: [] });
}
```

`graph-core`'s `/import` uses `MERGE` (upsert) on node `id`, and the
`ON MATCH SET … n.attributes_json = $props.attributes_json` clause
**replaces** the stored JSON wholesale (`api/src/storage/nodes.ts:229`
— B-04 sweep-2 fix; previously cited :162 which is mid-`patchNode`).
Because we sent the merged map computed client-side, the result is the
union of prior + new — but only because we did the read-modify-write.

This costs N round-trips (parallel) for the reads + 1 for the import.
For typical bulk sign-off of 10–20 journeys, that's tolerable. The
alternative — adding a JSON-patch endpoint to graph-core — would breach
NFR-07.

AC-19 tightened (B-01 fix): the fixture includes 3 journeys with prior
`_review` blocks present; after bulk sign-off, the post-write read
asserts each journey carries BOTH `_review` AND `_verification`.

## §5. API contracts

### §5.1 graph-core consumption (frozen)

All endpoints below are owned by `graph-core`, are not modified by this
spec, and are referenced verbatim. Quoting `graph-core/design.md §5.1`:

| Method | Path | Used by |
|--------|------|---------|
| GET    | `/api/v1/healthz` | §6.1 connectivity banner |
| GET    | `/api/v1/stats` | TopBar node/edge counts |
| GET    | `/api/v1/nodes/:label/:id` | Entity detail panels |
| POST   | `/api/v1/nodes/:label` | SME new-journey, bulk paste create |
| PATCH  | `/api/v1/nodes/:label/:id` | Flag-for-review, verify-journey |
| POST   | `/api/v1/edges` | (not directly — all via `/import`) |
| POST   | `/api/v1/import` | New journey, bulk paste, bulk sign-off |
| GET    | `/api/v1/query/findPath` | PathFinder view |
| GET    | `/api/v1/query/neighbors/:id` | System-centric INTEGRATES_WITH toggle |
| POST   | `/api/v1/query/cypher` | Multi-filter, review queue, verification-role lookup |
| GET    | `/api/v1/query/listDomains` | Domain index |
| GET    | `/api/v1/query/getDomain/:id` | Domain detail |
| GET    | `/api/v1/query/getJourney/:id` | Journey detail + canvas |
| GET    | `/api/v1/query/getActivity/:id` | Activity detail |

Error envelope verbatim: `{error: {code: string, message: string,
details?: object}}`. Codes used by this spec:

- `not_found` — 404 deep-link → `<NotFoundPanel/>`
- `invalid_payload` — client-side bug; surface verbatim, log
- `depth_exceeded`, `query_timeout`, `result_truncated` — findPath UI
  states (FR-10, AC-07)
- `edge_endpoint_missing`, `edge_endpoint_label_mismatch` — bulk-paste
  pre-flight should never hit these (we construct payloads server-rule-aware)
- `duplicate_activity_name` — client-side error (not in graph-core's
  closed enum); thrown by the bulk-paste validator before any HTTP call

### §5.2 graph-core amendment (this spec)

#### New endpoint: `GET /api/v1/query/search`

**Request:**

```
GET /api/v1/query/search?label=Activity&q=ware&limit=20
```

**Query params:**

| Param | Required | Type | Notes |
|-------|----------|------|-------|
| `label` | yes | `NodeLabel` | Validated via `parseLabel()`; `400 unknown_label` otherwise |
| `q` | yes | string, 1..200 chars | Fulltext query string, passed verbatim to Lucene |
| `limit` | no | int, 1..100 | Default 20; clamps above 100 |

**Response 200:**

```json
{
  "rows": [
    {"id": "...", "name": "Warehouse pick", "label": "Activity"},
    {"id": "...", "name": "Warehouse pack", "label": "Activity"}
  ]
}
```

**Errors:**

- `400 unknown_label` if `parseLabel` rejects the label
- `400 invalid_payload` if `q` is empty or > 200 chars
- `400 query_timeout` (5 s — inherits graph-core's per-tx timeout)

**Implementation (in graph-core, this spec's amendment — T-31):**

```ts
// api/src/routes/query.ts (modify — append a new handler)
router.get("/api/v1/query/search", async (req) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) return invalidPayload(parsed.error);
  const label = parseLabel(parsed.data.label);
  const indexName = `${label.toLowerCase()}_name_fulltext`;
  const session = readOnlySession();  // existing helper in api/src/neo4j/read-only-session.ts
  try {
    const rows = await session.executeRead(async (tx) => {
      const result = await tx.run(
        `CALL db.index.fulltext.queryNodes($index, $q) YIELD node
         RETURN node.id AS id, node.name AS name, $label AS label
         LIMIT $limit`,
        {index: indexName, q: parsed.data.q, label, limit: parsed.data.limit ?? 20},
      );
      return result.records.map(r => ({
        id: r.get("id"),
        name: r.get("name"),
        label: r.get("label"),
      }));
    });
    return json({rows});
  } finally {
    await session.close();
  }
});
```

**New indexes** added inside the existing `applySchema()` loop in
`api/src/neo4j/bootstrap.ts` (B-04 fix — `api/src/db/schema.ts` does
NOT exist; the actual schema bootstrap is `bootstrap.ts`). The loop
iterates `NODE_LABELS` and emits one per label, alongside the existing
`CREATE CONSTRAINT node_id_unique_<label>` and `CREATE INDEX
node_name_<label>` statements:

```cypher
-- inside applySchema(), per label, IDEMPOTENT (IF NOT EXISTS)
CREATE FULLTEXT INDEX <label_lower>_name_fulltext IF NOT EXISTS
  FOR (n:<label>) ON EACH [n.name]
```

Result: 6 new fulltext indexes (one per existing label). Additive —
they don't disturb the existing range indexes (per graph-core/FR-05).

**Idempotency (B-04 fix)**: graph-core's existing AC-04 covers
`schema:apply` idempotency for the original constraint set. The
amendment adds an **idempotency check for the fulltext indexes** —
this is **AC-32** of process-explorer-ui (NEW; see §10): second run of
`bun run schema:apply` after this amendment makes zero index-create
attempts and the `SHOW FULLTEXT INDEXES` count is exactly 6.

**Scope of the amendment** (per pass-1 review's amendment-policy check):
1. **One new endpoint** — `GET /api/v1/query/search?label&q&limit`
2. **Six fulltext indexes** — added to `bootstrap.ts` `applySchema()` loop
3. **One new zod schema** (`searchSchema`) inlined into `api/src/routes/query.ts` alongside the handler (existing api/src has no top-level `schemas.ts` aggregator; schemas are co-located with their owning routes)
4. **One new OpenAPI route registration** appended to the existing `api/src/routes/openapi.ts` (registry-based; no separate generator file)
5. **One new integration test** at `api/__tests__/search-helper.test.ts`

No other graph-core changes. The amendment honours NFR-07 (one
read-only helper). All five touch points must land together (or fail
together — they're a single PR).

**Coordination (B-02 fix)**: graph-core is at `execution:complete`
(T-01..T-30 shipped + verified 2026-05-23 — see `graph-core/STATUS.md`).
There is no "deferred backlog" — this design files a **new T-31** in
`graph-core/tasks.md` carrying all 5 touch points above. T-31 title:
`"Add /api/v1/query/search helper + 6 per-label fulltext indexes
(amendment from process-explorer-ui/FR-17 + AC-28)"`. The PR for this
spec ships T-31's diff in the same commit (graph-core's post-completion
amendment lands together with the PWA changes). If split into two PRs,
the search-helper test gates this spec's PR until graph-core's PR
merges.

### §5.3 ontology-manager consumption (soft dependency)

Until ontology-manager ships, the schema cache falls back to the
compile-time `NODE_LABELS` / `EDGE_TYPES` (see §4.4 fallback). When
ontology-manager lands:

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/api/v1/schema` | GET | ETag + If-None-Match; 304 expected on no-change |
| `/api/v1/ontology/events` | GET (SSE) | EventSource; `Last-Event-ID` automatic |

**Open coordination notes (logged for the ontology-manager design author):**

- The PWA sends `If-None-Match: <etag>` from boot+1; **server should set
  `ETag` on every 200 response** for the conditional GET to function.
  Until then, PWA tolerates absent ETag (sends header anyway, no-op).
- The PWA expects `Cache-Control: must-revalidate` on `/api/v1/schema`
  so the browser cache doesn't return stale bodies bypassing the
  conditional GET.
- **The SSE endpoint must emit a `retry: 5000` line on connect** (N-02
  fix). The browser's EventSource default reconnect delay is
  implementation-defined (~3 s on Chrome, ~3.5 s on Safari); the PWA's
  3-strike + 60-s threshold (§4.4) assumes a 5 s upstream cadence to
  bound flap-detection time. Without `retry: 5000`, the threshold
  fires faster than intended.

## §6. Cross-cutting concerns

### §6.1 Connectivity banner (FR-25, FR-26 — inherited)

Lifted out of `App.tsx` into `pwa/src/components/ConnectivityBanner.tsx`.
The polling lives in `pwa/src/data/health.ts`:

```ts
// pwa/src/data/health.ts
let pollHandle: number | null = null;

function startPolling() {
  if (pollHandle !== null) return;
  poll(); // immediate
  pollHandle = window.setInterval(poll, 30_000);
}
function stopPolling() {
  if (pollHandle !== null) { window.clearInterval(pollHandle); pollHandle = null; }
}
function poll() {
  api.healthz().then(/* update store */).catch(/* mark disconnected */);
  api.stats().then(/* update store */).catch(/* leave last value */);
}

// On mount
useEffect(() => {
  if (document.visibilityState === "visible") startPolling();
  const onVis = () => {
    if (document.visibilityState === "visible") {
      poll();  // immediate fresh
      startPolling();
    } else {
      stopPolling();
    }
  };
  document.addEventListener("visibilitychange", onVis);
  return () => {
    document.removeEventListener("visibilitychange", onVis);
    stopPolling();
  };
}, []);
```

**This corrects the existing App.tsx bug** (the current code polls
every 30 s while visible but doesn't do an immediate fetch on
`visibilitychange→visible`). Inheritance of `graph-core/AC-14` is now
correct on every route. AC-29 verifies.

**C-08 sweep-2 — variable stats keyset.** The `/api/v1/stats` response
shape evolved under ontology-manager T-09b from the original fixed
six-label keyset to a **variable** keyset (seed-six + any
registry-added labels). The banner reads the total node/edge count
via `Object.values(stats.nodes).reduce((a, b) => a + b, 0)` —
**never** hard-codes the seed-six. Any future per-label dashboard
this spec adds must follow the same pattern (`Object.keys(stats.nodes)`
to enumerate, not `["Domain", "UserJourney", "Activity", "Role",
"System", "Location"]`). FR-26's count display is keyset-agnostic by
construction.

### §6.2 No-auth grep (NFR-08, AC-27)

A new test `pwa/src/__tests__/no-auth-grep.test.ts` runs the curated
pattern list from `api/__tests__/no-auth-grep.test.ts` against every
file in `pwa/src/`:

```ts
import { readdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";

const FORBIDDEN = [
  /\bauthorization\s*[:=]/i,
  /\bbearer\s/i,
  /\bverify(Jwt|Token)\b/,
  /\bcurrentUser\b/,
  /\bauthenticate\(/,
  /\bauthorize\(/,
  /\breq\.(user|auth|session)\b/,
  // etc — curated list mirrored from api/__tests__/
];

test("pwa/src contains no auth patterns", async () => {
  // Recursively read all .ts/.tsx files, run FORBIDDEN against each.
  // Allowlist: comments matching /^\s*\/\/ (NFR-08|no-?auth|intentional.*no auth)/
});
```

### §6.3 Bundle budget (NFR-02, AC-22)

A new package script `pwa/package.json`:

```jsonc
{
  "scripts": {
    "bundle-check": "node ./scripts/bundle-check.mjs"
  }
}
```

`pwa/scripts/bundle-check.mjs` reads `pwa/dist/assets/index-*.js`,
runs `zlib.gzipSync(readFileSync(file))`, and asserts:

```
assert(gzipSize(mainBundle) < 300 * 1024, `main bundle is ${gzipSize} > 300 KB gzipped`);
```

CI runs `bun run -C pwa build && bun run -C pwa bundle-check` after the
build job. Fails the PR if over budget.

#### Anticipated bundle composition (gzipped, approx.)

| Module | gz KB | Notes |
|--------|-------|-------|
| react + react-dom 18.3 | ~42 | locked |
| react-flow 11.x (core) | ~30 | canvas (FR-11) — **dynamic-import from day 1** (offloads to `journey-canvas.<hash>.js` chunk) |
| @dagrejs/dagre 1.x | ~10 | layout (FR-11) — bundled with canvas chunk |
| html-to-image | ~14 | PNG/SVG export (FR-13) — bundled with canvas chunk |
| react-focus-lock | ~4 | modals (FR-15, FR-19, FR-23) |
| zustand 4.5 | ~3 | state |
| uuidv7 | ~1 | id generation (SME write paths) |
| App code (pwa/src/*) | ~80 | all views + components + stores + data layer |
| Style tokens + CSS | ~20 | from tokens.css |
| **Main bundle (excludes canvas chunk)** | **~150** | well under 275 KB defensive ceiling |
| **Canvas chunk (lazy)** | **~55** | loaded only on `#/explorer/journey-graph/:id` |
| **Combined max** | **~205** | well under 300 KB NFR-02 cap |

**Dynamic-import strategy (N-01 + design preference from pass-1
review)**: ship the canvas chunk as a code-split bundle from day 1
(T-11), regardless of bundle headroom. First paint on the 8 non-canvas
explorer surfaces is faster; the headroom is preserved for emergencies.

**C-09 sweep-2 — cumulative-vs-new measurement.** The 80 KB "App code"
row above budgets **all PWA code** including the existing scaffold's
~20 KB of pre-shipped components (Card, Pill, SubNav, TopBar, Button,
DomainCard, GraphCanvas, JourneyCanvas (stub), BoundList, DataTable,
etc.) plus `App.module.css` + `_shared.module.css` + the 25+ view
stubs. The 60 KB of net-new-this-spec code sits on top of the 20 KB
scaffold floor.

The 275 KB defensive ceiling (N-05 first-sweep fix) is gated on the
**first 3 CI runs reading ≤ 250 KB against the cumulative dist build**,
not just the diff. `pwa/scripts/bundle-check.mjs` measures
`dist/assets/index-*.js` and `dist/assets/journey-canvas-*.js` — both
artefacts include the scaffold's contribution after Vite tree-shakes.
Tasks-phase pins the build-counter mechanism (CI artifact or
`.bundle-runs` file in the cache).

**Bundle measurement methodology** (N-01 fix): `pwa/scripts/bundle-check
.mjs` reads every file under `pwa/dist/assets/*.js`, runs
`gzipSync(readFileSync(file))`, prints a per-chunk table to CI logs,
and asserts:

```ts
const mainGz = gzipSync(readFileSync("dist/assets/index-*.js")).length;
const canvasGz = gzipSync(readFileSync("dist/assets/journey-canvas-*.js")).length;
console.log(`main: ${mainGz} bytes gz (${(mainGz / 1024).toFixed(1)} KB)`);
console.log(`canvas: ${canvasGz} bytes gz (${(canvasGz / 1024).toFixed(1)} KB)`);
assert(mainGz < 300 * 1024, `main bundle is ${mainGz} > 300 KB gz (NFR-02)`);
assert(mainGz < 275 * 1024 || isFirstThreeRuns(), `main exceeds 275 KB defensive ceiling — investigate before raising`);
```

**Defensive threshold (N-05 fix)**: 275 KB gz is the defensive ceiling
after 3 CI runs under 250 KB. Until then, 300 KB is enforced.
`isFirstThreeRuns()` checks against a counter persisted in CI (e.g. a
build-counter file in the artifact bucket). Tasks-phase pins the
counter mechanism.

### §6.4 Deterministic hydration (NFR-09, AC-30)

The render must be byte-identical across two cold renders given the
same input. Sources of non-determinism to suppress:

1. **`Date.now()`** in render — replaced with a `<NowProvider/>` that
   injects `nowMs` via React context; tests inject a fixed value.
2. **`Math.random()`** in render — replaced with a seeded RNG in the
   layout code; react-flow's auto-layout is deterministic given the
   same input nodes.
3. **`Map` iteration order** — Map preserves insertion order, so
   deterministic as long as we don't iterate `Object.entries()` of
   plain objects without sorting.
4. **`Set` iteration order** — same.
5. **Browser locale** — `toLocaleDateString()` is replaced with a
   manual `YYYY-MM-DD` formatter in places where snapshot equality
   matters.

The AC-30 test renders `#/explorer/journey-detail/<seed-id>` twice with
the same fixture and `outerHTML.replaceAll(/data-test-now="[^"]*"/g, "")`
deep-equals.

### §6.5 Configuration (N-03 sweep-2 fix)

This spec introduces one runtime configuration knob. All others stay
compile-time constant.

| Env var | Values | Default | Purpose |
|---------|--------|---------|---------|
| `VITE_SCHEMA_SOURCE` | `static \| runtime` | `runtime` | Controls SchemaBootstrap's fallback behaviour. `runtime` (default): try `/api/v1/schema` first, fall through to static tuples on 404 with a one-time console warning. `static`: skip the fetch entirely and use compile-time tuples — suppresses the warning when ontology-manager is intentionally not deployed (e.g. air-gapped dev). |

Future env vars added by this spec MUST land here, not mid-flow in §4.x.
The wiring is read once at module-init in `pwa/src/data/schemaSub.ts`;
hot-reload is not supported (changing the value requires a page reload).

## §7. Platforms & Input Modes — expanded matrix

The requirements platform matrix is implementation-aware; the design
phase adds **Apple Pencil on iPad** (OC-03) and **macOS Safari
horizontal-swipe back** (OC-03) explicitly. Updated rows:

| Surface | iPhone Safari | iPad Safari (touch + Pencil) | macOS Safari (trackpad + kb) | macOS Chrome (mouse + kb) |
|---------|---------------|-------------------------------|------------------------------|---------------------------|
| **Apple Pencil on iPad** | n/a | **treated identically to touch** (same Pointer Events, no pressure/tilt read) — gesture handlers consume the event the same way as a finger tap | n/a | n/a |
| **macOS Safari horizontal-swipe back** | n/a | n/a | **passes through** — trackpad swipe-back does NOT generate `touchstart` so the canvas pan handler doesn't see it; the browser handles it natively | n/a |

### Apple Pencil specifics

react-flow uses Pointer Events under the hood. iPad Pencil generates
`PointerEvent` with `pointerType === "pen"` but the same coords as a
touch. We don't differentiate; selection-on-tap and pan-on-drag work
identically.

### macOS Safari swipe-back

macOS Safari's trackpad swipe-from-edge fires at the browser level
*before* a `touchstart` would (Mac doesn't emit synthetic touch events
for trackpad gestures). This means **no suppression code path is
needed** — the canvas never sees the gesture, the browser navigates
back, and the PWA's hash-routing receives the new hash via
`popstate`/`hashchange`.

## §8. Native conflict suppression — implementation paths

The requirements table lists each conflict + a suppression mechanism.
Design pins the actual code paths:

| Conflict | Implementation file | Mechanism |
|----------|---------------------|-----------|
| Pinch-zoom zooms the page | `pwa/index.html` (route-specific meta), `pwa/src/views/explorer/JourneyCanvas.tsx` | Add `<meta name="viewport" content="...maximum-scale=1, user-scalable=no">` only on canvas routes by mutating `document.querySelector("meta[name=viewport]")` in a `useEffect`. On unmount, restore the default (`user-scalable=yes`). |
| Two-finger pan scrolls the page | JourneyCanvas | `<ReactFlow style={{touchAction: "none"}}/>` |
| Browser back-gesture consumed | JourneyCanvas | Custom `onTouchStart` wrapper on the react-flow container: if `e.touches[0].clientX < 20`, `e.stopPropagation()` early so react-flow doesn't see the event; browser handles back-gesture |
| `/` opens Safari Find | `pwa/src/components/SearchPalette.tsx` | `document.addEventListener("keydown", handler)` with `if (e.key === "/" && !isInsideEditableField(e.target)) { e.preventDefault(); focusSearch(); }` |
| Arrow keys scroll page | SearchPalette | Capture arrow keys inside the palette via `onKeyDown` and `e.preventDefault()`; outside the palette, arrows scroll normally |
| Tab navigates browser chrome | `pwa/src/components/Modal.tsx` (new shared modal) | Focus-trap via `react-focus-lock` (~3 KB gz) — applied in NewJourney form and bulk-paste dialogs |
| Right-click context menu | JourneyCanvas | Not bound. Browser default remains. |
| Pull-to-refresh reloads mid-drag | `pwa/src/styles/app.module.css` body class for canvas routes | `overscroll-behavior-y: contain` |
| Double-tap-to-zoom | JourneyCanvas | `touchAction: "none"` covers this on iOS Safari; double-tap is consumed by react-flow's built-in fit-to-view |
| bfcache restores stale React state | `pwa/src/data/health.ts` + `pwa/src/data/reads.ts` | On `pageshow` event with `event.persisted === true`: re-poll healthz, invalidate read cache (`memCache.clear()`), trigger re-fetch of current route's data |
| `<input>` autocomplete obscures typeahead | `pwa/src/components/SearchPalette.tsx`, `pwa/src/components/Typeahead.tsx` | `autocomplete="off"`, `aria-autocomplete="list"`, results render via portal above any browser overlay |
| iOS rubber-band lifts sticky header | `pwa/src/styles/app.module.css` | `overscroll-behavior-y: contain` on `body` |
| Long-press fires text-selection menu | JourneyCanvas | CSS `user-select: none; -webkit-touch-callout: none` on `.reactflow-container` |
| `Cmd+F` opens browser find-in-page | (intentional no-op) | Not intercepted — documented in keyboard hint |
| Safari Smart Search drawer | Typeahead | `autocomplete="off"` + portal above |
| Voice Control hit-spots on 200-node canvas | (intentional OOS) | Acknowledged. No suppression. |

## §9. FR → file change matrix

Each row maps a requirement to the **files this design will create or
modify**. "new" = creates a file; "modify" = patches an existing file.

**Scaffold reality (C-01 first-sweep + B-01 second-sweep fix)**: the
following files exist as stubs in the scaffold and are **modified**
(replace stub content), NOT created:
`pwa/src/views/explorer/{Domains,Journey,JourneyGraph,Systems,Path,
Activities,Roles,Locations}.tsx`,
`pwa/src/views/sme/{Add,Quarterly,Review}.tsx`,
`pwa/src/views/index.tsx` (note: `.tsx`, not `.ts`).

`Journey.tsx` exports `ExplorerJourney` and is the scaffold's
`journey-detail` tab; `JourneyGraph.tsx` exports `ExplorerJourneyGraph`
and is the scaffold's `journey-graph` tab. The two are **sibling tabs**
in design rev 2 (B-01 sweep-2 fix), not a parent + sub-mode.

`Activities.tsx`, `Roles.tsx`, `Locations.tsx` are scaffold-shipped
files for the virtual tabs (not in SubNav, but allowlisted by
`EXPLORER_VIRTUAL_TABS`). Revision 1 listed them as "new"; design rev 2
corrects them to "modify (replace stub)".

The scaffold pattern is **one file per tab**; entity-detail sub-routes
are rendered conditionally within the tab file based on
`route.entityId`. The `mode` 4th segment is reserved for future
sub-routes — the journey canvas no longer uses it (it's its own tab).

| FR | Title | Files | Action |
|----|-------|-------|--------|
| FR-01 | Domain index | `pwa/src/views/explorer/Domains.tsx` (handles `/domains` and `/domains/:id`) | modify (replace stub) |
| FR-02 | Soft nav | (covered by FR-01 + extended `parseHash`) | — |
| FR-03 | Journey list + detail | `pwa/src/views/explorer/Journey.tsx` (handles `/journey-detail` and `/journey-detail/:id`) | modify (replace stub) |
| FR-04 | Activity detail | `pwa/src/views/explorer/Activities.tsx` (scaffold stub for virtual tab `activities`) | modify (replace stub) |
| FR-05 | System-centric view | `pwa/src/views/explorer/Systems.tsx` (handles `/systems` and `/systems/:id`) | modify (replace stub) |
| FR-06 | Role-centric view | `pwa/src/views/explorer/Roles.tsx` (scaffold stub for virtual tab `roles`) | modify (replace stub, priority `should`) |
| FR-07 | Location-centric view | `pwa/src/views/explorer/Locations.tsx` (scaffold stub for virtual tab `locations`) | modify (replace stub, priority `should`) |
| FR-08 | Full-text search | `pwa/src/components/SearchPalette.tsx` | new |
| FR-09 | Multi-filter | `pwa/src/views/explorer/Activities.tsx` (covers FR-04 + FR-09 in the same file) + `pwa/src/store/filterStore.ts` + `pwa/src/data/cypher-queries.ts` (`activityFilterAnd`) | modify + new + new |
| FR-10 | findPath UI | `pwa/src/views/explorer/Path.tsx` (scaffold tab id: `path-finder`) | modify (replace stub) |
| FR-11 | Interactive canvas | `pwa/src/views/explorer/JourneyGraph.tsx` (scaffold tab id: `journey-graph` — sibling of `journey-detail`, B-01 sweep-2 fix; FR-11 lives here entirely) | modify (replace stub) |
| FR-12 | Touch / trackpad gestures | `JourneyGraph.tsx` (react-flow props + `<meta viewport>` patch on mount) | — |
| FR-13 | PNG/SVG export | `JourneyGraph.tsx` + `pwa/src/lib/export.ts` | modify + new |
| FR-14 | Deep-link URLs | `pwa/src/route.ts` (extended), `pwa/src/views/index.tsx` (extended dispatcher), `pwa/src/views/_shared.tsx` (`NotFoundPanel`) | modify + modify + modify |
| FR-15 | New-journey form | `pwa/src/views/sme/Add.tsx` (new-journey + bulk paste split inside this file, gated by section) | modify (replace stub) |
| FR-16 | Bulk paste | `pwa/src/views/sme/Add.tsx` (bulk paste section) + `pwa/src/lib/diffPaste.ts` | modify + new |
| FR-17 | Typeahead binding | `pwa/src/components/Typeahead.tsx` | new |
| FR-18 | Flag-for-review (RMW) | `pwa/src/components/FlagForReviewButton.tsx` + `pwa/src/components/Modal.tsx` (used for the reason dialog — N-06 sweep-2 fix; replaces native `prompt()`) + `pwa/src/data/writes.ts` (`mergeAttributes`) | new + new + new |
| FR-19 | Review queue | `pwa/src/views/sme/Review.tsx` + `pwa/src/data/cypher-queries.ts` (`reviewQueueForDomain` — B-02 sweep-2 regex push-down) | modify + modify |
| FR-20 | Verification metadata (RMW) | `pwa/src/views/explorer/Journey.tsx` (header section) + `pwa/src/components/VerifyJourneyButton.tsx` + `cypher-queries.ts` (`verifyingRoleName`) | modify + new + modify |
| FR-21 | Out-of-domain advisory + Settings writer (B-03 sweep-2 fix) | `pwa/src/hooks/useIsHomeDomain.ts` + `pwa/src/store/prefStore.ts` + `cypher-queries.ts` (`homeDomainResolution`) + **`pwa/src/views/sme/Home.tsx`** (NEW — `#/sme/home` Settings surface, writer for `setHomeDomain`) + `pwa/src/components/DomainSetHomeButton.tsx` (inline "Set as home" affordance on Domain detail) + `pwa/src/route.ts` (add 4th SME tab `home`) | new + new + modify + new + new + modify |
| FR-22 | Quarterly checklist | `pwa/src/views/sme/Quarterly.tsx` + `cypher-queries.ts` (`quarterlyHomeJourneysOverdue` + `quarterlyHomeJourneysCurrent` — B-02 sweep-2 regex push-down) | modify + modify |
| FR-23 | Bulk sign-off (RMW) | `pwa/src/views/sme/Quarterly.tsx` + `pwa/src/data/writes.ts` (`bulkSignOff`) | modify + modify |
| FR-24 | PWA shell | `pwa/src/App.tsx` (lift polling, mount SchemaBootstrap + SidePanel) + `pwa/src/components/SidePanel.tsx` + `pwa/src/components/SchemaBootstrap.tsx` | modify + new + new |
| FR-25 | Connectivity banner | `pwa/src/components/ConnectivityBanner.tsx` + `pwa/src/data/health.ts` | new + new |
| FR-26 | Stats counts (variable keyset — C-08 sweep-2) | (inherited from graph-core `<TopBar/>` — no change needed; consumers iterate `Object.keys(stats.nodes)`) | — |
| FR-27 | Service worker | `pwa/public/sw.js`, `pwa/src/main.tsx` (registration) | new + modify |
| FR-28 | Schema-change SSE (synchronous-throw guard — C-06 sweep-2) | `pwa/src/data/schemaSub.ts` + `pwa/src/store/schemaStore.ts` | new + new |

### Graph-core amendment (filed as T-31)

| Change | File | Action |
|--------|------|--------|
| New `/api/v1/query/search` route | `api/src/routes/query.ts` | modify |
| Per-label fulltext index DDL (×6) | `api/src/neo4j/bootstrap.ts` | modify |
| zod schema for query params (`searchSchema`) | `api/src/routes/query.ts` (inline alongside handler) | modify |
| Test | `api/__tests__/search-helper.test.ts` | new (covers AC-28 + AC-32 of this spec) |
| OpenAPI registration | `api/src/routes/openapi.ts` | modify (additive only) |
| Tasks.md amendment row | `.claude/specs/graph-core/tasks.md` | modify (add T-31 entry post-completion) |

## §10. AC → verification matrix

| AC | Test path | Manual repro |
|----|-----------|--------------|
| AC-01 | `pwa/src/__tests__/domain-index.test.tsx` | manual on each platform: load `#/explorer/domains` — expect 4+ cards, click each — expect detail loads within 200 ms with no full reload |
| AC-02 | `pwa/src/__tests__/journey-detail.test.tsx` (linear + cycle fixtures) | manual on macOS Chrome (mouse+kb): load `#/explorer/journey-detail/<linear-seed-id>` — expect activities in PRECEDES order; load `#/explorer/journey-detail/<cycle-fixture-id>` — expect yellow warning ribbon + activities in `createdAt` ASC order |
| AC-03 | `pwa/src/__tests__/activity-detail.test.tsx` | manual: scroll mid-list, navigate into a role, hit back — expect same scroll position |
| AC-04 | `pwa/src/__tests__/system-view.test.tsx` | manual on iPad Safari (touch): load `#/explorer/systems/<seed-pos-id>`, tap INTEGRATES_WITH toggle, expect at least one neighbour card appears below activity list |
| AC-05 | `pwa/src/__tests__/search.test.tsx` + `pwa/playwright/search.spec.ts` (cross-browser) | manual on each platform: type `/`, expect focus; type fragment, expect results <500 ms; arrow + enter, expect navigation |
| AC-06 | `pwa/src/__tests__/activity-filter.test.tsx` | manual on iPhone Safari: load `#/explorer/activities?system=<id>&role=<id>`, tap browser refresh, expect same filters; copy URL via Share, paste in new tab, expect same view |
| AC-07 | `pwa/src/__tests__/find-path.test.tsx` (mocked: success, no-path, depth_exceeded, query_timeout, result_truncated) | manual on macOS Chrome (mouse+kb): (a) connected nodes at depth=4 — expect path; (b) disconnected — expect "No path within depth 4"; (c) depth=9 via querystring — expect clamp to 8 + hint, no API call; (d) test fixture sleeps 6 s — expect "Search timed out after 5 s" |
| AC-08 | `pwa/src/__tests__/canvas-render.test.tsx` (jsdom — node/edge count assertion) | manual perf on baseline machine: open canvas, drag-pan + pinch-zoom, expect frame-time logs ≤ 16 ms via DevTools Performance |
| AC-09 | `pwa/playwright/canvas-gestures.ipad.spec.ts` (uses Playwright's iPad emulation) | manual on iPad Safari: pinch canvas — page doesn't zoom; two-finger drag — page doesn't scroll; tap — selects; left-edge swipe — browser back |
| AC-10 | `pwa/src/__tests__/canvas-export.test.tsx` (blob shape + filename) + `pwa/playwright/canvas-export.safari.spec.ts` — **C-07 sweep-2 fix**: replaced pixel-diff with two cheaper assertions — (a) the exported PNG file size is **> 3 KB** on the 4-node fixture (a `<foreignObject>`-stripped export drops well below 1 KB because text labels render as blank rectangles); (b) the exported SVG contains the literal substring `<text` AND the journey name. No baseline image, no per-OS threshold tuning. Runs in CI on the Safari Playwright project. | manual on `#/explorer/journey-graph/<seed-id>` (macOS Safari): click "Export PNG" — expect download `<slug>-YYYY-MM-DD.png`, open the PNG, verify the journey name is rendered as legible text (not blank rectangles — `<foreignObject>` rendering regression check); click "Export SVG" — expect vector with `<text>` elements visible |
| AC-11 | `pwa/src/__tests__/deep-link.test.tsx` (URL→panel mapping for all 7 entity routes: `journey-detail`, `journey-graph`, `domains`, `systems`, `activities`, `roles`, `locations`) | manual on iPad Safari: paste `#/explorer/journey-detail/<seed-id>` in fresh tab — expect detail; paste `#/explorer/journey-graph/<seed-id>` — expect canvas; paste a valid-shaped non-existent UUIDv7 — expect "404 — journey not found" + "Back to Domains" link |
| AC-12 | `pwa/src/__tests__/new-journey.test.tsx` + integration (one POST to `/import`) | manual on macOS Chrome: fill form, submit — expect single network request to `/api/v1/import`, redirect to new journey detail; manual on iPhone Safari: open form, expect vertically-stacked layout usable in portrait |
| AC-13 | `pwa/src/__tests__/bulk-paste.test.tsx` (4 lines → 4 activities + 3 PRECEDES + 4 PART_OF; re-paste idempotent) + `pwa/src/__tests__/integration/bulk-paste-rollback.integration.test.ts` (forces `/import` to fail after delete; asserts PRECEDES chain restored to pre-delete state) | manual on macOS Chrome: paste 4 names, expect 4 activities created; re-paste same content reordered, expect activities reused (id stable) + PRECEDES rewired; integration rollback test as above |
| **AC-13b (NEW — C-02 sweep-2 fix)** | `pwa/src/__tests__/integration/bulk-paste-double-fault.integration.test.ts` — forces BOTH the rollback `/import` AND the original `/import` to fail; asserts (a) `sessionStorage["companygraph.bulkPasteRollback.<journeyId>"]` retains the snapshot JSON; (b) mounting `<JourneyDetail/>` post-fault renders the recovery banner with the snapshot's PRECEDES chain visible; (c) simulating a "Restore" click (which succeeds against a now-recovered fixture API) clears sessionStorage and the banner; (d) the "Dismiss" button is disabled until the restore succeeds | manual on macOS Chrome: paste a 3-line activity list; force both `/import` calls offline; expect a banner on the journey-detail view showing the prior chain + a "Restore" button; bring the API back online; click "Restore" — expect the banner clears and the chain is recovered |
| AC-14 | `pwa/src/__tests__/typeahead.test.tsx` | manual on macOS Chrome: type "ware" in role-binding typeahead, expect ≤200 ms response with results |
| AC-15 | `pwa/src/__tests__/sme-review-flag.test.tsx` — (a) asserts PATCH body shape `{attributes:{_review:{...}, _verification:{...}}}` is the MERGED map (RMW, B-01 fix) by seeding the node with prior `_verification` then asserting the body retains it; (b) post-write integration: read the node back via `GET /api/v1/nodes/:label/:id` and assert BOTH `_review` AND `_verification` keys present | manual: flag node, fetch `/sme/review`, expect node listed; flag a node that already has `_verification`, refresh, expect both flags visible |
| AC-16 | `pwa/src/__tests__/journey-detail.test.tsx` — (a) extended fixture with `_verification.{by, at}` populated renders the header `"Verified by 'Store Ops Lead' on 2026-05-20"`; (b) **RMW preservation** (B-01 fix): seed a journey with prior `_review` block, fire `verifyJourney(...)`, post-write read asserts BOTH `_review` AND `_verification` present in `attributes` | manual: load journey with verification, expect header; load a journey with both flags, expect header + (in the SME review flow) the journey still shows in the review queue with `_review` intact |
| AC-17 | `pwa/src/__tests__/out-of-domain-disable.test.tsx` (assert `disabled` + `title` contains "outside your home domain") | manual on macOS Chrome: navigate to `#/sme/home`, pick domain A from the dropdown (B-03 sweep-2 fix — the writer surface now exists); navigate to an entity in domain B, expect flag button disabled with tooltip; click the tooltip's link — expect navigation to `#/sme/home` |
| AC-18 | `pwa/src/__tests__/quarterly-checklist.test.tsx` | manual on macOS Chrome: load `#/sme/quarterly`, expect two sections "Overdue (N)" and "Current (M)"; click row chevron, expect activities expand |
| AC-19 | `pwa/src/__tests__/bulk-signoff.test.tsx` — (a) one `/import` with merged attributes per selected journey (RMW, B-01 fix); (b) integration: seed 3 journeys each with prior `_review` block; bulk-sign-off; post-write read asserts each of the 3 journeys has BOTH `_review` AND `_verification` | manual: select 3 journeys (some with prior `_review`), click Sign off — expect 3 `_verification` fields populated AND any prior `_review` blocks still present; reload — verify persisted |
| AC-20 | `pwa/playwright/sw-degradation.spec.ts` (Safari private mode emulation) | manual on iPhone Safari: enable Private, load app — expect shell renders, no SW errors, no "stale" banner. Disable Private, reload — expect SW registers; go offline, reload — expect cached reads + "stale" banner + write buttons disabled |
| AC-21 | `pwa/src/__tests__/schema-subscription.test.tsx` (mock EventSource, fire `ontology.changed`, assert cache invalidated) | manual on macOS Chrome: add a label via ontology-manager-REST, observe PWA nav within 60 s — expect new label in schema picker |
| AC-22 | `pwa/scripts/bundle-check.mjs` (CI assertion `gzipSize < 300 * 1024`) | n/a (build-time) |
| AC-23 | `pwa/playwright/lighthouse.spec.ts` — **C-10 sweep-2 pin**: runs `lighthouse http://127.0.0.1:4173/ --form-factor=desktop --preset=desktop --throttling.cpuSlowdownMultiplier=1 --only-categories=performance --output=json` against `bun run -C pwa preview` (production build on port 4173, NOT the dev server on 5173). Same CPU-throttling-multiplier on CI (`ubuntu-latest`) and local-machine so the TTI number is comparable. Assert `audits["interactive"].numericValue < 2000` (ms). The 2 s threshold is the 2021 MacBook Air baseline; CI runs at multiplier=1 so the number on Ubuntu may read lower than the Air, but a regression is still caught (the threshold gates absolute TTI, not delta from a baseline). | manual: `bun run -C pwa preview` + `npx lighthouse http://127.0.0.1:4173/ --preset=desktop --throttling.cpuSlowdownMultiplier=1 --only-categories=performance --output=json --output-path=./lighthouse.json` — inspect `audits.interactive.numericValue` |
| AC-24 | `pwa/playwright/canvas-perf.spec.ts` — **C-11 sweep-2 pin**: the playwright spec is a **smoke regression**, not a true 60 fps assertion. It opens `#/explorer/journey-graph/<200-node-fixture-id>`, programmatically pans via `page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', {…})))` for 5 s, and counts `requestAnimationFrame` ticks via `performance.now()` deltas. Asserts ≥ 250 frames in 5 s (i.e. ≥ 50 fps — catches a 10× perf cliff but won't catch a 56-fps regression). The **authoritative AC-24 check is manual** (see manual repro). | manual on macOS Chrome (trackpad — covers gesture + frame budget): open `#/explorer/journey-graph/<200-node-fixture-id>`, open DevTools → Performance, start recording, two-finger trackpad-pan the canvas for 5 s, stop recording — assert median frame time ≤ 16 ms (60 fps) via the "Frames" track in Performance |
| AC-25 | `pwa/playwright/keyboard-nav.spec.ts` (Tab cycle, Escape close) | manual on macOS Chrome (keyboard only): Tab from `#/explorer/domains` until address bar — every interactive element visited; open new-journey form, Escape — form closes |
| AC-26 | `pwa/src/__tests__/touch-targets.test.tsx` (for every `[data-tap]` assert `clientWidth >= 44 && clientHeight >= 44`) | manual on iPhone Safari: tap every action button, expect easy hit |
| AC-27 | `pwa/src/__tests__/no-auth-grep.test.ts` (re-uses graph-core curated pattern list) | n/a (test asserts; manual verification = read source) |
| AC-28 | `api/__tests__/search-helper.test.ts` (POST new label, seed 3 nodes with "fooba", fetch `/api/v1/query/search?label=Activity&q=fooba&limit=20`, expect 3 rows, latency <200 ms) | n/a (test on graph-core side) |
| AC-29 | `pwa/playwright/connectivity-banner.spec.ts` (every route, kill API, assert banner flips within 30 s) | manual on macOS Chrome: load `#/explorer/journey-detail/<seed-id>`, observe green-dot banner; `bun run stop`, wait ≤30 s — expect red-dot banner |
| AC-30 | `pwa/src/__tests__/deterministic-hydration.test.tsx` (render `#/explorer/journey-detail/<seed-id>` twice, deep-equal `outerHTML` after stripping test-only timestamp regions) | n/a (snapshot) |
| **AC-31** | `pwa/src/__tests__/iphone-bulk-paste-hint.test.tsx` (mock `matchMedia` to return phone match; assert stub copy + Copy button) | manual on iPhone Safari: load `#/sme/add`, expect stub view with "Bulk paste is desktop-only" copy and a Copy URL button; tap Copy, paste in Notes — expect the canonical URL |
| **AC-32 (NEW — B-04 fix)** | `api/__tests__/search-helper.test.ts` extended — (a) first run of `bun run schema:apply` creates 6 fulltext indexes; (b) second run makes zero `CREATE INDEX` attempts (verified by counting `SHOW FULLTEXT INDEXES` rows = 6 unchanged); (c) DB driver returns no warnings on second run | n/a (test on graph-core side; verified inline with AC-28) |

## §11. File list summary

### New files (32 — net of scaffold reuse)

```
pwa/public/
  sw.js                                       (T-21 — service worker)

pwa/src/
  store/
    schemaStore.ts                            (T-04)
    routeStore.ts                             (T-04)
    filterStore.ts                            (T-04)
    selectionStore.ts                         (T-04)
    prefStore.ts                              (T-04)
  data/
    reads.ts                                  (T-05)
    writes.ts                                 (T-05 — includes mergeAttributes, bulkSignOff helpers)
    schemaSub.ts                              (T-06 — SSE + POLL-MODE state machine)
    health.ts                                 (T-07 — corrected polling)
    cypher-queries.ts                         (T-09 — C-06 — single greppable module)
  hooks/
    useIsHomeDomain.ts                        (T-15)
  lib/
    diffPaste.ts                              (T-13)
    export.ts                                 (T-11)
    slugify.ts                                (T-11)
    uuidv7.ts                                 (T-12)
  components/
    ConnectivityBanner.tsx                    (T-07)
    SidePanel.tsx                             (T-09)
    SchemaBootstrap.tsx                       (T-06 — C-03 — 404 fall-through, 5xx ErrorState, C-05 sweep-2 network-failure → ErrorState)
    SearchPalette.tsx                         (T-10)
    Typeahead.tsx                             (T-14)
    Modal.tsx                                 (T-12 — focus-trapped; reused by FlagForReviewButton — N-06 sweep-2)
    FlagForReviewButton.tsx                   (T-15 — uses mergeAttributes + Modal — N-06 sweep-2 replaces native prompt())
    VerifyJourneyButton.tsx                   (T-16 — uses mergeAttributes)
    BulkPasteMobileStub.tsx                   (T-13b — AC-31)
    DomainSetHomeButton.tsx                   (T-15 — B-03 sweep-2 — inline "Set as home" affordance on Domain detail)
    BulkPasteRecoveryBanner.tsx               (T-13 — C-02 sweep-2 — double-fault sessionStorage recovery banner)
  views/
    sme/
      Home.tsx                                (T-15 — B-03 sweep-2 — Settings surface for prefStore.setHomeDomain at #/sme/home)
  __tests__/
    domain-index.test.tsx                     (T-09)
    journey-detail.test.tsx                   (T-09 — incl. AC-16 RMW assertion)
    activity-detail.test.tsx                  (T-09)
    system-view.test.tsx                      (T-09)
    search.test.tsx                           (T-10)
    activity-filter.test.tsx                  (T-09)
    find-path.test.tsx                        (T-10 — incl. PathRow hydration)
    canvas-render.test.tsx                    (T-11)
    canvas-export.test.tsx                    (T-11)
    deep-link.test.tsx                        (T-09)
    new-journey.test.tsx                      (T-12)
    bulk-paste.test.tsx                       (T-13)
    typeahead.test.tsx                        (T-14)
    sme-review-flag.test.tsx                  (T-15 — incl. AC-15 RMW post-write read)
    out-of-domain-disable.test.tsx            (T-15)
    quarterly-checklist.test.tsx              (T-16)
    bulk-signoff.test.tsx                     (T-16 — incl. AC-19 RMW post-write read)
    schema-subscription.test.tsx              (T-06 — incl. SSE→POLL-MODE fallback)
    no-auth-grep.test.ts                      (T-22)
    touch-targets.test.tsx                    (T-22)
    deterministic-hydration.test.tsx          (T-22)
    iphone-bulk-paste-hint.test.tsx           (T-13b — AC-31)
    pwa-ontology-slugify-coverage.test.ts     (T-22 — N-04 sweep-2 — gated on ontology-manager shipping; placeholder skipped until then)
  __tests__/integration/
    bulk-paste-rollback.integration.test.ts   (T-13 — C-05 rollback path)
    bulk-paste-double-fault.integration.test.ts  (T-13 — C-02 sweep-2 — double-fault sessionStorage recovery)

pwa/playwright/
  search.spec.ts                              (T-20)
  canvas-gestures.ipad.spec.ts                (T-20)
  canvas-export.safari.spec.ts                (T-20 — C-04 Safari export regression)
  sw-degradation.spec.ts                      (T-21)
  lighthouse.spec.ts                          (T-22)
  canvas-perf.spec.ts                         (T-22)
  keyboard-nav.spec.ts                        (T-22)
  connectivity-banner.spec.ts                 (T-22)
  playwright.config.ts                        (T-20)

pwa/scripts/
  bundle-check.mjs                            (T-22 — N-01 methodology)

api/__tests__/                                (graph-core amendment T-31)
  search-helper.test.ts                       (T-02 — AC-28 + AC-32 — graph-core side)
```

### Modified files (18 — including 8 scaffold stub replacements)

```
# PWA scaffold stubs — REPLACED, not new (C-01 first-sweep + B-01 second-sweep fix)
pwa/src/views/index.tsx                       (extend renderView dispatch for entityId + journey-graph sibling + sme/home tab)
pwa/src/views/explorer/Domains.tsx            (replace stub — FR-01)
pwa/src/views/explorer/Journey.tsx            (replace stub — FR-03 list + detail, FR-20 header — handles `journey-detail` tab only)
pwa/src/views/explorer/JourneyGraph.tsx       (replace stub — FR-11 canvas + FR-12 gestures + FR-13 export — handles `journey-graph` tab; sibling of Journey.tsx per B-01 sweep-2)
pwa/src/views/explorer/Path.tsx               (replace stub — FR-10 — tab id `path-finder`)
pwa/src/views/explorer/Systems.tsx            (replace stub — FR-05)
pwa/src/views/explorer/Activities.tsx         (replace stub — FR-04 + FR-09 virtual tab)
pwa/src/views/explorer/Roles.tsx              (replace stub — FR-06 virtual tab, should-priority)
pwa/src/views/explorer/Locations.tsx          (replace stub — FR-07 virtual tab, should-priority)
pwa/src/views/sme/Add.tsx                     (replace stub — FR-15 + FR-16; bulk-paste section uses BulkPasteRecoveryBanner for C-02 sweep-2 double-fault)
pwa/src/views/sme/Review.tsx                  (replace stub — FR-19)
pwa/src/views/sme/Quarterly.tsx               (replace stub — FR-22 + FR-23)

# PWA infrastructure
pwa/src/route.ts                              (extend parseHash for entityId + params; ADD `{id: "home", label: "Home"}` to SURFACES.sme.tabs — B-03 sweep-2)
pwa/src/views/_shared.tsx                     (add NotFoundPanel)
pwa/src/App.tsx                               (lift polling, mount ConnectivityBanner + SchemaBootstrap + SidePanel)
pwa/src/main.tsx                              (register SW)
pwa/src/api.ts                                (add api.search + api.patchNode + api.import + api.getNodeAttributes + api.listDomains)
pwa/package.json                              (deps: react-flow, @dagrejs/dagre, zustand, html-to-image, react-focus-lock, uuidv7; devDeps: vitest, @testing-library/react, @playwright/test, jsdom; scripts: test, test:integration, bundle-check)
pwa/index.html                                (default viewport meta)
pwa/vite.config.ts                            (test config — vitest)
pwa/tsconfig.json                             (include __tests__ directory)

# Graph-core amendment (T-31)
api/src/routes/query.ts                       (T-31: GET /api/v1/query/search)
api/src/neo4j/bootstrap.ts                    (T-31: 6 fulltext indexes inside applySchema())
api/src/routes/openapi.ts                     (T-31: register new endpoint in existing OpenAPIRegistry)
# (zod searchSchema is inlined in api/src/routes/query.ts — no separate file)
.claude/specs/graph-core/tasks.md             (T-31: append post-completion amendment task)
.claude/specs/process-explorer-ui/requirements.md  (B-03 first-sweep fix: bump to rev 3 with shorter SME routes + AC-25 update; B-01 sweep-2 fix: bump to rev 4 with scaffold-aligned explorer routes)
```

### Totals

- **New files: 35** (32 in pwa + 1 graph-core test + 2 scripts/integration tests)
  Net change from rev 1: +3 (Home.tsx for SmeHome B-03 sweep-2, DomainSetHomeButton.tsx, BulkPasteRecoveryBanner.tsx, bulk-paste-double-fault.integration.test.ts, pwa-ontology-slugify-coverage.test.ts — minus 2 that turned out to be scaffold stubs (Activities/Roles/Locations were "new" in rev 1, "modify" in rev 2)).
- **Modified files: 21** (11 scaffold stub replacements + 8 PWA infra + 5 graph-core T-31 + 1 requirements rev-4)
- **Total touched: 56 files**

This stays in `large` territory by every other metric (28 FRs, 33 ACs
incl. AC-13b + AC-32, gesture surface, two personas, write paths,
canvas). Revision 1 of this design overcounted by treating scaffold
stubs as new files; revision 2 adds 3 new files for the B-03 + C-02
sweep-2 fixes but reclassifies 3 more (Activities/Roles/Locations) as
scaffold stub replacements. Net new file count rises modestly.

## §12. Risks & mitigations

Re-stating the requirements §Risks, updated with design decisions.

| # | Risk | Status / mitigation |
|---|------|---------------------|
| 1 | Canvas-library choice | **Resolved** — react-flow 11.x picked (§4.6). Dynamic-import fallback if bundle budget breaks (§6.3). |
| 2 | graph-core API extension scope | **Resolved** — one new endpoint, fully specified (§5.2). Coordination via tasks.md amendment row. |
| 3 | Out-of-domain guard | **Resolved** — advisory only (§4.11 + FR-21 pinned). |
| 4 | SW + Safari restrictions | **Resolved** — degradation contract pinned (§4.5 + AC-20). |
| 5 | /import payload size limit | **Resolved (N-02 sweep-2 fix — corrected wording)** — client-side 500-line UI ceiling enforces the cap; **no server-side 2 MB cap added** (would breach NFR-07's restriction on graph-core extensions). The earlier "2 MB server cap" wording was stale from a rev-1 draft; §1 decision 5 was the canonical resolution. |
| 6 | Canvas + offline | **Resolved** — per-route data cache (network-first, cache fallback) handles canvas offline if the journey was visited online first. |
| 7 | Back-gesture vs canvas pan | **Mitigated** — 20 px ignore zone at left edge; UX loss acknowledged (§8). |
| 8 | PRECEDES cycle handling | **Resolved** — createdAt ASC tiebreaker in FR-03 (retire from Risks). |
| 9 | Search ranking | **Resolved** — fulltext indexes amendment to graph-core (§5.2). |
| 10 | Bulk-paste duplicate handling | **Resolved** — `400 duplicate_activity_name` (pinned in FR-16 + §4.11). |
| **NEW** | **react-flow OSS license**| **Acknowledged** — react-flow 11.x is MIT-licensed; the attribution badge can be hidden via the Pro license, but we keep it visible (no Pro license required) per MIT terms. |
| **NEW** | **EventSource on iOS Safari < 17** | **Acknowledged** — `EventSource` is supported on iOS Safari ≥ 14.5. iOS 13 not supported (project baseline is iOS 16+ per `requirements.md §Platforms`). |
| **NEW** | **html-to-image quirks** | **Acknowledged + tested** — html-to-image relies on `<foreignObject>` which Safari renders inconsistently. PNG export via `dom-to-image-more` is a documented fallback; AC-10 + `canvas-export.safari.spec.ts` regression-test catches it (C-04 fix). |
| **NEW (B-01)** | **RMW race window on `attributes`** | **Acknowledged + single-tenant-tolerated** — between the GET in `mergeAttributes()` and the PATCH, another SME may have written. The race is rare under persona-P5 cadence (daily-to-weekly). NFR-08's single-tenant single-trust stance accepts the risk. Future hardening (ETag-style optimistic concurrency) requires a graph-core extension — out-of-scope. Mitigation if needed: the SME refreshes the entity detail page after the conflict is detected (post-PATCH read shows the merged map). |
| **NEW (C-05 first-sweep + C-02 sweep-2)** | **Bulk-paste two-RT partial failure** | **Mitigated + recoverable** — pre-delete snapshot of the PRECEDES chain enables client-side rollback. `bulk-paste-rollback.integration.test.ts` forces the failure path. **C-02 sweep-2 hardening**: on double-fault (both `/import` calls fail), the snapshot persists in `sessionStorage["companygraph.bulkPasteRollback.<journeyId>"]`. The journey-detail view mounts a `<BulkPasteRecoveryBanner/>` sourced from sessionStorage with a "Restore" button that re-fires the rollback. Banner dismiss is gated on a successful restore. `bulk-paste-double-fault.integration.test.ts` (AC-13b) covers the full recovery flow. Residual risk: operator closes the browser entirely AND clears sessionStorage before restoring — manual paste re-issue is still possible but the snapshot is gone. |
| **NEW (C-04 sweep-2)** | **Canvas node-drag deferred to follow-on spec** | **Acknowledged** — v1 ships `nodesDraggable={false}`; the canvas is a viewer, not an editor. This keeps NFR-04's 60 fps budget honest and defers the editor-vs-viewer affordance question. Persona-P5 may file a "can I drag nodes around?" ticket day 1; a follow-on spec can flip the flag and add a "Save layout" persistence path. No risk to v1 correctness — just a UX gap. |
| **NEW (N-04)** | **slugify divergence with ontology-manager** | **Acknowledged** — until ontology-manager ships, `pwa/src/lib/slugify.ts` is the only source. When ontology-manager lands, a coverage test asserts byte-for-byte equivalence with ontology-manager's `slugify`. Filed as `pwa-ontology-slugify-coverage.test.ts` follow-up. |

## §13. Open-accepted carried for tasks phase

These items are non-blocking but should be pinned in `tasks.md`:

1. **`uuidv7` package choice.** Either `uuidv7` (1 KB gz) or hand-rolled.
   Tasks phase picks. If hand-rolled, lives in `pwa/src/lib/uuidv7.ts`
   and `shared/src/uuid.ts` (the latter is added for SSR/server symmetry
   even though graph-core's `createNode` already generates server-side
   UUIDv7 when client omits the id — only the import path explicitly
   needs client-side ids for the edge references). Tasks pick.

2. **`react-focus-lock` vs hand-rolled focus trap.** Adds ~4 KB.
   Hand-rolled is feasible (one component, modest code). Tasks decide.

3. **`@dagrejs/dagre` layout options.** Default top-to-bottom or
   left-to-right per orientation (locked). Tasks pick the exact
   `nodesep` + `ranksep` numerics by trial on the 200-node fixture.

4. **Slugify cross-spec coverage test** (N-04 first-sweep + sweep-2
   follow-up) — `pwa/src/__tests__/pwa-ontology-slugify-coverage.test.ts`
   lands as a tasks-phase entry gated on ontology-manager shipping
   (N-04 sweep-2 pins the path: vitest, lives alongside the other
   `__tests__` files; not in `pwa/scripts/`, not in `__tests__/integration/`).
   Until then, this spec's `pwa/src/lib/slugify.ts` is the authority;
   the placeholder file ships skipped (`test.skip(...)`) and converts to
   `test(...)` once ontology-manager merges its slugify.

Items 5+6 from the pass-1 review (bundle-check threshold tuning,
schema-fallback warning copy) are now pinned in §6.3 and §4.4
respectively (N-05 fix — removed from this list).

5. **Mirror `_review.status` to a top-level property** (B-02 sweep-2
   follow-up — option c from the review). The regex-on-JSON predicate
   in `reviewQueueForDomain` works but is fragile against future
   attribute-name collisions. A future graph-core write-side change
   could mirror `_review.status` to `n.review_status` on every
   flag/verify write, enabling a property-indexed predicate. Out of
   scope for v1 (breaches NFR-07); revisit when queue volume warrants
   the maintenance cost of the regex.

6. **ETag-style optimistic concurrency on `mergeAttributes`** (C-03
   sweep-2 follow-up — option b from the review). Adds an `If-Match:
   <updatedAt>` header on every PATCH; graph-core rejects with `412
   precondition_failed` on mismatch. Requires a graph-core write-side
   amendment. Out of scope for v1 (breaches NFR-07); revisit if the
   acknowledged race window starts producing observable conflicts in
   production.

7. **Canvas node-drag** (C-04 sweep-2 follow-up). v1 ships
   `nodesDraggable={false}`; a follow-on spec can enable drag + add a
   "Save layout" persistence path that writes node positions back to
   `node.attributes._layout` (or to a per-user prefStore entry).

## §14. Phasing

A suggested ordering for the tasks phase (informational — tasks.md is
the authoritative list):

| Phase | Tasks | Output |
|-------|-------|--------|
| **1. Foundation** | T-01..T-03 — install deps, set up vitest + playwright, write graph-core search-helper + index | Bundle-clean build; test harness green; graph-core search endpoint live + indexed |
| **2. Stores + data** | T-04..T-07 — zustand stores, data layer, schema cache, corrected health polling | Schema available everywhere; reads cached; banner correct on every route |
| **3. Read views (PE-1 + PE-2)** | T-08..T-10 — extend route, fill all explorer views, build search + path-finder | Ravi's persona path complete |
| **4. Canvas (PE-3)** | T-11 — JourneyCanvas + export | Visualisation + PNG/SVG export |
| **5. Write paths (SME-1, SME-2)** | T-12..T-15 — new-journey, bulk paste, typeahead, flag-for-review + review queue + out-of-domain guard | Priya's bootstrap + correct paths |
| **6. Quarterly + bulk sign-off (SME-3)** | T-16 — quarterly view + bulk patch via import | Priya's sign-off path |
| **7. PWA polish** | T-17..T-19 — modal/focus-trap, side panel layout, design-token refinements | Native conflicts neutralised |
| **8. Offline + SSE** | T-20..T-21 — SW + schemaSub + cross-browser playwright | Offline reads + schema live-update |
| **9. Verification** | T-22 — full AC sweep, bundle-check, lighthouse, no-auth grep, deterministic snapshot | All ACs green; CI gates |

Critical-path estimate: **8–12 working days** for a focused single-implementer pass on the PWA, plus **1 day** for the graph-core amendment (Phase 1.5).

## §15. Cross-spec touch points (re-stated for review)

- **`graph-core` amendment (REQUIRED before PWA's search-helper test
  passes):** new `GET /api/v1/query/search?label&q&limit` + 6 fulltext
  indexes inside `applySchema()` in `api/src/neo4j/bootstrap.ts`
  (§5.2). graph-core is at `execution:complete` (T-01..T-30 shipped +
  verified 2026-05-23 per `graph-core/STATUS.md`); this amendment files
  as a **new T-31 in `graph-core/tasks.md`** (post-completion
  amendment, not a backfill into a non-existent deferred queue).
  Process-explorer-ui PR must include the T-31 diff in the same commit
  OR block on graph-core merging T-31 first.

- **Requirements revision 3 (REQUIRED for AC-25 traceability):**
  bump requirements to revision 3 with shorter SME route names
  (`#/sme/add`, `#/sme/review`, `#/sme/quarterly`) + updated AC-25
  wording (`"open #/sme/add"`). Filed alongside this design as a
  one-line requirements rev-3 edit. Pure rename — no semantic change.

- **`ontology-manager` consumption (soft dependency):** `/api/v1/schema`
  + `/api/v1/ontology/events`. Until shipped, schema fallback to
  compile-time const tuples (§4.4 fallback path; SchemaBootstrap C-03
  fall-through on 404). Process-explorer-ui ships independently; when
  ontology-manager lands, the existing wiring switches over via the
  live runtime registry without code changes. Coordination notes
  (ETag emission, `retry: 5000`) in §5.3.

- **`chat-interface` parallel-review touch point (N-07 sweep-2 fix):**
  `chat-interface` is currently in parallel review (revision 3 →
  revision 3.1) and consumes the same `GET /api/v1/query/search` helper
  added by this spec for its citation lookups. Both specs land T-31 of
  `graph-core` (the search-helper + 6 fulltext indexes amendment); the
  amendment ships ONCE in the merge that lands first, and the second
  spec's PR just consumes it. A cross-link is filed in
  `.claude/specs/chat-interface/STATUS.md` and in `graph-core/tasks.md`'s
  T-31 entry so both spec authors see the shared dependency. If
  `chat-interface` merges first, this spec's `bun test:integration` for
  AC-28 passes without additional T-31 work; if this spec merges first,
  `chat-interface`'s equivalent test passes. The amendment is
  idempotent (per-label fulltext indexes use `IF NOT EXISTS`; second
  ApplySchema run is a no-op per AC-32).

- **`cto-analytics` future consumption:** Activity attribute schemas
  (`repetitive`, `data_richness`) — `cto-analytics` consumes via
  ontology-manager. No process-explorer-ui involvement.

---

End of design. Files referenced:
- 📄 `.claude/specs/process-explorer-ui/requirements.md` (revision 2)
- 📄 `.claude/specs/graph-core/design.md` (revision 2)
- 📄 `.claude/specs/ontology-manager/design.md` (revision 2)
- 📊 `.claude/specs/process-explorer-ui/STATUS.md` (to be updated to `design:draft`)
