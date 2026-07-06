---
feature: "navigation-ia"
created: "2026-07-06"
author: "Claude (spec-workflow) with Frank"
status: "approved"
revision: 2
reviewing_requirements_revision: 2
reviewing_design_revision: 2
size: "large"
total_tasks: 22
---

# Tasks: navigation-ia

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocks` / `Blocked by`); no out-of-order execution.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook blocks STATUS.md updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h with one
  judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. Tasks touching
  `pwa/src/views/` or `pwa/src/components/` additionally run
  `bun run scripts/design-conformance.ts --view <file>`.

## Open design concerns — pinned decisions

| Concern | Decision | Rationale | Locked in task |
|---------|----------|-----------|----------------|
| N-01 (TopBar local `Surface` interface has `kbd`) | Remove `kbd` from `TopBar.tsx` local `Surface` interface; derive shortcut display from index in `App.tsx` if needed | Cleaner than leaving an unused optional field | T-04 |
| N-02 (touch-targets test is structure-only) | Keep structure-only assertion pattern; pixel-size is manual verification | jsdom cannot compute CSS; existing test convention | T-19 |
| N-03 (`deep-link.test.tsx` has `journey-detail` test case) | Update the test case to assert alias resolution to `journeys` | Mechanical test update during T-18 | T-18 |

## Task list

### T-01 — Replace SURFACES catalogue and Surface interface

- **Files** (1): `pwa/src/route.ts` (modify)
- **Implements**: design §3.1, §4.2 — closes AC-01
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-02, T-03, T-05, T-06, T-08, T-09, T-10, T-14, T-15, T-16, T-17, T-18
- **Steps**:
  1. Replace the `Surface` interface: remove `kbd` field, add optional
     `groups?: TabGroup[]` field. Add `TabGroup` interface
     (`{ id, label, tabIds }`).
  2. Replace the entire `SURFACES` array with the 8-surface catalogue from
     design §4.2 (explorer, model, chat, insights, govern, ontology, data,
     admin). Include `groups` for explorer and insights surfaces.
  3. Update `DEFAULT_ROUTE` — unchanged (`{ surface: "explorer", tab:
     "domains", params: {} }`).
  4. Run `bun run typecheck` — expect errors in `App.tsx` and `TopBar.tsx`
    from removed `kbd` field; these are fixed in T-04 and T-05.
- **Verification**: `bun run typecheck` (errors in T-04/T-05 consumers are
  expected and resolved by those tasks)

### T-02 — Add ROUTE_ALIASES table and integrate into parseHash

- **Files** (1): `pwa/src/route.ts` (modify)
- **Implements**: design §3.2, §4.3 — closes AC-04, AC-08, AC-11, AC-12, AC-17, AC-18
- **Complexity**: complex
- **Blocked by**: T-01
- **Blocks**: T-09, T-14, T-18
- **Steps**:
  1. Add the `AliasRow` interface and `ROUTE_ALIASES` constant array from
     design §4.3 (27 rows: 22 tab-level + 4 bare-surface defaults +
     1 journey-graph param transform). Note: `analytics/exec-summary` is
     NOT aliased (it is kept as `insights/exec-summary` per rev 2).
  2. Add `history.replaceState` canonicalization: when an alias changes the
     route, replace the hash silently (no extra back-stack entry).
  3. Modify `parseHash` to apply aliases before surface/tab resolution:
     parse hash → check `ROUTE_ALIASES` for matching `{ from: { surface,
     tab? } }` → if matched, replace surface/tab → canonicalize via
     `history.replaceState` → proceed with normal resolution.
  4. Tab-level rows match when both surface and tab match. Bare-surface
     rows (`bareSurfaceDefault: true`) match when only the surface matches
     and no tab-level row matched.
  5. Apply `paramTransform` if present (journey-detail and journey-graph
     rows).
- **Verification**: `pwa/src/__tests__/route-parse.test.ts` (updated in T-18)

### T-03 — Generalize virtual tabs to per-surface map

- **Files** (1): `pwa/src/route.ts` (modify)
- **Implements**: design §4.4 — closes AC-02, AC-05
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-09, T-18
- **Steps**:
  1. Replace `EXPLORER_VIRTUAL_TABS` set with a `VIRTUAL_TABS` map:
     `Record<string, Set<string>>`.
  2. Add `explorer` entry: `new Set(["activities", "roles", "locations",
     "domain-detail", "product-detail"])` — note `product-detail` is added
     (was missing, FR-19/AC-05).
  3. Update `parseHash` virtual-tab check from
     `surface.id === "explorer" && EXPLORER_VIRTUAL_TABS.has(tabId)` to
     `VIRTUAL_TABS[surfaceId]?.has(tabId)`.
- **Verification**: `pwa/src/__tests__/route-parse.test.ts` (updated in T-18)

### T-04 — Update App.tsx shell (shortcuts, SearchPalette, breadcrumbs, last-tab)

- **Files** (1): `pwa/src/App.tsx` (modify)
- **Implements**: design §4.6, §4.7, §4.8, §4.9 — closes AC-13, AC-15, AC-16, AC-19
- **Complexity**: complex
- **Blocked by**: T-01, T-10
- **Blocks**: T-18, T-19
- **Steps**:
  1. **Keyboard shortcuts**: Replace `Alt+0 → index 9` logic with
     `Alt+1..8 → SURFACES[idx-1]`. Remove the `e.key === "0"` special case.
     Remove `kbd` from the `surfaces` prop passed to `TopBar`.
  2. **SearchPalette**: Import `SearchPalette` from `./components/SearchPalette`.
     Mount it globally (outside the view `<section>`). Replace the `/`
     handler: instead of focusing `searchInputRef`, open the palette
     (`setPaletteOpen(true)`). Add `Cmd/Ctrl+K` handler to open palette.
     Add `Escape` handler: if palette open, close it; otherwise blur.
  3. **SubNav changes**: Remove `search` prop and `searchInputRef` from
     `SubNav` usage. Remove `Filters` button from actions. Keep `Reload`.
     Pass `groups` prop from `surface.groups`.
  4. **Breadcrumbs**: Compute crumbs from route (design §4.7):
     `[{ label: surface.label, href }, { label: tab.label, href }, { label:
     entityName }]`. Render in a `<nav aria-label="Breadcrumb">` above the
     view section. Entity name from `titleStore` (T-10); fallback to
     `entityId`.
  5. **Last-visited tab**: On route change, call
     `usePrefStore.getState().setLastTab(surface, tab, entityId)`. When
     navigating via TopBar/Alt+N, check `lastTabs[surfaceId]` and navigate
     to saved tab/entityId instead of first tab.
  6. Remove `searchInputRef` ref entirely.
- **Verification**: `pwa/src/__tests__/deep-link.test.tsx` (T-18),
  `pwa/src/__tests__/breadcrumbs.test.tsx` (T-17),
  `pwa/src/__tests__/search.test.tsx` (T-19)

### T-05 — Update TopBar (remove kbd, add search affordance)

- **Files** (1): `pwa/src/components/TopBar.tsx` (modify)
- **Implements**: design §4.6, §6 — closes AC-13
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-18
- **Steps**:
  1. Remove `kbd?: string` from the local `Surface` interface.
  2. Remove the `{s.kbd && <span className={styles.kbd}>{s.kbd}</span>}`
     rendering.
  3. Add a search affordance button (magnifying-glass icon or "Search"
     label) in the spacer area. Accept an `onSearch?: () => void` prop.
     When clicked, calls `onSearch` (which opens the SearchPalette from
     `App.tsx`).
  4. Pass `onSearch` from `App.tsx` to `TopBar`.
- **Verification**: `bun run typecheck` + `bun run scripts/design-conformance.ts --view TopBar`

### T-06 — Update SubNav (tab groups, remove search/Filters)

- **Files** (1): `pwa/src/components/SubNav.tsx` (modify)
- **Implements**: design §6 — closes AC-02, AC-04
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: T-04, T-18
- **Steps**:
  1. Add optional `groups?: TabGroup[]` prop to `SubNavProps`.
  2. When `groups` is provided, render tabs with visual separators between
     groups. Tabs within a group render contiguously; a
     `border-left: 1px solid var(--border-subtle)` separator (or equivalent)
     divides groups.
  3. Make `search` and `searchInputRef` props optional (already optional
     via `?`) — they will no longer be passed by `App.tsx` but existing
     tests may use them.
  4. No changes to `crumbs` rendering (breadcrumbs move to `App.tsx`).
- **Verification**: `bun run typecheck` + `bun run scripts/design-conformance.ts --view SubNav`

### T-07 — Update SearchPalette hrefForHit to canonical routes

- **Files** (1): `pwa/src/components/SearchPalette.tsx` (modify)
- **Implements**: design §4.6 — closes AC-13
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-04, T-19
- **Steps**:
  1. Update `hrefForHit` function: change `journey-detail` to `journeys`
     in the `UserJourney` case. All other cases already use canonical
     surface ids (`explorer/domains`, `explorer/activities`, etc.).
  2. Verify the `Product` case maps to `#/explorer/product-detail/${id}`
     (should already be correct or needs adding if missing).
