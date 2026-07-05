---
feature: "kpi-okr-performance-dashboards"
reviewing: "design"
reviewing_revision: 3
artifact: "design.md (revision 3, against requirements revision 3 / blueprint FINAL ARBITRATION 2026-07-04)"
reviewer: "spec-review-agent (fresh; did not author)"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-05"
supersedes: "review-design.md of 2026-07-04 (rev-3 cycle pass 1, verdict approve) — fresh cold pass ordered by the orchestrator; prior-ledger IDs retained where findings independently reconverge"
---

# Review: kpi-okr-performance-dashboards / design (fresh cold pass 1/2, revision 3)

Reviewed cold against `requirements.md` rev 3, `blueprint.md` (FINAL
ARBITRATION 2026-07-04 block, XD-02 as amended, round-4 View Tree,
UX-01/02/05/06), `.claude/CLAUDE.md`, the dependency specs
(`kpi-okr-governance` design §3.4, `system-augmentation-model`), and the
live codebase. Every load-bearing factual claim in the design was
re-verified against source this pass (table below). Finding IDs continue
the ledger cited inside design.md (B-01..B-03, C-01..C-06, N-01..N-04)
to avoid ID collisions; where this pass independently re-derives a
finding from the superseded 2026-07-04 review, the same ID is kept.

## Verdict

**approve** — zero blockers. The architecture is sound and honest: a
GET-only additive aggregate tier + a pure-renderer view; XD-02-as-amended
implemented exactly (single-store `:KPIMeasurement`, ≤ 2 Neo4j / 0
Postgres); the awkward as-built truths (substring directive matching,
seed-only `CONTRIBUTES_TO`, no `:KPIMeasurement` write path) are carried
as documented risks rather than silently "fixed" off-scope. Two concerns
(one already resolved downstream in tasks rev 4) and four nits.

## Findings

### Blockers

None.

### Concerns

- **C-07 — §8's query-count spy is unobservable under §8's own HTTP
  harness; the in-process mechanism must be the operative wording.**
  §8 frames integration tests as "HTTP against `127.0.0.1:8787`" while
  AC-14 and the §4.5 N-03 budget are verified by spying `session.run`
  (and asserting zero `pg` `query` calls). A test process cannot spy
  calls inside a separately running server process; there is no driver-
  spy precedent in `api/__tests__/` that works over HTTP. As written,
  the design's verification story for AC-14 and the `/okr` two-read
  assertion is self-contradictory. **Status/recommendation:** tasks.md
  rev 4 (per STATUS.md, its rev-3-cycle B-01) already pins the correct
  mechanism — invoke `handlePerformanceKpis`/`handlePerformanceOkr`
  **in-process** with a constructed `Request` against live Neo4j,
  wrapping the `getDriver()` singleton's `session()` to count `run`
  calls, plus a **static no-Postgres-import assertion** on
  `api/src/routes/performance.ts` (cheaper and stronger than spying
  `Pool.prototype.query`; §7 already states "no Postgres client
  import"). Not re-opened as a blocker because the operative fix is
  pinned downstream and flagged to Phase C; if design.md is touched
  again for any reason, fold the one-paragraph §8 correction in then.

- **C-08 — multiple `:RollDown {type:'okr'}` anchors per directive can
  emit duplicate `(directive_id, domain_id)` rows in `domains[]`; §4.5
  does not pin a disposition.** Verified: each `POST /roll-down/okr`
  `CREATE`s a fresh `:RollDown` node (`roll-down.ts` ~250-257 — no
  MERGE), so a directive rolled down twice contributes assignment rows
  from *both* anchors to Read B, and the §4.5 fold will render the same
  domain twice in that directive's panel row. Realistic (any re-issued
  roll-down). **Recommendation (one line, executor-recordable in the
  T-04 handler comment):** either dedupe per `(directive_id, domain_id)`
  with latest roll-down (`r.createdAt`) winning, or document that
  duplicates surface as-is matching the governed `handleOkrRollDownGet`
  list behavior. AC-04 asserts neither way, so this is implementer
  latitude — but it should be a recorded choice, not an accident.
  (Recorded as N-06 in the superseded review/STATUS.md; this pass rates
  it a concern: it is a response-contract edge case, not cosmetics.)

