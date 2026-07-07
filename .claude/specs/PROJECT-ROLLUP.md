# companygraph — project rollup

**Date**: 2026-07-04 (baseline adoption update; prior rollup 2026-05-23)
**Author**: orchestrator session
**Status**: 3 specs at `execution:complete` (incl. `_baseline`); 3 specs in pipeline; 4 adopted surfaces awaiting backfill.

> **2026-07-04 adoption:** the post-2026-05-23 off-spec expansion (auth/RBAC/
> tenancy, Postgres storage layer, KPI/SLA/OKR, risk/compliance/change
> management, exec/analytics views) was **adopted, not reverted**, per the
> user's decision. It is governed by the as-built baseline spec
> `.claude/specs/_baseline/` (execution:complete, traceability green:
> 16 FRs / 16 ACs / 16 tasks). CLAUDE.md is reconciled; the former no-auth
> invariant (NFR-08/AC-22) is retired and its guard test deleted. Coverage:
> `_inventory.md` reports 24/24 code areas governed. Backfill specs still
> owed: auth-hardening (dev-mode JWT fallback!), kpi-sla-okr,
> risk-compliance-change, cto-analytics completion. The rollup below this
> banner predates the adoption — read it as the pre-drift pipeline state.

## SaaS-Operator Business-Process Model — spec-app fan-out (2026-07-06/07)

An 11-feature application (`blueprint-saas-operator.md`) modeling the business
that runs **docorg** — a lean vertical-SaaS operator (MOMS medical-office SaaS +
the Helm control-plane) — as a new "SaaS Operator" `BusinessModel` root, at
full-pipeline depth across six function domains (marketing, sales, finance/
accounting, customer-success, product-delivery, platform-ops), PLUS four net-new
platform capabilities. **Single-shot** (spec + build). Deliverable = both content
(seed slices + journeys/KPIs/stories/risks/DDD, each with a business-action→
label/edge mapping table) AND features. Process-modeling layer only (no
operational Lead/Invoice/Subscription entities).

**BUILD COMPLETE (Phase C, 2026-07-07):** all 11 features `execution:complete`.
App-level re-verification by the orchestrator: `bun run typecheck` **PASS**;
unit suite **api 513 / shared 105 / 0 fail**; **PWA vitest 510 / 0 fail**;
`design-conformance` **PASS** on all 5 new views; nav guard tests **40/40**.

| Slug | Tier | Size | Outcome |
|------|------|------|---------|
| `saas-operator-foundation` | foundation | large | complete (BusinessModel root, shared System/Persona/Role catalog, seed loader, FunctionMap) |
| `saas-metric-library` | foundation | large | complete (`MetricDefinition` label + `INSTANTIATES`, canonical metric catalog, MetricLibrary) |
| `funnel-pipeline-modeling` | foundation | large | complete (`Funnel`/`Stage` + `HAS_STAGE`/`CONVERTS_TO`, B-03 idempotency fix, `POST /api/v1/funnels/transitions`, FunnelBoard) |
| `marketing-process-model` | feature | medium | complete (marketing funnel Visitor→Lead→MQL→SQL) |
| `sales-process-model` | feature | medium | complete (sales pipeline Lead→…→Closed-Won) |
| `finance-accounting-process-model` | feature | medium | complete |
| `customer-success-process-model` | feature | medium | complete |
| `product-delivery-process-model` | feature | medium | complete |
| `platform-ops-process-model` | feature | medium | complete |
| `cross-function-exec-rollup` | feature | large | complete (OperatorCockpit, read-only `/api/v1/analytics/operator*`) |
| `function-benchmark-scoring` | feature | medium | complete (BenchmarkReport maturity scoring) |

**Phase C notes:** a concurrent `navigation-ia` restructure (commit `fb43471`)
landed a **7-surface IA** mid-build (removed the top-level `#/business`/`#/exec`
surfaces the blueprint froze; chat → floating widget). Per user decision the five
operator views were reconciled **under `#/insights`** (`functions`, `metrics`,
`funnels`, `benchmarks`, `operator`; legacy `#/exec/operator → #/insights/operator`
alias). Ownership boundaries held: no content spec edited the risk/change/SLA/
performance/kpi route code (XD-04/08); `router.ts`/`rbac-permissions.ts` carry
only additive funnel-mount lines. One cross-spec fix: the `system-augmentation-
model` vocabulary-singularity guard was extended to treat `api/src/seed/*.ts` as
seed data (product-delivery seeds an `ai_predictive` system there).
**Deferred to human review:** `/review-ui` on the five new `#/insights` operator
views; live-Neo4j integration + `bun run dev` e2e (the `*.integration.test.ts`
packs + skipped Playwright reload specs — self-skip cleanly without a stack).

