---
feature: "marketing-process-model"
reviewing: "design"
artifact: "design.md (revision 1, against requirements rev 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "1 of 2"
---

# Review: marketing-process-model / design.md

Reviewed cold against the codebase and every upstream artifact: the requirements
(rev 2), `review-requirements.md`, the app blueprint (`blueprint-saas-operator.md`),
and the design-approved dependency specs (`saas-operator-foundation`,
`saas-metric-library`, `funnel-pipeline-modeling`, `story-spec-core` /
`stories.ts`, `ddd-system-modeling` / `capabilities.ts`, `risk-compliance-change`
/ `risk-register.ts`, `kpi-okr-governance` / `kpi-crud.ts` +
`kpi-sla-alignment.ts`, `system-augmentation-model` / `system-kind.ts`).

This is a **compose-only content slice**: it authors no schema, no store, no
route, no view. The design honours that discipline rigorously — every write rides
a verified existing (or design-frozen wave-1b) path, and §9 pins a tight File
Changes surface (one fixture, one companion script, one `package.json` line,
tests). I verified the load-bearing interface claims against real code and they
hold up:

- `POST /api/v1/edges {type:"MEASURES",…}` is accepted because `MEASURES` is
  **not** in `LIFECYCLE_EDGES` — confirmed against `saas-metric-library/design.md`
  §2.1 and the erratum; `INSTANTIATES` genuinely would 409.
- `kpiAlignmentCreateRequestSchema`, `storyCreateSchema` (`{persona, action,
  benefit, activityId, roleId?}`), `neededBySchema` (activityId XOR storyId),
  `supportedBySchema {systemId}`, `contextAssignSchema {boundedContextId}`,
  `createRiskSchema` (owner/domain/likelihood 1–5/impact 1–5/status/trend,
  `risk_type` enum incl. `compliance`/`operational`) — all match the shared
  schemas verbatim.
- The `POST /api/v1/funnels/transitions` route, `funnelTransitionSchema`, and the
  `seed:funnel-pipeline` script name match `funnel-pipeline-modeling/design.md`
  §3.4/§4.4/§7 exactly. `POST /api/v1/nodes/Funnel|Stage` matches the router's
  `nodes/([^/]+)` dispatch and the funnel spec's node-create path.
- Every route the companion script calls **is** mapped in
  `api/src/auth/rbac-permissions.ts` (import→data:write, edges→edge:write,
  kpis→kpi:write, kpi-alignments→kpi:write, nodes/:label→node:write,
  risk-register→risk:write, stories→story:write, capabilities→capability:write,
  query/cypher→query:read). No route is silently unmapped.

No blockers. Two concerns and three nits below; all landable in the re-review
budget.

## Findings

### Blockers

None.

### Concerns

- **C-01 — §5 states the wrong RBAC permission for the story + AC routes, under a
  column that claims verification.** The §5 table (design.md:410–411) lists
  `POST /api/v1/models/:modelId/stories` and `.../acceptance-criteria` as requiring
  **`model:write`**, and the paragraph at design.md:416–417 asserts "every route
  above is already mapped (verified in `rbac-permissions.ts`)." The actual
  mappings are **`story:write`** (`rbac-permissions.ts:309,312`), not `model:write`.
  This is a false "verified" claim in a table the reviewer must be able to trust.
  It does not break execution — the seed script runs against a dev server with
  `ONELOGIN_ISSUER` unset, where `devSession()` injects `permissions: ["*"]`
  (`router.ts:339–355`), so any mapped permission passes — but a table that
  documents the wrong strings while asserting it was checked is a correctness gap.
  *Recommendation:* correct the two rows to `story:write`; while there, spot-check
  the whole column against `rbac-permissions.ts` (the rest — kpi/edge/node/risk/
  capability/query/data — are correct).

