---
feature: "funnel-pipeline-modeling"
reviewing: "tasks"
reviewing_revision: 2
reviewing_requirements_revision: 2
reviewing_design_revision: 1
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-06"
---

# Review: funnel-pipeline-modeling / tasks (pass 2/2)

## Verdict

**approve** — zero Blockers. Revision 2 closes the single pass-1 Blocker (B-01)
and all three Concerns (C-01/C-02/C-03) cleanly, and introduces no regression.
Every AC now has a closing task, the traceability tables are internally
consistent with the added T-14, the dependency graph is acyclic, every task
declares a concrete verification artifact, no task touches an owned-elsewhere
file beyond the two additive D-1 lines, and every design-basis pin (B-03, C-05,
C-06, D-1, C-01…C-04, N-01…N-03) remains locked to a task. Two minor Nits
remain, both optional. This is ready to execute.

## Prior findings — resolution status

| Pass-1 finding | Status | Where resolved |
|----------------|--------|----------------|
| ~~B-01~~ — AC-07/AC-08 had no closing task; `funnel-crud.integration.test.ts` dropped | **resolved** | New **T-14** creates `api/__tests__/funnel-crud.integration.test.ts` covering AC-07 (Funnel/Stage POST/GET/PATCH/DELETE round-trip via the generic `/api/v1/nodes/:label` path) and AC-08 (`HAS_STAGE` `Funnel→Stage` via `POST /api/v1/edges` + composition read). Traceability table (line 665), per-FR rollup (line 669), per-AC map (line 678–680), validation-checkpoints table (line 687), and the "every AC has a closing task" line (line 675) all corrected. `total_tasks: 14`. |
| ~~C-01~~ — final sweep omitted AC-07/AC-08's own `nodes.ts`/`edges.ts` diff guards | **resolved** | T-14 verification carries both `git diff --stat api/src/routes/nodes.ts → no change` (AC-07) and `... api/src/routes/edges.ts → no change` (AC-08) as their own guards (lines 574–575, 583–584, 592–595), not relying on T-13's aggregate sweep. |
| ~~C-02~~ — T-08's C-04 placeholder guard was a bare substring grep | **resolved** | T-08 step 1 (lines 329–342) now asserts the *shape*: the `business`-surface block plus a `funnels:` key returning a `BusinessTabPlaceholder` (`grep -nE "funnels:\s*\([^)]*\)\s*=>\s*<BusinessTabPlaceholder"` resolving inside the `business` surface), with "stop and flag" on mismatch. Mirrored in verification (lines 355–359). |
| ~~C-03~~ — branch-detection was implicit; T-09 test could pass on a pre-set flag | **resolved** | T-09's `funnel-board-analytics.test.tsx` branch case (lines 438–445) now feeds a composition payload with a fan-out stage (>1 outgoing `CONVERTS_TO`) and asserts the view *derives* the branch signal, so a detection bug (counting `HAS_STAGE`/incoming edges) fails the test. |
| ~~N-01~~ — `total_tasks: 13` → 14 | **resolved** | Frontmatter `total_tasks: 14`; all tables updated. |
| N-02, N-03 (nits) | acknowledged, no change (match approved design) | — |

## Findings

### Blockers

None.

### Concerns

None.

### Nits

- **N-01 — T-04's `Blocks: T-05` is redundant with the transitive T-06→T-05
  edge** (carried over from pass-1 N-02). T-04 (`Blocks: T-05, T-06`), T-06
  (`Blocked by: T-04` / `Blocks: T-05`), T-05 (`Blocked by: T-04, T-06`) produce
  the correct acyclic order T-04 → T-06 → T-05, but T-04 naming "Blocks: T-05"
  directly is redundant. Harmless; optional cleanup for clarity.

- **N-02 — `api/src/seed/funnel-analytics.ts` (T-07) is a pure PWA-mirrored
  arithmetic helper, not a seed routine, yet lives under `api/src/seed/`**
  (carried over from pass-1 N-03). Placement matches design §9, so no action is
  required; the directory name is only mildly misleading.

## Completeness / Traceability

Every AC now maps to a closing task; the two gaps from pass-1 (AC-07, AC-08) are
closed by T-14. Verified against the upstream design §8/§9 and the blueprint.

