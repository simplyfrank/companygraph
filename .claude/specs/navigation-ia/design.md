---
feature: "navigation-ia"
created: "2026-07-06"
author: "Claude (spec-workflow) with Frank"
status: "draft"
revision: 1
reviewing_requirements_revision: 2
size: "large"
---

# Design: navigation-ia

## 1. Overview

The restructure replaces the current ten spec-silo surfaces with eight
task-oriented surfaces, adds a permanent declarative alias table for legacy
routes, mounts the existing `SearchPalette` globally, derives breadcrumbs and
keyboard shortcuts from the route table, wires ten orphaned view files, and
adds two read-only chat conversation API routes. The design follows four
rules:

1. **Pure re-wiring** — no view component's internal logic changes except the
   four enumerated NFR-04 exceptions (ChatConversations, journeys dispatch
   adapter, AgentChat resume, FlagForReviewButton embedding).
2. **Permanent aliases** — legacy route compatibility is a declarative table
   in `route.ts`, not a transition shim; old links resolve forever.
3. **Index-derived everything** — shortcuts, tab labels, and surface order
   all flow from the `SURFACES` array; no hardcoded `kbd` strings.
4. **Graceful degradation** — the shell never blocks on a missing entity name
   or a failed section; it shows the id until the name resolves.

**Key trade-offs:**
- **Alias table vs. redirect server:** chosen alias-in-parseHash because the
  PWA is hash-routed with no server involvement; rejected a server-side
  redirect because it would require a runtime dependency (NFR-01) and add a
  network round-trip for a pure client-side concern.
- **Title store vs. context bus:** a lightweight `titleStore` (Zustand) that
  views populate via an imperative `setTitle(entityId, name)` call; rejected
  a full context bus as over-engineered for breadcrumb-only name resolution.
- **Extending prefStore vs. new store:** extending `prefStore` with a
  `lastTabs` map (surface → { tab, entityId }); rejected a separate store
  because the persistence pattern (localStorage via zustand/persist) already
  exists there.

## 2. Prior-review concerns — resolution in this design

### Pass-2 C-01 (bare legacy surface hashes)

**Resolved in §4.3.** The alias table includes four surface-default rows:
`analytics → insights/overview`, `exec → insights/finance`, `sme →
explorer/review`, `api → data/endpoints`. These are applied when `parseHash`
detects a bare surface hash (no tab segment) for a legacy surface id, before
tab resolution. Included in the AC-17 exhaustive iteration.

### Pass-2 C-02 (FR-12 "resolves forever" vs. FR-04† omitted-row branch)

**Resolved — the "landed" branch is live.** `kpi-okr-performance-dashboards`
is execution:complete (verified 2026-07-06: STATUS.md shows
`execution:complete`, `verified_at: 2026-07-05`; `PerformanceDashboard` is
imported and registered at `views/index.tsx:53,152`; `route.ts` has the
`exec/performance` tab at line 88). Therefore FR-04† resolves to the landed
branch: the `performance` tab relocates to `#/insights/performance`, the
alias row `exec/performance → insights/performance` is included, and the
dangling-target guard (FR-14) covers it. The blueprint round-5 amendment
(§4.1) records the relocation.

### Pass-2 N-01 (virtual-tab mechanism on non-explorer surfaces)

**Resolved in §4.4.** The `EXPLORER_VIRTUAL_TABS` set is generalized to a
per-surface `VIRTUAL_TABS` map so virtual tabs can exist on any surface.
Only `explorer` uses virtual tabs today (`domain-detail`,
`product-detail`); the mechanism is available if design risk 2 materializes
(demoting report tabs to virtual), but no non-explorer virtual tabs are
shipped in this spec.

### Pass-2 N-02 (breadcrumb landmark + palette focus trap assertions)

**Resolved in §8.** The test strategy explicitly includes a breadcrumb
`nav` landmark assertion in `breadcrumbs.test.tsx` and a palette focus-trap
assertion in `search.test.tsx`.

## 3. Data model

### 3.1 Route types (`pwa/src/route.ts`)

No new types. The existing `Route` interface (`{ surface, tab, entityId?,
mode?, params }`) is unchanged. The `Surface` interface loses the `kbd`
field (FR-17: shortcuts are index-derived) and gains an optional `groups`
field for SubNav visual separation:

```ts
export interface TabGroup {
  id: string;
  label: string;
  tabIds: string[];
}

export interface Surface {
  id: string;
  label: string;
  tabs: Array<{ id: string; label: string }>;
  groups?: TabGroup[];   // visual separation in SubNav (FR-02, FR-04)
}
```

The `kbd` field is removed from `Surface`; `App.tsx` derives `Alt+N` from
the `SURFACES` array index.

### 3.2 Alias table (`pwa/src/route.ts`)

A new exported constant `ROUTE_ALIASES` — a declarative array of
`{ from: { surface, tab? }, to: { surface, tab }, paramTransform? }` rows.
Applied in `parseHash` before tab resolution. See §4.3 for the full table.

### 3.3 Title store (`pwa/src/store/titleStore.ts` — NEW)