## Business Modeling Studio — spec-app fan-out (2026-07-04)

A 10-feature application (`blueprint.md`) turning companygraph into a
business-modeling studio: author workflows across roles as first-class
user stories with Given/When/Then ACs → land in the graph → optimize key
activities → make them measurable via quantified KPI impact → base
domain-driven IT-system modeling on the process requirements. Multiple
business models coexist and share versioned, journey-level modules.

**BUILD COMPLETE (Phase C, 2026-07-05):** all 10 features `execution:complete`
on disk. Single-shot fan-out (XD-17) ran across four sessions (three
Fable-5 limit interruptions, each resumed from cache; the final feature built
on Opus 4.8). App-level re-verification by the orchestrator: `bun run
typecheck` **PASS**; unit suite **564 pass / 0 fail** (462 api + 102 shared);
`design-conformance` **PASS** on all 9 new views; all 47 new
`*.integration.test.ts` transpile clean; every blueprint View-Tree route
present in `route.ts` verbatim (`#/model/{models,canvas,stories,key-activities,
kpi-impact,systems,export}` + `#/exec/performance`).

| Slug | Tier | Size | Req | Design | Tasks | Execution |
|------|------|------|-----|--------|-------|-----------|
| `model-workspace-core` | foundation | large | approve (rev5) | approve | approve (25) | **complete** |
| `system-augmentation-model` | foundation | medium | approve | approve | (size: no review) | **complete** |
| `kpi-okr-governance` | foundation | large | approve | approve | approve (21) | **complete** |
| `story-spec-core` | foundation | large | approve | approve | approve (18) | **complete** |
| `business-model-authoring` | feature | large | approve | approve | approve (19) | **complete** |
| `key-activity-optimizer` | feature | medium | approve | approve | (size: no review) | **complete** |
| `ddd-system-modeling` | feature | large | approve | approve | approve | **complete** |
| `kpi-impact-mapping` | feature | medium | approve | approve | (size: no review) | **complete** |
| `kpi-okr-performance-dashboards` | feature | large | approve | approve | approve | **complete** |
| `requirements-export` | feature | small | (size: no review) | (small: none) | (size: no review) | **complete** |

**Consistency:** routes verbatim vs View Tree; `route.ts` solely owned by
`model-workspace-core` for `#/model/*`; no conflicting file rewrites — the
coordination hotspots (`seed-rbac-roles.ts` additive appenders,
`JourneyCanvas.tsx`/`journeyData.ts`, shadow-`kind`→`systemKind`) merged
cleanly (typecheck + full unit suite green over the combined tree).

**User decisions resolved (2026-07-05 final arbitration):** (1) B-03 import
guard = reject at import (`model-workspace-core` rev 5: `POST /api/v1/import`
rejects lifecycle labels/edges `409 model_lifecycle_route_required`,
write-nothing; AC-22); (2) roll-up source = Neo4j `:KPIMeasurement` via
`kpi-trends` (XD-02 amended); (3) impact edge = extend as-built `ALIGNED_TO` +
runtime `IMPACTS_KPI` for story→KPI (XD-04 amended; `DRIVES_KPI` stays
KeyResult→KPI). **Deferred to human review:** `/review-ui` on the new Model
surface + `#/exec/performance`; live-Neo4j integration + `bun run dev` e2e
(the integration/manual ACs listed per STATUS — not runnable without a stack).