- **Verification**: `pwa/src/__tests__/search.test.tsx` (T-19)

### T-08 — Update views/index.tsx view registry (new surfaces + orphan wiring + journeys dispatch)

- **Files** (1): `pwa/src/views/index.tsx` (modify)
- **Implements**: design §4.2, §4.5, §4.13 — closes AC-01, AC-02, AC-03, AC-08, AC-09, AC-10, AC-11, AC-12
- **Complexity**: complex
- **Blocked by**: T-01, T-09, T-10, T-11, T-12, T-13
- **Blocks**: T-18
- **Steps**:
  1. **Restructure VIEWS map**: Replace the 10-surface structure with the
     8-surface structure. Move view entries to their new surface/tab
     locations per design §4.2.
  2. **Explorer surface**: Add `activities`, `roles`, `locations` as
     SubNav-visible tabs (they were virtual; now they're real tabs).
     Remove `journey-detail` and `journey-graph` tabs. Add `journeys` tab
     with the dispatch adapter from design §4.5:
     ```ts
     "journeys": (r) => {
       if (r.mode === "graph" && r.entityId) {
         return <ExplorerJourneyGraph route={{ ...r, params: { ...r.params, journey: r.entityId } }} />;
       }
       if (r.params["view"] === "graph") {
         return <ExplorerJourneyGraph route={r} />;
       }
       return <ExplorerJourney route={r} />;
     },
     ```
     Add `review`, `add`, `quarterly` tabs (from sme). Keep `domain-detail`
     and `product-detail` as virtual-tab entries (not in SubNav but
     routable).
  3. **Insights surface**: Move all analytics views + `ExecFinance`,
     `ExecPeople`, `ExecTransform`, `PerformanceDashboard`. Add
     `ContextAlignment` (import from `./exec/ContextAlignment`). Add
     `AnalyticsExecSummary` as `exec-summary` tab.
  4. **Govern surface**: Move `ExecKpiManagement`, `ExecOkrManagement`,
     `ExecRisk` (wire `RiskDashboard` from T-12 instead). Add `ExecRollDown`
     as `roll-down`, `RollDownAnalytics` as `roll-down-analytics`,
     `ProgramManagement` as `programs`, `ComplianceManager` as `compliance`.
  5. **Data surface**: Move `ApiEndpoints`, `ApiErrors`, `ApiImport` here
     alongside existing `DataMap`, `DataExport`.
  6. **Admin surface**: Add `ExecOps` as `platform` tab. Add `SmeHome` as
     `settings` tab.
  7. **Ontology surface**: Add `GlossaryManager` as `glossary` tab,
     `OntologyGenerator` as `generator` tab.
  8. **Chat surface**: Add `conversations` tab pointing to
     `ChatConversations` (T-09).
  9. Remove all imports for deleted views (`DomainDetailSlide`,
     `JourneyDetailSlide`).
- **Verification**: `bun run typecheck` + `pwa/src/__tests__/route-parse.test.ts` (T-18)

### T-09 — Create ChatConversations view

- **Files** (1): `pwa/src/views/chat/Conversations.tsx` (new)
- **Implements**: design §4.10 — closes AC-06
- **Complexity**: moderate
- **Blocked by**: T-10
- **Blocks**: T-08, T-20
- **Steps**:
  1. Create `ChatConversations` component:
     - Fetches `api.chat.listConversations()` on mount (T-10 provides the
       API client method).
     - **Loading**: skeleton/spinner
     - **Empty**: "No conversations yet" message
     - **Error**: error message with retry button
     - **Ready**: list of conversations newest-first, showing title (or
       "Untitled") and last-message time. Accept an injectable `clock`
       prop (default `Date`) for deterministic relative-time formatting
       (AC-06).
     - Clicking a row navigates to
       `#/chat/thread?conversation=<id>`.
  2. Use `ViewHeader` from `../_shared` and catalog components only.
  3. Export as named export `ChatConversations`.
- **Verification**: `pwa/src/__tests__/conversations.test.tsx` (T-20) +
  `bun run scripts/design-conformance.ts --view Conversations`

### T-10 — Add chat conversation API client methods + shared schemas

- **Files** (4): `pwa/src/api.ts` (modify), `shared/src/types.ts` (modify),
  `pwa/src/views/chat/Thread.tsx` (modify), `pwa/src/views/chat/AgentChat.tsx` (modify)
- **Implements**: design §3.5, §4.11 — closes AC-06, AC-07
- **Complexity**: moderate
- **Blocked by**: T-11
- **Blocks**: T-04, T-08, T-09
- **Steps**:
  1. **`shared/src/types.ts`**: Add `ConversationSummary` and
     `ConversationMessage` interfaces (matching the Zod schemas from
     T-11). Export them.
  2. **`pwa/src/api.ts`**: Add to the `chat` object:
     - `listConversations: (signal?) => json<{ rows: ConversationSummary[] }>(...)`
       hitting `GET /api/v1/chat/conversations`.
     - `listMessages: (conversationId, signal?) => json<{ rows: ConversationMessage[] }>(...)`
       hitting `GET /api/v1/chat/conversations/:id/messages`.
  3. **`pwa/src/views/chat/AgentChat.tsx`** (NFR-04(c) exception): Change
     the signature to accept an optional `conversationId` prop:
     ```ts
     export function AgentChat({ conversationId: propId }: { conversationId?: string }): JSX.Element {
     ```
     Initialize `conversationId` state from `propId`:
     ```ts
     const [conversationId, setConversationId] = useState<string | undefined>(propId ?? undefined);
     ```
     Add a `useEffect` that fires when `conversationId` changes (and is
     defined): call `api.chat.listMessages(conversationId)`, map the
     returned `ConversationMessage[]` to `ChatMessage[]` (role + content +
     env), and set them into `messages` state. Guard against overwriting
     messages already present from the current session (only hydrate if
     `messages` is empty or `conversationId` changed). This is the
     NFR-04(c) enumerated exception — the only interior change to
     `AgentChat`.
  4. **`pwa/src/views/chat/Thread.tsx`**: Update `ChatThread` to accept
     `route?: Route` and pass `conversationId={route?.params?.["conversation"]}`
     to `AgentChat`:
     ```ts
     export function ChatThread({ route }: { route?: Route }): JSX.Element {
       return <AgentChat conversationId={route?.params?.["conversation"]} />;
     }
     ```
- **Verification**: `bun run typecheck`

### T-11 — Add chat conversation API routes + persistence + RBAC + router

- **Files** (4): `api/src/chat/persistence.ts` (modify),
  `api/src/routes/chat.ts` (modify), `api/src/router.ts` (modify),
  `api/src/auth/rbac-permissions.ts` (modify)
- **Implements**: design §4.12, §5 — closes AC-20
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-10, T-21
- **Steps**:
  1. **`api/src/chat/persistence.ts`**: Add `listConversations()` function:
     ```ts
     export function listConversations(): ConversationRow[] {
       const db = getDb();
       return db.prepare(
         `SELECT id, title, created_at, last_message_at
          FROM chat_conversations
          ORDER BY last_message_at DESC`
       ).all() as ConversationRow[];
     }
     ```
  2. **`api/src/routes/chat.ts`**: Add two handlers:
     - `handleConversationList(req: Request)`: calls `listConversations()`,
       returns `ok({ rows })`. Requires session (use existing `requireSession`
       pattern from other handlers).
     - `handleConversationMessages(req: Request, id: string)`: calls
       `getConversation(id)` — 404 if not found. Calls
       `loadConversationHistory(id, { limit: 1000 })` — returns
       `ok({ rows })`.
  3. **`api/src/router.ts`**: Register routes after existing chat routes:
     ```ts
     if (sub === "chat/conversations" && method === "GET") return handleConversationList(req);
     const convMessages = sub.match(/^chat\/conversations\/([^/]+)\/messages$/);
     if (convMessages && method === "GET") return handleConversationMessages(req, convMessages[1]!);
     ```
  4. **`api/src/auth/rbac-permissions.ts`**: Add:
     ```ts
     P("GET", "chat/conversations", "chat:read"),
     P("GET", "chat/conversations/:id/messages", "chat:read"),
     ```
- **Verification**: `api/src/__tests__/chat-conversations.test.ts` (T-21)

### T-12 — Wire RiskDashboard with embedded ExecRisk (NFR-04 exception (e))

- **Files** (1): `pwa/src/views/exec/RiskDashboard.tsx` (modify)
- **Implements**: design §4.13 — closes AC-09
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-08
- **Steps**:
  1. Import `ExecRisk` from `./Risk`.
  2. Add a "Register" section/tab within `ExecRiskDashboard` that renders
     `<ExecRisk />`. This can be a sub-tab within the existing dashboard
     layout, or a section rendered below the dashboard charts.
  3. The existing `ExecRisk` component is self-contained (fetches its own
     data) — no props needed.
- **Verification**: `bun run typecheck` + `bun run scripts/design-conformance.ts --view RiskDashboard`

### T-13 — Delete orphaned view files

- **Files** (4): `pwa/src/views/explorer/DomainDetailSlide.tsx` (delete),
  `pwa/src/views/explorer/DomainDetailSlide.module.css` (delete),
  `pwa/src/views/explorer/JourneyDetailSlide.tsx` (delete),
  `pwa/src/views/explorer/JourneyDetailSlide.module.css` (delete)
- **Implements**: design §4.13 — closes AC-22 (partial)
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-08
- **Steps**:
  1. Delete `DomainDetailSlide.tsx` and `DomainDetailSlide.module.css`.
  2. Delete `JourneyDetailSlide.tsx` and `JourneyDetailSlide.module.css`.
  3. Verify no imports reference these files (grep confirmed 0 external
     imports in design review).
  4. Run `bun run typecheck` to confirm no broken imports.
- **Verification**: `bun run typecheck` (no broken imports)

### T-14 — Create titleStore for breadcrumb name resolution

- **Files** (1): `pwa/src/store/titleStore.ts` (new)
- **Implements**: design §3.3, §4.7 — closes AC-15
- **Complexity**: simple
- **Blocked by**: T-02
- **Blocks**: T-04, T-15, T-18
- **Steps**:
  1. Create Zustand store:
     ```ts
     import { create } from "zustand";
     export interface TitleState {
       titles: Record<string, string>;
       setTitle: (entityId: string, name: string) => void;
       clearTitle: (entityId: string) => void;
     }
     export const useTitleStore = create<TitleState>((set) => ({
       titles: {},
       setTitle: (entityId, name) => set((s) => ({ titles: { ...s.titles, [entityId]: name } })),
       clearTitle: (entityId) => set((s) => {
         const { [entityId]: _, ...rest } = s.titles;
         return { titles: rest };
       }),
     }));
     ```
  2. No persistence (in-memory only — names are re-populated by views on
     each navigation).
- **Verification**: `bun run typecheck`

### T-15 — Embed FlagForReviewButton + setTitle in detail views

- **Files** (3): `pwa/src/views/explorer/DomainDetail.tsx` (modify),
  `pwa/src/views/explorer/Journey.tsx` (modify),
  `pwa/src/views/explorer/Activities.tsx` (modify)
- **Implements**: design §4.7, §4.14 — closes AC-15, AC-21
- **Complexity**: moderate
- **Blocked by**: T-14
- **Blocks**: T-08, T-18
- **Steps**:
  1. **`DomainDetail.tsx`**: After fetching domain data, call
     `useTitleStore.getState().setTitle(domainId, domainData.name)`.
     Import and render `<FlagForReviewButton entityId={domainId}
     entityType="Domain" />` in the header area. Use `useIsHomeDomain` hook
     to disable the button when the domain is not the operator's home
     domain.
  2. **`Journey.tsx`**: Same pattern — call `setTitle` after fetching
     journey data. Render `FlagForReviewButton` when `entityId` is present
     (detail mode).
  3. **`Activities.tsx`**: Render `FlagForReviewButton` when `entityId` is
     present (detail mode). Call `setTitle` after fetching activity data.
- **Verification**: `pwa/src/__tests__/sme-review-flag.test.tsx` (T-18) +
  `bun run scripts/design-conformance.ts --view DomainDetail` (etc.)

### T-16 — Extend prefStore with lastTabs persistence

- **Files** (1): `pwa/src/store/prefStore.ts` (modify)
- **Implements**: design §3.4, §4.9 — closes AC-19
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-04, T-18
- **Steps**:
  1. Add to `PrefState` interface:
     ```ts
     lastTabs: Record<string, { tab: string; entityId?: string }>;
     setLastTab: (surface: string, tab: string, entityId?: string) => void;
     ```
  2. Implement `setLastTab`:
     ```ts
     setLastTab: (surface, tab, entityId) => set((s) => ({
       lastTabs: { ...s.lastTabs, [surface]: { tab, entityId } },
     })),
     ```
  3. Default `lastTabs: {}` in the initial state. Already persisted via
     existing `zustand/persist` middleware.
- **Verification**: `bun run typecheck`

### T-17 — Create breadcrumb tests

- **Files** (1): `pwa/src/__tests__/breadcrumbs.test.tsx` (new)
- **Implements**: design §8 — closes AC-15
- **Complexity**: moderate
- **Blocked by**: T-04, T-14, T-15
- **Blocks**: T-22
- **Steps**:
  1. Test breadcrumb rendering for a surface+tab route: assert
     `<nav aria-label="Breadcrumb">` landmark exists.
  2. Test breadcrumb text: surface label + tab label present.
  3. Test breadcrumb links: surface crumb has `href` to surface default;
     tab crumb has `href` to current tab.
  4. Test entity-name resolution: when `titleStore` has a name for the
     `entityId`, the breadcrumb shows the name; when not, shows the id.
  5. Test with a mock route (e.g., `#/explorer/domains/test-domain-id`).
- **Verification**: `bun test pwa/src/__tests__/breadcrumbs.test.tsx`

### T-18 — Update existing tests for new route structure

- **Files** (5): `pwa/src/__tests__/route-parse.test.ts` (modify),
  `pwa/src/__tests__/deep-link.test.tsx` (modify),
  `pwa/src/__tests__/touch-targets.test.tsx` (modify),
  `pwa/src/__tests__/sme-review-flag.test.tsx` (modify),
  `pwa/src/store/__tests__/routeStore.test.ts` (modify),
  `pwa/src/__tests__/analytics-exec-summary-launcher.test.tsx` (modify)
- **Implements**: design §8 — closes AC-01, AC-02, AC-03, AC-04, AC-05, AC-08, AC-09, AC-10, AC-11, AC-12, AC-14, AC-16, AC-17, AC-18, AC-19
- **Complexity**: complex
- **Blocked by**: T-01, T-02, T-03, T-04, T-05, T-06, T-08, T-14, T-15, T-16
- **Blocks**: T-22
- **Steps**:
  1. **`route-parse.test.ts`**: Rewrite for 8-surface structure. Test:
     - AC-01: SURFACES has exactly 8 surfaces in order; `#/model/*` routes
       resolve identically.
     - AC-02: `activities`, `roles`, `locations` are SubNav tabs (in
       SURFACES); virtual tabs (`domain-detail`, `product-detail`) still
       resolve.
     - AC-03: Journey dispatch by route shape (journeys, journeys/:id,
       journeys/:id/graph, journeys?view=graph); legacy `journey-detail`
       and `journey-graph` aliases canonicalize.
     - AC-04: `sme/review → explorer/review` alias + canonicalization.
     - AC-05: `product-detail` virtual tab resolves.
     - AC-08: All 14 insights tabs resolve; `analytics/*` and `exec/*`
       aliases canonicalize.
     - AC-09: All 7 govern tabs resolve.
     - AC-10: `ontology/glossary` + `ontology/generator` resolve.
     - AC-11: `api/import → data/import` alias; all 5 data tabs resolve.
     - AC-12: `exec/ops → admin/platform`; `sme/home → admin/settings`.
     - AC-17: Exhaustive alias iteration — every `ROUTE_ALIASES` row's
       `to.{surface, tab}` resolves to a registered tab or virtual tab.
       Assert `history.replaceState` is called on alias resolution.
     - AC-18: `exec/performance → insights/performance` alias resolves.
     - AC-19: Last-visited tab persistence — `setLastTab` is called on
       route change; stale `entityId` is restored without error.
  2. **`deep-link.test.tsx`**: Update `journey-detail` test case to assert
     alias resolution to `journeys`. Update Alt+0 test (remove). Add
     Alt+1..8 tests (AC-16). Update any hardcoded surface/tab references.
  3. **`touch-targets.test.tsx`**: Add structure-only assertions for new
     tab group separators and search affordance button (AC-14).
  4. **`sme-review-flag.test.tsx`**: Update test routes from `sme/review`
     to `explorer/review`. Add assertions for `FlagForReviewButton` on
     domain/journey/activity detail views (AC-21).
  5. **`routeStore.test.ts`**: Update for new SURFACES structure and alias
     behavior.
  6. **`analytics-exec-summary-launcher.test.tsx`**: Update route from
     `analytics/exec-summary` to `insights/exec-summary`.
- **Verification**: `bun test pwa/src/__tests__/route-parse.test.ts` +
  `bun test pwa/src/__tests__/deep-link.test.tsx` +
  `bun test pwa/src/__tests__/touch-targets.test.tsx` +
  `bun test pwa/src/__tests__/sme-review-flag.test.tsx` +
  `bun test pwa/src/store/__tests__/routeStore.test.ts` +
  `bun test pwa/src/__tests__/analytics-exec-summary-launcher.test.tsx`

### T-19 — Update SearchPalette tests

- **Files** (1): `pwa/src/__tests__/search.test.tsx` (modify)
- **Implements**: design §8 — closes AC-13
- **Complexity**: moderate
- **Blocked by**: T-04, T-07
- **Blocks**: T-22
- **Steps**:
  1. Update tests to assert SearchPalette is mounted globally (not in
     SubNav).
  2. Test `/` opens palette (not SubNav search input focus).
  3. Test `Cmd/Ctrl+K` opens palette.
  4. Test `Escape` closes palette and returns focus to previous element.
  5. Test focus trap: Tab/Shift+Tab cycles within palette while open.
  6. Update `hrefForHit` test cases: `UserJourney` → `#/explorer/journeys/:id`.
- **Verification**: `bun test pwa/src/__tests__/search.test.tsx`

### T-20 — Create ChatConversations + resume tests

- **Files** (1): `pwa/src/__tests__/conversations.test.tsx` (new)
- **Implements**: design §8 — closes AC-06, AC-07
- **Complexity**: moderate
- **Blocked by**: T-09, T-10, T-11
- **Blocks**: T-22
- **Steps**:
  1. **AC-06 — ChatConversations states**:
     - Loading: render with `api.chat.listConversations` mocked to
       pending → assert skeleton/spinner.
     - Empty: mock returns `{ rows: [] }` → assert "No conversations yet".
     - Error: mock rejects → assert error message + retry button.
     - Ready: mock returns 3 conversations → assert list renders with
       title and time. Use injectable clock for deterministic time
       formatting.
  2. **AC-07 — Resume**:
     - Click a conversation row → assert navigation to
       `#/chat/thread?conversation=<id>`.
     - Render `AgentChat` with `conversationId` prop → assert
       `api.chat.listMessages` is called with the conversation id.
     - Assert messages are mapped and rendered in the message list.
- **Verification**: `bun test pwa/src/__tests__/conversations.test.tsx`

### T-21 — Create chat conversation API tests

- **Files** (1): `api/src/__tests__/chat-conversations.test.ts` (new)
- **Implements**: design §8 — closes AC-20
- **Complexity**: moderate
- **Blocked by**: T-11
- **Blocks**: T-22
- **Steps**:
  1. Test `GET /api/v1/chat/conversations` without session → 401.
  2. Test with session → 200 + `{ rows: [...] }` newest-first.
  3. Test `GET /api/v1/chat/conversations/:id/messages` with unknown id →
     404.
  4. Test with known id → 200 + ordered messages.
  5. Assert both routes appear in OpenAPI schema
     (`GET /api/v1/openapi.json`).
  6. Use in-memory SQLite (existing test pattern from chat tests).
- **Verification**: `bun test api/src/__tests__/chat-conversations.test.ts`

### T-22 — Create orphan guard test + final validation

- **Files** (1): `pwa/src/__tests__/view-orphans.test.ts` (new)
- **Implements**: design §4.13, §8 — closes AC-22
- **Complexity**: moderate
- **Blocked by**: T-08, T-13, T-18, T-19, T-20, T-21
- **Blocks**: —
- **Steps**:
  1. Enumerate all `.tsx` files under `pwa/src/views/`.
  2. For each file, assert it is transitively imported from
     `views/index.tsx` or `App.tsx`.
  3. Maintain an allowlist for shared internal modules:
     - `_shared.tsx` (shared fragments)
     - `Settings.tsx` (consumed by `Complexity.tsx`)
     - `*ComparisonInline.tsx` (inline comparison fragments)
     - Chat sub-components: `AgentChat.tsx`, `BookmarkMenu.tsx`,
       `Citation.tsx`, `LatencyFooter.tsx`, `MessageList.tsx`,
       `ReasoningDisclosure.tsx`, `RolePicker.tsx`, `SidePanel.tsx`,
       `SuggestedPrompts.tsx`
     - Ontology sub-components: `AddEdgeModal.tsx`, `AddEntityModal.tsx`,
       `RollbackModal.tsx`, `ErdErrorBoundary.tsx`
     - Explorer sub-components: `DomainComparisonInline.tsx`,
       `JourneyComparisonInline.tsx`, `JourneyDetailSlide.tsx` (deleted,
       but if any slide files remain they go here)
  4. Assert `scripts/design-conformance.ts` passes on all touched views.
  5. Run full test suite: `bun test` + `bun run typecheck`.
- **Verification**: `bun test pwa/src/__tests__/view-orphans.test.ts` +
  `bun test` + `bun run typecheck`

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour | the task's listed test (`bun test <path>`) |
| tasks touching pwa views | `bun run scripts/design-conformance.ts --view <file>` |
| final task (T-22) | `bun test` + `bun run typecheck` + full AC sweep |

## Task dependency graph

```
T-01 (SURFACES) ──┬─> T-02 (aliases) ──┬─> T-14 (titleStore) ──┬─> T-04 (App.tsx)
                  ├─> T-03 (virtual)   │                       ├─> T-15 (FlagButton)
                  ├─> T-05 (TopBar)    │                       │
                  ├─> T-06 (SubNav) ───┼───────────────────────┤
                  ├─> T-16 (prefStore) │                       │
                  │                    │                       │
T-11 (API routes) ──> T-10 (api client)┼─> T-09 (Conversations)┤
                  │                    │                       │
T-12 (RiskDash)   │                    │                       │
T-13 (delete)     │                    │                       │
T-07 (SearchPal)  │                    │                       │
                  │                    │                       │
                  │                    │              T-08 (view registry) <── T-09,10,12,13,15
                  │                    │                       │
                  │                    │              T-18 (update tests)
                  │                    │              T-19 (search tests)
                  │                    │              T-20 (conv tests)
                  │                    │              T-21 (API tests)
                  │                    │                       │
                  │                    │              T-22 (orphan guard + final)
```