- **C-02 — the companion script's auth/session model is never stated.** §5/§7
  describe the script POSTing to ~10 governed routes behind the central router
  gate, but nowhere pins **how those POSTs authenticate**. The sibling scripts it
  mirrors (`seed-saas-operator.ts:54`, `seed-saas-metric-library.ts:42`) send **no
  auth header** and rely on the `ONELOGIN_ISSUER`-unset dev-session fallback
  (`router.ts:363`) — that is the real, working seam, but it is an unstated
  precondition. A reader could reasonably assume the script needs a cookie/token.
  *Recommendation:* add one line to §4.4/§7 stating the script targets the local
  dev API (`127.0.0.1:8787`, loopback per house rule) with `ONELOGIN_ISSUER`
  unset, inheriting the dev-session grant exactly as `seed-saas-operator.ts` /
  `seed-saas-metric-library.ts` do; note it is DEV-ONLY and never a
  beyond-localhost path.

### Nits

- **N-01 — dependency file names cited in prose are stale in two places, though
  §9 is correct.** The design body says the routes ride `ddd-system.ts`
  (design.md:230–241, "`ddd-system.ts:18`", "`ddd-system.ts:100/112/117`"); the
  real file is `api/src/routes/capabilities.ts` (the `capability*` handlers live
  there; `shared/src/schema/ddd-system.ts` is the *schema* file, which is what the
  line refs actually point at). Similarly §2.1/D-2 and §11 reference the funnel
  route as living in `funnels.ts` — correct per the funnel spec, but that file does
  **not exist yet** (wave-1b not built); fine as a forward reference, worth a
  "(created by `funnel-pipeline-modeling`)" note so an implementer doesn't hunt for
  it. §9's "Explicitly NOT edited" list already names `capabilities.ts` and
  `funnels.ts` correctly, so this is prose-vs-list drift only.

- **N-02 — `Stage`→`Funnel` linkage lookup key is under-specified for idempotency.**
  §4.5 keys Stage idempotency on "`Stage.name`+funnel linkage," but at the moment
  a `Stage` is created (`POST /api/v1/nodes/Stage`) the `HAS_STAGE` edge does not
  yet exist (edges are step 3, nodes are step 2, §4.3). A pure `Stage {name}`
  lookup across the graph could collide with a sales/other-funnel stage also named
  "Lead"/"MQL". *Recommendation:* pin a stage-scoping attribute on the `Stage`
  node at create (e.g. `attributes.funnelKey:"marketing-demand-funnel"` or the
  resolved `funnelId`) so the pre-POST existence check is unambiguous within this
  funnel — mirrors the `Funnel.name+modelId` key the same table already uses.

- **N-03 — AC-17 (mapping-coverage) has no explicit assertion for M-06's optional
  persona edges.** M-06 (`PERFORMS_AS`/`PARTICIPATES_IN`) and M-11's `PARAM_BINDS`
  are marked "optional" in §3.1/§3.2. AC-17 requires "every Mapping-Table
  label/edge is instantiated by ≥1 seeded node/edge/row." If the seed omits the
  optional persona edges or `PARAM_BINDS`, AC-17 fails on those rows.
  *Recommendation:* either commit to seeding ≥1 of each optional edge (so AC-17 is
  satisfiable) or scope AC-17's coverage assertion to the non-optional rows —
  state which in the tasks phase.

## Completeness / Traceability

Every FR and NFR maps to a design section and ≥1 AC; every AC maps to a File
Changes test. No orphan FRs, no orphan ACs, no File-Changes entry without a
serving requirement.

