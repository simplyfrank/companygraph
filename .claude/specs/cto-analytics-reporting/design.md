---
feature: "cto-analytics-reporting"
created: "2026-07-04"
author: "spec-author"
status: "approved"
size: "large"
reviewing_requirements_status: "approved (inherited from cto-analytics rev 3)"
depends_on: ["graph-core", "ontology-manager", "cto-analytics"]
note: "Requirements are inherited & pre-approved (FR-08/10/11/11a verbatim from cto-analytics RD-6). This design is the load-bearing NEW review — PDF byte-determinism, hash protocol, scheduler lock, cache/settings storage. status:revised — pass-1 review findings (B-01/B-02, C-01..C-05, N-01..N-03) absorbed; awaiting pass-2."
---

# Design: cto-analytics-reporting

## 1. Overview

This spec builds the **reporting + precompute** layer on top of the seven
live analytics report GETs that `cto-analytics` shipped. Four surfaces:

- **PDF pipeline** — a deterministic `pdfkit` generator + a hash-protocol
  module + the `GET /api/v1/analytics/exec-summary.pdf` endpoint + a thin
  PWA launcher view. Renders from a **cache snapshot**, not the live
  graph, so output is byte-reproducible.
- **Scheduler + cache** — a `node-cron` job that captures a graph
  snapshot and precomputes journey scores / system metrics / AI candidates
  into four `bun:sqlite` tables (isolated DB file), a Promise-mutex lock
  for `?refresh=true`, staleness detection, and ontology schema-coupling
  validation.
