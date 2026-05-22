# companygraph — Architecture Standards

This document records the architectural decisions and coding standards enforced
across the `api/`, `pwa/`, and `shared/` packages. Every pattern here
corresponds to a concrete fix applied during the May 2026 architectural review.
New contributors should read this before writing code.

---

## 1. Shared schema is the single source of truth

**Location:** `shared/src/schema/`

All Zod schemas, TypeScript types, and constant registries (`NODE_LABELS`,
`EDGE_TYPES`, `EDGE_ENDPOINTS`) live in `shared`. Both `api` and `pwa` import
from `@companygraph/shared/*`. Never redefine a type or constant in `api` or
`pwa` that already exists in `shared`.

The OpenAPI generator in `api/src/routes/openapi.ts` also sources its schemas
from `shared`, so type changes propagate to the spec automatically.

---

## 2. dryRun is schema-only validation — never a write-then-rollback

**Location:** `api/src/routes/import.ts`

`?dryRun=true` on `POST /api/v1/import` runs pure Zod schema validation with
**zero DB writes**. It does not write to Neo4j and roll back.

**Why:** Storage helpers each open their own `driver.session()`. A wrapping
`session.beginTransaction()` in the route handler cannot encompass those inner
sessions — the `tx.rollback()` would roll back nothing and the writes would
be committed silently. A true transactional dryRun would require all storage
functions to accept an injected `ManagedTransaction` parameter (a larger
refactor). For the import use-case, schema-only validation gives callers
exactly what they need: which rows would fail, before touching the graph.

**Rule:** Never implement dryRun semantics via write-then-rollback unless every
storage function called in that path accepts an injected transaction.

---

## 3. Stats and counts use a single UNION ALL query — never N+1 loops

**Location:** `api/src/routes/stats.ts`

`GET /api/v1/stats` returns counts for all 6 node labels and 6 edge types in
**one round-trip** using `UNION ALL`. The previous implementation fired 12
sequential `session.run()` calls in a loop.

**Rule:** Never loop over label/type arrays and issue one `session.run()` per
iteration. Build a `UNION ALL` query or use a `CALL { … }` subquery block.
This applies to any multi-count query pattern.

Edge queries: use directed `MATCH (a)-[r:TYPE]->(b)` so each relationship is
counted once. Undirected `MATCH ()-[r]-()` counts each edge twice.

---

## 4. Edge validation uses a single consolidated read query

**Location:** `api/src/storage/edges.ts → validateEdge()`

All three validation steps — endpoint existence, label lookup, and cross-type
id collision — are resolved in **one parameterized Cypher query** using
`OPTIONAL MATCH` and an `EXISTS` subquery. The previous implementation fired
3 sequential `session.run()` calls in the same session, meaning every edge
write consumed 3 extra round-trips before the write session opened.

**Rule:** When multiple lookups can be composed into a single Cypher statement,
do so. The result is one session acquisition + one round-trip regardless of
how many pieces of data are needed.

---

## 5. useFetch always uses AbortController

**Location:** `pwa/src/useFetch.ts`

`useFetch` creates an `AbortController` per effect run and calls
`controller.abort()` on cleanup. The signal is passed to the `fn` callback.

- **New call sites** must accept and forward the signal: `(signal) => api.foo(signal)`
  — this gives true HTTP-level cancellation (the in-flight request is aborted).
- **Legacy call sites** using `() => api.foo()` still work (TypeScript allows
  a function that ignores its argument) and get React-state-level cancellation
  (no stale state updates after unmount).

Never write `useFetch(() => api.foo(), deps)` for new code. Always write
`useFetch((signal) => api.foo(signal), deps)`.

---

## 6. All GET api methods accept an optional AbortSignal

**Location:** `pwa/src/api.ts`

Every `api.*` GET method accepts `signal?: AbortSignal` as its last parameter.
The `withSignal()` helper spreads the signal into `RequestInit` only when
defined, avoiding `exactOptionalPropertyTypes` conflicts with
`RequestInit.signal: AbortSignal | null`.

**Rule:**
- GET methods: always add `signal?: AbortSignal` as the last parameter.
- POST/mutation methods: do **not** accept a signal. User-initiated writes
  must not be silently cancelled mid-flight.

