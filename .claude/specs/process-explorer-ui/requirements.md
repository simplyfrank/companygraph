---
feature: "process-explorer-ui"
created: "2026-05-22"
author: "frank"
status: "approved"
revision: 4
size: "large"
depends_on: ["graph-core", "ontology-manager"]
user_stories_source: "companygraph-user-stories.html v0.1 — personas P2 (Ravi, Process Explorer) and P5 (Priya, Domain SME); epics PE-1..PE-3 (read paths) and SME-1..SME-3 (write paths)"
reviewing_pass_1_findings: "5 blockers, 7 concerns, 4 nits — all absorbed in revision 2 (see §Pass-1 review resolutions)."
revision_3_change: "Rename SME routes to match the PWA scaffold tab ids (B-03 of design pass-1 review): #/sme/new-journey → #/sme/add, #/sme/review-queue → #/sme/review, #/sme/review-quarterly → #/sme/quarterly. AC-25 wording updated accordingly. No semantic change — pure rename."
revision_4_change: "Lock the explorer route names to the live PWA scaffold tab ids (B-01 of design pass-1 review). Requirements rev 3 used plural `#/explorer/journeys/:id` (and shape `#/explorer/path`); the live scaffold (`pwa/src/route.ts:12–22`, `pwa/src/views/index.tsx:48–60`) ships hyphenated compound ids `journey-detail`, `journey-graph`, `path-finder`. This rev adopts the scaffold's shape across every FR + AC (FR-03, FR-04, FR-05, FR-06, FR-07, FR-09, FR-10, FR-11, FR-14, AC-02, AC-06, AC-07, AC-11, AC-24, AC-29, AC-30). No semantic change — pure rename. See ## Revision 4 changes for the full route table."
---

## Revision 4 changes

**Lock the explorer route shape to the live PWA scaffold** (B-01 of
design pass-1 review). Requirements rev 3 carried three contradictory
shapes for the explorer surface:

1. **Live scaffold** (`pwa/src/route.ts:12–22`, `pwa/src/views/index.tsx:48–60`):
   hyphenated compound ids — `journey-detail`, `journey-graph`,
   `path-finder`, `domains`, `systems`.
2. **Requirements rev 3**: plural REST-style — `journeys`, `path`, `systems`.
3. **Design rev 1 §3**: singular — `journey`, `path`, `systems`.

AC-11's deep-link test asserts `#/explorer/journeys/<seed-id>` loads —
but the scaffold's `parseHash` would fall back to the surface's first
tab (`domains`) on the unknown tab id, failing the test outright.

**Resolution (option a from the review)**: adopt the scaffold's
hyphenated tab ids verbatim. The scaffold is the live ground truth;
rewriting `parseHash` to canonicalise plurals would cost code for no
semantic win, and the SME-route rename in rev 3 already established the
"scaffold tab-id naming wins" convention. This rev propagates that same
convention to the explorer surface.

### Canonical explorer route table (locked)

| Purpose | Hash route | Scaffold tab id |
|---------|------------|------------------|
| Domain list | `#/explorer/domains` | `domains` |
| Domain detail | `#/explorer/domains/:domainId` | `domains` |
| Journey list | `#/explorer/journey-detail` | `journey-detail` |
| Journey detail | `#/explorer/journey-detail/:journeyId` | `journey-detail` |
| Journey canvas | `#/explorer/journey-graph/:journeyId` | `journey-graph` |
| System list | `#/explorer/systems` | `systems` |
| System detail | `#/explorer/systems/:systemId` | `systems` |
| Path finder | `#/explorer/path-finder` | `path-finder` |
| Activity list (multi-filter) | `#/explorer/activities[?system=&role=&location=]` | `activities` (virtual) |
| Activity detail | `#/explorer/activities/:activityId` | `activities` (virtual) |
| Role detail | `#/explorer/roles/:roleId` | `roles` (virtual) |
| Location detail | `#/explorer/locations/:locationId` | `locations` (virtual) |

"Virtual" tabs (`activities`, `roles`, `locations`) are not in
`SURFACES` (no SubNav entry) but are accepted by `parseHash` via
the existing `EXPLORER_VIRTUAL_TABS` allowlist in
`pwa/src/route.ts:112` — no scaffold change required.

**Journey canvas is now a sibling tab**, not a sub-mode of
`journey-detail`. Rev 3's design split-canvas-from-detail used a
`/:id/canvas` mode segment under one tab file; the live scaffold
already exposes `journey-graph` as a discrete tab, so we route to
the sibling tab instead. This avoids the `mode` segment for the
canvas view entirely. Other entity-detail sub-routes still use the
`:entityId` 3rd-segment pattern.

### FR / AC sweep (rev 4 line-level changes)

Every reference to the old shapes is rewritten:

| Old (rev 3) | New (rev 4) | Sites |
|-------------|-------------|-------|
| `#/explorer/journeys/:id` | `#/explorer/journey-detail/:id` | FR-03, FR-14, AC-02, AC-11, AC-29, AC-30 |
| `#/explorer/journeys/:id/canvas` | `#/explorer/journey-graph/:id` | FR-11, FR-14, AC-10, AC-24 |
| `#/explorer/path` | `#/explorer/path-finder` | FR-10 |
| `#/explorer/activities` (and `?…` form) | unchanged (`activities` is the virtual tab id) | FR-09, AC-06 |
| `#/explorer/activities/:id` | unchanged | FR-04, AC-11 |
| `#/explorer/systems/:id` | unchanged | FR-05, FR-14, AC-04, AC-11 |
| `#/explorer/roles/:id` | unchanged | FR-06, FR-14, AC-11 |
| `#/explorer/locations/:id` | unchanged | FR-07, FR-14, AC-11 |
| `#/explorer/domains/:id` | unchanged | FR-14 |

`#/sme/{add,review,quarterly}` (rev 3 rename) is untouched — those
already match the scaffold.

## Pass-1 review resolutions (revision 2)

All findings from `review-requirements.md` (pass 1, 2026-05-22) are
absorbed below. Cross-reference table:

| Finding | Disposition | Section |
|---------|-------------|---------|
| **B-01** `/api/v1/schema` doesn't exist in graph-core | Endpoint now OWNED by `ontology-manager/FR-14` (just-revised). FR-27, FR-28, Dependencies updated. NFR-07 explicitly excludes ontology-manager-owned endpoints from its "no new graph-core API" rule. | FR-27, FR-28, Dependencies, NFR-07 |
| **B-02** SSE endpoint `/api/v1/ontology/events` doesn't exist | Endpoint now provided by `ontology-manager/FR-17` (just-revised, dual-channel in-process + SSE). FR-28 updated. | FR-28 |
| **B-03** Multiple ACs lack input-mode + observable-outcome | Tightened all manual ACs (AC-02/04/06/10/12/18/23/24/25/27) to include explicit input mode + observable outcome per the verification rule. | AC table |
| **B-04** FR-21 server-side guard contradicts NFR-07 + Risks #3 | Resolved by adopting Risks #3 (a): advisory client-side only. FR-21 rewritten; AC-17 server-side test dropped; NFR-07 unchanged. | FR-21, AC-17, NFR-07 |
| **B-05** Review/verification attribute names will collide with ontology-manager namespace | Namespaced as `node.attributes._review.*` and `node.attributes._verification.*`. FR-18, FR-20, AC-15, AC-16 updated. | FR-18, FR-20, AC-15, AC-16 |
| **C-01** FR-06 + FR-07 marked "(implied)" | Lowered priority to `should` (acknowledged as out of the 18-story commitment); spawning new stories deferred to user-stories v0.2. | FR-06, FR-07 |
| **C-02** FR-21 server-side validator location unspecified | Resolved by B-04 — no server-side guard exists. | FR-21 |
| **C-03** Re-paste reorder ambiguity | Pinned: **order-preserving** (re-paste rewrites `PRECEDES` to match the new order; activity creation is the idempotent part). | FR-16 |
| **C-04** Service-worker degradation contract hand-wavy | Pinned: SW registration may fail; app loads without offline; "stale" banner does NOT appear when SW isn't registered. | FR-27, AC-20 |
| **C-05** `result_truncated` UI handling missing for findPath | Added to FR-10 + AC-07. | FR-10, AC-07 |
| **C-06** "No path" UI state missing | Added to FR-10 + AC-07. | FR-10, AC-07 |
| **C-07** XC-1.1 / XC-1.2 inheritance not AC'd in this spec | Added AC-29. | AC-29 |
| **N-01** Author field missing | Added to frontmatter. | (frontmatter) |
| **N-02** Canvas-library cross-ref in FR-11 | Added one-sentence note. | FR-11 |
| **N-03** XC-* tagging on FR-24..FR-28 | FR-27 tagged `XC-3.1` (boot); FR-24/FR-28 tagged `(cross-cutting)` with explicit rationale. | FR-24, FR-27, FR-28 |
| **N-04** `PRECEDES` cycle tiebreaker baked into FR-03 | Added `createdAt ASC` tiebreaker to FR-03. | FR-03 |
| **Native Conflicts gaps** (rubber-band, long-press menu, Cmd+F, smart-search, Voice Control) | 4 new rows added (rubber-band, long-press, Cmd+F, smart-search); Voice Control acknowledged as out-of-scope. | Native Conflicts |
| **NFR-09 missing AC** | Added AC-30 (deterministic hydration snapshot test). | AC-30 |
| **`zustand` "or equivalent" still floating** | Locked to `zustand`. | Dependencies |

The remaining 4 concerns (C-02, C-04, C-07) and 4 nits (N-01..N-04) are all reflected above. No fix re-architects the spec; all are surgical text changes.

# Requirements: process-explorer-ui

## Summary

`process-explorer-ui` is the **interactive PWA** for browsing, searching,
filtering, visualising, and editing the retail-process graph established
in `graph-core` and curated in `ontology-manager`. It serves two personas:

- **P2 — Ravi (Process Explorer):** read-only browsing — domain → journey
  → activity drill-down, system-centric views, full-text search,
  multi-filter, shortest-path tracing, interactive canvas with PNG/SVG
  export, deep-linkable URLs (PE-1..PE-3, 10 stories).
- **P5 — Priya (Domain SME):** write paths — adding journeys/activities
  through forms + bulk paste, typeahead binding, "needs review" flags,
  verification metadata, quarterly bulk sign-off (SME-1..SME-3, 8
  stories).

This spec replaces the placeholder shell from `graph-core/FR-09` with a
real client-side router, real views, real interactivity, real graph
rendering. It is the **largest** downstream spec (18 stories, two
personas, full PWA gesture + keyboard + touch surface, write paths) and
introduces both the canvas-renderer choice deferred by `graph-core/Risks
#1` and the service-worker / offline story deferred by `graph-core/§7.1`.

## Motivation

Ravi's daily question is "what depends on what?" — `graph-core`'s REST
API answers it but only to a script-author. Without a UI, every PM
question requires a developer translation layer, defeating the
hypothesis that companygraph reduces time-to-answer on graph-shape
questions below 2 minutes (Ravi's persona-card success criterion).

Priya's job is to **bootstrap and validate** the catalog. Without
lightweight forms, bulk paste, and a "review queue", every workshop
output is hand-translated to API calls by a developer, and quarterly
sign-off is a Google Sheet — failure mode of the prior approach the
companygraph project replaces.

This spec is also where the **gesture / keyboard / focus** constraints
of an interactive graph PWA land — pinch-zoom on the canvas, two-finger
pan, browser back-gesture during deep-link nav, slash-key focus on
search, keyboard arrow nav through search results. `graph-core` flagged
this as the future requirements doc's job (`graph-core/requirements.md`
Native Conflicts section). This spec populates that table.

## Functional Requirements

### Browse & navigate (PE-1)

| ID | Requirement | Priority | Story |
|----|-------------|----------|-------|
| FR-01 | **Domain index** — route `#/explorer/domains` lists every domain (4+ from `graph-core/FR-08` seed; more from `ontology-manager`). Each card shows name, description, member-journey count, last-updated time (`max(updatedAt)` across journeys). | must | PE-1.1 |
| FR-02 | **Soft navigation** — clicking a domain card opens the journey list within 200 ms; no full page reload. The PWA is a single-page client-side-routed app. | must | PE-1.1 |
| FR-03 | **Journey detail** — route `#/explorer/journey-detail/:id` shows a journey's metadata + its activities **ordered by `PRECEDES`**, with arrow indicators between consecutive steps. Cycles in `PRECEDES` are flagged with a warning ribbon and rendered in **`createdAt` ASC order** (tiebreaker) — never enter an infinite loop. Deep-link survives reload. | must | PE-1.2 |
| FR-04 | **Activity detail** — route `#/explorer/activities/:id` shows four bound lists: roles (`EXECUTES`), systems (`USES_SYSTEM`), locations (`AT_LOCATION`), and adjacent activities (`PRECEDES` in both directions). Each list item routes to its entity detail. Back navigation preserves scroll position. | must | PE-1.3 |
| FR-05 | **System-centric view** — route `#/explorer/systems/:id` lists every activity that uses this system (via `USES_SYSTEM`), grouped by parent journey + domain. A toggle reveals downstream `INTEGRATES_WITH` systems with one-hop neighbours visualised. | must | PE-1.4 |
| FR-06 | **Role-centric view** — route `#/explorer/roles/:id` lists every activity bound to this role (via `EXECUTES`), grouped by parent journey + domain. Parallel to system-centric view. Acknowledged as "(implied)" from PE-1.3 — not directly named in a user story; priority lowered to `should` so a bundle-budget cut can drop this without contradicting the spec. | should | PE-1.3 (implied — out of 18-story commitment) |
| FR-07 | **Location-centric view** — route `#/explorer/locations/:id` lists every activity at this location (via `AT_LOCATION`); shows the location hierarchy (`PART_OF` chain) breadcrumb. Same priority caveat as FR-06. | should | PE-1.3 (implied — out of 18-story commitment) |