| FR / NFR | Design section | AC(s) | Status |
|----------|----------------|-------|--------|
| FR-01 journeys | §3.1, §4.1, §4.4 | AC-01 | covered (PART_OF→Domain correctly moved to companion script, §4.1 — the one genuinely non-obvious call, well-argued) |
| FR-02 activities + PRECEDES | §3.1, §4.1 | AC-02 | covered |
| FR-03 roles/personas | §3.1, §4.1 | AC-03 | covered |
| FR-04 systems + systemKind | §3.1 (per-system kind table), §4.1 | AC-04 | covered — `systemKind` requiredness + `400 attribute_violation` correctly traced to `system-kind.ts` |
| FR-05 KPIs | §3.2 (6-KPI table), §4.2 | AC-05 | covered; category enum correctly pinned (`Marketing-Sourced Pipeline`/`Lead Volume`→`other`) |
| FR-06 MEASURES | §3.2, §4.2 | AC-06 | covered; metric ids `metric-cac`/`metric-pipeline-conversion` verified present in frozen roster |
| FR-07 KPI alignment | §3.2, §4.2, D-1 | AC-07 | covered; D-1 correctly redirects to `POST /api/v1/kpi-alignments` (verified `kpi-sla-alignment.ts`) |
| FR-08 funnel | §3.3, §4.3, D-2 | AC-08 | covered |
| FR-09 CONVERTS_TO | §3.3, §4.3 | AC-09 | covered; funnel-owned transition route correctly used, not a fixture row |
| FR-10 stories | §3.2, §4.4 | AC-10 | covered (permission string wrong — C-01) |
| FR-11 ACs | §3.2 | AC-11 | covered (permission string wrong — C-01) |
| FR-12 risks | §3.2 | AC-12 | covered; Postgres row + `risk_type` enum verified |
| FR-13 capabilities | §3.2 | AC-13 | covered; needed-by XOR / supported-by / context schemas verified |
| FR-14 seed slice | §3.1, §4.1, §4.5, §4.6, §7 | AC-14, AC-15 | covered; OQ-1 (fixture-vs-API split + companion script) fully closed in §4.5/§4.6 — the strongest part of the design |
| FR-15 mapping table | requirements Mapping Table; §3.1–§3.3 | AC-17 | covered (see N-03 on optional-edge coverage) |
| NFR-01 no new schema | §3, §5, §9 | AC-16 | covered |
| NFR-02 idempotency + isolation | §3.1, §4.4, §4.5 (Rule D) | AC-15 | covered; check-before-POST keying pinned per kind (see N-02 for Stage) |
| NFR-03 governed-API-only | §4.2, §5, §9 | AC-05/10/12/13/16 | covered; §9 "NOT edited" list is thorough |
| NFR-04 lifecycle-guard | §3.1, §4.1 | AC-14 | covered |
| NFR-05 house rules | Rule A/E, §5, §9 | AC-16 | covered |

**Carried requirements items — all dispositioned in the design:**
- OQ-1 / C-02 → **closed** (self-owned `seed:marketing` companion script; §4.5/§4.6/§7). Strong.
- OQ-3 → **closed** (step-0 id resolver, §4.4). Sound; the `saasOperatorRoot:true` marker + seedKey resolution matches the foundation spec's contract.
- C-04 (MQL→SQL proxy) → dispositioned option (a), documented in KPI `description`. Reasonable.
- N-03 (lead-volume/pipeline metric gap) → confirmed no roster metric; seeded `MEASURES`-less. Correct.

**Blueprint / house-rule conformance:** no violation found. No new view (matches
View Tree — content specs add none). No `route.ts`/`SURFACES`/`views/index.tsx`
edit (XD-05 honoured). Risk/SLA/capability/story data created via governed APIs
only (XD-04/XD-08). KPIs grounded via `MEASURES` per XD-06/XD-06-erratum. Full
pipeline depth (XD-10) present. Retail isolation (XD-01) held (Rule D). zod-only,
loopback, no-tsc, en-US, `/api/v1/` all respected.

## Verdict

**approve.** Zero blockers. The design is thorough, correctly composes-only, and
its load-bearing interface claims verify against the code and the design-frozen
dependency specs. C-01 (wrong permission strings under a "verified" claim) and
C-02 (unstated seed-script auth model) should be fixed in a light revision or
folded into the tasks phase; N-01–N-03 are optional. None of these change the
design's direction or block task decomposition.
