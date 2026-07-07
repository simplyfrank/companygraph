---
feature: "platform-ops-process-model"
artifact: "design.md (draft, rev 1 — reviews requirements rev 1)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "1 of 2"
---

# Design Review: platform-ops-process-model

Reviewed cold against `.claude/skills/spec-review/SKILL.md`, the approved
`requirements.md` (rev 1) + its `review-requirements.md` (verdict `approve`, 3
concerns), the blueprint `blueprint-saas-operator.md` (XD-*/View Tree/UX-*),
`.claude/CLAUDE.md` house rules, and the **as-built code** of every dependency
this design claims to call. I read the real route/schema/seed files:
`api/src/routes/{kpi-sla-alignment,sla-crud,kpi-crud,risk-register,import,edges,stories,capabilities}.ts`,
`shared/src/schema/{edges,kpi-sla,ddd-system,story-spec,system-kind}.ts`,
`api/src/seed/{governed-seed-helper,link-kpi-metric,ensure-measures-edge}.ts`,
`api/scripts/seed-saas-operator.ts`, `shared/seed/saas-metric-library/metrics.json`,
and the `saas-operator-foundation` design.

**This is an exemplary content-spec design.** Interface fidelity is the best I
have reviewed in this fan-out: every route, schema field, return code, error
code, edge name, and seed-key was checked against live code and resolved to a
real construct. The three requirements concerns (C-01 write path, C-02 metric
roster, C-03 SLA path) are all closed against verified reality, and the closures
are **correct** — I re-verified each independently below. There are **no
blockers**. The findings are four concerns (two are precision/robustness gaps in
otherwise-sound mechanisms) and three nits. All land inside the tasks phase.

## Verification of the requirements-concern closures (all confirmed correct)

- **C-01/OQ-5 (ALIGNED_TO write path).** The design is right and the
  requirements review was wrong: `POST /api/v1/kpi-alignments`
  (`handleKpiAlignmentPost`) **does** exist and CREATEs `(:KPI)-[:ALIGNED_TO
  {weight,attribution_type}]->(:target)` (`api/src/routes/kpi-sla-alignment.ts:21,53`;
  router mount `router.ts:796`). `kpiAlignmentCreateRequestSchema`
  (`shared/src/schema/kpi-sla.ts:193`) is exactly `{kpi_id, target_type:
  journey|activity|domain, target_id, weight(0..1),
  attribution_type: direct|indirect|leading|lagging, alignment_notes?}` as the
  design states. The route returns **`404 not_found`** on a missing KPI
  (`:36`) or a missing/wrong-label target (`:46`) — the design's D-1 error
  correction is verified. ✓
- **C-02/OQ-1 (metric roster).** Verified: `shared/seed/saas-metric-library/metrics.json`
  seeds 20 metrics ending at `metric-uptime`/`metric-deploy-frequency`; **no**
  `metric-error-budget`, **no** backup-success metric. The design's self-contained
  resolution (error-budget → `metric-uptime`; backup-success demoted to `should`
  and shipped unlinked; roster gap flagged outbound §11) satisfies the review's
  explicit ask ("do not depend on an unfrozen roster edit"). ✓
- **C-03/D-2 (SLA path + return code).** Verified: `handleSlaPost`
  (`api/src/routes/sla-crud.ts:25`) header literally reads "returns 200, not 201
  — pinned as-built"; `slaCreateRequestSchema` (`shared/src/schema/kpi-sla.ts:172`)
  matches the design's field list. The foundation helper `seedSla` exists and
  POSTs `/api/v1/slas` (`api/src/seed/governed-seed-helper.ts:101-103`), resolving
  C-03's dependency-state worry. ✓
- **MEASURES readiness.** Verified `MEASURES` is a **runtime-registered** edge
  type (`api/src/seed/ensure-measures-edge.ts`, registered by
  `seed:saas-metric-library`), ∉ `LIFECYCLE_EDGES`, so `POST /api/v1/edges`
  accepts it (201) — the design's §4.3 claim holds. The metric-library also
  ships `linkKpiToMetric` with a one-metric-per-KPI pre-check
  (`api/src/seed/link-kpi-metric.ts`), which §4.3 correctly offers to reuse. ✓

## Findings

### Blockers

None.

### Concerns

