---
feature: "graph-core"
created: "2026-05-22"
author: "frank"
status: "approved"
approved_by: "frank"
approved_at: "2026-05-22"
revision: 3
reviewing_requirements_revision: 4
size: "large"
---

# Design: graph-core

## 1. Overview

`graph-core` introduces a Bun + TypeScript monorepo with three workspaces
(`api/`, `pwa/`, `shared/`), a containerised Neo4j 5 Community store, an
HTTP API mounted at `/api/v1/*`, and a placeholder React PWA shell. The
design follows three rules:

1. **Schema is registry-driven.** The six node labels and six edge types
   are declared as `const` tuples in `shared/`; everything else
   (constraints bootstrap, validator, OpenAPI shape, seed schema, stats
   key set) reads from those registries so that adding a node/edge type
   later (in `ontology-manager`) is a one-line change.
2. **Read-only Cypher passthrough relies on Neo4j's native
   read-transaction mode as the single authoritative gate.** The driver
   raises `Neo.ClientError.Statement.AccessMode` for any write primitive
   in a read transaction, so we deliberately do **not** maintain a
   parallel regex blacklist (pass-1 C-04 — regex would false-positive on
   keywords in string literals). Row caps are enforced **mid-stream**
   via the driver's `subscribe()` API with a per-record counter, not
   after materialisation (pass-1 C-01).
3. **Three storage helpers, not one** — `createNode` (strict CREATE,
   surfaces `409 id_conflict`), `patchNode` (partial SET, never clobbers
   omitted fields), and `upsertNode` (MERGE-on-id; used only by `/import`
   and the seed loader). POST is strict-create — making `409 id_conflict`
   reachable (pass-1 B-02) and PATCH partial-safe (pass-1 B-01).
   Re-running the seed yields zero new rows (NFR-04 / AC-08).

This spec ships no interactive graph rendering, no ontology CRUD, no
chat, no analytics, and no auth. Those are the four named follow-up specs
(`ontology-manager`, `process-explorer-ui`, `chat-interface`,
`cto-analytics`).

## 2. Prior-review concerns — resolution in this design

### 2.1 Requirements pass-2 concerns

**Pass-2 C-01 (AC-22 grep over-broad).** The `no-auth` grep is implemented
as a dedicated test (`api/__tests__/no-auth-grep.test.ts`) rather than a
free-form shell `grep`, with a tightened pattern. See §6.4.

**Pass-2 C-02 (FR-12 label-pair whitelist).** The edge validator is
table-driven by `EDGE_ENDPOINTS` (§3.2). Any `(type, fromLabel, toLabel)`
combination not in the table is rejected with
`400 {error:{code:"edge_endpoint_label_mismatch",…}}`. See §4.2 + §6.2.

### 2.2 Design pass-1 review findings — resolution in revision 2

**B-01 (PATCH clobbered omitted fields).** §3.1 now declares a separate
`nodeUpdateSchema` (all fields optional). §4.1 splits the storage layer
into three helpers: `createNode` (strict CREATE), `patchNode` (partial
SET with dynamic clause), and `upsertNode` (MERGE-on-id; used only by
`/import` and the seed loader). §5.1 routes POST → `createNode`, PATCH
→ `patchNode`, `/import` → `upsertNode`.

**B-02 (`id_conflict` unreachable).** POST is now strict CREATE: a
client-supplied `id` that already exists for the same `(label, id)`
surfaces Neo4j's `Neo.ClientError.Schema.ConstraintValidationFailed`
as `409 id_conflict`. Idempotency is still guaranteed for `/import` via
`upsertNode`.

**C-01 (raw Cypher row cap is post-materialisation).** §5.4 now uses
the driver's streaming consumer (`result.subscribe`) with a per-record
counter and `result.cancel()` at record 1001 — the cap fires mid-stream,
not after materialisation.

**C-02 (`findPath` needs search-time cap).** §5.1 + §5.4 now pin
`findPath` to `shortestPath` (single shortest path, O(V+E)) with a per-query
5 s timeout via transaction config. Multi-path search is out of scope
for this spec — callers wanting "all shortest paths" use the Cypher
passthrough at their own risk.

**C-03 (bulk-import phase-1 silence).** §4.3 specifies collect-and-continue
for both phases. Per-node failures in phase 1 are collected; phase 2
still runs for edges whose endpoints are valid. An edge whose
`fromId`/`toId` was in the payload but failed phase 1 surfaces as
`edge_endpoint_missing` with `details.phase: 1` so the client can
distinguish from a "node never existed" case.

**C-04 (Cypher pre-flight regex false-positives).** §5.4 drops the
regex entirely. `executeRead` + the driver's `Neo.ClientError.Statement.AccessMode`
error is the sole defence. AC-10 test list adds a `MATCH (n {name: "CREATE INDEX"}) RETURN n`
case to lock the absence of regex regression.

**C-05 (`:label` URL param not validated).** §5.5 (new) specifies the
canonical `parseLabel(s): NodeLabel | null` helper in
`api/src/routes/_helpers.ts`. Every node-route handler MUST call it on
`req.params.label` before invoking storage; failure surfaces
`400 unknown_label`.

**C-06 (integration tests excluded from CI).** §11 now ships **two**
CI jobs: `unit` (typecheck + `bun test` for `*.test.ts`) and `integration`
(GitHub Actions `services: neo4j` block + `bun test:integration`). 12+
ACs that were unverified per PR now run on every PR.

**C-07 (compose `NEO4J_AUTH` wiring + first-run footgun).** §8.3 (new)
specifies the `docker-compose.yml` shape — `NEO4J_AUTH=${NEO4J_USER}/${NEO4J_PASSWORD}`
from `.env` — and `.env.example` ships with `NEO4J_PASSWORD=companygraph_dev`
(literal "neo4j" is refused by Neo4j and would silently break the
dev-loop). `wait-for-neo4j.sh` distinguishes auth-fail from
connection-refused with a hint string so the modal first-run mismatch
surfaces immediately.

**Nits absorbed inline.** N-01 (bun.lockb committed): §16 row updated.
N-02 (no-auth grep edge cases): §6.4 pattern + filter tightened with a
fixture for the documentation comment style. N-03 (216-combination
math): §6.2 + §15 AC-13 row rewritten. N-04 (`parse_error` mapping):
§5.1 + §5.4 + §5.3 list it explicitly. N-05 (attributes_json round-trip):
§3.1 spelling-out paragraph + §3.2 cross-reference.

### 2.3 Requirements revision 4 — gap-closure additions

Requirements revision 4 added FR-16 (OpenAPI 3.1), FR-17 (bulk JSON
export), FR-18 (NDJSON streaming export), FR-20 (dry-run import), and
NFR-11 (v1↔v2 parallel-support policy). FR-19 (change feed) was deferred
to a separate follow-on spec `graph-core-change-feed`. Design revision 3
maps the five new items as follows:

- **FR-16 (OpenAPI 3.1)** — new `api/src/routes/openapi.ts`. Boot-time
  generator: registers every zod schema (`nodeCreateSchema`,
  `nodeUpdateSchema`, `nodeReadSchema`, `edgeCreateSchema`,
  `edgeReadSchema`, `importPayloadSchema`, `importResponseSchema`,
  `errorEnvelopeSchema`) with `@asteasolutions/zod-to-openapi`, walks
  the `Route` registry (§5.1 becomes data, not prose), emits a static
  OpenAPI 3.1 document cached in memory. Served via
  `GET /api/v1/openapi.json` (§5.7).
- **FR-17 (bulk JSON export)** — new `api/src/routes/export.ts`,
  `handleExportJson`. Cypher `MATCH (n) RETURN labels(n)[0] AS label, n ORDER BY n.id` +
  `MATCH (a)-[r]->(b) RETURN type(r) AS type, r, a.id AS fromId, b.id AS toId ORDER BY r.id`.
  Buffered response. Deterministic ordering by `id` ASC. Round-trip
  property verified by AC-25.