A lightweight Zustand store for breadcrumb entity-name resolution (FR-16):

```ts
export interface TitleState {
  titles: Record<string, string>;  // entityId → display name
  setTitle: (entityId: string, name: string) => void;
  clearTitle: (entityId: string) => void;
}
```

Views call `setTitle(entityId, name)` when they fetch entity data. The
shell reads `titles[entityId]` for breadcrumbs, showing the id as fallback.
No API calls; purely a write-by-views, read-by-shell pattern.

### 3.4 PrefStore extension (`pwa/src/store/prefStore.ts`)

Extended with last-visited tab persistence (FR-18):

```ts
export interface PrefState {
  homeDomainId: string | null;
  setHomeDomain: (id: string | null) => void;
  clearHomeDomain: () => void;
  lastTabs: Record<string, { tab: string; entityId?: string }>;
  setLastTab: (surface: string, tab: string, entityId?: string) => void;
}
```

Persisted via the existing `zustand/persist` middleware (localStorage key
`companygraph.prefs.v1`). Session-scoped persistence is acceptable per FR-18
"should" priority — localStorage is fine.

### 3.5 Chat conversation API types (`shared/src/schema/chat.ts`)

Two new Zod schemas for the API wire shapes (FR-10):

```ts
export const conversationSummarySchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  created_at: z.string(),
  last_message_at: z.string(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const conversationMessageSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  turn_index: z.number(),
  role: z.enum(["user", "assistant"]),
  content_text: z.string(),
  role_id_used: z.string().nullable().optional(),
  created_at: z.string(),
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
```

## 4. Core logic

### 4.1 Blueprint round-5 amendment (FR-12 precondition)

The blueprint (`.claude/specs/blueprint.md`) receives a round-5 amendment
section recording:

(a) The eight-surface IA: `explorer, model, chat, insights, govern,
ontology, data, admin` — replacing the ten-surface structure. Model's
TopBar position changes from 10th (Alt+0) to 2nd (Alt+2).

(b) Relocations with permanent aliases:
- `#/analytics/*` → `#/insights/*` (8 tabs)
- `#/exec/{finance,people,transform}` → `#/insights/{same}`
- `#/exec/performance` → `#/insights/performance` (landed —
  `kpi-okr-performance-dashboards` is execution:complete)
- `#/exec/{risk,kpi-management,okr-management}` → `#/govern/{same}`
- `#/exec/ops` → `#/admin/platform`
- `#/sme/{review,add,quarterly}` → `#/explorer/{same}`
- `#/sme/home` → `#/admin/settings`
- `#/api/{endpoints,errors,import}` → `#/data/{same}`

(c) `kpi-okr-performance-dashboards`' registration target is retargeted
from `#/exec/performance` to `#/insights/performance`. The alias row
`exec/performance → insights/performance` is owned by this spec (navigation-ia)
since the dashboard has already landed at `#/exec/performance`.

### 4.2 SURFACES catalogue replacement (FR-01..FR-08)

The new `SURFACES` array in `route.ts`:

```ts
export const SURFACES: Surface[] = [
  {
    id: "explorer", label: "Explorer",
    tabs: [
      { id: "domains",     label: "Domains" },
      { id: "journeys",    label: "Journeys" },
      { id: "activities",  label: "Activities" },
      { id: "roles",       label: "Roles" },
      { id: "systems",     label: "Systems" },
      { id: "locations",   label: "Locations" },
      { id: "path-finder", label: "Path finder" },
      { id: "review",      label: "Review" },
      { id: "add",         label: "Add" },
      { id: "quarterly",   label: "Quarterly" },
    ],
    groups: [
      { id: "browse",  label: "", tabIds: ["domains","journeys","activities","roles","systems","locations","path-finder"] },
      { id: "curate",  label: "", tabIds: ["review","add","quarterly"] },
    ],
  },
  {
    id: "model", label: "Model",
    tabs: [
      { id: "models",         label: "Models" },
      { id: "canvas",         label: "Canvas" },
      { id: "stories",        label: "Stories" },
      { id: "key-activities", label: "Key Activities" },
      { id: "kpi-impact",     label: "KPI Impact" },
      { id: "systems",        label: "Systems" },
      { id: "export",         label: "Export" },
    ],
    // No groups — blueprint-frozen, untouched interior
  },
  {
    id: "chat", label: "Chat",
    tabs: [
      { id: "thread",         label: "Thread" },
      { id: "conversations",  label: "Conversations" },
    ],
  },
  {
    id: "insights", label: "Insights",
    tabs: [
      { id: "overview",          label: "Overview" },
      { id: "systems",           label: "Systems" },
      { id: "matrix",            label: "Matrix" },
      { id: "complexity",        label: "Complexity" },
      { id: "context-alignment", label: "Context alignment" },
      { id: "consolidation",     label: "Consolidation" },
      { id: "single-system",     label: "Single-system" },
      { id: "critical-paths",    label: "Critical paths" },
      { id: "ai",                label: "AI" },
      { id: "finance",           label: "Finance" },
      { id: "people",            label: "People" },
      { id: "transform",         label: "Transform" },
      { id: "performance",       label: "Performance" },
    ],
    groups: [
      { id: "analysis",  label: "", tabIds: ["overview","systems","matrix","complexity","context-alignment"] },
      { id: "reports",   label: "", tabIds: ["consolidation","single-system","critical-paths","ai"] },
      { id: "business",  label: "", tabIds: ["finance","people","transform","performance"] },
    ],
  },
  {
    id: "govern", label: "Govern",
    tabs: [
      { id: "kpi-management", label: "KPI Management" },
      { id: "okr-management", label: "OKR Management" },
      { id: "roll-down",      label: "Roll-down" },
      { id: "risk",           label: "Risk" },
      { id: "compliance",     label: "Compliance" },
      { id: "programs",       label: "Programs" },
    ],
  },
  {
    id: "ontology", label: "Ontology",
    tabs: [
      { id: "catalog",    label: "Catalog" },
      { id: "erd",        label: "ERD" },
      { id: "editor",     label: "Editor" },
      { id: "edges",      label: "Edges" },
      { id: "versions",   label: "Versions" },
      { id: "audit",      label: "Audit" },
      { id: "glossary",   label: "Glossary" },
      { id: "generator",  label: "Generator" },
    ],
  },
  {
    id: "data", label: "Data",
    tabs: [
      { id: "map",       label: "Map" },
      { id: "import",    label: "Import" },
      { id: "export",    label: "Export" },
      { id: "endpoints", label: "Endpoints" },
      { id: "errors",    label: "Errors" },
    ],
  },
  {
    id: "admin", label: "Admin",
    tabs: [
      { id: "personas",   label: "Personas" },
      { id: "rbac-roles", label: "RBAC Roles" },
      { id: "users",      label: "User Assignments" },
      { id: "platform",   label: "Platform" },
      { id: "settings",   label: "Settings" },
    ],
  },
];
```

