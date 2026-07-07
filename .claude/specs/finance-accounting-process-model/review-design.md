---
feature: "finance-accounting-process-model"
reviewing: "design"
artifact: "design.md (draft, rev 0)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "1 of at most 2"
---

# Design Review: finance-accounting-process-model

Reviewed cold against `.claude/skills/spec-review/SKILL.md`, the approved
`requirements.md` (rev 1), `blueprint-saas-operator.md`, and `.claude/CLAUDE.md`.
Every dependency interface named in design §2 was re-verified against source.

## Verification performed (claims checked against reality)

Every symbol in design §2 was confirmed by reading source — the "Verified
interfaces" table is accurate, not aspirational:

- `ensureOperatorRoot` returns `ModelRead` (`.id`); `ensureFunctionDomains`
  returns `Map<seedKey,id>` incl. `finance_accounting` — `api/src/seed/ensure-{operator-root,function-domains}.ts`. ✓
- `ensureSystems` / `ensureRoles` take a `Driver` and return `Map<seedKey,id>`;
  catalog carries `stripe`, `data_warehouse`, `revenue_operations` — **confirmed**
  in `api/src/seed/ensure-catalog.ts` + `saas-operator-catalog.ts`. (Design §7.1
  cites these but not their file — see N-01.) ✓
- `handleKpiPost` (`kpi-crud.ts:27`) returns **200** (comment line 26 pins it),
  `kpiCreateRequestSchema` has exactly the fields §2/§7.2 use; `domain_id` is
  optional and unvalidated. ✓
- `linkKpiToMetric` pre-checks `MATCH (k:KPI {id})-[:MEASURES]->()` and throws
  `KpiMetricAlreadyLinkedError` on a second link; `MEASURES` endpoint pair is
  `KPI→MetricDefinition` (`ensure-measures-edge.ts:16`); `POST /api/v1/edges`
  returns 201. ✓
- `seedRisk` / `seedComplianceRule` are exported raw POSTs with **no dedup**
  (`governed-seed-helper.ts:95,108`); `RiskSeedRow` interface matches the
  §8.1 fields; `complianceRuleSchema` requires `rule_dsl` (min 1) + `actions`
  (string). ✓
- `risk-register` GET filters (`owner,domain,status,category,risk_type,…`) have
  **no `name` filter** — the §3.3/§8.2 "match name in TS" approach is required
  and correct. ✓
- `compliance/rules` GET (`handleComplianceRules`) + POST
  (`handleCreateComplianceRule`) both mounted (`router.ts:590-591`). ✓
- `storyCreateSchema` is `.strict()` requiring `persona/action/benefit/activityId`
  (opt `roleId`); `handleStoryCreate` returns **201** (`stories.ts:78`);
  `acCreateSchema` requires `given/when/then`. ✓
- `upsertNode` does `MERGE (n:label {id:$id})` on the **client-supplied id**
  (`nodes.ts:254`) — so slice-local edges referencing stable literal ids are
  feasible; the fixture design is sound. ✓
- The loader `seed-saas-operator.ts` `readdirSync`s the directory and **throws if
  `realImport` returns any `errors[]`** (lines 47, 64-68) — this validates the §6.2
  decision (see the "done well" note). ✓
- Metric catalog has the six finance metrics and **no** `metric-cloud-cost-per-tenant`
  — OQ-1 is real. ✓

## Findings

### Blockers

**None.** The design respects every house rule and XD-* decision: no new
store/label/edge/route/view (§10), governed-API-only writes (§7/§8), zod via the
routes' own schemas, loopback, central-gate auth (the scripts authenticate as
clients), all REST under `/api/v1/`. It edits no file owned by another spec
(risk/compliance/KPI/story/DDD storage all untouched, XD-04/XD-05/XD-08). All FRs
and ACs are covered (traceability table below). No architectural conflict found.

### Concerns