### Nits

- **N-05 — stale line-number anchors (drift re-measured this pass).**
  `router.ts:804` → the `// Graph analytics routes` block is now at
  `api/src/router.ts:829-830`; `route.ts:76` → the `exec` surface header
  is at `pwa/src/route.ts:78` and the `okr-management` row the append
  follows is at `:86`; `KpiCard.tsx:11` → the `tone` union is at `:8`;
  `api.ts:1035` → `getPerformance` is at `:1079`; `api.ts:200` →
  `domains` is at `:208`. Every named artifact exists and is correctly
  described — cosmetic. The design's own C-05 rule (anchor by
  handler/comment name, not line) is right; these residual line cites
  just predate it. Executors follow names.
- **N-07 — `computeKpiStatus` is not total over its own declared row
  type: null `target_value` unpinned.** §3.2 declares
  `target_value: z.number().nullable()` but the §4.2 pseudo-code pins
  only null *thresholds* and null *latest*. As-built `kpiSchema`
  requires `target_value` (`shared/src/schema/kpi-sla.ts:13`), so this
  is defensive-only — but in TS `v >= null` coerces null to 0. Add
  `target_value == null → "no_data"` and one unit case in the AC-01
  pure-fn leg (T-02).
- **N-08 — "four handlers" vs three.** §4.1 opens with "`performance.ts`
  exporting four handlers" but defines three dispatch lines and §7 says
  "three handlers" (the fourth surface is the existing `kpi-trends`
  route, as §4.1 itself then clarifies). Say "three handlers" in §4.1.
- **N-09 — factory-row citation slightly off.** §6 says the
  `"performance": (r) => <PerformanceDashboard route={r} />` row matches
  "the existing `#/exec/*` factory rows" — the exec rows are all
  zero-arg (`() => <ExecOps />`, `views/index.tsx:137-145`); the
  `(r) =>` signature matches the *explorer* rows (`:74-84`). Harmless —
  `ViewMap` is `Record<string, Record<string, (route: Route) => ReactNode>>`
  so the row type-checks either way — but cite explorer, not exec.

## Claim verification (this pass, against source)

