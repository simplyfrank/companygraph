---
feature: "cross-function-exec-rollup"
reviewing: "design"
artifact: "design.md (revision 1)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "2 of at most 2 (re-review of revision 1)"
---

# Design Review: cross-function-exec-rollup (revision 1)

## Summary

Revision 1 resolves both pass-1 blockers cleanly, and every resolution checks
out against the actual codebase. The SLA path — the sole locus of both blockers —
was rebuilt around `handleSlaComplianceAllGet` (`sla-compliance.ts:351`), which
is the correct governed read: it enumerates **every** non-archived SLA and
returns `domain_id` per row (`sla-compliance.ts:360-363,375`), **including
null-`domain_id` SLAs**, giving the `unattributed` bucket the read path it
lacked (B-01). `latestBreachAt` is now sourced from one batched
`max(b.breach_at)` Cypher on `/slas` only, omitted from the overview (B-02) —
`SLABreach.breach_at` exists (`sla-compliance.ts:59-60,283`) so the query is
feasible, and it is constant in SLA count, reconciled with AC-04a.

All four pass-1 concerns and three nits are addressed inline with citations
(DD-06/§4.3 risk `Response`/`.json()`/`.data` contract; DD-09/§4.4 funnel
slice-fallback; DD-12/§4.6 count-invariant wording; DD-05/§4.2 `RETURN DISTINCT`
+ cited `performance.ts:131-136`). Every load-bearing code claim I spot-checked
is real and correctly line-cited: `computeKpiStatus` export (`performance.ts:50`),
`DOMAIN_FILTER` `ALIGNED_TO … PART_OF*1..2 ->(:Domain {id:$domain})`
(`performance.ts:131-135`), `handleRiskRegisterList → ok({ data: risks })`
(`risk-register.ts:110`) filtering free-text `?domain=` (`:65-67`) ordered by
`(likelihood * impact)` (`:107`), the router `analytics/graph`-first ordering
(`router.ts:910`), the `getRoutePermission` null-skip P0 seam (`router.ts:386`),
the RBAC `analytics:read` precedent (`rbac-permissions.ts:40-42`), the
`registerPerformancePaths` OpenAPI hook (`openapi.ts:108`), the `parseWith`/`ok`/
`error`/`ValidationError` helpers (`_helpers.ts`), and the `VIEWS`
`(r) => <View route={r} />` signature (`views/index.tsx`).

No blockers remain. Three residual concerns (one newly surfaced by the revision's
own SLA rewrite, two carried forward) are all execution-time, non-blocking. Given
the review budget is exhausted (this is pass 2 of 2), the verdict is **approve**
with the concerns recorded for the tasks phase to honour.

## Findings

### Resolved from pass 1

- **~~B-01~~ → resolved.** The `unattributed` SLA read path now exists.
  DD-10/§4.5 switch the primary read from the per-function
  `handleSlaComplianceByDomainGet` (which MATCHes `(s:SLA {domain_id:$id})`,
  `sla-compliance.ts:248` — verified, cannot surface null-`domain_id` SLAs) to
  `handleSlaComplianceAllGet` (`sla-compliance.ts:351`). Verified: that handler
  MATCHes `(s:SLA) WHERE s.archived_at IS NULL` with **no** `domain_id`
  predicate and returns `s.domain_id` per row (`:362,375`), so null-`domain_id`
  SLAs are enumerated and can fall to tier-3 `unattributed`. AC-08 is now
  satisfiable.
- **~~B-02~~ → resolved.** `latestBreachAt` no longer implies an N-per-SLA read.
  DD-11/§4.5 source it from a single batched
  `MATCH (b:SLABreach) WHERE b.sla_id IN $slaIds RETURN b.sla_id, max(b.breach_at)`
  issued only by `/slas` (never the overview). Verified: `SLABreach.breach_at`
  exists (`sla-compliance.ts:59-60,283`), and the `all`/`domain` rollups indeed
  omit `latestBreachAt` (`sla-compliance.ts:391-402` set `breach_at:""` and
  return only `breaches:{total,open}`), so the extra batched read is genuinely
  required and is constant in SLA count — consistent with AC-04a's 1-vs-20-SLA
  fixture.
- **~~C-01~~ → resolved.** DD-06/§4.3 now spell out the exact invocation
  contract: `new Request("http://internal/api/v1/risk-register?domain=…")`,
  `await` the handler, `await res.json()`, read `.data`, treat non-200 as a
  per-signal error. Matches the real `ok({ data: risks })` shape
  (`risk-register.ts:110`).
