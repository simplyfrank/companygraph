---
feature: "sales-process-model"
reviewing: "design"
artifact: "design.md (rev 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "2 of 2"
---

# Design Review: sales-process-model (rev 2, re-review)

Reviewed cold against the approved `requirements.md` (rev — `review-requirements.md`
records pass 2/2 `approve`), the blueprint (`blueprint-saas-operator.md`,
XD-*/View Tree/UX-*), `.claude/CLAUDE.md`, and the dependency specs + as-built
codebase. Every load-bearing interface claim was re-checked against real files,
and every pass-1 finding was checked for resolution.

**Headline:** The single pass-1 blocker (B-01, funnel-subsystem execution
precondition) and all four concerns (C-01…C-04) are resolved. Every governed
write path the resolver targets is verified as-built. This is an exemplary
content design; it approves.

---

## Pass-1 findings — disposition in rev 2

| Prior | Resolution in rev 2 | Verified |
|-------|---------------------|----------|
| ~~B-01~~ → **resolved** | Funnel-subsystem **execution** is now named a hard precondition in §1 (with the current `execution:blocked` status stated verbatim), added to the NFR-06 seed sequence, and enforced by a fail-loud assertion in `resolve()` (§4.4: `Funnel` label probe + `funnels/transitions` 404-vs-400 route probe). §4.6 gates the `funnel()` step on it; AC-16 (§8) now asserts fail-loud on a missing funnel subsystem as well as on unresolved ids. The orchestrator note correctly frames this as a build-ordering gate, not a design defect. | `funnel-pipeline-modeling` STATUS still `execution:blocked`; `api/src/routes/funnels.ts` still absent; `funnels/transitions` absent from `api/src/` — exactly as the design now documents. |
| ~~C-01~~ → **resolved** | §3.1 (line 200-204), §3.2, and §4.7 now route **every** `ALIGNED_TO` write — including the fully-in-slice `KPI→UserJourney/Activity` case — through `POST /api/v1/kpi-alignments`. The fixture-row option is dropped; `ALIGNED_TO` is removed from the §3.1 fixture-edge table. | `kpi-sla-alignment.ts:24,40,46` accepts `target_type ∈ {journey,activity,domain}` and enforces a `404` target-exists check + `weight ∈ [0,1]`. |
| ~~C-02~~ → **resolved** | §4.5 now presents a single mechanism (FR-05b KPIs resolver-created via `POST /api/v1/kpis` then grounded atomically). The post-hoc-DELETE and unconditional-fixture variants are relegated to a parenthetical pointing at §12 Rejected alternatives (line 393) and no longer read as live options. §4.11's FR-05b row is reworded to the create-if-metric-present-and-not-already-created guard. | §4.11 row consistent; §12 carries both rejected variants. |
| ~~C-03~~ → **resolved** | The design now has a real `## 10. Open items` section recording OQ-2 (the sole open user decision), its owner (`saas-metric-library` catalog addition), effect, and the FR-05a-ships-regardless fallback. The dangling `§10 Open items` cross-references (§1, §2 C-02 row) now resolve correctly; Traceability moved to §11, Rejected alternatives to §12. | §10 present; §11/§12 renumbered; internal refs consistent. |
| ~~C-04~~ → **resolved** | §2.1 adds a "Doc-consistency resolution (C-04)" paragraph: the design treats the requirements text as the looser superset (FR-06's `ALIGNED_TO`/`PARAM_BINDS` family, FR-12's `risk-register` helper) satisfied by the concrete members named in D-1/D-2, and recommends the orchestrator land a one-line errata within budget. Absent the errata, the superset reading keeps the artifacts non-contradictory. | D-1 (`kpi-alignments`), D-2 (`seedRisk`→`risk-register`) both verified; `param-bindings` mapping at `rbac-permissions.ts:245`. |
| ~~N-01~~ → **resolved** | §1 now cites `seed-saas-operator.ts:66-68` (errors[] throw) / `:62-64` (!res.ok throw) correctly. | matches pass-1 verification. |
| ~~N-02~~ → **resolved** | §4.6 step 2 carries the explicit note that the six funnel stages are deliberately distinct from the five §4.1 journeys, with the AC-07/AC-01 non-coupling stated. | present. |

---

## Verification performed (re-check)

All as-built interfaces the design relies on are confirmed present and as
described:

- `api/src/seed/link-kpi-metric.ts` — `linkKpiToMetric` + `KpiMetricAlreadyLinkedError`
  at-most-one guard (§4.5). Present.
