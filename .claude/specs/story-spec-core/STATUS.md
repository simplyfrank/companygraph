# Spec: story-spec-core
**Size**: large | **Created**: 2026-07-04 | **Current Phase**: **Execution complete** (T-01…T-18, all 18 tasks)

review_passes: 2
<!-- Per-phase review counter for the HARD CAP (1 review + max 1 re-review).
     Tasks phase consumed 2/2: pass 1 (revise, against rev 2) + pass 2
     (approve, against rev 3) — per review-tasks.md frontmatter ("2 of 2");
     the previous "1" here contradicted that file and is corrected. Tasks
     rev 4 (2026-07-05) lands only the pass-2 recorded findings
     (C-08/C-09/N-05/N-06/N-07 disposition + new T-18); NO further review
     passes are permitted for this phase. Design consumed its 2/2. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (rev 3) | - | 2026-07-04 |
| Req Review | revise→resolved over 2 passes (0 open blockers) | - | 2026-07-04 |
| Design | approved (rev 3) | - | 2026-07-04 |
| Design Review | pass 2/2: approve (0 blockers; C-05/C-06/C-07/N-04/N-05 delegated → landed in tasks rev 2/3) | - | 2026-07-04 |
| Tasks | approved (rev 4, 18 tasks — rev 4 finalizes the pass-2 findings and adds T-18; T-01…T-17 unchanged as executed) | - | 2026-07-05 |
| Task Review | pass 2/2: approve, 0 blockers (C-08/C-09 concerns + N-05/N-06/N-07 nits recorded → disposition in tasks rev 4: C-09/N-05/N-06 landed in execution, N-07 fixed in the artifact, C-08 → T-18) | - | 2026-07-04 |
| Execution | **complete** — T-01…T-17 landed 2026-07-04 (all validation checkpoints green); T-18 landed 2026-07-05 (C-08 — the three pwa story component test files appended to the per-file vitest gate in the ci.yml `unit` job, so AC-10…AC-14's artifacts now gate merge) | - | 2026-07-05 |

**Verification:**
- verified_at: 2026-07-05
- verification_artifact: api/__tests__/story-xd18-role-path.integration.test.ts (AC-19 — full-stack XD-18 path through the real router gate; see per-AC table below)

Gates run at completion (all green):
- `bun run typecheck` — exit 0 after every task and at the final sweep (AC-18).
- `bun run test` — api 330 pass / shared 65 pass, 0 fail (includes `shared/__tests__/story-spec.test.ts`, `api/__tests__/story-authz.test.ts`, `api/__tests__/story-derive-parity.test.ts`).
- `cd pwa && bun run test` — 322 pass / 0 fail (includes the three story component test files).
- `bun run test:integration` — all 8 story-spec integration files pass inside the full shared suite (see “Known-open sibling failures” for the two pre-existing non-story reds).
- `bunx playwright test playwright/story-catalog-context.spec.ts --project=macos-chrome` — 1 passed (AC-17).
- `bun run scripts/design-conformance.ts --view pwa/src/views/model/StoryCatalog.tsx` and `… --view pwa/src/views/model/StoryCatalog.module.css` — both exit 0, zero violations (AC-15, D-1).
- AC-18 sweep: `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` → empty (no `NODE_LABELS`/`EDGE_ENDPOINTS` additions).
- `bun run register:story` — standalone idempotent registration verified.

T-18 gates (run 2026-07-05, all green):
- `cd pwa && bunx vitest run src/__tests__/story-catalog.test.tsx src/__tests__/story-detail.test.tsx src/__tests__/story-catalog-states.test.tsx` — the exact CI invocation's story subset: 3 files, 13 tests, 0 fail.
- `grep story-catalog-states .github/workflows/ci.yml` — returns the wired per-file vitest line (unit job, `working-directory: pwa`); ci.yml parses as valid YAML.
- `bun run typecheck` — exit 0.
- `bun run test` — api 385 pass (2 skip) / shared 71 pass, 0 fail.
- `bun run scripts/design-conformance.ts --view pwa/src/views/model/StoryCatalog.tsx` and `… --view pwa/src/views/model/StoryCatalog.module.css` — re-run, both PASS with zero violations.

**Per-AC verification artifacts:**

| AC | Artifact |
|----|----------|
| AC-01 | api/__tests__/story-labels.integration.test.ts |
| AC-02 | api/__tests__/story-edges.integration.test.ts |
| AC-03 | api/__tests__/story-crud.integration.test.ts (incl. DD-11 detached lifecycle + PATCH re-point `sourceActivityId`) |
| AC-04 | api/__tests__/acceptance-criteria-crud.integration.test.ts (incl. detached-parent AC create/patch, N-05) |
| AC-05 | api/__tests__/story-cascade.integration.test.ts |
| AC-06 | api/__tests__/story-derive-parity.test.ts (unit, Neo4j-free; server ⇄ client narrative parity + B-02 tiebreak + C-03 orphan fallback) |
| AC-07 | api/__tests__/story-bootstrap.integration.test.ts |
| AC-08 | api/__tests__/story-model-scope.integration.test.ts (read- + write-side, rev 3 C-06) |
| AC-09 | api/__tests__/story-authz.test.ts (unit gate composition, D-7) + api/__tests__/story-openapi.integration.test.ts (routes + 5 codes) + T-17 step 6 (e2e 403/200) |
| AC-10 | pwa/src/__tests__/story-catalog.test.tsx |
| AC-11 | pwa/src/__tests__/story-detail.test.tsx |
| AC-12, AC-13, AC-14 | pwa/src/__tests__/story-catalog-states.test.tsx (sole owner, task-review N-04) |
| AC-15 | CLI: `bun run scripts/design-conformance.ts --view <file>` once per file (StoryCatalog.tsx + StoryCatalog.module.css), both exit 0 (D-1) |
| AC-16 | manual: keyboard-only walk of `#/model/stories` — Tab reaches "Generate from graph" (Enter activates), Tab into the list, Enter on a story row opens the detail Modal → focus enters the panel (catalog focus-trap), Tab moves through Edit story / Move up / Move down / Edit / Delete AC controls in DOM order, Escape closes and returns focus to the invoking row button |
| AC-17 | pwa/playwright/story-catalog-context.spec.ts |
| AC-18 | CLI: `bun run typecheck` exit 0 + `git diff shared/src/schema/{nodes,edges}.ts` empty |
| AC-19 | api/__tests__/story-xd18-role-path.integration.test.ts (in-process `route()` dispatch per D-6; real `business_architect` session; 401/403/200 through the real gate) |

**Execution deviations (additive to the D-1…D-7 register in tasks.md):**

1. **D-8 — shared unit-test path.** tasks.md T-01 names `shared/src/schema/__tests__/story-spec.test.ts`; the unit runner (`scripts/test-unit.sh`) discovers shared-workspace tests only under `shared/__tests__/`, so the file lives at `shared/__tests__/story-spec.test.ts` (otherwise it would never run under `bun run test`).
2. **D-9 — `shared/package.json` export entry.** Added `"./schema/story-spec": "./src/schema/story-spec.ts"` to the export map — the design-mandated `@companygraph/shared/schema/story-spec` import specifier does not resolve without it (same pattern as `./schema/model-workspace`). Not in the design §7 file table; pure enabler, no behavior.
3. **D-10 — AC reorder button labels.** The catalog `Button` forwards no `aria-label`, so the up/down reorder controls use visible text ("Move up"/"Move down") as their accessible names. Still `PATCH {ordinal}`, keyboard-reachable, no drag handler (Native Conflicts unchanged).
4. **D-11 — integration-suite self-heal helper.** New `api/__tests__/helpers/story-fixtures.ts` (`ensureStorySchema()`), called from every story integration file's `beforeAll`: sibling ontology tests in the shared suite legitimately wipe the `_Ontology*` registry and re-seed only the const tuples (ontology-seed `afterAll`, ontology-bootstrap-reconcile), which drops the runtime-registered story rows and (unlike model-workspace's bespoke-Cypher edges) breaks the registry-validated `createEdge` path this spec rides (DD-10). The helper re-registers model+story schema and forces the server's schema/edge-endpoint caches to refresh via the API (event-emitting) path.
5. **D-12 — model-placeholder test row retired.** `pwa/src/__tests__/model-placeholder.test.tsx` (model-workspace-core's) asserted the `stories` tab still renders `ModelTabPlaceholder` — a transitional assertion the sanctioned T-14 dispatch swap obsoletes. The `stories` row was removed with a dated comment; the live behavior is owned by `story-catalog.test.tsx`.
6. **D-13 — T-17 dynamic router import.** The B-01 "set `ONELOGIN_ISSUER` before importing the router" pin is honored with a top-level `await import("../src/router")` after the env assignment (a static import would hoist above it). `afterAll` deletes the env var so sibling files are unaffected.

**Known-open sibling failures (pre-existing, NOT this spec's — left for their owners):**
- `api/__tests__/ontology-bootstrap-reconcile.integration.test.ts` (3 tests): expects the registry to hold exactly `NODE_LABELS.length` (18) rows after `applySchema`, but `applySchema` has registered runtime labels since model-workspace-core's step 3b (+4; this spec's step 3c adds +2 → 24). Red before this spec (18 ≠ 22); the expectation is stale, owner: ontology-manager/model-workspace backfill.
- `api/__tests__/ontology-routes.integration.test.ts` export→import round-trip: `POST /api/v1/ontology/import` rejects the server's own export with 85 × "Expected string, received null" on glossary/bounded-context entities carrying `note: null`. Unrelated to the story surface (verified by manual probe of the export payload).
- `api/__tests__/ontology-cache.integration.test.ts`: load-time `SyntaxError: Export named 'parseRegistryLabel' not found in module …/ontology/cache/schema.ts` — the helper moved to `routes/_helpers.ts` in another spec's uncommitted refactor; the test file's import is stale (surfaces as the suite's "1 error").
- Postgres-backed kpi/sla tests fail whenever the Postgres container is down (environment, not code).

**Artifacts:**
- 📄 Requirements: `.claude/specs/story-spec-core/requirements.md` (rev 3, approved)
- 📄 Design: `.claude/specs/story-spec-core/design.md` (rev 3, approved)
- 📄 Tasks: `.claude/specs/story-spec-core/tasks.md` (rev 4, approved — 18 tasks; all executed)
- 📝 Reviews: `review-requirements.md`, `review-design.md`, `review-tasks.md`

**Changelog:**
- 2026-07-05: as-built traceability backfill — no phase status changed, no FR/AC/DD/T IDs renumbered. Made `scripts/spec/spec-traceability.sh` print OK (was 7 gaps): (a) the two cross-spec `model-workspace-core` dependency references FR-17 (stories placeholder slot) and FR-18 (`scopedNodeIds`) now cite their real as-built consumers — FR-18 in design §1.1 + tasks T-05/T-07/T-10, FR-17 in design §1.1 + tasks T-14 (the `renderView` placeholder→`StoryCatalog` swap, `pwa/src/views/index.tsx:174`); both added to the tasks traceability summary as _consumed_ rows; (b) inlined a real test path onto the wrapped Verification lines of T-08 (`api/__tests__/story-crud.integration.test.ts`), T-09 (same + `story-authz.test.ts`), T-13 (`pwa/src/__tests__/story-catalog.test.tsx`), and T-18 (`pwa/src/__tests__/story-catalog-states.test.tsx`) so the mechanical check sees each. All cited artifacts verified present on disk; nothing invented, nothing deferred.

**Next**: nothing — all 18 tasks executed and verified; spec is done.
No further review passes (cap 2/2 consumed).

**Shipped surface (18 of 18 tasks):** `shared/src/schema/story-spec.ts`; `api/src/scripts/register-story-labels.ts` (+ bootstrap step 3c, `register:story` script); 5 additive `ERROR_CODES` (+ stale header comment fix, N-03); `api/src/derive/story-derive.ts`; `api/src/storage/stories.ts` (story/AC CRUD, two-shape DD-11 gate, single-tx cascade, bootstrap); `api/src/routes/stories.ts` (10 handlers + zod→code mappings); router dispatch block; 10 `ROUTE_PERMISSIONS` rows + `business_architect` `story:read`/`story:write` grant; OpenAPI registration; `pwa/src/api.ts` stories client; `StoryCatalog` view (4 states, detail/edit, derived/detached badges, DD-09 fork-first hint) wired at `#/model/stories`; ci.yml per-file vitest gate extended with the three story component test files (T-18, C-08).