| Design claim | Verified |
|---|---|
| `:KPIMeasurement {kpi_id, measured_at, value}` is the `kpi-trends` source | yes — `api/src/routes/kpi-trends.ts:50`; `kpiMeasurementSchema` at `kpi-sla.ts:49-52`, `measured_at: z.string().datetime()` → the ISO string-ordering claim in §4.2 Read 2 holds |
| `target_direction` enum + optional thresholds as designed | yes — `kpi-sla.ts:13-16`; `warning_threshold`/`critical_threshold` optional → §4.2 null-degradation branches are needed and present |
| Roll-down topology: `(:RollDown {type:'okr'})-[:FOR_OKR]->(:OKRDirective)`, `-[:HAS_ASSIGNMENT]->(:RollDownAssignment)-[:FOR_DOMAIN]->(:Domain)`; no `ROLLS_DOWN_TO`/`ASSIGNS` edge types | yes — `roll-down.ts:343-345, 390-393`; `edges.ts` has neither invented type |
| `a.weight` exists, no `a.contribution`; `a.domain_id`/`a.status` properties; status transitions to `approved`/`rejected` | yes — `roll-down.ts:535, 566-567, 1196, 1222`; assignment CREATE sets `status:'pending'`, `domain_id` (`:270-277`) |
| `:RollDownAdjustment {roll_down_id, domain_id, status:'pending'}` linked by properties, not edges | yes — `roll-down.ts:489-499` |
| `KeyResult.attributes.progress` 0..100 inside `attributes_json`; `HAS_KEY_RESULT` | yes — `okr-crud.ts:52, 250, 323` |
| Governed directive predicates: `CONTAINS $domainId` (by-domain), `NOT … CONTAINS '"domain_id"'` (top-level) | yes — `okr-crud.ts:90, 127, 322` |
| Flat `k.domain_id` on KPI (branch (a) of the domain filter) | yes — `kpi-crud.ts:40, 63, 81` (nullable) |
| `CONTRIBUTES_TO: KPI→UserJourney, KPI→Activity` | yes — `edges.ts:38`; `PART_OF*1..2` covers both endpoint shapes |
| New routes not shadowed by cto-analytics matchers | yes — `^analytics\/([^/]+)$` (`router.ts:847`) is single-segment and the snapshot regex (`:843`) is `analytics/snapshot/…`; `analytics/performance/kpis` falls through to the new literals placed after `analytics/graph` (`:830`) |
| RBAC null-skip hole + `analytics:read` precedent + same-task entry rule | yes — `rbac-permissions.ts:32` (`P("GET","analytics/graph","analytics:read")`), skip-on-null comments at `:261-262, 298`, `getRoutePermission` returns `null` at `:361` |
| `parseWith` ZodError→400 mapper exists for reuse | yes — `_helpers.ts:84` |
| APOC available for `apoc.convert.fromJsonMap` | yes — `docker-compose.yml:19-20` (`NEO4J_PLUGINS: '["apoc"]'`, procedures unrestricted) |
| DD-07 reuse check (no governed per-domain journey list) | yes — `journeys*` router block is single-journey/versions/changes; `/nodes/:label` is single-node CRUD; adding `/analytics/performance/journeys` is justified |
| `SYSTEM_KINDS`/`SYSTEM_KIND_LABELS`/`systemKindSchema` + export-subpath pattern | yes — `system-kind.ts:9-15`; `shared/package.json:13` shows the mirrored `./schema/system-kind` row; `shared/src/index.ts` exists for the re-export |
| Exec tabs end at `okr-management` (append point); `toHash` + central `params` parse | yes — `route.ts:79-87, 177-200` |
| Catalog components: `KpiCard` tone union `good\|warn\|danger\|neutral`, `LineChartCard`, `Pill`, `Button.pressed` → `aria-pressed`, `_shared` `ViewHeader`/`Loading`/`ErrorState`, `useFetch`, `scripts/design-conformance.ts` | all exist as described |
| `api.getPerformance(domainId)` is per-domain and left untouched; `api.domains.list` exists | yes — `api.ts:1079, 208` |
| `bun run typecheck` exists (no tsc) | yes — root `package.json:20` |
| Direct-driver `:KPIMeasurement` fixture pattern precedent | yes — `kpi-okr-governance` design §3.4 (`:267`) + its §8 fixture convention |
| No in-repo `:KPIMeasurement` write path (Risk R-5 honest) | yes — only `kpi-trends.ts` touches the label; `POST /kpi-measurements` writes Postgres |

## Completeness / Traceability

