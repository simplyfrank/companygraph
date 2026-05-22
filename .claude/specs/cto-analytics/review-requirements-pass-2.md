---
feature: cto-analytics
reviewing: requirements
reviewer: spec-review-agent
verdict: approve
reviewed_at: 2026-05-22
pass: 2
---

# Review: cto-analytics requirements (Pass 2 of 2 — FINAL)

## Summary

Revision 2 cleanly absorbs all four pass-1 blockers, all four concerns, four of
five nits, and all three open-nit-accepted items. The load-bearing
reproducibility chain — hash protocol (B-01), edge-shape alignment with
graph-core (B-02), weights in hash input (B-03), cache-snapshot pinning (B-04)
— now ties together into a single coherent verifiability story (NFR-05 + FR-08
+ FR-11a + AC-08 + AC-09 + AC-18) that is end-to-end testable as written.

Two minor residual issues survive:

1. **AC-02 lags FR-02** — FR-02 was renamed to `?system_id=:sid&domain_id=:did`
   per N-04, but the AC-02 verification recipe still reads
   `?system=:id&domain=:id`. The fix did not propagate.
2. **Endpoint-count arithmetic still ambiguous** — Scope says "Ten" but lists
   `GET/PATCH /settings` as a single bullet alongside two other items, which
   reads as 8 + 1 + 1 = 10 if you treat GET/PATCH as one REST surface, or 8 + 2
   + 1 = 11 if you count them as distinct endpoints. The pass-1 N-02 fix went
   from "8" to "Ten" but did not split the settings bullet to match the count.

Both are open-accepted concerns for the design phase per pass-2 finality rules
(no third revise round). Neither blocks approval — the architectural posture
is sound, all four blockers' fixes are testable, and there are no new
architectural problems introduced.

**Verdict: approve.**

## Verdict

**approve** — pass-1 findings absorbed: 14 cleanly resolved, 2 partially
resolved (open-accepted for design). 0 new blockers, 2 minor new concerns,
0 regressions to graph-core / ontology-manager invariants.

## Pass-1 findings — per-item disposition

### Blockers — all 4 cleanly resolved