- **FR-18 (NDJSON streaming export)** — same `export.ts`,
  `handleExportNdjson`. Streams via the driver's `observer.subscribe`
  pattern (same primitive as §5.4's row-cap), emitting one line per
  record with `Bun.write` direct to the response stream. `Content-Type: application/x-ndjson`.
- **FR-20 (dry-run import)** — `routes/import.ts` accepts `?dryRun=true`
  query param. Wraps phase 1 + phase 2 in a single explicit
  `session.beginTransaction()` then calls `tx.rollback()` regardless of
  outcome (instead of `tx.commit()`). Response shape identical to the
  normal import. New error code (none — uses existing codes).
- **NFR-11 (versioning policy)** — pure documentation. README + new
  CLAUDE.md gain a "Versioning" section with the 3-month parallel-support
  commitment.

The five new AC test files (AC-24..AC-28) are listed in §15. The five
new + modified source files are in §16.

## 3. Data model

### 3.1 Node labels — `shared/src/schema/nodes.ts`

```ts
export const NODE_LABELS = [
  "Domain",
  "UserJourney",
  "Activity",
  "Role",
  "System",
  "Location",
] as const;
export type NodeLabel = (typeof NODE_LABELS)[number];

// Three zod schemas per FR-03 — one canonical shape, three usage modes:
//
//   nodeCreateSchema  →  POST /api/v1/nodes/:label and POST /api/v1/import
//   nodeUpdateSchema  →  PATCH /api/v1/nodes/:label/:id
//   nodeReadSchema    →  shape returned to clients
//
// Idempotent re-import requires `id` to be acceptable as client-supplied
// on create, so it is `.optional()` on createSchema (server generates if absent).
// PATCH never accepts `id` (path param is authoritative).

const uuidv7 = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
);

export const nodeCreateSchema = z.object({
  id: uuidv7.optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  attributes: z.record(z.unknown()).default({}),
});

export const nodeUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  attributes: z.record(z.unknown()).optional(),
}).strict();   // reject `id`, `createdAt`, `updatedAt` from client

export const nodeReadSchema = z.object({
  id: uuidv7,
  label: z.enum(NODE_LABELS),
  name: z.string(),
  description: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  attributes: z.record(z.unknown()),
});
```

**Storage representation vs. REST contract.** Neo4j cannot store arbitrary
nested maps as a single property, so the storage layer keeps an
`attributes_json` STRING property on each node. The REST boundary
**always** uses the parsed `attributes` object — request bodies accept
the object, responses return the object. The JSON ↔ string conversion
happens exclusively inside `storage/nodes.ts` (§4.1) and never leaks to
clients (resolves design-review N-05). Same contract applies to edges
(§3.2).

### 3.2 Edge types — `shared/src/schema/edges.ts`

```ts
export const EDGE_TYPES = [
  "PART_OF",          // Journey→Domain, Activity→Journey, Location→Location
  "EXECUTES",         // Role→Activity
  "USES_SYSTEM",      // Activity→System
  "AT_LOCATION",      // Activity→Location
  "PRECEDES",         // Activity→Activity
  "INTEGRATES_WITH",  // System→System
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

// (type) → array of allowed [fromLabel, toLabel] tuples. Drives validator.
export const EDGE_ENDPOINTS = {
  PART_OF: [
    ["UserJourney", "Domain"],
    ["Activity", "UserJourney"],
    ["Location", "Location"],
  ],
  EXECUTES:        [["Role", "Activity"]],
  USES_SYSTEM:     [["Activity", "System"]],
  AT_LOCATION:     [["Activity", "Location"]],
  PRECEDES:        [["Activity", "Activity"]],
  INTEGRATES_WITH: [["System", "System"]],
} as const satisfies Record<EdgeType, ReadonlyArray<readonly [NodeLabel, NodeLabel]>>;

export const edgeCreateSchema = z.object({
  id: uuidv7.optional(),
  type: z.enum(EDGE_TYPES),
  fromId: uuidv7,
  toId: uuidv7,
  attributes: z.record(z.unknown()).default({}),
});

export const edgeReadSchema = edgeCreateSchema.extend({
  id: uuidv7,
  createdAt: z.string().datetime(),
});
```

Neo4j storage: `(a)-[r:EDGE_TYPE {id, createdAt, attributes_json}]->(b)`.
Edge `id` (UUIDv7) is the MERGE key in `/import`; in strict POST it's
the conflict key (§4.2). Same JSON-string-at-storage / parsed-object-at-REST
contract as nodes (§3.1).

### 3.3 Constraints + indexes — `api/src/neo4j/bootstrap.ts`

Iterates `NODE_LABELS` and `EDGE_TYPES`:

```cypher
-- For each label L in NODE_LABELS:
CREATE CONSTRAINT node_id_unique_<L> IF NOT EXISTS
  FOR (n:<L>) REQUIRE n.id IS UNIQUE;
CREATE INDEX node_name_<L> IF NOT EXISTS
  FOR (n:<L>) ON (n.name);

-- For each type T in EDGE_TYPES:
CREATE CONSTRAINT edge_id_unique_<T> IF NOT EXISTS
  FOR ()-[r:<T>]-() REQUIRE r.id IS UNIQUE;
```

All `IF NOT EXISTS`, so safe to re-run (AC-04). Bootstrap runs on server
start; `bun run schema:apply` is an explicit alias.

### 3.4 UUIDv7 — `api/src/ids.ts`

Implementation uses the `uuid` package's `v7` export (Node-compatible,
Bun-compatible). Lexicographic ordering is guaranteed by the timestamp
prefix; AC-21 asserts monotonicity over a 5 ms window with a regex match.

## 4. Storage operations

### 4.1 Node storage — three helpers, one canonical layer

`api/src/storage/nodes.ts` exports three distinct helpers. Every route
handler uses exactly one of them; never mix them.

```ts
// POST /api/v1/nodes/:label — strict CREATE. 409 on duplicate id.
async function createNode(label: NodeLabel, input: NodeCreateInput): Promise<Node> {
  const id = input.id ?? uuidv7();
  const now = new Date().toISOString();
  const props = {
    id, name: input.name,
    description: input.description ?? "",
    createdAt: now, updatedAt: now,
    attributes_json: JSON.stringify(input.attributes ?? {}),
  };
  try {
    const result = await session.executeWrite(tx =>
      tx.run(`CREATE (n:${label} $props) RETURN n`, { props })
    );
    return deserializeNode(label, result.records[0].get("n"));
  } catch (e) {
    if (isConstraintViolation(e)) {
      throw new ValidationError("id_conflict", { id, label });
    }
    throw e;
  }
}

// PATCH /api/v1/nodes/:label/:id — strict partial update. 404 if missing.
async function patchNode(
  label: NodeLabel, id: string, input: NodeUpdateInput,
): Promise<Node> {
  // Build SET clause from defined keys only — never clobber omitted fields.
  const sets: string[] = ["n.updatedAt = $updatedAt"];
  const params: Record<string, unknown> = {
    id, updatedAt: new Date().toISOString(),
  };
  if (input.name !== undefined)        { sets.push("n.name = $name");                 params.name = input.name; }
  if (input.description !== undefined) { sets.push("n.description = $description");   params.description = input.description; }
  if (input.attributes !== undefined)  { sets.push("n.attributes_json = $attrsJson"); params.attrsJson = JSON.stringify(input.attributes); }

  const result = await session.executeWrite(tx =>
    tx.run(
      `MATCH (n:${label} {id: $id})
       SET ${sets.join(", ")}
       RETURN n`,
      params
    )
  );
  if (result.records.length === 0) throw new ValidationError("not_found", { label, id });
  return deserializeNode(label, result.records[0].get("n"));
}

// POST /api/v1/import (and seed loader only) — idempotent MERGE-on-id.
async function upsertNode(label: NodeLabel, input: NodeCreateInput): Promise<Node> {
  const id = input.id ?? uuidv7();
  const now = new Date().toISOString();
  const props = {
    id, name: input.name,
    description: input.description ?? "",
    createdAt: now, updatedAt: now,
    attributes_json: JSON.stringify(input.attributes ?? {}),
  };
  const result = await session.executeWrite(tx =>
    tx.run(
      `MERGE (n:${label} {id: $id})
       ON CREATE SET n = $props
       ON MATCH  SET n.name = $props.name,
                     n.description = $props.description,
                     n.updatedAt = $props.updatedAt,
                     n.attributes_json = $props.attributes_json
       RETURN n`,
      { id, props }
    )
  );
  return deserializeNode(label, result.records[0].get("n"));
}
```

