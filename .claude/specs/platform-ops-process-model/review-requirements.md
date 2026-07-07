---
feature: "platform-ops-process-model"
artifact: "requirements.md (draft, rev 1)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "1 of 2"
---

# Requirements Review: platform-ops-process-model

Reviewed cold against `.claude/skills/spec-review/SKILL.md`, the blueprint
`blueprint-saas-operator.md` (XD-*/View Tree/UX-*), `.claude/CLAUDE.md` house
rules, and the real interfaces of every named dependency spec + the code they
shipped (`api/src/routes/*`, `shared/src/schema/*`, `shared/seed/*`).

This is an unusually well-grounded requirements doc: every route, schema shape,
error code, edge name, and seed key it cites was checked against the codebase or
the owning dependency's `requirements.md`/`design.md` and **resolved to a real
construct**. No invented labels/edges, no compile-time schema edits, no
owned-elsewhere code edits, no new routes/views. The XD-10 mapping table (FR-14)
is present and first-class. There are **no blockers**. Two write-path citation
inaccuracies and one metric-roster gap are recorded as concerns; all three are
already partially anticipated by the author's own open questions and land inside
the design phase.

## Findings

### Blockers

None.

### Concerns

- **C-01 — FR-08 mis-cites the KPI-alignment write path; no such endpoint
  exists.** FR-08 says the `ALIGNED_TO` (KPI→UserJourney/Activity/Domain) edge is
  "Written via the existing KPI-alignment write path (`kpi-measurement-alignment`,
  called, never edited)". I grepped `api/src/routes/` and
  `.claude/specs/kpi-measurement-alignment/{requirements,design,tasks}.md`: that
  spec ships **no dedicated `ALIGNED_TO`-create REST route**. Its FRs migrate
  `CONTRIBUTES_TO`→`ALIGNED_TO`, make `performance.ts` traverse `ALIGNED_TO`, and
  add param-binding/reconcile routes — none of them create a plain KPI→entity
  alignment edge. The only code that writes `ALIGNED_TO` today is
  `api/src/storage/kpi-impact.ts` (kpi-impact-mapping surface), and it writes
  only `KPI→Activity` with a `direction`/`weight` payload — not the
  `KPI→Domain`/`KPI→UserJourney` alignments FR-08/AC-09 require. Because
  `ALIGNED_TO` **is** in the compile-time `EDGE_ENDPOINTS`
  (`shared/src/schema/edges.ts:43`, `KPI→UserJourney/Activity/Domain`), the
  realistic write path is the **generic `POST /api/v1/edges`** — exactly the
  mechanism this spec already uses for `MEASURES` (FR-07). *Recommendation:*
  in the design, write `ALIGNED_TO` via `POST /api/v1/edges`
  (`type:"ALIGNED_TO"`, from KPI id, to domain/journey/activity id) and correct
  the FR-08/AC-09 citation from "the kpi-measurement-alignment write path" to
  "generic `POST /api/v1/edges`, validated by the registry-backed endpoint-pair
  check (`400 edge_endpoint_label_mismatch`)". Low blast radius — FR-08 is
  already `should`, and AC-09's `400`-on-wrong-pair assertion holds unchanged
  under `/api/v1/edges`.

- **C-02 — Metric roster does not seed error-budget or backup-success
  (OQ-1 confirmed real).** I read `shared/seed/saas-metric-library/metrics.json`:
  it seeds `metric-uptime`, `metric-mttr`, `metric-deploy-frequency` (and MRR/ARR/
  NRR/GRR/churn/etc.) but **no** `metric-error-budget` and **no** backup-success
  metric. FR-07's mandatory KPI set (Error budget burn, Backup success rate)
  therefore cannot `MEASURES` a canonical `MetricDefinition` today without either
  (a) a cross-spec roster addition or (b) binding to `metric-uptime`. The author
  flags this as OQ-1 and recommends an (a)+(b) hybrid — but it is left as an open
  question needing a user/`saas-metric-library`-owner decision, and two of the
  five **must**-tier KPIs (FR-07/AC-08) hinge on it. *Recommendation:* resolve
  OQ-1 to a concrete decision **before design sign-off** rather than carrying it
  into build. The safest self-contained choice that keeps XD-06 intact and does
  not depend on another spec landing an addition is **option (b)/(c)**: bind Error
  budget to `metric-uptime` (error budget = 1 − uptime vs SLO) and either bind
  Backup success to the nearest existing metric or drop it to `should` until
  `saas-metric-library` adds `metric-backup-success`. Do not leave AC-08's "every
  targeted `MetricDefinition` resolves in the seeded metric roster" assertion
  depending on an unfrozen roster edit.