- **~~C-02~~ → resolved.** DD-09/§4.4 add the funnel slice-fallback: when no
  `functionSeedKey`-marked funnel exists for the root, a `?function=` slice
  degrades to the operator-root `modelId` scope (returns all operator funnels,
  `unattributed:[]`); once content stamps the marker it self-tightens. Keeps the
  sliced panel non-empty today. AC-07 sub-case noted.
- **~~C-03~~ → resolved.** DD-12/§4.6/NFR-03 now state the invariant is
  "independent of per-function **entity** count," with the risk signal honestly
  ≤6 (one per function). AC-04a is directed to assert against entity count, not
  function count.
- **~~C-04~~ → resolved.** §4.2 cites `performance.ts:131-136`, owns the flat
  `k.domain_id` disjunct as a band-neutral **scope** superset (the perf
  `DOMAIN_FILTER` is `ALIGNED_TO`-only; verified `performance.ts:129-135`), and
  adds `RETURN DISTINCT` to collapse double-matches. Parity is pinned on bands
  only (DD-04 imported `computeKpiStatus`), not scope — contract-safe.
- **~~N-01~~ → resolved** (§7.5 note on `()=>`→`(r)=>route`).
  **~~N-02~~ → resolved** (§7.3 `unattributed` renders as a trailing labelled
  group). **~~N-03~~ → resolved** (§4.1 resolver property-name check promoted to
  a T-02 Definition-of-Done hard gate).

### Concerns (non-blocking; carry to tasks/execution)