**Why three?** B-01 of design-review pass 1 showed that one `upsertNode`
cannot serve both create + partial-update — partial PATCH clobbers
omitted fields. B-02 showed that POST-as-upsert hides
`Neo.ClientError.Schema.ConstraintValidationFailed` and makes
`409 id_conflict` unreachable. The three helpers correspond to three
distinct semantic intents; the route table (§5.1) pins which one each
handler uses.

**Label interpolation safety.** `label` is type-narrowed to `NodeLabel`
at every callsite. The narrowing is enforced at runtime by `parseLabel`
(§5.5) — every node-route handler MUST call `parseLabel(req.params.label)`
before invoking these helpers. A `string` from a URL param cannot reach
the Cypher template without first passing `parseLabel`.

### 4.2 Edge storage — `createEdge` (strict) and `upsertEdge` (import-only)

Same shape as nodes: strict CREATE for POST, MERGE for `/import`. Both
funnel through the same validator (endpoint existence + label whitelist
+ optional `phase` tag).

```ts
// Shared validator — runs before either Cypher path.
async function validateEdge(
  input: EdgeCreateInput,
  ctx?: { phase: 1 | 2 },   // populated when called from /import phase 2
): Promise<{ fromLabel: NodeLabel; toLabel: NodeLabel }> {
  const [fromLabel, toLabel] = await Promise.all([
    lookupNodeLabel(input.fromId),
    lookupNodeLabel(input.toId),
  ]);
  if (!fromLabel) throw new ValidationError("edge_endpoint_missing",
    { side: "fromId", id: input.fromId, ...(ctx ? {phase: ctx.phase} : {}) });
  if (!toLabel) throw new ValidationError("edge_endpoint_missing",
    { side: "toId",   id: input.toId,   ...(ctx ? {phase: ctx.phase} : {}) });

  const allowed = EDGE_ENDPOINTS[input.type];
  if (!allowed.some(([f, t]) => f === fromLabel && t === toLabel)) {
    throw new ValidationError("edge_endpoint_label_mismatch", {
      type: input.type, fromLabel, toLabel, allowed,
    });
  }
  return { fromLabel, toLabel };
}

// POST /api/v1/edges — strict CREATE. 409 on duplicate id.
async function createEdge(input: EdgeCreateInput): Promise<Edge> {
  await validateEdge(input);
  const id = input.id ?? uuidv7();
  try {
    const result = await session.executeWrite(tx =>
      tx.run(
        `MATCH (a {id: $fromId}), (b {id: $toId})
         CREATE (a)-[r:${input.type} {id: $id, createdAt: $now, attributes_json: $attrs}]->(b)
         RETURN r, a, b`,
        { id, fromId: input.fromId, toId: input.toId,
          now: new Date().toISOString(),
          attrs: JSON.stringify(input.attributes ?? {}) }
      )
    );
    return deserializeEdge(input.type, result.records[0]);
  } catch (e) {
    if (isConstraintViolation(e)) {
      throw new ValidationError("id_conflict", { id, type: input.type });
    }
    throw e;
  }
}

// POST /api/v1/import phase 2 — idempotent MERGE-on-id.
async function upsertEdge(input: EdgeCreateInput, phase: 1 | 2 = 2): Promise<Edge> {
  await validateEdge(input, { phase });
  const id = input.id ?? uuidv7();
  const result = await session.executeWrite(tx =>
    tx.run(
      `MATCH (a {id: $fromId}), (b {id: $toId})
       MERGE (a)-[r:${input.type} {id: $id}]->(b)
       ON CREATE SET r.createdAt = $now, r.attributes_json = $attrs
       ON MATCH  SET r.attributes_json = $attrs
       RETURN r, a, b`,
      { id, fromId: input.fromId, toId: input.toId,
        now: new Date().toISOString(),
        attrs: JSON.stringify(input.attributes ?? {}) }
    )
  );
  return deserializeEdge(input.type, result.records[0]);
}
```

`input.type` is enum-narrowed at the zod boundary (`z.enum(EDGE_TYPES)`),
so the runtime guarantees the relationship-type interpolation is one of
the six registry values. No path for arbitrary client strings to reach
the Cypher template.

### 4.3 Bulk import — two-phase, collect-and-continue

`POST /api/v1/import` accepts `{nodes: NodeCreateInput[], edges: EdgeCreateInput[]}`.

**Phase 1: nodes.** Each node is upserted via `upsertNode`. Failures
(zod validation, label-vs-payload mismatch, MERGE error) are caught
per-row and pushed to a `phase1Errors[]` array; the loop continues. A
phase-1 failure for `nodes[i]` does NOT abort phase 2 — but does NOT
register the failed node's `id` in the DB, so any edge referencing it
in phase 2 will surface as `edge_endpoint_missing` with
`details.phase: 1` (see §4.2 `validateEdge`).

**Phase 2: edges.** Each edge is upserted via `upsertEdge(input, 2)`.
Same collect-and-continue.

**Response shape:**

```ts
{
  imported: { nodes: number, edges: number },         // success counts
  errors?: Array<{
    section: "nodes" | "edges",
    index: number,                                    // index in payload array
    code: string,                                     // ERROR_CODES member
    message: string,
    details: Record<string, unknown> & {
      phase?: 1 | 2,                                  // present on phase-2 errors caused by phase-1 failure
    },
  }>,
}
```

HTTP status: `200` if any rows imported (with `errors?` populated when
partial); `400` if zod parsing of the envelope itself fails.

**Idempotency:** Re-running the same payload yields zero new rows
(`MERGE` is idempotent on `id`). NFR-04 / AC-08 verify.

## 5. HTTP API surface

All routes mounted under `/api/v1/`. Router is a simple dispatch table in
`api/src/router.ts` — no framework dependency beyond Bun's built-in
`Bun.serve`.

### 5.1 Route table (FR-06 / FR-07 / FR-11)

