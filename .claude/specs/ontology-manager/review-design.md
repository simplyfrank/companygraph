---
feature: ontology-manager
reviewing: design
reviewer: spec-review-agent
verdict: revise
reviewed_at: 2026-05-23
pass: 1
---

# Review: ontology-manager design (Pass 1 of 2)

## Summary

`design.md` rev 1 is a substantive, mostly faithful translation of the
approved (rev-2) requirements. The Neo4j `_Ontology*` namespace
decision lands cleanly, NFR-01's single-transaction invariant is
honoured by the storage helpers in §4, the three-cache architecture in
§6 is well-shaped, and the two pass-2 open-accepted items (OA-1
archive path, OA-2 SSE replay) are explicitly resolved.

That said, the design ships **four blocker-class issues** that would
genuinely crash an implementer's day on first integration:

1. **The §4.4 `writeAudit` row's column shape diverges from the §3.1
   `_OntologyAudit` data-model contract** — the model declares
   `{before, after}` properties, the helper writes
   `{before_json, after_json}`. Two columns or one? Pick one or both
   `audit_log` reads (FR-13 `GET /audit`) and `assertDeletePreconditions`
   step (iii) lookup will break.

2. **SSE replay order is broken by the §5.4 `>` comparison against the
   primary key** — `_OntologyEvent.event_id` is a UUIDv7 with hex hyphen
   separators; `e.event_id > $lastEventId` is a STRING comparison that
   sorts correctly within a millisecond but Cypher does not document
   string-> string range index acceleration on `STRING IS UNIQUE`
   constraints. Plus, the SSE handler "reads from the EventEmitter for
   live events" AFTER the replay read — there's a race window where
   live events fired between commit and `.on()` subscription are lost
   for new subscribers.

3. **§5.4 commit-vs-emit order is the OPPOSITE of what §17 risk row
   claims** — code in §5.4 doesn't explicitly emit at all; §17 says
   "emit happens AFTER `tx.commit()`" but no §5.4 code shows the emit
   call. The storage helpers in §4 don't show the emit either. This is
   a missing piece, not a mismatch — but it's load-bearing for FR-17 +
   AC-17.

4. **§4.3 `assertDeletePreconditions` step (iii) heuristic is broken
   for the FR-08 import path** — the heuristic relies on
   "non-create_node_label audit rows ever existed" but FR-08 import
   uses `upsertNodeLabel` (per §9.1 line 864), and the helper file
   plan (§15) does NOT list `upsertNodeLabel`. If import doesn't write
   an audit row (or writes one with `action='import_node_label'`), a
   never-touched label that was imported with 100 instances has zero
   non-create audit rows → DELETE accepts. This is a foot-gun for
   FR-06 (iii).

Eight further concerns range from missing-FR traceability holes to
cache invalidation gaps that would surface as flaky tests. Eight nits
round out the review.

The architectural approach is right — single-store, three-helper
storage, fan-out cache, dual-channel event bus. Verdict is **revise**
not **reject** because the fixes are surgical (most are one-paragraph
or one-table-row), not re-architectures.

## Verdict

**revise** — 4 blockers, 8 concerns, 8 nits.

## Blockers

### B-01 — `_OntologyAudit` column shape: model vs helper diverge

**Source mismatch.** §3.1 line 80 declares the audit-node shape as
`{ts, actor, action, target, before, after, diff_jsonpatch, version_id}`
— note `before` and `after` as native properties (Neo4j will refuse to
store a nested object as a property; JSON-stringification is forced at
runtime).

§4.4 line 497–509's `writeAudit` then writes
`{ts, actor, action, target, before_json, after_json, diff_jsonpatch, version_id}`
— renamed columns `before_json` / `after_json` storing the
JSON-stringified payloads.

§4.3 line 452's `assertDeletePreconditions` step (iii) then queries
`MATCH (a:_OntologyAudit {target: $name}) WHERE a.action <> 'create_node_label'`
— but never reads any `before` / `after` / `before_json` field.

**Why it's a blocker.** Three call sites disagree on the column name.
The audit log's `GET /api/v1/ontology/audit` (FR-13, §5.1 line 561) is
**unspecified** on response shape — does it return `before/after` (as
the data model suggests) or `before_json/after_json` (as the helper
writes)? An implementer landing on §15 line 1054 (`audit.ts` "new")
has no way to know.