### Search & filter (PE-2)

| ID | Requirement | Priority | Story |
|----|-------------|----------|-------|
| FR-08 | **Full-text search across node names** — search field on every route; results within 500 ms on `retail-mini` (~60 nodes). Results grouped by node label. Keyboard contract: `/` focuses search; arrow up/down moves selection; enter opens; escape closes. | must | PE-2.1 |
| FR-09 | **Multi-filter on activities** — route `#/explorer/activities?system=:id&role=:id&location=:id` AND-filters. Empty filter returns all activities. URL shareable + survives reload. Filter widgets render the active filters as chips with a clear control per chip. | must | PE-2.2 |
| FR-10 | **Shortest-path trace** — route `#/explorer/path-finder`. UI calls `graph-core /api/v1/query/findPath?fromId&toId&maxDepth=:n` (FR-07 of graph-core). Renders each hop with the edge-type label inline (e.g. `Activity → USES_SYSTEM → System`). Per `graph-core/design.md` §5.4, `findPath` uses single-shortest-path semantics and returns zero or one row. **UI states**: (a) one row → render the path. (b) zero rows → render `"No path within depth N — try increasing depth, or use the Cypher passthrough for all-paths search"` with a depth-selector hint. (c) `400 depth_exceeded` → render the friendly banner; depth-selector range is 1..8 (`graph-core/NFR-09`); selecting > 8 disabled in UI. (d) `400 query_timeout` → render `"Search timed out after 5 s — the graph is denser than the algorithm can handle within budget; try a smaller depth or use the Cypher passthrough"`. (e) `400 result_truncated` → render `"More than 1000 paths matched — narrow the search by setting a smaller depth"` (note: rare under shortestPath semantics, but included for completeness). | must | PE-2.3 |

### Visualise & export (PE-3)

| ID | Requirement | Priority | Story |
|----|-------------|----------|-------|
| FR-11 | **Interactive canvas for one journey** — `#/explorer/journey-graph/:id` renders the journey's activities + bound entities as a force-directed graph. Targets ≤ 200 nodes at 60 fps on a 2021 MacBook Air baseline. Selecting a node opens its detail in a side panel without losing canvas state (pan/zoom preserved). **Canvas library locked at design phase** (see Dependencies row + Risks #1) — resolves `graph-core/Risks #1`. The canvas is a sibling tab to `journey-detail` (not a `/:id/canvas` mode segment under it) — see scaffold tab id `journey-graph` at `pwa/src/route.ts:18`. | must | PE-3.1 |
| FR-12 | **Touch / trackpad gesture support on canvas** — pinch-zoom is captured by the canvas (not the page); two-finger pan; single-finger drag = pan on touch, single-finger tap = select. macOS trackpad: pinch = zoom; two-finger drag = pan; click = select. macOS mouse: scroll wheel = zoom; click+drag empty space = pan. Browser back-gesture (two-finger swipe from edge on Safari) is allowed through (does NOT pan the canvas at edge of viewport). | must | PE-3.1 |
| FR-13 | **PNG + SVG export of the current canvas view** — buttons in the canvas toolbar. PNG emits 1× and 2× variants (high-DPI displays). Filename embeds journey slug + ISO date (`<journey-slug>-<YYYY-MM-DD>.png`). Vector SVG preserves text + colours. | must | PE-3.2 |
| FR-14 | **Deep-link URLs for every entity** — `#/explorer/journey-detail/:id`, `#/explorer/journey-graph/:id`, `#/explorer/activities/:id`, `#/explorer/systems/:id`, `#/explorer/roles/:id`, `#/explorer/locations/:id`, `#/explorer/domains/:id`. Cold-load on each hydrates the correct detail panel from the API. Invalid id renders a 404 panel with a back-to-domain link, NOT a blank screen. | must | PE-3.3 |

### SME write paths (SME-1, SME-2, SME-3)