| Method | Path | Request | Success response | Errors | FR / AC |
|--------|------|---------|------------------|--------|---------|
| GET    | `/api/v1/healthz` | — | `{ok: true, neo4j: {connected, version}}` (200) | `503 {ok:false, neo4j:{connected:false}}` | FR-11 / AC-11 |
| GET    | `/api/v1/stats` | — | `{nodes:{<all 6 labels>}, edges:{<all 6 types>}}` (200) | `503` if DB unreachable | FR-11 / AC-12 |
| POST   | `/api/v1/nodes/:label` | `nodeCreateSchema` (§3.1) — `{id?, name, description?, attributes?}` | `Node` (201) | `400 invalid_payload`, `400 unknown_label`, `409 id_conflict` | FR-06 / AC-05 — routes to `createNode` |
| GET    | `/api/v1/nodes/:label/:id` | — | `Node` (200) | `400 unknown_label`, `404 not_found` | FR-06 / AC-05 |
| PATCH  | `/api/v1/nodes/:label/:id` | `nodeUpdateSchema` (§3.1) — `{name?, description?, attributes?}`, all optional, strict | `Node` (200) | `400 invalid_payload`, `400 unknown_label`, `404 not_found` | FR-06 / AC-05 — routes to `patchNode` |
| DELETE | `/api/v1/nodes/:label/:id` | — | (204) | `400 unknown_label`, `404 not_found`, `409 has_edges` (use `?cascade=true` to delete attached edges) | FR-06 / AC-05 |
| POST   | `/api/v1/edges` | `edgeCreateSchema` (§3.2) — `{id?, type, fromId, toId, attributes?}` | `Edge` (201) | `400 invalid_payload`, `400 edge_endpoint_missing`, `400 edge_endpoint_label_mismatch`, `409 id_conflict` | FR-06 / AC-06 / AC-13 — routes to `createEdge` |
| DELETE | `/api/v1/edges/:id` | — | (204) | `404 not_found` | FR-06 / AC-06 |
| POST   | `/api/v1/import` | `{nodes: nodeCreateSchema[], edges: edgeCreateSchema[]}` | `{imported:{nodes,edges}, errors?}` (200) | `400 invalid_payload` (envelope), else partial successes with `errors[]` (§4.3) | FR-06 / AC-07 / AC-08 — routes to `upsertNode` + `upsertEdge` |
| GET    | `/api/v1/query/listDomains` | — | `{rows: Domain[]}` | — | FR-07 / AC-09 |
| GET    | `/api/v1/query/getDomain/:id` | — | `{rows: [{domain, journeys}]}` | `404 not_found` | FR-07 / AC-09 |
| GET    | `/api/v1/query/getJourney/:id` | — | `{rows: [{journey, activities, roles, systems, locations}]}` | `404 not_found` | FR-07 / AC-09 |
| GET    | `/api/v1/query/getActivity/:id` | — | `{rows: [Activity]}` | `404 not_found` | FR-07 / AC-09 |
| GET    | `/api/v1/query/findPath` | `?fromId&toId&maxDepth=4` — **single shortest path** (Cypher `shortestPath((a)-[*..maxDepth]-(b))`); per-tx 5 s timeout | `{rows: PathRow[]}` (zero or one row) | `400 depth_exceeded` (maxDepth > 8), `400 query_timeout` | FR-07 / NFR-09 / AC-23 |
| GET    | `/api/v1/query/neighbors/:id` | `?depth=1` — variable-length within cap; Cypher-level `LIMIT 1001` | `{rows: NeighborRow[]}` | `400 depth_exceeded`, `400 result_truncated` | FR-07 / NFR-09 / AC-23 |
| POST   | `/api/v1/query/cypher` | `{statement, params?}` — executed via `executeRead`; row cap enforced mid-stream | `{rows: Record<string,unknown>[]}` | `400 write_statement_rejected` (from driver `AccessMode` error), `400 result_truncated`, `400 parse_error` (driver `SyntaxError`) | FR-07 / NFR-06 / AC-10 / AC-23 |
| GET    | `/api/v1/openapi.json` | — | OpenAPI 3.1 JSON document (cached at server boot) | `503 neo4j_unreachable` (boot did not complete) | FR-16 / AC-24 |
| GET    | `/api/v1/export` | — | `{nodes: Node[], edges: Edge[]}` — both arrays ordered by `id` ASC | — | FR-17 / AC-25 |
| GET    | `/api/v1/export.ndjson` | — | `Content-Type: application/x-ndjson` — one record per line, nodes first (by `id` ASC) then edges (by `id` ASC); each line is `{kind:"node", label, …}` or `{kind:"edge", type, …}` | — | FR-18 / AC-26 |
| POST   | `/api/v1/import?dryRun=true` | (same body as `/import`) | (same response as `/import`) but no data is written; final `tx.rollback()` instead of `tx.commit()` | (same as `/import`) | FR-20 / AC-27 |

### 5.2 Response envelope (NFR-05 / AC-20)

Single rule, no exceptions:

- 2xx with a single resource → the resource directly (e.g. `Node`, `Edge`).
- 2xx with multiple rows → `{rows: T[]}`.
- 2xx with no body → status 204, no body.
- 4xx / 5xx → `{error: {code: string, message: string, details?: object}}`.

`code` is a stable machine-readable string (the strings listed in the
route table). `message` is human prose, may change. `details` is shape-free
context (e.g. `{allowed: [...]}`).

### 5.3 Error code registry — `api/src/errors.ts`

Closed enum, exported, asserted exhaustive in `api/__tests__/envelope.test.ts`:

```ts
export const ERROR_CODES = [
  "invalid_payload",
  "unknown_label",
  "unknown_type",
  "edge_endpoint_missing",
  "edge_endpoint_label_mismatch",
  "id_conflict",
  "not_found",
  "has_edges",
  "depth_exceeded",
  "result_truncated",
  "query_timeout",
  "write_statement_rejected",
  "parse_error",
  "neo4j_unreachable",
] as const;
```

### 5.4 Cypher passthrough — safety + caps + mid-stream truncation

Design-review C-04 retired the pre-flight regex. The driver's read
transaction is the **sole** authority on what may execute.

#### Safety — single layer

Every passthrough request executes via:

```ts
await session.executeRead(
  tx => tx.run(stmt, params, { timeout: 5_000 })
);
```

- Neo4j 5 raises `Neo.ClientError.Statement.AccessMode` if the planned
  query contains any write op (`CREATE`, `MERGE`, `DELETE`, `DETACH`,
  `SET`, `REMOVE`, `DROP`, write `CALL`, `LOAD CSV`, `FOREACH`).
  Handler maps to `400 write_statement_rejected`.
- `Neo.ClientError.Statement.SyntaxError` → `400 parse_error` with
  `details.position`.
- Per-transaction `timeout: 5_000` (ms) caps total execution time. On
  timeout the driver raises a transient error; handler maps to
  `400 query_timeout`.

Keywords inside string literals (`MATCH (n {name: "CREATE INDEX"}) RETURN n`)
now execute normally — the planner sees a `MATCH … RETURN` and the
read-tx accepts it. AC-10's positive case list includes this fixture to
prevent regex regression.

#### Row cap — mid-stream truncation

The 1000-row cap (NFR-09 / AC-23) is enforced **during streaming**, not
after materialisation:

```ts
async function runPassthrough(stmt: string, params: object): Promise<RowResult> {
  return await session.executeRead(tx => new Promise((resolve, reject) => {
    const rows: Record<string, unknown>[] = [];
    const observer = tx.run(stmt, params, { timeout: 5_000 });
    observer.subscribe({
      onNext: (record) => {
        if (rows.length >= 1000) {
          observer.cancel();   // bolt sends RESET; no more records materialise
          reject(new ValidationError("result_truncated", { limit: 1000 }));
          return;
        }
        rows.push(record.toObject());
      },
      onCompleted: () => resolve({ rows }),
      onError: (err) => reject(mapDriverError(err)),
    });
  }));
}
```

This means a `MATCH (n) RETURN n` against a million-node graph stops at
record 1001 — only 1001 records are ever materialised into Bun memory.
Single source of truth for `runPassthrough` lives in
`api/src/neo4j/read-only-session.ts`.

#### Typed query helpers

`listDomains`, `getDomain`, `getJourney`, `getActivity`, `neighbors`
build Cypher statements internally and all use `runPassthrough` for
execution + cap enforcement — so the row cap is enforced uniformly.
Each helper additionally adds a Cypher-level `LIMIT 1001` to its
statement template (so the planner can short-circuit early); the
mid-stream cap is the backstop if the planner does not.

#### `findPath`

`findPath` uses single-shortest-path semantics (O(V+E)):

```cypher
MATCH p = shortestPath((a {id: $fromId})-[*..$maxDepth]-(b {id: $toId}))
RETURN p
```

- `maxDepth` is bounded by `1 ≤ n ≤ 8`; `> 8` → `400 depth_exceeded`.
- Per-tx 5 s timeout (same as passthrough); blow → `400 query_timeout`.
- Returns zero rows (no path within depth) or exactly one row.
- "All shortest paths" / "all paths" semantics are **out of scope** for
  this spec — callers needing those use `/api/v1/query/cypher` and accept
  the row cap + timeout.