- **C-01 — Cross-boundary core edges (§4.2a) are created via `POST /api/v1/edges`,
  which is strict CREATE (409 on id-conflict), but §4.8's idempotency table does
  NOT cover them.** §4.2a creates the journey→domain `PART_OF` (×5),
  activity→shared-system `USES_SYSTEM`, and function↔shared `INTEGRATES_WITH`
  edges via `handleEdgePost` (`api/src/routes/edges.ts:8`), which routes through
  `createEdge` (strict CREATE per CLAUDE.md — `409 id_conflict` on a duplicate
  client-supplied id, and cross-type edge-id uniqueness enforced). The §4.8
  idempotency guard table lists KPI/MEASURES/ALIGNED_TO/story/AC/risk/SLA/capability
  — but **not** these cross-boundary `/edges` writes. On a second
  `seed:platform-ops` run (or a re-run after `seed:saas-operator` already loaded
  the fixture's in-slice edges), these `/edges` POSTs will either 409 (if a fixed
  edge id is reused) or silently create a duplicate parallel edge (if no id is
  supplied), breaking AC-06's "zero net new edges". This is the single real gap:
  the mechanism that resolves the two-loader hazard (moving cross-boundary edges
  out of the fixture into §4.2a) reintroduces the very Risk-5 non-idempotency the
  fixture's MERGE-on-id avoided. *Recommendation:* in tasks, add a **row to the
  §4.8 table** for the §4.2a cross-boundary edges — lookup-before-create by
  `(type, fromId, toId)` via `POST /api/v1/query/cypher`
  (`MATCH (a {id:$fromId})-[r:PART_OF]->(b {id:$toId}) RETURN r`) and skip the
  POST when present. Either that, or author each cross-boundary edge with a
  **stable fixed `id`** under the `018f0200-…` prefix and rely on the
  cross-type-uniqueness 409 being caught-and-treated-as-success (state which). The
  AC-06 idempotency test must assert these specific edges are net-zero on re-run.