**Fix.** Pick the storage-vs-REST contract pattern from
graph-core/§3.1 lines 215–222 (`attributes_json` STRING at storage,
parsed object at REST boundary). Concretely: §3.1 should say
"…`before_json: STRING (JSON-encoded)`, `after_json: STRING
(JSON-encoded)` — REST endpoint parses to object". Then §4.4's helper
is consistent. Audit-log GET handler then maps storage→REST.

Cites: design §3.1 line 80, §4.3 line 452, §4.4 lines 497–509, §5.1
line 561, §15 line 1054.

### B-02 — SSE `Last-Event-ID` replay is ordered by string compare on UUID format

**Issue.** §5.4 line 641 ships:

```cypher
MATCH (e:_OntologyEvent)
WHERE e.event_id > $lastEventId
RETURN e ORDER BY e.event_id ASC
```

`event_id` is a UUIDv7 string per §3.1 line 82 + §3.3 line 125. UUIDv7
hex with hyphens (e.g. `01928db2-1234-7abc-9def-0123456789ab`) has the
problem that the **lexicographic order of the hex characters DOES
match wall-clock order** — but the comparison `e.event_id >
$lastEventId` against a Neo4j STRING-UNIQUE-CONSTRAINT field is **not
guaranteed to use the unique index for range** in Neo4j 5 Community.
In practice, this falls back to a scan over `_OntologyEvent` (the
`_onto_event_ts` index on `ts` isn't queried). With the 5-min
retention window, the scan is bounded — but it's nonetheless silently
unindexed for a hot path.

**Worse: race window in subscriber attachment.** §5.4 lines 604–614
ships the SSE handler logic:

```
1. if (lastEventId) { replay = await replayEventsSince(lastEventId); for (...) enqueue; }
2. const listener = ...
3. ontologyEvents.on("ontology.changed", listener);
4. setInterval(heartbeat...);
```

Between step 1's read transaction completing and step 3 attaching the
listener, **any event that fires** (in-process mutation commits +
emits) will land on `_OntologyEvent` (good, persisted) but NOT in this
subscriber's stream. The next mutation will fire and be delivered.
Result: subscriber misses the event in the gap — exactly the failure
class `Last-Event-ID` is supposed to cure.

**Fix.**
- **(a) Replay ordering.** Use `e.ts > $lastEventTs` (the index column)
  and pass the timestamp of the row whose id is `Last-Event-ID`, OR
  add `CREATE INDEX _onto_event_id_range ON :_OntologyEvent(event_id)`
  explicitly (the unique constraint creates an index but `>` range on
  unique-string constraints is brittle in Neo4j 5 Community —
  documented gotcha). The simplest fix: also accept a query-param
  `since=<ISO>` and use the `ts`-index.
- **(b) Race fix.** Subscribe to the EventEmitter BEFORE running the
  replay query; buffer live events into a local array during replay;
  flush the buffered events after replay, deduplicating by `event_id`.

Cites: design §5.4 lines 604–646.

### B-03 — `tx.commit()` BEFORE `emit` order is claimed in §17 but absent from code

**Claim.** §17 line 1101 (last risk row): *"The EventEmitter `emit`
happens AFTER `tx.commit()`; if `emit` throws (sync), the event is
still in `_OntologyEvent` and any SSE subscriber will pick it up on
their next reconnect via `Last-Event-ID`."*

**Reality.** No section of §4 (storage operations) or §5 (HTTP API) or
§6 (caches) shows an `ontologyEvents.emit()` call OR a
`writeEvent(tx, ...)` call. The `_OntologyEvent` row referenced in §17
is never shown being written. The closest is §15 line 1042 listing
`api/src/ontology/storage/events.ts` as "new" with brief "writeEvent,
replayEventsSince" — but the writeAudit/writeVersion pair in §4.4 has
the implementation block; events.ts does not.

**Why it's a blocker.** FR-17 requires the in-process EventEmitter to
fire on every mutation. AC-17 verifies BOTH channels fire. The
ordering of `tx.commit` vs `writeEvent(tx, ...)` vs
`ontologyEvents.emit()` is **load-bearing**:

1. If `writeEvent` is in-transaction and `emit` is post-commit (the
   §17 claim): correct, but the design body never says so.
2. If `emit` is in-transaction (e.g. called from `writeAudit`):
   subscribers see events that may roll back. Wrong.
3. If `writeEvent` is post-commit: a crash between commit + writeEvent
   loses the persisted row → SSE replay misses the event.

**Fix.** Add a §4.5 "Event emission" subsection that ships:

```ts
export async function writeEvent(tx, event_id, version_id, diff): Promise<void> {
  await tx.run(`CREATE (e:_OntologyEvent {event_id, version_id, diff_jsonpatch, ts})`, ...);
}

