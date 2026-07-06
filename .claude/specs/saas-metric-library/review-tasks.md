---
feature: "saas-metric-library"
reviewing: "tasks"
artifact: "tasks.md (revision 1)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "1 of 2"
upstream:
  requirements_revision: 2
  design_revision: 1 (approved, review-design.md pass 1 = approve)
---

# Review: saas-metric-library — tasks.md (rev 1)

## Summary

A strong, traceable task breakdown. Fourteen tasks decompose the approved design
faithfully: every design element (§3.1–§3.4, §4, §5.1–§5.6, §6.1–§6.7, §7–§11)
lands in at least one task; every AC-01…AC-18 has a closing task; every task
carries a concrete `Verification` artifact (test path or `manual:` repro with
input mode + observable outcome), so the spec-completion hook will accept
STATUS.md. Dependency ordering is a valid DAG (no cycles), no task edits more
than 3 files, and the ownership-guard section reproduces the design §9
"NOT edited" list verbatim.

I verified the load-bearing interfaces against the tree and they are real:

- `POST /api/v1/ontology/node-labels` / `edge-types` create routes exist
  (`api/src/router.ts:543,545`), returning `409 name_conflict` on duplicate
  (`api/src/ontology/storage/{node-labels,edge-types}.ts`) — the idempotency
  pattern T-02/T-03 rely on.
- `LIFECYCLE_EDGES` contains `INSTANTIATES`/`IN_MODEL` and **not** `MEASURES`;
  `LIFECYCLE_LABELS` does **not** contain `KPI` or `MetricDefinition`
  (`api/src/storage/model-lifecycle-guard.ts:18-28`). `grep -rn MEASURES
  shared/src api/src` returns nothing — the name is free, as §2.1 claimed.
