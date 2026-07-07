# Spec: product-delivery-process-model
**Size**: medium | **Created**: 2026-07-06 | **Current Phase**: execution:complete

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | spec-review-agent (verdict approve, 0 blockers) | 2026-07-06 |
| Req Review | approve (0 blockers, 3 concerns) | - | 2026-07-06 |
| Design | approved | spec-review-agent (verdict approve, pass 2/2, 0 blockers) | 2026-07-06 |
| Design Review | approve (0 blockers, 2 concerns, 2 nits) | - | 2026-07-06 |
| Tasks | approved | - | 2026-07-06 |
| Execution | complete | implementer (T-01..T-13) | 2026-07-06 |

**review_passes**: 0

**Tasks summary**: 13 tasks (12 build + 1 final-validation), 1 new fixture, 1
seed CLI, 4 feature-owned seed helpers under `api/src/seed/product-delivery/`,
1 one-line `package.json` edit, 10 new integration test files. No `pwa/` file.
Design-review non-blocking clarifications folded in: **C-05** (shared catalog
resolves by TS-side `JSON.parse(attributes_json).seedKey` / top-level
`operatorSeedKey`, not a top-level `seedKey`) → T-03; **C-06** (edge pre-checks
use a **literal** relationship type, one query per type — Neo4j rejects
`[r:$type]`) → T-03/T-05/T-06.

**Verification:**
- `verified_at`: 2026-07-06
- `verification_artifact`: `bun run typecheck` exit 0; `bun test api/__tests__/product-delivery-*.integration.test.ts` green (34 tests, 11 files) against the live stack seeded in order `seed:saas-operator` → `seed:saas-metric-library` → foundation-loader import of `product-delivery.json` → `seed:product-delivery`.

**Per-AC verification artifact:**

| AC | Artifact |
|----|----------|
| AC-01 | `api/__tests__/product-delivery-scope.integration.test.ts` — domain resolved by seedKey, journeys PART_OF it; `assertFixtureLoaded` throws `product_fixture_not_loaded` on an empty context (fail-fast, writes nothing) |
| AC-02 | `api/__tests__/product-delivery-journeys.integration.test.ts` — the 3 journeys PART_OF the product_delivery domain, UUIDv7 ids, resolved by seedKey; roster uniqueness + strict UUIDv7 asserted |
| AC-03 | `api/__tests__/product-delivery-activities.integration.test.ts` — per-journey DISTINCT activity set == roster; DISTINCT PRECEDES (from,to) chain == 8 declared pairs |
| AC-04 | `api/__tests__/product-delivery-roles.integration.test.ts` — every activity ≥1 EXECUTES; slice-local roles exactly once; re-run adds no duplicate Software Engineer (resolve-or-create) |
| AC-05 | `api/__tests__/product-delivery-systems.integration.test.ts` — USES_SYSTEM present; shared systems resolve to the foundation catalog (no dup); slice-local systems carry a valid systemKind; re-run net-zero |
| AC-06 | `api/__tests__/product-delivery-kpis.integration.test.ts` — 4 KPIs with pinned targets; MEASURES link set == `PRODUCT_KPI_METRIC_MAP` (today: 1, Release Frequency → metric-deploy-frequency); C-02 negative: a second `linkKpiToMetric` throws `KpiMetricAlreadyLinkedError` |
| AC-07 | `api/__tests__/product-delivery-kpis.integration.test.ts` — each KPI carries its declared ALIGNED_TO rows + `domain_id` (distinct concerns, C-03) |
| AC-08 | `api/__tests__/product-delivery-stories.integration.test.ts` — 3 stories, each DESCRIBES_ACTIVITY + STORY_FOR_ROLE, top-level persona/action/benefit/narrative populated; UserStory label pre-registered |
| AC-09 | `api/__tests__/product-delivery-stories.integration.test.ts` — each story ≥1 AcceptanceCriterion with non-empty G/W/T via ACCEPTANCE_OF |
| AC-10 | `api/__tests__/product-delivery-risks.integration.test.ts` — ≥2 risks POST to `/api/v1/risk-register`, domain="Product & Delivery", valid fields, persisted id, OQ-4 linked entity; re-run no duplicate |
| AC-11 | `api/__tests__/product-delivery-ddd.integration.test.ts` — each capability NEEDS_CAPABILITY←Activity, SUPPORTED_BY→System, CAPABILITY_IN_MODEL→operator root, ASSIGNED_TO_CONTEXT→the Product Delivery Context (UUIDv7 018f0200-0005-…001); re-run net-zero per-capability |
| AC-12 | `api/__tests__/product-delivery-seed-idempotency.integration.test.ts` — fixture lifecycle-clean, strict UUIDv7 ids, no banned label; full re-run net-zero on Product nodes + fixture edges (stable edge ids ⇒ MERGE-on-id idempotent); retail Model #1 subgraph unchanged |
| AC-13 | `api/__tests__/product-delivery-no-schema-additions.integration.test.ts` — every label/edge the slice writes resolves from the ontology registry; `git diff shared/src/schema/{nodes,edges}.ts` shows no additions |
| AC-14 | manual: `bun run typecheck` exit 0; `git diff --stat` — this spec's surface confined to `shared/seed/saas-operator/product-delivery.json`, `api/scripts/seed-product-delivery.ts`, `api/src/seed/product-delivery/**`, `package.json` (one `seed:product-delivery` line), and `api/__tests__/product-delivery-*` — no route.ts/SURFACES/views, no kpi/risk/story/DDD/metric route code, no schema-array/RBAC/error-code edit |