### 4.3 Alias table and parseHash integration (FR-11, FR-13, FR-14)

The alias table is a declarative array applied at the top of `parseHash`,
before surface/tab resolution. The algorithm:

1. Parse the hash into `{ surfaceId, tabId, entityId, mode, params }`.
2. If `surfaceId` matches a current surface id (not a legacy one), skip
   aliasing — identity-mapped.
3. Look up `ROUTE_ALIASES` for a matching `{ from: { surface, tab? } }` row.
   Tab-level rows match when both surface and tab match. Surface-default
   rows match when only the surface matches (bare hash or unknown tab).
4. If a match is found, replace `surfaceId`/`tabId` with the alias target.
   Apply `paramTransform` if present (e.g., `?journey=<id>` → `/:id/graph`).
5. If the alias changed the route, canonicalize: `history.replaceState`
   with the new hash (FR-13 — no extra back-stack entry).
6. Proceed with normal tab resolution against the new surface/tab.

```ts
interface AliasRow {
  from: { surface: string; tab?: string };
  to: { surface: string; tab: string };
  paramTransform?: (params: Record<string, string>, entityId?: string) => {
    params?: Record<string, string>;
    entityId?: string;
    mode?: string;
  };
  bareSurfaceDefault?: boolean;  // matches bare surface hashes
}

export const ROUTE_ALIASES: readonly AliasRow[] = [
  // Tab-level aliases
  { from: { surface: "sme", tab: "review" },    to: { surface: "explorer", tab: "review" } },
  { from: { surface: "sme", tab: "add" },       to: { surface: "explorer", tab: "add" } },
  { from: { surface: "sme", tab: "quarterly" }, to: { surface: "explorer", tab: "quarterly" } },
  { from: { surface: "sme", tab: "home" },      to: { surface: "admin", tab: "settings" } },

  { from: { surface: "analytics", tab: "overview" },       to: { surface: "insights", tab: "overview" } },
  { from: { surface: "analytics", tab: "systems" },        to: { surface: "insights", tab: "systems" } },
  { from: { surface: "analytics", tab: "matrix" },         to: { surface: "insights", tab: "matrix" } },
  { from: { surface: "analytics", tab: "consolidation" },  to: { surface: "insights", tab: "consolidation" } },
  { from: { surface: "analytics", tab: "complexity" },     to: { surface: "insights", tab: "complexity" } },
  { from: { surface: "analytics", tab: "single-system" },  to: { surface: "insights", tab: "single-system" } },
  { from: { surface: "analytics", tab: "critical-paths" }, to: { surface: "insights", tab: "critical-paths" } },
  { from: { surface: "analytics", tab: "ai" },             to: { surface: "insights", tab: "ai" } },
  { from: { surface: "analytics", tab: "exec-summary" },   to: { surface: "insights", tab: "overview" } },

  { from: { surface: "api", tab: "endpoints" }, to: { surface: "data", tab: "endpoints" } },
  { from: { surface: "api", tab: "errors" },    to: { surface: "data", tab: "errors" } },
  { from: { surface: "api", tab: "import" },    to: { surface: "data", tab: "import" } },

  { from: { surface: "exec", tab: "ops" },             to: { surface: "admin", tab: "platform" } },
  { from: { surface: "exec", tab: "finance" },         to: { surface: "insights", tab: "finance" } },
  { from: { surface: "exec", tab: "people" },          to: { surface: "insights", tab: "people" } },
  { from: { surface: "exec", tab: "transform" },       to: { surface: "insights", tab: "transform" } },
  { from: { surface: "exec", tab: "risk" },            to: { surface: "govern", tab: "risk" } },
  { from: { surface: "exec", tab: "kpi-management" },  to: { surface: "govern", tab: "kpi-management" } },
  { from: { surface: "exec", tab: "okr-management" },  to: { surface: "govern", tab: "okr-management" } },
  { from: { surface: "exec", tab: "performance" },     to: { surface: "insights", tab: "performance" } },

  // Explorer journey merge (FR-03)
  {
    from: { surface: "explorer", tab: "journey-detail" },
    to: { surface: "explorer", tab: "journeys" },
    paramTransform: (params, entityId) => entityId
      ? { entityId }  // /explorer/journey-detail/:id → /explorer/journeys/:id
      : {},
  },
  {
    from: { surface: "explorer", tab: "journey-graph" },
    to: { surface: "explorer", tab: "journeys" },
    paramTransform: (params) => {
      const journeyId = params["journey"];
      if (journeyId) {
        return { entityId: journeyId, mode: "graph", params: {} };
      }
      return { params: { ...params, view: "graph" } };
    },
  },

  // Bare surface defaults (pass-2 C-01)
  { from: { surface: "analytics" }, to: { surface: "insights", tab: "overview" }, bareSurfaceDefault: true },
  { from: { surface: "exec" },      to: { surface: "insights", tab: "finance" },  bareSurfaceDefault: true },
  { from: { surface: "sme" },       to: { surface: "explorer", tab: "review" },   bareSurfaceDefault: true },
  { from: { surface: "api" },       to: { surface: "data", tab: "endpoints" },    bareSurfaceDefault: true },
];
```

