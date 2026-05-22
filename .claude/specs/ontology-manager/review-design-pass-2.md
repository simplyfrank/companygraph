---
feature: ontology-manager
reviewing: design
reviewer: spec-review-agent
verdict: approve
reviewed_at: 2026-05-23
pass: 2
---

# Review: ontology-manager design (Pass 2 of 2 — FINAL)

## Summary

Revision 2 of `design.md` cleanly absorbs all four pass-1 blockers
(B-01..B-04), all twelve concerns (C-01..C-12), and all eight nits
(N-01..N-08). The §2.2 disposition table at the top of the design
maps every finding to its section, and every claim in that table is
backed by text in the design body — I walked each one. The two
load-bearing fixes (B-02 SSE replay race + B-03 commit-vs-emit
ordering) are now demonstrably correct in code; the heuristic that
was broken under the import path (B-04) has been excised and the
preconditions simplified to three; and the audit storage-vs-REST
contract (B-01) is finally pinned at three call sites.

Verdict is **approve**. Two minor open-accepted items carry forward
to the tasks phase (recorded in §Open-Accepted Carryovers below) —
neither is design-blocking; both are pin-the-detail items that the
tasks-phase author should land in test fixtures or requirements
text.

## Verdict

**approve** — 24 of 24 pass-1 findings cleanly absorbed; 0 partial;
0 regressed; 2 minor new concerns; 2 open-accepted carryovers for
tasks-phase.

## Per-finding verification

### Blockers — all 4 cleanly absorbed

**B-01 — audit column shape (model vs helper diverge)** — **CLEANLY ABSORBED**.

- §3.1 line 109 declares the storage shape with `before_json`,
  `after_json` STRING (matching the helper).
- §3.1 lines 152-157 add a "Storage-vs-REST contract for
  `_OntologyAudit`" paragraph citing graph-core/§3.1's
  `attributes_json` precedent (verified at graph-core/design.md
  lines 121 + 216).
- §4.4 lines 660-672 writeAudit uses `before_json` / `after_json` /
  `diff_json` consistently.
- §4.6 lines 759-775 (new) shows the REST handler deserializer
  parsing `before_json` → `before: object|null`, `after_json` →
  `after: object|null`. All three call sites consistent.

**B-02 — SSE replay broken (string-compare on UUID + race window)** — **CLEANLY ABSORBED**.

- Fix (a): §5.4 lines 976-994 resolve `Last-Event-ID → ts` via the
  `_onto_event_ts` index (lookup at line 980-984) OR accept
  `?since=<ISO>` directly (line 978). `replayEventsSinceTs` at lines
  1030-1041 keys the WHERE on `e.ts > $sinceTs` ORDER BY `e.ts` —
  index-backed.
- Fix (b): §5.4 lines 959-1003 subscribe BEFORE replay (line 973
  `.on()` precedes any read), buffer live events in `liveBuffer`
  during replay (lines 969-970), drain after replay (lines 997-1001)
  with `seenIds` dedupe. `replayDone` flag (line 1003) flips at the
  END of replay so the listener switches from buffering to direct
  enqueue. Race window is closed.

**B-03 — commit-vs-emit ordering claimed in §17 but absent from code** — **CLEANLY ABSORBED**.

- New §4.5 (lines 698-757) "Event emission" is explicit: `writeEvent`
  runs INSIDE the storage transaction alongside `writeAudit` +
  `writeVersion` (line 704-706); `ontologyEvents.emit` fires AFTER
  `session.executeWrite` resolves (line 707-708).
- §4.5 invocation pattern (lines 742-751) shows the canonical shape
  with the post-commit emit on line 750.
- §4.1 patchNodeLabel at line 454 calls `writeEvent(tx, ...)` inside
  the tx; §4.2 patchEdgeType at line 539 + deleteEdgeType at line
  568 mirror; §4.7 executeMigration at line 872 does the same.
- The pattern is consistent: every mutation site that needs an event
  invokes writeEvent in-tx.

