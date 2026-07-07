---
feature: "cross-function-exec-rollup"
reviewing: "requirements"
reviewing_revision: 2
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-06"
---

# Review: cross-function-exec-rollup / requirements (pass 2/2)

## Verdict

**approve** — revision 2 resolves both pass-1 blockers (B-01, B-02) and all five
concerns (C-01..C-05) plus the three nits, without introducing any new gap. Every
dependency interface the requirements cite was re-verified against the live
codebase and the dependency specs and is real and correctly described. The
security-critical `ROUTE_PERMISSIONS` gap that made B-01 a P0 rather than a
bookkeeping miss is now named as a mandatory same-task edit and guarded by a
dedicated AC (AC-09a). This is the second and final review pass; the artifact is
ready to proceed to design.

## Resolved from pass 1

- **~~B-01~~ → resolved.** NFR-05 no longer claims "only new files." It now
  enumerates exactly four additive edits to existing files: `router.ts` (dispatch
  lines), `rbac-permissions.ts` (`P("GET","analytics/operator/…","analytics:read")`
  entries — no new permission string), `openapi.ts` (two-line hook), `pwa/src/api.ts`
  (client seam). FR-08 now spells out the router-gate skip behaviour verbatim
  ("the router gate SKIPS the RBAC check entirely when `getRoutePermission(...)`
  returns `null`, `router.ts:386-395`") and the new **AC-09a** asserts
  `getRoutePermission("GET", path)` returns `"analytics:read"` (non-null) for every
  operator route plus a `403`-without-permission case — the P0-exposure guard the
  pass-1 review demanded. Verified against the real gate: `router.ts:386-395` does
  `if (requiredPermission && requiredPermission !== "public")`, so an unlisted route
  is indeed unchecked; the perf entries `rbac-permissions.ts:40-42` reuse
  `analytics:read` exactly as claimed.
- **~~B-02~~ → resolved.** FR-09 now names the `openapi-operator.ts` new module +
  the two-line `registerOperatorPaths` import/call hook in `openapi.ts`, and NFR-05
  edit (3) + AC-11 whitelist that hook so the `git diff` gate does not flag it.
  Verified the precedent is real: `openapi-performance.ts` exists and
  `openapi.ts:108` imports `registerPerformancePaths`, called at `openapi.ts:1045`
  inside the doc builder — exactly the pattern FR-09 mirrors.

## Concerns (all resolved from pass 1)

- **~~C-01~~ → resolved.** FR-05 now contains an explicit reuse boundary: it names
  `risk-register.ts:291-366`'s `aggregation/{domain,summary}` handlers, states they
  do **not** return the per-cell `(likelihood×impact)` grid + drill-in rows, and
  requires the design's reuse check to compare the raw `?domain=` read against them
  per field. Both endpoints confirmed real (`risk-register.ts:47,65-67` for the
  `?domain=` filter; `:291` `aggregation/domain`, `:365` `aggregation/summary`).
- **~~C-02~~ → resolved.** FR-07 is now two-tier: **primary** = the SLA's own
  `domain_id` (confirmed `sla-compliance.ts:248,336,362` and the
  `/domain/:domain_id` rollup at `:232`), **fallback** = the `ALIGNED_TO` traversal,
  used only when `domain_id` is absent. AC-08 adds the exact case the pass-1 review
  asked for ("SLA with valid `domain_id` but no alignment edge → attributed to its
  function, NOT `unattributed`"). Confirmed the premise: CS FR-09 seeds SLA rows with
  `domain_id` = the CS domain id (`must`), while CS FR-10's alignment edge is priority
  `should` — so leaning on the edge as primary would have wrongly bucketed
  correctly-seeded SLAs. Now fixed.
- **~~C-03~~ → resolved.** NFR-03 demotes the ~800 ms p95 to an explicit
  "*Informative note (not a tested gate)*" and makes the round-trip **count
  invariant** the normative, CI-testable requirement, extended by the new **AC-04a**
  to the risk / funnel / SLA reads and the overview compose (not just KPI
  measurement), with a fixture that scales entity counts to prove constant round
  trips.
- **~~C-04~~ → resolved.** FR-02 now specifies a **best-effort per-signal** compose
  (a failing signal returns `200` with that field errored/absent, not a whole-overview
  `500`), and OQ-4 is pinned "no design-time reopen: overview-first single landing
  call, per-signal reads on drill-in only." OQ-3's per-panel degradation is now
  derivable from the single landing call, removing the OQ-3/OQ-4 conflict.
- **~~C-05~~ → resolved.** FR-06 now states the operator root is resolved
  **server-side** by the FR-01 lookup and traversed in one bounded Cypher, and
  explicitly disclaims reuse of `funnel-pipeline-modeling` FR-09's client-only
  `useActiveModel()` scoping ("does not and cannot reuse … a client-only pattern").

## Nits (all resolved)

- **~~N-01~~ → resolved.** Motivation ¶4 now defers the canonical-key definition to
  FR-01 ("defined once and normatively in FR-01 — not restated here to avoid drift").
- **~~N-02~~ → resolved.** FR-07 labels the `unattributed` render choice a
  "design-scoped rendering detail" rather than an unresolved gate.
- **~~N-03~~ → resolved.** AC-16 is now a CI-asserted gating step (design-conformance
  job, exits non-zero on violation), not a manual repro.

## Traceability check

| Check | Result |
|-------|--------|
| Every FR reaches a testable AC | pass — FR-01→AC-01/02, FR-02→AC-01/04a, FR-03→AC-03/05, FR-04→AC-04, FR-05→AC-06/04a, FR-06→AC-07/04a, FR-07→AC-08/04a, FR-08→AC-09/09a, FR-09→AC-02/10, FR-10→AC-12, FR-11→AC-18, FR-12→AC-13/14/15, FR-13→AC-12, FR-14→AC-17. NFR-01→AC-05/06/08/10/11, NFR-03→AC-04/04a, NFR-05→AC-11, NFR-07→AC-16 |
| Every AC traces to ≥1 FR/NFR | pass — AC-01..AC-18 + AC-04a + AC-09a all cite IDs; each has a Platforms + Verification (test path or manual repro w/ input mode + observable outcome) |
| Dependency interfaces cited are real | pass (re-verified) — `computeKpiStatus` exported `performance.ts:50`; `:KPIMeasurement{kpi_id,measured_at,value}` `kpi-trends.ts:50-53`; risk `?domain=` filter `risk-register.ts:47,65-67` + `aggregation/{domain,summary}` `:291,:365` + `likelihood/impact` 1–5 + status enum `{open,mitigating,accepted,resolved}` `:11-13`; SLA `domain_id` + `/domain/:domain_id` `sla-compliance.ts:232,248,336`; `analytics:read` reused `rbac-permissions.ts:40-42`; router-gate skip `router.ts:386-395`; `openapi-performance.ts` + hook `openapi.ts:108,1045`; `_shared.tsx` `ViewRegion/ViewHeader/Loading/EmptyState/ErrorState`; `useActiveModel` `ActiveModelContext.tsx:121`; `api`/`json`/`cypher` seam `api.ts:92,130,159`; foundation FR-03 `seedKey` enum + six domain names verbatim; CS FR-09 (`domain_id`, must) / FR-10 (alignment, should) / FR-11 (`domain="Customer Success"` verbatim) all confirmed |
| Routes/views match the blueprint View Tree verbatim | pass — `#/exec/operator` → `OperatorCockpit`, owner `cross-function-exec-rollup`, matches View Tree + foundation FR-11/FR-13; new server routes all under `/api/v1/analytics/operator*` |
| UX-* allowances covered in ACs | pass — UX-01→AC-12..15, UX-02→AC-16, UX-05→AC-17, UX-06→AC-18; Platforms & Input Modes + Native Conflicts tables present and correct (no canvas/gesture surface — `FunnelBoard` owned elsewhere) |
| XD-* honoured | pass — XD-02 (no compile-time labels/edges, NFR-02) ✓, XD-03 (no operational entities) ✓, XD-05 (PWA route-file single-ownership; only the one `views/index.tsx` VIEWS line) ✓, XD-08 (read-only, `performance.ts` never edited, parity-pinned AC-05) ✓, XD-09 (all OQs closed in-artifact) ✓ |
| No file-ownership conflict | pass — PWA: own view + one `views/index.tsx` line; server: the four shared-append additive edits are the perf-dashboard precedent (not XD-05-owned PWA files, not `performance.ts`/KPI/risk/SLA/funnel/metric code), now named in NFR-05/AC-11 |

## Summary

- Both pass-1 blockers are genuinely fixed, not merely re-worded: the change-set
  enumeration is now honest about the four additive edits, and the P0 exposure
  (routes reachable without `analytics:read` when `ROUTE_PERMISSIONS` lacks an entry)
  is closed by FR-08's explicit mechanism + AC-09a's non-null `getRoutePermission`
  guard, both matching the real `router.ts:386-395` gate.
- All five concerns were addressed at the requirement level with a concrete,
  design-inheritable contract (two-tier SLA attribution, best-effort overview compose
  with OQ-4 pinned, count-invariant normative + extended to every signal, server-side
  funnel scope, risk-aggregation reuse boundary). Every one traces to a verifiable
  interface I re-confirmed in code.
- No new blockers or concerns introduced. The one thing design should keep honest:
  `json<T>` at `api.ts:92` is module-private, so NFR-05 edit (4)'s "typed wrapper"
  must be added to the exported `api` object (which the spec already frames it as) —
  a design detail, not a requirements defect.
- Verdict: **approve** — ready for design. This exhausts the pass budget (2/2).