**Note on `exec-summary`:** The `analytics/exec-summary` tab (cto-analytics-reporting
T-08) has no corresponding tab in the new `insights` surface. It aliases to
`insights/overview` to avoid a dangling target. The `AnalyticsExecSummary`
view becomes unreachable via normal navigation — it is either deleted or
demoted to a virtual tab if the design review determines it should remain
accessible. **Design decision: delete the `exec-summary` tab and
`AnalyticsExecSummary.tsx` view** — it is a PDF launcher that duplicates the
Model surface's Export tab functionality, and cto-analytics-reporting's
STATUS shows execution:complete but the view is a thin launcher with no
unique capability. If the review disagrees, the fallback is to add
`exec-summary` as an insights virtual tab.

**Dangling-target guard (FR-14):** A unit test iterates `ROUTE_ALIASES`
and asserts every `to.{surface, tab}` resolves to a registered tab in
`SURFACES` or a virtual tab in `VIRTUAL_TABS`. This structurally prevents
silent mis-landing.

### 4.4 Virtual tabs generalization (FR-02, FR-19)

The `EXPLORER_VIRTUAL_TABS` set is generalized to a per-surface map:

```ts
const VIRTUAL_TABS: Record<string, Set<string>> = {
  explorer: new Set(["domain-detail", "product-detail"]),
};
```

`parseHash` checks `VIRTUAL_TABS[surfaceId]?.has(tabId)` after alias
resolution and before the first-tab fallback. `product-detail` is added
(FR-19 — was missing, causing `ProductDetail` to fall back to `domains`).

### 4.5 Journeys dispatch adapter (FR-03)

The merged `journeys` tab dispatches by route shape:

| Route | Renders | Adapter |
|-------|---------|---------|
| `#/explorer/journeys` | `ExplorerJourney` (picker) | No entityId, no `view=graph` param |
| `#/explorer/journeys/:id` | `ExplorerJourney` (detail) | `entityId` passed as-is |
| `#/explorer/journeys/:id/graph` | `ExplorerJourneyGraph` | `entityId` → `params.journey`, `mode=graph` |
| `#/explorer/journeys?view=graph` | `ExplorerJourneyGraph` (multi-board) | No entityId, `params.view=graph` |

The dispatch adapter in `views/index.tsx`:

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

**NFR-04(b) exception:** `ExplorerJourney` reads `entityId ?? params["id"]`
(unchanged — `entityId` is already its primary read). `ExplorerJourneyGraph`
reads `params["journey"]` — the adapter maps `entityId` → `params.journey`,
so the ≤5-line interior change is the adapter itself in `views/index.tsx`,
not inside the view component. If `ExplorerJourneyGraph` needs a one-line
adjustment to accept `entityId` as a fallback for `params.journey`, that is
within the NFR-04(b) allowance.

### 4.6 SearchPalette mounting (FR-15)

`SearchPalette` is mounted globally in `App.tsx`, outside the surface/tab
view area. The existing `/` keyboard handler in `App.tsx` is repurposed:
instead of focusing the SubNav search input, it opens the palette. A new
`Cmd/Ctrl+K` handler is added. The SubNav search input and Filters button
are removed from `App.tsx`'s `SubNav` usage.

