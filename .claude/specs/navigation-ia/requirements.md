---
feature: "navigation-ia"
created: "2026-07-04"
author: "Claude (spec-workflow) with Frank"
status: "approved"
revision: 2
size: "large"
---

# Requirements: navigation-ia

<!-- Revision 2 (2026-07-04): addresses review-requirements.md pass 1
     (B-01..B-04, C-01..C-07, N-01..N-05). Reframed around the
     post-blueprint route table: model-workspace-core is
     execution:complete (Model surface registered), cto-analytics
     shipped four report tabs, and the remaining blueprint waves land
     BEFORE this spec's design phase (sequencing decision, Frank
     2026-07-04). -->

## Summary

Restructure the PWA's top-level navigation from the current ten
spec-silo surfaces (Explorer/Chat/Ontology/SME/Analytics/API/Exec/Data/
Admin/Model) into eight task-oriented surfaces organized around the
persona journeys, and repair the broken navigation mechanics found in
the 2026-07-04 view-tree review: a dead `#/chat/conversations` tab, an
unreachable `ProductDetail` view, ten orphaned view files (3,992 lines),
a placebo search input and Filters button, hardcoded breadcrumbs, and a
saturated shortcut scheme. The `#/model/*` surface (blueprint-frozen,
owned by `model-workspace-core`, already registered) is preserved
verbatim — only its TopBar position/shortcut changes. This spec does NOT
redesign the interior of any existing view beyond the exceptions
enumerated in NFR-04.

**Sequencing precondition:** this spec's design phase starts only after
the business-modeling-studio single-shot execution completes (all
route-touching features landed or reported failed), and design re-inventories
the final `SURFACES` catalogue. Requirements below describe the target
IA; tab-level dispositions marked "(post-blueprint inventory)" are
confirmed at design time.

## Motivation

1. **The nav mirrors the spec pipeline, not user tasks.** Karim's (P4)
   analyst journey is split across Analytics and Exec; Priya's (P5) SME
   review journey is severed from the graph she reviews; import/export
   is split across API and Data. Nobody can predict where a task lives.
2. **Built UI is unreachable.** Ten view files (3,992 lines) — most of
   the adopted governance surface (OKR roll-down, risk dashboard,
   compliance) — are imported nowhere. `#/chat/conversations` renders
   NotFound. `ProductDetail` is registered but unroutable.
3. **Shell affordances are fake.** The SubNav search box and Filters
   button do nothing; the real `SearchPalette` component is never
   mounted; breadcrumbs are hardcoded to `Surface / <label>`.
4. **The blueprint landed and stretched the old IA past its limits.**
   The Model surface took Alt+0 as a workaround for a saturated Alt+1..9
   scheme; cto-analytics grew Analytics to eight tabs while Exec holds
   seven (soon eight with `performance`) — two surfaces for one analyst
   persona. Consolidating now, immediately after the blueprint waves
   land, reconciles the IA once instead of per-feature.

## Functional Requirements