**Known as-built defect pinned (not this build's fix):** `kpi-okr-governance`
recorded `GET /api/v1/roll-down/contributions` runs invalid Cypher and 500s —
owned by a follow-up fix on the adopted roll-down surface.

## governance-backfill — auth + risk/compliance specs (2026-07-06)

Closes the last two **owed backfill specs** for adopted-but-ungoverned
surfaces, surfaced by the spec-completeness audit. Both authored + reviewed
via the `spec-app` pipeline (plan mode — **specs only, no code**); every phase
`approve`, 0 blockers, traceability clean.

| Slug | Tier | Size | Req | Design | Tasks | Execution |
|------|------|------|-----|--------|-------|-----------|
| `auth-hardening` | foundation | large | approve | approve | approve (13) | planning-complete (deferred) |
| `risk-compliance-change` | foundation | large | approve | approve | approve (11) | planning-complete (deferred) |

- **`auth-hardening`** formalizes the as-built auth/RBAC/tenancy subsystem
  (`api/src/auth/*`, `api/src/middleware/*`, the central `router.ts` gate) and
  specs the **security fix** for the `oauth.ts` unverified-JWT dev fallback —
  it must fail-closed outside an explicit dev opt-in (extracted to a new
  `api/src/auth/dev-fallback.ts`); gates any non-local deploy. Adds auth
  decision-path integration tests.
- **`risk-compliance-change`** governs the Postgres-backed
  `risk-register`/`risk-compliance`/`compliance-rules`/`change-requests` routes
  with a documented data model, gap closure, and CI-Postgres integration tests.
- **Coordination (at implementation time, not now):** both additively touch
  the shared hotspots `router.ts` / `errors.ts` / `routes/openapi.ts`; risk
  also touches `api/src/ontology/storage/` (ontology-manager's area, additive).
  No hard file-ownership conflicts. Execution is deferred pending user go —
  `auth-hardening`'s dev-fallback change is security-sensitive.

**Traceability tooling hardened (2026-07-06):** `scripts/spec/spec-traceability.sh`
had two false-positive bugs the audit exposed — its `FR-[0-9]+` extraction
matched inside `NFR-11` and captured cross-spec FR references, and its
verification detector missed `bun test`/`typecheck`/`design-conformance`
proofs. Fixed to extract only *defined* FR/AC rows and recognize the house
verification styles. Post-fix sweep: **every completed spec passes**; the only
FAIL is `kpi-measurement-alignment` (in-flight `requirements:draft`).

## pwa-ux-conformance — governed UI remediation spec (2026-07-04)

A large **conformance-remediation** spec (not a rewrite — user decision) that
brings the existing pre-studio PWA views into full conformance with the
blueprint's UX-01..UX-06 allowances. **Approved** (author + 2-pass adversarial
review, verdict `approve with notes`, 0 blockers). Real baseline (tool-verified,
198 files swept): **55 files to remediate** — 16 view `.tsx` + 10 view
`.module.css` + 28 shared `components/**` + 1 `styles/chat.css` (auto-generated
`tokens.css` waived). 8 FRs, 12 ACs, 8 DDs, **33 per-surface tasks**. Fixes:
DD-01 token-alias map, DD-02 named OKLCH ramps (`--cat-1..6` / `--sev-1..5`) at
the stitch source `.claude/stitch/design-system.yaml` (regenerated, never
hand-edited), ARIA `ViewRegion` landmark helper, per-view state matrix.

**Scope-clean:** owns pre-studio views + shared primitives only; explicitly
excludes `pwa/src/views/model/**` and `#/exec/performance` (studio-owned, whose
own ACs already mandate UX-01..06). No `route.ts`/`index.tsx`/`api/`/`shared/`
edits. **Execution deferred** until the studio build lands (so the final sweep
also confirms the finished Model views). **Must-carry (C2-01):** add
`touch-action:none` + `overscroll-behavior-y:contain` to the three canvas
`.module.css` (JourneyGraph, JourneyCanvas, GraphCanvas) — §9's "already present"
claim is false; grep-gated in T-09.

## Project shape

`companygraph` is a single-tenant, self-hosted platform modelling a
retail organisation as an attributed Neo4j graph. Bun + TypeScript
monorepo with three workspaces (`api/`, `pwa/`, `shared/`), REST API at
`/api/v1/*`, React PWA on Vite. Single architectural vision: every
business process / role / system / location is a node, every
relationship is a typed edge, every catalog change is versioned +
audited + broadcast.

## Spec pipeline state

| Spec | Size | Phase | Tests | Notes |
|------|------|-------|------:|-------|
| **graph-core** | large | ✅ **execution:complete + amendment T-31** | 58 unit + 16 integration packs | Foundation: 6 node labels, 6 edge types, EDGE_ENDPOINTS matrix, REST CRUD + import + cypher passthrough + 7 typed query helpers + OpenAPI doc. T-31 amendment: `/api/v1/query/search` + 6 per-label fulltext indexes (for `process-explorer-ui/FR-17`). |
| **ontology-manager** | large | ✅ **execution:complete** | **169 tests / 168 pass / 1 skip / 0 fail / 665 assertions** | Runtime-mutable registry: schema CRUD, JSON-Schema attribute enforcement, edge-endpoint matrix runtime cache, 18 REST routes, SSE event stream, daily audit-retention cron, migrations (5 discriminated-union variants). |
| **process-explorer-ui** | large | requirements ✅ rev 3 approved · design draft rev 1 (linter says rev 3 elsewhere) | — | 28 FRs, 31 ACs, 12+ Native Conflicts rows, full PWA gesture/keyboard/touch surface, 2 personas (Ravi + Priya), interactive canvas + SME write paths. Design locked: `react-flow` 11.x canvas, `zustand` state, hand-rolled SW, `playwright` for gesture tests. |
| **chat-interface** | large (was medium in rev 2; promoted in rev 3) | rev 3 requirements:in-review | — | Rev 3 redesign: agentic NL→tools→narrate. Tool registry (15 tools), behavioural roles (14 journey + 5 cross-section + 1 default = 20), ReAct loop (cap 5 calls/turn), structured `highlight: {nodes, edges, paths, style}` payload for canvas. Counter reset on rev 3. Anthropic SDK + better-sqlite3 deps installed. |
| **cto-analytics** | medium | requirements approved | — | 11 FRs, 16 ACs. System map + complexity scoring + AI candidates + PDF exec summary. Hash-deterministic PDF (8-rule NFR-05 protocol). |

## Cumulative test count

- **graph-core**: 58 unit assertions pass; 17 integration test files in place (need Neo4j running to exercise)
- **ontology-manager**: 169 tests pass, 665 assertions
- **Total tests in CI**: ~227 once both specs' suites are unified under `bun test:integration`

## What's actually built (file inventory)

### graph-core (51 production files + 18 test files)

```
api/src/
  env.ts, ids.ts, errors.ts, logging.ts, validate.ts, server.ts, router.ts
  neo4j/{driver, bootstrap, read-only-session}.ts
  storage/{nodes, edges}.ts
  routes/{_helpers, healthz, stats, nodes, edges, query, import, export,
          openapi, ontology-*.ts (18 ontology routes)}.ts

pwa/
  package.json, vite.config.ts, index.html, src/{main.tsx, App.tsx, api.ts}

shared/src/
  schema/{nodes, edges, ontology}.ts, types.ts, index.ts
  seed/retail-mini.json

scripts/
  runtime-detect.sh, wait-for-neo4j.sh

docker-compose.yml, .github/workflows/ci.yml,
.claude/CLAUDE.md (rewritten from inherited boilerplate)
```

### ontology-manager (~28 production files + 18 test files)

```
api/src/ontology/
  errors.ts, error-throwers.ts, events.ts
  meta-bootstrap.ts, seed.ts
  cache/{schema, edge-endpoints, attribute-zod}.ts
  storage/{audit, events, preconditions, alignments, node-labels,
           edge-types, migrations, rollback}.ts
  jobs/audit-retention.ts

api/src/routes/
  ontology-{schema, node-labels, edge-types, audit, versions,
            migrations, import, export, events}.ts
  (router.ts edits to mount all 18 routes)

api/src/storage/{nodes, edges}.ts (T-14 + T-15 refactors —
  registry-backed validator + FR-04 attribute enforcement)

api/src/neo4j/bootstrap.ts (T-09a refactor — iterates registry,
  delegates seed to api/src/ontology/seed.ts)

.env.example, .gitignore, docker-compose.yml (APOC enabled)
```

## Load-bearing implementation fixes discovered along the way

These are the non-obvious gotchas surfaced by writing real code against
Neo4j 5 + Bun + the spec contracts. Each is a small but load-bearing
correctness fix.

| # | Discovery | Location | Why it matters |
|---|-----------|----------|----------------|
| 1 | **Neo4j 5 forbids `DROP CONSTRAINT` / `DROP INDEX` inside `executeWrite` tx** | `node-labels.ts`, `edge-types.ts`, `rollback.ts` deletes | The rev-2 design's `deleteNodeLabel` Cypher mixed DDL with DML. Implementation moves the `DROP` to a separate auto-commit statement AFTER the DML tx commits. DDL-fail-after-DML-commit is benign (next bootstrap re-CREATEs the constraint as no-op). |
| 2 | **Undirected `()-[r]-()` traverses each relationship twice** | `preconditions.ts` step (i) for edge types | The `assertDeletePreconditions` edge-instance count was 2× inflated. Changed to directional `->()`. |
| 3 | **APOC plugin not enabled in compose** | `docker-compose.yml` | The FR-12 forceBackfill path uses `apoc.convert.fromJsonMap` + `apoc.map.setKey`. Added `NEO4J_PLUGINS: '["apoc"]'` + unrestricted procedures. Aligned with `graph-core/design.md` §8.3 which already specified the plugin. |
| 4 | **`bun --hot` does NOT reload router-table changes** | `router.ts` edits during dev | Adding new route mounts requires a manual `bun run dev` restart. Pure handler-body edits do propagate. |
| 5 | **OpenAPI generator's `let cached`** | `routes/openapi.ts` | Module-level cache survived hot reload. Removed it; doc regenerates per-request (ms-scale cost — acceptable). |
| 6 | **`exports` map missing `./schema/ontology`** | `shared/package.json` | Cold-start crash when api workspace tried to load the subpath without a warmed module cache. |
| 7 | **Neo4j `count(...)` return type** | All cache + storage + test code | Returns Neo4j Integer in some configs, plain number in others. `toN(v)` coercion helper became standard. |
| 8 | **SSE on `bun --hot`** | `server.ts` `idleTimeout` | Bun's default 10 s idle timeout closes SSE socket between 30 s heartbeats. Bumped to 255 s (max). |
| 9 | **Bun's `fetch` doesn't resolve until the FIRST chunk** | `routes/ontology-events.ts` | SSE handler enqueues a `: connected` comment immediately so `await fetch(sseUrl)` resolves and the caller can fire a triggering mutation. |
| 10 | **`bun.lockb` typecheck quirk** | `package.json` `typecheck` script | `bun build --outdir` errors `ENOENT: failed to write file ""` when given multiple entry points. Not blocking — individual transpile checks work. |

## Cross-spec contracts established

| Contract | Owner | Consumer(s) | State |
|----------|-------|-------------|-------|
| `GET /api/v1/schema` | ontology-manager FR-14 | process-explorer-ui, chat-interface, cto-analytics | ✅ shipped + live |
| `GET /api/v1/ontology/events` (SSE) | ontology-manager FR-17 | process-explorer-ui (FR-28 cache subscriber) | ✅ shipped + live |
| `GET /api/v1/query/search` | graph-core (amendment T-31) | process-explorer-ui (typeahead FR-17) | ✅ shipped |
| `/stats` keyset evolution (6 fixed → 6 + registry) | graph-core FR-11 evolved by ontology-manager FR-15 | process-explorer-ui (XC-1.2 stats panel) | ✅ shipped; handoff in PEU STATUS |
| Read-only Cypher gate (`executeRead`) | graph-core NFR-06 | chat-interface (NFR-04 every tool routes through it) | contract honoured |
| Attribute-schema enforcement (FR-04) | ontology-manager registry + graph-core's `storage/nodes.ts` | All node writes | ✅ shipped |
| `_review` / `_verification` attribute namespace | process-explorer-ui FR-18/FR-20 | ontology-manager (reserves `^_` prefix at register time) | ✅ contracted in shared zod schema |
| `attribute_violation` error code | graph-core ERROR_CODES + ontology-manager ERROR_CODE_THROWERS | every node-write client | ✅ shipped |

## Open carry-overs

### Per-spec items to address in remaining execution

**ontology-manager** (now complete, but with these carryovers documented):
- "26 tasks" → actual count is 27 (cosmetic editorial fix in tasks.md)
- T-18c lists 4 files (one over the 1-3 rule, but logically grouped — acceptable)

**graph-core**:
- C-08 (empty PATCH body): pinned to 200 + touch `updatedAt`
- C-09 (all-phase-1-failure status): pinned to 200 with `errors[]`
- C-10 (cross-type edge id collision): pinned to reject at create time
- All three are in code; tests verify

**process-explorer-ui** (design phase pending):
- Canvas-library locked react-flow; bundle budget verified ~202 KB gz
- Graph-core amendment T-31 already shipped per request
- Service worker degradation path on Safari needs final smoke
- 5 minor open-accepted items from req pass-2 carrying to design

**chat-interface** (rev 3 review pending):
- 15 open design questions in Risks (per-role prompts, agent-loop semantics, tool-budget exhaustion, etc.)
- Anthropic SDK + better-sqlite3 already installed (infra ready)
- Critical invariants preserved from rev 2: no writes, no HTML interpretation, refusal-not-confabulation

**cto-analytics** (design phase pending):
- 10 open design questions in Risks (critical-path algorithm, weight tunability vs reproducibility, scheduler tz, etc.)
- Hash protocol NFR-05 (8 binding rules) already pinned in requirements
- Mandatory soft dep on ontology-manager for `repetitive` / `data_richness` attribute schemas

### Suite-wide carry-overs

- **bun-test filter consistency**: agents prefixed `describe()` blocks inconsistently with `integration:`. Some integration tests get caught by the unit-only `bun test` filter. Cleanup: walk the integration files + normalise prefix.

## Recommended sequencing for resumption

Priority order (low risk first):

1. **chat-interface rev 3 requirements review** (~ 1 sub-agent pass + revisions if any).
2. **process-explorer-ui design pass-1 review** (~ 1 sub-agent pass + revisions).
3. **cto-analytics design phase** (~ author design.md myself; can borrow shape from ontology-manager design which uses the same conventions).
4. **chat-interface design phase** (~ once rev 3 requirements approved; the most architecturally novel piece — agentic ReAct loop + tool registry).
5. **process-explorer-ui tasks phase** + task review.
6. **chat-interface tasks phase** + task review.
7. **cto-analytics tasks phase** (medium spec — no task review per workflow).
8. **Parallel execution** of all three specs once their tasks lands. Each can fan out 4-6 sub-agents per phase.

Critical-path estimate to **all 5 specs at execution:complete**: another 2-3 working days of focused effort with parallel sub-agents, assuming no major rework on the chat-interface agentic redesign.

## Methodology notes — what worked

- **Parallel sub-agents per phase** scaled well. Each sub-agent gets a tightly-scoped brief with exact signatures, file paths, and integration-test expectations. Coordination via the design.md as the canonical contract.
- **Always-run validation** after each batch: `bun build --no-bundle` + `bun test` + spot integration. Catches contract drift before it compounds.
- **Pass-1 / pass-2 review cap** prevented diminishing-returns review cycles. Open-accepted carry-overs propagate forward instead of indefinitely revising.
- **Live verification** against a running Neo4j + API server caught real implementation bugs (the 10 fixes above) that pure-spec review would miss.

## Methodology notes — friction encountered

- **State pollution between integration tests** repeatedly tripped `ontology-bootstrap-reconcile.integration.test.ts`. Fixed by tightening its `beforeAll` cleanup.
- **`bun --hot` not picking up router-table changes** required manual restarts during route work — slowed feedback loops.
- **Parallel STATUS.md updates** by the user's tooling sometimes raced with my edits; managed by reading the latest state before each write.
- **Cross-session work overlap**: T-12, T-13, T-20 partially shipped by parallel sessions before my sub-agents got to them. Sub-agents handled this gracefully (read-before-write; preserve existing code where correct).

## Final state in numbers

- **2 specs** at execution:complete (graph-core, ontology-manager)
- **3 specs** in earlier phases (process-explorer-ui, chat-interface rev 3, cto-analytics)
- **~227 tests** passing across the two complete specs
- **~80 production source files** shipped
- **~36 test files** shipped
- **18 REST routes** live in ontology-manager + the full graph-core REST surface
- **1 SSE endpoint** live for browser subscribers
- **1 daily cron job** (audit retention)
- **2 cross-spec contracts** broadcasted via PEU STATUS handoff
- **10 load-bearing implementation fixes** documented above

🎯 Project is genuinely halfway to complete.