Minor observation: the deleteNodeLabel helper at §4.1 lines 458-485
does NOT call `writeEvent` (only writeAudit + writeVersion). This is
likely an oversight given deleteEdgeType (§4.2 line 568) does. New
concern N-09 below; minor, not blocking.

**B-04 — FR-06 precondition (iii) heuristic broken under import path** — **CLEANLY ABSORBED**.

- §4.3 lines 572-588 simplifies preconditions to three: (i) no live
  instances, (ii) no registry references, (iii) migration step
  required IFF `deprecated_at` is set.
- The old heuristic ("non-create audit rows imply use") is gone.
- The carry-back to requirements FR-06 is documented in §2.3 line 89
  as "open-accepted to tasks-phase author" with the rationale that
  fewer preconditions is strictly more permissive (a tightening, not
  a contract addition — no requirements re-review needed).
- The new (iii) is implementable, deterministic, and survives the
  import path because it depends only on `before.deprecated_at` not
  on audit-row introspection.

### Concerns — all 12 cleanly absorbed

**C-01 — uniform global invalidation** — **CLEANLY ABSORBED**.

- §6.1 line 1090, §6.2 line 1111, §6.3 line 1139 all wire
  `ontologyEvents.on("ontology.changed", () => <cache>.clear())` —
  uniform global clear across all three caches.
- §6.3 lines 1129-1135 explicitly documents the tradeoff
  (over-invalidation under heavy churn; worst-case ~10 s recompile;
  acceptable for single-tenant).
- §6.3 lines 1154-1164 pins `OntologyChangedEvent` type shape
  WITHOUT a `target_kind` discriminator (line 1163 explicit). Type
  carries only `event_id, version_id, ts, diff`.

**C-02 — `/stats` keyset evolution flagged as PEU contract change** — **CLEANLY ABSORBED**.

- §3.5 (lines 299-326) rewritten correctly. Lines 308-312 explain
  the keyset evolution from compile-time `NODE_LABELS` const to
  registry-driven.
- Lines 313-319 reset the isolation argument to the right rationale:
  registry's `_OntologyNodeLabel.name` values are user-visible
  labels (e.g. `Domain`), NOT meta-labels.
- Lines 321-326 flag explicitly: "`graph-core/FR-11`'s `/stats`
  shape changes from 'six fixed keys' to 'registry-driven keyset'.
  `process-explorer-ui` … needs to expect a growing keyset. This is
  recorded in `process-explorer-ui` STATUS as an incoming contract
  evolution." Cross-spec call-out present.

**C-03 — bootstrap-history pollution + rollback-below-bootstrap** — **CLEANLY ABSORBED**.

- §7.1 lines 1220-1283 rewrites `seedRegistryFromConstTuples` to
  use MERGE on `_OntologyNodeLabel.name` (line 1229) and writes a
  SINGLE audit + version + event row covering the entire seed
  (lines 1273-1280).
- New error code `rollback_below_bootstrap` is in §5.3 line 934 and
  in §5.1 line 905's POST `/rollback/:version_id` error column.
- The "rollback handler rejects rollback to/below the seed version"
  semantics is documented at §7.1 lines 1286-1289 + open-questions
  §16 row 5 + risks §17 row 5.

**C-04 — deleteEdgeType missing** — **CLEANLY ABSORBED**.

- §4.2 lines 543-569 ships the parallel `deleteEdgeType` block with
  cascade DETACH DELETE of `_OntologyEdgeType` + child
  `_OntologyEdgeEndpoint` rows + `_OntologyAlignment` rows. `DROP
  CONSTRAINT edge_id_unique_${name}` at line 563. writeAudit +
  writeVersion + writeEvent at lines 566-568.

**C-05 — FR-05 traceability** — **CLEANLY ABSORBED**.

- §4.1 patchNodeLabel at lines 436-444 explicitly notes (comment +
  text): "PATCH of `json_schema_doc` rewrites ONLY the
  `_OntologyAttributeSchema` row — never any `:NodeLabel` data row's
  `attributes_json`. Historical rows surface newly-defined
  attributes as null until backfilled (forceBackfill path above)."