AC-23 verifies all three boundaries.

### 5.5 URL param parsing — `api/src/routes/_helpers.ts`

Every node-route handler MUST run `parseLabel` on `req.params.label`
before invoking any storage helper. This is the runtime arm of the
"label interpolation safety" claim in §4.1.

```ts
import { NODE_LABELS, type NodeLabel } from "../../shared/src/schema/nodes";

export function parseLabel(s: unknown): NodeLabel | null {
  return typeof s === "string" && (NODE_LABELS as readonly string[]).includes(s)
    ? (s as NodeLabel) : null;
}

export function parseId(s: unknown): string | null {
  return typeof s === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s)
    ? s : null;
}
```

Handler skeleton:

```ts
export async function handleGetNode(req: Bun.Request): Promise<Response> {
  const label = parseLabel(req.params.label);
  if (!label) return error(400, "unknown_label", { label: req.params.label });
  const id = parseId(req.params.id);
  if (!id) return error(400, "invalid_payload", { fieldErrors: { id: ["malformed_uuid7"] } });
  // …safe to call getNode(label, id) — both args are now NodeLabel / UUIDv7.
}
```

No node-route handler may bypass this guard. Enforced by a code-review
checklist item and by `api/__tests__/url-param-guards.test.ts`:

```ts
// Probe every node route with a malicious label — none should reach storage.
for (const label of ["", "DROP", "Domain) WITH n DETACH DELETE n //", "domain"]) {
  const res = await fetch(`/api/v1/nodes/${encodeURIComponent(label)}/${someId}`);
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("unknown_label");
}
```

## 6. Validation pipeline — `api/src/validate.ts`

### 6.1 Zod entry point per route

Every handler starts:

```ts
const parsed = nodeCreateSchema.safeParse(await req.json());
if (!parsed.success) return error(400, "invalid_payload", parsed.error.flatten());
```

`zod` errors are normalised to `{error:{code:"invalid_payload", message,
details:{fieldErrors: {…}}}}` — one shape, regardless of which schema
failed.

### 6.2 Edge endpoint label whitelist (pass-2 C-02)

Implemented in `upsertEdge` (§4.2). For every `EDGE_TYPES` member, a
`(fromLabel, toLabel)` not in `EDGE_ENDPOINTS[type]` triggers
`edge_endpoint_label_mismatch` with `details.allowed` so the client can
correct.

Test (AC-06 / AC-13) iterates the full Cartesian product
**6 edge types × 6 from-labels × 6 to-labels = 216 combinations**.
Among these:

- **9 positive cases** — `sum(EDGE_ENDPOINTS[t].length over all t)` =
  `PART_OF`:3 + `EXECUTES`:1 + `USES_SYSTEM`:1 + `AT_LOCATION`:1 +
  `PRECEDES`:1 + `INTEGRATES_WITH`:1 + …  = **9**. The test asserts
  each `(t, fromLabel, toLabel)` from `EDGE_ENDPOINTS` succeeds.
- **207 negative cases** — the remaining 216 − 9 combinations all
  return `400 edge_endpoint_label_mismatch` with
  `details.allowed[]` populated from `EDGE_ENDPOINTS[t]`.

Implementation is a single nested loop over `EDGE_TYPES × NODE_LABELS ×
NODE_LABELS`; per-iteration the test consults `EDGE_ENDPOINTS[t]` to
decide whether to expect success or mismatch. Resolves design-review
N-03.

### 6.3 Edge endpoint existence (FR-12)

`lookupNodeLabel(id)` runs `MATCH (n {id:$id}) RETURN labels(n)[0] AS l`
and is single round-trip. Used by `upsertEdge`. If `id` returns no row →
`edge_endpoint_missing`.

### 6.4 No-auth grep (AC-22, pass-2 C-01)

Implemented as `api/__tests__/no-auth-grep.test.ts`:

```ts
import { execSync } from "node:child_process";
test("no auth code paths in production sources", () => {
  // Tight pattern: only flag identifiers that read as auth *concepts*.
  // Exclusions: Neo4j driver session, Vite proxy cookie passthrough,
  // intentional-absence comments tagged with NFR-08.
  const pattern =
    "\\b(" +
      "authorization\\s*[:=]|bearer\\s|" +
      "verify(Jwt|Token)\\b|" +
      "currentUser\\b|userId\\s*[:=]|tenantId\\s*[:=]|" +
      "(authenticate|authorize)\\(|" +   // call sites only
      "req\\.(user|auth|session)\\b" +
    ")";
  const out = execSync(
    `grep -rEn '${pattern}' api/src pwa/src --include='*.ts' --include='*.tsx' || true`,
    { encoding: "utf8" }
  );
  // Strip:
  //   - comments tagged `NFR-08`, `no-auth`, or `intentional: no auth` (broader allowlist)
  //   - jsdoc lines starting `*` that mention auth in prose
  const offending = out
    .split("\n").filter(Boolean)
    .filter(l => !/\/\/\s*(NFR-08|no[- ]auth|intentional:\s*no\s*auth)/i.test(l))
    .filter(l => !/^\s*\*\s/.test(l.split(":")[2] ?? ""));
  expect(offending).toEqual([]);
});
```

Pattern is curated to the *concepts* of auth, not the generic words.
`driver.session()` (no `req.` prefix), `Set-Cookie` (string literal, not
identifier), and prose mentions in jsdoc all slip through. Comment
allowlist accepts the three documented shapes; new ones must be added
deliberately.

## 7. PWA shell

### 7.1 Vite project — `pwa/`

- `vite.config.ts` declares dev-server port 5173 + proxy: `/api/v1` → `http://127.0.0.1:8787`.
- `index.html` mounts `<div id="root">`.
- `src/main.tsx` renders `<App />`.
- `src/App.tsx` (FR-09):
  - State: `{status: "connecting"|"ok"|"down", stats?: StatsResponse}`.
  - On mount → fetch `/api/v1/healthz` + `/api/v1/stats`.
  - `setInterval(pollOnce, 30_000)` while `document.visibilityState === "visible"`.
  - `addEventListener("visibilitychange", …)` toggles the interval; one fresh poll on each `visible` transition.
  - Renders: a status banner (green/red dot + "Connected"/"Disconnected"/"Connecting…") and an `<dl>` of `nodes.{label}: count` + `edges.{type}: count`.
- `src/api.ts` exports `getHealthz()`, `getStats()`; the only API consumers in this spec.

No router, no auth, no service worker. Service worker registration is deferred to `process-explorer-ui`.

### 7.2 Platform behaviour matches the requirements table

The shell is static markup + one banner. iPhone Safari, iPad Safari, macOS Safari (trackpad), macOS Chrome — all four exhibit identical behaviour because there is no gesture handling, no keyboard, no drag-drop. AC-14 manual test runs against each.

## 8. Schema bootstrap + runtime detect

### 8.1 Bootstrap — `api/src/neo4j/bootstrap.ts`

Runs at server startup:

```ts
export async function applySchema(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    for (const label of NODE_LABELS) {
      await session.run(`CREATE CONSTRAINT node_id_unique_${label} IF NOT EXISTS FOR (n:${label}) REQUIRE n.id IS UNIQUE`);
      await session.run(`CREATE INDEX node_name_${label} IF NOT EXISTS FOR (n:${label}) ON (n.name)`);
    }
    for (const type of EDGE_TYPES) {
      await session.run(`CREATE CONSTRAINT edge_id_unique_${type} IF NOT EXISTS FOR ()-[r:${type}]-() REQUIRE r.id IS UNIQUE`);
    }
  } finally { await session.close(); }
}
```

Idempotent (AC-04): re-running has no effect because every statement uses `IF NOT EXISTS`.

### 8.2 Container runtime detect — `scripts/runtime-detect.sh`

