---
feature: "business-model-authoring"
artifact: "tasks.md (revision 1)"
reviewer: "spec-review-agent (fresh reviewer; did not author)"
verdict: "approve"
reviewed_at: "2026-07-04"
review_pass: "1 of at most 2"
upstream_checked:
  - "requirements.md rev 2 (approved)"
  - "design.md rev 1 (design-review pass 1 = approve)"
  - "blueprint.md (View Tree, UX-*, XD-*)"
  - ".claude/CLAUDE.md (house rules — adopted 2026-07-04)"
  - "on-disk: model-workspace-core (merged), story-spec-core (tasks:draft), graph-core import/storage"
---

# Review: business-model-authoring / tasks.md (pass 1)

## Verdict: approve (0 blockers, 3 concerns, 3 nits)

This is a strong, unusually well-traced tasks artifact. All 20 ACs are cited by
at least one task, every FR maps to tasks, every task carries a concrete
verification artifact (test path or `manual:`/CLI repro with input mode +
observable outcome), no task touches more than 3 files, the dependency order is
acyclic and correctly sequenced, and the design-review carry-forwards
(C-01/C-02/N-01/N-02/N-03) plus the two requirements Deviations are landed as
binding, execution-ready decisions rather than left to re-derivation. The hard
build-order precondition (both `model-workspace-core` and `story-spec-core` must
merge first) is stated up front and each dependency signature is enumerated.

I verified the load-bearing on-disk claims and they hold: `realImport` is
private at `api/src/routes/import.ts:157` (T-02's "add `export`, sole edit" is
correct); `JourneyData` is column-index-based exactly as C-01/T-15 describe
(`ActivityNode{id,name,column}`, `RoleNode{columns,durations}`,
`SystemNode{usages:[{column}]}`, `PrecedesEdge{from_col,to_col}`, `LayoutMode`
includes `"multi"`); the four reused `ERROR_CODES` are all present in
`api/src/errors.ts`; mwc's `POST …/module-instances` requires a `targetDomainId`
validated `IN_MODEL` (`api/src/storage/modules.ts:520`); story-spec-core's
`…/stories/bootstrap` takes `{activityIds?}` → `{created,skipped}` mapped to
`story:write`; `_shared.tsx` exports `Loading({what})` + `ErrorState({message})`
(no built-in retry, so T-14's "add a local retry Button" is right);
`design-conformance.ts` honours `--view`; `tokens.css` lives at
`pwa/src/styles/companygraph/tokens.css`; `api.ts` exposes `json<T>` + the `api`
object. No blocker-class conflict with the house rules or the blueprint was
found.

The one real issue (C-01 below) is a **mischaracterization of the router
integration point** that a competent agent can still land, so it is a concern,
not a blocker — but it should be corrected so the execution agent does not try
to edit an mwc-owned file.

---

## Concerns

### C-01 — T-11 mis-states where/how the two authoring routes are dispatched
T-11 (and design §5.1) instruct: add "**two `sub.match(/…/)` arms** … **inside
the existing mwc `models*` dispatch block** (`router.ts`, `sub.startsWith("models/")`)
… the same multi-spec pattern story-spec-core uses in the same block." Verified
against disk this is inaccurate on two counts:

1. mwc has already merged, and its `models*` block in `api/src/router.ts` is a
   **2-line delegation** — `if (sub === "models" || sub.startsWith("models/")) {
   const res = await registerModelRoutes(method, sub, req); if (res) return res; }`.
   The actual `sub.match` arms live in `api/src/routes/models.ts`
   (`registerModelRoutes`), an **mwc-owned file this spec explicitly does not
   own**. There is no "inside the block" in `router.ts` to add arms to without
   either editing `registerModelRoutes` (out of scope) or adding a new sibling
   block/delegate in `router.ts`.
2. story-spec-core does **not** add arms inside mwc's block. Its own tasks (T-09)
   add a **separate sibling `models/:modelId/stories*` block of `sub.match`
   regexes in `router.ts`**. So the "same pattern story-spec-core uses" is a
   sibling block in `router.ts`, not an edit to mwc's delegate.

**Recommendation:** reword T-11 to "add a **separate `models/:modelId/authoring/*`
dispatch block** in `router.ts` (a sibling to mwc's `registerModelRoutes`
delegation and story-spec-core's `stories*` block), matching
`^models\/([^/]+)\/authoring\/apply$` (POST) and
`^models\/([^/]+)\/authoring\/graph$` (GET); place it near the other
`models/:modelId/*` sibling blocks — it must **not** edit
`api/src/routes/models.ts`." Keep `api/src/router.ts` as the single File (already
listed). This is landable within the current review budget as a wording fix.

### C-02 — T-11's "ordered before the generic `models/:id` arms" rationale rests on a non-existent collision
T-11 says the arms must be ordered "**before** the generic `models/:id` arms so
the literal `authoring/apply` / `authoring/graph` segments never collide with a
`:id`." On disk mwc's parameterized match is `^models\/([^/]+)$` (two segments);
`models/:id/authoring/apply` is four segments and cannot match it, so there is no
collision to order around. The instruction is harmless but misleading and, worse,
is coupled to the C-01 misunderstanding (it presumes arms live inside mwc's
block). **Recommendation:** drop the ordering rationale, or restate it precisely:
the authoring sibling block must run before mwc's `registerModelRoutes`
delegation only if `registerModelRoutes` could return a non-null for a 4-segment
`authoring/*` path — which it cannot (its arms are all shorter or differently
shaped). Simplest fix: place the authoring block anywhere among the
`models/:modelId/*` siblings and note "no ordering constraint vs. mwc's block —
the path shapes are disjoint."

### C-03 — AC-09 has no owning task; its verification path lives only in the cross-cutting section
AC-09 (clone uses only mwc module routes; the `409 model_lifecycle_route_required`
guard is asserted intact) is not closed by any numbered task. It appears only in
the "Cross-cutting verification (whole-spec)" section, which names
`api/__tests__/authoring-template-clone.integration.test.ts` but then says "Covered
by the clone assertions in T-08's route-facing integration setup; if a standalone
file is cleaner … the execution agent may split it out." T-08 is a **PWA
component task** whose verification files are `model-canvas-template.test.tsx` +
`model-canvas-steps.test.tsx` (mocked mwc routes) — it does **not** produce the
`authoring-template-clone.integration.test.ts` real-Neo4j file AC-09/design §8
call for, and mocked routes cannot assert the mwc lifecycle guard is "intact."
The traceability table also omits AC-09 entirely (FR-08 row lists only AC-03,
AC-09 in the AC column but no task column entry produces the integration file).
**Recommendation:** give AC-09 a real home — either a dedicated integration task
(`authoring-template-clone.integration.test.ts`, real Neo4j, blocked-by T-08 or
the mwc clone route) or explicitly fold the file into T-10/T-16's integration
setup with the guard assertion named there. As written the "may split it out at
execution time" language leaves an AC without a deterministic closing artifact,
which is exactly what the tasks-review checklist forbids.

---

## Nits

### N-01 — T-14 declares 3 new files but its Files line omits `ModelCanvas` view-registration edit to `pwa/src/views/index.tsx`
T-14's Steps open with "**View registration** — in `pwa/src/views/index.tsx`,
**replace** the `model` surface's `canvas` tab dispatch," but the Files line lists
only the three new files (`ModelCanvas.tsx`, `ModelCanvas.module.css`,
`wizard.module.css`) — `pwa/src/views/index.tsx (modify)` is missing from the
count. Design §7 correctly lists it as a separate File Changes row. This pushes
T-14 to 4 files, which trips the "≤3 files" guideline. **Recommendation:** either
add `pwa/src/views/index.tsx` to T-14's Files (accepting 4 — a one-line dispatch
swap is trivial and the guideline is a soft cap) or split the `index.tsx` swap
into a tiny dedicated task blocked-by T-14. Listing it explicitly matters so the
execution/coverage tooling attributes the edit.