**Design-time OQs resolved in design.md §2:**
- **OQ-1** (was blocking) — three of four Product metrics (cycle time, feature
  adoption, spec throughput) absent from `saas-metric-library`'s frozen roster.
  **Resolved as a split, no dependency edit:** author all four KPIs; link only
  `Release Frequency → metric-deploy-frequency` (the one canonical metric today);
  defer the other three `MEASURES` links behind a single `PRODUCT_KPI_METRIC_MAP`
  constant. Keeps XD-10 depth + XD-06 fidelity + a deterministic single-shot
  build without editing the dependency's frozen §4 roster / AC-06 (NFR-01).
- **OQ-2** — story/AC write path → the governed model-scoped routes
  (`POST /api/v1/models/:root/stories[/…/acceptance-criteria]`), which set the
  top-level domain fields the generic import path cannot (design §5.4).
- **OQ-3** — self-owned `bun run seed:product-delivery` CLI, run after
  `seed:saas-operator` + `seed:saas-metric-library`; fixture rides the foundation
  loader (zero loader edit); fixed step order fixture→KPIs→links→alignments→
  stories→ACs→DDD→risks (design §5, §5.7).
- **OQ-4** — each risk `linked_entity` targets the `product_delivery` domain or
  the specific at-risk activity, for cockpit attribution (design §5.6).
- Review concerns C-01 (OQ-1 process gate) / C-02 (alignment via
  `POST /api/v1/kpi-alignments`) / C-03 (`domain_id` vs `ALIGNED_TO` distinct) /
  N-01 (`NEEDS_CAPABILITY` direction) / N-02 (story fixture non-viable) — all
  addressed (design §2, §2.1 Deviations Register D-1/D-2/D-3, §5.3/§5.4).

**Open Questions still needing the USER (surfaced by the design, non-blocking for this build):**
- **OQ-1'** — the XD-06-faithful fix for the three metric-less Product KPIs is to
  add `Cycle Time` / `Feature Adoption` / `Spec Throughput` to
  `saas-metric-library`'s roster (each formula/unit/category/benchmark) + its
  AC-06 expected set — a **coordinated amendment to a dependency mid-execution**
  this spec cannot make (NFR-01). Recommend the orchestrator ask the user to
  approve option (a) as a follow-up amendment to `saas-metric-library` and, if
  approved, pin the three new `metric-*` seed ids into `PRODUCT_KPI_METRIC_MAP`
  (design §5.3) + AC-06 before execution. Otherwise the one-link build ships now
  and the amendment is scheduled later.

**Design corrections to requirements (Deviations Register, design §2.1 — for a requirements-errata note):**
- **D-1** — Representation-Mapping rows M-07/M-08/M-10/M-11 and FR-12 said stories,
  ACs, capabilities, and bounded contexts ride the import fixture. They cannot
  (top-level story fields; atomic `CAPABILITY_IN_MODEL`; `BoundedContext` via
  `ontology/import`). Corrected to governed model-scoped routes (design §3.2, §8).
- **D-2** — the KPI alignment path is the governed `POST /api/v1/kpi-alignments`
  (not a generic `ALIGNED_TO` edge).
- **D-3** — `NEEDS_CAPABILITY` direction is `Activity → Capability` (N-01).

**Artifacts:**
- 📄 Requirements: `.claude/specs/product-delivery-process-model/requirements.md`
- 📄 Design: `.claude/specs/product-delivery-process-model/design.md`
- 📄 Tasks: `.claude/specs/product-delivery-process-model/tasks.md`
- 📝 Reviews: `.claude/specs/product-delivery-process-model/review-requirements.md`,
  `.claude/specs/product-delivery-process-model/review-design.md`

**Next**: Approve tasks and start execution (medium spec — task review is
skipped). Before execution the orchestrator should put **OQ-1'** to the user (a
`saas-metric-library` roster amendment adding Cycle Time / Feature Adoption /
Spec Throughput) — non-blocking: the build ships four KPIs with one live
`MEASURES` link today (`Release Frequency → metric-deploy-frequency`) and the
three deferred behind `PRODUCT_KPI_METRIC_MAP` (T-04); approving (a) later means
uncommenting three map entries + updating AC-06, no other change.