`SearchPalette`'s `hrefForHit` function is updated to canonical routes:

```ts
case "Domain":      return `#/explorer/domains/${id}`;
case "UserJourney": return `#/explorer/journeys/${id}`;
case "Activity":    return `#/explorer/activities/${id}`;
case "System":      return `#/explorer/systems/${id}`;
case "Role":        return `#/explorer/roles/${id}`;
case "Location":    return `#/explorer/locations/${id}`;
case "Product":     return `#/explorer/product-detail/${id}`;
```

A visible search affordance (magnifying-glass icon button) is added to the
TopBar, opening the palette on click.

### 4.7 Breadcrumb derivation (FR-16)

Breadcrumbs are derived from the route in `App.tsx`:

```ts
const crumbs = useMemo(() => {
  const surfaceLabel = surface.label;
  const tabLabel = surface.tabs.find(t => t.id === route.tab)?.label ?? route.tab;
  const base = [
    { label: surfaceLabel, href: toHash({ surface: surface.id, tab: surface.tabs[0]!.id }) },
    { label: tabLabel, href: toHash({ surface: surface.id, tab: route.tab }) },
  ];
  if (route.entityId) {
    const name = useTitleStore.getState().titles[route.entityId] ?? route.entityId;
    base.push({ label: name, href: undefined });
  }
  return base;
}, [route, surface]);
```

The breadcrumb is rendered in a `<nav aria-label="Breadcrumb">` landmark
(UX-05). Each ancestor crumb is an `<a href>` link. The entity name is
resolved from `titleStore`; the id is shown until the name resolves.

Views call `useTitleStore.getState().setTitle(entityId, name)` when they
fetch entity data. This is a one-line addition per detail view — not an
interior logic change (NFR-04 scope: "embedding" not "rewriting").

### 4.8 Keyboard shortcuts (FR-17)

`App.tsx`'s keyboard handler is updated:

- `Alt+1..8` → `SURFACES[idx]` (index-derived, no `kbd` field)
- `Alt+0` → removed (Model is now Alt+2)
- Typing guard (skip when target is input/textarea/contenteditable) — unchanged
- `/` → opens `SearchPalette` (replaces SubNav search focus)
- `Cmd/Ctrl+K` → opens `SearchPalette`
- `Escape` → closes palette (if open), otherwise blurs active element

### 4.9 Last-visited tab persistence (FR-18)

On every route change, `App.tsx` calls
`usePrefStore.getState().setLastTab(surface, tab, entityId)`. When the user
navigates to a surface via TopBar or Alt+N, the shell checks
`lastTabs[surfaceId]` and navigates to the saved tab/entityId instead of the
first tab. First visit lands on the first tab. Stale entityIds are restored
blindly — views own their not-found/empty states (NFR-04).

### 4.10 ChatConversations view (FR-09)

New view `pwa/src/views/chat/Conversations.tsx`:

- Fetches `GET /api/v1/chat/conversations` on mount
- **Loading:** spinner/skeleton
- **Empty:** "No conversations yet" message
- **Error:** error message with retry button
- **Ready:** list of conversations, newest first, showing title (or
  "Untitled") and last-message time (via injectable clock for deterministic
  tests — AC-06)
- Clicking a row navigates to `#/chat/thread?conversation=<id>`
- Uses `ViewHeader` from `_shared.tsx` and catalog components only

### 4.11 AgentChat resume (FR-09, NFR-04(c))

`AgentChat` is modified to accept an optional `conversationId` prop (or read
it from `route.params["conversation"]`):

```ts
export function AgentChat({ conversationId: propId }: { conversationId?: string }): JSX.Element {
  // ... existing state ...
  const [conversationId, setConversationId] = useState<string | undefined>(
    propId ?? undefined,
  );

  // Hydrate history on mount or when conversationId changes.
  useEffect(() => {
    if (!conversationId) return;
    api.chat.listMessages(conversationId).then(messages => {
      setMessages(messages.map(/* map to ChatMessage */));
    }).catch(err => setError(err.message));
  }, [conversationId]);
  // ... rest unchanged ...
}
```

The `Thread.tsx` re-export passes the route param:

```ts
export function ChatThread({ route }: { route?: Route }): JSX.Element {
  return <AgentChat conversationId={route?.params?.["conversation"]} />;
}
```

This is the NFR-04(c) enumerated exception — interior change to `AgentChat`
for param read + history hydration.

### 4.12 Chat conversation API routes (FR-10)

Two new read-only GET routes added to `api/src/routes/chat.ts`:

**`GET /api/v1/chat/conversations`** — lists conversations newest-first:

```ts
export async function handleConversationList(req: Request): Promise<Response> {
  const session = requireSession(req);
  const rows = listConversations();  // new persistence function
  return ok(rows);
}
```

New persistence function `listConversations()` in `persistence.ts`:

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

**`GET /api/v1/chat/conversations/:id/messages`** — ordered message history:

