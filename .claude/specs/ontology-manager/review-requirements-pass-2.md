---
feature: ontology-manager
reviewing: requirements
reviewer: spec-review-agent
verdict: approve
reviewed_at: 2026-05-22
pass: 2
---

# Review: ontology-manager requirements (Pass 2 of 2 — FINAL)

## Summary

Revision 2 closes **all three pass-1 blockers cleanly**, closes **all four
concerns cleanly**, and closes **all three nits cleanly**. The new
FRs (FR-01a, FR-04a, FR-13a) and the rewritten FR-06 / FR-17 are
surgical and well-bounded; the matching new ACs (AC-15 through AC-19) are
each rooted in a real test file path. Cross-spec dependencies with
`process-explorer-ui` (B-01, B-02) and `chat-interface` (B-01, B-02)
are satisfied — both downstream specs name `ontology-manager`-owned
`/api/v1/schema` and `/api/v1/ontology/events` and revision 2 makes
that ownership explicit (FR-14 line 102, FR-17 line 105).

No architectural regressions. Two minor new concerns surface — neither
rises to the bar of a blocker; both are scoped narrowly enough that
the design phase can absorb them. Recorded below as
**open-accepted carryovers** for design/tasks since pass-2 has no
"revise" option.

## Verdict

**approve** — 10 of 10 pass-1 findings cleanly absorbed; 0 partial,
0 regressed; 2 minor new concerns recorded as open-accepted for
design phase. Final pass.

## Pass-1 finding verification

### B-01 — Attribute-schema storage format — CLEANLY ABSORBED

Pinned in **FR-01a** (line 87). Specifically:
- Format named: **JSON Schema 2020-12** (line 87, first sentence).
- Supported subset enumerated: seven types + 14 keywords (line 87,
  middle paragraph).
- Out-of-subset behaviour pinned: `400 unsupported_jsonschema_keyword`
  with named rejected keywords (line 87, last sentence).
- Runtime converter dependency locked in Dependencies table:
  `json-schema-to-zod` (line 204).
- Risk #8 (line 251) re-states the contract operator-side.

Regression check: a passing fixture for `400 unsupported_jsonschema_keyword`
on an `oneOf`-bearing payload would catch any drift. Recommended to
the test file in the existing AC-02 (`ontology-attribute-enforcement.test.ts`)
without needing a new AC. Good.

### B-02 — Deprecation DELETE preconditions — CLEANLY ABSORBED

FR-06 (line 93) rewritten to enumerate all four preconditions explicitly:
(i) no live instances (split into node-label vs edge-type SQL/Cypher),
(ii) no registry references via `_OntologyEdgeEndpoint`,
(iii) `deprecated_at` conditional on instances-ever-existed (correctly
handles the typo'd-bootstrap-POST-then-DELETE escape hatch flagged
in pass-1),
(iv) `?confirm_migration_step_id=:id` requirement, skippable iff
(i) held continuously.

AC-05 (line 154) updated to test each precondition individually with the
exact `precondition_failed` discriminator + the never-used escape
path. Test plan reads: 5 distinct cases per precondition, all rooted
in `ontology-deprecation.test.ts`. Tight.

Regression check: AC-05 now tests both labels AND edge types (pass-1
called out that the old AC tested only labels). Confirmed in the AC-05
text (line 154: "edge-type DELETE → `edge_endpoints_referencing`").

### B-03 — Runtime-mutable EDGE_ENDPOINTS validator contract — CLEANLY ABSORBED

**FR-04a** (line 91) is exactly the new FR the pass-1 review asked for.
It pins:
- The validator reads `_OntologyEdgeEndpoint` at request time.
- 60-second LRU cache (capacity 256), invalidated by `ontology.changed`.
- Latency budget: ≤ 1 ms p99 cache hit, ≤ 50 ms p99 miss (closes
  pass-1's "NFR-03 silent on per-write" gap — also re-stated in NFR-03
  line 113).