- **C-01 — §7.1 step 6 idempotency of `POST /api/v1/edges` is asserted but the
  mechanism is thin.** The design says journey→domain and shared-system
  `USES_SYSTEM` / shared-role `EXECUTES` edges are created "idempotent: pre-check
  existence by endpoint pair, skip if present." But `POST /api/v1/edges` does
  **not** MERGE, and the graph has no native single-edge cardinality (confirmed:
  `linkKpiToMetric`'s own comment notes "the graph has no native single-edge
  cardinality"). A naive re-run would create a **second** `PART_OF`/`USES_SYSTEM`
  edge unless the pre-check query is specified. AC-11 asserts a re-seed yields
  **zero** net new edges, and §7.1 does not pin the pre-check Cypher (unlike §8.2,
  which pins the risk/compliance dedup precisely). **Recommendation:** in §7.1
  step 6, specify the pre-check (`MATCH (a)-[r:PART_OF]->(b) WHERE a.id=$j AND
  b.id=$d RETURN count(r)`; skip create if >0) so the tasks phase and AC-11 have a
  concrete idempotency contract for the script-created edges, matching the rigor of
  §8.2.

- **C-02 — §7.1 step 5 node-id resolution conflates two cases and is imprecise.**
  §6.1 says slice node ids are "stable UUIDv7 literals," which (per `upsertNode`
  MERGE-on-id, verified) means slice-local activity/journey/role/system ids are
  **known at authoring time** and need no lookup. Yet §7.1 step 5 says "Resolve
  slice node ids (journeys/activities/systems/roles) by `seedKey` via
  `POST /api/v1/query/cypher`." Only the **shared/foundation** node ids
  (`stripe`, `data_warehouse`, `revenue_operations`, the finance domain) are
  server-generated and need lookup; slice-local ids are fixture literals. The
  design should state that the script reads its stable slice ids from the same
  frozen constant the fixture is generated from (a shared id table), and reserves
  cypher/ensure-lookup for the foundation-owned ids only. As written, a builder
  might implement an unnecessary (and fragile — `attributes_json CONTAINS seedKey`
  substring match) lookup for ids it already owns. **Recommendation:** split step
  5 into "slice-local ids: fixture literals (a shared const)" vs. "foundation ids:
  `ensureSystems`/`ensureRoles`/`ensureFunctionDomains` + a scoped domain lookup,"
  and drop the `CONTAINS`-substring approach for anything with a known id.

- **C-03 — §7.2 step 1 KPI idempotency reads `GET /api/v1/kpis` and matches on
  `name`+`domain_id`, but the list-route filter surface is unverified in §2.**
  Unlike the risk path (§2 explicitly documents the risk-list filters and the
  missing `name` filter), the design does not state what `GET /api/v1/kpis`
  returns or whether it is filterable by `domain_id`, so "skip create if a finance
  KPI with the same `name`+`domain_id` exists" rests on an unverified list shape.
  KPI create server-generates the id and does a bare `CREATE` (verified,
  `kpi-crud.ts:51`) — so a re-run **will** duplicate without a working dedup.
  **Recommendation:** add the `GET /api/v1/kpis` response shape (and whether it
  returns `domain_id`) to §2, and confirm the finance-KPI dedup key is resolvable
  from that payload (filter in TS if no `domain_id` query param, mirroring the
  risk path).

- **C-04 — FinOps journey has no KPI grounded now, yet its KPI is still created
  (ungrounded).** §3.1 creates the `Cloud Cost per Tenant` KPI ungrounded
  (blocked-on-OQ-1). That is a reasonable resolution, but §4.5 lists it with
  metric seedKey `metric-cloud-cost-per-tenant` as if it exists, and §7.2 relies
  on a "metric-exists lookup → skip+warn." Because the KPI is created but left
  ungrounded, a re-run's idempotency (C-03) and AC-05's "exactly one MEASURES per
  the six" must explicitly **exclude** this seventh KPI from the grounded count —
  the design does say AC-05 covers six and AC-15 is blocked, which is consistent.
  The residual concern: creating a permanently-ungrounded KPI risks tripping a
  future benchmark/rollup spec that assumes every operator KPI has a `MEASURES`
  edge (XD-06 says "every operator KPI links to a MetricDefinition"). **Recommendation:**
  either defer creating the FinOps KPI until OQ-1 lands (cleaner XD-06 posture), or
  document in §3.1 that an ungrounded KPI is a knowingly-temporary XD-06 exception
  the cockpit/benchmark specs must tolerate. Low blast radius; call it out so wave-3
  consumers are warned.

- **C-05 — §7.2 step 3 optional alignment names a route that is not verified
  (`POST /api/v1/kpis/alignments` "or the as-built alignment route").** FR-07 is
  `should`/enrichment and un-gated by any AC, so this is not blocking, but the
  "(or the as-built alignment route)" hedge means the exact route is unresolved.
  Requirements FR-07 cites `ALIGNED_TO` (KPI→UserJourney) — which is in
  `EDGE_ENDPOINTS` (verified) and reachable via the generic `POST /api/v1/edges`,
  the same path `linkKpiToMetric` uses. **Recommendation:** pin FR-07 to
  `POST /api/v1/edges {type:"ALIGNED_TO", fromId:kpiId, toId:journeyId}` (a
  verified path) and drop the unverified `/api/v1/kpis/alignments` name, or mark
  the whole of step 3 as "deferred — not implemented this cycle" so the tasks
  phase does not chase a non-existent route.

### Nits

- **N-01 — §7.1 cites `ensureSystems`/`ensureRoles` without a file path**, unlike
  every other symbol in §2. They live in `api/src/seed/ensure-catalog.ts` (not
  `saas-operator-catalog.ts`, which is only the static `SYSTEMS`/`ROLES` arrays).
  Add the path to §2 for consistency.
- **N-02 — §7.3's story roster lists activity `seedKey`s in the `activityId`
  column.** The route needs the node **id**; §7.3 prose says "id" but the table
  shows `fin-act-*` seedKeys. Since slice-local ids are fixture literals (C-02),
  add a one-line note that the `activityId` column shows the seedKey for
  readability and the script passes the corresponding stable id.
- **N-03 — §9 test table's `finance-stories` row references "N-02"** (a
  requirements-phase nit id) for the control-model handling; harmless but the
  cross-reference to a prior-phase finding id may confuse a builder. Consider
  inlining the control-model setup note.