// Called from storage helpers AFTER writeAudit + writeVersion in the same tx:
//   await writeEvent(tx, event_id, version_id, diff);
// AFTER `session.executeWrite(...)` resolves (i.e. AFTER tx.commit):
//   ontologyEvents.emit("ontology.changed", { event_id, version_id, ... });
```

Cite this ordering explicitly. Cross-reference §17 row.

Cites: design §17 line 1101, §15 line 1042, §4.4 (entire), §5.4 line 612.

### B-04 — Delete precondition (iii) heuristic breaks under the import path

**Heuristic.** §4.3 lines 449–463 implements FR-06 precondition (iii):

```cypher
MATCH (a:_OntologyAudit {target: $name})
WHERE a.action <> 'create_node_label' AND a.action <> 'create_edge_type'
RETURN count(a) AS c
```

i.e. "label was 'used' iff there exists ≥1 non-create audit row for
this target."

**The hole.** FR-08 import (§9.1 lines 863–865) calls `upsertNodeLabel`
on each row. The import handler's audit-write behaviour is **not
specified**:

- §9.1 doesn't show `writeAudit` calls inside the import loop.
- §15 line 1051 lists `routes/ontology/import.ts` as new, mapped to
  FR-08 — but the file's content is not specified.
- The import is `upsert`, so for a brand-new label it semantically
  acts like `create_node_label`. For an existing label that gets new
  attributes, it semantically acts like `patch_node_label`. The audit
  action string is therefore ambiguous.

If the import writes `action='import_node_label'` (a new value), step
(iii) treats it as a "use" and a never-instantiated freshly-imported
label cannot be DELETEd without first marking deprecated — **wrong per
FR-06 (iii) which permits never-used DELETE**.

If the import writes nothing to the audit log (since it's a bulk
operation), and then 100 node instances are POSTed against the
imported label, those POSTs hit `graph-core`'s `createNode` —
**`graph-core` does not write to `_OntologyAudit`**. So a label can
have N instances and yet zero non-create audit rows. Step (iii) then
allows DELETE — which is precondition (i)'s job to catch, granted, but
the heuristic is meaningless here.

Worse: AC-05's "never-used path" (line 154, requirements rev 2): "POST
+ DELETE on a typo'd label with no instances ever → 204 without prior
deprecation". This succeeds only if `create_node_label` is the ONLY
audit row for that name. But a POST that fails validation, retries
with corrected payload, succeeds, then DELETE — `_OntologyAudit`
contains one row (the successful create) — heuristic passes. Good.
But a POST that succeeds, then a PATCH that updates the description,
then a DELETE (with zero instances ever) — heuristic now fires
`precondition_failed: "deprecation_marker_required"`. Description-only
PATCH should not count as "label was used". Wrong.

**Fix.** Replace the heuristic with a direct lookup:

> "Label was used" means: at any point in time, `node_instance_count >
> 0` was true for this label. Track it explicitly: a new
> `_OntologyNodeLabel.ever_instantiated: boolean` property, flipped to
> `true` by the `graph-core` `createNode` (or set during a
> mid-migration `merge_labels` step). Default `false`.

Alternatively: drop precondition (iii) entirely. Precondition (i)
already catches the "has live instances" case; precondition (iv)
already catches the "had instances, needs migration" case via the
`confirm_migration_step_id` requirement on a deprecated label. The
"deprecation marker required" gate is redundant unless the design has
a way to know that instances **previously existed but were deleted**,
and the current heuristic does not have that knowledge.

Cites: design §4.3 lines 449–463, §9.1 lines 863–865, §15 line 1051,
requirements AC-05 line 154.

## Concerns

### C-01 — Cache invalidation: `attribute-zod` cache is selective; `edge-endpoint` cache is global; mismatch could deadlock under churn

§6.3 lines 711–713 invalidates the attribute-zod cache **per label**:

```ts
if (evt.target_kind === "node_label") zodCache.delete(evt.target);
```

But §6.1 line 666 and §6.2 line 687 invalidate the schema cache and
the edge-endpoint cache **globally** on every `ontology.changed`
event, regardless of `target_kind`.

This is **defensible** — edge-endpoint cache keys by edge type, so a
node-label change should NOT touch it. But the design ships a global
`.clear()` anyway. Three issues:

1. **Wasted re-computation.** A node-label PATCH that changes only
   `description` triggers a full clear of `endpointCache` — every
   subsequent edge write pays the cache-miss penalty.
2. **Selective invalidation correctness.** If the design ships
   selective invalidation for edge-endpoints (matching node-labels'
   per-target precision), the AC-17 test
   (`api/__tests__/ontology-change-event.test.ts`) cannot verify
   "cache invalidates" without knowing which keys to probe — adds
   complexity.
3. **`target_kind` discriminator is informal.** `OntologyChangedEvent`
   carries `target_kind` per the §6.3 listener, but §5.4 line 612's
   handler shape `(evt: OntologyChangedEvent) => …` doesn't define
   `OntologyChangedEvent`. The type's discriminator field is not
   pinned anywhere.

**Fix.** Either (a) keep all three caches global-invalidate (simpler;
the tradeoff is over-invalidation, but at 50ms p99 cache-miss this is
fine for a single-tenant deployment) and remove the per-target
delete from §6.3, OR (b) pin `OntologyChangedEvent`'s discriminator
shape explicitly in §5.4 + §6.3, and apply selective invalidation
uniformly across all three caches.

Cites: design §6.1 line 666, §6.2 line 687, §6.3 lines 711–713, §5.4
line 612.

### C-02 — `_Ontology*` isolation claim (§3.5) cites the wrong graph-core section

§3.5 line 226 claims: *"The implementation in `graph-core/design.md`
§3.3 iterates `NODE_LABELS` const (compile-time), not `MATCH (n)
RETURN labels(n)`."*

Verified against `graph-core/design.md`: §3.3 is "Constraints + indexes
— `api/src/neo4j/bootstrap.ts`" — it iterates `NODE_LABELS` for
**constraint creation**, not for `/stats`. The `/stats` handler is in
`api/src/routes/stats.ts` (graph-core §16 line 1117), but
graph-core/design.md has **no implementation listing** for `/stats` —
only the §5.1 route table row (line 518) and the response shape.

**The isolation claim is nonetheless TRUE** but for a different
reason than cited:
- `graph-core/FR-11` (requirements line 58) pins the shape as
  `{nodes: {Domain, UserJourney, Activity, Role, System, Location}}`
  — six fixed keys, "all keys present even when value is 0".
- An implementer reading this contract will iterate the
  `NODE_LABELS` const at runtime to assemble the keyset (otherwise
  "all keys present when value is 0" is impossible without a
  registry-of-keys-to-include).

After this spec lands, the `/stats` handler will read from the
**registry**, not the const — per FR-15. The registry returns the six
base labels + any user-registered labels. So `/stats` shape becomes
`{nodes: {Domain, ..., Location, Product, KPI, ...}}`. The
ontology-manager isolation claim should clarify:

> After FR-15 refactors `bootstrap.ts`, the `/stats` keyset is the
> registry's NodeLabel list — six base + any user-registered. The
> `_Ontology*` rows are NOT included because the registry's
> `_OntologyNodeLabel.name` values are by definition the
> user-visible labels (e.g. `Domain`), not the meta-labels
> (e.g. `_OntologyNodeLabel`). The meta-labels live in the
> `_Ontology*` namespace and never appear as registry rows.

**Fix.** Replace the §3.5 paragraph with the above. Also: the §3.5
claim that `/stats` shape changes from FR-11's six fixed keys to
"six base + user-registered" is **a contract change to FR-11** —
worth flagging explicitly so process-explorer-ui (which renders the
stats panel) knows the shape grew.

Cites: design §3.5 line 224–231, graph-core/design.md §3.3, FR-11
graph-core/requirements line 58.

### C-03 — `applyMetaSchema` runs ahead of `seedRegistryFromConstTuples` — bootstrap order is risky

§8 lines 826–834 specifies the bootstrap order:

1. `applyMetaSchema` (creates `_Ontology*` constraints).
2. `isRegistryEmpty` (read query).
3. `seedRegistryFromConstTuples` if empty.
4. `listNodeLabelsFromRegistry` + per-label constraint + index loop.
5. `listEdgeTypesFromRegistry` + per-type constraint loop.

Steps 4 + 5 are the inherited graph-core bootstrap. They iterate the
registry to install **per-label** constraints (the
`node_id_unique_${label}` family).

**The risk.** `seedRegistryFromConstTuples` (§7.1 line 770) runs
`createNodeLabel(tx, { ..., name: label, ... })` for each of the six
base labels. `createNodeLabel` writes:

1. The `_OntologyNodeLabel` row.
2. The `_OntologyAttributeSchema` row + `DESCRIBES` rel.
3. (no alignments — seed doesn't include them)
4. `writeAudit(tx, "system:bootstrap", "create_node_label", label, null, ..., version_id)`.
5. `writeVersion(tx, version_id, "system:bootstrap", "create_node_label", ...)`.

So a single `bun run dev` on an empty database performs **6 ×
(audit + version) = 12 history rows** for the bootstrap of the six
base labels alone (and another 6 for the six edge types = 24 history
rows total at first boot).

This is technically correct but:
- The first-ever `/api/v1/ontology/versions` response is a list of 12
  "system:bootstrap" rows — surprising for users.
- Rollback to the very first version is a no-op (the parent chain
  bottoms out at the bootstrap row). §17 row 5 acknowledges this but
  the design doesn't explicitly say "do not allow rollback below the
  bootstrap version".

**Fix.** Either (a) seed via a separate code path that bypasses
`writeAudit`/`writeVersion` (acceptable: bootstrap is not a
user-driven action), OR (b) document the "do not rollback below
bootstrap" in §5.1 line 559's rollback endpoint with a `409
rollback_below_bootstrap` error code, AND add it to the §5.3 error
code list (currently 13 codes — would become 14).

Cites: design §7.1 lines 770–793, §8 lines 826–834, §17 row 5.

### C-04 — `assertDeletePreconditions` step (ii) `DETACH DELETE` mention is conflated

§4.3 line 447 says: *"(For edge types, the `_OntologyEdgeEndpoint`
rows DETACH DELETE with the type — no separate check.)"*

But the actual Cypher in `deleteNodeLabel` (§4.1 lines 332–338) does
**not** show a parallel `deleteEdgeType` implementation. §4.2 only
shows `patchEdgeType` (lines 359–402), not `deleteEdgeType`. The §4.3
helper covers both kinds via the `kind` parameter but its body only
ships node-label checks (`kind === "node_label"` branches).

So the edge-type DELETE precondition is:
- Step (i): `edge_instance_count = 0` — checked (line 423).
- Step (ii): **No code path** — the parenthetical comment in line 447
  asserts "no separate check needed" but the function never queries
  for `_OntologyEdgeEndpoint` rows by `edge_type_name`.
- Step (iii): heuristic — checked (line 452).
- Step (iv): `confirm_migration_step_id` — checked (line 466).

**This is fine for step (ii)** because the edge-type's endpoint rows
ARE its own children (relationship `OF_TYPE`), so they cascade-delete
with the type. But the design's §4.1 line 336 DETACH-DELETE Cypher for
node-label only catches `_OntologyAttributeSchema` and
`_OntologyAlignment`. The equivalent block for edge-type is missing.

**Fix.** Add a §4.2 `deleteEdgeType` block that parallels §4.1's
`deleteNodeLabel`. Cypher should look like:

```cypher
MATCH (e:_OntologyEdgeType {name: $name})
OPTIONAL MATCH (e)<-[:OF_TYPE]-(ep:_OntologyEdgeEndpoint)
OPTIONAL MATCH (e)<-[:ALIGNS]-(a:_OntologyAlignment)
DETACH DELETE e, ep, a
```

Plus `DROP CONSTRAINT edge_id_unique_${type} IF EXISTS` to match the
per-label cleanup in §4.1 line 341.

Cites: design §4.1 lines 332–342, §4.2, §4.3 line 447.

### C-05 — FR-05 (non-retroactive attribute addition) has no file mapping in §15

FR-05 (requirements line 92): *"adding an attribute to an existing
label MUST NOT rewrite existing rows. Historical rows surface that
attribute as `null` until backfilled."*

AC-03 (line 152) ties to FR-05 and is in §14 line 1005 mapped to
`ontology-no-retroactive-rewrite.integration.test.ts` — so the
**test** is mapped. But §15 lacks a file change that implements the
"do not rewrite" guarantee. The guarantee is essentially "PATCH on
the attribute-schema row alone, never touch any data row". That's a
property of `patchNodeLabel` (§4.1) which patches `_OntologyAttributeSchema`
and never rewrites `node.attributes_json`.

So FR-05's implementation is implicit in §4.1. Spec hygiene improvement:

**Fix.** Add a line in §15 to `node-labels.ts` row noting the FR-05
mapping, OR add an explicit one-line clause in §4.1 stating: "PATCH
of `json_schema_doc` rewrites only `_OntologyAttributeSchema`, never
any `:NodeLabel` data row".

Cites: design §4.1, §14 line 1005, §15 line 1032, requirements FR-05.

### C-06 — FR-12 invalidating-change guard (`forceBackfill`) has no implementation listing

FR-12 (requirements line 99): *"adding a required attribute to a label
with existing rows is blocked unless `forceBackfill=true` is supplied
with a backfill value … Block returns `409 {error:{code:"would_invalidate", details:{affected_count, sample_node_ids, suggested_backfill}}}`."*

AC-10 (line 159) is mapped to test
`ontology-invalidating-guard.integration.test.ts` (§14 line 1012). Good.

But §15 has no entry for the backfill execution logic. The
`patchNodeLabel` helper (§4.1) does not show the `forceBackfill` path
— it just routes the `json_schema_doc` patch through to the
attribute-schema row write.

The §5.1 line 549 PATCH route lists `?forceBackfill?` as a query
param and `409 would_invalidate` as a possible error — but the
handler logic for **detecting** that the schema patch is
invalidating (adding a required attribute to a label with N existing
rows) AND **executing** the backfill (writing the literal/Patch
operation to every node) is unspecified.

**Why it's a concern not a blocker.** A naive implementer can stub
this; the spec is missing the precondition check + backfill loop
prose. AC-10's test will pass against a stub that always returns
`409 would_invalidate`, but the `forceBackfill=true` path test will
fail.

**Fix.** Add a paragraph in §4.1 covering the `patchNodeLabel`
`json_schema_doc` patch: compute the set of newly-required attributes
(diff between before.json_schema_doc.required vs
after.json_schema_doc.required); if non-empty, count nodes:
`MATCH (n:${label}) RETURN count(n) AS c, collect(n.id)[..10] AS sample_ids`;
if `c > 0` AND `forceBackfill` is false, throw `would_invalidate`.
Otherwise, write the backfill: `MATCH (n:${label}) WHERE ... SET
n.attributes_json = apoc.convert.toJson(...)` — note this requires
APOC for JSON patch (which graph-core already enables per
§8.3 line 859).

Cites: design §5.1 line 549, §15, requirements FR-12 + AC-10.

### C-07 — FR-13a "0 disables" semantics: archive-write side-effect vs purge side-effect

FR-13a (requirements line 101): *"`OPT_ONTOLOGY_AUDIT_RETENTION_DAYS`
(default 365; `0` disables)"*.

§10 line 902: `if (retentionDays === 0) return { archived: 0 };  //
disabled`.

This early-return ALSO skips the `_OntologyEvent` 5-min retention
sweep (lines 934–939) — which the same job runs. So setting
`OPT_ONTOLOGY_AUDIT_RETENTION_DAYS=0` disables not just audit archive
but ALSO the SSE event-buffer purge. `_OntologyEvent` grows
unboundedly.

**Why it's a concern.** Two retention concerns share one daily pass;
disabling one shouldn't disable the other.

**Fix.** Either (a) split into two cron jobs (one for audit retention,
one for `_OntologyEvent` retention) — see graph-core's pattern of
separate concerns, OR (b) keep one cron but split the
`retentionDays === 0` check so it only short-circuits the audit
archive, never the event sweep. The event sweep's window (5 min) is
not user-configurable.

Cites: design §10 lines 894–942, requirements FR-13a line 101.

### C-08 — FR-09 alignment uniqueness is not modelled

FR-09 (requirements line 96): *"each label / edge type may carry an
`external_alignment: [{source: string, id: string}]` array"*.

§3.1 line 78 ships `_OntologyAlignment` with `{target_kind,
target_name, source, external_id}` — a flat row per alignment entry.

But no uniqueness constraint. Two `POST /api/v1/ontology/node-labels`
calls — first with `external_alignment: [{source: "ARTS", id: "X"}]`,
second a PATCH adding `{source: "ARTS", id: "X"}` again via
`replaceAlignments` — would write the same row twice.
`replaceAlignments` (referenced in §4.1 line 309 but not implemented
in the design body) presumably deletes + re-inserts. But there's no
UNIQUE on `(target_kind, target_name, source, external_id)`.

**Why it's a concern.** Affects FR-09 filter (`?alignment=:source`):
`GET /api/v1/schema?alignment=ARTS` could return duplicate types if
the alignment table has dupes. Also affects round-trip
export→import→export (AC-07).

**Fix.** Add a UNIQUE constraint:

```cypher
CREATE CONSTRAINT _onto_alignment_unique IF NOT EXISTS
  FOR (a:_OntologyAlignment)
  REQUIRE (a.target_kind, a.target_name, a.source, a.external_id) IS UNIQUE;