| AC | Design test file | Closing task | Status |
|----|------------------|--------------|--------|
| AC-01 | funnel-registry.integration | T-01, T-02 | ✓ 409-tolerance + `git diff nodes.ts` guard |
| AC-02 | funnel-registry.integration | T-02 | ✓ `stageOrder` required-integer rejection |
| AC-03 | funnel-edges.integration | T-01, T-03 | ✓ `HAS_STAGE` endpoint whitelist |
| AC-04 | funnel-edges.integration | T-01, T-03 | ✓ `CONVERTS_TO` endpoint whitelist |
| AC-05 | funnel-edges.integration | T-04, T-05 | ✓ round-trip through `attributes_json` |
| AC-06 | funnel-edges.integration | T-04, T-05, T-06 | ✓ range reject + gate + delegation |
| **AC-07** | **funnel-crud.integration** | **T-14** | **✓ resolved — CRUD round-trip + `nodes.ts` diff guard** |
| **AC-08** | **funnel-crud.integration** | **T-14** | **✓ resolved — `HAS_STAGE` generic-write + `edges.ts` diff guard** |
| AC-09 | funnel-read.integration | T-11 | ✓ composition read |
| AC-09a | funnel-read.integration | T-11 | ✓ id-keyed scope isolation |
| AC-10 | funnel-read.integration + PWA | T-11 (Cypher) + T-09 (client parse) | ✓ split per C-01 pin |
| AC-11 | funnel-analytics + funnel-board-analytics | T-07 (server) + T-09 (view) | ✓ incl. N-01 branch-detection case |
| AC-12 | funnel-board.test | T-09 | ✓ ready state |
| AC-13/14/15 | funnel-board-states.test | T-09 | ✓ loading/empty/error+retry |
| AC-16 | design-conformance | T-08 (css) + T-10 (tsx) | ✓ two-invocation form |
| AC-17 | manual | T-09 (impl) + T-13 (live) | ✓ pointer drag |
| AC-18 | manual | T-09 (impl) + T-13 (live) | ✓ keyboard move controls |
| AC-19 | manual + PWA | T-09 (impl) + T-13 (live) | ✓ landmark + Tab order |
| AC-20 | playwright reload | T-11 | ✓ reset-to-picker on reload |
| AC-21 | CLI + git diff | T-13 (widened D-1 allow-list) | ✓ boundary sweep |

**Dependency graph (acyclic, verified):** T-01 (root) → {T-02, T-03, T-04,
T-12, T-14}; T-04 → T-06 → T-05; T-07 → T-09; T-08 → T-09 → {T-10, T-11}; T-11
← {T-06, T-10}; T-13 ← {T-01…T-12, T-14}. No cycle. T-14 correctly slots between
T-01 and T-13 despite its numeric label being higher than T-13's — the
`Blocked by`/`Blocks` edges (not the numeric suffix) govern order, and T-13's
`Blocked by: T-01…T-12, T-14` makes it strictly last.

**Verification field:** every task declares a concrete test path or a
`manual: <repro with input mode + observable outcome>` — the spec-completion
hook requirement is satisfied throughout. No task modifies more than 3 files
(max is 2: T-06, T-12). Complexity ratings are realistic (T-09 correctly
`complex`; T-06/T-08/T-10/T-12/T-13 `simple`).

**Design-pin conformance (re-verified against the codebase this pass):**
- Rule B / B-03 `409 name_conflict` tolerance (T-01) — `node-labels`/`edge-types`
  strict-CREATE confirmed. ✓
- C-05 `required:["stageOrder"]` integer — `jsonSchemaDocSchema` accepts
  `required` (`shared/src/schema/ontology.ts:71`); attribute-zod compiles it. ✓
- D-1 two additive wirings (T-06) — verified sound: `sub = path.slice("/api/v1/".length)`
  keeps slashes (`api/src/router.ts:405`), so `sub === "funnels/transitions"`
  dispatches; RBAC splits on `/` and already maps multi-segment literals
  (`query/getDomain/:id`), so `P("POST","funnels/transitions","edge:write")`
  matches cleanly; the null-permission gate that lets an unmapped route through
  on any authenticated session is real (`api/src/router.ts:386–395`), so the
  mapping is a genuine security necessity, not scope creep. `createEdge` exported
  (`api/src/storage/edges.ts:127`); `uuidv7` exported (`shared/src/schema/nodes.ts:26`);
  `edge:write` present (`rbac-permissions.ts:57`); no `funnels.ts` yet (correctly
  new). ✓
- C-01 client-parse authority for AC-10 (T-08/T-09/T-10) — assertion placed in
  the PWA test where the filter runs. ✓
- OQ-3 buttons-not-arrow-keys, OQ-4 reset-to-picker, FR-11 linear-chain `n/a`
  degradation — pinned and locked. ✓

**Blueprint conformance:** route `#/business/funnels` → `FunnelBoard` taken
verbatim from the View Tree (owner `funnel-pipeline-modeling`); XD-05 respected
(only the one `funnels:` `VIEWS` line + import edited in `views/index.tsx`;
`route.ts`/`SURFACES` untouched); XD-02 respected (registry-only, zero
compile-time schema-array edits); UX-03 Platforms & Input Modes + Native
Conflicts landed in T-08 (CSS `touch-action`/`user-select`) + T-09 (pointer
events + `setPointerCapture`); UX-01 four view states in T-09; UX-02 tokens-only
+ design-conformance in T-08/T-10. No house-rule conflict (zod-only, en-US,
`bun run typecheck`, `/api/v1/`, auth via the central gate).

**Done well:** the design-basis pins table and open-concerns table remain an
exemplary hand-off; T-14 is carefully differentiated from its siblings (T-02
attribute *rejection*, T-03 endpoint *whitelist*, T-11 *ordered composition*,
T-14 the requirements-level CRUD round-trip + `HAS_STAGE` generic-write with its
own ownership guards). The AC-16 two-invocation design-conformance split and the
T-13 widened-allow-list boundary sweep are precise.

## Recommendation

Approve as-is. The two Nits (redundant T-04→T-05 edge; `funnel-analytics.ts`
placement under `api/src/seed/`) are optional and match the approved design;
neither warrants another revision cycle. Execution may proceed.