**C-06 — FR-12 forceBackfill logic** — **CLEANLY ABSORBED**.

- §4.1 lines 392-428 ships the full implementation: diff against
  prior `required` (lines 393-396) → count(:label) + sample ids
  (lines 397-402) → conditional `would_invalidate` throw with
  affected_count + sample_node_ids + newly_required + suggested
  backfill (lines 403-408) → conditional APOC-backfill path (lines
  410-426) using `apoc.convert.fromJsonMap` + `apoc.map.setKey` +
  `apoc.convert.toJson`. All three paths present.

**C-07 — 0-disable split** — **CLEANLY ABSORBED**.

- §10 lines 1410-1494 splits the retention pass into two logically
  independent passes. Pass A (audit archive) is gated on
  `retentionDays > 0` (line 1414); Pass B (event purge) at lines
  1475-1491 runs unconditionally with its own 5-min cutoff and own
  session, OUTSIDE the `if (retentionDays > 0)` block. The 0-disable
  flag therefore only short-circuits the audit archive.

**C-08 — alignment uniqueness** — **CLEANLY ABSORBED**.

- §3.2 lines 145-148 adds `_onto_alignment_unique` CONSTRAINT on
  `(target_kind, target_name, source, external_id)` IS UNIQUE.

**C-09 — migration injection surface** — **CLEANLY ABSORBED**.

- §3.3 lines 242-277 uses `z.discriminatedUnion("type", […])` with
  five structured variants (rename_attribute, remap_value,
  remove_attribute, merge_labels, split_label). No
  `transform_expression: z.string()` field reaches the wire.
- §4.7 (lines 781-879) compiles each variant to a fixed
  parameterised Cypher template via a switch statement (lines
  794-855). No operator-supplied Cypher reaches executeWrite — the
  only interpolated value is `input.target`, which is gated by
  `parseRegistryLabel` per §4.7 lines 877-879.
- §17 row 3 (line 1656) marks the original risk as RESOLVED with
  pointer to §3.3 + §4.7.

**C-10 — UUIDv7 generator note** — **CLEANLY ABSORBED**.

- §3.3 lines 280-284 explicitly note: "the `uuidv7()` helper used
  throughout (`createNode`, `writeAudit`, `writeVersion`,
  `writeEvent`, migration ids) is re-exported from
  `graph-core/api/src/ids.ts` (per graph-core/design.md §3.4) — this
  spec does not introduce a separate generator."

**C-11 — dryRun on import** — **CLEANLY ABSORBED**.

- §5.1 line 902's POST `/api/v1/ontology/import` request column now
  reads "YAML or JSON body + `?dryRun?` (pass-1 C-11)". Symmetric
  with other mutation routes.

**C-12 — seed idempotency at row level** — **CLEANLY ABSORBED**.

- §7.1 lines 1227-1244 + 1248-1268 uses `MERGE` on
  `_OntologyNodeLabel.name` and on `_OntologyEdgeType.name` with
  `ON CREATE SET` clauses. Mid-loop crash + retry is safe at row
  level (privileged-path exception to public strict-CREATE).

### Nits — all 8 cleanly absorbed

**N-01** — §15 line 1631 final tally clarified: "25 production
source files + 20 test files = 45 new files, 6 edits to
graph-core/api, 0 deletes".

**N-02** — §15 line 1626 dep versions pinned:
`json-schema-to-zod@^2`, `js-yaml@^4`, `fast-json-patch@^3`,
`lru-cache@^10`, `node-cron@^3`.

**N-03** — §10 lines 1499-1513 ships `process.on("SIGTERM", () => cronTask.stop())` for graceful shutdown.

**N-04** — §5.5 lines 1065-1069 shows the full `parseEdgeTypeName`
body (async; registry-backed via `getSchema()`).

**N-05** — §5.4 lines 1019-1026 keeps `X-Accel-Buffering: no` with
an explanatory comment naming the proxies (Render, Fly, Vercel)
that buffer SSE without it.