```

Add to §3.2 constraint block.

Cites: design §3.1 line 78, §3.2, §4.1 line 309, FR-09.

### C-09 — FR-16 migration `transform_expression` is "raw Cypher" per §17 — but §3.3 schema declares it as `z.string().min(1)` only

§3.3 line 207: `transform_expression: z.string().min(1)`.

§17 risk row line 1097: *"Migration `transform_expression` is raw
Cypher — operator can write a query that violates an attribute schema
mid-migration."*

**Issue.** The validation pipeline accepts any non-empty string.
Operator types `MATCH (n) DETACH DELETE n` (a write Cypher), the
migration handler runs it inside `executeWrite`, and **all data is
wiped**. The mitigation row says "Migrations execute in one
transaction; if any post-migration write fails the FR-04 attribute
validator, the whole migration rolls back." But the FR-04 validator
runs on `/api/v1/nodes/:label/...` writes (HTTP boundary), NOT
inside the migration's Cypher transaction. So the rollback gate
doesn't actually fire on a raw `DETACH DELETE`.

**Why it's a concern.** This is the highest-blast-radius surface in
the spec. The risk row is correct that there's a real exposure, but
the mitigation is theatre.

**Fix.** Pin the migration `transform_expression` to a structured
shape — not raw Cypher — keyed on the `type` enum (which is already
enumerated: `rename_attribute | remap_value | remove_attribute |
merge_labels | split_label`). E.g.:

```ts
migrationCreateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rename_attribute"), target: z.string(),
             transform: z.object({ from_key: z.string(), to_key: z.string() }) }),
  z.object({ type: z.literal("remap_value"), target: z.string(),
             transform: z.object({ key: z.string(),
                                   from_value: z.unknown(),
                                   to_value: z.unknown() }) }),
  // …
]);
```

The handler then compiles each migration `type` into a fixed Cypher
template. No operator-supplied Cypher reaches `executeWrite`.

Cites: design §3.3 line 207, §17 row 3 line 1097, requirements FR-16.

### C-10 — `_OntologyEvent.event_id` UUIDv7 generation is not specified anywhere

§3.3 line 125 introduces the UUIDv7 regex but doesn't show the
generator. §4.1 line 275, §4.2 line 397 call `uuidv7()` without
specifying the import (presumed from `api/src/ids.ts` per
graph-core/§3.4 line 287–289). §4.4 line 521 calls `uuidv7()` for
version_id. §5.4 line 644 uses `event_id` ordered comparison without
saying where it's minted (`writeEvent` is in §15 line 1042 but not
shown).

This is **per-symbol pedantry**, but the spec inherits the assumption
from graph-core. Worth one line saying so.

**Fix.** Add a sentence in §3.3 or §4: "UUIDv7 helper from
graph-core's `api/src/ids.ts` is reused — no separate generator in
this spec."

Cites: design §3.3 line 125, §4.1 line 275, §4.2 line 397, §4.4 line
521, §5.4 line 644.

### C-11 — `?dryRun=true` for `POST /api/v1/ontology/import` differs from FR-11 contract

FR-11 (requirements line 98) declares dry-run available on **every
mutating endpoint** including `POST /api/v1/ontology/import`.

§5.1 line 556 carries `POST /api/v1/ontology/import` with no `?dryRun?`
listed in the request column.

§5.1 line 563–566 footnote says: *"All routes use the `?dryRun=true`
query param contract — when set, the handler runs the full code path
inside a transaction that is ALWAYS rolled back…"*

So either the footnote covers import (good — but then line 556's
request column should show `?dryRun?` for symmetry) or the import is
exempt (bad — FR-11 contract breach).

**Why it's a concern not a blocker.** FR-11's AC-09 (line 158)
explicitly tests *one* dry-run path; nothing forces the test to
exercise import. But a reader of §5.1 will assume the footnote
covers all rows.

**Fix.** Add `?dryRun?` to §5.1 line 556's request column.

Cites: design §5.1 line 556, footnote line 563, requirements FR-11
line 98, AC-09 line 158.

### C-12 — graph-core's bootstrap edit (§7.1) drops the constraint-creation idempotency check

graph-core/§8.1 lines 821–828 (bootstrap.ts BEFORE) iterates
`NODE_LABELS` and creates constraints with `IF NOT EXISTS`. AC-04
(graph-core) tests that re-running is a no-op.

§7.1's "After" listing (lines 743–764) still uses `IF NOT EXISTS` on
the per-label loops (line 758, 759). Good. But the new helper
`isRegistryEmpty` (line 750) is unspecified — does it run inside or
outside a transaction? What's the query?

If `isRegistryEmpty` is implemented as
`MATCH (n:_OntologyNodeLabel) RETURN count(n) > 0 AS exists` and it
runs in a separate session from `seedRegistryFromConstTuples`, a
concurrent server boot (the spec is single-tenant single-process so
this shouldn't happen, but…) could race. More importantly: an
in-flight `seedRegistryFromConstTuples` that crashes mid-loop leaves
the registry partially seeded. On retry, `isRegistryEmpty` returns
false → no seed retry → 4 labels seeded, 2 missing. Bootstrap step 4
then iterates the registry's 4 labels and per-label constraint-create
succeeds. But the registry is wrong forever.

**Fix.** Either (a) wrap `seedRegistryFromConstTuples` so it's
idempotent at row level (use `MERGE` on `_OntologyNodeLabel.name`,
not strict CREATE — yes, this differs from the user-facing strict
CREATE path; the seed is a privileged code path), OR (b) document the
"if seed crashes mid-loop, the operator must `MATCH
(n:_OntologyNodeLabel) DETACH DELETE n` and restart" recovery in
§13's error-handling table.

Option (a) is the right choice. The seed is bootstrap, not
user-action; idempotency at row level is exactly what bootstrap needs.

Cites: design §7.1 lines 750–793, graph-core/§8.1.

## Nits

### N-01 — §15 file count says "24 new files, 6 edits" but the table has more

Walking §15:

- New files: shared/src/schema/ontology.ts, storage/node-labels.ts,
  storage/edge-types.ts, storage/attributes.ts, storage/alignments.ts,
  storage/audit.ts, storage/preconditions.ts, storage/migrations.ts,
  storage/events.ts, cache/schema.ts, cache/edge-endpoints.ts,
  cache/attribute-zod.ts, events.ts, json-schema-to-zod.ts, seed.ts,
  errors.ts, routes/ontology/schema.ts, routes/ontology/events.ts,
  routes/ontology/node-labels.ts, routes/ontology/edge-types.ts,
  routes/ontology/import.ts, routes/ontology/export.ts,
  routes/ontology/versions.ts, routes/ontology/audit.ts,
  routes/ontology/migrations.ts, jobs/audit-retention.ts,
  meta-bootstrap.ts, 18 test files + 2 unit tests + data dir = **44+**
  rows in the table.

The "24 new files" tally appears to count only the production source
files (not tests), but the §15 final-row line 1072 just says **"Total:
24 new files, 6 edits, 0 deletes"** with no qualifier. Inconsistent
with graph-core's §16 tally that includes tests.

**Fix.** Either drop the count or qualify it: "24 production source
files + 20 test files = 44 new files".

Cites: design §15 line 1072.

### N-02 — `js-yaml` parser is locked but no version pin

Dependencies + §9.1 use `js-yaml` for YAML import. graph-core's
pattern (§16 row for `bun.lockb`) is to commit the lockfile. The
ontology-manager design's `api/package.json` entry (§15 line 1067)
says: *"add deps: `json-schema-to-zod`, `js-yaml`, `fast-json-patch`,
`lru-cache`, `node-cron`"* — no version specifier.

**Fix.** Pin versions in §15 entry. E.g. `^4.x` for js-yaml,
`^2.x` for json-schema-to-zod (already in §12 line 979),
`^3.x` for fast-json-patch, `^10.x` for lru-cache, `^3.x` for
node-cron.

Cites: design §15 line 1067.

### N-03 — `node-cron` introduces a runtime dependency that competes with graph-core's `Bun.serve` lifecycle

§10 line 953 uses `node-cron`'s `cron.schedule(...)` to register the
retention job. `node-cron` keeps an internal `setInterval` for each
schedule; the timer fires the callback regardless of HTTP-server
state. If the HTTP server is shutting down (SIGTERM, e.g. via systemd
restart), `node-cron` may fire `runAuditRetention` mid-shutdown and
the Neo4j session it opens (line 914) might race with the driver's
graceful close.

graph-core ships no scheduler — every other handler is request-driven.
This is the first scheduled job introduction.

**Why it's a nit not a concern.** Single-process single-tenant means
the worst case is a transient error on the way down; the next boot
re-runs the cron. But the operator-experience is poor.

**Fix.** Either (a) integrate via `process.on('SIGTERM')` to call a
cron-cancellation function, OR (b) document the race as benign in
§17, OR (c) use `setInterval` directly (no library needed for a daily
cron — the next-run-time calc is trivial).

Cites: design §10 lines 950–955, §15 line 1067.

### N-04 — `parseEdgeTypeName` helper mentioned twice but body not shown

§12 lines 972–974 says: *"Edge-type names use the same pattern via a
new `parseEdgeTypeName` helper in `api/src/routes/_helpers.ts`."*

§15 line 1056 says `routes/_helpers.ts | edit | add
`parseEdgeTypeName` (mirrors `parseLabel`)`.

But no body is shown. graph-core's `parseLabel` (graph-core/§5.5 line
671) ships the full snippet. The ontology spec should mirror by
showing:

```ts
export async function parseEdgeTypeName(s: unknown): Promise<EdgeType | null> {
  if (typeof s !== "string") return null;
  // Must be loaded from the registry, not the const — per NFR-02.
  const types = await listEdgeTypeNamesFromRegistry();
  return types.includes(s) ? s : null;
}
```

Note: this is **async** (registry-backed) where `parseLabel` is sync
(const-backed). The asynchrony matters at the handler layer — every
node-route uses `parseLabel` synchronously; every edge-route handler
in this spec must `await parseEdgeTypeName`. Worth flagging.

Cites: design §12 line 974, §15 line 1056.

### N-05 — §5.4 SSE `X-Accel-Buffering: no` header is nginx-specific

§5.4 line 630: `"X-Accel-Buffering": "no",  // disable nginx/proxy
buffering`.

graph-core/NFR-02 binds the server to `127.0.0.1` (loopback). The
PWA in browser hits `/api/v1/...` directly. There's no nginx in the
single-tenant deployment (yet). The header is harmless but premature.

**Fix.** Document or remove. If kept, also document the alternative
proxies it covers (some CDNs honour `X-Accel-Buffering`; most don't).

Cites: design §5.4 line 630.

### N-06 — Edge-type endpoint pair PATCH `dryRun` semantics for `schema_breaking` not tested

AC-09 (requirements line 158) tests dry-run writes nothing. But the
specific case "PATCH dropping an endpoint pair with live edges,
`?dryRun=true`" — does it return `400 schema_breaking` (the rejection
that would happen) or `200 {accepted, rejected:[…], affected:{...}}`
(the dry-run preview)?

§5.1 line 554 lists `400 schema_breaking` as a PATCH error code. §11
test plan (AC-09) doesn't list this specific scenario.

**Fix.** Tasks-phase author should pin a specific test fixture. Spec
clarification: dry-run NEVER returns 400 for an invalidating
operation; it returns 200 with `rejected[]` carrying the same
`schema_breaking` code + details.

Cites: design §5.1 line 554, requirements AC-09.

### N-07 — `node_instance_count = 0` step (i) check uses dynamic Cypher label interpolation

§4.3 lines 421–425:

```ts
const node_instance_count = kind === "node_label"
  ? (await tx.run(`MATCH (n:${name}) RETURN count(n) AS c`)).records[0].get("c").toNumber()
  : 0;