Probes `docker compose version`, `podman compose version`, `orbctl status` (in that order). Exports `COMPANYGRAPH_COMPOSE_CMD` so `bun run dev` invokes the right tool. On no match, prints:

```
companygraph: no compose runtime detected.
Tried: docker, podman, orb.
Install one of: Docker Desktop, OrbStack, colima, Podman 4+, Rancher Desktop.
See README §Development for details.
```

Exit 1. Driven by AC-15 / Risk #7.

### 8.3 docker-compose + `.env` wiring (design-review C-07)

`docker-compose.yml`:

```yaml
services:
  neo4j:
    image: neo4j:5-community
    environment:
      NEO4J_AUTH: "${NEO4J_USER:?missing NEO4J_USER in .env}/${NEO4J_PASSWORD:?missing NEO4J_PASSWORD in .env}"
      NEO4J_PLUGINS: "[\"apoc-core\"]"
      NEO4J_dbms_security_procedures_unrestricted: "apoc.*"
    ports:
      - "127.0.0.1:7687:7687"
      - "127.0.0.1:7474:7474"
    volumes:
      - companygraph_neo4j_data:/data
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:7474"]
      interval: 5s
      timeout: 3s
      retries: 30
volumes:
  companygraph_neo4j_data:
```

`.env.example`:

```env
# Neo4j credentials (Neo4j refuses the literal "neo4j" as a password —
# pick anything else, but match the API + compose values).
NEO4J_USER=neo4j
NEO4J_PASSWORD=companygraph_dev

# API binding (NFR-02 — loopback by default).
HOST=127.0.0.1
API_PORT=8787
```

`wait-for-neo4j.sh` polls bolt port AND verifies auth with a one-line
test query; if the port is open but auth fails it prints
`"Neo4j auth mismatch — check .env NEO4J_USER/NEO4J_PASSWORD vs docker-compose.yml"`
and exits 1, so the modal first-run failure (different creds between
compose and `.env`) surfaces with a clear hint.

### 8.4 `bun run dev` orchestration — `package.json`

```json
{
  "scripts": {
    "dev": "scripts/runtime-detect.sh && $COMPANYGRAPH_COMPOSE_CMD up -d neo4j && wait-for-neo4j.sh && concurrently -k 'bun --cwd api run dev' 'bun --cwd pwa run dev'",
    "stop": "$COMPANYGRAPH_COMPOSE_CMD down",
    "seed": "bun --cwd api run scripts/seed.ts ../shared/seed/retail-mini.json",
    "schema:apply": "bun --cwd api run scripts/schema-apply.ts",
    "typecheck": "bun build api/src/server.ts --no-bundle > /dev/null && bun build pwa/src/main.tsx --no-bundle > /dev/null",
    "test": "bun test"
  }
}
```

## 9. Logging — `api/src/logging.ts` (FR-13 / AC-18)

Single helper:

```ts
export function logRequest(entry: {
  ts: string; method: string; path: string;
  status: number; durationMs: number;
  cypherDurationMs?: number;
}): void { console.log(JSON.stringify(entry)); }
```

Server-level middleware wraps every request, records `performance.now()`
delta, and emits one line. Query handlers additionally measure Cypher time
via the driver result's `summary.resultAvailableAfter` and pass it as
`cypherDurationMs`.

## 10. Seed loader — `scripts/seed.ts` + `shared/seed/retail-mini.json`

`retail-mini.json` is the **exact fixture** declared in FR-08 — 4 domains
(Merchandising, Store Operations, Supply Chain, Customer/CRM), 8
journeys (2/domain), 32 activities (4/journey), 6 roles, 6 systems, 4
locations. All node ids are pre-allocated UUIDv7 strings so re-import is
idempotent (AC-08). Edge attributes are empty by default.

`scripts/seed.ts` POSTs the entire payload to `/api/v1/import`. The exact
counts in AC-07 derive from this fixture; if you add a node you must
update AC-07. (Intentional trade-off; tracked at the requirements layer.)

## 11. CI — `.github/workflows/ci.yml`

Design-review C-06 retired the "integration-tests-only-local" punt. CI
now ships two jobs gating every PR:

```yaml
name: ci
on: [push, pull_request]
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: docker compose config -q
      - run: bun test               # *.test.ts only (excludes *.integration.test.ts)

  integration:
    runs-on: ubuntu-latest
    services:
      neo4j:
        image: neo4j:5-community
        env:
          NEO4J_AUTH: neo4j/companygraph_ci_password
        ports:
          - 7687:7687
          - 7474:7474
        options: >-
          --health-cmd "wget -q --spider http://localhost:7474 || exit 1"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 30
    env:
      NEO4J_USER: neo4j
      NEO4J_PASSWORD: companygraph_ci_password
      NEO4J_URI: bolt://localhost:7687
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun test:integration   # *.integration.test.ts only
```

`package.json` `test` script targets `*.test.ts`; `test:integration`
targets `*.integration.test.ts`. The `integration` job uses GitHub
Actions' `services:` block to run a Neo4j sidecar with healthcheck — no
docker-compose inside CI, the service block handles wait-for-ready.

Budget: full CI run (both jobs in parallel) fits in <5 min on
`ubuntu-latest`. Unit feedback in <30 s; integration in <2 min once
Neo4j image is warm in the runner cache.

AC-16 is satisfied by both jobs being green on the PR. All 23 ACs that
have a test path are now exercised in CI.

## 12. `.claude/` cleanup (FR-15 / AC-17)

`.claude/CLAUDE.md` is rewritten. New structure:

```
# companygraph
## Architecture       (Bun monorepo, Neo4j, REST/PWA split)
## Schema             (6 node labels, 6 edge types, EDGE_ENDPOINTS matrix)
## Development        (one-command boot, runtime detection, test harness)
## Follow-up specs    (ontology-manager, process-explorer-ui, chat-interface, cto-analytics)
## Reference          (env vars, ports, key file paths)
```

`.claude/specs/_baseline/` is deleted — it documents an unrelated codebase
that never existed in this repo. `.claude/hooks/` and `.claude/skills/`
are left in place where applicable; spec-governance hooks continue to
work.

## 13. Security

- **No auth, intentionally.** NFR-08 + AC-22 lock this in. Bound to
  `127.0.0.1` (NFR-02 + AC-19) so the absence of auth is not internet-exposed.
- **Cypher passthrough cannot write** — `executeRead` is the single
  authoritative gate (§5.4). The driver raises `AccessMode` on any write
  primitive; the pre-flight regex was retired in design-review revision
  2 to avoid false-positives on keywords-in-literals.
- **Label / type / URL-param interpolation is type-narrowed at runtime**
  — `parseLabel` (§5.5) is the canonical guard for `:label` route
  segments; relationship types are narrowed by `z.enum(EDGE_TYPES)` at
  the zod boundary (§4.2). No path for client strings to reach Cypher
  templates.
- **Strict CREATE vs MERGE separation** — POST routes never `MERGE`, so
  `409 id_conflict` is honest and idempotency is reserved for
  `/import`'s collect-and-continue path.
- **Zod at every entry point** — payload shapes are validated before
  reaching storage; `nodeUpdateSchema.strict()` rejects unknown keys
  (`id`, `createdAt`, `updatedAt`) at PATCH time.

## 14. Error handling — realistic failures + responses