```ts
export async function handleConversationMessages(req: Request, id: string): Promise<Response> {
  const session = requireSession(req);
  const conv = getConversation(id);
  if (!conv) return notFound("conversation_not_found", `Conversation ${id} not found`);
  const messages = loadConversationHistory(id, { limit: 1000 });
  return ok(messages);
}
```

Both routes are registered in `router.ts` behind the standard auth gate and
appear in the boot-generated OpenAPI schema. The existing
`loadConversationHistory` function in `persistence.ts` already supports
ordered retrieval with a limit parameter.

### 4.13 Orphan triage (FR-05, FR-06, FR-21)

| File | Disposition | Rationale |
|------|-------------|-----------|
| `exec/RollDown.tsx` | **Wire** at `#/govern/roll-down` | Primary roll-down view; `DomainDetail`'s embedded `RollDownTab` is a per-domain slice, not the full roll-down — de-duplicate by keeping both: this is the full-model view, `RollDownTab` is the inline domain-scoped view |
| `exec/RollDownAnalytics.tsx` | **Wire** as sub-component of `RollDown` | Already imported by `RollDown.tsx` (verify); if not, embed it |
| `exec/RiskDashboard.tsx` | **Wire** at `#/govern/risk` alongside `ExecRisk` | `ExecRisk` is the register (table); `RiskDashboard` is the visual dashboard (charts). Render `RiskDashboard` as the primary view with `ExecRisk` as a tab within it, or vice versa. **Design decision: `RiskDashboard` is the primary view at `#/govern/risk`; `ExecRisk` content is embedded as a "Register" section within it.** This avoids shipping two competing risk UIs. |
| `exec/ProgramManagement.tsx` | **Wire** at `#/govern/programs` | Direct wiring, no interior change |
| `exec/ContextAlignment.tsx` | **Wire** at `#/insights/context-alignment` | Direct wiring, no interior change |
| `ontology/GlossaryManager.tsx` | **Wire** at `#/ontology/glossary` | Direct wiring, no interior change |
| `ontology/ComplianceManager.tsx` | **Wire** at `#/ontology/audit` as a sub-section, OR at `#/govern/compliance` | **Design decision: wire at `#/govern/compliance`** — compliance is a governance concern, not an ontology concern. The requirements FR-05 lists `compliance` under `govern`, and FR-06 does not list it under `ontology`. |
| `ontology/OntologyGenerator.tsx` | **Wire** at `#/ontology/generator` | Direct wiring, no interior change |
| `explorer/DomainDetailSlide.tsx` | **Delete** (with `.module.css` if present) | Superseded by `DomainDetail.tsx` which handles the full detail view including slides/panels. Verified: `DomainDetail` is 1400+ lines with its own tab system; `DomainDetailSlide` is a standalone slide-over that was never integrated. |
| `explorer/JourneyDetailSlide.tsx` | **Delete** (with `.module.css` if present) | Superseded by `Journey.tsx` which handles journey detail. Verified: `Journey.tsx` is the registered view; `JourneyDetailSlide` was never integrated. |
| `analytics/Settings.tsx` | **Delete** | Not in the view registry, not referenced by any spec, not mentioned in requirements. Appears to be an abandoned experiment. |
| `analytics/ExecSummary.tsx` | **Delete** | See §4.3 note — duplicates Model/Export functionality; aliases to `insights/overview`. |

**Orphan guard test (FR-22):** `pwa/src/__tests__/view-orphans.test.ts`
enumerates `pwa/src/views/**/*.tsx` and asserts every file is transitively
imported from `views/index.tsx` or `App.tsx`, with an allowlist for shared
fragments (`_shared.tsx`, `*ComparisonInline.tsx`, chat sub-components like
`MessageList.tsx`, `Citation.tsx`, etc.).

### 4.14 FlagForReviewButton embedding (FR-20)

`FlagForReviewButton` is rendered on:
- `DomainDetail.tsx` — domain detail view
- `Journey.tsx` — journey detail view (when `entityId` is present)
- `Activities.tsx` — activity detail view (when `entityId` is present)

The button is disabled when the entity's domain is not the operator's home
domain (existing `useIsHomeDomain` hook + `prefStore.homeDomainId`). This is
an embedding change (NFR-04(d)), not an interior logic change — the button
component and the hook already exist.

## 5. HTTP API surface

| Method | Route | FR | Request → Response |
|--------|-------|----|--------------------|
| GET | `/api/v1/chat/conversations` | FR-10 | `→ 200 [{ id, title, created_at, last_message_at }]` (newest first); 401 without session |
| GET | `/api/v1/chat/conversations/:id/messages` | FR-10 | `→ 200 [{ id, conversation_id, turn_index, role, content_text, role_id_used?, created_at }]`; 401 without session; 404 unknown id |

**Error codes:**
- `unauthorized` (401) — no valid session (standard auth gate)
- `conversation_not_found` (404) — unknown conversation id

**OpenAPI:** both routes appear in `/api/v1/openapi.json` via the existing
boot-time schema generation.

## 6. UI design

### View tree placement

All eight surfaces and their tabs are registered in `route.ts` (§4.2). The
view registry (`views/index.tsx`) maps each surface/tab to its view
component. Relocated views keep their existing component code; only the
registry entry changes.