```ts
// Correct pattern for a new GET endpoint:
myEndpoint: (id: string, signal?: AbortSignal) =>
  json<MyResponse>(`/api/v1/my/${encodeURIComponent(id)}`, withSignal(signal)),
```

---

## 7. Route params are parsed once, centrally

**Location:** `pwa/src/route.ts → parseHash()`, `pwa/src/views/index.tsx`

The `Route` type carries `params: Readonly<Record<string, string>>` parsed
from the hash query string. `parseHash()` is the single parse point.

Views receive params via their `route` prop — they do **not** maintain their
own `hashchange` listeners or call `new URLSearchParams(window.location.hash)`.
The `useQuery()` pattern (local hook that re-parses on every hashchange) is
**retired**.

**Rule:** To read a URL parameter in a view:
1. Accept `{ route: Route }` as a prop.
2. Read `route.params["myParam"] ?? null`.
3. Register the view factory in `views/index.tsx` as `(r) => <MyView route={r} />`.

To navigate with params use `toHash({ surface, tab }, { key: "value" })`.

---

## 8. Environment values are injected at build time via Vite env vars

**Location:** `pwa/src/App.tsx`

`APP_ENV` and `ONTOLOGY_VERSION` are read from `import.meta.env.VITE_ENV` and
`import.meta.env.VITE_ONTOLOGY_VERSION` with safe fallbacks. They are never
hardcoded string literals.

**Rule:** Any value that differs between dev/staging/production must come from
a Vite env var (`VITE_*`). Set the appropriate value in `.env.development`,
`.env.staging`, or `.env.production`. Never hardcode environment-specific
strings in component files.

---

## 9. Error codes are a closed registry

**Location:** `api/src/errors.ts → ERROR_CODES`

All API error codes are declared in `ERROR_CODES as const`. The OpenAPI spec
references this array directly. Adding a new code requires one entry here; no
other file needs changing to make it appear in the spec.

**Rule:** Never throw a `ValidationError` with a code string that is not in
`ERROR_CODES`. The envelope test asserts every code is reachable.

---

## 10. Read-only Cypher is enforced at the driver level

**Location:** `api/src/neo4j/read-only-session.ts`

`runPassthrough()` opens a session with `defaultAccessMode: "READ"`. The Neo4j
driver rejects any write statement (CREATE, MERGE, SET, DELETE) at the protocol
level — it is not a regex or application-level check.

**Rule:** All query/read routes must use `runPassthrough()`. Storage write
functions must use `session.executeWrite()` (never `session.run()` for writes).

---

## 11. Ontology mutations are fully atomic

**Location:** `api/src/ontology/storage/`

Every ontology mutation commits the data row, `_OntologyAudit`, `_OntologyVersion`,
and `_OntologyEvent` in a **single `executeWrite` transaction**. The post-commit
`EventEmitter.emit()` fires from the route handler *after* the transaction
resolves, so SSE subscribers only see committed events.

**Rule:** New ontology mutation operations must call `writeAudit()`,
`writeVersion()`, and `writeEvent()` inside the same `executeWrite` block as
the data write. Do not fire `emit()` inside the transaction.

---

## 12. The dispatcher is the authoritative route table

**Location:** `api/src/router.ts → dispatch()`

The `dispatch()` function is the only place routes are registered. The OpenAPI
generator in `openapi.ts` maintains its own parallel route table (by design —
see comment in that file). If you add a route, add it to both.

Routes follow the pattern `method + sub-path` with regex only for path
parameters. Keep the match branches ordered: static paths before regex paths
within each resource group.

---

## 13. Ontology route pattern

**Locations:** `api/src/routes/ontology-node-labels.ts`, `ontology-edge-types.ts`,
`ontology-schema.ts`, `ontology-audit.ts`, `ontology-import.ts`

Ontology CRUD routes follow this invariant:

1. **Validate input** with the shared Zod schema (`nodeLabelCreateSchema` etc.);
   throw `ERROR_CODE_THROWERS.invalid_payload(...)` on failure.
2. **Call the storage helper** (`createNodeLabel`, `patchEdgeType`, …);
   the helper commits the audit/version/event rows atomically in its transaction.