| ID | Pass-1 ask | Revision-2 landing | Grade |
|----|-----------|---------------------|-------|
| **B-01** Hash protocol for `attributes_json` must canonicalise parsed-object, not stored string | NFR-05 now binds the 8-rule SHA-256 protocol verbatim. Rule (d) is precise: *"each node/edge's `attributes` field is the **parsed object** (NOT the stored `attributes_json` string) with its keys **recursively** alphabetically sorted before serialisation"*. AC-09 (c) writes `{a:1,b:2}` then `{b:2,a:1}` via PATCH and asserts hash unchanged — this exercises the parse-then-canonicalise path end-to-end. Rule (f) adds NFC normalisation; AC-09 (e) tests the `"Café"` vs `"Café"` combining-character case. | **clean** |
| **B-02** Edge `updatedAt` absent from graph-core export shape | FR-08 (c) explicitly: *"`edges` is the cache-snapshot list of `{id, type, fromId, toId, attributes_parsed, createdAt}` rows (no `updatedAt`)"*. Cross-checked against `graph-core/design.md` §3.2 line 258: `edgeReadSchema = edgeCreateSchema.extend({id, createdAt})` — no `updatedAt`. The spec correctly leans on the edge-immutability property documented in graph-core (`createdAt`-only on edges; no PATCH-edge endpoint in graph-core's route table at design.md §5.1 line 523–524). The Pass-1 review's recommended option (a) was adopted. | **clean** |
| **B-03** Weight tunability not folded into hash input | NFR-05 lists `weights` as part of the canonicalised hash tuple `{snapshot_id, nodes, edges, weights}`. FR-08 (d) names the row source: *"the `analytics_settings` weight row at PDF-render time (depth_weight, system_weight, role_weight)"*. AC-09 (d) mutates weights via `PATCH /analytics/settings`, re-renders the PDF on the same graph, asserts the hash header CHANGES, then reverts and asserts the hash REVERTS. This is exactly the test pass-1 asked for. | **clean** |
| **B-04** "Same graph" ambiguous across nightly cache boundary | FR-08 pins the hash to the **cache snapshot**: *"`snapshot_id = analytics_journey_scores.last_run_at`"* with the explicit comment *"pinning the hash to the cache snapshot, NOT the live graph"*. The PDF body includes `last_run_at` (visible in the page-1 footer alongside the hash, per FR-08's "Hash placement" subsection). FR-11a is the new `GET /api/v1/analytics/snapshot/:last_run_at` endpoint returning the exact cache contents — AC-18 walks the verifiability round-trip: render a PDF, extract `last_run_at`, hit `/snapshot/:last_run_at`, re-derive the hash using NFR-05's protocol, assert match. | **clean** |

### Concerns — 4 of 4 cleanly resolved

| ID | Pass-1 ask | Revision-2 landing | Grade |
|----|-----------|---------------------|-------|
| **C-01** Settings ungated; weight mutations rewrite future PDFs silently | FR-11 adds an `analytics_settings_audit (ts, before, after, actor)` table that writes on every `PATCH /api/v1/analytics/settings`. AC-17 verifies the row appears with prior + new value. Combined with B-03 (weights now in hash), a hash-header change visibly co-occurs with the audit row — the chain of evidence is complete. | **clean** |
| **C-02** CSV BOM was in Risks not FR/AC | FR-07 commits the exact byte sequence: *"UTF-8 file with byte-order-mark (`\xEF\xBB\xBF`), CRLF line endings, RFC 4180 quoting"*. AC-07 (c) is the byte-level assertion the pass-1 review asked for: *"first three bytes of CSV body are `EF BB BF`, line endings are `\r\n`, fields with commas are quoted per RFC 4180"*. | **clean** |
| **C-03** Critical-path truncation behaviour unspecified | FR-06 pins all three caps: depth=20, path-budget=1000, wall-clock=4s. Truncation surface is precise: `{has_cycle?: true, truncated: true, longest_partial: <chain so far>, truncation_reason: "depth_cap" \| "path_budget" \| "wall_clock"}`. AC-06 covers (a) cyclic, (b) depth_cap (30-deep linear → length=20), (c) path_budget (high-fan-out fixture). **Minor gap**: AC-06 does not include a (d) `wall_clock` truncation case — the third `truncation_reason` enum value is unexercised. Not load-bearing for correctness (the three reasons are symmetric) but the test list could be one row longer. **Carryover to design phase as Open-1.** | **clean (minor test-coverage gap)** |
| **C-04** Ontology-manager attribute schema coupling | FR-07 reads filter keys + match values from an `analytics_ai_candidate_definition` row in `analytics_settings` (defaults pinned: `{repetitive_key: "repetitive", repetitive_match: true, richness_key: "data_richness", richness_match: "high"}`). FR-10 re-validates against `ontology-manager`'s `GET /api/v1/schema` (which `ontology-manager/FR-14` explicitly OWNS — verified against ontology-manager revision-2 line 102) before each precompute; on mismatch the AI-candidate pass skips and a structured banner row lands in `analytics_alerts` with the named copy. AC-13 (d) drops `repetitive` from the ontology and asserts the banner row + skipped pass. AC-07 (b) tests the reconfigured-definition path (`PATCH` to `{repetitive_key:"manual_repeat", ...}`). The coupling is now explicit, configurable, and validated each run. | **clean** |

### Nits — 4 of 5 cleanly resolved, 1 partial regression

| ID | Pass-1 ask | Revision-2 landing | Grade |
|----|-----------|---------------------|-------|
| **N-01** AC-01 "visual inspection" vague | AC-01 now: *"snapshot test asserts every cluster's fill colour is in the 5-stop ramp `[--accent-100, --accent-300, --accent-500, --accent-700, --accent-900]` defined in `pwa/src/theme.ts`"*. Manual portion limited to "open `#/analytics/systems`, expect 6 system nodes". | **clean** |
| **N-02** Endpoint count mismatch (8 vs 10) | Scope updated to "Ten" with breakdown: 8 from FR-09 + `GET/PATCH /settings` (FR-11) + `GET /snapshot/:last_run_at` (FR-11a). The text combines GET and PATCH on `/settings` as one bullet, leaving the arithmetic ambiguous: 8 + 1 + 1 = 10 (treating GET/PATCH as one REST surface) or 8 + 2 + 1 = 11 (treating them as distinct endpoints). The Scope table on lines 109–114 separately lists `GET /api/v1/analytics/settings` and `PATCH /api/v1/analytics/settings` as two endpoints in FR-11. **Carryover to design phase as Open-2.** | **partial** |
| **N-03** Missing double-tap Native Conflicts row | Row 8 added: *"Double-tap-to-zoom on iOS Safari fires on the system map and fights canvas pan/zoom (pass-1 N-03)"* — same `touch-action: none` suppression as the pinch-zoom row, with a custom double-tap handler treating double-tap as "fit to view". | **clean** |
| **N-04** Deep-link `:id` collision | FR-02 renamed to `?system_id=:sid&domain_id=:did`. **Regression caught**: AC-02's verification recipe still reads *"click any cell, expect `process-explorer-ui` filter URL with `?system=:id&domain=:id`"* — the same old names the pass-1 review flagged. The FR update did not propagate to the AC. **Carryover to design phase as Open-3.** | **partial (AC didn't propagate)** |
| **N-05** Risk #10 "Refresh now" button is a UX decision | Moved into FR-10 as `?refresh=true` query param with lock-protection: *"every endpoint accepts `?refresh=true` which triggers a lock-protected on-demand recompute; a second concurrent `?refresh=true` call returns the in-progress run's eventual result (no double-execution)"*. AC-13 (c) tests the lock behaviour. Risk-section paragraph #10 is retained for historical context but the binding requirement now lives in FR-10. | **clean** |

### Open nits accepted — 3 of 3 resolved

| ID | Pass-1 disposition | Revision-2 landing | Grade |
|----|---------------------|---------------------|-------|
| **Open-nit-1** Hash header location on PDF | FR-08 "Hash placement" subsection pins it: *"visible page-1 footer in monospace (e.g. `"graph-state hash: 4f3a…b9c1 · cache snapshot: 2026-05-22T18:30:00Z"`) AND PDF metadata `/Subject` field (the canonical-data location)"*. AC-08 (c) verifies both. | **clean** |
| **Open-nit-2** PDF page-count budget | Resolution table commits "~5 pages" with the breakdown "top-5 + top-3 + top-3"; design phase confirms layout. Acceptable design-phase deferral — the requirements layer establishes the budget shape. | **clean (acceptable defer)** |
| **Open-nit-3** `/exec-summary/export` PWA vs API endpoint | FR-08 explicit: *"PWA-side **launcher route** that hits the API endpoint `GET /api/v1/analytics/exec-summary.pdf`; **no client-side PDF rendering**"*. Future PRs cannot accidentally render PDFs in the browser. | **clean** |

## Cross-spec invariant verification

Pass-2's mandate to verify cross-references against upstream specs:

### Against `graph-core` (rev 4 + design rev 3)

| Claim in cto-analytics | Upstream check | Status |
|------------------------|----------------|--------|
| Edge contribution uses `createdAt` only, no `updatedAt` (FR-08, NFR-05) | `graph-core/design.md` §3.2 line 258: `edgeReadSchema = edgeCreateSchema.extend({id, createdAt})`. No `updatedAt`. No PATCH-edge route in design.md §5.1 route table. | ✓ matches |
| All Cypher routes through `POST /api/v1/query/cypher` (NFR-02, FR-09, AC-11) | `graph-core/FR-07` + `graph-core/NFR-06` define the read-only Cypher passthrough; analytics-side coverage test enforces no direct driver use. | ✓ matches |
| No write paths (NFR-03, AC-12) | `graph-core/NFR-08` (no auth) + `graph-core/AC-22` (no auth grep). Analytics extends this by additionally banning import of `createNode`/`upsertNode`/`createEdge`/`upsertEdge` from `api/src/analytics/`. | ✓ matches |
| Response envelope (NFR-08) | `graph-core/NFR-05` + `graph-core/AC-20`. Same shape inherited verbatim. | ✓ matches |
| Hash uses UUIDv7 lexicographic ordering (NFR-05 rule b) | `graph-core/NFR-07` defines node + edge ids as UUIDv7. | ✓ matches |

### Against `ontology-manager` (rev 2)

| Claim in cto-analytics | Upstream check | Status |
|------------------------|----------------|--------|
| `Activity.repetitive` + `Activity.data_richness` attribute schemas registered via `ontology-manager` (Scope Boundaries, Dependencies) | `ontology-manager/FR-01a` pins attribute schemas as JSON Schema 2020-12; `ontology-manager/FR-02` + `FR-04` define attribute CRUD + enforcement. Cto-analytics correctly hard-fails-closed if those attributes are not registered. | ✓ matches |
| `GET /api/v1/schema` is the validation source (FR-10) | `ontology-manager/FR-14` explicitly: *"`GET /api/v1/schema` — owned by this spec. This endpoint did **not** exist in `graph-core` and is **introduced by this spec**"*. Lists `cto-analytics` as a named downstream consumer for *"`Activity.repetitive` / `Activity.data_richness` attribute lookup"* — explicit two-way handshake. | ✓ matches |
| Schema-drift surfacing via banner (FR-10, AC-13 (d)) | `ontology-manager/FR-06` deprecation lifecycle + `FR-13` audit log give the operator a clear path to either re-register the attribute or update the cto-analytics definition. Cto-analytics's `analytics_alerts` row is the user-facing surface. | ✓ matches |

No cross-spec invariant is broken by revision 2.

## Critical-check coverage — pass-2 framework

| # | Pass-2 check | Result |
|---|--------------|--------|
| 1 | B-01 hash protocol for `attributes_json` — parsed object, recursive sort | NFR-05 rule (d) explicit; AC-09 (c) tests via PATCH key-order permutation |
| 2 | B-02 edge `updatedAt` — leans on graph-core immutability | FR-08 (c) `createdAt` only; matches graph-core/design.md §3.2 |
| 3 | B-03 weights in hash tuple | NFR-05 hash input `{snapshot_id, nodes, edges, weights}`; AC-09 (d) tests mutation |
| 4 | B-04 cache snapshot pin + verifiability | FR-08 `snapshot_id = analytics_journey_scores.last_run_at`; FR-11a + AC-18 close the round-trip |
| 5 | C-01 settings audit | FR-11 + AC-17 — `analytics_settings_audit (ts, before, after, actor)` |
| 6 | C-02 CSV BOM | FR-07 + AC-07 (c) — byte-level assertion `EF BB BF` + CRLF + RFC 4180 |
| 7 | C-03 critical-path truncation | FR-06 + AC-06 (a)(b)(c); `wall_clock` reason exists in surface but lacks a dedicated AC row — see Open-1 |
| 8 | C-04 attribute coupling | FR-07 reads `analytics_ai_candidate_definition`; FR-10 validates against `/api/v1/schema`; AC-13 (d) covers drift |

All eight critical checks pass.

## New concerns introduced in revision 2 (carryovers to design phase)

Per pass-2 finality rules, these are **open-accepted concerns** the design
phase must close. None block approval.

### Open-1 — AC-06 lacks a `wall_clock` truncation test

FR-06 enumerates three truncation reasons: `depth_cap`, `path_budget`,
`wall_clock`. AC-06 covers the first two with named fixtures but not the
third. Design phase: add a `(d)` row to AC-06 that exercises a fixture
deliberately slow enough to trip the 4-second wall-clock budget — e.g.
a graph whose DFS branching keeps adding paths within budget but cumulative
expansion exceeds 4 s. Mock the wall clock if needed (deterministic test).

### Open-2 — Endpoint-count arithmetic in Scope reads as either 10 or 11

Scope says "Ten" but the breakdown is *"the eight from FR-09 + `GET/PATCH
/settings` (FR-11) + `GET /snapshot/:last_run_at` (FR-11a)"*. Reading
`GET/PATCH /settings` as one entry gives 8 + 1 + 1 = 10; reading it as two
distinct endpoints (which the route table elsewhere implies) gives 8 + 2 + 1 =
11. Design phase: either split the bullet into `GET /settings` and `PATCH
/settings` and update Scope to "Eleven", or document the GET+PATCH-as-one-row
convention explicitly. Cosmetic; does not affect tests.

### Open-3 — AC-02 verification recipe still uses old query-param names

FR-02 was correctly renamed to `?system_id=:sid&domain_id=:did` per N-04, but
AC-02 still reads *"click any cell, expect `process-explorer-ui` filter URL
with `?system=:id&domain=:id`"*. Design phase: update AC-02's verification
recipe text to match the FR-02 names (`?system_id=…&domain_id=…`) so the
test target is unambiguous and `process-explorer-ui` adopts the same naming
in its own FR-09.

## Finding counts

- Pass-1 findings absorbed cleanly: **14** (B-01, B-02, B-03, B-04, C-01,
  C-02, C-04, N-01, N-03, N-05, Open-nit-1, Open-nit-2, Open-nit-3, plus
  C-03 modulo the wall_clock test gap noted as Open-1)
- Pass-1 findings absorbed partially: **2** (N-02 endpoint-count
  arithmetic, N-04 AC-02 propagation)
- Pass-1 findings regressed: **0**
- New blockers introduced: **0**
- New concerns introduced (carryover to design): **3** (Open-1, Open-2,
  Open-3 — all minor)
- New nits: **0**
- Cross-spec invariant breaks: **0**

## Verdict

**approve** — revision 2 is a clean absorption of pass 1. The four blockers
are testable end-to-end (NFR-05 + AC-09 + FR-11a + AC-18 form a coherent
verifiability chain), the four concerns are pinned in FR/NFR/AC text rather
than left in Risks, and four of five nits propagated correctly through the
spec. The three carryover concerns (wall_clock AC row, endpoint-count
arithmetic, AC-02 query-param names) are surgical text edits the design phase
will close as part of writing test fixtures and route handlers.

Cto-analytics requirements are approved at revision 2; proceed to design
phase.
