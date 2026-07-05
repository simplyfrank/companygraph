---
feature: "kpi-okr-performance-dashboards"
reviewing: "requirements"
reviewing_revision: 3
artifact: "requirements.md (revision 3 — XD-02-as-amended conformance repoint)"
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-05"
history: >
  Fresh cold review (pass 1 of 2) of revision 3. Supersedes the earlier
  pass-1 file of 2026-07-04, which also returned approve; findings below
  are independently re-verified against the live codebase on 2026-07-05
  and substantially converge with that pass. The rev-2 cycle's B-01,
  C-01..C-04, N-01..N-03 are resolved in-document (Resolves: markers
  checked); the C-*/N-* ids below are NEW findings of this cycle, not
  the resolved rev-2 ids.
---

# Review: kpi-okr-performance-dashboards / requirements (rev 3, pass 1/2)

Reviewed cold against: `blueprint.md` (FINAL ARBITRATION block, XD-02 as
amended, XD-15/16/17, round-4 View Tree, UX-01..06), `.claude/CLAUDE.md`,
`_baseline` context, `kpi-okr-governance/requirements.md` (FR-10/FR-11) +
`design.md` (§3.4, V-02), `system-augmentation-model` via
`shared/src/schema/system-kind.ts`, and the live code:
`api/src/router.ts`, `api/src/routes/{roll-down,okr-crud,kpi-trends}.ts`,
`api/src/analytics/routes.ts`, `shared/src/schema/{edges,kpi-sla,system-kind}.ts`,
`pwa/src/route.ts`, `pwa/src/api.ts`, `pwa/src/views/_shared.tsx`,
`pwa/src/views/explorer/Systems.tsx`, `pwa/src/components/charts/`,
`scripts/design-conformance.ts`, root `package.json`.

## Findings

### Blockers

None.

The revision-3 change — repointing the measurement source from Postgres
`kpi_measurements` to Neo4j `:KPIMeasurement` — is complete and
internally consistent: FR-05, the store-of-record note, NFR-03, AC-01/
AC-02/AC-14, DEC-03, superseded Risk 5, and new Risk 7 all agree with
each other, with blueprint XD-02 as amended, and with what the governed
route actually reads (`api/src/routes/kpi-trends.ts:50` matches
`:KPIMeasurement {kpi_id: $id}`). The direct-driver fixture pattern
cited (governance design §3.4) is real and is the only viable seed path
(the label has no REST write path — governance V-02, confirmed). The
split-brain consequence (REST-recorded measurements invisible to the
dashboard; fresh seed shows `no_data` everywhere) is carried honestly as
Risk 7 + DEC-03 report flag rather than papered over.

### Concerns

- **C-01 — `/api/v1/analytics/` namespace cohabitation is undocumented.**
  The spec gives `pwa/src/route.ts` a careful FILE-OWNERSHIP note (Scope
  Boundaries, Risk 6) but is silent on the API-side equivalent: the
  `analytics/` prefix in `api/src/router.ts` is already occupied by the
  cto-analytics dispatchers — `analytics/graph` (:830),
  `analytics/config` (:835), `analytics/exec-summary.pdf` / `settings` /
  `snapshot/:x` (:840-844), and a single-segment catch-all
  `sub.match(/^analytics\/([^/]+)$/)` (:847) routing the BUILD-set
  report names. No functional collision exists (`performance` is not a
  report name; the catch-all is single-segment, so
  `analytics/performance/kpis` cannot be shadowed) — but a bare
  `GET /api/v1/analytics/performance` today falls into
  `handleAnalyticsReport("performance")` and 404s, and Phase C ownership
  checking has no note saying who owns which `analytics/*` matches.
  *Recommendation:* add one Dependencies/Scope sentence naming the
  cohabiting dispatcher and requiring the design's router edit to be a
  comment-anchored additive block (mirroring the route.ts treatment);
  ensure AC-06's OpenAPI path enumeration never claims the bare
  `/analytics/performance` path.
- **C-02 — status semantics undefined when thresholds are absent.**
  `warning_threshold` and `critical_threshold` are **optional** in the
  governed `kpiSchema` (`shared/src/schema/kpi-sla.ts:15-16`), yet
  FR-02/FR-05/AC-01 define `on_target`/`warning`/`breach` entirely in
  terms of those thresholds + `target_direction`. A valid governed KPI
  with a `target_value` but no thresholds has no specified status.
  *Recommendation:* pin the fallback under DEC-01 in design (e.g.
  compare latest vs `target_value` only → `on_target`/`breach`, no
  `warning` band) and add the threshold-less case to AC-01's case list
  so the single server-side authority is fully specified.