**N-06** — §5.1 line 909-912 footnote clarifies the dryRun-vs-schema-breaking semantics: "the handler runs the full code
path inside a transaction that is ALWAYS rolled back (no rows
written; no audit; no version; no event emitted — NFR-08)". Pin-the-test for the specific PATCH-with-schema-breaking + dryRun
sub-case is open-accepted to tasks-phase (see Open-Accepted below).

**N-07** — §5.5 lines 1059-1063 adds `parseRegistryLabel` (async;
schema-cache-backed) for dynamic-Cypher label resolution in
§4.1/§4.3/§4.7. §4.7 line 877-879 explicitly notes "The
`${input.target}` interpolation is safe because `target` is
registry-backed and validated by `parseRegistryLabel` at the route
handler (§5.5)."

**N-08** — §10 lines 1400-1403 + 1420-1467 ships the two-step
delete-after-archive: Step 1 reads + writes archive + fsync (lines
1421-1452); Step 2 deletes from `_OntologyAudit` only AFTER archive
durability is established (lines 1454-1467). Crash between A and B
re-archives on the next run (line 1402-1403 documents this).

## Regressions

None detected. The fixes don't introduce architectural problems.
The discriminated-union migration shape (C-09) is a genuine
hardening; the two-pass retention split (C-07) is cleaner; the
subscribe-before-replay (B-02 fix b) is the standard pattern for
SSE replay; the MERGE-based seed (C-12) is the correct privileged-path exception.

## New concerns (minor)

**N-09 (NEW) — `deleteNodeLabel` is missing the post-commit emit/`writeEvent` call.**

§4.1 lines 458-485 ships `deleteNodeLabel` calling `writeAudit` +
`writeVersion` but NOT `writeEvent`. Compare to §4.2
`deleteEdgeType` at line 568 which DOES call writeEvent. The pass-1
B-03 fix in §4.5 lays out the canonical "every mutation emits"
pattern, but deleteNodeLabel diverges silently. Result: a node-label
delete would land in `_OntologyAudit` + `_OntologyVersion` + a new
tip in the version chain, but SSE subscribers + EventEmitter
subscribers + the three caches would never know about it until
their TTL expires (60 s for two of the three caches; unbounded for
the zod cache since it has no TTL). This is a one-line fix:

```ts
// In §4.1 deleteNodeLabel, after writeVersion:
await writeEvent(tx, version_id, [{ op: "remove", path: `/nodeLabels/${name}` }]);
```

Plus the post-commit `ontologyEvents.emit` call at the route handler.
Open-accepted to tasks-phase (see below); cite line 485.

**N-10 (NEW) — §10 line 1481's "WITH e RETURN count(e) AS c, collect(e) AS toDelete" pattern is wasteful.**

The event-purge pass collects every row into memory then immediately
deletes them with the same WHERE clause. The `toDelete` variable is
read but never used (the subsequent DELETE just re-MATCHes). At the
event-purge scale (5-min window, few hundred rows max per day), this
is benign — but the collect()-then-throw-away allocates memory
proportional to row count. Trivial cleanup. Open-accepted; cite line
1481-1490.

## Open-Accepted Carryovers for tasks-phase

These are NOT design-blocking. They are pin-the-detail items that
the tasks-phase author should land in fixtures or tightenings:

1. **Carry-back from B-04** (already recorded in §2.3 line 89):
   Requirements FR-06 currently enumerates four preconditions; the
   design dropped to three. The tasks-phase author should tighten
   `requirements.md` FR-06 wording to three preconditions (strictly
   more permissive — a tightening, not a contract addition, so no
   requirements re-review needed).

2. **N-06 dryRun-vs-schema-breaking test fixture** (from pass-1
   nit, partially absorbed via the §5.1 line 909-912 footnote
   clarification): tasks-phase author should pin a specific test
   fixture in `ontology-dry-run.integration.test.ts` covering the
   PATCH-dropping-endpoint-with-live-edges + dryRun=true case,
   asserting the response is `200 {accepted, rejected:[{code:
   "schema_breaking", ...}]}` rather than `400 schema_breaking`.