- Symmetric `400 schema_breaking` on endpoint-row removal via PATCH
  OR via import (FR-08 import-side check). Same `details` shape.
- Supersession of `graph-core/AC-13` resolved explicitly (line 91:
  "graph-core's existing edge-pair validation test continues to pass
  but now exercises the registry-backed path").

AC-16 (line 165) is the matching test — register pair, POST edge,
PATCH-drop pair, assert `400 schema_breaking` with `affected_edge_count`.
Sharp.

### C-01 — Storage backend deferred but FRs assumed Neo4j — CLEANLY ABSORBED

FR-01 (line 86) now commits hard to **Neo4j with `_Ontology*` namespace**.
Rationale section explicit: "Single-store rationale: avoids cross-store
transaction risk; rollback (FR-07) is a single Neo4j transaction".
NFR-01 (line 111) tightened to match: "Cross-store transactions
impossible because the registry lives in Neo4j (FR-01)". Risk #1
(line 210) acknowledges the residual concern (Neo4j Browser autocomplete
pollution) — a UX nit, not architectural.

`/stats` keyset compatibility verified against `graph-core/FR-11` —
graph-core's keyset is fixed at the six built-in labels + six edge
types, and the `_` prefix correctly excludes `_Ontology*` from any
`labels(n)` filter. No conflict with `graph-core/AC-12`.

### C-02 — In-process event vs NFR-02 single-source-of-truth — CLEANLY ABSORBED

FR-17 (line 105) is dual-channel — in-process EventEmitter for
in-process callers (`graph-core` edge validator, chat backend),
**plus** Server-Sent Events at `GET /api/v1/ontology/events` for
out-of-process callers (PWA, batch workers). Both channels emit from
the same write path so NFR-02's "single source of truth" still holds —
SSE is a serialisation of the in-process event, not a parallel store.

NFR-09 (line 119) names concrete reliability behaviour: ≥ 8 concurrent
subscribers, 30 s heartbeat, `Last-Event-ID` replay with ≤ 5 min buffer.
AC-17 + AC-18 (lines 166–167) test both channels under the dual-mode
contract.

Cross-spec verification:
- `process-explorer-ui/FR-28` (line 140 there) names this endpoint
  for SW schema-cache invalidation + 5-min `ETag` polling fallback.
- `chat-interface/FR-18` (line 121 there) uses the in-process
  EventEmitter (server-side cache, co-located with chat backend) —
  also valid per FR-17's dual-channel design.

No regression. The downstream specs and this one agree on the
channel split.

### C-03 — Audit-log retention unenforced — CLEANLY ABSORBED

FR-13a (line 101) names the daily cron (03:00 operator timezone),
the env var (`OPT_ONTOLOGY_AUDIT_RETENTION_DAYS` default 365,
`0` disables), the archive path (`data/ontology-audit-archive/YYYY-MM.jsonl.gz`),
the gzip + JSONL format, the idempotency guarantee. AC-19 (line 168)
tests both the move and the idempotent re-run. Risk #6 (line 243)
documents the operator override path for stricter compliance.

Regression check: NFR-04's "no history rewrite" applies to **versions**;
audit retention is **archive**, not rewrite — the FR text is careful
to say "Archived rows are deleted from the live `_OntologyAudit`
collection" (not "rewritten"). Good.

### C-04 — AC-15 grep pattern fragile — CLEANLY ABSORBED

AC-15 (line 164) now greps for identifier names (`NODE_LABELS`,
`EDGE_TYPES`) not file paths; `pwa/src/` removed from the search;
single allowlist file named: `api/src/ontology/seed.ts`. Exactly the
shape pass-1 asked for.

Regression check: barrel-export evasion (re-exporting the const from
`shared/src/schema/index.ts`) is no longer a risk because the grep
matches the identifier, not the path. The seed file is reaffirmed in
Dependencies (line 201: "remain as TypeScript narrowing primitives
for the registry seed in `seed.ts`").

### N-01 — `external_alignment` shape implicit — CLEANLY ABSORBED

FR-09 (line 96) commits explicitly: both `source` and `id` are
**free-text**, no enumeration. Operator owns canonicalisation. Common
conventions documented (`"ARTS"`, `"RDS"`, `"ISO20022"`) but not
enforced. Decision logged.

### N-02 — FR-16 priority misordered — CLEANLY ABSORBED

FR-16 (line 104) promoted from `should` to `must` with a parenthetical
("Promoted to `must` per pass-1 N-02") flagging the dependency on
FR-06's migration-step precondition. Now AC-05 (line 154) test case
(iv) "used-then-deprecated label WITH valid migration → 204" is
genuinely testable end-to-end.

### N-03 — Test naming convention inconsistent — CLEANLY ABSORBED

Every AC test path is now `<name>.test.ts` (no `.integration.` infix).
Lines 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162,
163, 164, 165, 166, 167, 168, 169 — all uniform. Matches `graph-core`
convention.

## Pass-1 finding tally

| Category | Count | Cleanly absorbed | Partial | Regressed |
|----------|-------|------------------|---------|-----------|
| Blockers | 3 | 3 | 0 | 0 |
| Concerns | 4 | 4 | 0 | 0 |
| Nits | 3 | 3 | 0 | 0 |
| **Total** | **10** | **10** | **0** | **0** |

## New concerns introduced by the fixes

Pass-2 verification checklist:

1. **FR-14 ownership claim and `process-explorer-ui/B-01` / `chat-interface/B-01`** — VERIFIED. FR-14 line 102 declares "This endpoint did **not** exist in `graph-core` and is **introduced by this spec**." Both downstream specs (process-explorer-ui line 20, chat-interface line 19) name `ontology-manager/FR-14` as the owner. Consistent.

2. **FR-17 dual-channel and `process-explorer-ui/B-02` / `chat-interface/B-02`** — VERIFIED. process-explorer-ui/FR-28 (browser path → SSE + `Last-Event-ID`) and chat-interface/FR-18 (server-side, in-process EventEmitter) are exactly the two channels FR-17 names. Both reference `ontology-manager/FR-17` (and chat-interface line 20 references `api/src/ontology/events.ts` which is named in FR-17 line 105). Consistent.

3. **FR-04a validator contract vs `graph-core` design** — VERIFIED. `graph-core/design.md` line 1157 already names the eventual refactor as "low risk, intentional"; line 1147 risk #5 says "Bootstrap iterates `NODE_LABELS` + `EDGE_TYPES` registries; adding a type later is a one-line registry append + a new bootstrap pass. Designed for it." The `const satisfies` narrowing in `shared/src/schema/edges.ts` survives as the **TypeScript primitive for seed.ts only** (FR-15 + risk #4 in revision 2 line 227). No clash.

4. **FR-01's `_Ontology*` namespace conflict with `graph-core` stats / queries** — VERIFIED. `graph-core/FR-11` (`/api/v1/stats`) fixes the keyset to exactly the six built-in labels + six edge types — `_Ontology*` labels are **not** in that keyset, so they're trivially excluded. `graph-core/AC-12` (line 127 of graph-core/requirements.md) asserts "all six labels + all six edge types are keys" — unaffected. The `_` prefix excludes from any `labels(n)` filter in user-written Cypher (chat-interface/FR-01's NL→Cypher path is user-driven; LLM schema context from FR-18 omits `_Ontology*` because FR-14 only returns user types + base types). No collision.

5. **FR-13a archive path `data/ontology-audit-archive/` vs `graph-core` data layout** — Not yet enumerated in `graph-core/design.md` as a reserved path. Spot-checked `graph-core/design.md` and `requirements.md` for `data/` references — no reservation either way. Treating as **NEW-CONCERN-1** below (low — design phase can rename if needed).

6. **AC-15–AC-19 consistency** — VERIFIED. AC-15 verifies NFR-02 (line 164); AC-16 verifies FR-04a (line 165); AC-17 verifies FR-17 dual-channel (line 166); AC-18 verifies FR-17 SSE concurrency + replay (line 167); AC-19 verifies FR-13a retention (line 168). Each AC is traceable to one FR/NFR; each names a distinct test file. Clean.

### NEW-CONCERN-1 (open-accepted for design)

`data/ontology-audit-archive/YYYY-MM.jsonl.gz` (FR-13a, line 101) sits
under the project-level `data/` directory but `graph-core` has not
formally claimed `data/` as its own. If `process-explorer-ui` or
`cto-analytics` later wants `data/` for a different purpose (e.g.
`cto-analytics/FR-10` writes to SQLite at an unspecified path),
collision becomes possible. **Recommendation**: design phase to
pin the full path under a namespaced subdirectory
(e.g. `data/ontology-manager/audit-archive/YYYY-MM.jsonl.gz`).
Low-effort, no requirement change.

### NEW-CONCERN-2 (open-accepted for design)

**SSE replay buffer for ≤ 5 min** (NFR-09 line 119) is named at the
requirements level, but the in-memory buffer behaviour during a process
restart is undefined. After a bot restart, `Last-Event-ID`-replay
will return zero events for the previous epoch — clients that
reconnect post-restart will silently miss the gap. Whether this is
acceptable (clients fall back to ETag polling on FR-14) or
unacceptable (need persistent event log) is a design-phase call.
**Recommendation**: design phase to either (a) document that
post-restart replay returns empty and rely on the FR-28 ETag fallback
in `process-explorer-ui`, or (b) persist the last 5 min of events to
Neo4j as `_OntologyEvent` rows. (a) is the cheaper path and probably
correct for single-tenant single-process.

## Strengths of revision 2

1. **The pass-1 resolutions table at the top** (lines 43–60) is
   exactly the right artifact for a final pass — every finding maps
   to its FR + AC + line range. Saves reviewer time.

2. **FR-04a is a model of how to pin a load-bearing validator
   contract** — names the cache shape, the latency budget, the
   invalidation channel, the symmetric error code, AND the
   supersession relationship to the upstream spec's AC. Five things
   most pass-1 fixes do partially; this one does all five.

3. **FR-06's escape hatch for typo'd bootstrap-time POSTs** (line 93,
   condition iii) is exactly the operator-friendliness that the
   pass-1 reviewer was pushing on — "DELETE on a never-used label
   without prior deprecation succeeds". A strict reading of pass-1
   B-02 could have over-corrected to "deprecation is always
   required"; this revision didn't.

4. **NFR-09's concrete SSE numbers** (≥ 8 subscribers, 30 s heartbeat,
   `Last-Event-ID` with 5-min buffer) — testable values, not
   aspirations. Matches the "concrete contract" bar that pass-1's
   B-03 was applying to the edge validator.

5. **Risk #4 (line 227) explains the `const satisfies` survival
   contract** — the const tuple stays for TypeScript narrowing, no
   runtime read by any other code path. This is exactly the kind of
   nuance that lets a follow-on developer find the right level of
   "yes, the old const is still there, but here's why and how" without
   re-reading the entire history.

## Pass tracking

- This is **pass 2 of 2** for requirements review. No third pass
  available per workflow HARD CAP.
- Verdict: **approve**.
- Open-accepted concerns (NEW-CONCERN-1, NEW-CONCERN-2) carry forward
  to design phase. Neither blocks design.

## Final summary

`ontology-manager/requirements.md` revision 2 is approved.
All 10 pass-1 findings (3 blockers, 4 concerns, 3 nits) are cleanly
absorbed. Cross-spec ownership of `/api/v1/schema` (FR-14) and SSE
(FR-17) cleanly satisfies `process-explorer-ui/B-01/B-02` and
`chat-interface/B-01/B-02`. Two minor open-accepted concerns
(audit-archive path namespacing; post-restart SSE replay behaviour)
are recorded for design-phase resolution; neither is a blocker.

Move to design phase.