### Component plan

- **TopBar:** modified to remove `kbd` prop, add search affordance button
- **SubNav:** modified to render tab groups (visual separators), remove
  search input and Filters button from `App.tsx`'s usage
- **SearchPalette:** existing component, mounted globally in `App.tsx`;
  `hrefForHit` updated to canonical routes
- **Breadcrumb:** new `<nav aria-label="Breadcrumb">` in `App.tsx`'s main
  area, above the view section; uses catalog `Crumb` styling
- **ChatConversations:** new view using `ViewHeader` + catalog list/table
  components; injectable clock prop for deterministic tests
- **FlagForReviewButton:** existing component, embedded in detail views

### States

- **ChatConversations:** loading (skeleton), empty ("No conversations yet"),
  error (message + retry), ready (list with title + time)
- **All relocated views:** unchanged (NFR-04 — relocation only)

### Tokens

All styling via `var(--…)` from `pwa/src/styles/tokens.css`. The SubNav
group separator uses `border-left: 1px solid var(--border-subtle)` or
equivalent. No new tokens needed.

### Input modes

- **Keyboard:** Alt+1..8 surface shortcuts (index-derived), `/` and
  Cmd/Ctrl+K open SearchPalette, Escape closes palette, Tab/Enter for nav
- **Mouse:** TopBar surface links, SubNav tab buttons, breadcrumb links,
  search affordance button, conversation list rows
- **Touch:** 44px touch targets on all new tab groups and search button
  (AC-14); SubNav scrolls horizontally for surfaces with many tabs
  (Insights has 13)

## 7. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `.claude/specs/blueprint.md` | modify | FR-12 | Round-5 amendment section |
| `pwa/src/route.ts` | modify | FR-01..FR-08, FR-11, FR-14, FR-17, FR-19 | New SURFACES, ROUTE_ALIASES, VIRTUAL_TABS, remove kbd |
| `pwa/src/App.tsx` | modify | FR-13, FR-15, FR-16, FR-17, FR-18 | SearchPalette mount, breadcrumbs, index shortcuts, last-tab, remove SubNav search/Filters |
| `pwa/src/views/index.tsx` | modify | FR-01..FR-08, FR-03, FR-21 | New view registry, journeys dispatch adapter, wire orphans |
| `pwa/src/components/TopBar.tsx` | modify | FR-15, FR-17 | Remove kbd, add search affordance |
| `pwa/src/components/SubNav.tsx` | modify | FR-02, FR-04 | Add tab group rendering |
| `pwa/src/components/SearchPalette.tsx` | modify | FR-15 | Update hrefForHit to canonical routes |
| `pwa/src/store/titleStore.ts` | new | FR-16 | Title store for breadcrumb name resolution |
| `pwa/src/store/prefStore.ts` | modify | FR-18 | Add lastTabs persistence |
| `pwa/src/views/chat/Conversations.tsx` | new | FR-09 | ChatConversations view |
| `pwa/src/views/chat/Thread.tsx` | modify | FR-09 | Pass conversation param to AgentChat |
| `pwa/src/views/chat/AgentChat.tsx` | modify | FR-09, NFR-04(c) | Conversation param read + history hydration |
| `pwa/src/views/explorer/DomainDetail.tsx` | modify | FR-16, FR-20 | setTitle call, FlagForReviewButton embed |
| `pwa/src/views/explorer/Journey.tsx` | modify | FR-16, FR-20 | setTitle call, FlagForReviewButton embed |
| `pwa/src/views/explorer/Activities.tsx` | modify | FR-20 | FlagForReviewButton embed (detail mode) |
| `pwa/src/views/explorer/DomainDetailSlide.tsx` | delete | FR-21 | Superseded |
| `pwa/src/views/explorer/JourneyDetailSlide.tsx` | delete | FR-21 | Superseded |
| `pwa/src/views/analytics/Settings.tsx` | delete | FR-21 | Orphan, unreferenced |
| `pwa/src/views/analytics/ExecSummary.tsx` | delete | FR-21 | Duplicates Model/Export |
| `pwa/src/views/exec/RiskDashboard.tsx` | modify | FR-05, FR-21 | Embed ExecRisk as section (de-duplication) |
| `api/src/routes/chat.ts` | modify | FR-10 | handleConversationList, handleConversationMessages |
| `api/src/chat/persistence.ts` | modify | FR-10 | listConversations function |
| `api/src/router.ts` | modify | FR-10 | Register conversation routes |
| `api/src/auth/rbac-permissions.ts` | modify | FR-10 | RBAC entries for conversation routes |
| `pwa/src/api.ts` | modify | FR-09 | api.chat.listConversations, api.chat.listMessages |
| `shared/src/schema/chat.ts` | modify | FR-10 | ConversationSummary, ConversationMessage schemas |
| `pwa/src/__tests__/route-parse.test.ts` | modify | AC-01..AC-05, AC-08..AC-12, AC-16..AC-19 | Updated for new SURFACES + alias table |
| `pwa/src/__tests__/search.test.tsx` | modify | AC-13 | SearchPalette mount + focus trap |
| `pwa/src/__tests__/breadcrumbs.test.tsx` | new | AC-15 | Breadcrumb derivation + landmark |
| `pwa/src/__tests__/conversations.test.tsx` | new | AC-06, AC-07 | ChatConversations view + resume |
| `pwa/src/__tests__/view-orphans.test.ts` | new | AC-22 | Orphan guard test |
| `pwa/src/__tests__/deep-link.test.tsx` | modify | AC-16 | Alt+1..8 shortcuts, no Alt+0 |
| `pwa/src/__tests__/touch-targets.test.tsx` | modify | AC-14 | New tab groups + search button |
| `pwa/src/__tests__/sme-review-flag.test.tsx` | modify | AC-21 | FlagForReviewButton on detail views |
| `api/src/__tests__/chat-conversations.test.ts` | new | AC-20 | API route tests |
| `pwa/src/store/__tests__/routeStore.test.ts` | modify | AC-17 | Alias table exhaustive iteration |