| Failure | Detection | Response | Recovery |
|---------|-----------|----------|----------|
| Neo4j container not running | Driver `Neo.TransientError.General.DatabaseUnavailable` on first call | `503 {error:{code:"neo4j_unreachable"}}` | `/healthz` returns `{ok:false}`; PWA shows red banner; operator runs `bun run dev` |
| Neo4j credentials wrong | Driver `Neo.ClientError.Security.Unauthorized` at driver init | Server exits 1 with stderr `"Neo4j auth failed — check .env NEO4J_PASSWORD"` | Fix `.env`, restart |
| Bulk import partial failure (phase 2) | Per-edge errors caught + collected | `200 {imported:{nodes:N, edges:E}, errors:[…]}` | Client decides whether to retry the failed edges |
| Client supplies a non-UUIDv7 id | Zod refinement fail | `400 invalid_payload` with `details.fieldErrors.id` | Client regenerates |
| Cypher write detected at runtime | `Neo.ClientError.Statement.AccessMode` from read-tx | `400 write_statement_rejected` | Client uses CRUD endpoints |
| Compose runtime missing | `runtime-detect.sh` exit 1 | Helpful stderr + exit | Operator installs one |
| Disk full / Neo4j store corruption | Driver error on first write | `503 {error:{code:"neo4j_unreachable", details:{cause:"<message>"}}}` | Operator inspects Neo4j logs (out of scope to remediate) |

## 15. Testing plan

| AC | Test file | Kind |
|----|-----------|------|
| AC-01 | manual (smoke ls) | manual |
| AC-02 | CI step `bun run typecheck` in `unit` job | unit |
| AC-03 | `api/__tests__/neo4j-bootstrap.integration.test.ts` | integration |
| AC-04 | `api/__tests__/schema.integration.test.ts` | integration |
| AC-05 | `api/__tests__/nodes-crud.integration.test.ts` (POST create / GET / PATCH partial-update + 404 / DELETE) | integration |
| AC-06 | `api/__tests__/edges-crud.integration.test.ts` | integration |
| AC-07 | `api/__tests__/import.integration.test.ts` | integration |
| AC-08 | `api/__tests__/import-idempotent.integration.test.ts` | integration |
| AC-09 | `api/__tests__/query-service.integration.test.ts` | integration |
| AC-10 | `api/__tests__/cypher-passthrough.integration.test.ts` — positive: `MATCH … RETURN`, plus literal-keyword fixture `MATCH (n {name: "CREATE INDEX"}) RETURN n`; negative: `CREATE`/`MERGE`/`SET`/`DELETE`/`CALL apoc.create.node` each return `400 write_statement_rejected` via driver `AccessMode` error | integration |
| AC-11 | `api/__tests__/healthz.integration.test.ts` | integration |
| AC-12 | `api/__tests__/stats.integration.test.ts` | integration |
| AC-13 | `api/__tests__/validation.integration.test.ts` — body validation (missing required, wrong type) + edge-endpoint label whitelist: iterates `EDGE_TYPES × NODE_LABELS × NODE_LABELS` (6×6×6 = **216** combinations) and asserts the 9 positive cases (sum of `EDGE_ENDPOINTS[t].length`) succeed and all other 207 return `400 edge_endpoint_label_mismatch` | integration |
| AC-14 | manual cross-platform smoke | manual |
| AC-15 | manual one-command boot | manual |
| AC-16 | live CI run (both jobs green) | automated |
| AC-17 | `api/__tests__/claude-md-content.test.ts` — reads `.claude/CLAUDE.md`, asserts title contains `companygraph`, four H2 sections present, four follow-up specs each cited at least once, forbidden strings absent | unit |
| AC-18 | `api/__tests__/request-logging.test.ts` | unit (mocks console) |
| AC-19 | `api/__tests__/bind-host.integration.test.ts` | integration (starts server, attempts non-loopback connect) |
| AC-20 | `api/__tests__/envelope.test.ts` | unit (mocks DB; iterates `ERROR_CODES` for exhaustive coverage) |
| AC-21 | `api/__tests__/id-format.test.ts` | unit |
| AC-22 | `api/__tests__/no-auth-grep.test.ts` (§6.4) | unit (grep over sources) |
| AC-23 | `api/__tests__/query-caps.integration.test.ts` — `findPath` `maxDepth=9` → `400 depth_exceeded`; `maxDepth=8` succeeds; raw passthrough `MATCH (n) RETURN n` against a >1000-node fixture cancels mid-stream and returns `400 result_truncated` with exactly 1001 records pulled (assert via driver telemetry); 5 s timeout test via a `apoc.util.sleep` Cypher snippet → `400 query_timeout` | integration |
| AC-24 | `api/__tests__/openapi.integration.test.ts` — `GET /api/v1/openapi.json`, validate against OpenAPI 3.1 JSON Schema via `@apidevtools/swagger-parser`, assert every §5.1 path is present, every `ERROR_CODES` member appears, and request/response shapes resolve to the same zod definitions (asserted by walking `$ref`s and comparing to the registry) | integration |
| AC-25 | `api/__tests__/export-import-roundtrip.integration.test.ts` — seed retail-mini → `GET /export` → save `A`; reset DB; `POST /import` with `A`; `GET /export` → save `B`; assert `A === B` (deep-equal with key-order normalisation) | integration |
| AC-26 | `api/__tests__/export-ndjson.integration.test.ts` — `GET /export.ndjson`; assert `Content-Type: application/x-ndjson`; assert line count = `Σ nodes + Σ edges` from `/stats`; each line parses as JSON; first N lines have `kind:"node"`, rest have `kind:"edge"`; within each section ordered by `id` ASC; assert response is streamed by checking that first byte arrives before the full set is materialised (instrument response timing) | integration |
| AC-27 | `api/__tests__/import-dryrun.integration.test.ts` — empty DB → `POST /import?dryRun=true` with retail-mini → assert `imported.nodes=32+…`, `imported.edges=…` matches non-dry-run; then `GET /stats` returns all zeros. Negative case: payload with one bad node + one good node → assert `errors[]` carries the bad row AND DB is still empty | integration |
| AC-28 | manual file inspection of `README.md` + `.claude/CLAUDE.md` for the v1→v2 parallel-support paragraph (FR-16/NFR-11 documentation) | manual |
| (extra) | `api/__tests__/url-param-guards.test.ts` (§5.5) — every node route probed with malicious `:label` (empty, lowercase, `Domain) WITH … //`); asserts `400 unknown_label` and that no malicious string reaches the Cypher template (driver mock asserts) | integration |
| (extra) | `api/__tests__/import-phase-errors.integration.test.ts` — payload with a bad phase-1 node + an edge referencing it; assert response carries `errors[]` with one entry for the bad node and one phase-2 entry with `details.phase: 1` for the edge | integration |

**CI gating.** All unit tests run in the `unit` job; all integration
tests run in the `integration` job. Both jobs gate every PR (§11).

## 16. File changes

