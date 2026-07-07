---
feature: "function-benchmark-scoring"
artifact: "requirements.md (revised, rev 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "2 of 2"
---

# Requirements Review (pass 2): function-benchmark-scoring

Re-reviewed cold against `.claude/skills/spec-review/SKILL.md`, `.claude/CLAUDE.md`,
`.claude/specs/blueprint-saas-operator.md`, the pass-1 review
(`review-requirements.md`, rev 1), and the real dependency interfaces:
`api/src/router.ts` (analytics dispatch), `api/src/auth/rbac-permissions.ts`,
`shared/src/schema/{system-kind,key-activity}.ts`, `pwa/src/api.ts`,
`pwa/src/views/business/FunctionMap.tsx`, `api/src/derive/`, and the sibling
`cross-function-exec-rollup/requirements.md` FR-03.

The rev-2 revision resolves all three pass-1 blockers and all five concerns, and
every fix was checked against reality — not just against the prose. This is now
an unusually well-traced, factually-grounded requirements doc with no remaining
blockers.

## Resolved from pass 1

- **~~B-01~~ → resolved.** FR-05 / OQ-3 / AC-05 are rewritten against the real
  closed vocabulary. Verified `shared/src/schema/system-kind.ts` exports exactly
  `SYSTEM_KINDS = ["functional","agentic","ai_predictive"]` with
  `DEFAULT_SYSTEM_KIND = "functional"` — no `manual`/`spreadsheet`/`none` kind.
  FR-05 now frames the axis as augmentation/AI-leverage
  (`ai_predictive ≥ agentic ≥ functional`), makes an activity with no
  `USES_SYSTEM` score 0, and calls out the degeneracy (Risk 8) if all seeded
  systems remain `functional`. Correct.
- **~~B-02~~ → resolved.** The route moved to the two-segment
  `GET /api/v1/analytics/benchmarks/report`. Verified the catch-all at
  `api/src/router.ts:934` is `sub.match(/^analytics\/([^/]+)$/)` dispatching to
  `handleAnalyticsReport(...)`; a three-segment `analytics/benchmarks/report`
  does not match `analytics/([^/]+)` and sidesteps it with no dispatch-ordering
  dependency. FR-07/NFR-03 also correctly distinguish the **API** `router.ts`
  (editing permitted, KAO `router.ts:446` precedent — verified present) from the
  XD-05-governed **PWA** `route.ts`.
- **~~B-03~~ → resolved.** FR-04 now makes the marked-key term an
  optional, applicability-flagged bonus (`keyMarked:false` drops it from the
  computation, not scored 0), with the three modeling-coverage ratios as the
  core. Verified `shared/src/schema/key-activity.ts:74`
  (`key: keyActivityMarkSchema.nullable()`) — unmarked renders `key:null`, so the
  common freshly-seeded case is handled honestly. Summary/Motivation now say the
  reuse is the **pattern**, not the mark data.
- **~~C-01~~ → resolved.** OQ-1 pinned to option (b); FR-02/AC-02 name the
  sub-score "share of metric-grounded KPIs on target" and show the prose
  `benchmark` as evidence only — no phantom numeric benchmark comparison.
- **~~C-02~~ → resolved.** Dependencies note that `saas-metric-library`'s own
  requirements still say `INSTANTIATES` (pre-erratum) and the live edge is
  `MEASURES`; roster line citation tightened to ~248–268.