- **N-04 — §8.1 sets every finance risk `trend:"flat"`**; `RiskSeedRow.trend` is
  `"up"|"flat"|"down"` (verified) so `"flat"` is valid — no action, just noting
  the value is confirmed against the helper interface.

## Completeness / Traceability

Every FR and AC maps to a design element. Verified against requirements rev 1.

| FR | Covered by | AC(s) | Status |
|----|-----------|-------|--------|
| FR-01 journeys `PART_OF` domain | §6, §6.2, §7.1 (domain edges by resolved id) | AC-01,11,12 | ✓ (domain-edge idempotency → C-01) |
| FR-02 activities in `PRECEDES` | §4.2 (frozen roster), §6.3 | AC-02 | ✓ |
| FR-03 roles `EXECUTES` | §4.3, §6.3, §7.1 (shared role edge) | AC-03 | ✓ |
| FR-04 systems `USES_SYSTEM` | §4.4, §6.3, §7.1 (shared system edge) | AC-04 | ✓ |
| FR-05 KPIs via `POST /api/v1/kpis` | §7.2 | AC-05 | ✓ (dedup shape → C-03) |
| FR-06 `MEASURES` grounding | §7.2, §3.1 | AC-05,06,15 | ✓ (FinOps ungrounded → C-04) |
| FR-07 optional alignment (`should`) | §7.2 step 3 | — | route unverified → C-05 |
| FR-08 stories/ACs (root modelId) | §7.3 | AC-07 | ✓ (root id resolved, not hard-coded) |
| FR-09 risks via risk-register | §8.1 | AC-08 | ✓ |
| FR-10 compliance rows (`should`) | §8.1, §3.2 (OQ-2 split) | AC-08 | ✓ |
| FR-11 idempotent seed script | §8.2, §3.3 | AC-08,09 | ✓ (dedup pinned precisely) |
| FR-12 DDD mapping (`should`) | §4.4/§4.8, §3.4 (OQ-4→attr tag) | AC-10 | ✓ (lighter path justified) |
| FR-13 mapping table | §4 (frozen) | AC-14 | ✓ |
| NFR-01 no new store/label/route/view | §10 | AC-01,13 | ✓ (verified: no schema/route/view edit) |
| NFR-02 idempotency/isolation | §6.1,§7,§8.2 | AC-09,11 | ✓ (script-edge idempotency → C-01) |
| NFR-03 governed-API-only | §7,§8.3 | AC-08,10,13 | ✓ |
| NFR-04 lifecycle-guard compat | §6.1 | AC-12 | ✓ (only non-lifecycle rows) |
| NFR-05 house rules | §7,§8 | AC-13 | ✓ |
| NFR-06 no view/route edit | §10 | AC-13 | ✓ |