- **C-03 — FR-02's per-row sparkline wording contradicts AC-12 and
  re-opens the O(N) fan-out DEC-02 exists to close.** FR-02 says KPIs
  "each showing … a compact trend sparkline/line for the selected
  window" — read literally, the portfolio panel issues one
  `GET /api/v1/kpi-trends/:kpiId` per listed KPI, i.e. client-side O(N)
  round trips, the exact shape DEC-02/NFR-03 reject server-side. AC-12
  instead tests the sparkline "for a **selected** KPI". Also "the
  selected window" implies a window-picker control no FR specs (the
  real knob is `kpi-trends`' `window_days` query param).
  *Recommendation:* reword FR-02 so portfolio rows show status + latest
  value only and the sparkline loads lazily for a selected/expanded KPI
  (matching AC-12), with the window fixed at the `kpi-trends` default —
  no window UI in this spec.
- **C-04 — RBAC permission for the new aggregates is unstated.** NFR-02
  and the Dependencies auth row correctly keep auth in the central
  router gate, but never say *which* permission gates
  `/api/v1/analytics/performance/*`. The gate maps route→permission
  (e.g. the router's own comment at `api/src/router.ts:744`:
  `P("GET","okr-directives","okr:read") already covers …`), and the
  multi-tenant baseline has per-domain access gating
  (`hasDomainAccess`) a cross-domain portfolio read must consciously
  inherit or justify widening. *Recommendation:* one sentence in NFR-02
  or Dependencies: the aggregates reuse the read permissions of the
  governed routes they compose and inherit (never widen) their
  domain-access envelope; design records the exact permission ids.

### Nits

- **N-01** — FR-03 cites `POST /api/v1/roll-down/request-adjustment`;
  the actual mount is `roll-down/adjustment`
  (`api/src/router.ts:662`) — the spec copied the stale file-header
  comment (`roll-down.ts:19`). Harmless (this spec only reads
  `RollDownAdjustment` nodes, never calls the route), but fix the
  citation so design does not propagate it.
- **N-02** — stale line-number citations in Dependencies: directive
  list cited at `router.ts:677` (actual: `kpis` GET :703,
  `okr-directives` GET :738), `handleDomainList` at `router.ts:646`
  (actual :672; :646 area is roll-down dispatch), and
  `api.getPerformance` at `api.ts:1035` (actual :1079). Prefer symbol
  names over line numbers; the router churns.
- **N-03** — AC-09's empty variants cover the KPI panel only ("No KPIs
  yet", zero-match slice). The OKR roll-down panel's empty state (no
  directives, or no assignments for the sliced domain) is unspecced;
  extend AC-09 or have design pin it explicitly under UX-01.

## Completeness / Traceability

"Verified" = interface confirmed in the live codebase this pass
(2026-07-05).