- **Settings + audit** — `analytics_settings` (one tunable row seeded from
  `cto-analytics`'s code-defaults) + `analytics_settings_audit`, with
  `GET`/`PATCH /api/v1/analytics/settings`.
- **Snapshot endpoint** — `GET /api/v1/analytics/snapshot/:last_run_at`
  returning the exact cache contents the PDF was hashed over.

Everything reuses `cto-analytics`'s compute engines
(`api/src/analytics/{complexity,consolidation,ai-candidates,system-map}.ts`)
— this spec **caches and renders** them; it does not re-implement them.
All graph reads obey RD-1 (via `api/src/neo4j/read-only-graph.ts` /
this spec's dedicated snapshot-capture query, never `getDriver()` inside
`api/src/analytics/`). No graph writes (NFR-03). This spec adds **no
per-route auth check** — the new routes ride the central router gate
(`api/src/router.ts` → `api/src/auth/`, per current CLAUDE.md); the
former "no auth code paths" rule (retired NFR-08/AC-22) is not invoked.
(Resolves: C-02.)

**File-layout choice (DD-01):** all new backend lands under
`api/src/analytics/reporting/` (a subdir of the RD-1 zone, so the
`analytics-no-direct-driver` / `analytics-no-write-imports` guard tests
already cover it). The three new REST handlers extend the existing
`api/src/analytics/routes.ts` dispatcher via a **new sibling module**
`api/src/analytics/reporting-routes.ts` (keeps the concurrent edit to
`routes.ts` minimal). The router mount is a **single, clearly-commented
block** in `api/src/router.ts` (a concurrent session is editing that file
— the block is fenced with `BEGIN/END cto-analytics-reporting` comments to
ease merge).

## 2. Design decisions (DD-*)

| ID | Decision | Serves | Rationale |
|----|----------|--------|-----------|
| **DD-01** | **File layout under `api/src/analytics/reporting/`.** New modules: `cache.ts`, `capture.ts`, `hash.ts`, `settings.ts`, `scheduler.ts`, `exec-summary.ts`. REST handlers in a new `api/src/analytics/reporting-routes.ts`. The router mount is one fenced block in `api/src/router.ts`. | all FRs | Subdir sits inside the RD-1/AC-11/AC-12 guard-test zone (`api/src/analytics/`) so the no-direct-driver + no-write-import invariants extend for free. A sibling routes module keeps the concurrent `routes.ts` edit tiny. |
| **DD-02** | **PDF library = `pdfkit`** (`bun add pdfkit @types/pdfkit`). Rejected `@react-pdf/renderer` (React reconciler pulls a heavier dep + its layout engine gives less control over the info-dict) and `puppeteer` (ships a headless Chromium — huge, non-deterministic fonts, wall-clock in the PDF). `pdfkit` is pure-JS, Bun-server-compatible, and exposes the low-level `PDFDocument` **constructor `info` option** needed to pin every non-deterministic field before the trailer `/ID` is computed (DD-03), plus the built-in standard-14 `Courier` face for the monospace hash footer. | FR-08, NFR-04 | Byte-determinism (NFR-04) is the load-bearing constraint; only a low-level library lets us pin CreationDate/ModDate/Producer/Creator **at construction** so pdfkit's `generateFileID` hashes fixed values. |
| **DD-03** | **PDF byte-determinism protocol** (see §5.3 in full). Every non-deterministic PDF internal is pinned. **(B-02, load-bearing) — all determinism-critical metadata is passed via the `PDFDocument` constructor `info` option, NOT set post-construction:** `new PDFDocument({ pdfVersion:"1.3", compress:false, autoFirstPage:true, margin:48, info:{ CreationDate:new Date(0), ModDate:new Date(0), Producer:"companygraph", Creator:"companygraph" } })`. pdfkit computes `this._id = PDFSecurity.generateFileID(this.info)` **in the constructor** from `info.CreationDate.getTime()` + `Producer` + other info fields, and `_finalize()` writes the trailer `/ID:[this._id,this._id]`; pinning the dates *after* `new PDFDocument()` is too late — `generateFileID` has already hashed the wall clock. So the info dict must be pinned at construction, which makes the trailer `/ID` a deterministic `md5(info)`-derived value. **Font: standard-14 `Courier`** (`doc.font("Courier")`) for body + monospace hash footer — **no `registerFont`, no embedded font, no subsetting, no vendored TTF asset** (OQ-1 RESOLVED). Courier is a non-embedded standard-14 face, so there is **no font stream in the PDF at all**, which removes the single biggest nondeterminism source (font-subset ordering, which NFR-04 names) and simplifies the determinism argument. `compress:false` removes zlib stream nondeterminism and makes the object stream stable + diffable. The only variable text is drawn from the cache row (`last_run_at`, the scores, the hash), all deterministic for a given snapshot. `/Subject` (the hash) may be set *after* construction — it does not feed `generateFileID`. | FR-08, NFR-04, AC-08 | pdfkit otherwise stamps wall-clock dates + a version-dependent Producer + a wall-clock-derived trailer `/ID`, which breaks byte-equality across two renders seconds apart. Resolves: B-01 (drop vendored TTF; standard-14 Courier), B-02 (pin info at construction so `/ID` is deterministic). |
| **DD-04** | **Hash protocol reuses `graph-core`'s `canonicalStringify`** (`api/src/storage/modules.ts`) for the recursive key-sort + number formatting (rules a/c/e/g), and layers the two analytics-specific rules on top in `hash.ts`: **rule (d)** parse `attributes_json` → object before canonicalising (so `{a:1,b:2}` ≡ `{b:2,a:1}`); **rule (f)** NFC-normalise every string; **rule (b)** sort `nodes`/`edges` by `id` ASC before serialising. Final: `createHash("sha256").update(serialised,"utf8").digest("hex")`. | FR-08, NFR-05, AC-09 | `canonicalStringify` already implements rules a/c/e/g (verified in `api/src/storage/modules.ts:37`). Reusing it avoids a second, drifting canonicaliser. The two deltas (attribute-parse, NFC) are analytics-specific and layered explicitly. |
| **DD-05** | **Dedicated snapshot-capture Cypher** in `capture.ts` — NOT the shared `read-only-graph.ts` `GRAPH_QUERY`. The capture query projects exactly the hash-basis fields: nodes `{id, label:labels(n)[0], attributes_json:n.attributes_json, updatedAt:n.updatedAt}`; edges `{id:r.id, type:type(r), fromId:startNode(r).id, toId:endNode(r).id, attributes_json:r.attributes_json, createdAt:r.createdAt}`. Runs via `runReadOnlyGraph()` (RD-1: read-only session, tx timeout, no direct driver). | FR-08, NFR-05 | The shared `GRAPH_QUERY` edge projection lacks edge `id`/`attributes`/`createdAt` and doesn't split node `updatedAt` — see requirements §Dependencies gap note. A capture query scoped to this module avoids perturbing the shared reader the other analytics modules depend on. |
| **DD-06** | **Cache = 5 tables in a separate SQLite file** (`ANALYTICS_DB_PATH`, default `./data/analytics.sqlite`), module-scoped singleton in `cache.ts` mirroring `api/src/chat/persistence.ts` (WAL, `CREATE TABLE IF NOT EXISTS` DDL). Tables: `analytics_run` (the run header carrying `last_run_at`, the captured `nodes_json`/`edges_json` snapshot, and `weights_json`), `analytics_journey_scores`, `analytics_system_metrics`, `analytics_ai_candidates`, `analytics_alerts`. Settings tables (`analytics_settings`, `analytics_settings_audit`) share the same DB file, owned by `settings.ts`. | FR-10, FR-11, FR-11a, NFR-R1 | Isolation from chat SQLite (NFR-R1). The run header stores the captured snapshot so the PDF + snapshot endpoint re-derive the hash from cache, never re-reading the live graph (byte-reproducibility). |
| **DD-12** | **`analytics_run` snapshot retention = rolling N=7 (OQ-2 RESOLVED).** At the end of each `writeRun()` (after the header + score rows are committed), prune the heavy snapshot blobs of all but the latest 7 runs: `UPDATE analytics_run SET nodes_json='', edges_json='' WHERE last_run_at NOT IN (SELECT last_run_at FROM analytics_run ORDER BY last_run_at DESC LIMIT 7)`. The run header + score tables are kept (cheap); only the multi-MB `nodes_json`/`edges_json` blobs are cleared beyond the window. `handleSnapshot` treats a pruned run (empty `nodes_json`) as **`404 not_found`** (reusing OQ-3's code — see §5.7), so the FR-11a re-derivation contract stays well-defined: only the 7 most recent runs are re-derivable. `N = SNAPSHOT_RETENTION = 7` is a module constant in `cache.ts`. | FR-10, FR-11a, NFR-R1 | Bounds the `analytics_run` blob growth OQ-2 flagged (a few MB per run at 10k nodes) while keeping the exec-summary + last-week's snapshots verifiable. Resolves: C-03. |
| **DD-07** | **Scheduler lock = a module-level Promise mutex** in `scheduler.ts`. `runPrecompute()` checks a module-scoped `inFlight: Promise<PrecomputeResult> | null`; if set, it returns that promise (concurrent `?refresh=true` awaits the in-flight run — single execution); else it creates the promise, runs the capture+compute+cache-write, and clears it in `finally`. | FR-10, AC-13 | Single-tenant, single-process → an in-process mutex is sufficient; no cross-process lock (Redis/file-lock) needed. Matches the requirements' recommended approach. |
| **DD-08** | **Settings row seeded from `cto-analytics` code-defaults.** On first `initAnalyticsDb()`, if `analytics_settings` is empty, insert one row with `depth_weight/system_weight/role_weight` from `ANALYTICS_COMPLEXITY_WEIGHTS`, `scheduler_cron="0 2 * * *"`, `pdf_brand_json="{}"`, and `ai_candidate_definition_json` from `ANALYTICS_AI_CANDIDATE_DEFINITION` (imported from `api/src/analytics/routes.ts`). Weights read by the precompute come from this row (making them tunable per FR-11) — but the row's initial values equal the code-defaults, so behaviour is unchanged until an operator PATCHes. | FR-11, AC-R1, design-tie §10.2 | Preserves the cto-analytics §10.2 contract: the shipped code-defaults become the seed. Complexity/AI engines still accept a weights/definition parameter, so the precompute passes the settings-row values in. |
| **DD-09** | **Audit `actor` = fixed sentinel `"local-operator"`.** This spec adds no per-route auth (single-tenant, loopback); a future auth backfill fills a real identity via the central router gate (`api/src/auth/`) without a schema migration. The `analytics_settings_audit.actor` column is populated with the sentinel today; the column exists so that backfill needs no DDL change. | FR-11, AC-17 | Requirements OQ-4. Keeps the audit-row shape stable and forward-compatible with the central router gate. Resolves: C-02. |
| **DD-10** | **Degraded envelope wiring is minimal + centralised.** A helper `withCacheEnvelope(body)` in `cache.ts` — **one argument** (the report body object) — reads `MAX(last_run_at)` from `analytics_run`, computes staleness (`now − last_run_at > 25 h`), and wraps the body as `{ ...body, ...(stale ? { degraded:true, last_run_at } : {}) }`. `api/src/analytics/routes.ts`'s `handleAnalyticsReport` gains a small edit: reports serve from cache (or trigger a refresh when `?refresh=true`), then pass through `withCacheEnvelope(body)`. The 7 report bodies are unchanged shapes; the flag rides inside the success envelope (NFR-08). | FR-10, AC-R3 | One helper + one small dispatcher edit avoids touching each of the 7 report modules. The flag never becomes an error (NFR-08). Single canonical signature `withCacheEnvelope(body)` — resolves: C-01 (§5.4 and T-01 already use this one-arg form; the DD is now aligned). |
| **DD-11** | **Router mount = one fenced block.** In `api/src/router.ts`, a single block guarded by `// BEGIN cto-analytics-reporting (FR-08/11/11a)` … `// END cto-analytics-reporting` mounts `GET analytics/exec-summary.pdf`, `GET analytics/settings`, `PATCH analytics/settings`, and `GET analytics/snapshot/:last_run_at`. Placed **above** the parameterized `analytics/([^/]+)` report match so the literal routes win (the report regex would otherwise swallow `settings`/`exec-summary.pdf`). | FR-08, FR-11, FR-11a | A concurrent session edits `router.ts`; the fenced, self-contained block minimises merge conflict surface. Ordering matters — the existing `analytics/([^/]+)` regex at router.ts:820 must not shadow the new literals. |

## 3. Open Questions (RESOLVED — pass-1 review)

All three OQs are now settled law (design-review pass 1). Their
resolutions are baked into the DDs above; recorded here for the audit
trail.

- **OQ-1 — PDF font. RESOLVED: standard-14 `Courier`, no vendored asset.**
  The PDF font is pdfkit's built-in standard-14 `Courier` (`doc.font("Courier")`)
  for both body and the monospace hash footer — monospace, non-embedded,
  inherently deterministic (nothing is subsetted into the file, so there
  is no font stream at all). **No vendored TTF, no `api/assets/fonts/`.**
  This overrules the earlier "vendor a TTF" recommendation. See DD-03.
  (Resolves: B-01.)
- **OQ-2 — `analytics_run` snapshot retention. RESOLVED: rolling N=7.**
  Keep the heavy `nodes_json`/`edges_json` blobs for only the latest 7
  runs; prune older runs' blobs at the end of each `writeRun()`. Score
  tables + run headers are kept. A pruned run's `/snapshot/:last_run_at`
  returns `404 not_found`. Mechanism + write path are DD-12 / §5.4 / §5.6;
  the task step is T-04. (Resolves: C-03.)
- **OQ-3 — `ERROR_CODES` additions. RESOLVED: none.** The snapshot
  endpoint's unknown-id case (and the pruned-run case, per DD-12) reuses
  `not_found`; `/settings` PATCH validation reuses `invalid_payload` via
  `parseWith`. No `ERROR_CODES` addition — the enum stays closed (NFR-R2).

## 4. Architecture

```
                          node-cron (api/src/server.ts)
                                    │  0 2 * * * (TZ), + on-demand ?refresh=true
                                    ▼
   ┌───────────────────────────────────────────────────────────────┐
   │ scheduler.ts  runPrecompute()  ── Promise-mutex lock (DD-07)   │
   │   1. captureSnapshot()  ── capture.ts ── runReadOnlyGraph()    │  RD-1
   │   2. validate AI-def keys vs GET /api/v1/schema (ontology-mgr) │
   │   3. compute: complexity/system-map/ai-candidates engines      │  reuse cto-analytics
   │   4. writeRun()  ── cache.ts ── analytics_* SQLite (DD-06)      │
   └───────────────────────────────────────────────────────────────┘
                                    │
             ┌──────────────────────┼───────────────────────────┐
             ▼                      ▼                            ▼
   exec-summary.pdf          7 report GETs                 /settings, /snapshot
   (exec-summary.ts +        (routes.ts + DD-10            (settings.ts,
    hash.ts, pdfkit)          withCacheEnvelope)            reporting-routes.ts)
             │
             ▼
   PWA launcher #/analytics/exec-summary/export → GET .../exec-summary.pdf → download
```

## 5. Component design

### 5.1 `hash.ts` — graph-state hash protocol (NFR-05, FR-08)

```ts
// api/src/analytics/reporting/hash.ts
import { createHash } from "node:crypto";
import { canonicalStringify } from "../../storage/modules"; // graph-core, rules a/c/e/g

// C-04: the canonical key is `attributes` — matching NFR-05 rule (d)'s stated
// key name — so an external verifier re-derives the same serialised form.
export interface HashNode { id: string; label: string; attributes: Record<string, unknown>; updatedAt: string; }
export interface HashEdge { id: string; type: string; fromId: string; toId: string; attributes: Record<string, unknown>; createdAt: string; }
export interface HashWeights { depth_weight: number; system_weight: number; role_weight: number; }
export interface HashInput { snapshot_id: string; nodes: HashNode[]; edges: HashEdge[]; weights: HashWeights; }

// rule (f): NFC-normalise every string, recursively.
// rule (g): LF-normalise every string VALUE — replace CRLF with LF before
//   hashing, so two snapshots differing only in `\r\n` vs `\n` inside a
//   node name / attribute value hash identically. (canonicalStringify /
//   JSON.stringify escape `\r`→`\\r` and `\n`→`\\n` distinctly, so without
//   this they would diverge — C-05.)
function normalizeString(s: string): string {
  return s.replace(/\r\n/g, "\n").normalize("NFC"); // rule (g) then rule (f)
}
function nfc(value: unknown): unknown {
  if (typeof value === "string") return normalizeString(value);
  if (Array.isArray(value)) return value.map(nfc);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) out[normalizeString(k)] = nfc((value as Record<string, unknown>)[k]);
    return out;
  }
  return value;
}

export function graphStateHash(input: HashInput): string {
  // rule (b): sort nodes/edges by id ASC before serialisation.
  const canonical = {
    snapshot_id: input.snapshot_id,
    nodes: [...input.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    edges: [...input.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    weights: input.weights,
  };
  // rules (a,c,d,e) via canonicalStringify (recursive key-sort, ECMAScript numbers,
  //   `attributes` already PARSED objects so rule (d) holds); rules (f) NFC + (g)
  //   value-CRLF→LF via the nfc()/normalizeString() wrapper applied first.
  const serialised = canonicalStringify(nfc(canonical));
  return createHash("sha256").update(serialised, "utf8").digest("hex"); // rule (h)
}
```

The `attributes` map is produced by the caller (capture/cache layer) by
`JSON.parse(attributes_json ?? "{}")` — that's rule (d)'s "parse before
canonicalise". `graphStateHash` receives already-parsed maps, so
`canonicalStringify`'s recursive key-sort covers nested attribute keys.
The serialised canonical key is `attributes` (C-04), matching NFR-05
rule (d) verbatim so AC-18's external re-derivation reproduces the exact
key an outside verifier serialises.

### 5.2 `capture.ts` — snapshot-capture read (DD-05, RD-1)

```ts
// api/src/analytics/reporting/capture.ts
import { runReadOnlyGraph } from "../../neo4j/read-only-graph"; // RD-1 — no getDriver()
export const SNAPSHOT_QUERY = `
  MATCH (n)
  RETURN { kind:'node', id:n.id, label:labels(n)[0], attributes_json:n.attributes_json, updatedAt:n.updatedAt } AS row
  UNION ALL
  MATCH (a)-[r]->(b)
  RETURN { kind:'edge', id:r.id, type:type(r), fromId:a.id, toId:b.id, attributes_json:r.attributes_json, createdAt:r.createdAt } AS row
`;
export interface CapturedSnapshot { nodes: HashNode[]; edges: HashEdge[]; }
export async function captureSnapshot(): Promise<CapturedSnapshot> { /* run SNAPSHOT_QUERY, parse attributes_json → attributes, partition */ }
```

Produces the exact `HashNode`/`HashEdge` shape `hash.ts` consumes. The
edge `id` comes from graph-core's edge `id` property (every edge carries
one); the parsed map is assigned to the `attributes` field (C-04):
`attributes = JSON.parse(attributes_json ?? "{}")`.

### 5.3 PDF byte-determinism (DD-03, NFR-04) — the load-bearing detail

`exec-summary.ts` builds the PDF as follows. Every enumerated step
removes a source of nondeterminism. **The construction shape is exact —
the info dict MUST be pinned in the constructor (B-02), not afterward:**

```ts
// B-02: pin ALL determinism-critical metadata in the constructor `info`
//   option. pdfkit computes the trailer /ID via
//   `this._id = PDFSecurity.generateFileID(this.info)` INSIDE this call
//   (from info.CreationDate.getTime() + Producer + …); _finalize() then
//   writes /ID:[this._id,this._id]. Assigning dates on the already-built
//   `doc` is too late — generateFileID has already hashed the wall clock.
const doc = new PDFDocument({
  pdfVersion: "1.3",
  compress: false,          // no zlib stream → stable, diffable object stream
  autoFirstPage: true,
  margin: 48,
  info: {
    CreationDate: new Date(0),  // fixed epoch, not wall-clock
    ModDate: new Date(0),
    Producer: "companygraph",   // fixed literal; default carries pdfkit version
    Creator: "companygraph",
  },
});
```

1. `PDFDocument` is constructed with `compress:false` (removes zlib
   nondeterminism, makes the byte diff auditable) and the pinned `info`
   dict above.
2. **Trailer `/ID` is now deterministic.** Because `CreationDate`/`ModDate`/
   `Producer`/`Creator` are pinned *at construction*, `generateFileID`
   hashes only fixed values, so the `md5(info)`-derived `/ID` array is
   stable across renders. **Do NOT assign the dates post-construction** —
   `generateFileID` will already have hashed `Date.now()` and AC-08(a)'s
   byte-equality (including the `/ID` bytes) fails. (B-02.)
3. (Producer/Creator are pinned via the constructor `info` above — no
   post-construction `doc.info.Producer = …`.)
4. `doc.info.Subject = graphStateHash(input);` — the canonical hash
   location (FR-08). `/Subject` does **not** feed `generateFileID`, so it
   is safe to set *after* construction.
5. **Font = standard-14 `Courier`:** `doc.font("Courier")` for the body
   and the monospace hash footer. **No `registerFont`, no embedded font,
   no vendored TTF (B-01).** Courier is a non-embedded standard-14 face,
   so the PDF carries **no font stream at all** — the biggest
   subsetting-order nondeterminism source is removed (OQ-1 RESOLVED).
6. Body text is drawn **only** from the cache row: the top-5 journey
   names + sub-scores, top-3 consolidation activities, top-3 AI
   candidates, and `last_run_at` — all deterministic for a given
   snapshot. No `Date.now()`, no random, no locale-formatted numbers
   (use `String(n)` / fixed `.toFixed`).
7. Page-1 footer, monospace (Courier): `graph-state hash: <hash> · cache snapshot: <last_run_at>`.
8. Collect the output into a single `Uint8Array` (`doc` piped to a
   buffer sink); return it. The endpoint sets
   `content-type: application/pdf` + `content-disposition: attachment`.

**Determinism test hook:** `renderExecSummaryPdf(snapshot): Promise<Uint8Array>`
is pure w.r.t. its `snapshot` argument — AC-08(a) renders it twice and
`deepEqual`s the **full byte stream, which includes the trailer `/ID`
array** (B-02). Because the byte-equality assertion compares the whole
`Uint8Array`, it covers `/ID` implicitly; the test adds an explicit note
(and may additionally grep the two renders' trailer for an identical
`/ID [...]`) so a future regression in construction-time pinning is
caught at the `/ID` bytes, not just visible fields.

### 5.4 `cache.ts` — cache tables + envelope helper (DD-06, DD-10)

DDL (`CREATE TABLE IF NOT EXISTS`, WAL, singleton — mirrors
`chat/persistence.ts`):

```sql
CREATE TABLE IF NOT EXISTS analytics_run (
  last_run_at TEXT PRIMARY KEY,   -- ISO; the snapshot_id
  nodes_json  TEXT NOT NULL,      -- captured HashNode[] (JSON)
  edges_json  TEXT NOT NULL,      -- captured HashEdge[] (JSON)
  weights_json TEXT NOT NULL,     -- the weights row used this run
  status TEXT NOT NULL CHECK (status IN ('ok','ai_skipped'))  -- N-02: enum'd like analytics_settings' single-row CHECK
);
CREATE TABLE IF NOT EXISTS analytics_journey_scores (
  last_run_at TEXT NOT NULL, journey_id TEXT NOT NULL, journey_name TEXT NOT NULL,
  depth INTEGER NOT NULL, distinct_systems INTEGER NOT NULL, distinct_roles INTEGER NOT NULL,
  score REAL NOT NULL, PRIMARY KEY (last_run_at, journey_id));
CREATE TABLE IF NOT EXISTS analytics_system_metrics (
  last_run_at TEXT NOT NULL, system_id TEXT NOT NULL, system_name TEXT NOT NULL,
  degree INTEGER NOT NULL, integration_count INTEGER NOT NULL, PRIMARY KEY (last_run_at, system_id));
CREATE TABLE IF NOT EXISTS analytics_ai_candidates (
  last_run_at TEXT NOT NULL, activity_id TEXT NOT NULL, activity_name TEXT NOT NULL,
  leverage_score REAL NOT NULL, detail_json TEXT NOT NULL, PRIMARY KEY (last_run_at, activity_id));
CREATE TABLE IF NOT EXISTS analytics_alerts (
  id TEXT PRIMARY KEY, last_run_at TEXT NOT NULL, kind TEXT NOT NULL,
  message TEXT NOT NULL, created_at TEXT NOT NULL);
```

`withCacheEnvelope(body)` (DD-10, **one argument** — C-01): reads
`MAX(last_run_at)` from `analytics_run`; if `now - last_run_at > 25h`,
returns `{ ...body, degraded:true, last_run_at }`, else `body`.
`STALE_THRESHOLD_MS = 25 * 60 * 60 * 1000`.

**Snapshot retention (DD-12, C-03).** `cache.ts` exports
`SNAPSHOT_RETENTION = 7` and a `pruneSnapshots()` helper that `writeRun()`
calls at the end of every run (see §5.6):

```sql
UPDATE analytics_run SET nodes_json = '', edges_json = ''
WHERE last_run_at NOT IN (
  SELECT last_run_at FROM analytics_run ORDER BY last_run_at DESC LIMIT 7);
```

Only the heavy snapshot blobs of runs beyond the latest 7 are cleared;
their headers + score rows remain. `handleSnapshot` (§5.7) treats an
empty `nodes_json` as a pruned run and returns `404 not_found`.

### 5.5 `settings.ts` — settings + audit (FR-11, DD-08, DD-09)

DDL:

```sql
CREATE TABLE IF NOT EXISTS analytics_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),   -- single-row table
  depth_weight REAL NOT NULL, system_weight REAL NOT NULL, role_weight REAL NOT NULL,
  scheduler_cron TEXT NOT NULL, pdf_brand_json TEXT NOT NULL,
  ai_candidate_definition_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS analytics_settings_audit (
  id TEXT PRIMARY KEY, ts TEXT NOT NULL, before TEXT NOT NULL, after TEXT NOT NULL, actor TEXT NOT NULL);
```

Seed (DD-08): on init, if `analytics_settings` empty, insert row id=1 from
`ANALYTICS_COMPLEXITY_WEIGHTS` + `"0 2 * * *"` + `"{}"` +
`JSON.stringify(ANALYTICS_AI_CANDIDATE_DEFINITION)`.

zod for `PATCH /settings` (partial, all optional):

```ts
const settingsPatchSchema = z.object({
  depth_weight: z.number().positive().optional(),
  system_weight: z.number().positive().optional(),
  role_weight: z.number().positive().optional(),
  scheduler_cron: z.string().min(1).optional(),
  pdf_brand: z.record(z.unknown()).optional(),
  ai_candidate_definition: z.object({
    repetition_key: z.string(), repetition_match: z.string(),
    richness_key: z.string(), richness_match: z.string(),
    leverage_score_key: z.string(), leverage_min: z.number(),
  }).optional(),
}).strict();
```

`patchSettings(patch, actor="local-operator")` (DD-09): reads the
current row (`before`), applies the patch, writes the row + one
`analytics_settings_audit` row `{ ts, before:JSON(before), after:JSON(after), actor }`.

### 5.6 `scheduler.ts` — precompute + lock + ontology validation (FR-10)

```ts
let inFlight: Promise<PrecomputeResult> | null = null; // DD-07 mutex
export async function runPrecompute(): Promise<PrecomputeResult> {
  if (inFlight) return inFlight;                         // AC-13(c): concurrent → same run
  inFlight = (async () => {
    const snap = await captureSnapshot();                // capture.ts (RD-1)
    const settings = getSettingsRow();                   // settings.ts (weights + AI def)
    const aiOk = await validateAiKeys(settings.ai_candidate_definition); // GET /api/v1/schema
    // compute via cto-analytics engines (parameterised by settings weights/definition):
    const scores = computeComplexity(snap, settings.weights);
    const systems = computeSystemMap(snap);
    const ai = aiOk ? computeAiCandidates(snap, settings.ai_candidate_definition) : [];
    const lastRunAt = new Date().toISOString();
    writeRun({ lastRunAt, snap, weights: settings.weights, scores, systems, ai,
               status: aiOk ? "ok" : "ai_skipped" });
    // DD-12 / C-03: writeRun() prunes snapshot blobs beyond the latest 7 runs
    //   (pruneSnapshots()) as its last step, keeping analytics_run bounded.
    if (!aiOk) writeAlert(lastRunAt, "ai_schema_mismatch",
      `AI-candidate definition references attribute '${settings.ai_candidate_definition.repetition_key}' which is not registered on Activity — visit ontology-manager`);
    return { lastRunAt, status: aiOk ? "ok" : "ai_skipped" };
  })().finally(() => { inFlight = null; });
  return inFlight;
}
```

`validateAiKeys` checks `repetition_key` + `richness_key` are registered
`Activity` attributes by importing `ontology-manager`'s schema-cache
accessor **directly, in-process — no HTTP call** (N-03; a same-process
import is deterministic and avoids a loopback round-trip during the cron
run). AI-key mismatch is a graceful degrade: the AI pass is skipped and
an `analytics_alerts` banner is written (AC-13(d)), never a hard failure.
Registered in `server.ts` via `cron.schedule(settings.scheduler_cron ?? "0 2 * * *", runPrecompute)`.

### 5.7 `reporting-routes.ts` — the three new REST handlers

```ts
export function handleExecSummaryPdf(): Promise<Response>;          // FR-08 → application/pdf
export function handleGetSettings(): Response;                       // FR-11 GET
export function handlePatchSettings(req: Request): Promise<Response>;// FR-11 PATCH (parseWith → 400)
export function handleSnapshot(lastRunAt: string): Response;         // FR-11a (404 not_found on miss OR pruned run)
```

`handleExecSummaryPdf` reads the latest `analytics_run` (triggering a
`runPrecompute()` if none exists), builds the `HashInput` from the run's
captured snapshot + settings weights, renders via `exec-summary.ts`, and
returns the bytes with PDF headers.

`handleSnapshot(lastRunAt)` returns the exact cache contents at that
`last_run_at` (`{snapshot_id, nodes, edges, weights, journey_scores,
system_metrics, ai_candidates}`) for hash re-derivation (AC-18). It
returns `404 not_found` in **two** cases (C-03 / DD-12): (i) no
`analytics_run` row exists for that `last_run_at`; (ii) the row exists but
its snapshot blob was **pruned** (empty `nodes_json`) because it fell
outside the rolling N=7 window — a pruned run can no longer serve
`nodes`/`edges`, so it is `not_found` for the re-derivation contract.
Both reuse the existing `not_found` code (OQ-3; no new `ERROR_CODES`).

### 5.8 PWA launcher (FR-08, AC-R2)

`pwa/src/views/analytics/ExecSummary.tsx` — a `ViewHeader` + a
"Download exec summary" button. On click: `fetch("/api/v1/analytics/exec-summary.pdf")`
→ `blob()` → `navigator.canShare?.({files:[file]})` share-sheet on iOS,
else `<a download="exec-summary.pdf">` object-URL click. **No PDF library
imported client-side** (AC-R2 grep). Route `#/analytics/exec-summary/export`
registered in `pwa/src/route.ts` (a new tab under the `analytics` surface)
+ `pwa/src/views/index.tsx` VIEWS map (`"exec-summary/export": () => <AnalyticsExecSummary/>`),
following the exact pattern `cto-analytics` used for the other analytics tabs.

## 6. HTTP API surface

| Method | Route | FR | Handler | Notes |
|--------|-------|----|---------|-------|
| GET | `/api/v1/analytics/exec-summary.pdf` | FR-08 | `handleExecSummaryPdf` | `application/pdf`; renders from cache snapshot |
| GET | `/api/v1/analytics/settings` | FR-11 | `handleGetSettings` | settings row (NFR-08 envelope) |
| PATCH | `/api/v1/analytics/settings` | FR-11 | `handlePatchSettings` | zod `parseWith`; writes audit row |
| GET | `/api/v1/analytics/snapshot/:last_run_at` | FR-11a | `handleSnapshot` | exact cache contents; `404 not_found` on unknown **or pruned** run (DD-12 / C-03) |
| (extended) | the 7 report GETs | FR-10 | `handleAnalyticsReport` (edit) | `withCacheEnvelope` + `?refresh=true` |

Router ordering (DD-11): the four literal routes above are matched
**before** the existing `analytics/([^/]+)` report regex so `settings` /
`exec-summary.pdf` are not swallowed by it. `snapshot/:last_run_at` uses
a `sub.match(/^analytics\/snapshot\/(.+)$/)`.

## 7. File changes

Every file a BUILD task creates or modifies is named here **and** in the
owning task's `Files` list (`.specconfig` `enforced:true` requires both).

### 7.1 New backend modules

| Path | Action | Task | Serves |
|------|--------|------|--------|
| `api/src/analytics/reporting/hash.ts` | new | T-02 | NFR-05, FR-08 — 8-rule graph-state hash |
| `api/src/analytics/reporting/capture.ts` | new | T-04 | FR-08 hash basis — dedicated snapshot-capture Cypher (RD-1) |
| `api/src/analytics/reporting/cache.ts` | new | T-01 | FR-10 — 5 cache tables + `withCacheEnvelope` + SQLite singleton |
| `api/src/analytics/reporting/settings.ts` | new | T-03 | FR-11 — settings + audit tables, seed, `patchSettings` |
| `api/src/analytics/reporting/scheduler.ts` | new | T-04 | FR-10 — `runPrecompute`, Promise-mutex lock, ontology validation |
| `api/src/analytics/reporting/exec-summary.ts` | new | T-05 | FR-08 — deterministic `pdfkit` generator |
| `api/src/analytics/reporting-routes.ts` | new | T-05, T-06, T-03 | FR-08/FR-11/FR-11a REST handlers |

### 7.2 Modified backend files

| Path | Action | Task | Serves |
|------|--------|------|--------|
| `api/package.json` | modify | T-00 | add `pdfkit`; `@types/pdfkit` dev-dep |
| `api/src/env.ts` | modify | T-01 | add `analyticsDbPath` (`ANALYTICS_DB_PATH`, default `./data/analytics.sqlite`) |
| `api/src/analytics/routes.ts` | modify | T-07 | DD-10 — `withCacheEnvelope` + `?refresh=true` on the 7 report GETs |
| `api/src/server.ts` | modify | T-04 | register the precompute `cron.schedule` + init the analytics DB |
| `api/src/router.ts` | modify | T-09 | one fenced block mounting the 4 new routes (DD-11) |
| `.env.example` | modify | T-01 | document `ANALYTICS_DB_PATH` |

### 7.3 New / modified PWA files

| Path | Action | Task | Serves |
|------|--------|------|--------|
| `pwa/src/views/analytics/ExecSummary.tsx` | new | T-08 | FR-08 launcher view (download; no client PDF) |
| `pwa/src/views/analytics/ExecSummary.module.css` | new | T-08 | launcher styles (tokens-only) |
| `pwa/src/route.ts` | modify | T-08 | register `exec-summary/export` tab under `analytics` |
| `pwa/src/views/index.tsx` | modify | T-08 | VIEWS entry for the launcher |

### 7.4 Vendored asset

**None.** OQ-1 RESOLVED to standard-14 `Courier` (no embedded font) —
the earlier `api/assets/fonts/` vendored-TTF row is **removed** (B-01).
The PDF carries no font stream; T-05 creates no font asset.

### 7.5 Test files (allow-globbed by `.specconfig`; listed for completeness)

| Path | Task | Closes |
|------|------|--------|
| `api/__tests__/analytics-cache.test.ts` | T-01 | (advances AC-13/AC-R3 — cache init + `withCacheEnvelope` staleness; N-01) |
| `api/__tests__/analytics-hash-determinism.test.ts` | T-02 | AC-09 |
| `api/__tests__/analytics-settings-audit.test.ts` | T-03 | AC-17 |
| `api/__tests__/analytics-settings-seed.test.ts` | T-03 | AC-R1 |
| `api/__tests__/analytics-scheduler.test.ts` | T-04 | AC-13 |
| `api/__tests__/analytics-scheduler-budget.test.ts` | T-04 | AC-16 |
| `api/__tests__/analytics-exec-summary-pdf.test.ts` | T-05 | AC-08 |
| `api/__tests__/analytics-snapshot-endpoint.test.ts` | T-06 | AC-18 |
| `api/__tests__/analytics-degraded-envelope.test.ts` | T-07 | AC-R3 |
| `pwa/src/__tests__/analytics-exec-summary-launcher.test.tsx` | T-08 | AC-R2 |

## 8. Test strategy

| AC | Closed by | Test |
|----|-----------|------|
| AC-08 | T-05 | `analytics-exec-summary-pdf.test.ts` — byte-equality (whole `Uint8Array`, so the trailer `/ID` is covered — B-02) + hash-change-on-weight-change + footer/`/Subject` hash presence |
| AC-09 | T-02 | `analytics-hash-determinism.test.ts` — all 8 NFR-05 rules, **incl. rule (g): a string value with `\r\n` vs `\n` → same hash (C-05)** |
| AC-13 | T-04 | `analytics-scheduler.test.ts` — cache write, staleness, single-exec lock, AI-skip alert |
| AC-16 | T-04 | `analytics-scheduler-budget.test.ts` — retail-mini < 30 min; stress case env-gated |
| AC-17 | T-03 | `analytics-settings-audit.test.ts` — PATCH writes one before/after/actor row |
| AC-18 | T-06 | `analytics-snapshot-endpoint.test.ts` — re-derive hash from `/snapshot` matches PDF; 404 on miss |
| AC-R1 | T-03 | `analytics-settings-seed.test.ts` — settings seeded from code-defaults |
| AC-R2 | T-08 | `analytics-exec-summary-launcher.test.tsx` — download trigger + no client PDF import |
| AC-R3 | T-07 | `analytics-degraded-envelope.test.ts` — all 7 GETs carry degraded/refresh |

The guard tests `cto-analytics` already ships
(`analytics-no-direct-driver.test.ts`, `analytics-no-write-imports.test.ts`)
extend for free to `api/src/analytics/reporting/` since they grep the whole
`api/src/analytics/` tree — this spec's modules must keep reading via
`read-only-graph.ts` (capture.ts) and never import graph-write primitives
(cache/settings SQLite writes are permitted; graph writes are not).

## 9. Rejected alternatives

- **`@react-pdf/renderer` / `puppeteer`** for the PDF — rejected per DD-02
  (heavier deps, harder byte-determinism; puppeteer ships Chromium).
- **Reuse the existing `GRAPH_QUERY`** for the hash basis — rejected per
  DD-05 (missing edge `id`/`attributes`/`createdAt`, node `updatedAt`
  split); a dedicated capture query is scoped to the cache module.
- **A second canonicaliser** for the hash — rejected per DD-04; reuse
  `graph-core`'s `canonicalStringify` + two layered rules.
- **Cross-process file/Redis lock** for `?refresh=true` — rejected per
  DD-07; single-process in-memory mutex suffices (single-tenant).
- **Compress the PDF stream** — rejected per DD-03; `compress:false`
  removes zlib nondeterminism and makes the byte diff auditable.
- **Rewrite the 7 report modules to be cache-aware** — rejected per
  DD-10; one `withCacheEnvelope` helper + one dispatcher edit.

## 10. Governance

- House rules honoured: en-US identifiers; `zod` only (PATCH validation +
  snapshot param via `parseWith`); no `tsc` (transpile via
  `bun build --no-bundle`); all routes under `/api/v1/`; NFR-08 response
  envelope. Auth: this spec adds **no per-route auth check** — the new
  routes ride the central router gate (`api/src/router.ts` → `api/src/auth/`,
  per current CLAUDE.md); the audit `actor` is a single-tenant sentinel
  (DD-09) that a future auth backfill fills without a migration. (The
  former "no auth code paths" rule was retired in the 2026-07-04 adoption.
  Resolves: C-02.)
- RD-1/AC-11/AC-12 (from `cto-analytics`) extend to
  `api/src/analytics/reporting/`: capture reads via `read-only-graph.ts`;
  no graph-write imports. The existing guard tests cover the subtree.
- `ERROR_CODES` closed enum: this spec adds none (reuses `not_found` /
  `invalid_payload`) — OQ-3 confirms.
