---
feature: graph-core
reviewing: design
reviewer: spec-review-agent
verdict: approve
reviewed_at: 2026-05-22
pass: 2
---

# Review: graph-core design (Pass 2 of 2 — final)

## Summary

Revision 2 of `graph-core/design.md` lands every pass-1 finding cleanly.
The two blockers (B-01 PATCH-clobber, B-02 unreachable `id_conflict`)
are dissolved by the three-helper split — `createNode` (strict CREATE),
`patchNode` (dynamic SET clause, partial-safe), `upsertNode` (MERGE,
import-only) — with the route table (§5.1) and storage prose (§4.1)
both showing the explicit fan-out. The seven concerns each pick a
documented strategy: mid-stream `observer.cancel()` for the row cap,
`shortestPath` + 5 s per-tx timeout for `findPath`, collect-and-continue
with `details.phase` disambiguation for `/import`, regex retirement
with a literal-keyword test fixture, `parseLabel`/`parseId` URL-param
guards with a dedicated test file, a second CI job with `services:
neo4j`, and a compose-file shape with a fail-loud `${VAR:?missing}`
form plus a non-"neo4j" default password. All five nits are absorbed
inline.

The fixes do not introduce new architectural bugs of blocker severity.
Three minor things are worth flagging as concerns the implementer
will hit — most notably the empty-PATCH-body semantics and the
all-phase-1-failure HTTP status, both of which are ambiguous in the
current prose. They're recorded below as open nits / concerns for the
tasks-phase author to pin, not as cause to extend the pass cap.

Since pass 3 is not allowed and the bar for `revise` is "fundamental
issues that genuinely block the tasks phase", verdict is `approve`
with an explicit open-nit list.

## Verdict

**approve** — 0 blockers, 3 concerns (open, accepted), 4 nits.

## Pass 1 → Pass 2 delta

Every B-/C-/N- from pass 1 verified against revision 2 text.