## 8. Test strategy

| AC | Test file | Type | Coverage |
|----|-----------|------|----------|
| AC-01 | `route-parse.test.ts` | unit | SURFACES has exactly 8 surfaces in order; #/model/* routes resolve identically |
| AC-02 | `route-parse.test.ts` | unit | activities/roles/locations as SubNav tabs; virtual tabs still resolve |
| AC-03 | `route-parse.test.ts` + `journey-detail.test.tsx` | unit + component | Journey dispatch by route shape; legacy canonicalization |
| AC-04 | `route-parse.test.ts` | unit | sme/review → explorer/review alias + canonicalization |
| AC-05 | `route-parse.test.ts` | unit | product-detail virtual tab resolves |
| AC-06 | `conversations.test.tsx` | component | ChatConversations loading/empty/error/ready states |
| AC-07 | `conversations.test.tsx` | component | Resume: click row → thread with prior messages |
| AC-08 | `route-parse.test.ts` | unit | All insights tabs resolve; analytics/exec aliases canonicalize |
| AC-09 | `route-parse.test.ts` | unit | All govern tabs resolve |
| AC-10 | `route-parse.test.ts` | unit | ontology/glossary + ontology/generator resolve |
| AC-11 | `route-parse.test.ts` | unit | api/import → data/import alias; all data tabs resolve |
| AC-12 | `route-parse.test.ts` | unit | exec/ops → admin/platform; sme/home → admin/settings |
| AC-13 | `search.test.tsx` | component | / and Cmd+K open palette; Escape closes + focus return; focus trap |
| AC-14 | `touch-targets.test.tsx` | component | Tab groups + search button ≥ 44px |
| AC-15 | `breadcrumbs.test.tsx` | component | Breadcrumb text/links + nav landmark + entity name |
| AC-16 | `deep-link.test.tsx` | component | Alt+1..8 jumps; no Alt+0; typing guard |
| AC-17 | `route-parse.test.ts` | unit | Alias table exhaustive iteration + dangling-target guard + history-replace |
| AC-18 | `route-parse.test.ts` | unit | exec/performance → insights/performance alias resolves |
| AC-19 | `route-parse.test.ts` | unit | Last-visited tab persistence; stale entityId |
| AC-20 | `chat-conversations.test.ts` | integration | 401/200/404 + OpenAPI presence |
| AC-21 | `sme-review-flag.test.tsx` | component | FlagForReviewButton on detail views; disabled outside home domain |
| AC-22 | `view-orphans.test.ts` | unit | Every view file transitively imported; design-conformance passes |

**Manual verification** (AC-04, AC-09): mouse-click through TopBar →
surface → each tab, verify view renders data or its own empty state.

## 9. Rejected alternatives

- **Server-side redirects for legacy routes:** rejected — hash routing is
  pure client-side; a server redirect would require a runtime dependency
  (NFR-01) and add a network round-trip.
- **Full context bus for breadcrumb names:** rejected — a lightweight
  titleStore (Zustand) is sufficient; views already fetch entity data and
  can call `setTitle` in one line. A context bus would be over-engineered.
- **Separate store for last-visited tabs:** rejected — `prefStore` already
  has the localStorage persistence pattern; adding a `lastTabs` map is a
  minimal extension.
- **Keeping `exec-summary` as a virtual tab:** rejected — the
  `AnalyticsExecSummary` view is a thin PDF launcher that duplicates the
  Model surface's Export tab. Deleting it simplifies the insights surface
  and avoids a 14th tab. If needed later, it can be re-added as a virtual
  tab.
- **Merging `RiskDashboard` and `ExecRisk` into one new component:**
  rejected — would violate NFR-04 (interior redesign). Instead,
  `RiskDashboard` is the primary view and `ExecRisk` content is embedded as
  a section within it, requiring only a wrapping change in the view
  registry.
- **Generalized virtual tabs on all surfaces:** rejected for now — only
  `explorer` needs virtual tabs today. The mechanism is available via the
  per-surface `VIRTUAL_TABS` map if design risk 2 materializes, but no
  non-explorer virtual tabs are shipped.
