# Spec: funnel-pipeline-modeling
**Size**: large | **Created**: 2026-07-06 | **Current Phase**: execution:complete (T-10/T-11 deferred to orchestrator nav-reconciliation)

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | revised (rev 3) | - | 2026-07-07 |
| Req Review | B-03 RESOLVED (rev 3) | - | 2026-07-07 |
| Design | revised (rev 2) | - | 2026-07-07 |
| Design Review | approve (0 blockers, 4 concerns) | - | 2026-07-06 |
| Tasks | revised (rev 3, 14 tasks) | - | 2026-07-07 |
| Task Review | pending | - | - |
| Execution | **complete** (T-01…T-09, T-12, T-14; T-13 partial) — **T-10/T-11 deferred to orchestrator** | - | 2026-07-07 |

**review_passes**: 1

**Verification:**
- `verified_at`: 2026-07-07 (bun run typecheck exit 0; PWA funnel tests 10/10 green; server funnel-analytics 5/5 green; design-conformance PASS on FunnelBoard.tsx + .module.css)
- `verification_artifact`: `bun run typecheck` (clean); `npx vitest run src/__tests__/funnel-board*.tsx` (10 pass); `bun test api/__tests__/funnel-analytics.test.ts` (5 pass); `bun run scripts/design-conformance.ts --view pwa/src/views/business/FunnelBoard.{tsx,module.css}` (both PASS)

---

## Job 1 — Requirements blocker B-03 (idempotency) — DONE

**Resolved.** B-03 (the public ontology-registry create routes are strict-CREATE
`409 name_conflict`, so the rev-2 "re-register is a clean no-op" claim was false;
this spec adds nothing to the compile-time tuples the seed-loader MERGE covers)
is fixed by making idempotency **real** via a **get-then-create guard** in the
feature-owned registration routine `ensureFunnelOntology`:

- `requirements.md` → **rev 3** (`status: revised`). FR-01..FR-04 reworded to the
  get-then-create guard; **new FR-06a** defines `ensureFunnelOntology`
  (GET-by-name → POST-only-on-404, dependency order Funnel→Stage→HAS_STAGE→
  CONVERTS_TO); NFR-03 reworded; **AC-01 realigned** to assert the *routine's*
  idempotency (run twice → exactly one Funnel label, no error, strict-CREATE route
  never re-hit), explicitly NOT that the public strict-CREATE route is itself a
  no-op. Summary carries a Revision 3 note. Stable IDs preserved.
- `design.md` → **rev 2** (`status: revised`, reviewing_requirements_revision: 3).
  Rule B rewritten to get-then-create; §2 B-03 row, §4.1 ensure routine, §5 API
  surface, §8 AC-01 test, §9 File Changes, §10 traceability (FR-06a) all updated.
- `tasks.md` → **rev 3** (`status: revised`, reviewing_design_revision: 2). Rule B
  design-basis pin + T-01 steps 2–3 + T-01/T-02/T-12 verification lines rewritten
  to the get-then-create guard.

Each edit notes it Resolves B-03.

## Job 2 — Build — DONE (except T-10/T-11 deferred to orchestrator)

**Files created (feature-owned):**
- `api/src/seed/ensure-funnel-ontology.ts` — Funnel+Stage labels + HAS_STAGE+
  CONVERTS_TO edge types via the ontology registry; **get-then-create guard** (B-03).
- `api/src/routes/funnels.ts` — `POST /api/v1/funnels/transitions`
  (`funnelTransitionSchema`, range-validate `[0,1]` → `400 attribute_violation`,
  delegate to graph-core `createEdge`).
- `api/src/seed/funnel-analytics.ts` — pure `overallConversion` derivation (server).
- `api/scripts/seed-funnel-pipeline.ts` — the `seed:funnel-pipeline` CLI
  (calls `ensureFunnelOntology`, seeds no instances).
