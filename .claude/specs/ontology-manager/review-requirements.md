---
feature: ontology-manager
reviewing: requirements
reviewer: spec-review-agent
verdict: revise
reviewed_at: 2026-05-22
pass: 1
---

# Review: ontology-manager requirements (Pass 1 of 2)

## Summary

`ontology-manager/requirements.md` (revision 1, draft) is an
unusually-thorough first cut. The 17 FRs + 8 NFRs cover all ten OA-*
user stories, the seven risks named in the brief are all enumerated
with concrete recommendations, and every AC carries a real test file
path. The structural shape is right.

The spec is held back from approval by three blockers and four
concerns. The blockers are all about the **registry boundary**: the
spec says (FR-01) "the registry is the only source of truth" and
(NFR-02) "no code may import the compile-time const", but the runtime
shape of the registry — whether attribute schemas are persisted as
serialised zod, the deprecation/delete state machine, and the
`POST /api/v1/edges` validator's contract once `EDGE_ENDPOINTS` is
runtime-mutable — are all left implicit. Each of those would force the
design author to make a load-bearing decision that the requirements
document should pin first.

After the blockers, the spec is in good shape and the design phase
should be cheap.

## Verdict

**revise** — three blockers, four concerns, three nits. The blockers
are scoped enough that a single revision pass should close them; this
is not an "approach is wrong" rejection.

## Blockers

### B-01 — Attribute-schema storage format is undefined and load-bearing

FR-01 (line 61) declares the table `ontology_attribute_schemas` and
FR-02 (line 62) says attributes are "zod-compatible JSON shape". The
Dependencies table (line 165) says "attribute schemas in
`ontology_attribute_schemas` are JSON-encoded zod shapes; the runtime
validator builds a zod schema at attribute-check time".

This is a hand-wave. `zod` schemas are **JavaScript values**, not JSON
documents — there is no canonical JSON serialisation of a `z.object({
…})` and `zod` ships no first-party `toJSON()` / `fromJSON()`. The
real options are:

1. JSON Schema (draft 2020-12) stored as JSON, converted to zod at
   read time via `json-schema-to-zod` (or a hand-rolled converter).
2. A bespoke `{name, type, required, …}[]` shape stored as JSON,
   interpreted by a hand-written validator. Loses the "zod" framing
   entirely.
3. `zod-to-json-schema` for export and a custom parser for import.
   Lossy in both directions.

Each option has different acceptance-criteria implications. Option (1)
demands a dependency choice and a list of supported JSON-Schema
features (e.g., does it support `oneOf`? `pattern`? `format: "email"`?
nested objects?). Option (2) needs an enumerated type set. Option (3)
needs an explicit "supported subset" appendix.

This is **load-bearing for design**: FR-04 (attribute enforcement),
FR-08 (round-trip import/export), FR-11 (dry-run impact analysis),
FR-12 (invalidating-change guard), and FR-14 (schema endpoint) all
read this column. A naïve "store JSON-encoded zod" lands the design
author with a problem zod itself cannot solve.

**Fix:** state explicitly in FR-01 (or a new FR-01a) which of the
three options is the contract. A one-line commitment like "attribute
schemas are stored as JSON Schema 2020-12 documents with the
`json-schema-to-zod` library handling runtime validation; the
supported subset is `{string, number, integer, boolean, null, array,
object}` plus `required`, `pattern`, `minLength`, `maxLength`,
`minimum`, `maximum`, and `enum` — `oneOf`/`anyOf`/`$ref` are
out-of-scope" would close this entirely.

### B-02 — Deprecation lifecycle has an undefined terminal state for "delete after migration"

FR-06 (line 66) describes the deprecation lifecycle but leaves a hole.
The flow is:

1. `PATCH …{deprecated_at}` — type marked deprecated, writes still
   succeed with a `Deprecation` header, reads unchanged.
2. `DELETE` on a populated label → 409 `deprecation_required` with
   `{instance_count}`.
3. "Full removal requires an explicit `DELETE` with a prior migration
   step that nulled / remapped all instances."

Two things are unspecified that the implementer needs:

(a) **What is the precondition for a successful bare DELETE?** Is it
   `instance_count == 0`? Is `deprecated_at != null` also required? Or
   does DELETE on a non-deprecated label silently succeed if
   `instance_count == 0`? Story OA-1.3 AC-3 says "explicit migration
   step that nulls or remaps all instances first" — but a fresh,
   never-used label has no instances and no migration was needed.
   The requirements should say: "DELETE succeeds iff `instance_count
   == 0`; `deprecated_at` is recommended but not required when no
   instances exist." Otherwise a bootstrap-time `POST then DELETE` of
   a typo'd label is blocked.

(b) **Edge types vs node labels.** A label can be "populated" (has
   node rows). An edge type can be "populated" (has edge rows). The
   FR uses "instances" generically. The instance count for an edge
   type is different SQL/Cypher than for a node label — both need to
   be enumerated as the validation path, and AC-05 (line 121) only
   tests "populated label", not "populated edge type".

(c) **Edge endpoints.** What happens when you delete a `node label` L
   that is still referenced by an `ontology_edge_endpoints` row (some
   edge type still legally takes L on the from- or to-side)? The
   `EDGE_ENDPOINTS` whitelist becomes stale. Should DELETE on L cascade
   to drop endpoint rows? Refuse if any endpoint row references L?
   Neither is documented. Risk #5 ("rollback orphans") names a similar
   shape but only for rollback, not for DELETE.

**Fix:** rewrite FR-06 to enumerate the four DELETE preconditions
explicitly: (i) `instance_count == 0` (both nodes and edges); (ii) no
other edge type's `EDGE_ENDPOINTS` references this label as a from- or
to-endpoint (or specify the cascade); (iii) handling of the
edge-type-with-endpoint-rows case; (iv) the `deprecated_at` is/isn't
mandatory question. Add ACs for each precondition.

### B-03 — `EDGE_ENDPOINTS` runtime mutability changes the `POST /api/v1/edges` validator contract — but the spec never says what the new contract is

This is the spec's central architectural move and the most under-spec
part of the document. `graph-core/FR-12` validation, via
`EDGE_ENDPOINTS`, is a Cartesian whitelist evaluated against a frozen
compile-time const (graph-core design §3.2 line 237). After this spec,
that whitelist is a runtime-mutable table (`ontology_edge_endpoints`,
line 61).

The spec mentions this in three places (FR-03, FR-15, Risk #4) but
never resolves the following:

(a) **What does the validator do at the moment a new endpoint row is
   inserted?** Currently in graph-core, the validator can be a compile-
   time-narrowed switch (`EDGE_ENDPOINTS[type] satisfies …`). Once the
   set is mutable, that compile-time narrowing is gone. Does the
   validator query the registry on every edge POST? Hit a cache (which
   invalidates on FR-17's `ontology.changed`)? The performance NFR-03
   (line 85) addresses `GET /api/v1/schema` but says nothing about
   per-write validator latency.

(b) **When an edge endpoint row is *removed* — and there are existing
   edges whose `(fromLabel, toLabel)` matched the removed row — what
   happens?** FR-08 mentions "removing an `EDGE_ENDPOINTS` pair that
   has live edges" as a "schema_breaking" rejection in the import path,
   but the equivalent `PATCH /api/v1/ontology/edge-types/:name` is not
   covered. Inconsistent: import refuses, but a single PATCH might
   silently break referential validity.

(c) **`graph-core/AC-13` ("write validation rejects malformed
   payloads")** is now coupled to this spec. The requirements need to
   say either "FR-15 supersedes graph-core/AC-13's edge-pair check" or
   "FR-15 leaves graph-core/AC-13 in place, with the test now reading
   from the registry instead of the const". The current FR-15 wording
   ("bootstrap is refactored to iterate the registry") is bootstrap-
   only; it doesn't address the live write path.

**Fix:** add a new FR (call it FR-04a or fold into FR-03) that pins
the validator contract:

> The edge-write validator (`graph-core/FR-12`) is refactored to
> consult `ontology_edge_endpoints` on every `POST /api/v1/edges`.
> A 50ms-p99 in-process cache (invalidated by `ontology.changed` per
> FR-17) holds the registry snapshot. Removing an endpoint row via
> `PATCH /api/v1/ontology/edge-types/:name` with live edges that
> match the removed pair returns `400 schema_breaking` symmetrically
> with FR-08.

And add a matching AC.

## Concerns

### C-01 — Storage-backend choice deferred to design phase, but several FRs already assume one

Risk #1 (line 171) says "design phase must pick" between Neo4j and
SQLite for the registry store. That is correct as a risk to flag, but
the requirements text is internally inconsistent because:

- FR-01 (line 61) writes "SQLite (**or** Neo4j-stored)" — fine.
- NFR-01 (line 83) says "Implemented via a single Neo4j transaction
  (or SQLite transaction if the registry is SQLite-backed)" — fine.
- FR-15 (line 75) says bootstrap reconciles against "Neo4j
  constraints, creating any missing ones idempotently". This is true
  either way.
- **FR-07** (line 67) says "restores the prior schema in a single
  transaction" — but if the registry is in SQLite and the live data is
  in Neo4j, the rollback transaction crosses two stores. Two-phase
  commit is genuinely hard, and SQLite + Neo4j is one of the few
  cross-store rollback shapes Bun has no library for.
- **FR-13** (line 73) audit log writes per mutation. Cross-store, same
  issue: audit row in SQLite, live data in Neo4j, network partition
  between the two leaves an inconsistent pair.

If the design phase picks Neo4j, none of this matters. If it picks
SQLite, NFR-01's "partial-state is impossible" claim becomes a hand-
wave. **Concern not blocker** because the requirements author has
already named this as Risk #1; design phase will close it. But the
recommendation ("Neo4j with a `_meta` namespace") in Risk #1 should be
elevated to a soft default in FR-01, so the design author doesn't
have to relitigate.

### C-02 — FR-17 in-process event broadcast undermines NFR-02's "single source of truth"

NFR-02 (line 84) says no downstream code may import the compile-time
const — every reader calls `GET /api/v1/schema`. Good. But then
FR-17 (line 77) introduces an in-process `EventEmitter` for cache
invalidation, which means the downstream specs **don't** poll
`/api/v1/schema` — they subscribe to an in-process event. And the
event is only available to code running in the same Bun process as
the API.

Risk #3 (line 186) already names this — if `cto-analytics` runs as a
separate batch process, the event won't be received. But the spec's
recommendation ("all downstream code runs in the same Bun process")
silently re-tightens the deployment model from "single-tenant
self-hosted" (graph-core/NFR-08) to "single-tenant single-process",
which is a stricter constraint. `cto-analytics` is the most likely
batch surface and the natural place to run as a worker.

**Fix:** either (a) acknowledge in scope-boundaries that this spec
commits the project to a single-process deployment until further
notice (which would belong as an NFR addition, not a Risk), or (b)
add a 30-second poll-based cache fallback alongside the in-process
event, so cross-process callers degrade gracefully. The current
"recommend (a)" in Risk #3 is a design-phase decision masquerading as
a risk.

### C-03 — Audit log retention (FR-13) names "1-year minimum" but no retention enforcement mechanism is required

FR-13 (line 73) says "Audit log retention: 1-year minimum". Risk #6
(line 213) acknowledges this needs more shape ("configurable
retention window with a 0 = indefinite default, and a daily pass that
archives older rows"). The risk's recommendation is good, but at the
requirements level the spec needs an FR for the retention behaviour
itself — otherwise a strict reading lets the implementer write rows
forever and call the spec satisfied.

`graph-core` ducked this by having no retention story. This spec
introduces one and needs the matching FR + AC. (Compare: the
personal-assistant codebase has explicit retention FRs in every
memory-module spec, with daily-pass jobs — that's the bar.)

**Fix:** add FR-13a (or rename) — "audit log retention is enforced
by a daily pass that archives rows older than `OPT_ONTOLOGY_AUDIT_
RETENTION_DAYS` (default 365; 0 disables) to a compressed JSONL file
under `data/ontology-audit-archive/YYYY-MM.jsonl.gz`". Add an AC for
the archive-and-prune behaviour. NFR-04's "no history rewrite"
correctly applies to versions, not audit — archive is not rewrite.

### C-04 — AC-15 grep pattern is fragile and excludes the wrong things

AC-15 (line 131) is the coverage test for NFR-02:

> grep over `api/src/` + `pwa/src/` (excluding `graph-core/`
> baseline + the bootstrap reconciliation path) for `from .*shared/src/
> schema/(nodes|edges)` — assert zero hits outside the registry module
> + bootstrap

Three problems:

1. **`pwa/src/` should never need this import in the first place** —
   the PWA never imports server-side schema directly (it goes via REST).
   Greping `pwa/src/` for `shared/src/schema/...` is testing a path
   that wasn't a risk; the actual NFR-02 exposure is in `api/src/`.

2. **The "excluding bootstrap reconciliation path" carve-out is
   undefined.** Which file is that? `api/src/neo4j/bootstrap.ts` (per
   graph-core design §3.3) is the one place that *should* iterate the
   registry now — but FR-15 says bootstrap reads from the registry,
   not from the const, so it wouldn't trip the grep anyway. If the
   intent is "the registry implementation itself can import the
   const for the boot seed", spell that out.

3. **The `(nodes|edges)` is too narrow.** `graph-core/design.md` puts
   labels in `shared/src/schema/nodes.ts` and types in
   `shared/src/schema/edges.ts`, but if the const tuples are
   re-exported from a barrel (`shared/src/schema/index.ts`), the
   grep misses them.

**Fix:** tighten the AC. (a) Drop `pwa/src/` from the search. (b)
Name the allowlist precisely: `api/src/ontology/seed.ts` (or wherever
the boot-time seed lives) is the only legal importer of the const.
(c) Grep for `NODE_LABELS` and `EDGE_TYPES` as identifiers (these are
the symbol names per graph-core design §3.1, §3.2), not for the
file path — file paths can be aliased.

## Nits

### N-01 — FR-09's `external_alignment` schema is implicit

FR-09 (line 69) says alignment is `[{source, id}]`. Both fields are
free-text strings? Are there constraints on `source` (must be enum
of `ARTS`, `RDS`, etc.)? Story OA-2.2 AC-1 quotes "ARTS retail" as a
recommendation but doesn't constrain the value space. If multiple
specs (e.g. `cto-analytics`) need to filter on `source`, an enum vs
free-text decision changes the cardinality story. Either pin
enumerated sources in the requirements, or explicitly say "free-text;
no enumeration — the operator owns canonicalisation". Either is
defensible; silence is not.

### N-02 — FR-16 "migration step API" is marked `should` and might be misordered against FR-06

FR-16 (line 76) is the only `should` priority among 17 FRs. FR-06
(line 66) requires "explicit DELETE with a prior migration step that
nulled / remapped all instances" — FR-16 is that migration step.
Either FR-06's full-removal AC (AC-05) is testable without FR-16
(unlikely — you'd need a manual SQL/Cypher hack), or FR-16 is
implicitly `must` because FR-06 needs it. Promote FR-16 to `must`, or
clarify that the operator may use raw Cypher / SQL for migrations in
the v1 cut and FR-16 is the v2 ergonomic wrapper.

### N-03 — Several ACs say "verifies via `api/__tests__/...`" but file paths use mixed conventions

AC-01 through AC-12 use `api/__tests__/ontology-*.integration.test.ts`;
AC-13, AC-15, AC-16, AC-18 use `api/__tests__/ontology-*.test.ts`
(no `.integration.`). Graph-core's tests are all `.test.ts` without
the `.integration.` infix (see graph-core/AC-03 through AC-28). Pick
one convention. (Trivial; called out so design phase doesn't fork the
naming.)

## Pass tracking

- This is **pass 1 of 2** for requirements review. The author has one
  more pass available to address blockers.
- Pass-2 expectation: the three blockers close cleanly with
  surgical FR additions (attribute-schema storage, deprecation
  preconditions, edge-validator contract). The four concerns are
  optional polish; pass 2 should still address C-01 and C-04 because
  they have implementation impact, but can defer C-02 / C-03 to
  design if the author prefers.

## Strengths

Carrying forward from the brief:

1. **Story coverage is complete.** Every one of the ten OA-* stories
   has at least one FR plus at least one AC. Traceability column on
   FR table makes the spec-completion hook's job trivial.
2. **All seven risks named in the brief are present** (lines 171–222)
   with concrete recommendations attached. The reviewer's job for
   risks was easy — every one of them is sharp, not boilerplate.
3. **Dry-run NFR-08 is properly defined as side-effect-free** (line
   90). The temptation to "audit dry-runs too" is real and was
   correctly resisted — dry-run audit defeats the purpose.
4. **AC-13 catches the audit-log no-read-side-effects edge case**
   — calling `/schema` 10× and asserting no audit/version rows
   written. This kind of negative-property assertion is exactly what
   NFR-06 needs.
5. **Native Conflicts table populated honestly** with the
   `(none) | n/a | n/a` row plus an explanatory paragraph (lines
   151–157). Workflow rule satisfied.
6. **Platforms & Input Modes table is server-only and says so
   explicitly** (lines 138–148). Reviewer doesn't have to wonder if
   PWA surfaces were forgotten or deliberately omitted.
7. **NFR-04 (forward-only version history) is the right shape.**
   Rollback writes a new version row with `parent_version_id` pointing
   at the prior tip. Matches git's history model and avoids the
   "what was the schema as of timestamp T?" undefined behaviour
   that history-rewrite would introduce.
8. **External alignment treated as opt-in metadata, not a typing
   constraint.** Correct call — coupling ontology types to external
   reference models at the type level would lock the catalog to a
   single source.

## Finding counts

- Blockers: **3** (B-01 attribute-schema storage; B-02 deprecation
  preconditions; B-03 edge-validator runtime contract)
- Concerns: **4** (C-01 cross-store transactions; C-02 in-process
  event vs single-source; C-03 audit retention enforcement;
  C-04 AC-15 grep fragility)
- Nits: **3** (N-01 alignment-source enum; N-02 FR-16 priority;
  N-03 test naming convention)
- Verdict: **revise**