- The generic edge/node routes, `POST /api/v1/import` (`data:write`, mapped
  line 45), and `POST /api/v1/query/cypher` (`query:read`) all exist and are
  RBAC-mapped; import's payload-atomic lifecycle pre-scan is exactly at
  `import.ts:174-185` (T-07's `167-185` citation is accurate).
- `pwa/src/views/_shared.tsx` exports `ViewRegion({label})`,
  `Loading({what})`, `EmptyState({what})`, `ErrorState({message,onRetry})`,
  `ViewHeader` — matching T-09's usage exactly. `api.cypher` exists
  (`pwa/src/api.ts:159`). `FunctionMap.tsx:23` is the real import precedent T-09
  copies. `scripts/design-conformance.ts` accepts `--view` (line 125).
- `BusinessTabPlaceholder` already exists
  (`pwa/src/views/business/BusinessTabPlaceholder.tsx`), so T-11's
  placeholder-replacement seam is real.

No blockers. Three concerns and two nits below — all landable inside the
remaining review budget (pass 2).

## Findings

### Blockers

None.

### Concerns

**C-01 — tasks unilaterally narrow an approved AC-17 (KPI-Enter clause).**
The tasks' "Open design concerns" table (C-01 row) and T-09/T-12 **drop** the
"any linked KPI activates on Enter" clause from AC-17, re-scoping it to
landmark → filter → metric rows only. But that clause is still present in **both
approved upstream artifacts**: requirements rev-2 AC-17 ("…and any linked KPI
activates on Enter") **and** design rev-1 §8 AC-17 test row ("any linked KPI
activates on Enter"). A tasks doc cannot amend an approved AC by fiat in its own
review-response table — the argument (seed carries zero `MEASURES` edges, so
there is no KPI to list) is sound, but the correction belongs upstream.
*Recommendation:* either (a) land a one-line design erratum (mirroring the
XD-06-erratum pattern) that re-scopes AC-17 to drop the KPI-Enter clause for
v1, and cite it in T-09/T-12; or (b) keep the clause and have T-12's manual
sweep assert "no linked-KPI affordance exists in v1 (vacuously satisfied)".
Today T-12's own `Verification` line still reads "…any linked KPI activates on
Enter" was removed — but the design §8 row it traces to still asserts it, so a
pass-2 reviewer comparing task→design will flag the mismatch. Pin one story.

**C-02 — T-09 `Blocked by: T-10` inverts the natural authoring order and is
not enforceable at its checkpoint.** T-09 (the `.tsx`) is `Blocked by: T-10`
(the `.module.css`), and T-10 is `Blocked by: —`, `Blocks: T-09`. Authoring CSS
before the component that consumes it is defensible, but T-10's only
`Verification` is `design-conformance.ts --view …MetricLibrary.module.css`,
which (per the script's design) inspects a CSS module in isolation for
token/raw-color violations — it cannot prove the classes the `.tsx` will
reference exist. Net effect: the ordering buys little and risks a stranded
checkpoint (a green T-10 whose class names don't match the not-yet-written
T-09). *Recommendation:* either invert to `T-09 Blocks T-10` (author the
component, then its styles, then run conformance on both at T-11 as already
planned), or keep the order but note in T-10 that class-name alignment is
verified at T-09/T-11, not T-10. Low blast radius; pick one and state it.

**C-03 — AC-04 has two closing tasks with an ordering gap on the KPI fixture.**
AC-04 is listed as closed by T-13 (traceability table) but AC-04's substance
(the `MEASURES` write succeeds; lifecycle `INSTANTIATES`/`IN_MODEL` still
rejected) is split: T-03 authors `metric-library-edge.integration.test.ts` for
the **registration** half (AC-03), and T-13 **extends the same file** for the
**write-path** half (AC-04). Both T-03's cardinality test and T-13's write test
"require a `KPI` node fixture + a seeded `MetricDefinition`," but neither task
declares **where that fixture comes from** — no task authors a shared KPI/metric
integration fixture helper, and T-13 is `Blocked by: T-03` only (not by T-05,
which seeds metrics). A `MEASURES` edge needs a real `MetricDefinition` node as
`toId`; if T-13 runs without T-05 having seeded (or the test self-creating) a
metric, the endpoint won't resolve. *Recommendation:* make each edge/cardinality
test self-provision its endpoints (create a KPI via `POST /api/v1/nodes/KPI` and
a MetricDefinition via `POST /api/v1/nodes/MetricDefinition` in test setup after
`ensureMetricDefinitionLabel`), and state that in the T-03/T-13 steps so the
implementer doesn't assume an external fixture. Alternatively add
`T-13 Blocked by: T-02` (the label ensure) explicitly — it currently depends
only on T-03, which transitively covers it, but the metric-node provisioning is
unstated.

### Nits

**N-01 — T-04 extends `metric-catalog.ts` (a T-01 file) but is not `Blocked by`
T-06/T-05 and creates a soft two-writer situation.** T-01 and T-04 both write
`api/src/seed/metric-catalog.ts` (T-04 "extend from T-01"). This is fine
sequentially (T-04 `Blocked by: T-01`), but the File Changes design table lists
`metric-catalog.ts` once as "new (FR-04)"; the tasks split its authoring across
T-01 (data + zod shape) and T-04 (the `METRIC_CATALOG_LIST_QUERY` constant).
Harmless, but a reader reconciling design §10 (one file) against two tasks may
pause. Consider a one-line note in T-04 that it only appends the query constant.

**N-02 — T-12 verification text still contains the dropped KPI-Enter clause
indirectly.** T-12's `Verification` says "Tab through the view — expect focus
lands on the `ViewRegion` landmark then the filter then each metric row in DOM
order (AC-17)", which correctly omits KPI-Enter — but the design §8 AC-17 row it
implements still says "any linked KPI activates on Enter." This is the same root
as C-01; once C-01 is pinned upstream, this nit resolves. No independent action.

## Completeness / Traceability

### AC → closing task (all 18 covered)

| AC | Closing task(s) | Assessment |
|----|-----------------|------------|
| AC-01 | T-02 | ✅ registration + `git diff nodes.ts` boundary |
| AC-02 | T-08 | ✅ CRUD create/read |
| AC-03 | T-03 | ✅ edge registration + `git diff edges.ts` boundary |
| AC-04 | T-13 (write half), T-03 (setup) | ⚠ C-03 — KPI/metric fixture provisioning unstated |
| AC-05 | T-03 | ✅ cardinality helper, write-path-scoped (C-02 pin honoured) |
| AC-06 | T-01, T-04, T-05, T-06 | ✅ exact 20-row set-equality, single-source roster |
| AC-07 | T-05 | ✅ re-seed net-zero + retail-root stats diff |
| AC-08 | T-05 (real), T-06 (shape), T-07 (negative) | ✅ both halves |
| AC-09 | T-08 | ✅ enforcement + open-extras (N-02 pin honoured) |
| AC-10 | T-08 | ✅ full CRUD cycle + `git diff rbac-permissions.ts` |
| AC-11 | T-11 (edit-confined), T-12 (boundary sweep) | ✅ |
| AC-12 | T-09 | ✅ ready state |
| AC-13 | T-09 | ✅ loading |
| AC-14 | T-09 | ✅ empty; copy pins `seed:saas-metric-library` (C-03 upstream) |
| AC-15 | T-09 | ✅ error + retry-refetch |
| AC-16 | T-10 (css), T-11 (tsx) | ✅ two-invocation form |
| AC-17 | T-09 (tsx), T-12 (live) | ⚠ C-01 — KPI-Enter clause dropped vs approved AC |
| AC-18 | T-12 | ✅ Playwright reload |

### FR/NFR → task (all covered)

FR-01→T-02; FR-02→T-03/T-13; FR-03→T-03/T-13; FR-04→T-01; FR-05→T-05/T-06;
FR-06→T-05/T-06/T-07; FR-07→T-04/T-08; FR-08→T-01/T-08; FR-09→T-08;
FR-10→T-09/T-10; FR-11→T-09; FR-12→T-11/T-12; FR-13→T-09/T-12. NFR-01→
T-02/T-03/T-11/T-12; NFR-02→T-05; NFR-03→T-11/T-12; NFR-04→T-11; NFR-05→T-10;
NFR-06→T-03/T-12/T-13. No orphan FR/NFR; no task without a design basis.

### Dependency graph (acyclic, verified)

```
T-01 ─┬─ T-02 ─┬─ T-03 ─┬─ T-05 ── T-07
      │        │        └─ T-13
      │        └─ T-08
      ├─ T-04 ── T-09
      └─ T-06 ── T-05
T-10 ── T-09 ─┬─ T-11 ── T-12
              └─ T-12
T-14 ← T-01…T-13
```
No cycles. Only oddity is T-10→T-09 (CSS-before-component), see C-02.

### House-rule / blueprint conformance (all clean)

- **XD-02 / NFR-01** — zero `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` edits;
  runtime registry only. Enforced by AC-01/AC-03 `git diff` boundary checks
  (T-02/T-03) and the T-12 sweep. ✅
- **XD-05 / View Tree** — route `#/business/metrics` + view `MetricLibrary`
  taken verbatim; T-11 edits **only** the `metrics:` `VIEWS` key + import,
  never `route.ts`/`SURFACES`/`App.tsx`. ✅ (seam is real:
  `BusinessTabPlaceholder` exists.)
- **XD-06-erratum** — edge is `MEASURES`, never `INSTANTIATES`; T-03 pins it and
  the erratum is recorded in the blueprint (verified lines 153, 237-240). ✅
- **UX-01/02/05** — four view states (T-09), tokens-only + design-conformance
  (T-10/T-11), `ViewRegion` landmark + DOM-order keyboard reachability
  (T-09/T-12). ✅
- **zod-only / no-tsc / loopback / central-auth** — no new validation lib
  (§3.4 internal zod only), `bun run typecheck` at every checkpoint, no
  per-route auth, no new RBAC string (AC-10 `git diff` guard). ✅

## Verdict

**approve.** Zero blockers. The breakdown is faithful, fully traceable, every
task has a verification artifact, and all house-rules/blueprint constraints are
honoured with executable boundary checks. The three concerns (C-01 the AC-17
scope divergence, C-02 the CSS-before-tsx ordering, C-03 the unstated KPI/metric
test-fixture provisioning) are worth pinning but none blocks execution — C-01 is
best resolved with a one-line upstream design erratum, C-02/C-03 with a sentence
each in the affected task steps. Recording them as open concerns; a pass-2
re-review is optional, not required.