- `api/src/seed/governed-seed-helper.ts` — `RiskSeedRow` (line 34) + `seedRisk`
  (line 95) POSTing to `/api/v1/risk-register` (§4.8, D-2). Present.
- `api/src/routes/kpi-sla-alignment.ts` — `POST /api/v1/kpi-alignments`,
  `target_type` journey/activity/domain, target-exists `404`, `weight ∈ [0,1]`
  (§4.7, D-1). Present; `kpi:write` (`rbac-permissions.ts:229`).
- `api/src/routes/risk-register.ts` — `GET …?domain=` filter (line 47/65-67, no
  `name` filter → the design's check-before-POST-on-name dedupe is the right
  mechanism), `createRiskSchema` (line 7). §4.8 accurate.
- `api/src/routes/stories.ts` — model-scoped stories + `story_activity_not_in_model`.
  `api/src/routes/capabilities.ts` — `capabilityCreateSchema`, needed-by /
  supported-by PUT arms (§4.9/§4.10). Present.
- `rbac-permissions.ts` — `POST nodes/:label` (`node:write`, :51), `POST edges`
  (`edge:write`, :57), `POST kpis` (`kpi:write`, :212), `param-bindings` (:245).
  §5 permission column accurate; no new mapping needed.
- `shared/src/schema/system-kind.ts` — `systemKind` is a **required** `System`
  attribute (`required:["systemKind"]`, line 30); the design's requirement that
  CPQ/E-Signature carry a valid `systemKind` in their fixture rows (§3.1, AC-04)
  is load-bearing and correct.
- `shared/seed/commercial-domain.json` KPI shape — `{category, unit, target_value,
  target_direction, measurement_frequency, domain_id}`; §3.3's envelope + the
  `domain_id`-omission rationale match exactly.

**Confirmed absent (correctly documented as an execution gate, not a defect):**
`api/src/routes/funnels.ts`, the `funnels/transitions` route, and the
`Funnel`/`Stage`/`HAS_STAGE`/`CONVERTS_TO` runtime constructs — all owned by
`funnel-pipeline-modeling`, which remains `execution:blocked`. The rev-2 design
names this as a hard **execution** precondition and fails loudly rather than
half-writing; the design itself is complete.

---

## Findings

### Blockers

None.

### Concerns

None carried forward; all pass-1 concerns resolved.

### Nits