```

`name` here is the label name. Although the design says (§12 lines
971–972) that "label interpolation is type-narrowed" via `parseLabel`,
this codepath is from `assertDeletePreconditions(tx, "node_label", name, ...)`
where `name` comes from `req.params.name` which goes through... the
design doesn't say. The §5.1 DELETE route's path is
`/api/v1/ontology/node-labels/:name` (line 550). There's no
`parseLabel` call shown in the DELETE handler.

Worse: the name might not even **be** a label that `parseLabel`
recognises (the registry has user-defined labels, not just the six
base ones). So `parseLabel` (which iterates `NODE_LABELS` const, per
graph-core/§5.5) would **return null** for a user-defined label like
"Product". Need a different guard.

**Fix.** Add a registry-backed `parseRegistryLabel` helper that
queries the `_OntologyNodeLabel` table. Cached.

Cites: design §4.3 lines 421–425, §5.1 line 550, §12 lines 971–972.

### N-08 — §10 retention pass doesn't atomically delete-after-archive

§10 lines 913–929: the retention pass writes archived rows to the
gzipped file inside a `session.executeWrite` block, then deletes them
in the same `executeWrite`. If the gzip stream errors after the
inner `tx.run(MATCH … DELETE)` but before `gzipStream.end()`, the
rows are deleted from `_OntologyAudit` but never landed in the
archive file → data loss.

**Fix.** Two-step:

1. Read + write archive file → success.
2. Then delete from `_OntologyAudit` (separate transaction).

Idempotency holds because the second-run-after-crash will re-read the
same rows + append to the archive (gzip append is supported) + then
delete. The current single-pass shape is theoretically faster but
loses durability.

Cites: design §10 lines 913–942.

## Strengths

1. **Single-store, single-transaction is the right architecture.** §1
   rule 1 and NFR-01 land cleanly throughout §4. Cross-store
   two-phase-commit risk is genuinely dissolved.

2. **Three-helper storage pattern mirrors graph-core perfectly.** §4's
   `create*` / `patch*` / `delete*` (+ `listAll`) shape inherits the
   exact discipline that graph-core's design-review pass 2 strengthened.
   `replaceAlignments` (referenced in §4.1) is the equivalent of
   graph-core's `upsertNode` for the alignment sub-collection.

3. **Pass-2 open-accepted items absorbed.** §2 table explicitly maps
   OA-1 (archive path namespacing) and OA-2 (SSE replay) to §10 and
   §5.4 respectively. The new `_OntologyEvent` collection is a clean
   addition; the 5-min retention is a reasonable choice.

4. **NFR-02 boundary (single legal `NODE_LABELS` importer) honoured.**
   §7.1 line 768 names `api/src/ontology/seed.ts` as the sole
   importer; AC-15 grep test (§14 line 1017) verifies. The structural
   evidence is in §15 — only `seed.ts` lists the import.

5. **Error code registry exhaustiveness mirrors graph-core.** §5.3
   line 577–591 enumerates 13 codes including the explicit
   symmetric-with-graph-core `edge_endpoint_label_mismatch`. The
   exhaustiveness assertion in `api/__tests__/ontology-envelope.test.ts`
   (§14 line 1022) is the right test shape.

6. **`?dryRun=true` global contract.** §5.1 footnote (line 563)
   declares dry-run as a transversal property of every mutating route
   — one paragraph for many rows, lower repetition.

7. **Three-cache architecture distinguishes scope correctly.** §6's
   split (schema cache global-key, edge-endpoint cache per-type,
   attribute-zod cache per-label) shows the implementer is thinking
   about which-key-invalidates-what. The selective invalidation in
   §6.3 (per-target) is a real perf win — concern C-01 is more about
   making it consistent across the other two caches.

8. **`assertDeletePreconditions` enumerates all four FR-06 cases
   explicitly.** §4.3 (modulo blocker B-04) walks (i) live instances,
   (ii) registry references, (iii) deprecation marker, (iv) migration
   step. The error-code shape (`409 deprecation_required` with
   `details.precondition_failed: <name>`) carries the right level of
   detail for AC-05's 4-sub-case test.

9. **Migration handler structure (§5.1 line 561) hooks into FR-06
   (iv)** — `confirm_migration_step_id` precondition (§4.3 line 466)
   queries `_OntologyMigration` by `migration_id` AND `target`,
   ensuring the migration was actually scoped at the type being
   deleted.

10. **§16 open-questions table closes all 10 + the two pass-2 OAs.**
    Hand-off into tasks phase is clean — no open questions migrated
    forward as open. (B-01..B-04 above are design-internal, not
    requirements-phase carry-over.)

## FR / AC → file traceability matrix (spot check)

Verified every FR has at least one file mapping in §15. The mapping
column was thorough on the file-changes table (§15) — only FR-05
(C-05 above) and FR-12 (C-06 above) lack their backfill / non-rewrite
implementations being mapped to specific helpers.

Verified every AC has a test file in §14. AC-15 (no-frozen-import)
and AC-20 (envelope) are correctly the only unit tests; the other 18
are integration tests against a real Neo4j instance per §11.

## Scope discipline

Verified clean. No leakage:
- `process-explorer-ui` ownership of any UI surface is preserved
  (§ Scope Boundaries, requirements: out of scope).
- `chat-interface` ownership of NL→Cypher pipeline preserved (no LLM
  primitives in this spec).
- `cto-analytics` ownership of attribute-key scoring preserved.
- `graph-core` core CRUD shape (`/api/v1/nodes`, `/api/v1/edges`,
  `/api/v1/import`, `/api/v1/query/cypher`) is untouched — this spec
  only edits `bootstrap.ts` and `storage/edges.ts` (both surgical),
  and adds 16 new routes under `/api/v1/ontology/*` + `/api/v1/schema`.

## Cross-spec contract preservation

| Downstream dependency | Contract from this design | Status |
|----------------------|---------------------------|--------|
| `process-explorer-ui/FR-27` — service worker pre-cache `/api/v1/schema` | §5.1 line 544 carries `GET /api/v1/schema` returning `{nodeLabels:[…], edgeTypes:[…]}` with `?alignment=:source` filter | preserved |
| `process-explorer-ui/FR-28` — SSE subscribe to `/api/v1/ontology/events` with `Last-Event-ID` | §5.4 ships SSE handler with `Last-Event-ID` replay (modulo blocker B-02's race) | preserved with caveat |
| `chat-interface/FR-18` — server-side EventEmitter subscription | §6 + §15 ships `api/src/ontology/events.ts` exporting `ontologyEvents: EventEmitter` (modulo blocker B-03's missing emit-call code) | preserved with caveat |
| `cto-analytics/FR-10` — `/api/v1/schema` for attribute schema lookup | §5.1 line 544 covers; the per-attribute `json_schema_doc` is in the response shape per FR-14 | preserved |
| `graph-core/AC-13` — edge-pair validator continues to pass | §7.2 surgical refactor preserves error code + shape (line 813 changes only the data source) | preserved |
| `graph-core/FR-11` `/stats` keyset | After FR-15 refactor, `/stats` keyset grows from 6 fixed keys to 6+user-defined; isolation from `_Ontology*` is correctly preserved (per C-02 above) | shape changes — flag to PEU |

## Pass tracking

- This is **pass 1 of 2** for the design phase.
- Verdict is **revise**. Four blockers (B-01..B-04) require explicit
  edits to the design body before pass 2; eight concerns (C-01..C-12)
  should also be addressed but at lower priority; eight nits
  (N-01..N-08) are polish.
- Revision 2 must show resolution of every blocker. Concerns may be
  open-accepted if the tasks-phase author commits to pinning them.

## Finding counts

- Blockers: **4**
- Concerns: **12**
- Nits: **8**
- Verdict: **revise**