| Pass-1 ID | Pass-1 finding | Revision-2 evidence | Status |
|-----------|---------------|---------------------|--------|
| **B-01** | PATCH clobbers omitted fields | §3.1 lines 147–168 declare three zod schemas (`nodeCreateSchema`, `nodeUpdateSchema`, `nodeReadSchema`); `nodeUpdateSchema` is `.strict()` and all fields `.optional()`. §4.1 lines 282–305 ship `patchNode` with dynamic SET clause built only from defined keys; omitted fields are never touched. §5.1 route row (line 478) explicitly routes PATCH → `patchNode` with the partial-update body shape. | **resolved** |
| **B-02** | `id_conflict` 409 unreachable through `upsertNode` | §4.1 lines 260–280 ship strict-CREATE `createNode` that catches `isConstraintViolation(e)` and throws `ValidationError("id_conflict")`. §5.1 line 476 routes POST → `createNode` with `409 id_conflict` listed. §3.3 confirms the `node_id_unique_<L>` constraint provides the DB-level surface. AC-20 (line 1000) iterates `ERROR_CODES` for exhaustive coverage and can now exercise this code from POST. | **resolved** |
| **C-01** | Raw Cypher row cap is post-materialisation; OOM risk | §5.4 lines 562–581 ship `runPassthrough` using `observer.subscribe` with per-record counter; `observer.cancel()` at record 1001 followed by `reject(...)`. §5.4 lines 583–586 anchor single source in `api/src/neo4j/read-only-session.ts`. §5.4 lines 588–595 confirm typed helpers also route through `runPassthrough` so the cap is enforced uniformly. | **resolved** |
| **C-02** | `findPath` fan-out at depth 8 | §5.1 line 487 + §5.4 lines 598–611 pin `findPath` to single `shortestPath((a)-[*..maxDepth]-(b))` with per-tx 5 s timeout; explicit out-of-scope note for all-shortest-paths semantics. New `query_timeout` error code added in §5.3 line 520 and surfaced in the route table (line 487). | **resolved** |
| **C-03** | Bulk import phase 1 silence | §4.3 lines 426–462 spell out collect-and-continue for both phases; per-row error envelope shape pinned (`section`, `index`, `code`, `message`, `details.phase`); §4.2 `validateEdge` accepts an optional `ctx: {phase}` (lines 357–359) so phase-2 errors caused by phase-1 failures carry `details.phase: 1`. New test file `import-phase-errors.integration.test.ts` (§15 line 1005). | **resolved** |
| **C-04** | Cypher pre-flight regex false-positives | §5.4 lines 530–555 retire the regex entirely. `executeRead` + `Neo.ClientError.Statement.AccessMode` is the sole gate. AC-10 (§15 line 990) adds the `MATCH (n {name: "CREATE INDEX"}) RETURN n` fixture to lock the absence of regex regression. | **resolved** |
| **C-05** | `:label` URL param not validated | New §5.5 (lines 615–658) specifies `parseLabel` and `parseId` in `api/src/routes/_helpers.ts` with handler skeleton; new `url-param-guards.test.ts` (§15 line 1004) probes empty / lowercase / Cypher-injection labels and asserts `400 unknown_label`. §4.1 lines 341–346 cross-reference the guard as the runtime arm of "label interpolation safety". | **resolved** |
| **C-06** | Integration tests excluded from CI | §11 lines 883–921 ship two CI jobs: `unit` (typecheck + `bun test`) and `integration` (`services: neo4j` block + `bun test:integration`). All 12 integration ACs now run on every PR. Budget pinned at <5 min total. | **resolved** |
| **C-07** | Compose `NEO4J_AUTH` wiring + first-run footgun | §8.3 lines 791–832 specify `docker-compose.yml` with `NEO4J_AUTH: "${NEO4J_USER:?missing …}/${NEO4J_PASSWORD:?missing …}"` fail-loud form. `.env.example` ships `NEO4J_PASSWORD=companygraph_dev` with comment calling out the literal-"neo4j" refusal. `wait-for-neo4j.sh` verifies auth and prints the modal-mismatch hint. §14 error-handling row also updated. | **resolved** |
| **N-01** | `bun.lockb` commit/ignore convention not stated | §16 line 1016 updated: "new (generated; **committed**)" with rationale ("checked in for reproducible `bun install --frozen-lockfile` in CI"). | **resolved** |
| **N-02** | AC-22 grep polish | §6.4 lines 707–722: `currentUser\b` now anchored, `userId\s*[:=]` / `tenantId\s*[:=]` added, comment allowlist expanded to `(NFR-08\|no[- ]auth\|intentional:\s*no\s*auth)`, and a jsdoc-line filter (`^\s*\*\s`) strips prose mentions. | **resolved** |
| **N-03** | AC-13 "36 combinations" arithmetic | §15 line 993 row for AC-13 now reads "6×6×6 = **216** combinations; the 9 positive cases (sum of `EDGE_ENDPOINTS[t].length`) succeed; the other 207 return `edge_endpoint_label_mismatch`". Maths is now unambiguous. | **resolved** |
| **N-04** | `parse_error` mapping documented | §5.4 line 547 maps `Neo.ClientError.Statement.SyntaxError` → `400 parse_error` with `details.position`. §5.1 line 489 lists `400 parse_error` alongside the existing codes. | **resolved** |
| **N-05** | `attributes_json` round-trip spelled out | §3.1 lines 171–178 add the explicit "Storage representation vs. REST contract" paragraph: storage uses `attributes_json` STRING; REST always parses to object on read and accepts object on write. §3.2 line 224 cross-references the same contract for edges. | **resolved** |

## Blockers

None.

## Concerns (open, accepted — implementer must pin during tasks phase)

### C-08 (new) — PATCH with an empty body has undefined semantics

§4.1's `patchNode` constructs `sets[] = ["n.updatedAt = $updatedAt"]`
unconditionally, then conditionally appends per-field sets. A PATCH
request with `{}` (empty body) passes `nodeUpdateSchema.parse({})`
cleanly (all fields optional), reaches `patchNode`, runs

```cypher
MATCH (n:Label {id:$id}) SET n.updatedAt = $updatedAt RETURN n
```

…which bumps `updatedAt` and returns the node. That's a defensible
behaviour (idempotent touch, surfaces 404 if missing) but the spec
doesn't say so. Three alternatives the implementer might pick instead:

1. Return `400 invalid_payload` on empty body (zod `.refine(o =>
   Object.keys(o).length > 0)`).
2. Return the node unmodified without bumping `updatedAt`.
3. Current behaviour: 200 + `updatedAt` bumped.

§14 (Error handling) doesn't speak to empty PATCH. AC-05's test
description in §15 line 985 just says "PATCH partial-update + 404" —
no fixture for empty-body. Tasks-phase author should pick one and add
a row.

Cites: design §4.1 lines 282–305, §15 line 985.

### C-09 (new) — All-phase-1-failure HTTP status is ambiguous

§4.3 line 459 says "HTTP status: `200` if any rows imported (with
`errors?` populated when partial); `400` if zod parsing of the
envelope itself fails." A payload that parses cleanly at the envelope
level but where 100 % of phase-1 nodes fail (e.g. every node has a
duplicate id or a label-mismatch) leaves the spec silent on whether
the response is:

- `200 {imported:{nodes:0,edges:0}, errors:[…]}` (vacuous success — every
  individual row error is reported, envelope itself was well-formed); or
- `400 {error:{code:"invalid_payload", details:{errors:[…]}}}` (all-fail
  is a payload-level failure).

The "any rows imported" wording leans toward 200 with zero counts, but
"any" is a quantifier that doesn't address the zero case. AC-07 (§15
line 987) only tests the all-pass path on the seed fixture, so no
test will catch the contract drift.

Tasks-phase author should pin one (recommend 200 with zero counts —
matches the "partial success surfaces in `errors[]`" pattern) and add
a fixture to `import-phase-errors.integration.test.ts` (§15 line 1005)
that asserts the all-fail status code.

Cites: design §4.3 lines 459–462, §15 line 987.

### C-10 (new) — Edge `id` is unique per-type, not globally; intent is implicit

§3.3 lines 237–240 specify one `edge_id_unique_<T>` constraint per
relationship type. That means UUIDv7 `X` may exist as a `PART_OF`
edge **and** as an `EXECUTES` edge simultaneously without either
constraint firing. `createEdge` (§4.2) would 409 only if the same
`(id, type)` pair already exists; same id different type sails
through.

`DELETE /api/v1/edges/:id` (§5.1 line 481) takes only `id` and no
`type`. The handler must scan all edge types to find the row — and if
two types share an id, which one is deleted? The route description
doesn't address this. Two options:

1. Document the per-type uniqueness as intentional, change DELETE
   semantics to `(id, type)` (path becomes `/api/v1/edges/:type/:id`
   or `?type=…`), and accept that `id` alone isn't sufficient.
2. Tighten to a global edge-id uniqueness invariant (Neo4j 5 doesn't
   support a cross-relationship-type constraint natively; would need
   an application-level pre-check + transactional read-then-write,
   which races).

UUIDv7's collision probability is astronomically low, so option (1)
is the pragmatic choice — but the spec should say so, and the DELETE
handler in `api/src/routes/edges.ts` should be specified to query
across all `EDGE_TYPES` (`MATCH ()-[r {id:$id}]->() DELETE r RETURN
count(r)`) and 404 if `count = 0`, 200 if `count = 1`. The current
spec doesn't say.

Cites: design §3.3 lines 237–240, §5.1 line 481, §4.2 lines 378–399.

## Nits (accepted as open)

### N-06 — Mid-stream cancel-then-reject race is unspecified

§5.4 lines 563–581's `runPassthrough` calls `observer.cancel()` then
`reject(...)` at the row-1001 boundary. neo4j-driver v5's `cancel()`
is asynchronous over Bolt — `onCompleted` or `onError` may still fire
after the cancel arrives, and additional `onNext` callbacks may
arrive for records already in flight from the server.