**N-01 (optional)** — `systemKind` is a **required** fixture attribute for the
CPQ/E-Signature `System` rows (else `POST /api/v1/import` rejects the row), but
the §3.1/§4.1 node-envelope description ("`id`, `name`, `description`,
`attributes`") surfaces this only implicitly, via AC-04. A one-line note in §3.1
that function-specific `System` rows must carry `attributes.systemKind` (a valid
`SYSTEM_KINDS` member) would make the fixture author's obligation explicit at
tasks time. Non-blocking.

**N-02 (optional, orchestrator)** — The §2.1 D-1/D-2 requirements-errata note is
the only artifact-consistency action left. The design's superset reading keeps
`requirements.md` and `design.md` non-contradictory without it, so this is not a
gate item — but landing the one-line errata during task authoring (as the design
recommends) is the cleaner end state.

---

## Completeness / Traceability

Every FR and NFR maps to a design element and ≥1 AC; the design's own §11 table
is accurate. Independent re-derivation, with the funnel execution-gate flagged:

| FR / NFR | Design element | AC(s) | Status |
|----------|----------------|-------|--------|
| FR-01 journeys `PART_OF` domain (resolver edge) | §3.1, §4.1, §4.7 | AC-01, AC-12 | OK — foundation domain verified |
| FR-02 activities + `PRECEDES` (fixture) | §3.1, §4.2 | AC-02 | OK |
| FR-03 roles × activities `EXECUTES` | §3.1, §4.3, §4.7 | AC-03 | OK — `sales_lead` marker verified |
| FR-04 CRM/MOMS `USES_SYSTEM` + CPQ/E-Sign | §3.1, §4.4, §4.7 | AC-04 | OK — `systemKind` required-attr verified |
| FR-05 KPI `MEASURES` via `linkKpiToMetric` | §4.5 | AC-05, AC-05a | OK — helper verified |
| FR-05a win-rate + pipeline-conversion | §4.5 | AC-05, AC-05a | OK — metric ids present |
| FR-05b sales-cycle/ACV/quota (conditional) | §4.5 | AC-05a | OK — clean after C-02 fix |
| FR-06 KPI alignment (all via `kpi-alignments`) | §3.1, §3.2, §4.7 (D-1) | AC-06 | OK — C-01 resolved (route-only) |
| FR-07 Funnel + `HAS_STAGE`, `modelId` anchor | §4.6 (Rule D) | AC-07 | OK design; **execution-gated on funnel subsystem (B-01, §1)** |
| FR-08 `CONVERTS_TO` via funnel route, range guard | §4.6 | AC-08 | OK design; **execution-gated on funnel subsystem (B-01, §1)** |
| FR-09 stories via model-scoped route | §4.9 | AC-09 | OK — route verified |
| FR-10 ACs Given/When/Then | §4.9 | AC-09 | OK — route verified |
| FR-11 capabilities via DDD routes | §4.10 | AC-10 | OK — routes verified |
| FR-12 risks via governed API, dedupe | §4.8 (D-2) | AC-11, AC-12 | OK — `seedRisk` + `?domain=` verified |
| FR-13 mapping table | requirements §Mapping; §8 | AC-14 | OK |
| NFR-01 no new machinery | §3, §5, §6, §9 | AC-15 | OK — no schema/route/view edits |
| NFR-02 owned-elsewhere untouched | §7, §9 (Rule E) | AC-11, AC-15 | OK — File Changes boundary exhaustive |
| NFR-03 idempotency + completeness + isolation | §4.8, §4.11 | AC-12 | OK — §4.11 FR-05b row now consistent |
| NFR-04 lifecycle-guard compat | §3.1, §3.2 | AC-13 | OK |
| NFR-05 house rules | §3.4, §5 | AC-15 | OK — zod-only, loopback, `/api/v1/`, central-gate auth |
| NFR-06 cross-entrypoint ordering (+ funnel exec precondition) | §1, §4.4, §4.6, §8 | AC-16 | OK — funnel precondition now included |

**Done well (acknowledged):**
- The B-01 fix is thorough: precondition stated in §1 with the live upstream
  status, `resolve()` probe (label + route 404-vs-400) fails loud, NFR-06 sequence
  updated, AC-16 extended, and an explicit orchestrator note distinguishing
  design-approval from execution-sequencing. Model handling of a blocked upstream.
- Rule E + §9's "Explicitly NOT edited" list remains exhaustive and correct — no
  `route.ts`/`SURFACES`/`views/index.tsx` (XD-05), no funnel/metric/story/DDD/risk
  route or storage edit (XD-04). Ownership discipline exemplary.
- No new `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS`, no new REST route, no new
  `ERROR_CODES` member, no new `getRoutePermission` mapping — all verified.
- Rule C discipline is now uniform: every governed-invariant edge (`MEASURES`,
  `CONVERTS_TO`, `ALIGNED_TO`, stories/ACs, capabilities) goes through its owning
  route; the fixture grep-empty family (AC-05/08/09/10) is airtight after C-01.
- §6 UI correctly `n/a`: no `pwa/` file, so UX-01..UX-06 and Platforms/Native
  tables impose no obligation — consistent with the blueprint (content specs add
  no views) and the requirements.

---

## Verdict: approve

Zero blockers. The pass-1 blocker (B-01, funnel-subsystem execution precondition)
is resolved: the design now names the executed `funnel-pipeline-modeling`
subsystem as a hard build-ordering precondition, gates the `funnel()` resolver
step on a fail-loud `resolve()` probe, threads it through NFR-06 and AC-16, and
frames it (correctly) as an execution-sequencing gate rather than a design defect.
All four pass-1 concerns (C-01 route-only `ALIGNED_TO`; C-02 single FR-05b
mechanism + §4.11 consistency; C-03 real Open Items section; C-04 doc-consistency
superset) are resolved, and every governed write path is verified as-built.

Two optional nits remain (N-01 make `systemKind` an explicit fixture obligation
in §3.1; N-02 land the D-1/D-2 requirements errata during task authoring) — both
recordable as open notes, neither gating.

**Orchestrator note:** approve the design now; **sequence this spec's execution**
after `funnel-pipeline-modeling` is unblocked and executed (its STATUS is
`execution:blocked` on `dev`), exactly as `MEASURES` execution follows
`saas-metric-library`. This is a build-ordering gate the design itself makes
explicit and fail-loud.

This is review pass 2 of at most 2.