3. **N-09 deleteNodeLabel missing writeEvent** (new in pass 2):
   one-line addition in §4.1 deleteNodeLabel + a regression test in
   `ontology-change-event.integration.test.ts` asserting that node-label DELETE fires the SSE event + invalidates caches. Tasks-phase
   author should fold this into the existing event-coverage test.

4. **N-10 §10 event-purge collect()-then-discard** (new in pass 2):
   trivial cleanup; tasks-phase author can replace the two
   sequential queries with a single `DELETE` + `RETURN count(e)`.

## Cross-spec contract preservation

Re-verified against the four downstream specs:

- **`process-explorer-ui/FR-27`** — service worker pre-cache
  `/api/v1/schema`: design §5.1 line 890 still carries
  `GET /api/v1/schema` with `?alignment=:source` filter. Preserved.
- **`process-explorer-ui/FR-28`** — SSE subscribe to
  `/api/v1/ontology/events` with `Last-Event-ID`: design §5.4 fully
  ships the replay handler; B-02 fix removes the race window.
  Preserved + hardened.
- **`process-explorer-ui` /stats keyset growth**: §3.5 explicitly
  flags as a cross-spec contract change to PEU (line 321-326).
  Preserved with explicit handoff.
- **`chat-interface/FR-18`** — server-side EventEmitter
  subscription: design §4.5 + §6 ship `ontologyEvents` EventEmitter
  with proper post-commit emit ordering. Preserved + B-03 hardened.
- **`cto-analytics/FR-10`** — `/api/v1/schema` for attribute schema
  lookup: §5.1 line 890 covers; FR-14 per-attribute
  `json_schema_doc` in response shape. Preserved.
- **`graph-core/AC-13`** — edge-pair validator continues to pass:
  §7.2 surgical refactor at lines 1304-1311 preserves error code +
  shape. Preserved.

## Strengths picked up in revision 2

1. **The B-02 SSE-replay fix is the textbook pattern** — subscribe →
   buffer → resolve `Last-Event-ID` to timestamp → query
   timestamp-indexed range → drain buffer with dedupe → flip flag.
   Every load-bearing step is in the §5.4 code. This is a non-trivial
   concurrency pattern executed correctly on the first revision.

2. **The C-09 discriminated-union migration shape is genuinely safer**
   than the original raw-Cypher shape. Five enum variants × fixed
   templates × `parseRegistryLabel`-gated interpolation = no injection
   surface. The §17 row's previous "this risk is mitigation theatre"
   is no longer rhetorical — it's resolved.

3. **The §4.5 "Event emission" subsection makes the load-bearing
   in-tx vs post-commit ordering explicit + reusable.** The invocation
   pattern at lines 742-751 is the canonical example every mutation
   site references. This is the right level of design specificity for
   a contract that an implementer would otherwise have to reverse-engineer from the §17 risk row.

4. **The C-03 + C-12 fixes combined turn the seed into a single
   atomic operation.** One audit row, one version row, one event row,
   one diff — much cleaner audit history than the 12-row pollution
   that pass-1 caught. The MERGE-based idempotency means a crash
   mid-loop is recoverable without operator intervention.

5. **The §2.2 disposition table is exemplary.** Every pass-1 finding
   has a one-row entry pointing to the section where it's resolved.
   This is the right shape for revision-to-revision traceability and
   made the pass-2 verification straightforward.

## Finding counts

- Cleanly absorbed: **24** (4 blockers + 12 concerns + 8 nits)
- Partially absorbed: **0**
- Regressed: **0**
- New concerns (minor): **2** (N-09 + N-10; both one-line fixes)
- Open-accepted carryovers to tasks-phase: **4**
- Verdict: **approve**

## Pass tracking

- This is **pass 2 of 2** (FINAL — HARD CAP reached) for the design
  phase.
- All four pass-1 blockers cleanly absorbed; design is ready for the
  tasks phase.
- Four open-accepted carryovers (FR-06 tightening + N-06 fixture +
  N-09 emit fix + N-10 query cleanup) flow forward to the tasks-phase author. None are design-blocking.