### Task-oriented surface tree (PE-1..3, SME-1..3, AN-1..3, CU-3, user ask)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | `SURFACES` in `pwa/src/route.ts` is replaced by exactly eight surfaces in this order: `explorer`, `model`, `chat`, `insights`, `govern`, `ontology`, `data`, `admin`. The `model` surface keeps its seven blueprint tabs and all `#/model/*` routes VERBATIM (frozen View Tree; only TopBar position and derived shortcut change — recorded in the blueprint amendment, FR-12). | must | user ask, blueprint View Tree |
| FR-02 | `explorer` tabs: `domains`, `journeys`, `activities`, `roles`, `systems`, `locations`, `path-finder`, then a visually separated curation group `review`, `add`, `quarterly`. The former virtual tabs `activities`/`roles`/`locations` become real SubNav tabs; `domain-detail` and `product-detail` remain virtual (deep-link only). | must | PE-1, SME-1..3 |
| FR-03 | The `journey-detail` and `journey-graph` tabs merge into the single `journeys` tab, dispatched by route shape: `#/explorer/journeys` → journey list/picker (current `Journey.tsx`); `#/explorer/journeys/:id` → journey detail (`Journey.tsx`); `#/explorer/journeys/:id/graph` → single-journey graph (`JourneyGraph.tsx`); `#/explorer/journeys?view=graph` → the multi-journey graph board (`JourneyGraph.tsx` with no journey selected). A dispatch-level adapter maps `entityId` → the params the existing components read (`params.journey` / `params.id`); this adapter and a ≤5-line param-read change inside each component are permitted (NFR-04 exceptions). | must | PE-1.2, PE-3 |
| FR-04 | `insights` tabs — the merged analyst home — in three visually separated groups: analysis (`overview`, `systems`, `matrix`, `complexity`, `context-alignment`), reports (`consolidation`, `single-system`, `critical-paths`, `ai`), business (`finance`, `people`, `transform`, `performance`†). This absorbs the entire former Analytics surface including the four cto-analytics report tabs shipped 2026-07-04, the former Exec dashboards, and the orphaned `ContextAlignment`. †`performance` disposition is post-blueprint inventory: if `kpi-okr-performance-dashboards` landed `#/exec/performance`, the view relocates here; if it did not land, the tab and its alias row are omitted and the blueprint amendment (FR-12) retargets that spec's future registration to `#/insights/performance`. | must | AN-1..3, review B-02/B-03 |
| FR-05 | `govern` tabs: `kpi-management`, `okr-management`, `roll-down`, `risk`, `compliance`, `programs` — the adopted governance surface, finally routed. `roll-down` wires the orphaned `RollDown` view with `RollDownAnalytics` reachable within the tab (mechanism is a design decision; note `DomainDetail.tsx` already embeds a `RollDownTab` — design de-duplicates rather than shipping two roll-down UIs); `risk` presents the orphaned `RiskDashboard` alongside the existing `ExecRisk` register (merge mechanism is a design decision); `compliance` wires `ComplianceManager`; `programs` wires `ProgramManagement`. | must | _baseline FR-07/FR-08, OPS-3, user ask |
| FR-06 | `ontology` tabs: existing six (`catalog`, `erd`, `editor`, `edges`, `versions`, `audit`) plus `glossary` (orphaned `GlossaryManager`) and `generator` (orphaned `OntologyGenerator`). | must | OA-1..3 |
| FR-07 | `data` tabs: `map`, `import`, `export`, `endpoints`, `errors` — the merged Data + API surface (`map`/`export` keep their routes unchanged; `import`/`endpoints`/`errors` relocate from `api/*`). | must | API-1..3 |
| FR-08 | `admin` tabs: `personas`, `rbac-roles`, `users`, `platform`, `settings`. `platform` relocates the current `ExecOps` view (API/Neo4j health — infrastructure, not business); `settings` relocates the current `SmeHome` home-domain picker. | must | user ask |
| FR-09 | `chat` tabs: `thread`, `conversations`. `conversations` renders a new minimal view listing persisted conversations (title, last-message time) from the chat SQLite store; clicking a row opens `#/chat/thread?conversation=<id>`, and the thread view loads and renders that conversation's prior messages before accepting new ones (true resume — `AgentChat` gains a `conversation` param read + history hydration, an enumerated NFR-04 exception). | must | CU-3.1, CU-3.2, review B-04 |
| FR-10 | Two new additive API routes behind the standard router auth gate, appearing in the boot-generated OpenAPI schema (no `/api/v2` bump — additive per NFR-11 policy): `GET /api/v1/chat/conversations` (list: id, title, created_at, last_message_at; newest first) and `GET /api/v1/chat/conversations/:id/messages` (ordered message history for resume). Ownership note: this spec claims exactly these two read-only routes; all other conversation management (delete, rename, bookmarks) stays with the chat-interface backfill. | must | CU-3.1, review B-04/C-04 |