| AC | Design coverage | Test artifact (§9) | Status |
|----|-----------------|--------------------|--------|
| AC-01 | §6, §7.1 | finance-process-slice | ✓ |
| AC-02 | §4.2, §6.3 | finance-process-slice | ✓ |
| AC-03 | §4.3, §7.1 | finance-process-slice | ✓ |
| AC-04 | §4.4, §7.1 | finance-process-slice | ✓ |
| AC-05 | §7.2 (six grounded) | finance-kpis | ✓ (C-03) |
| AC-06 | §7.2 (cardinality) | finance-kpis | ✓ |
| AC-07 | §7.3 + control model | finance-stories | ✓ |
| AC-08 | §8.1 | finance-risks | ✓ |
| AC-09 | §8.2 | finance-risks | ✓ |
| AC-10 | §4.4 (attr tag) | finance-ddd | ✓ |
| AC-11 | §6.1, §7 | finance-process-slice | ✓ (C-01) |
| AC-12 | §6.1 | finance-process-slice | ✓ |
| AC-13 | §10, CLI | typecheck + git diff | ✓ |
| AC-14 | §4 | doc review | ✓ |
| AC-15 | §3.1 (blocked-on-OQ-1) | finance-kpis (deferred) | ✓ (explicitly gated) |

No orphan FR, no orphan AC, no design element without a governing requirement.
Every file in §10 traces to ≥1 AC.

## What is done well (acknowledged)

- **§6.2 is the standout call.** The design correctly identifies that shared-system
  and journey→domain ids are server-generated and therefore **cannot** live in the
  JSON fixture — and that because the loader throws on any `realImport` row error,
  a fixture with a dangling shared-id edge would fail the entire slice load. Moving
  those edges to the graph script (resolved by id) is not gold-plating; it is
  required for the load to succeed. Verified against `seed-saas-operator.ts:64-68`
  and `import.ts` phase-2 edge handling.
- **XD-06-erratum handled correctly:** the KPI→metric edge is `MEASURES` (not the
  lifecycle-guarded `INSTANTIATES`), created via `linkKpiToMetric`; AC-06 asserts
  the module-pin `INSTANTIATES` guard is unaffected.
- **OQ resolutions are grounded in verified facts:** OQ-1 (metric absent — confirmed),
  OQ-2 (compliance needs `rule_dsl`+`actions` — confirmed, so descriptive
  obligations correctly route to risk-register), OQ-3 (risk-list has no `name`
  filter — confirmed, TS-side match is correct), OQ-4 (DDD maps Capability not
  System — confirmed, `capabilities.ts` `setContext`; the lighter attr-tag path
  is a defensible `should` degrade).
- **Ownership boundary is airtight** (§8.3, §10): the git-diff scope enumerates
  exactly the owned files; no owned-elsewhere storage/route/schema/view is touched.

## Verdict: **approve**

Zero blockers. Five concerns (C-01..C-05), all addressable in the tasks phase or a
light design touch-up without re-architecting: three are precision gaps around
idempotency/id-resolution/route-naming that the tasks phase must pin (C-01, C-02,
C-03, C-05), and one is an XD-06-posture flag for a knowingly-ungrounded KPI
(C-04). The core approach — three governed delivery channels, self-owned scripts,
zero owned-elsewhere edits — is sound and every interface it depends on was
verified to behave as the design claims. Recommend resolving C-01/C-03 (the two
idempotency-contract gaps) before or during task authoring so AC-09/AC-11 have a
concrete implementable contract.