| Path | Action | Brief | Maps to |
|------|--------|-------|---------|
| `package.json` | new | Workspace root + scripts | FR-01 / FR-10 |
| `tsconfig.json` | new | Base TS config | FR-01 |
| `bun.lockb` | new (generated; **committed**) | Bun lockfile — checked in for reproducible `bun install --frozen-lockfile` in CI (§11) | FR-01 |
| `.env.example` | new | NEO4J_USER / NEO4J_PASSWORD / API_PORT / HOST | FR-01 / FR-02 / NFR-02 |
| `.gitignore` | new | node_modules, .env, neo4j data dir | FR-01 |
| `README.md` | new | Quickstart, runtime matrix, spelling convention | FR-01 / NFR-03 / NFR-10 |
| `docker-compose.yml` | new | Neo4j 5 community + healthcheck + named volume | FR-02 |
| `.github/workflows/ci.yml` | new | install / typecheck / compose-config / test | FR-14 / AC-16 |
| `scripts/runtime-detect.sh` | new | Compose runtime probe | Risk #7 / AC-15 |
| `scripts/wait-for-neo4j.sh` | new | Polls bolt port until ready | FR-10 |
| `shared/package.json` | new | Workspace member | FR-01 |
| `shared/src/schema/nodes.ts` | new | `NODE_LABELS` + `nodeCreateSchema` + `nodeUpdateSchema` + `nodeReadSchema` | FR-03 / §3.1 / design-review B-01 |
| `shared/src/schema/edges.ts` | new | `EDGE_TYPES` + `EDGE_ENDPOINTS` + `edgeCreateSchema` + `edgeReadSchema` | FR-04 / §3.2 / pass-2 C-02 |
| `shared/src/types.ts` | new | `Node`, `Edge`, `NodeInput`, `EdgeInput` | FR-03 / FR-04 |
| `shared/seed/retail-mini.json` | new | Exact-count fixture | FR-08 |
| `api/package.json` | new | Workspace member | FR-01 |
| `api/tsconfig.json` | new | API TS config | FR-01 |
| `api/src/server.ts` | new | `Bun.serve` entry + bootstrap call | FR-01 / FR-10 |
| `api/src/router.ts` | new | Dispatch table for `/api/v1/*` | §5.1 |
| `api/src/env.ts` | new | Env parsing, defaults to loopback | NFR-02 / FR-10 |
| `api/src/errors.ts` | new | `ERROR_CODES` + helper | §5.3 / NFR-05 |
| `api/src/ids.ts` | new | UUIDv7 helper | NFR-07 / AC-21 |
| `api/src/logging.ts` | new | Structured JSON line emitter | FR-13 / AC-18 |
| `api/src/validate.ts` | new | Zod runners + `ValidationError` | FR-12 / §6.1 |
| `api/src/neo4j/driver.ts` | new | Lazy singleton driver | FR-02 |
| `api/src/neo4j/bootstrap.ts` | new | Registry-driven constraints + indexes | FR-05 / AC-04 |
| `api/src/neo4j/read-only-session.ts` | new | `executeRead` wrapper | NFR-06 / §5.4 |
| `api/src/storage/nodes.ts` | new | `createNode` (strict), `patchNode` (partial SET), `upsertNode` (MERGE; import-only), `getNode`, `deleteNode` | §4.1 / FR-06 / design-review B-01, B-02 |
| `api/src/storage/edges.ts` | new | `createEdge` (strict), `upsertEdge` (MERGE; import-only), `deleteEdge`, shared `validateEdge` | §4.2 / FR-12 / pass-2 C-02 / design-review B-02 |
| `api/src/routes/_helpers.ts` | new | `parseLabel`, `parseId` runtime URL-param guards | §5.5 / design-review C-05 |
| `api/src/routes/healthz.ts` | new | `/api/v1/healthz` | FR-11 / AC-11 |
| `api/src/routes/stats.ts` | new | `/api/v1/stats` | FR-11 / AC-12 |
| `api/src/routes/nodes.ts` | new | Node CRUD handlers | FR-06 / AC-05 |
| `api/src/routes/edges.ts` | new | Edge CRUD handlers | FR-06 / AC-06 |
| `api/src/routes/import.ts` | new | Bulk import handler + `?dryRun=true` flag (FR-20) | FR-06 / FR-20 / AC-07 / AC-08 / AC-27 |
| `api/src/routes/query.ts` | new | Typed query helpers + cypher passthrough | FR-07 / NFR-09 / AC-09 / AC-10 / AC-23 |
| `api/src/routes/openapi.ts` | new | Boot-time OpenAPI 3.1 generator + `GET /api/v1/openapi.json` handler | FR-16 / AC-24 |
| `api/src/routes/export.ts` | new | `GET /api/v1/export` (buffered JSON) + `GET /api/v1/export.ndjson` (streamed) handlers | FR-17 / FR-18 / AC-25 / AC-26 |
| `api/scripts/seed.ts` | new | Seed loader | FR-08 |
| `api/scripts/schema-apply.ts` | new | Standalone bootstrap runner | FR-05 |
| `api/__tests__/*.test.ts` | new | Unit + integration test files per §15 | every AC |
| `pwa/package.json` | new | Workspace member | FR-01 |
| `pwa/tsconfig.json` | new | PWA TS config | FR-01 |
| `pwa/vite.config.ts` | new | Vite + `/api/v1` proxy | FR-09 |
| `pwa/index.html` | new | App shell HTML | FR-09 |
| `pwa/src/main.tsx` | new | React mount | FR-09 |
| `pwa/src/App.tsx` | new | Connectivity banner + stats summary | FR-09 / AC-14 |
| `pwa/src/api.ts` | new | Typed API client | FR-09 |
| `.claude/CLAUDE.md` | rewrite | Replace inherited boilerplate | FR-15 / AC-17 |
| `.claude/specs/_baseline/` | delete | Remove unrelated baseline | FR-15 |

Total: **51** new files, **1** rewrite, **1** delete.

## 17. Open design questions — resolved

| Question (from requirements Risks) | Resolution in design |
|-----------------------------------|----------------------|
| 1. Graph renderer choice | Not in this spec — `process-explorer-ui` will decide. Design ships no renderer. |
| 2. Neo4j Enterprise migration | Out of scope. Community is sufficient for single-tenant retail org at this layer. |
| 3. Bun + `neo4j-driver` compatibility | Confirmed: `neo4j-driver` v5.x exposes a Web-compatible API that Bun's Node-compat layer runs unchanged. If a regression appears, fallback is `bun --target=node` for `api/`. Not a blocker. |
| 4. Cypher passthrough safety | Resolved via driver `executeRead` + per-tx timeout + mid-stream row cap (§5.4). Pre-flight regex retired in design-review revision 2 (was a false-positive footgun on keywords-in-literals); the driver's `AccessMode` error is the sole and sufficient gate. |
| 5. Schema evolution after `ontology-manager` | Bootstrap iterates `NODE_LABELS` + `EDGE_TYPES` registries; adding a type later is a one-line registry append + a new bootstrap pass. Designed for it. |
| 6. CLAUDE.md depth | §12 picks "authoritative but minimal" — five named H2 sections, factual content, ~3-5 KB target. Grows as features land. |
| 7. Container runtime matrix | `scripts/runtime-detect.sh` (§8.2). Pinned in Risks; AC-15 verifies. |

## 18. Risks introduced or remaining

| Risk | Severity | Mitigation |
|------|----------|------------|
| `MERGE` on edge `id` requires both endpoint nodes to exist; partial import payloads (nodes present but referenced node missing) produce per-edge errors. | low | Documented in §4.3; client gets `{errors:[…]}` with `details.phase` to disambiguate. |
| `attributes_json` serialisation hides nested-map types from Cypher queries (cannot index into a JSON string). | low | Accepted — analytics over `attributes.*` belongs to `cto-analytics` and may add per-key extraction at that layer. |
| `EDGE_ENDPOINTS` as `const` means adding a new endpoint pair requires a code change and a redeploy — not runtime configurable. | low | Intentional. `ontology-manager` will replace the `const` with a DB-backed registry. This spec is deliberately frozen. |
| Vite dev-server proxy is dev-only; production deployment is out of scope, so the PWA build path is undefined. | low | Out of scope per requirements. `process-explorer-ui` (or a deployment spec) picks it up. |
| Driver `executeRead` is the sole defence on Cypher passthrough write-rejection; if a future driver version weakens read-mode enforcement, write statements could leak through. | low | Acceptance test (AC-10) covers `CREATE`/`MERGE`/`SET`/`DELETE`/`CALL apoc.create.node` — driver upgrades that regress will fail CI. |
| `findPath` is single-shortest-path only; "all paths" / "all shortest paths" use cases are deferred. | low | Documented in §5.4. Callers needing more use the Cypher passthrough with timeout + row cap. |
| GitHub Actions `services: neo4j` startup adds ~30 s to the integration CI job per PR. | low | Acceptable budget; total CI < 5 min. If it grows, consider caching the neo4j image layer or switching to a long-lived runner. |
| Compose-file `NEO4J_AUTH` interpolates `.env` values via shell substitution at `docker compose up` time; if `.env` is missing the compose CLI fails with a `${NEO4J_USER:?missing …}` error. | low | The `${VAR:?msg}` form is explicit by design (§8.3) — failure message points the operator at the missing var. |