| Requirement | Design coverage | Status |
|---|---|---|
| FR-01 (route + tab, verbatim) | §6 View-tree placement, §4.7 `route.ts` row, §7 (`route.ts`, `views/index.tsx`, view + css) | covered — `#/exec/performance` → `PerformanceDashboard` matches the blueprint round-4 View Tree row verbatim; no invented/renamed route |
| FR-02 (KPI trend + status panel) | DD-02, §4.2 `computeKpiStatus`, §6 KpiCard/Pill/LineChartCard, DD-08 lazy sparkline | covered |
| FR-03 (OKR roll-down panel, four as-built literals, adjustment as separate signal) | §4.5 Read B (`a.status` enum, `count(adj)>0`), §6 OKR panel, display-mapping note | covered — no literal re-invented; `adjustment_requested` derived from `:RollDownAdjustment`, never from `status` |
| FR-04 (URL-first slicer) | §4.1 `resolveSlice`, §6 URL-first state via `toHash`, §3.2 slice schema | covered |
| FR-05 (portfolio aggregate, Neo4j `:KPIMeasurement` per DEC-03) | DD-03, §4.2 two batched reads + status, §5 route row | covered — XD-02-as-amended implemented exactly; 0 Postgres |
| FR-06 (systemKind slice traversal) | DD-06 (pins OQ-2 inclusive-any), §4.3 EXISTS fragment | covered |
| FR-07 (OKR aggregate) | DD-04, §4.5 two-read join; substring fidelity bound carried (R-2) | covered — note: requirements' literal `contribution` key is deliberately delivered as `weight` (B-02: `a.contribution` does not exist in the as-built graph); documented in §3.2/§4.5, AC-04's "contribution value" is satisfied by `weight` |
| FR-08 (journey axis, reuse-or-add fork) | DD-07 (reuse check documented + dated), §4.4 | covered — fork resolved with evidence |
| FR-09 (OpenAPI) | §4.6 `openapi-performance.ts` + two-line hook, §5 | covered |
| NFR-01 (read-only additive) | DD-01; all-GET §5; no ERROR_CODES addition | covered |
| NFR-02 (house rules) | zod-only §3.2; central gate + §4.7 RBAC entries (no per-route auth); en-US; `bun run typecheck` | covered |
| NFR-03 (≤ 2 Neo4j / 0 Postgres) | DD-03, §4.2, AC-14 test row | covered (mechanism wording = C-07) |
| NFR-04 (snake_case as-built) | DD-04, §3.2, N-01 single rename documented | covered |
| NFR-05 (SYSTEM_KINDS import-only) | §3.2 import, §4.1, §6 slicer labels | covered |
| AC-01..AC-06, AC-14 | §7/§8 named api test files (`performance-kpis`, `-systemkind-slice`, `-okr`, `-journeys`, `-status`, `-rbac`, `openapi.integration` extension) | covered — AC-14/two-read-spy mechanics per C-07 |
| AC-07, AC-08, AC-09, AC-12 | `performance-dashboard.test.tsx` + §6 states + manual repros carried from requirements | covered |
| AC-10 | §6 tokens-only + design-conformance gate | covered |
| AC-11 | `performance-dashboard-a11y.test.tsx` + §6 input-modes/a11y block + manual Safari pass | covered |
| AC-13 | §8 regression/gate block (typecheck + ownership diff) | covered |
| UX-01 | §6 States: loading / error / 2×empty / ready | covered |
| UX-02 | tokens-only css module, catalog-first (rejected new component §9), AC-10 gate | covered |
| UX-03 | n/a — no canvas/gesture; Native Conflicts "(none)" stated | covered |
| UX-04 | n/a per blueprint (desktop-first, no new breakpoints) | covered |
| UX-05 | focus order, `aria-pressed`, text+tone status, `main` landmark, AC-11 | covered |
| UX-06 | route verbatim; deep link survives reload (AC-07) | covered |
| XD-02 (as amended) | the point of rev 3 — single-store `:KPIMeasurement`, split-brain documented (R-5), not fixed | honoured |
| XD-15 | `SYSTEM_KINDS` imported, never re-declared (NFR-05) | honoured |
| XD-16 | reads the governed base; substring match inherited, not "improved" (§9) | honoured |
| XD-17 | DD-02/DD-03 pin former DECs; DEC-02/DEC-03 flagged for the consolidated report | honoured |
| File ownership (Risk 6 / FILE-OWNERSHIP) | DD-05 + §4.7 owned-sections table; no `#/model/*` touch | honoured — single clean owner for the `#/exec/performance` row |

Design elements serving no requirement: none found — every §7 row maps to
an FR/AC/UX id.

What is done well: the as-built topology in §4.5 is accurate to the line
(this reviewer re-derived it independently from `roll-down.ts` /
`okr-crud.ts` and found no invention); the rejected-alternatives ledger
(§9) is genuinely argued, not decorative; and the three inherited risks
(R-2 substring fidelity, R-4 seed-only `CONTRIBUTES_TO`, R-5 measurement
split-brain) are exactly the honest boundaries a read-only spec should
draw rather than paper over.

## Verdict

**approve** — zero blockers; C-07 (already resolved downstream in tasks
rev 4; design §8 wording stays flagged to Phase C), C-08 (T-04
implementer records the duplicate-anchor disposition in a handler
comment), and N-05/N-07/N-08/N-09 ride along as recorded open items.
Next phase (tasks review / execution) may proceed on this design.