| ID | Requirement | Priority | Story |
|----|-------------|----------|-------|
| FR-15 | **New-journey form** — `#/sme/add` is a four-field form: `name` (required), `description` (required), `parent_domain` (pre-selected when entered from a domain page, otherwise dropdown), at least one `activity_stub` (free-text, becomes an `Activity` node). Submit creates the journey + activity stubs via `graph-core/POST /api/v1/nodes/UserJourney` + `POST /api/v1/edges (PART_OF)` in a single batched call (use `POST /api/v1/import`). | must | SME-1.1 |
| FR-16 | **Bulk-paste activity creation** — under a journey detail, a paste field accepts newline-delimited activity names. Each line becomes a `POST /api/v1/nodes/Activity` + a `PART_OF` edge to the parent journey. Order in the paste = `PRECEDES` chain (`paste[i] PRECEDES paste[i+1]`). **Order-preserving re-paste**: re-pasting `[B, A, C]` after a prior `[A, B, C]` paste rewrites the `PRECEDES` chain to `B → A → C` (matching the new paste order) while keeping the original `A`, `B`, `C` activity nodes (matched by `name` within the same parent journey — activity creation is the idempotent part, ordering is mutable). **Duplicate-name handling**: re-paste containing the same `name` twice (`[A, A, B]`) returns `400 {error:{code:"duplicate_activity_name", details:{name, line_numbers:[…]}}}` rather than silently de-duplicating — surfaces the operator-side issue. | must | SME-1.2 |
| FR-17 | **Typeahead binding** — when binding activities to roles / systems / locations, the typeahead queries `graph-core /api/v1/query/search?label=:Role&q=:fragment&limit=20` (a new query helper this spec needs `graph-core` to expose — see Risks #2) and returns top 20 matches within 200 ms. A "Create new" inline option creates the missing role / system / location via `POST /api/v1/nodes/:label` and binds in one click. | must | SME-1.3 |
| FR-18 | **"Needs review" flag with reason** — every node detail has a "Flag for review" action that PATCHes the namespaced sub-object `node.attributes._review = {status: "needs_review" | "verified" | "deprecated", reason: <free-text>, set_by: "operator", set_at: <ISO>}`. The `_` prefix puts these meta-attributes outside `ontology-manager`'s attribute-schema enforcement (per `ontology-manager`'s `_Ontology*` namespace convention — server-side `ontology-manager` already reserves underscore-prefixed names from user-registered schemas). Coverage test asserts `ontology-manager` does not register attribute schemas matching `^_`. (Resolves pass-1 B-05.) | must | SME-2.1 |
| FR-19 | **Review queue** — `#/sme/review` lists all `needs_review` nodes within the operator's home domain (see Risks #4 for domain-scoping mechanism). | must | SME-2.1 |
| FR-20 | **Verification metadata on journeys** — every journey carries `node.attributes._verification = {by: <Role id>, at: <ISO date>}` (same namespace convention as FR-18). UI shows them in the journey detail header (e.g. `"Verified by 'Store Ops Lead' on 2026-05-22"`). The `_verification` namespace is reserved by this spec; `ontology-manager` does not register attribute schemas matching `^_`. (Resolves pass-1 B-05.) | must | SME-2.2 |
| FR-21 | **Out-of-domain edit guard — advisory client-side only** (resolves pass-1 B-04 by adopting Risks #3 (a)). `home_domain` is a single-user `localStorage` preference. The UI **disables write buttons** (Flag-for-review, Verify, Bulk sign-off, New-journey-form, etc.) when the focused entity's parent domain ≠ `home_domain`, with a tooltip `"You're outside your home domain — switch home in Settings to edit here"`. **No server-side enforcement**: single-tenant single-trust per `graph-core/NFR-08` makes a 403 misleading (any operator can curl-around the UI). The guard is an SME workflow nudge, not a security boundary. NFR-07 stands — no new graph-core API surface. | must | SME-2.3 |
| FR-22 | **Quarterly review checklist** — `#/sme/quarterly` lists every journey in the home domain, grouped by **overdue** (`verified_at < 90 days ago`) vs **current**. Per-row toggle expands to show the activity list inline. Click any row to navigate to the journey detail. | must | SME-3.1 |
| FR-23 | **Bulk sign-off** — checkbox per row + "Sign off selected" applies `verified_by` + `verified_at` (current ISO date) to all selected journeys in one transaction (`POST /api/v1/import` with `nodes:[…]` carrying only the patches). Audit-log row records the bulk action with the journey id list. | must | SME-3.2 |

### Shared UI mechanics

| ID | Requirement | Priority | Story |
|----|-------------|----------|-------|
| FR-24 | **PWA shell extends `graph-core/FR-09`** — the placeholder shell becomes a real app shell: top bar (domain selector, search, profile), left nav (Explorer / SME), main content area, side panel (entity detail). All five panels render on mobile via collapse / drawer. | must | (cross-cutting) |
| FR-25 | **Connectivity banner inherited from `graph-core`** — XC-1.1 polling (`/healthz` on mount + `visibilitychange→visible` + 30 s while visible) continues to drive the banner in this spec's shell. No additional polling logic added. | must | XC-1.1 |
| FR-26 | **Stats counts in shell** — XC-1.2: shell renders node + edge counts from `/api/v1/stats` as a ground-truth indicator above the nav. | must | XC-1.2 |
| FR-27 | **Service worker** — registered on app load. Precaches the app shell + the latest live schema fetched from **`ontology-manager`-owned `GET /api/v1/schema`** (per `ontology-manager/FR-14`; this endpoint is owned by `ontology-manager`, not `graph-core` — pass-1 B-01). Network-first for `/api/v1/*` data; cache-first for static assets. Offline: read paths show last-cached data with a "stale" banner; write paths show `disabled — offline` with a queued-retry option deferred to a follow-on spec. **Degradation contract** (pass-1 C-04): SW registration MAY fail (Safari private mode, quota exhausted, user denied). When registration fails, the app loads normally without offline support; the connectivity banner from FR-25 continues to work as the only offline-state indicator. No reads are cached. Writes are attempted online-only and surface their own network errors. The "stale" banner does NOT appear when SW isn't registered. | should | XC-3.1 (cross-cutting boot) |
| FR-28 | **Schema-change subscription via SSE** — listens to `ontology.changed` events on **`ontology-manager`-owned `GET /api/v1/ontology/events`** (Server-Sent Events; per `ontology-manager/FR-17` — pass-1 B-02). On each event, the in-app schema cache is invalidated and the next `/api/v1/schema` fetch refreshes it. Browser `EventSource` API is used directly; reconnection via `Last-Event-ID` per `ontology-manager/NFR-09`. **Fallback when SSE not connected** (e.g. corporate-proxy buffering, connection failure): polls `GET /api/v1/schema`'s `ETag` / `If-Modified-Since` headers on a 5-min interval. | should | (cross-cutting) |

## Non-Functional Requirements

| ID | Requirement | Category |
|----|-------------|----------|
| NFR-01 | TypeScript transpiles cleanly with `bun build --no-bundle`; no `tsc` step. | reliability |
| NFR-02 | Initial JS bundle ≤ 300 KB gzipped (PWA, mobile-first). Force a budget check in CI. | performance |
| NFR-03 | Time-to-interactive ≤ 2 s on a 2021 MacBook Air on a clean cache (`retail-mini` seed). | performance |
| NFR-04 | Interactive canvas (FR-11) hits 60 fps at ≤ 200 nodes on the same baseline; degrades gracefully (downsampling, hide labels) above 200. | performance |
| NFR-05 | Every interactive control is **keyboard-reachable** — focus order is meaningful; `Escape` closes modals/popovers; `Enter`/`Space` activates buttons; no keyboard-trap. | accessibility |
| NFR-06 | Every interactive control is **touch-reachable** with ≥ 44×44 px hit targets. | accessibility |
| NFR-07 | API contract from `graph-core` is **not extended** by this spec except for one read-only search helper (FR-17 — `/api/v1/query/search`). `ontology-manager`-owned endpoints (`/api/v1/schema`, `/api/v1/ontology/events`) are NOT graph-core extensions and are out-of-scope of this clause. FR-21's out-of-domain guard is client-side only (no server-side handler added — see FR-21 wording). Any other backend need must go through a separate spec amendment. | scope |
| NFR-08 | No auth code paths introduced (per `graph-core/NFR-08` + AC-22). The `home_domain` preference is a single-user localStorage value, not a user identity. | security |
| NFR-09 | Bundle hydration is **deterministic** — given a fixed `/api/v1/changes?since=` cursor + the same browser, the rendered DOM is byte-identical across runs (used for snapshot tests). | testability |

## Scope Boundaries

**In scope:**
- Full read-path PWA covering PE-1, PE-2, PE-3.
- Interactive canvas with pinch-zoom / pan / select / export.
- Deep-link URLs for every entity type.
- SME write paths covering SME-1, SME-2, SME-3 (new-journey form, bulk paste, typeahead binding, review queue, verification metadata, out-of-domain guard, quarterly checklist, bulk sign-off).
- Service worker with precache + network-first / cache-first split.
- Schema cache + `ontology.changed` subscription.
- One new read-only search helper added to `graph-core/api` (FR-17 cross-cut).

**Out of scope (tracked elsewhere):**
- Natural-language chat — `chat-interface`.
- Complexity / consolidation / AI-candidate dashboards — `cto-analytics`.
- Ontology CRUD UI — covered by `ontology-manager` REST + a thin admin pane is **deferred to a follow-on small spec**, not landed here.
- Real auth / RBAC — `graph-core/NFR-08` is the project-wide stance.
- Offline write-queue + sync — service worker precaches reads only; writes fail when offline. A follow-on spec can add a queued-retry path.
- Multi-tab state sync (e.g. `BroadcastChannel`) — deferred.
- Comments / annotations on entities — deferred.

## Acceptance Criteria

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | Domain index renders all seed domains; click→journey list ≤ 200 ms (FR-01, FR-02) | iPhone Safari (touch), iPad Safari (touch), macOS Safari (trackpad+kb), macOS Chrome (mouse+kb) | `pwa/__tests__/domain-index.test.tsx` + manual: load `#/explorer/domains` on each platform — expect 4+ cards, click each — expect detail loads within 200 ms with no full reload |
| AC-02 | Journey detail orders activities by `PRECEDES`; cycle warning ribbon shown when present; cycles render in `createdAt` ASC order (FR-03) | all four | `pwa/__tests__/journey-detail.test.tsx` (snapshot tests on (a) the linear-chain seed journey and (b) the cycle-fixture journey) + manual on macOS Chrome (mouse+kb): load `#/explorer/journey-detail/<linear-seed-id>` — expect activities in declared `PRECEDES` order; load `#/explorer/journey-detail/<cycle-fixture-id>` — expect a yellow warning ribbon at the top with text containing `"cycle"` and activities rendered in `createdAt` ASC order (verify via inspecting `data-test-id="activity-row"` rendered children) |
| AC-03 | Activity detail shows four bound lists; back nav preserves scroll (FR-04) | all four | `pwa/__tests__/activity-detail.test.tsx` + manual: scroll mid-list, navigate into a role, hit back — expect same scroll position |
| AC-04 | System-centric view lists activities; INTEGRATES_WITH toggle reveals neighbours (FR-05) | all four | `pwa/__tests__/system-view.test.tsx` (DOM coverage) + manual on iPad Safari (touch): load `#/explorer/systems/<seed-pos-id>`, tap the `INTEGRATES_WITH` toggle, expect at least one neighbour card appears below the activity list with the system name visible |
| AC-05 | Full-text search returns within 500 ms; grouped by label; `/` focuses, arrows move, enter opens, escape closes (FR-08) | all four | `pwa/__tests__/search.test.tsx` + manual on each platform: type `/`, expect focus; type fragment, expect results in <500 ms; arrow + enter, expect navigation |
| AC-06 | Activities AND-filter URL works; URL is shareable + survives reload across all four platforms (FR-09) | all four | `pwa/__tests__/activity-filter.test.tsx` (DOM coverage of filter chip + URL state) + manual on iPhone Safari (touch): load `#/explorer/activities?system=<seed-pos-id>&role=<seed-cashier-id>`, expect only activities matching BOTH filters render; tap browser refresh, expect same filters + same results render; copy the URL via Share sheet and paste into a new tab, expect same view loads |
| AC-07 | findPath UI handles every API response shape (FR-10): success path, no-path-found, depth_exceeded, query_timeout, result_truncated | all four | `pwa/__tests__/find-path.test.tsx` covering each response (mocked); plus manual on macOS Chrome (mouse+kb): (a) pick two connected nodes, depth=4 — expect path renders with hop labels; (b) pick two disconnected nodes, depth=4 — expect `"No path within depth 4"` message rendered; (c) set depth to 9 via direct query-string — expect depth selector clamps to 8 with inline hint `"Max depth is 8"`, no API call fires; (d) trigger a slow query (test fixture sleeps 6 s) — expect `"Search timed out after 5 s"` banner. |
| AC-08 | Interactive canvas renders ≤ 200 nodes at 60 fps; selection opens side panel without losing pan/zoom (FR-11) | iPad Safari (touch), macOS Safari (trackpad), macOS Chrome (mouse+kb); explicitly NOT iPhone (canvas usable but not perf-targeted) | `pwa/__tests__/canvas-render.test.tsx` (jsdom rendering coverage) + manual perf: open journey canvas on the baseline machine, drag-pan + pinch-zoom, expect frame-time logs ≤ 16 ms |
| AC-09 | Pinch-zoom on iPad Safari is captured by the canvas (does NOT zoom the page); two-finger pan captured (does NOT scroll the page); single-finger tap selects; browser back-gesture passes through at canvas edge (FR-12) | iPad Safari (touch), iPhone Safari (touch) | manual: on iPad Safari, pinch on canvas — expect canvas zooms but page does not; two-finger drag — expect canvas pans, page does not scroll; tap — expect node selected; swipe from left edge — expect browser back works |
| AC-10 | PNG + SVG export buttons work; filenames embed slug + ISO date (FR-13) | all four | `pwa/__tests__/canvas-export.test.tsx` (blob shape) + manual on macOS Safari (trackpad+kb): open `#/explorer/journey-graph/<seed-id>`, click "Export PNG" — expect a download with filename matching `<journey-slug>-YYYY-MM-DD.png`; open the file, verify the rendered canvas matches the screen contents; click "Export SVG" — expect a download with `.svg` extension that opens as vector with text legible |
| AC-11 | Every entity type has a deep-link; cold-load renders correct detail panel; invalid id renders 404 panel with back-to-domain link, NOT a blank screen (FR-14) | all four | `pwa/__tests__/deep-link.test.tsx` for the URL→panel mapping (covers all 7 entity-type routes including `journey-graph`) + manual on iPad Safari (touch): paste `#/explorer/journey-detail/<seed-id>` into a fresh tab — expect journey detail loads; paste `#/explorer/journey-detail/00000000-0000-7000-8000-000000000000` (valid-shaped but non-existent UUIDv7) — expect "404 — journey not found" panel with a tappable "Back to Domains" link |
| AC-12 | New-journey form creates journey + at-least-one activity in one batch (FR-15) | macOS Safari (trackpad+kb), macOS Chrome (mouse+kb); degraded but functional on iPad/iPhone | `pwa/__tests__/new-journey.test.tsx` + integration: assert one POST to `/import` not multiple; manual on macOS Chrome: fill form (name="Test Journey", description="test", parent="Store Operations", activity_stub="Receive"), submit — expect single network request to `/api/v1/import`, expect redirect to the new journey's detail with the activity visible; manual on iPhone Safari: open the form route, expect a vertically-stacked layout (`form` element with `display:grid grid-template-columns:1fr` or equivalent) usable in portrait |
| AC-13 | Bulk-paste activities — each line creates an activity + `PART_OF`; ordering becomes `PRECEDES`; re-paste is idempotent (FR-16) | macOS Safari (trackpad+kb), macOS Chrome (mouse+kb) — paste is desktop-primary | `pwa/__tests__/bulk-paste.test.tsx` + integration: paste 4 lines, assert 4 activities + 3 `PRECEDES` edges + 4 `PART_OF` edges; re-paste, assert counts unchanged |
| AC-14 | Typeahead returns top 20 within 200 ms; "Create new" inline binds in one click (FR-17) | all four | `pwa/__tests__/typeahead.test.tsx` + integration round-trip |
| AC-15 | Flag-for-review PATCHes `node.attributes._review.status = "needs_review"` (namespaced — FR-18); queue lists `needs_review` nodes in home domain (FR-19) | all four | `pwa/__tests__/sme-review-flag.test.tsx` — assert the PATCH body matches `{attributes:{_review:{status:"needs_review", reason: <txt>, set_by:"operator", set_at: <ISO>}}}`; integration: post-flag, fetch `#/sme/review`, expect the node listed |
| AC-16 | Verification metadata visible on journey detail header — reads from `node.attributes._verification` namespace (FR-20) | all four | `pwa/__tests__/journey-detail.test.tsx` (extended) — render a journey with `attributes._verification = {by:<role-id>, at:"2026-05-20"}`, expect header text contains `"Verified by 'Store Ops Lead' on 2026-05-20"` |
| AC-17 | Out-of-domain write buttons are disabled in the UI; no API request fires; tooltip explains why (FR-21 — advisory client-side only) | all four | `pwa/__tests__/out-of-domain-disable.test.tsx` — set `home_domain` localStorage to domain A; mount detail panel for a node in domain B; assert write buttons (`[data-test-id="flag-for-review"]`, `[data-test-id="verify-journey"]`) have `disabled` attribute set + their `title` (tooltip) attribute contains `"outside your home domain"`. **NO server-side test** — per FR-21, the server does not enforce; any curl bypass is by design |
| AC-18 | Quarterly checklist groups by overdue (`_verification.at` > 90 days ago OR absent) / current; per-row expand shows activities (FR-22) | macOS Safari (trackpad+kb), macOS Chrome (mouse+kb) — SME workflow is desktop-primary | `pwa/__tests__/quarterly-checklist.test.tsx` + manual on macOS Chrome (mouse+kb): load `#/sme/quarterly`, expect two sections "Overdue (N)" and "Current (M)"; in the Overdue section, click the chevron on a row, expect the row expands to show that journey's activities in a nested list |
| AC-19 | Bulk sign-off PATCHes selected journeys in one transaction; audit log records the bulk action (FR-23) | macOS Safari, macOS Chrome | `pwa/__tests__/bulk-signoff.test.tsx` + integration |
| AC-20 | Service worker degrades gracefully on registration failure (Safari private mode, quota exhausted, user denied) — app loads normally, no "stale" banner appears, writes attempted online-only (FR-27 — pass-1 C-04) | iPhone Safari, iPad Safari, macOS Safari, macOS Chrome | manual on iPhone Safari (touch): enable Private Browsing, load `https://<host>/` — expect app shell renders, no SW console errors, no "stale" banner. Switch off Private Browsing, reload — expect SW registers (verify via DevTools → Storage → Service Workers); go offline (DevTools → Network → Offline), reload — expect shell + reads work from cache + "stale" banner visible + write buttons disabled with "offline" tooltip |
| AC-21 | `ontology.changed` SSE event invalidates schema cache; new labels appear in nav within ≤ 60 s (FR-28) | all four | `pwa/__tests__/schema-subscription.test.tsx` — mock `EventSource`, fire an `ontology.changed` event, assert the schema cache invalidates; integration on macOS Chrome: add a label via `ontology-manager`-REST, observe the PWA's nav within 60 s — expect the new label visible in the schema picker |
| AC-22 | Bundle ≤ 300 KB gzipped (NFR-02) | n/a (build) | CI step `bun run bundle-check` — fails if main chunk > 300 KB gzipped (assertion via `gzipSync(readFileSync('dist/main.js')).length`) |
| AC-23 | Time-to-interactive ≤ 2 s on a clean cache (NFR-03) | macOS Safari (trackpad+kb), macOS Chrome (mouse+kb) | automated: `lighthouse http://127.0.0.1:5173/ --form-factor=desktop --throttling.cpuSlowdownMultiplier=1 --only-categories=performance --output=json` — assert `audits["interactive"].numericValue < 2000` (ms); test fixture controls the Vite dev server with the `retail-mini` seed loaded |
| AC-24 | Canvas hits 60 fps at ≤ 200 nodes (NFR-04) | iPad Safari (touch), macOS Safari (trackpad+kb), macOS Chrome (mouse+kb) | manual on macOS Chrome (trackpad — covers gesture + frame budget): open `#/explorer/journey-graph/<200-node-fixture-id>`, open DevTools → Performance, start recording, two-finger trackpad-pan the canvas for 5 s, stop recording — assert median frame time ≤ 16 ms (60 fps) via the "Frames" track in Performance |
| AC-25 | Keyboard nav: Tab cycles through visible focusables in DOM order; no focus trap on any route; `Escape` closes any open modal/popover and returns focus to the trigger (NFR-05) | macOS Safari (trackpad+kb), macOS Chrome (mouse+kb) | manual on macOS Chrome (keyboard only): from `#/explorer/domains`, press Tab repeatedly until focus returns to the address bar (browser chrome) — expect every interactive element on the page was visited in visible order with no element trapping focus; open `#/sme/add`, Tab into the form, press `Escape` — expect form closes (or focus returns to the trigger), no modal remains visible |
| AC-26 | Touch hit targets ≥ 44×44 px (NFR-06) | iPhone Safari (touch), iPad Safari (touch) | `pwa/__tests__/touch-targets.test.tsx` — for every element matching `[data-tap]`, assert `getBoundingClientRect()` width ≥ 44 AND height ≥ 44 |
| AC-27 | No auth code paths in pwa/src — extends `graph-core/AC-22` grep | n/a (codebase) | `pwa/__tests__/no-auth-grep.test.ts` — reuses the `graph-core` curated pattern (`graph-core/design.md` §6.4): `verify(Jwt|Token)`, `currentUser\b`, `req\.user`, `req\.auth`, `req\.session`. Assert zero hits in `pwa/src/` |
| AC-28 | One new search helper `/api/v1/query/search?label=:L&q=:q&limit=:n` exists in `graph-core/api` (the only `graph-core` API surface extension allowed by NFR-07) | n/a (server) | `api/__tests__/search-helper.test.ts` — POST a new label via `ontology-manager`, seed three nodes with names containing `"fooba"`, fetch `/api/v1/query/search?label=Product&q=fooba&limit=20` — expect 3 rows, latency < 200 ms |
| AC-29 | Connectivity banner inherited from `graph-core/AC-14` surfaces on every route in this spec; killing the API flips the banner to disconnected within 30 s on `#/explorer/journey-detail/<seed-id>` (FR-25, FR-26 — pass-1 C-07) | macOS Safari (trackpad+kb), macOS Chrome (mouse+kb) | manual on macOS Chrome: start the dev stack, load `#/explorer/journey-detail/<seed-id>`, observe green-dot "Connected" banner with node-count summary; stop the API (`bun run stop`), wait ≤ 30 s — expect banner flips to red-dot "Disconnected" without a page reload |
| AC-30 | Deterministic hydration (NFR-09) — given a fixed `/api/v1/changes?since=` cursor + the same browser, rendered DOM is byte-identical across runs | n/a (snapshot test) | `pwa/__tests__/deterministic-hydration.test.tsx` — render `#/explorer/journey-detail/<seed-id>` twice from a fresh in-memory cache with the same fixture data; `outerHTML` deep-equal both renders (after stripping any `Date.now()`-derived test-only timestamp regions) |

## Platforms & Input Modes

This is a full-PWA spec — populated row-by-row. "yes" = feature must work
on that surface; "degrade" = feature works but with reduced fidelity;
"no" = explicitly out of scope on that surface (with justification).

| Surface | iPhone Safari (touch) | iPad Safari (touch + Pencil) | macOS Safari (trackpad + kb) | macOS Chrome (mouse + kb) |
|---------|-----------------------|-------------------------------|-------------------------------|----------------------------|
| Domain index + drill-down (PE-1) | yes | yes | yes | yes |
| Search + filter (PE-2) | yes | yes | yes | yes |
| Slash-key search focus (`/`) | n/a (no kb on phone, hide hint) | yes (external kb) | yes | yes |
| Arrow nav in search results | n/a | yes (external kb) | yes | yes |
| Interactive canvas — pan/zoom/select (PE-3) | degrade (usable but small) | yes | yes | yes |
| Pinch-zoom on canvas (FR-12) | yes | yes | yes (trackpad) | n/a (mouse — scroll-wheel zoom instead) |
| Two-finger pan on canvas (FR-12) | yes | yes | yes (trackpad) | n/a (mouse — click+drag empty space) |
| Browser back-gesture passes through at canvas edge | yes | yes | n/a (no swipe-back on macOS) | n/a |
| PNG + SVG export (FR-13) | yes (Files / Share sheet) | yes | yes (Downloads) | yes (Downloads) |
| Deep-link URLs (FR-14) | yes | yes | yes | yes |
| New-journey form (FR-15) | degrade (small form, vertical) | yes | yes | yes |
| Bulk-paste activities (FR-16) | no — paste UX poor on mobile; surface a "open on desktop" hint | degrade (works with external kb) | yes | yes |
| Typeahead binding (FR-17) | yes | yes | yes | yes |
| "Flag for review" + queue (FR-18, FR-19) | yes | yes | yes | yes |
| Quarterly bulk sign-off (FR-22, FR-23) | degrade | yes | yes | yes |
| Service worker (FR-27) | yes (with Safari SW restrictions noted in AC-20) | yes | yes (Safari restrictions) | yes |
| Keyboard shortcuts | n/a | yes (external kb) | yes | yes |
| Drag/drop / pencil input | no (no drag/drop affordances in this spec) | optional (Pencil treated as touch) | no | no |

## Native Conflicts

This spec is **gesture- and keyboard-heavy** — populated row-by-row.
Every conflict has an explicit suppression mechanism. Empty rows are
NOT acceptable here.

| Conflicting native behaviour | Affected surface | Suppression mechanism |
|------------------------------|------------------|------------------------|
| Pinch-zoom zooms the page (iOS Safari default) | Canvas (FR-11, FR-12) | `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">` on the canvas route only; `touch-action: none` on the canvas element captures the gesture |
| Two-finger pan scrolls the page | Canvas | `touch-action: none` on the canvas element; `e.preventDefault()` in the gesture handler |
| Browser back-gesture (two-finger edge swipe on iOS Safari) is consumed by the canvas pan | Canvas | Canvas pan handler ignores events whose initial touch is within 20 px of the viewport's left edge — letting Safari's back-gesture fire instead |
| Browser slash-key (`/`) opens Safari's quick-find on macOS | Search (FR-08) | Handler captures `keydown` on `document.body`, `preventDefault`s when the focused element is not an `<input>`/`<textarea>`, and routes focus into the search field |
| Browser arrow keys scroll the page | Search (FR-08) | Search-results popover captures arrow keys with `preventDefault` while focus is in the popover; outside the popover, arrows scroll normally |
| Browser tab key navigates browser chrome | Modals (FR-15, FR-19, FR-23) | Focus-trap inside the modal — `Tab` cycles through focusables in the modal; `Escape` releases the trap and closes the modal |
| Right-click context menu interferes with node right-click (none defined in this spec) | n/a | Canvas does not bind right-click; default browser context menu remains. Future spec may bind right-click → action menu and will need a suppression note |
| Pull-to-refresh on mobile reloads the PWA mid-canvas-drag | Canvas | `overscroll-behavior-y: contain` on the canvas-route body element |
| Double-tap-to-zoom on canvas zooms the page instead of the canvas | Canvas | `touch-action: none` + custom double-tap handler in the canvas component (treats double-tap as "zoom to fit selection") |
| Safari's back-forward cache (bfcache) restores stale React state on history nav | Deep-link routes (FR-14) | On `pageshow` event with `event.persisted === true`, the app refetches the current route's data and patches the React store |
| `<input>` autocomplete dropdown obscures typeahead results | Typeahead (FR-17) | `autocomplete="off"` + `aria-autocomplete="list"` on the typeahead input; results render in a portal above the input |
| iOS Safari rubber-band scrolling at the top of viewport lifts the sticky header off-screen | App shell header (FR-24) | `overscroll-behavior-y: contain` on `body` for routes with a sticky header |
| Long-press on a canvas node fires iOS text-selection menu | Canvas (FR-11, FR-12) | `user-select: none` + `-webkit-touch-callout: none` on the canvas container; single-finger tap is the only select gesture |
| `Cmd+F` opens browser find-in-page instead of in-app search | Search (FR-08) | **Intentionally NOT intercepted** — browser find-in-page works against page text (a desktop user expectation). `/` is the in-app search focus key (documented in the keyboard hint). The two are complementary. |
| Safari's "Smart Search Field" autocomplete drawer covers the typeahead | Typeahead (FR-17) | `autocomplete="off"` + the autocomplete-results portal renders above any browser overlay (z-index ≥ 9999) |
| iOS / macOS Voice Control overlays numbered hit-spots on every clickable region (overwhelming with a 200-node canvas) | Canvas (FR-11) | **Acknowledged as out-of-scope for v1.** Voice Control on a 200-node canvas is overwhelming by design of the canvas. Future spec may add a Voice-Control-friendly "list view" toggle for the canvas. |

## Dependencies

| Module/API | How it's affected |
|------------|-------------------|
| `graph-core` | Hard dependency. This spec consumes 100% of `graph-core`'s read API + the import endpoint for batched writes. ONE backend extension: a new `/api/v1/query/search?label=:L&q=:q&limit=:n` helper for FR-17 typeahead — this is the only new endpoint introduced by this spec. |
| `ontology-manager` | Soft dependency. This spec subscribes to schema changes; if `ontology-manager` is not yet shipped, the schema cache is built from `/api/v1/schema` (which `graph-core` already exposes — story OA-2.1 AC-1). |
| **Canvas library** | One of: Cytoscape.js, react-flow, sigma.js, d3-force. Design phase picks one (this resolves `graph-core/Risks #1`). Recommend react-flow for the React PWA stack already in `graph-core`. |
| `zustand` | **Locked** — single store for routes, search, filters, selection, schema cache. No "or equivalent" — matches `graph-core`'s pattern of locking ecosystem choices at requirements time. |
| Service worker (`workbox` or hand-rolled) | FR-27. Recommend hand-rolled given the small surface (one precache route + a fetch handler). |
| `vite-plugin-pwa` (if used) | PWA manifest + SW registration. Optional — can be replaced by a hand-rolled `pwa/sw.ts`. Design phase decides. |
| `playwright` (or `@playwright/test`) | Gesture + keyboard ACs that aren't testable in jsdom — pinch, two-finger pan, slash-focus across browsers. Adds a `playwright` CI job. |

## Risks & Open Questions

1. **Canvas-library choice.** Resolves `graph-core/Risks #1`. Trade-offs:
   - **react-flow** — React-native, easy integration, ≤ 1k nodes performant. Largest community for the React stack.
   - **Cytoscape.js** — graph-theoretic algorithms built in (useful for in-canvas pathfinding); steeper React integration.
   - **sigma.js** — WebGL renderer, scales to ≥ 10k nodes; we don't need that here.
   - **d3-force** — most customisable; longest implementation time.
   Recommend **react-flow** as the default; design phase confirms.

2. **`graph-core` API extension scope.** FR-17 needs a typeahead search
   helper. `graph-core/FR-07` exposes typed query helpers but no
   substring-match endpoint. The minimum new helper is
   `GET /api/v1/query/search?label=:L&q=:fragment&limit=:n` returning
   `{rows: [{id, name, label}…]}`. This is small but is a spec
   amendment — `graph-core` should add it (and AC-28 of this spec
   verifies). Alternative: implement client-side filtering on a small
   schema (not viable above ~500 nodes).

3. **Out-of-domain guard mechanism (FR-21).** Single-tenant per
   `graph-core/NFR-08` means no user identity. `home_domain` is a
   single-user localStorage preference. Two problems: (a) someone with a
   different localStorage value can write anywhere — so the guard is
   advisory, not enforced; (b) the server has no way to know the
   "true" home domain. Options:
   - (a) Treat the guard as an **advisory UI affordance only** (badge
     "out of domain" + grey-out write buttons, but no server-side 403).
     This is honest — single-tenant means single-trust.
   - (b) Server-side enforce on a `?home_domain=:id` query param,
     accepting it on trust. Effectively the same as (a) but with a 403.
     UI-side gentle.
   - (c) Defer to a "collaborator" model spec where each operator has a
     declared home domain. Out of scope here.
   Recommend (a) — the guard is an SME workflow nudge, not a security
   boundary. AC-17 should test "out-of-domain write disabled in UI" + a
   server-side test of the 403 if the operator overrides via curl.

4. **Service-worker scope and Safari restrictions (FR-27).** Safari
   limits service-worker cache size and disables SW in private-browsing
   mode. AC-20 must degrade gracefully on Safari. Design phase confirms
   the cache budget (precache shell only, no large graph blobs).

5. **`graph-core/NFR-09` row cap (1000 rows) vs SME write paths.** A
   bulk paste of 1000+ activity names is unlikely but possible. The
   batched `POST /import` is bounded by `graph-core`'s payload size
   limit (TBD in `graph-core` design). Design phase confirms the
   client-side UX when the cap is hit.

6. **Canvas + offline.** Service worker precaches the shell + schema,
   but a journey's data is fetched on-demand. Offline canvas needs the
   last-rendered journey's data to be cached. Design phase decides:
   per-route data cache (network-first with cache fallback) ≈ enough.

7. **Native back-gesture conflict with canvas pan (Native Conflicts
   row).** Apple's threshold for triggering back-gesture is ~20 px from
   the viewport edge. The "ignore pan within 20 px of left edge" rule
   sometimes fights the canvas — UX hazard. Design phase validates with
   manual smoke on iPad and iPhone.

8. **`PRECEDES` cycle handling (FR-03).** A cycle is rendered "in
   declaration order" but `graph-core` does not guarantee a stable
   declaration order for `PRECEDES` edges retrieved via Cypher. Design
   phase picks a tiebreaker (`createdAt` ASC is the cleanest).

9. **Search ranking (FR-08).** "Within 500 ms" is a latency target;
   `retail-mini` has ~60 nodes so any naive Cypher
   `WHERE n.name CONTAINS $q` works. At realistic scale (10k+ nodes),
   the search query needs a full-text index. Design phase confirms
   `graph-core`'s name index is full-text (per `graph-core/FR-05`:
   "range indexes on `name`") — if it's only range, this spec needs to
   request a full-text index addition.

10. **Bulk-paste idempotency (FR-16).** "Matched by `name` within the
    same parent journey" — collisions on duplicate activity names are
    possible. Design phase picks: (a) raise an error on duplicate
    name; (b) bind to first match; (c) auto-suffix new activities
    (`"Receive — 2"`). Recommend (a) — surface the duplicate to the
    SME for resolution.