- **C-02 — Schema-shape citations point at `api/src/routes/…` filenames that do
  not exist; the schemas live in `shared/src/schema/…`.** The design repeatedly
  cites `kpi-sla.ts:155/172/193`, `ddd-system.ts:100/107`, `story-spec.ts:22/57`,
  and `system-kind.ts:9` as if they were route files (e.g. §2.1 "`slaCreateRequestSchema`,
  `kpi-sla.ts:172`", §3.4 "`neededBySchema` … verified `ddd-system.ts:100`"). I
  grepped: `api/src/routes/{kpi-sla,ddd-system,system-kind}.ts` **do not exist** —
  these are all `shared/src/schema/{kpi-sla,ddd-system,story-spec,system-kind}.ts`.
  The *schemas themselves are real and the line numbers are correct within the
  schema files* (I confirmed each), so this is a path-label imprecision, not a
  wrong claim — but an implementer following the citation to `api/src/routes/`
  will not find the file. *Recommendation:* in tasks, qualify these citations with
  the `shared/src/schema/` prefix (the route handlers that consume them —
  `sla-crud.ts`, `capabilities.ts`, `stories.ts`, `kpi-crud.ts`,
  `kpi-sla-alignment.ts` — are already cited correctly).

- **C-03 — §4.7 cites the wrong context-map read path.** The design's DDD step
  reads existing bounded contexts via "`GET /api/v1/models/:modelId/capabilities/context-map`".
  The real route is **`GET /api/v1/models/:modelId/system-model/context-map`**
  (`api/src/routes/capabilities.ts:47,165` → `computeContextMap`). There is no
  `capabilities/context-map` surface. Since §4.7 offers "or a `query/cypher`" as
  an alternative and `ASSIGNED_TO_CONTEXT` is explicitly best-effort/non-blocking
  (OQ-4), this does not block, but the cited path is unusable as written.
  *Recommendation:* correct §4.7 to `.../system-model/context-map` (or pin the
  `query/cypher` `:BoundedContext` lookup as the primary read).

- **C-04 — Fixture-loaded-orphan-journeys window is real but under-asserted.**
  The §4.2 resolution (fixture carries journeys/activities but NO domain node and
  NO journey→domain `PART_OF`; those come from §4.2a in the *content-seed* step)
  is sound and correctly eliminates the two-loader duplicate-domain hazard.
  However it means that after `seed:saas-operator` (wave-1a) runs but **before**
  `seed:platform-ops` runs, the five journeys exist with **no** `PART_OF→Domain`
  edge — they are orphaned from the operator model. AC-01 only asserts the
  end-state after `seed:platform-ops`, which is fine for this spec, but the
  wave-3 cockpit / any consumer that reads the operator subgraph between the two
  seed steps sees dangling journeys. *Recommendation (non-blocking):* record in
  §11 / a note that `seed:platform-ops` is a **required** follow-on to
  `seed:saas-operator` for the slice to be well-formed (the design already says
  the script "fails loudly" on missing handles — make explicit that the fixture
  alone is intentionally incomplete, so no consumer treats the post-`seed:saas-operator`
  state as final). A one-line ordering note in §6/§7 closes this.

### Nits

- **N-01 — `risk_type` is `.optional()` in the shipped schema, but the design's
  internal `riskRow` (§3.5) makes it required with a 3-value enum.** Verified
  `createRiskSchema.risk_type` is `.enum([...6 values]).optional()`
  (`risk-register.ts:18`). The design's internal `riskRow` narrowing it to
  required `enum(["operational","security","technical"])` is a *stricter* internal
  guard (fine — it only tightens the seed's own inputs, and all three values are
  in the shipped enum). Worth a one-line note that the internal shape is
  deliberately stricter than the boundary schema so a reader doesn't read it as a
  contradiction.

- **N-02 — §4.3 cardinality: "reuse `linkKpiToMetric` if importable."** The
  metric-library ships `linkKpiToMetric` (`api/src/seed/link-kpi-metric.ts`) with
  the exact one-metric-per-KPI pre-check the design wants. Importing it from a
  wave-2 spec is a cross-spec code dependency (not an *edit*, so NFR-03-clean, but
  a build coupling). *Recommendation:* in tasks, decide definitively — reuse the
  helper (cite its export) or the seed's own one-write-per-KPI construction — and
  drop the "if importable" hedge, so the task has a single Definition of Done.

- **N-03 — §4.5 lookup-before-create for risks uses `GET /api/v1/risk-register?…`
  + name filter, but the risk row is a Postgres row keyed by `name` only.** The
  design notes "a direct `SELECT … WHERE name=` is not available to the caller" —
  correct, and the list-route + name filter is the right caller-side path. Just
  confirm in tasks that `handleRiskRegisterList` accepts a `name` query param
  (it accepts `owner`/`domain`/`risk_type`/`linked_entity_*` per
  `risk-register.ts:46-52`; a `name` filter may need a broader list + client-side
  match). Minor — fold into the AC-11 idempotency assertion.

## Completeness / Traceability

Every FR maps to ≥1 design section and ≥1 AC; every AC maps to a design section
and a named test file (§7); the §10 File Changes table lists only real,
new/own-owned paths; §8 enumerates every owned-elsewhere file the spec must NOT
touch, each cross-checked to a real dependency. No dangling FR, no orphan AC.

| FR / NFR | Design § | AC | Verified against reality |
|----------|----------|----|--------------------------|
| FR-01 (5 journeys `PART_OF` existing domain, no dup) | §3.1, §4.1, §4.2, §4.2a | AC-01 | `attachDomain` seeds `platform_ops` domain (foundation design §3.2); rebind/omit-domain mechanism sound; **cross-boundary edge idempotency gap → C-01** |
| FR-02 (ordered activities + `PRECEDES`) | §3.1, §4.2 | AC-02 | `PRECEDES` Activity→Activity core edge ✓ |
| FR-03 (roles `EXECUTES` activities) | §3.1, §4.2 | AC-03 | `EXECUTES` Role→Activity core; shared-role reference-by-id ✓ |
| FR-04 (systems + `systemKind`) | §3.1, §3.2, §4.2, §4.2a | AC-04 | `systemKind` enum (`shared/src/schema/system-kind.ts:11`); import injects default (`import.ts:104`); shared systems carry `operatorSeedKey` (foundation §4.3) ✓ |
| FR-05 (non-lifecycle fixture via import) | §3.1, §4.2 | AC-05 | `assertNotLifecycleEdge/Label` + `409 model_lifecycle_route_required` (`import.ts:170-184`) ✓ |
| FR-06 (KPI rows via `POST /api/v1/kpis`) | §3.3, §4.3 | AC-07 | `handleKpiPost` returns 200 (`kpi-crud.ts:26`); `kpiCreateRequestSchema` fields match ✓ |
| FR-07 (KPI `MEASURES` metric) | §3.3, §4.3, §11 | AC-08 | MEASURES runtime edge (`ensure-measures-edge.ts`); `/edges` 201 (`edges.ts:16`); roster gap handled ✓ |
| FR-08 (KPI `ALIGNED_TO` process) | §3.3, §4.4 | AC-09 | `POST /api/v1/kpi-alignments` real, CREATEs ALIGNED_TO, 404 on bad target (`kpi-sla-alignment.ts`) — D-1 correct ✓ |
| FR-09 (stories + G/W/T ACs) | §3.4, §4.0 | AC-10 | `storyCreateSchema`/`acCreateSchema` (`shared/src/schema/story-spec.ts:22,57`); `story_activity_not_in_model` scope (`stories.ts`) ✓ |
| FR-10 (risks via risk-register) | §3.4, §4.5 | AC-11 | `createRiskSchema` fields incl. required `owner`/`domain` (`risk-register.ts:7-21`) ✓; N-01/N-03 nits |
| FR-11 (SLAs via `POST /api/v1/slas`) | §3.4, §4.6 | AC-12 | `handleSlaPost` returns 200 (`sla-crud.ts:24`); schema match — D-2 correct ✓ |
| FR-12 (governed data via governed routes) | §4.5, §4.6, §4.8 | AC-11, AC-12 | `governed-seed-helper.ts` `seedRisk`/`seedSla` POST the right paths ✓ |
| FR-13 (DDD capabilities + mappings) | §3.4, §4.7 | AC-13 | capabilities POST 201 + `CAPABILITY_IN_MODEL` at create (`capabilities.ts:71`); `neededBySchema` refine/`supportedBySchema` (`ddd-system.ts:100-115`) ✓; context-map path wrong → C-03 |
| FR-14 (XD-10 mapping table) | requirements §Mapping | AC-14 | present, first-class, every row resolves ✓ |
| NFR-01 (no new labels/edges/schema/store) | §3, §8, §10 | AC-15 | zero `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` edits; only internal seed zod ✓ |
| NFR-02 (idempotency + retail isolation) | §3.1, §4.8 | AC-06 | fixture MERGE-on-id ✓; governed writes lookup-before-create ✓; **cross-boundary edges gap → C-01** |
| NFR-03 (ownership boundaries) | §8, §10 | AC-06/07/09/11/12/13/15 | §8 list cross-checks every owned-elsewhere file; git-diff-stat manual checks per AC ✓ |
| NFR-04 (house rules) | §3.5, §5.1, §8 | AC-15 | zod-only (internal + boundary), no tsc (`bun run typecheck`), en-US, loopback, auth via gate (no new RBAC string), `/api/v1/` ✓ |
| NFR-05 (no pwa/, P&IM/Native N/A) | §5.2 | AC-15 | no `pwa/` file; UX-01..06 vacuously satisfied (no view); View Tree unaffected ✓ |

**Blueprint conformance.** XD-01/03 (SaaS-Operator root, process layer only, no
operational records) ✓; XD-04/08 (risk/SLA via governed APIs only, no route
edits) ✓; XD-05 (no `route.ts`/`SURFACES`/`views/index.tsx` edit; §8 lists them
as forbidden) ✓; XD-06/erratum (`MEASURES` not `INSTANTIATES`, unlinked-KPI for
missing metric) ✓; XD-10 (full-pipeline depth: 5 journeys / ~25 activities /
roles / systems / 5 KPIs / ≥5 stories / ≥3 risks / ≥3 SLAs / ≥3 capabilities +
mapping table) ✓. No View Tree route invented (spec ships no view). No UX-*
violated (no `pwa/` work). No house-rule conflict.

**What's done well.** The C-01/OQ-5 correction (proving the reviewer's
"no ALIGNED_TO route exists" claim wrong by reading `kpi-sla-alignment.ts`) is
exactly the adversarial-verification the process wants, and it's *correct*. The
two-loader hazard analysis in §4.2 is a genuine design insight — moving
cross-boundary edges out of the fixture is the right call to avoid the duplicate
domain (its only cost is C-01's idempotency follow-through). The §12 rejected-
alternatives register is thorough and each rejection is justified against real
code. The §11 outbound Gap Register correctly refuses to seed a `MetricDefinition`
(NFR-01) and routes the roster gap to the owning spec. Every return code
(200 KPI/SLA, 201 edges/capabilities, 404 alignment, 409 lifecycle) is pinned to
the as-built value.

## Verdict

**approve** — zero blockers. The four concerns are all resolvable inside the
tasks phase without re-opening the design's direction:

1. **C-01 (must-address in tasks):** add the §4.2a cross-boundary `/edges` writes
   to the §4.8 idempotency guard (lookup-before-create by `(type,fromId,toId)`
   or fixed-id + treat-409-as-success), and assert their net-zero in the AC-06
   test — otherwise AC-06 fails on re-run. This is the one concern with teeth.
2. **C-02:** re-prefix the schema-shape citations to `shared/src/schema/…`.
3. **C-03:** correct the context-map read path to `.../system-model/context-map`.
4. **C-04:** note the intentional fixture-incompleteness + `seed:platform-ops`
   ordering requirement.

None changes an FR's intent, the file-change surface, or the ownership boundary.
Proceed to tasks; fold C-01 into the idempotency task's Definition of Done.