3. **Emit `ontologyEvents.emit("ontology.changed", …)`** from the route handler
   *after* the storage call returns — never inside the transaction.
4. **Return the response** (`ok(row, 201)` for creates, `ok(row)` for patches,
   `noContent()` for deletes).

URL `:name` params on GET/PATCH/DELETE routes use `parseRegistryLabel` /
`parseEdgeTypeName` (async, schema-cache backed) rather than the compile-time
`parseLabel`. A null result from these helpers returns 404 before the storage
call, preventing Cypher injection payloads from reaching the storage layer.

**Rule:** Never call `ontologyEvents.emit()` inside a storage transaction.
Never skip the emit after a successful mutation — cache invalidation depends on it.

---

## 14. Bootstrap is registry-iterating (FR-15)

**Location:** `api/src/neo4j/bootstrap.ts`

`applySchema` runs three sequential idempotent steps:

1. `applyMetaSchema` — creates `_Ontology*` constraints + indexes (`IF NOT EXISTS`).
2. `seedRegistryFromConstTuples` — gated by `isRegistryEmpty`; runs once per
   database lifetime. Emits `ontology.changed` after commit to warm caches.
3. Registry iteration — reads all `_OntologyNodeLabel` and `_OntologyEdgeType`
   rows and creates per-label data constraints (`node_id_unique_*`, `node_name_*`)
   and per-type edge constraints (`edge_id_unique_*`).

Step 3 ensures that labels/types added via `POST /api/v1/ontology/node-labels`
get their data constraints applied on the next server restart.

**Rule:** `api/src/ontology/seed.ts` is the **sole** legal importer of the
compile-time `NODE_LABELS` / `EDGE_TYPES` const tuples (AC-15). Do not import
them from any other file.

---

## 15. `listNodeLabels` uses a single-query alignment fetch

**Location:** `api/src/ontology/storage/node-labels.ts → listNodeLabels`

Alignments are fetched inline via `OPTIONAL MATCH … collect(DISTINCT a)` in
the same query that fetches the label rows — matching the pattern in
`listEdgeTypes`. This avoids an N+1 pattern (one `listAlignments()` call per
label row).

**Rule:** Never call `listAlignments()` inside a per-row loop in a list query.
Instead, use `OPTIONAL MATCH (…)<-[:ALIGNS]-(a:_OntologyAlignment) WITH …
collect(DISTINCT a) AS alignments` and map the collected nodes in application
code.

---

## Open technical debt (not yet fixed)

| Issue | File | Notes |
|---|---|---|
| `getDriver()` global singleton | `api/src/neo4j/driver.ts` | Correct fix: inject driver via `route(req, driver)`. Requires updating all storage call sites. |
| SSE endpoint unimplemented | `api/src/router.ts` | `_OntologyEvent` rows are written but `GET /api/v1/ontology/events` SSE route is not yet registered. Replay via `Last-Event-ID` index on `_OntologyEvent.ts` is ready. |
| Migration executor unimplemented | `api/src/routes/` | `POST /api/v1/ontology/migrations` route and executor are missing. Without it, `assertDeletePreconditions` will block deletion of any entity that has ever been marked deprecated. |
| Rollback executor unimplemented | `api/src/routes/` | `POST /api/v1/ontology/rollback` and `rollback_orphans` / `rollback_below_bootstrap` error codes have no implementation. |
| `assertEndpointLabelsExist` N+1 | `api/src/ontology/storage/edge-types.ts` | Issues one query per distinct label. Fix: `WHERE l.name IN $names` single query. |
| `new Function` schema size | `api/src/ontology/cache/attribute-zod.ts` | No size limit on `json_schema_doc`. A deeply nested properties tree can generate an unbounded code string. Add a max-depth or max-size check at register time in `jsonSchemaDocSchema`. |
| `exactOptionalPropertyTypes` violations | `Journey.tsx`, `JourneyGraph.tsx`, `App.tsx` | Pre-existing, widespread. Requires auditing all optional properties across the PWA. |
| No GET request deduplication | `pwa/src/api.ts` | Rapid tab navigation causes concurrent redundant requests. A simple in-memory cache keyed by URL with TTL = poll interval would prevent this. |