### N-02 — AC-10's requirements id is preserved correctly, but the traceability table still lists AC-10 twice-covered without noting the two-file split
The author correctly reverts the design's AC-10a/AC-10b back to the approved
single `AC-10` (verified: requirements rev 2 uses one `AC-10`, and
`spec-traceability.sh` greps `AC-[0-9]+`, so `AC-10` is what the tool needs).
Good. The FR-13 and FR-14 traceability rows both point at AC-10 across T-12 +
T-13, which is right, but a reader scanning the table cannot tell AC-10 is
intentionally closed by two files. **Recommendation:** add a one-line note in the
traceability summary ("AC-10 closed by T-12 authz + T-13 openapi — one AC, two
artifacts, allowed") to preempt a false "duplicate coverage" flag.

### N-03 — T-09's ActivitiesRolesStep global-Role query cites "a `GET /api/v1/nodes`-style read" without pinning the exact read
T-09 and design §4.5 say the role picker "queries the **global** `Role` catalog
(a `GET /api/v1/nodes`-style read)." The on-disk router has `nodes/:label` GET
handlers (`handleNodeGet` takes a single id, not a label-list catalog read). It's
unclear which existing read enumerates all `Role` nodes for the `Typeahead`.
**Recommendation:** pin the concrete read the execution agent should call (an
existing graph-core `query/*` list read, or note that the catalog read is
whatever `Typeahead` already uses for global nodes elsewhere in the PWA) so T-09
doesn't stall on an unspecified interface. Low severity because it's a UI read
and can be resolved at execution, but naming it removes a judgment call.

---

## Completeness / Traceability

Every AC is cited by ≥1 task; every task carries a verification artifact. Gaps
flagged inline (AC-09 owner — C-03).

| AC | Closing task(s) | Verification artifact | Notes |
|----|-----------------|-----------------------|-------|
| AC-01 | T-14 | `model-canvas.test.tsx` | ✓ route→ModelCanvas, useActiveModel, no-model prompt |
| AC-02 | T-08 | `model-canvas-template.test.tsx` | ✓ exactly two templates, Blank→Step2 |
| AC-03 | T-08 | `model-canvas-template.test.tsx` (mocked) | ✓ clone count-agnostic, disabled-when-none |
| AC-04 | T-04 (server) + T-08 (component) | `authoring-apply.integration.test.ts` + `model-canvas-steps.test.tsx` | ✓ domain via mwc route, advance gate |
| AC-05 | T-04, T-08 | `authoring-apply.integration.test.ts` | ✓ PART_OF + wrong-pair mismatch |
| AC-06 | T-10 | `authoring-key-activity-per-role.integration.test.ts` | ✓ real Neo4j, EXECUTES via scoped Activity (Risk 5 honoured) |
| AC-07 | T-09 | `model-canvas-stories-step.test.tsx` (mocked) | ✓ idempotent `{created:0,skipped:N}` render |
| AC-08 | T-04 | `authoring-apply.integration.test.ts` | ✓ collect-and-continue 200, UUIDv7 echo, idempotent re-submit |
| **AC-09** | **none (cross-cutting only)** | `authoring-template-clone.integration.test.ts` (unowned) | **gap — C-03** |
| AC-10 | T-12 (authz) + T-13 (openapi) | `authoring-authz.test.ts` + `authoring-openapi.integration.test.ts` | ✓ single AC-10 id preserved; three-family 403s incl. story:write widening |
| AC-11 | T-15 | `toJourneyData.test.ts` + `model-canvas.test.tsx` | ✓ C-01 mapper with own DoD (type-checks vs real JourneyData) |
| AC-12/13/14 | T-14 | `model-canvas-states.test.tsx` | ✓ loading/empty/error states; retry preserves draft |
| AC-15 (should) | — (deferred, NFR-06) | manual (gated out) | ✓ correctly excluded from must set |
| AC-16 | T-14 (+T-08/T-09/T-15 per-file) | CLI `design-conformance --view` per file | ✓ enforced `--view` form |
| AC-17 | T-14 | manual keyboard repro | ✓ input mode + observable outcome |
| AC-18 | T-16 (server) + T-17 (component) | `authoring-model-scope.integration.test.ts` + playwright | ✓ Role excluded from isolation (B-01) |
| AC-19 | T-17 | `model-canvas-context.spec.ts` | ✓ deep-link + reload + active-model |
| AC-20 | cross-cutting (verify after T-04/T-14) | typecheck + `git diff` NODE_LABELS/EDGE_ENDPOINTS + grep | ✓ acceptable as final-sweep guard |

**Dependency order:** verified acyclic. T-01/T-02/T-03 are roots; T-04 fans out
correctly (blocked-by T-01,T-02); T-05 blocked-by T-04; PWA chain T-06→T-07→
T-08→T-09→T-14→T-15→T-17 is consistent with `Blocked by`/`Blocks`; integration
tests (T-10, T-16) correctly blocked-by T-04,T-05. No cycle.

**House-rule / blueprint conformance:** ✓ zod-only (T-01), no `tsc` (typecheck
checkpoints), en-US identifiers, loopback binding untouched, all routes under
`/api/v1/`, auth via the central gate + `rbac-permissions.ts` never per-route
(T-04 step 1, T-12), no new node label/edge type (T-04, AC-20), route + view
names taken verbatim from the View Tree (`#/model/canvas` → `ModelCanvas`), all
four view states specced (T-14), tokens-only + catalog-first + design-conformance
(T-08/09/14/15). No conflict with the adopted multi-datastore / OAuth-RBAC
baseline.

**Done well:** the C-01 id→column mapper isolated into its own task (T-15) with a
type-check-against-real-interface DoD; the C-04 idempotency echo threaded through
schema (T-01) → handler (T-04) → reducer (T-07) → step components (T-08); the
AC-10a/b→AC-10 reversion protecting the traceability tool; the three-permission-
family authz test (T-12) closing the story:write gap the design widened; and the
explicit real-Neo4j mandate for AC-06/AC-18 (not mocks).

## Verdict rationale
Zero blockers. Three concerns (C-01 router integration-point mischaracterization,
C-02 a non-existent-collision ordering rationale, C-03 AC-09 lacks a deterministic
owning task) and three nits. C-01 and C-03 are the two worth fixing before
execution — both are wording/attribution corrections that land comfortably inside
the remaining review budget and do not change the architecture. **approve** with
these concerns recorded for the execution agent.