### Legacy route compatibility

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-11 | `parseHash` resolves every pre-restructure route to its new home via a declarative alias table (permanent, not a transition shim), applied BEFORE tab resolution. Rows: `sme/{review,add,quarterly} → explorer/{review,add,quarterly}`; `sme/home → admin/settings`; `analytics/{overview,systems,matrix,consolidation,complexity,single-system,critical-paths,ai} → insights/{same}`; `api/{endpoints,errors,import} → data/{same}`; `exec/ops → admin/platform`; `exec/{finance,people,transform} → insights/{same}`; `exec/{risk,kpi-management,okr-management} → govern/{same}`; `exec/performance → insights/performance` (post-blueprint inventory, see FR-04†); `explorer/journey-detail → explorer/journeys`; `explorer/journey-graph → explorer/journeys` where a legacy `?journey=<id>` query param is translated to the `/:id/graph` entityId+mode form and the no-param form maps to `journeys?view=graph`. Query params and entityId/mode segments are otherwise preserved across aliasing. Bare legacy surface hashes get surface-default rows: `#/analytics → insights/overview`, `#/exec → insights/finance`, `#/sme → explorer/review`, `#/api → data/endpoints`. `chat/*`, `data/{map,export}`, `admin/{personas,rbac-roles,users}`, `ontology/*` (existing six), and `model/*` are identity-mapped (no alias rows). | must | user decision (redirect aliases), review C-01, pass-2 C-01 |
| FR-12 | **Blueprint amendment precondition:** before design approval, `.claude/specs/blueprint.md` receives a round-5 amendment recording (a) the eight-surface IA and Model's new TopBar position/shortcut, (b) the relocation of `#/exec/{finance,people,transform,risk,kpi-management,okr-management,performance}` and `#/analytics/*` to their new canonical homes with permanent aliases, and (c) `kpi-okr-performance-dashboards`' registration target (`#/insights/performance`) if that spec has not yet landed — in that branch the amendment also assigns ownership of the `exec/performance → insights/performance` alias row to that spec, so the frozen `#/exec/performance` route resolves from the moment the tab exists (this spec ships the row itself only in the already-landed branch, keeping FR-14's no-dangling-target guard green in both). | must | blueprint UX-06, review B-03/C-03, pass-2 C-02 |
| FR-13 | Aliased URLs are canonicalized: landing on a legacy hash rewrites `window.location.hash` to the new canonical route (history-replace semantics, no extra back-stack entry), so bookmarks and chat citation deep-links converge on canonical URLs. | should | user decision |
| FR-14 | **No dangling alias targets:** a unit test iterates the alias table and asserts every target resolves to a registered tab or virtual tab — alias resolution must never hit parseHash's unknown-tab first-tab fallback. This structurally prevents silent mis-landing (review B-03). | must | review B-03 |

### Shell mechanics

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-15 | The existing `SearchPalette` component is mounted globally in the App shell, opened by `/` and `Cmd/Ctrl+K` (when not typing in an input) and by a visible search affordance in the TopBar; results deep-link to entity views. The placebo SubNav search input and dead Filters button are removed (surfaces with real local filtering keep their own in-view controls). | must | PE-2.1, user ask |
| FR-16 | Breadcrumbs are derived from the route instead of the hardcoded `Surface / <label>`: `<Surface> / <Tab>` for list tabs, `<Surface> / <Tab> / <entity name>` when `entityId` is present. The name-resolution mechanism (context bus, title store, or shell-level fetch) is a design decision; the entity id is shown until the name resolves. Crumb segments are links to their routes. | must | PE-1.4, review C-05 |
| FR-17 | `Alt+1..8` surface shortcuts are derived from `SURFACES` array index (no hardcoded `kbd` strings; the `kbd` field is removed or computed). This explicitly supersedes model-workspace-core's Alt+0 mapping: Model becomes Alt+2 by position, `App.tsx`'s "0" special case is removed, and that spec's shortcut test expectations are updated (NFR-02). | must | user ask, review C-03a |
| FR-18 | Last-visited tab per surface is persisted (existing `prefStore` pattern): switching to a surface via TopBar or Alt+N returns to the tab — and entityId, restored blindly; views already own their not-found/empty states for stale ids — the user last had open there, defaulting to the first tab. Session-scoped persistence is acceptable. | should | user ask, review C-06 |
| FR-19 | `product-detail` is added to the virtual-tab allowlist so `#/explorer/product-detail/:id` renders `ProductDetail` instead of falling back to `domains`. | must | bug (view-tree review) |
| FR-20 | `FlagForReviewButton` (currently orphaned) is rendered in context on the explorer entity detail surfaces where SME review actions apply (domain detail, journey detail, activity detail), honoring the existing home-domain advisory gating from `prefStore`. | must | SME-1.1, SME-2 |

### Orphan triage

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-21 | After this spec, zero orphaned files remain under `pwa/src/views/`: every `.tsx` view file is either (a) reachable via the route table, (b) imported by a reachable view, or (c) deleted. Audit scope (the ten files verified unimported, 3,992 lines): `exec/{RollDown,RollDownAnalytics,RiskDashboard,ProgramManagement,ContextAlignment}.tsx`, `ontology/{GlossaryManager,ComplianceManager,OntologyGenerator}.tsx`, `explorer/{DomainDetailSlide,JourneyDetailSlide}.tsx` — plus any new orphans surfaced by the post-blueprint inventory. `DomainDetailSlide`/`JourneyDetailSlide` are audited against `DomainDetail`/`Journey`; if superseded they are deleted (with their `.module.css`), otherwise wired as the slide-over they were built to be. The audit outcome, including the `RollDown`-vs-embedded-`RollDownTab` de-duplication (FR-05), is recorded in design.md. | must | user decision (triage), review N-01/N-05 |
| FR-22 | A guard test enumerates `pwa/src/views/**/*.tsx` and fails if any view file is not transitively imported from `views/index.tsx` or `App.tsx` (allowlist for intentional shared fragments), preventing future silent orphans. | should | user ask |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | No new runtime dependencies; hash routing stays synchronous and dependency-free (no router library). | house convention |
| NFR-02 | `bun run typecheck` and the full unit suite pass; every existing routing/deep-link/search/shortcut test — including model-workspace-core's Alt+0 and cto-analytics' `#/analytics/*` expectations — is updated to canonical routes rather than deleted. | .specconfig, review C-03 |
| NFR-03 | Legacy aliases are permanent API of the PWA: documented in `route.ts` and covered by tests; removing one is a breaking change requiring a spec. | user decision |
| NFR-04 | The restructure is a pure re-wiring: no view component's internal logic or API calls change EXCEPT these enumerated exceptions: (a) the new `ChatConversations` view; (b) the journeys dispatch adapter + ≤5-line param reads in `Journey.tsx`/`JourneyGraph.tsx` (FR-03); (c) `AgentChat` conversation-param read + history hydration (FR-09); (d) embedding `FlagForReviewButton` (FR-20). Everything else is relocation only. | scope control, review B-04/C-02 |
| NFR-05 | `GET /api/v1/chat/conversations` targets <100ms for 1,000 conversations (indexed SQLite read, no message-body join). Measured-not-gated: recorded in the execution report, not a blocking test assertion. | perf, review N-03 |

## UI/UX Requirements

**Views owned by this spec** (`#/model/*` rows are the blueprint's,
untouched; everything else is this spec's proposed tree, pending the
FR-12 blueprint amendment):

| Route | View component | Nav surface | States specced (loading·empty·error·ready) |
|-------|----------------|-------------|---------------------------------------------|
| `#/explorer/domains` | `ExplorerDomains` (existing) | Explorer tab | existing behavior, unchanged (AC-01) |
| `#/explorer/journeys[/:id[/graph]][?view=graph]` | `ExplorerJourney` / `ExplorerJourneyGraph` (existing, mode-dispatched) | Explorer tab | AC-03 |
| `#/explorer/{activities,roles,systems,locations,path-finder}` | existing views, promoted/kept | Explorer tabs | AC-02 |
| `#/explorer/{review,add,quarterly}` | `SmeReview`/`SmeAdd`/`SmeQuarterly` (existing, relocated) | Explorer curation group | AC-04 |
| `#/explorer/{domain-detail,product-detail}/:id` | existing views | deep-link only | AC-05 |
| `#/model/*` | existing Model views | Model tabs (position 2) | owned by model-workspace-core; untouched (AC-01) |
| `#/chat/thread[?conversation=<id>]`, `#/chat/conversations` | `AgentChat` (param-aware) / `ChatConversations` (NEW) | Chat tabs | AC-06 (all four states for the new view; resume AC-07) |
| `#/insights/{overview,systems,matrix,complexity,context-alignment}` | existing views + orphan `ContextAlignment` | Insights analysis group | AC-08 |
| `#/insights/{consolidation,single-system,critical-paths,ai}` | existing cto-analytics views, relocated | Insights reports group | AC-08 |
| `#/insights/{finance,people,transform,performance†}` | existing views, relocated | Insights business group | AC-08 |
| `#/govern/{kpi-management,okr-management,roll-down,risk,compliance,programs}` | existing + orphaned views, relocated/wired | Govern tabs | AC-09 |
| `#/ontology/{catalog,erd,editor,edges,versions,audit,glossary,generator}` | existing + orphaned views | Ontology tabs | AC-10 |
| `#/data/{map,import,export,endpoints,errors}` | existing views, relocated | Data tabs | AC-11 |
| `#/admin/{personas,rbac-roles,users,platform,settings}` | existing views (+relocated `ExecOps`, `SmeHome`) | Admin tabs | AC-12 |

**UX allowance conformance** (blueprint UX-* applied as house rules):

| Allowance | How this spec satisfies it |
|-----------|---------------------------|
| UX-01 view states | New `ChatConversations` view specs all four states (AC-06); relocated views keep their existing states (NFR-04) |
| UX-02 design system | New/touched shell UI uses catalog components; `scripts/design-conformance.ts` passes on every touched view (AC-22) |
| UX-04 responsiveness | Desktop-first per existing PWA; no new breakpoints; touch targets on new tab groups pass the existing touch-target test (AC-14) |
| UX-05 accessibility | TopBar/SubNav/palette keyboard reachable; breadcrumb is a `nav` landmark with links; palette focus-trapped (AC-13, AC-15) |
| UX-06 navigation | Every route in the table above survives reload; legacy aliases canonicalize; `#/model/*` verbatim; `#/exec/performance` resolves forever via alias (AC-17, AC-18) |

## Scope Boundaries

**In scope:**
- `route.ts` surface/tab catalogue, alias table (+ no-dangling-target guard), virtual tabs, journeys mode dispatch
- `views/index.tsx` registry; App shell (TopBar, SubNav groups, breadcrumbs, index-derived shortcuts, SearchPalette mount, last-tab persistence)
- New `ChatConversations` view; `AgentChat` resume hydration; `GET /api/v1/chat/conversations` + `GET /api/v1/chat/conversations/:id/messages`
- Orphan wiring/deletion per FR-05/06/21; `FlagForReviewButton` embedding
- Blueprint round-5 amendment (FR-12); test updates + orphan guard test

**Out of scope:**
- Any change to `#/model/*` routes, tabs, or views — `model-workspace-core` (only TopBar position/shortcut, which that spec does not freeze)
- The `#/insights/performance` view itself — `kpi-okr-performance-dashboards` (this spec relocates-or-reserves per FR-04†)
- Interior redesign of any existing view beyond NFR-04's exceptions; KPI/OKR functional verification — `kpi-okr-governance`
- Conversation delete/rename/bookmark management — chat-interface backfill (FR-10 ownership note)
- Auth/RBAC changes; per-role nav filtering — auth-hardening backfill

## Acceptance Criteria

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | `SURFACES` contains exactly `explorer, model, chat, insights, govern, ontology, data, admin` in order; TopBar renders all eight; every `#/model/*` route resolves identically to pre-restructure (surface, tab, entityId, mode) (FR-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/route-parse.test.ts` |
| AC-02 | `#/explorer/activities`, `/roles`, `/locations` appear as SubNav tabs and render their views; former virtual-tab deep links still resolve (FR-02) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/route-parse.test.ts` |
| AC-03 | `#/explorer/journeys` renders the picker; `/journeys/<id>` the detail; `/journeys/<id>/graph` the single-journey graph; `/journeys?view=graph` the multi-journey board. Legacy `#/explorer/journey-graph?journey=<id>` canonicalizes to `#/explorer/journeys/<id>/graph` (asserted on the resulting hash); legacy no-param `journey-graph` canonicalizes to `journeys?view=graph` (FR-03, FR-11) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/journey-detail.test.tsx` + `route-parse.test.ts` |
| AC-04 | `#/sme/review` canonicalizes to `#/explorer/review` and renders `SmeReview`; the curation tab group is visually separated in SubNav (FR-02, FR-11) | macOS Chrome (mouse+kb) | `route-parse.test.ts`; manual: mouse — load `#/sme/review`, verify hash rewrites to `#/explorer/review` and the review queue renders after the separator |
| AC-05 | `#/explorer/product-detail/<id>` renders `ProductDetail` (not `Domains`) (FR-19) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/route-parse.test.ts` |
| AC-06 | `#/chat/conversations` lists persisted conversations newest-first with title + last-message time (rendered via an injectable clock so tests are deterministic); empty store shows an empty state; API failure shows an error state; loading state shown while fetching (FR-09) | macOS Chrome (mouse+kb) | NEW `pwa/src/__tests__/conversations.test.tsx` |
| AC-07 | Clicking a conversation row opens `#/chat/thread?conversation=<id>` and the thread renders that conversation's prior messages before input is accepted; a bad id shows the thread's error/empty state (FR-09, FR-10) | macOS Chrome (mouse+kb) | NEW `pwa/src/__tests__/conversations.test.tsx` (resume case) |
| AC-08 | All insights tabs render their views (including relocated `systems`, `consolidation`, `single-system`, `critical-paths`); `#/analytics/systems` canonicalizes to `#/insights/systems`; `#/exec/finance` to `#/insights/finance` (FR-04, FR-11) | macOS Chrome (mouse+kb) | `route-parse.test.ts` + existing `analytics-system-map.test.tsx` updated to canonical routes |
| AC-09 | All six govern tabs render; formerly-orphaned `RollDown`, `RiskDashboard`, `ComplianceManager`, `ProgramManagement` are reachable by click from the TopBar (FR-05) | macOS Chrome (mouse+kb) | `route-parse.test.ts`; manual: mouse — click Govern, visit each tab, verify each view renders data or its own empty state |
| AC-10 | `#/ontology/glossary` and `#/ontology/generator` render the formerly-orphaned views (FR-06) | macOS Chrome (mouse+kb) | `route-parse.test.ts` |
| AC-11 | `#/api/import` canonicalizes to `#/data/import` and renders `ApiImport`; all five data tabs resolve (FR-07, FR-11) | macOS Chrome (mouse+kb) | `route-parse.test.ts` |
| AC-12 | `#/exec/ops` canonicalizes to `#/admin/platform` (ExecOps view); `#/sme/home` to `#/admin/settings` (SmeHome view) (FR-08, FR-11) | macOS Chrome (mouse+kb) | `route-parse.test.ts` |
| AC-13 | `/` and `Cmd+K` open the SearchPalette from any surface (except while typing in an input); selecting a result navigates to the entity deep link; `Escape` closes it and returns focus (FR-15) | macOS Chrome (keyboard) | `pwa/src/__tests__/search.test.tsx` (extended) |
| AC-14 | New SubNav group tabs and TopBar search affordance meet the 44px touch-target floor (FR-02, FR-04, FR-15) | iPhone Safari (touch) | `pwa/src/__tests__/touch-targets.test.tsx` (extended) |
| AC-15 | Breadcrumb shows `<Surface> / <Tab>` on list tabs and `<Surface> / <Tab> / <entity name>` on detail routes (id shown until the name resolves); each ancestor crumb is a working link (FR-16) | macOS Chrome (mouse+kb) | NEW `pwa/src/__tests__/breadcrumbs.test.tsx` |
| AC-16 | `Alt+<n>` jumps to the nth surface for n=1..8 (Model = Alt+2); no Alt+0 binding remains; typing guard prevents firing inside inputs (FR-17) | macOS Chrome (keyboard) | `pwa/src/__tests__/deep-link.test.tsx` (extended) or manual: keyboard — press Alt+4, expect `#/insights/...`; press Alt+0, expect no navigation; focus an input, press Alt+4, expect no navigation |
| AC-17 | Every alias-table row maps to its documented target with params/entityId/mode preserved; landing on a legacy hash replaces it with the canonical hash without adding a history entry; a guard test proves every alias target is a registered (or virtual) tab — no row can hit the first-tab fallback (FR-11, FR-13, FR-14) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/route-parse.test.ts` (alias table exhaustively iterated + dangling-target guard) |
| AC-18 | `#/exec/performance` canonicalizes per the FR-04† inventory outcome: either to `#/insights/performance` rendering the relocated dashboard, or (dashboard not landed) the alias row is absent and the dangling-target guard still passes (FR-04, FR-12, FR-14) | macOS Chrome (mouse+kb) | `route-parse.test.ts` |
| AC-19 | Switching surfaces returns to the last-visited tab (and blindly-restored entityId) of the target surface within a session; first visit lands on the first tab; a stale entityId shows the view's own not-found/empty state (FR-18) | macOS Chrome (mouse+kb) | NEW test in `route-parse.test.ts` or component test |
| AC-20 | `GET /api/v1/chat/conversations` and `GET /api/v1/chat/conversations/:id/messages` return 401 without a session; 200 with correct shapes and ordering with a session; unknown id → 404 with a registered error code; both appear in `/api/v1/openapi.json` (FR-10) | server (curl) | NEW `api/src/__tests__/chat-conversations.test.ts` |
| AC-21 | `FlagForReviewButton` renders on domain/journey/activity detail views and is disabled outside the operator's home domain (FR-20) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/sme-review-flag.test.tsx` (extended) |
| AC-22 | The orphan guard test passes: every view file under `pwa/src/views/` is transitively imported from the registry/shell or explicitly allowlisted; the ten audited files' dispositions match the design.md audit record; `scripts/design-conformance.ts` passes on every touched view (FR-21, FR-22, UX-02) | server (bun test) | NEW `pwa/src/__tests__/view-orphans.test.ts` + design-conformance run recorded in execution report |

## Platforms & Input Modes

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| TopBar surface nav | yes | yes | yes | yes (Alt+1..8, Tab/Enter) | Alt+N derived from index (FR-17) |
| SubNav tabs incl. groups | yes | yes | yes | yes (Tab/Enter) | 44px targets (AC-14); groups are visual only, not focus barriers |
| SearchPalette | yes (open via TopBar button) | yes | yes | yes (`/`, Cmd/Ctrl+K, arrows, Enter, Esc) | Focus-trapped while open |
| Breadcrumb links | yes | yes | yes | yes (Tab/Enter) | `nav` landmark |
| Conversations list rows | yes | yes | yes | yes (Tab/Enter) | Standard link semantics |
| Thread resume (param-driven) | n/a | n/a | n/a | n/a | Pure route param, no input |
| Legacy-URL canonicalization | n/a | n/a | n/a | n/a | Pure hash rewrite, no input |

## Native Conflicts

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| macOS Option+digit inserts special characters (¡™£…) into focused inputs | Alt+1..8 surface shortcuts | Existing typing guard (skip when target is input/textarea/contenteditable) + `preventDefault()` when handled |
| Firefox `/` quick-find | `/` opens SearchPalette | `preventDefault()` in the keydown handler when not typing |
| Firefox `Cmd+K` focuses the URL/search bar | Cmd+K opens SearchPalette | `preventDefault()` on handled keydown; Chrome/Safari have no default Cmd+K binding |
| Browser Back after hash canonicalization would bounce through the legacy hash | FR-13 history semantics | `history.replaceState` (or `location.replace`)-based rewrite — no extra history entry |
| `Escape` may exit browser fullscreen | Palette close on Escape | Accepted overlap — palette handles Escape only when open; fullscreen exit is unaffected otherwise |

## Dependencies

- **Upstream (blocking):** the business-modeling-studio single-shot
  execution must complete before design starts — `model-workspace-core`
  (execution:complete, owns `#/model/*` verbatim), `cto-analytics`
  report tabs (shipped 2026-07-04), `kpi-okr-governance`
  (execution:complete; its `#/exec/*` test expectations are updated per
  NFR-02), and `kpi-okr-performance-dashboards` (disposition per
  FR-04†). Design's first task is a route-table re-inventory against
  the landed tree.
- **Upstream (data):** chat persistence
  (`api/src/chat/persistence.ts`) already stores `chat_conversations`;
  FR-10 adds read routes through the standard router auth gate.
- **Coordination:** blueprint round-5 amendment (FR-12) is a design-gate
  precondition; `model-workspace-core`'s Alt+0 shortcut expectation is
  explicitly superseded (FR-17).
- **Packages:** none new (NFR-01).

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | Blueprint waves still executing while this spec is in requirements | Any FR touching `route.ts` can go stale again | Hard sequencing precondition (Dependencies); design re-inventories the final route table; FR-04†/AC-18 encode the one known conditional |
| 2 | Insights carries 13 tabs | SubNav crowding | Three visual groups (FR-04); SubNav scrolls horizontally; desktop-first per UX-04; if design finds grouping insufficient it may propose demoting report tabs to virtual — flagged at the design gate, not silently |
| 3 | Orphaned views may be half-finished, not just unrouted (shipped off-spec) | Wiring could expose broken UI | AC-09 manual pass per view; any view found non-functional is reported at the execution gate and may be demoted to deep-link-only or deferred with an explicit note — not silently shipped broken |
| 4 | Chat citations may embed legacy deep-links in stored conversation history | Broken citations after restructure | Alias table is permanent (NFR-03) — old links keep resolving forever |
| 5 | `RollDown` vs embedded `RollDownTab` in `DomainDetail`, and `ExecRisk` vs `RiskDashboard` | Duplicate UIs for one concern | FR-21 audit + FR-05 design decision de-duplicates; requirements only demand reachability |
| 6 | Tests hardcode old routes throughout `pwa/src/__tests__/`, including fresh cto-analytics and model-workspace-core tests | Broad but mechanical test churn | NFR-02: update to canonical routes; AC-17's exhaustive alias iteration catches regressions |
| 7 | Alt+0 removal changes a shipped shortcut users may have learned today | Minor muscle-memory break, day-one | Acceptable: shortcut shipped hours ago; FR-12 amendment records the change |