**C-05 (new, surfaced by the revision's SLA rewrite) — `breachCount`/`health`
are window-scoped but `latestBreachAt` is all-time, so they can disagree.**
`handleSlaComplianceAllGet` filters breaches by `window_days`
(`sla-compliance.ts:385`, `b.breach_at >= $windowStart`), so `breaches.total`
(→ `breachCount`, DD-11) and `breaches.open` (→ `health`, DD-11) reflect **only
in-window** breaches (default window). But the design's Read-2 batched
`max(b.breach_at)` query (§4.5) applies **no** window filter, so it returns the
latest breach across all time. Result: a `/slas` row can show a non-null
`latestBreachAt` (an old breach) alongside `breachCount: 0` and
`health: within_target` — internally inconsistent to a reader of that row.
**Recommendation:** in the tasks phase, either (a) apply the same
`window_days` bound to the Read-2 breach query so all three fields share one
window, or (b) document in §4.5 that `latestBreachAt` is deliberately all-time
("most recent breach ever") while `breachCount`/`health` are window-scoped, and
add an integration-test assertion pinning the chosen semantics. Not a blocker —
the fields are individually correct; only their juxtaposition is ambiguous.

**C-06 (carried) — the `exec` surface-map key the design edits does not yet
exist, and `PerformanceDashboard` is registered under `insights`, not `exec`.**
DD-14/§7.5 describe rewiring "the `operator` key in `pwa/src/views/index.tsx`'s
`exec` surface map" from a foundation-supplied `BusinessTabPlaceholder`.
Verified: `views/index.tsx` today has **no** `exec` key and **no** `operator`
key or `BusinessTabPlaceholder` (the closest analogue, `PerformanceDashboard`,
lives under the `insights` surface map). This is consistent with the design's own
statement that `saas-operator-foundation` is a not-yet-landed dependency that
registers the tab + placeholder first (XD-05) — so it is forward-carried risk,
not a design error. **Recommendation:** the T-0x view-registration task's
Definition-of-Done must assert against the **actual** surface-map key the landed
foundation uses (whether `exec` or otherwise) and the actual placeholder name,
rather than the assumed `exec`/`BusinessTabPlaceholder` — mirroring the N-03
resolver-property gate. One integration/render test that resolves
`#/exec/operator` → `OperatorCockpit` (AC-12) closes it.

**C-07 (carried, minor) — `openapi.ts` hook line citation is off.** DD-15/§6
cite "`openapi.ts:108,141`" for the two-line hook. Verified: the import is at
`openapi.ts:108` (correct) but the `registerPerformancePaths(registry)` call is
at `openapi.ts:1045`, not `:141`. The pattern and edit are substantively correct;
only the line number for the call site is wrong. **Recommendation:** the
implementer should place the `registerOperatorPaths(registry)` call adjacent to
`registerPerformancePaths(registry)` (`openapi.ts:1045`), not at :141.

## Completeness / Traceability

FR coverage:

| FR | Design element | Status |
|----|----------------|--------|
| FR-01 | DD-02 resolver, §4.1 | covered |
| FR-02 | DD-12 overview compose, §4.6, §3.3 envelope | covered |
| FR-03 | DD-04/DD-05, §4.2 | covered |
| FR-04 | DD-05 Neo4j-only batched read, §4.2 | covered |
| FR-05 | DD-06/DD-07, §4.3 | covered |
| FR-06 | DD-08/DD-09, §4.4 | covered (slice-fallback resolves C-02) |
| FR-07 | DD-10/DD-11, §4.5 | **covered** — B-01/B-02 resolved; see C-05 (window semantics) |
| FR-08 | DD-15/1-2, §5 | covered (RBAC null-skip P0 seam verified) |
| FR-09 | DD-01/DD-15/3, §6 | covered (see C-07 line cite) |
| FR-10 | §7.1 | covered |
| FR-11 | DD-13, §7.3 | covered |
| FR-12 | DD-12, §7.2 | covered |
| FR-13 | DD-14, §7.5 | covered (see C-06 surface-map key) |
| FR-14 | §7.3 deep-links | covered |
| NFR-01 | §8 untouched-files allow-list | covered |
| NFR-02 | no schema-array edits (§8) | covered |
| NFR-03 | DD-05/DD-12 batched, per-entity-invariant wording | covered (C-03 resolved) |
| NFR-04 | DD-04 parity, §3 snake_case | covered |
| NFR-05 | DD-15 four enumerated edits | covered |
| NFR-06/07 | §7.1 tokens/catalog | covered |

AC coverage (§8.1 trace confirmed against design elements):

| AC | Design element | Status |
|----|----------------|--------|
| AC-01 | §4.1 + §4.6 all-zero row | covered |
| AC-02 | DD-03 enum + `parseWith` 400 (`_helpers.ts:84` verified) | covered |
| AC-03 | §4.2 status + tally | covered |
| AC-04 | §4.2 batched ≤2 RT, no pg import | covered |
| AC-04a | §4.3/4.4/4.5 + §4.6 per-entity invariant | covered (B-02 reconciled; C-03 wording) |
| AC-05 | DD-04 imported `computeKpiStatus` + parity test | covered (`performance.ts:50` verified) |
| AC-06 | §4.3 heatmap by verbatim name (raw `?domain=`, `risk-register.ts:110` verified) | covered |
| AC-07 | §4.4 scope + conversion + slice-fallback | covered |
| AC-08 | §4.5 `sla-compliance/all` enumerates null-`domain_id` → tier1/2/3 | **covered** (B-01 resolved; `sla-compliance.ts:351,362,375` verified) |
| AC-09/09a | §5 RBAC entries + null-skip guard | covered (`router.ts:386`, `rbac-permissions.ts:40-42` verified) |
| AC-10 | §6 OpenAPI module + hook | covered (see C-07 line cite) |
| AC-11 | §8 allow-list | covered |
| AC-12 | §7.1 four panels + §7.5 registration | covered (see C-06 surface-map key) |
| AC-13/14/15 | §7.2 states + per-panel error | covered |
| AC-16 | §7.1 tokens/catalog + design-conformance | covered |
| AC-17 | §7.3 keyboard + landmark + Enter | covered |
| AC-18 | DD-13 URL-first survives reload | covered |

**Done well (acknowledged).** This design's homework holds up under a cold
line-by-line audit: the pass-1 blockers were not merely re-worded but fixed with
the one governed read (`handleSlaComplianceAllGet`) that actually surfaces the
missing rows, and every line citation the revision added
(`sla-compliance.ts:351/362/375`, `performance.ts:131-136`, `router.ts:910`,
`risk-register.ts:110`) is accurate. The best-effort-per-signal overview compose
(DD-12) and the security-critical RBAC-entry-per-route framing (DD-15) remain
correct. The N-03 resolver-property gate and the honest OQ-D1 funnel-attribution
degradation are exactly the kind of forward-carried risk a design should name
rather than hide.

## Verdict

**approve** — both pass-1 blockers (B-01 `unattributed` SLA read path;
B-02 `latestBreachAt` source vs AC-04a) are resolved with codebase-verified
reads, and all pass-1 concerns/nits are addressed. Three residual concerns
(C-05 window-vs-all-time SLA field semantics — newly surfaced; C-06 the actual
foundation-owned surface-map key/placeholder name; C-07 the `openapi.ts` call-site
line number) are all execution-time and non-blocking; they are recorded here for
the tasks phase to honour via Definition-of-Done checkpoints. The design is ready
to proceed to tasks.