| FR / NFR / UX | Covered by AC | Verified / feasible? | Notes |
|---------------|---------------|----------------------|-------|
| FR-01 route + additive exec tab | AC-07, AC-12, AC-13 | yes | exec `tabs` ends at `okr-management` (`pwa/src/route.ts`); `performance` id free; route + view verbatim vs View Tree (`blueprint.md:122,131`); FILE-OWNERSHIP note present |
| FR-02 KPI trend + breach status | AC-01, AC-08, AC-12 | yes (C-02, C-03) | `kpiSchema` threshold fields real but optional (C-02); per-row sparkline wording vs AC-12 (C-03) |
| FR-03 OKR roll-down panel | AC-04 | yes | four status literals confirmed in `roll-down.ts` (creates set `'pending'`, approve :1196, reject :1222); `RollDownAdjustment` create :489-498 correctly framed as a separate signal; route-name nit N-01 |
| FR-04 URL-first slicer | AC-02, AC-07, AC-09, AC-11, AC-12 | yes | central hash-param parse real (`route.ts:123-184`); `Systems.tsx` URL-first `kind` prior art confirmed (:57) |
| FR-05 KPI portfolio aggregate | AC-01, AC-02, AC-14 | yes | Neo4j `:KPIMeasurement` source correct per XD-02 amended (`kpi-trends.ts:50`); namespace free of report names but cohabitation undocumented (C-01) |
| FR-06 systemKind traversal | AC-03 | yes | `CONTRIBUTES_TO` KPI→UserJourney/Activity + `USES_SYSTEM` Activity→System real (`edges.ts:32,38`); `SYSTEM_KINDS` real; OQ-2 properly deferred with a recommendation |
| FR-07 OKR aggregate + fidelity bound | AC-04 | yes | `attributes_json CONTAINS $domainId` confirmed at `okr-crud.ts:90` and `:322` exactly as cited; inherited-envelope framing is correct and fair to the design reviewer |
| FR-08 journey axis reuse-or-add | AC-05 | yes | bounded reuse check honest: no as-built route lists `UserJourney` per domain; `journeys/*` routes are single-journey/versions/changes |
| FR-09 OpenAPI + zod 400 | AC-06 | yes | ZodError→400 mapper is governance FR-11 (real, verified in that spec); `?kind` soft-coercion honestly documented in AC-06 |
| NFR-01 read-only additive | AC-13 | yes | all-GET, additive under `/api/v1/`, no v2 bump |
| NFR-02 house rules | AC-10, AC-13 | yes (C-04) | `typecheck` script real (`package.json:20`); RBAC permission mapping unstated |
| NFR-03 perf / query-count proxy | AC-14 | yes | ≤2 Neo4j + 0 Postgres, constant in N — consistent with FR-05/DEC-03; CI proxy (spy count) is more robust than wall-clock |
| NFR-04 snake_case kept | AC-01/AC-04 shapes | yes | matches governed surface convention (governance NFR-04) |
| NFR-05 SYSTEM_KINDS import-only | AC-03 | yes | `system-kind.ts` exports exactly as described (XD-15) |
| UX-01 view states | AC-08, AC-09 | yes (N-03) | OKR-panel empty variant unspecced |
| UX-02 tokens/catalog | AC-10 | yes | `LineChartCard`/`AreaChartCard`/`KpiCard` in `pwa/src/components/charts/`; `Pill`, `Card`, `scripts/design-conformance.ts` all exist |
| UX-03 input modes | Platforms & Native Conflicts tables | yes | tables present and accurate despite no canvas work — correct per size-promotion rule |
| UX-04 responsiveness | n/a (justified) | yes | desktop-first, no new breakpoints |
| UX-05 a11y | AC-11 | yes | keyboard reach, AT state, text+icon not color alone, `main` landmark |
| UX-06 deep links | AC-07 | yes | route verbatim, reload-safe, unknown params fall back to `All` |

## Cross-checks

| Check | Result |
|-------|--------|
| Every FR maps to ≥1 AC; every AC maps back to an FR/NFR/UX allowance | pass |
| Routes/views verbatim vs blueprint View Tree | pass — `#/exec/performance` → `PerformanceDashboard`, owner slug correct, no invented/renamed route |
| XD-* honoured | pass — XD-02 (as amended) fully adopted (DEC-03); XD-15 import-only vocabulary (NFR-05); XD-16 governed base consumed, no route re-spec; XD-17 DEC-01..03 recorded, two flagged for the consolidated report |
| House rules (zod-only, en-US, no tsc, central auth gate, loopback, additive v1) | pass (C-04 asks for the permission mapping to be named, not for new auth code) |
| Scope boundaries explicit with owning spec named per exclusion | pass |
| File-ownership conflicts | pass with note — `pwa/src/route.ts` handled (Risk 6); API-side `analytics/*` dispatcher cohabitation missing (C-01) |
| Rev-2 findings resolved | pass — B-01 (FR-03/AC-04), C-01→DEC-02, C-02 (FR-08), C-03 (FR-07/AC-04), C-04 (NFR-03/AC-14), N-01..N-03 all carry visible Resolves: markers that match their claims |
| Prior-cycle staleness flag | closed correctly — design rev 3 / tasks rev 4 pin `reviewing_requirements_revision: 3` per STATUS.md |

## Verdict

**approve** — zero blockers. Revision 3 does exactly and only what it
claims: a narrow, complete, verifiable XD-02 conformance repoint, with
the split-brain consequence surfaced honestly (Risk 7). Every
load-bearing code citation checks out; the only citation defects are
stale route/line references (N-01/N-02). The four concerns share one
shape — seams left implicit that the design phase must pin visibly:
API-namespace cohabitation (C-01), threshold-less status semantics
(C-02), sparkline loading strategy aligned with AC-12 (C-03), RBAC
permission mapping (C-04). None blocks requirements approval; all four
must be visibly closed in design.md (C-02 and C-03 land naturally in
DEC-01's server-side status authority and the KPI-panel design section,
which the XD-02 conformance pass already touches).