- **C-03 — SLA route path: this spec is right, but the foundation it depends on
  is wrong; confirm at design.** FR-11 and the mapping table consistently use
  `POST /api/v1/slas`, which is the **real** route (`api/src/routes/sla-crud.ts`
  header + `slaCreateRequestSchema`). However `saas-operator-foundation` FR-06 /
  AC-19 — the governed-API seed helper this spec's FR-12 routes its SLA rows
  through — names the endpoint `/api/v1/sla-crud` (a file name, not a route). The
  helper this spec depends on may POST to a non-existent path. *Recommendation:*
  in design, pin the SLA endpoint to `POST /api/v1/slas` and note the foundation
  FR-06/AC-19 path label discrepancy as a dependency risk to confirm before build
  (either the foundation helper is path-correct in code, or it is a gap flagged to
  the foundation owner per this spec's OQ-3). Also note `POST /api/v1/slas`
  returns **200, not 201** (pinned as-built, `sla-crud.ts:24`); AC-12 correctly
  asserts only "a persisted id", so no change needed there — but the design's
  test should not assert 201 for SLA create.

### Nits

- **N-01 — FR-01 resolution mechanism is described twice, at length, and left
  partly undecided in the requirements.** FR-01's cell hedges between "the fixture
  carries the domain node with the well-known `platform_ops` seedKey" and "a
  lookup step resolves the id", then defers to the design. Foundation FR-03 is
  explicit: the stable handle is `attributes.seedKey` resolved by
  **lookup-before-attach** against the operator root, and the server-generated id
  is never hard-coded. *Recommendation:* state FR-01 as "the fixture references
  the `Platform Ops` domain by resolving `attributes.seedKey = "platform_ops"` at
  seed time (foundation FR-03), never a hard-coded id" and drop the parenthetical
  either/or — the design pins the load-time detail, not the requirement.

- **N-02 — FR-07 metric mapping "`metric-error-budget`/`metric-uptime`-adjacent
  for Error budget" is vague.** Same root as C-02; once OQ-1 is decided the exact
  target should be named, not left as "adjacent".

- **N-03 — Mapping-table row for stories lists `DESCRIBES_ACTIVITY`/
  `STORY_FOR_ROLE`/`ACCEPTANCE_OF` edges**, which are runtime edges owned by
  `story-spec-core` (created server-side by the story/AC routes, not by this
  spec). This is correct and consistent with FR-09, but the "Write path" column
  ("`POST /api/v1/models/:modelId/stories`") could note the edges are created
  server-side by that route, not authored directly — minor clarity only.

## Completeness / Traceability

Every FR maps to ≥1 AC; every AC traces to ≥1 FR; every FR cites a real,
verified construct. No dangling ACs, no uncovered FRs.

| FR / NFR | Requirement | AC(s) | Verified against reality |
|----------|-------------|-------|--------------------------|
| FR-01 | 5 journeys `PART_OF` existing Platform Ops domain | AC-01 | `PART_OF` UserJourney→Domain is core `EDGE_ENDPOINTS`; foundation FR-03 seeds `platform_ops` domain by seedKey ✓ |
| FR-02 | Ordered activities + `PRECEDES` | AC-02 | `PRECEDES` Activity→Activity is core ✓ |
| FR-03 | Roles `EXECUTES` activities | AC-03 | `EXECUTES` Role→Activity core; foundation FR-05 shared Role catalog ✓ |
| FR-04 | Systems `USES_SYSTEM` / `INTEGRATES_WITH`; `systemKind` | AC-04 | core edges ✓; `systemKind` required (system-augmentation FR-02/FR-03); import injects default (`import.ts:104`) ✓; Helm/K8s/PagerDuty in foundation FR-04 ✓ |
| FR-05 | Non-lifecycle fixture via `POST /api/v1/import` | AC-05 | `realImport` lifecycle guard `409 model_lifecycle_route_required` (foundation FR-07/FR-09) ✓ |
| FR-06 | KPI rows via `POST /api/v1/kpis` | AC-07 | `kpi-crud.ts` POST `/kpis` real ✓ |
| FR-07 | KPI `MEASURES` MetricDefinition via `POST /api/v1/edges` | AC-08 | `MEASURES` registered by saas-metric-library (design §3.2, `createEdgeType`); `/edges` returns 201 (`edges.ts:16`) ✓ — **but** error-budget/backup-success metrics absent (C-02) |
| FR-08 | KPI `ALIGNED_TO` process | AC-09 | `ALIGNED_TO` in `EDGE_ENDPOINTS` ✓ — **but** cited write path does not exist (C-01) |
| FR-09 | Stories + G/W/T ACs via story-spec-core | AC-10 | `POST /api/v1/models/:modelId/stories` `{persona,action,benefit,activityId,roleId?}` + `story_activity_not_in_model` scope check (story-spec-core FR-05/FR-06/FR-10) ✓ |
| FR-10 | Risks via `POST /api/v1/risk-register` | AC-11 | `createRiskSchema` shape + `risk_type` enum incl. operational/security/technical (`risk-register.ts:18`) ✓ |
| FR-11 | SLAs via `POST /api/v1/slas` | AC-12 | route + `slaCreateRequestSchema` real; returns 200 (`sla-crud.ts`) ✓ — foundation helper path label off (C-03) |
| FR-12 | Governed-data seed via foundation FR-06 helper | AC-11/AC-12 | foundation FR-06 helper exists (must-tier) ✓ — SLA path label caveat (C-03); re-run idempotency deferred to design (OQ-5) |
| FR-13 | DDD capabilities + `NEEDS_CAPABILITY`/`SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT` | AC-13 | `POST /api/v1/models/:modelId/capabilities` + mapping routes; `CAPABILITY_IN_MODEL` at create; read-only contexts (ddd-system-modeling FR-02/FR-04/FR-05, NFR-04) ✓ |
| FR-14 | XD-10 mapping table (doc artifact) | AC-14 | present, every row resolves to a real construct ✓ |
| NFR-01 | No new labels/edges/schema | AC-15 | no `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` edits ✓ |
| NFR-02 | Idempotency + retail isolation | AC-06 | MERGE-on-id for fixture; governed-write idempotency deferred to design (OQ-5) ✓ |
| NFR-03 | Ownership boundaries | AC-06/07/09/11/12/13/15 | git-diff-stat manual checks per owned file ✓ |
| NFR-04 | House rules (zod-only, no tsc, en-US, loopback, auth via gate, `/api/v1/`) | AC-15 | adds no routes/RBAC strings; all writes hit shipped boundary schemas ✓ |
| NFR-05 | No pwa/ edits; P&IM/Native-Conflicts N/A | (recorded) | correctly N/A — spec touches no `pwa/`, no gestures/keyboard (blueprint XD-05/XD-11) ✓ |

**What's done well:** interface fidelity is excellent — the spec references
`realImport`'s `409 model_lifecycle_route_required`, the `MEASURES`/`INSTANTIATES`
collision resolution (XD-06-erratum), the story-spec-core `story_activity_not_in_model`
scope check, `createRiskSchema`'s exact field list, and `systemKind` enforcement,
all of which I confirmed against the actual code/specs. The XD-10 mapping table
(FR-14) is genuinely first-class and self-audited by AC-14. Ownership boundaries
(NFR-03) are enforced by concrete `git diff --stat` checks per owned file. The
Platforms & Input Modes / Native Conflicts N/A justification (NFR-05) is correct
and explicitly recorded rather than silently omitted. Open questions OQ-1..OQ-5
already name the three concerns above — the doc is honest about its own soft
spots.

## Verdict

**approve** — zero blockers. The three concerns (C-01 write-path miscitation,
C-02 metric-roster gap, C-03 SLA path label) are all resolvable inside the design
phase and are already flagged by the author's own OQs; none changes the spec's
direction or requires re-review of requirements. Proceed to design, and in design
(1) route `ALIGNED_TO` writes through `POST /api/v1/edges` and correct the FR-08
citation, (2) land a concrete OQ-1 decision that does not depend on an unfrozen
roster edit, and (3) pin SLA writes to `POST /api/v1/slas` and confirm the
foundation FR-06 helper targets that path.