- **~~C-03~~ → resolved.** FR-01/FR-04 now reference `cross-function-exec-rollup`
  FR-03's domain-slice traversal verbatim. Verified that sibling FR-03 defines
  exactly this rule ("`domain_id` resolves to the function-domain id, and/or an
  `ALIGNED_TO` edge reaches an entity `PART_OF` that domain — the same
  domain-slice traversal `performance.ts` uses"). The two wave-3 specs now
  attribute KPIs identically.
- **~~C-04~~ → resolved.** OQ-6 pinned to empty-`200` (`modelId:null`,
  `functionCount:0`); FR-08/AC-08/AC-12 now encode the single branch (no new
  `ERROR_CODES`, single empty state) instead of hedging both.
- **~~C-05~~ → resolved.** FR-09 pinned to `analytics:read`, no `query:read`
  fallback. Verified `api/src/auth/rbac-permissions.ts:31–42` maps `stats`,
  `analytics/graph`, and `analytics/performance/*` to `analytics:read`; the
  matcher splits paths on `/` and orders specific-before-parameterized, so a
  three-segment `analytics/benchmarks/report` entry registers cleanly.
- **~~N-01/N-02/N-03~~ → addressed.** Summary still verbose but acceptable; the
  derive path `api/src/derive/function-benchmark-score.ts` is now named
  consistently (KAO precedent `api/src/derive/key-activity-score.ts` verified to
  exist); the `meta.truncated` field and truncation banner are removed (N-03), and
  AC-12/FR-11 explicitly say no truncation banner ships at v1.

## Blockers

None.

## Concerns

### C-06 — "System-augmentation" vs `automation` wire key naming is internally inconsistent (cosmetic, but pin it before design)
FR-05/FR-06 name the sub-score "System-augmentation level" but the wire key is
`automation` (`{metricBenchmark, coverage, automation}`), and the composite
weight key is `automation` too. After the B-01 correction the axis is explicitly
augmentation/AI-leverage, not automation — so the `automation` key is a slight
misnomer that could re-seed the very manual-vs-automated confusion B-01 removed.
This is not a blocker (the semantics in FR-05 are now correct and unambiguous),
but design should either rename the key to `augmentation` or add a one-line note
that `automation` is the legacy key for the augmentation sub-score, so the
implementer does not reintroduce a "manual" reading. Recommendation: pick the key
name in design §wire-shape and use it verbatim in the view (FR-10) and tests
(AC-05).

## Nits

### N-04 — FR-04 KPI-coverage ratio depends on the same domain-slice traversal; make the design reuse explicit
FR-04's third core ratio ("share covered by a KPI") uses "the same domain-slice
traversal as FR-01/`cross-function-exec-rollup` FR-03." That is correct, but the
activity-level KPI-coverage question ("is *this activity* `ALIGNED_TO`/`PARAM_BINDS`
by a function KPI") is a finer grain than FR-03's function-level scoping. Design
should confirm the single scoped read from FR-01 already carries per-activity
alignment edges so FR-04 does not issue a second N-per-activity traversal
(perf hygiene, not correctness). Optional.

### N-05 — AC-08 bundles four assertions into two test files
AC-08 covers determinism, isolation, authz, OpenAPI presence, and the no-new-error-code
invariant across `function-benchmark-authz.integration.test.ts` +
`function-benchmark-openapi.integration.test.ts`. That is fine, but tasks should
split these so a failing determinism assertion is not buried in an authz test
file. Optional; a tasks-phase concern.

## Completeness / Traceability

Every FR maps to ≥1 AC and every AC back to ≥1 FR. No structural gaps; the two
remaining items are cosmetic (C-06) and design-hygiene (N-04/N-05).

| FR | Covered by | Notes |
|----|-----------|-------|
| FR-01 model-scoped read | AC-01, AC-08 | KPI attribution now references sibling FR-03 (C-03 resolved); root discovered by marker, not hard-coded — verified |
| FR-02 metric-grounded KPI-vs-target | AC-02 | OQ-1(b) pinned; prose `benchmark` = evidence only; `metricGrounded:false` applicability. Honest |
| FR-03 KPI-vs-target verdict (self-owned) | AC-03 | Mirrors `performance.ts` band rule in own `api/src/derive/` module; no-import grep asserted. `api/src/derive/` confirmed to exist |
| FR-04 coverage sub-score | AC-04 | Three core ratios + optional applicability-flagged marked-key bonus (B-03 resolved); `key:null` unmarked case verified |
| FR-05 augmentation sub-score | AC-05 | Real closed enum `{functional,agentic,ai_predictive}` (B-01 resolved, verified); no-`USES_SYSTEM`=0; degeneracy called out. Wire key `automation` — C-06 |
| FR-06 composite + rank | AC-06 | Applicable-only denominator, deterministic `seedKey` tiebreak, code-default weights. Well specced |
| FR-07 endpoint | AC-01, AC-08 | Two-segment path sidesteps catch-all at `router.ts:934` (B-02 resolved, verified); empty-`200` no-root (OQ-6/C-04 resolved) |
| FR-08 openapi + no new error code | AC-08 | Empty-`200` ⇒ no `ERROR_CODES` addition; own OpenAPI test. Consistent |
| FR-09 RBAC mapping | AC-08 | `analytics:read` pinned (C-05 resolved); confirmed present in `rbac-permissions.ts:31–42` |
| FR-10 BenchmarkReport view | AC-10, AC-14 | Route verbatim from View Tree; `from "../_shared"` import per `FunctionMap.tsx` — verified that file imports exactly those catalog components that way |
| FR-11 four view states | AC-10..AC-13 | All four; single empty state covers both no-root and no-content (OQ-6). No truncation banner (N-03 resolved) |
| FR-12 keyboard + deep-link | AC-15, AC-16 | Read-only, no write UI; deep link survives reload |
| NFR-01 isolation + read-only | AC-07, AC-08 | `scopedNodeIds` consumed; pre/post `/api/v1/stats` diff = 0 |
| NFR-02 no new label/edge/store | AC-07, AC-09 | git-diff guard on schema arrays; live compute, no persistence |
| NFR-03 route-file ownership | AC-09 | PWA `route.ts`/`SURFACES` untouched; one `views/index.tsx` line; API `router.ts` edit permitted + distinguished (B-02) |
| NFR-04 descriptive/explainable/deterministic | AC-06, AC-08 | No recommendation field; byte-identical repeated calls. Exemplary |
| NFR-05 ownership boundaries | (invariant) | Cross-checked against real owners — accurate |
| NFR-06/07 house rules + tokens | AC-09, AC-14 | zod-only, no tsc, loopback, central auth, tokens-only, catalog-first |

**Done well:** every pass-1 blocker was corrected against the actual interface,
not paraphrased around — the `SYSTEM_KINDS` enum, the `router.ts:934` catch-all,
the `key:null` unmarked schema, and the `analytics:read` family were each fixed to
match reality (I re-verified all four). The descriptive-only invariant (NFR-04) is
enforced in wire shape, view, and an AC; the read-only invariant has a real
behavioral pre/post-diff test (AC-07); the KPI→function scoping is now shared with
the sibling spec rather than freshly invented; and the Platforms & Input Modes +
Native Conflicts tables correctly record a read-only surface with no new gestures.

## Verdict: approve

Zero blockers. All three pass-1 blockers and five concerns are resolved and were
independently verified against the codebase and the sibling spec. Two minor
concerns/nits remain (C-06 wire-key naming, N-04/N-05 design-hygiene) — record
them as open notes for the design phase; none blocks moving to design. Ready as-is.