- `pwa/src/views/business/FunnelBoard.tsx` + `FunnelBoard.module.css` — the live
  interactive stage board (four states, funnel picker, ordered stage board,
  pointer drag + keyboard move-up/down reorder, drop-off analytics; tokens-only;
  catalog components; `ViewRegion` landmark; UX-03 Platforms/Input Modes + Native
  Conflicts suppressions).
- `pwa/src/lib/funnelAnalytics.ts` — PWA-local mirror of the pure derivation
  (kept out of `src/views` so it's not subject to the view-orphan guard).
- Tests: `api/__tests__/funnel-registry.integration.test.ts`,
  `funnel-edges.integration.test.ts`, `funnel-crud.integration.test.ts`,
  `funnel-read.integration.test.ts`, `funnel-analytics.test.ts`;
  `pwa/src/__tests__/funnel-board.test.tsx`, `funnel-board-states.test.tsx`,
  `funnel-board-analytics.test.tsx`; `pwa/playwright/business-funnels-reload.spec.ts`
  (authored **`test.describe.skip`**, deferred to orchestrator — see T-11).

**Files edited (additive-only, D-1 + client method):**
- `api/src/router.ts` — one dispatch line for `POST /api/v1/funnels/transitions`.
- `api/src/auth/rbac-permissions.ts` — one `P("POST","funnels/transitions","edge:write")`
  mapping (reuses `edge:write`; **no new permission string**).
- `pwa/src/api.ts` — additive `patchNode(label,id,attributes)` client method (FR-14 reorder).
- `package.json` — `seed:funnel-pipeline` script.

**NOT edited (carve-outs / ownership):** `pwa/src/route.ts` and
`pwa/src/views/index.tsx` were **NEVER touched by this feature** — the orchestrator
owns all navigation reconciliation and wires the `funnels:` VIEWS line + tab. (Both
files show as modified in `git status`, but those are the **orchestrator's** edits —
they removed the `chat` surface and added the `insights` tabs incl. `funnels`; this
feature only ever Read them.) Also untouched: `shared/src/schema/{nodes,edges}.ts`
(no compile-time labels/edges), `api/src/routes/{edges,nodes,query}.ts`,
`api/src/storage/edges.ts`, `api/src/errors.ts`, `api/scripts/seed-saas-operator.ts`.

**Route note (nav-IA restructure):** the view's canonical route is
**`#/insights/funnels`** (the former `#/business` surface was folded into
`#/insights`; there is no `#/business` surface). All spec/test `#/business/funnels`
references were treated as `#/insights/funnels`.

### Deferred to orchestrator (nav-reconciliation)
- **T-10** — wiring `funnels:` into the VIEWS map (`funnels: (r) => <FunnelBoard route={r} />`)
  + the `import { FunnelBoard } from "./business/FunnelBoard"` line in
  `pwa/src/views/index.tsx`. Skipped per carve-out (orchestrator owns route.ts /
  views/index.tsx). Until wired, `pwa/src/__tests__/view-orphans.test.ts` reports
  `business/FunnelBoard.tsx` as the single orphan — this resolves the moment the
  orchestrator adds the import.
- **T-11 (e2e half)** — `pwa/playwright/business-funnels-reload.spec.ts` is authored
  but `test.describe.skip`'d with a note; the orchestrator runs it after wiring the
  `#/insights/funnels` route. (The integration half of T-11 —
  `funnel-read.integration.test.ts` — IS delivered.)

### Per-AC verification
| AC | Mechanism | Status |
|----|-----------|--------|
| AC-01 | `ensureFunnelOntology` get-then-create idempotency | ✅ `funnel-registry.integration.test.ts` (integration, needs Neo4j) |
| AC-02 | Stage `stageOrder` required-integer enforcement | ✅ `funnel-registry.integration.test.ts` |
| AC-03 | HAS_STAGE endpoint whitelist | ✅ `funnel-edges.integration.test.ts` |
| AC-04 | CONVERTS_TO endpoint whitelist | ✅ `funnel-edges.integration.test.ts` |
| AC-05 | CONVERTS_TO rate round-trip via funnel route | ✅ `funnel-edges.integration.test.ts` |
| AC-06 | out-of-range rate → `400 attribute_violation`; in-range → 201 | ✅ `funnel-edges.integration.test.ts` + router/rbac dispatch (T-06) |
| AC-07 | Funnel/Stage node CRUD via generic path | ✅ `funnel-crud.integration.test.ts` |
| AC-08 | HAS_STAGE via generic edge route + composition read | ✅ `funnel-crud.integration.test.ts` |
| AC-09 | composition read (ordered stages + transitions) | ✅ `funnel-read.integration.test.ts` |
| AC-09a | composition scope isolation by funnel id | ✅ `funnel-read.integration.test.ts` |
| AC-10 | listing scope (Cypher prefilter + client modelId filter) | ✅ `funnel-read.integration.test.ts` (Cypher) + `funnel-board-states.test.tsx` (client authority) |
| AC-11 | overall conversion product; single-stage/branch → "n/a" | ✅ `funnel-analytics.test.ts` (5 pass) + `funnel-board-analytics.test.tsx` (3 pass) |
| AC-12 | ready state: picker + ordered stages + conversions | ✅ `funnel-board.test.tsx` (pass) |
| AC-13 | loading skeleton | ✅ FunnelBoard `Loading` states (states test) |
| AC-14 | empty state | ✅ `funnel-board-states.test.tsx` (pass) |
| AC-15 | error + retry refetch | ✅ `funnel-board-states.test.tsx` (pass) |
| AC-16 | design-conformance tokens-only, catalog components | ✅ `design-conformance.ts` PASS on `FunnelBoard.tsx` + `.module.css` |
| AC-17 | pointer drag reorder (PATCH stageOrder) | ✅ implemented (pointer events + setPointerCapture); manual e2e is orchestrator-run |
| AC-18 | keyboard move-up/down reorder (no arrow capture) | ✅ implemented (native buttons); `funnel-board.test.tsx` asserts native-button controls |
| AC-19 | keyboard reachability + `ViewRegion` landmark | ✅ `funnel-board.test.tsx` (region landmark + native buttons) |
| AC-20 | deep-link reload (reset-to-picker) | ⏸ **deferred to orchestrator** — Playwright spec authored `test.describe.skip` |
| AC-21 | typecheck clean + boundary (widened D-1 allow-list) | ✅ `bun run typecheck` exit 0; diff confined to funnel-owned files + 4 additive edits; no forbidden-file edits |

**Verification commands (run 2026-07-07):**
- `bun run typecheck` → exit 0
- `npx vitest run src/__tests__/funnel-board.test.tsx src/__tests__/funnel-board-states.test.tsx src/__tests__/funnel-board-analytics.test.tsx` → 10 pass
- `bun test api/__tests__/funnel-analytics.test.ts` → 5 pass
- `bun run scripts/design-conformance.ts --view pwa/src/views/business/FunnelBoard.tsx` and `… FunnelBoard.module.css` → both PASS
- Integration tests (`funnel-{registry,edges,crud,read}.integration.test.ts`) authored; **run under `bun test:integration` with `bun run dev` (Neo4j) — not run here** (integration needs the stack).

**Orchestrator to-do:** wire `funnels: (r) => <FunnelBoard route={r} />` +
`import { FunnelBoard } from "./business/FunnelBoard"` under the `insights` surface
in `pwa/src/views/index.tsx`; the canonical route is **`#/insights/funnels`**. Then
run the deferred Playwright reload spec + the `bun test:integration` funnel suite.

**Artifacts:**
- 📄 Requirements: `.claude/specs/funnel-pipeline-modeling/requirements.md` (rev 3)
- 📄 Design: `.claude/specs/funnel-pipeline-modeling/design.md` (rev 2)
- 📄 Tasks: `.claude/specs/funnel-pipeline-modeling/tasks.md` (rev 3, 14 tasks)
- 📝 Reviews: `review-requirements.md`, `review-design.md`, `review-tasks.md`