In practice this isn't a correctness bug:
- The `rows.length >= 1000` guard short-circuits subsequent `onNext`
  too (it's the first thing in the callback), so memory is bounded.
- The promise honours the first settled state — `reject` wins; a
  later `onCompleted → resolve` is a no-op.

But the design should explicitly note the race is benign, or add a
`cancelled` boolean to make the intent obvious to the implementer
(e.g. `if (cancelled) return;` at the top of every callback). One
sentence in §5.4 closes this.

Cites: design §5.4 lines 562–581.

### N-07 — `parseLabel` case-sensitivity is intentional but undocumented

§5.5 line 624's `parseLabel` does `(NODE_LABELS as readonly
string[]).includes(s)` — strict case-sensitive PascalCase. A request
to `/api/v1/nodes/domain/...` (lowercase) returns `400 unknown_label`.
This is conventional in Neo4j (labels are case-sensitive on the
wire) but the design doesn't justify the choice. Worth one sentence
in §5.5 confirming the intent and pointing implementers at the
behaviour so the no-op-difference between `domain` and `Domain`
doesn't trigger "is this a bug?" investigations.

Cites: design §5.5 lines 615–658.

### N-08 — `(extra)` test files in §15 aren't pinned to AC IDs

§15 lines 1004–1005 add two `(extra)` test files: `url-param-guards`
and `import-phase-errors`. Neither is mapped to a specific AC ID.
They cover behaviour reinforced by AC-13 (validation rejection),
AC-07/AC-08 (import correctness), and AC-22-adjacent injection
hardening, but the table cell reads `(extra)` rather than a tag.
Worth annotating the AC ID(s) the test reinforces so the
tasks-phase row generator can wire them to a task.

Cites: design §15 lines 1004–1005.

### N-09 — §6.2 says validator is "Implemented in `upsertEdge`" but is shared

§6.2 lines 678–680 says "Implemented in `upsertEdge` (§4.2)." After
the B-02 fix, the validator (`validateEdge`) is shared between
`createEdge` and `upsertEdge` (§4.2 lines 355–375). Update the prose
to "Implemented in `validateEdge`, called from both `createEdge`
(POST `/edges`) and `upsertEdge` (/import phase 2)." Pure prose
cleanup.

Cites: design §6.2 lines 676–681, §4.2 lines 355–375.

## Strengths

1. **Three-helper storage split is the right shape.** §4.1 elegantly
   separates create/patch/upsert intents. The route table (§5.1)
   pins which helper each handler uses — no ambiguity. The B-01 +
   B-02 fix from pass 1 was a single deep change to one section and
   it landed clean.

2. **Mid-stream row cap with `observer.subscribe`.** §5.4's
   `runPassthrough` is exactly the right primitive — bolt streams,
   counter increments, cancel at the boundary, no materialisation
   beyond 1001 records. The single-source-of-truth claim
   (`api/src/neo4j/read-only-session.ts`) keeps the cap from
   bit-rotting across typed helpers and passthrough.

3. **`shortestPath` over multi-path search for `findPath`.** O(V+E)
   is the right default; "all paths" is correctly punted to the
   passthrough endpoint at the caller's risk + cap. The 5 s per-tx
   timeout is a clean second-layer defence against pathological
   inputs.

4. **CI now exercises 12 integration ACs per PR.** §11's two-job
   layout with `services: neo4j` is exactly what pass 1 C-06
   recommended — no docker-compose-inside-CI, sidecar healthcheck,
   <5 min budget. The `companygraph_ci_password` choice sidesteps
   the literal-"neo4j" footgun that §8.3 calls out (verified: it's
   not the literal "neo4j", so the Neo4j 5 service will start).

5. **Compose env-var fail-loud + non-trap password default.** §8.3's
   `${NEO4J_USER:?missing …}` form means the operator gets a clear
   "missing NEO4J_USER in .env" message instead of a silent
   default-and-fail. The `.env.example` ships `companygraph_dev`
   (not literal "neo4j"), avoiding the Neo4j-refuses-this-password
   first-run trap.

6. **`parseLabel` + `parseId` as the runtime guard.** §5.5 closes
   the runtime/compile-time gap that pass 1 C-05 flagged. The
   guard is a one-liner, has its own test file with malicious
   probes, and is documented as a code-review checklist item.

7. **Collect-and-continue import with `details.phase`
   disambiguation.** §4.3's two-phase semantics now ship a
   richer error envelope so clients can distinguish "node never
   existed in DB" from "node was in payload but phase-1
   rejected it". Real-world batch importers will need this.

8. **§17 closes every requirements-phase risk.** Each of the
   seven items from the requirements §Risks table now has a
   one-line resolution. The hand-off into tasks-phase is
   clean — no open questions migrated forward.

9. **AC-13 maths is now correct.** §15 line 993 says "6×6×6 =
   216 combinations; 9 positive (sum of `EDGE_ENDPOINTS[t].length`)
   succeed; 207 return label-mismatch". The implementer knows
   exactly what to iterate.

10. **`attributes_json` round-trip pinned.** §3.1's storage-vs-REST
    paragraph is the kind of contract a downstream spec
    (`ontology-manager`) will rely on; spelling it out now means
    no later spec litigates whether the wire format is a JSON
    string or a parsed object.

## Scope discipline

Verified clean. No leakage into `ontology-manager` (no attribute CRUD
schemas, no versioning), `process-explorer-ui` (no renderer choice,
no canvas interaction), `chat-interface` (no NL parsing, no
generation), `cto-analytics` (no alignment matrix, no metrics), or
auth (NFR-08 + AC-22 hold the line; the grep test enforces).

## Pass tracking

- This is **pass 2 of 2** for the design phase. **Pass cap reached.**
- Verdict is **approve**. Pass 3 is not permitted; the three
  open concerns (C-08 empty-PATCH, C-09 all-phase-1-fail HTTP
  status, C-10 edge-id per-type uniqueness + DELETE semantics)
  are explicitly accepted and must be pinned by the tasks-phase
  author. Each is a one-line spec addition; none requires
  re-architecting.

## Finding counts

- Blockers: **0**
- Concerns: **3** (all open + accepted; no further design pass)
- Nits: **4** (open)
- Verdict: **approve**
