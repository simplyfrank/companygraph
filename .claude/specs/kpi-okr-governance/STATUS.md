# Spec: kpi-okr-governance
**Size**: large | **Created**: 2026-07-04 | **Current Phase**: execution:complete

review_passes: 0 <!-- per-phase counter, reset on phase advance (current phase: execution — no review). Design and Tasks each consumed their 2/2 cap; the phase table below is the record. Fixes rev-3 task-review N-02 (the former "1" contradicted the pass-2/2 rows). The two 2026-07-04 out-of-band confirmation reviews are recorded in their phase rows and do NOT count against any cap. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (rev 2) | single-shot gate (XD-17) | 2026-07-04 |
| Req Review | revise → addressed in rev 2 (2 blockers, 4 concerns, 2 nits — all resolved) | - | 2026-07-04 |
| Design | approved (rev 2) | single-shot gate (XD-17) | 2026-07-04 |
| Design Review | approve on pass 2/2 (pass 1: 2 blockers, 3 concerns, 3 nits — all resolved in rev 2; pass 2: 0 blockers, 1 concern + 2 nits handed to tasks). Out-of-band cold confirmation review 2026-07-04 (current `review-design.md`): approve, 0 blockers; doc-only amendments sanctioned "no re-review" (C-02a–c landed-form accounting, N-01 V-05 row, N-02 `<main>` contingency fold) pending a design.md touch — see Next | - | 2026-07-04 |
| Tasks | approved (rev 4 — executed plan unchanged. Rev 3 = pass-2 erratum C-01/N-01/N-02, each sanctioned "no re-review needed". Rev 4 = rev-3 fresh-review erratum: N-01 dependency tidy under its "if touched again" sanction; C-01/C-02 carried to Next) | - | 2026-07-04 |
| Task Review | approve (pass 2/2 on rev 2; cap reached — rev 3 erratum applies only the reviewer's own sanctioned fixes, no third pass). Fresh cold review of rev 3, 2026-07-04 (current `review-tasks.md`): approve, 0 blockers, 2 concerns (C-01 git provenance, C-02 AC-19/NFR-01 pending first PR) + 2 nits (N-01/N-02) — dispositioned in tasks.md rev 4; out-of-band, not counted against the cap | - | 2026-07-04 |
| Execution | **complete** (T-01…T-21) | implementer | 2026-07-04 |

**Verification:**
- `verified_at`: 2026-07-04 (re-verified same day, second implementer pass — see "Re-verification addendum" below)
- `verification_artifact`: per-AC table below. Sweep commands, all green on 2026-07-04:
  `bun run typecheck` · `bun run test` (unit, incl. the new `api/__tests__/rbac-route-permissions.test.ts`) ·
  `bun run test:integration` **run twice back-to-back** against the same local stack (AC-20 — the ten
  kpi-okr suites pass both runs; the only failures in the tree are 6 pre-existing/foreign-spec failures,
  see "Not caused by this spec" below) ·
  `cd pwa && bunx vitest run src/__tests__/exec-kpi-management.test.tsx src/__tests__/exec-okr-management.test.tsx src/__tests__/error-scenarios/exec` (9/9) ·
  `bun run scripts/design-conformance.ts --view pwa/src/views/exec/KpiManagement.tsx` and
  `… --view pwa/src/views/exec/OkrManagement.tsx` (both exit 0, pinned N-02 form) ·
  `grep -n "api.cypher" pwa/src/views/exec/KpiManagement.tsx pwa/src/views/exec/OkrManagement.tsx` → no matches.

### Per-AC verification artifacts

| AC | Artifact |
|----|----------|
| AC-01 | `api/__tests__/kpi-crud.integration.test.ts` (lifecycle + v7 nibble) — pass ×2 |
| AC-02 | `api/__tests__/kpi-crud.integration.test.ts`, `api/__tests__/sla-crud.integration.test.ts` (list ordering + include_archived) — pass ×2 |
| AC-03 | `api/__tests__/kpi-crud.integration.test.ts` (detail/archive/audit subpaths + retired-overload 404s) — pass ×2 |
| AC-04 | `api/__tests__/kpi-measurements.integration.test.ts` (Postgres row assert via `query()`) — pass ×2 |
| AC-05 | `api/__tests__/kpi-trends.integration.test.ts` — pass ×2 |
| AC-06 | `api/__tests__/kpi-sla-alignment.integration.test.ts` (weight −0.1/1.1 → 400) — pass ×2 |
| AC-07 | `api/__tests__/sla-crud.integration.test.ts` — pass ×2 |
| AC-08 | `api/__tests__/sla-breaches.integration.test.ts` (enums + Postgres row + v7) — pass ×2 |
| AC-09 | `api/__tests__/sla-compliance.integration.test.ts` (all three endpoints, counting fields) — pass ×2 |
| AC-10 | `api/__tests__/okr-crud.integration.test.ts` (directive/KR CRUD, filters, okr-performance, v7) — pass ×2 |
| AC-11 | `api/__tests__/roll-down.integration.test.ts` (P0 flows + rejection table) — pass ×2 |
| AC-12 | zod-rejection cases inside each of the ten `*.integration.test.ts` files (issues[] envelope, was 500) — pass ×2 |
| AC-13 | `api/__tests__/openapi.integration.test.ts` — "AC-13 openapi covers the KPI/OKR governance surface" (45-path enumeration) — pass ×2 |
| AC-14 | `pwa/src/__tests__/exec-kpi-management.test.tsx`, `pwa/src/__tests__/exec-okr-management.test.tsx` (vitest/jsdom; loading→ready, created_at/createdAt dates, zero `/query/cypher` traffic) — pass; CI-gated by the T-20 unit-job step |
| AC-15 | same two files (empty-state testid distinct; ErrorState on 500) + `pwa/src/__tests__/error-scenarios/exec/{kpi-management,okr-management}` still green (5 files / 9 tests) |
| AC-16 | manual: ran `bun run scripts/design-conformance.ts --view pwa/src/views/exec/KpiManagement.tsx` and `… OkrManagement.tsx` (CLI) — both exit 0, "clean" (pinned N-02 two-invocation form) |
| AC-17 | manual: keyboard walk on `#/exec/kpi-management` and `#/exec/okr-management` (macOS Chrome, keyboard) — Tab order header → tablist (role="tablist" with aria-label "KPI/OKR management sections", tabs carry aria-selected) → primary "+ Create …" Button → DataTable, all via DOM order (no tabindex tricks); Enter on the primary action opens the catalog Modal (focus-trapped); the `main` landmark is shell-provided (`pwa/src/App.tsx` wraps the routed view in `<main className={styles.main}>` — verified in source; observation-only, no source edit in T-21) |
| AC-18 | manual: navigate to `#/exec/kpi-management` and `#/exec/okr-management`, Cmd+R (macOS Chrome, mouse+kb) — hash routes re-dispatch to the same views with data reloaded (routes registered verbatim in `pwa/src/route.ts:75-76` / `pwa/src/views/index.tsx:107-108`, untouched by this spec) |
| AC-19 | `.github/workflows/ci.yml` — postgres:16-alpine service + pg_isready healthcheck + POSTGRES_URI + migration step (`cd api && bun run src/storage/postgres/run-migrations.ts`, logs "applied") + hard-asserted API-server boot (V-03) + `bun run test:integration`; YAML parse-validated; **first-PR checkpoint pending**: open the PR's `integration` job, confirm green, and record wall-time in the PR description (NFR-01; trim levers in design §4.8 order if > ~4 min) |
| AC-20 | manual: `bun run test:integration` run twice consecutively against the same `bun run dev` stack (CLI) — the ten kpi-okr suites exit green both runs, no unique-constraint or leftover-fixture failures (fresh UUIDv7 fixtures + paired afterAll cleanup in every file). Re-verification hardening: a ~1-in-6 timing flake in the strict `updated_at > created.updated_at` assertions (kpi-crud / sla-crud lifecycle tests) was reproduced and fixed with `await Bun.sleep(2)` before the PATCH (timestamps are ms-resolution ISO; local round-trips can complete within one tick); ten-suite run then held 8/8 consecutive green |
| AC-21 | `api/__tests__/okr-crud.integration.test.ts` (unfiltered list: {rows}, createdAt DESC, domain-scoped + decoy excluded, filters keep bare-array as-built dispatch) + `api/__tests__/kpi-crud.integration.test.ts` (GET /domains name-ordered {rows}) — pass ×2 |

**Artifacts:**
- 📄 Requirements: `.claude/specs/kpi-okr-governance/requirements.md` (rev 2, approved)
- 📄 Design: `.claude/specs/kpi-okr-governance/design.md` (rev 2, approved)
- 📄 Tasks: `.claude/specs/kpi-okr-governance/tasks.md` (rev 4, approved — 21 tasks, all executed; rev 3 = post-approval erratum: T-21 sweep narrowed to the owned `error-scenarios/exec/{kpi-management,okr-management}` subtrees for any re-run (pass-2 C-01; the 2026-07-04 execution ran the full tree green), dependency-symmetry tidy (N-01), `App.tsx` line-number citations dropped (N-02); rev 4 = rev-3 fresh-review erratum: T-12 `Blocked by` += T-01 (last symmetry residue, review-sanctioned), C-01/C-02 process items carried to Next)
- 📝 Reviews: `review-requirements.md`, `review-design.md`, `review-tasks.md`

## Consolidated-report flags (XD-17 single-shot — no mid-run user gate)

- **DEC-01** — clean retirement of the `POST|GET /kpis/:id` / `/slas/:id` overloads (archive → `/:id/archive`, audit → `/:id/audit`, `GET /:id` repointed to the resource). Any out-of-repo script calling the old shapes breaks; stale RBAC rows for the retired overloads were removed (`POST kpis/:id` / `POST slas/:id` now resolve to `null` — pinned in `rbac-route-permissions.test.ts`).
- **DEC-02** — KPI/SLA audit endpoints remain the placeholder (one synthetic row, `user_id:"system"`); OpenAPI documents the shape verbatim (`AuditPlaceholderRow`). Downstream consumers must not assume a real audit trail.
- **V-02 split-brain (pinned, not fixed)** — `kpi-measurements`/`sla-breaches` write Postgres; `kpi-trends`/`sla-compliance` read Neo4j `:KPIMeasurement`/`:SLABreach` nodes. Measurements recorded via REST never feed trends/compliance. Documented in OpenAPI descriptions; left for `kpi-okr-performance-dashboards` to decide with eyes open.
- **V-04 matcher shadow (documented, not fixed)** — `GET /roll-down/kpi/product` (no trailing id) matches the by-domain regex; tests and OpenAPI descriptions use id-suffixed forms only.
- **NEW as-built defect found in execution (pinned, not fixed — outside FR-10…FR-14):** `GET /api/v1/roll-down/contributions` runs invalid Cypher (`RETURN … WITH … RETURN`) and always returns 500 `neo4j_unreachable`. Pinned in `roll-down.integration.test.ts` and documented in OpenAPI; the by-domain form works. A future spec should fix the query.
- **Further pinned as-built quirks:** roll-down `commit`'s `roll_down_id` actually matches the ASSIGNMENT id; kpi/okr roll-down creates never link `HAS_ASSIGNMENT` edges so collection GETs return degenerate rows; key-result list `attributes` is always `{}`; OKR DELETE returns `{success:true}` for unknown ids; alignment DELETE ids are raw Neo4j elementIds and the router does NOT URL-decode them (percent-encoded ids 404 — `pwa/src/api.ts` `deleteAlignment` still encodes; pre-existing, component-level, out of the FR-15 view mandate); FR-10c keeps the bug-compatible string-contains predicate (decoy pinned); `KpiCrud.tsx`'s internal cypher call left as-built (component, not an owned view).
- **pwa CI gap** — only the two exec-view pin files are CI-gated by T-20's unit-job step; the wider pwa vitest suite (incl. the legacy `error-scenarios` tree) still runs locally only and is left for a downstream spec to adopt.
- **Execution deviations (recorded):** (1) `shared/package.json` gained the one-line `"./schema/kpi-sla"` exports entry — required for `@companygraph/shared/schema/kpi-sla` imports to resolve, same additive pattern the other wave-1 specs used; (2) the CI boot step runs `bun run src/server.ts` instead of the design's literal `bun run start` — the `start` script hard-codes `--env-file=../.env`, which does not exist in CI; the job `env:` block supplies the same variables; (3) SLA PATCH now ignores `domain_id`/`product_type` (schema `.omit(...)` per design §3.3) where the as-built ladder applied them — as-built-accepted payloads still return 200 (fields stripped, not rejected).

## Re-verification addendum (2026-07-04, second implementer pass)

All gates re-run against the live local stack and confirmed green:
`bun run typecheck` · `bun run test` (266 + 45 pass, 0 fail) ·
the ten owned integration suites (`--test-name-pattern '^integration:'`, `--max-concurrency 1`)
run repeatedly against the same stack — 71 tests/10 files ·
`cd pwa && bunx vitest run src/__tests__/exec-kpi-management.test.tsx src/__tests__/exec-okr-management.test.tsx` (6/6) ·
narrowed `error-scenarios/exec/{kpi-management,okr-management}` sweep (3 files/3 tests, rev-3 T-21 binding form) ·
design-conformance on both owned views (exit 0, clean) · `api.cypher` grep clean.

One AC-20 defect found and fixed during re-verification: the strict
`updated_at > created.updated_at` assertions in
`api/__tests__/kpi-crud.integration.test.ts` and
`api/__tests__/sla-crud.integration.test.ts` flaked ~1 run in 6 when the
create and PATCH round-trips completed within the same millisecond
(route timestamps are `new Date().toISOString()`, ms resolution). Fixed
test-side with `await Bun.sleep(2)` before the PATCH in both files (spec-owned
test files only; no route changes). Post-fix: 8/8 consecutive green runs.

## Re-verification addendum (2026-07-04, third implementer pass)

Execution was already complete (T-01…T-21) on entry; this pass re-ran every
deterministic gate against the current tree (concurrent specs in flight) and
confirmed no regression:
`bun run typecheck` (pass) · `bun run test` (387 + 71 pass, 0 fail) ·
the ten owned integration suites (`--test-name-pattern '^integration:'`,
`--max-concurrency 1`, root `.env` sourced per §4.8a) **run twice
back-to-back** against the same live stack — 71/71 green both runs (AC-20) ·
`cd pwa && bunx vitest run src/__tests__/exec-kpi-management.test.tsx
src/__tests__/exec-okr-management.test.tsx` (6/6) · narrowed
`error-scenarios/exec/{kpi-management,okr-management}` sweep (3 files/3 tests,
rev-3 T-21 binding form) · `bun run scripts/design-conformance.ts --view …`
on both owned views (both exit 0, clean) · `api.cypher` grep on both views
(no matches). No source edits were needed; STATUS.md is the only file touched
by this pass. One operational note: running the suites via bare `bun test`
without sourcing the root `.env` fails kpi-measurements with ECONNREFUSED
(Postgres maps to host port **5433**) — always use
`bun run test:integration` / the §4.8a env-sourcing form locally.

## Not caused by this spec (pre-existing/foreign failures at verification time)

`bun run test:integration` carries 6 failures owned by other specs / the baseline, present before this
spec's first edit (recorded baseline 2026-07-04): 3× `ontology-bootstrap-reconcile.integration.test.ts`,
1× `system-kind-migration.integration.test.ts` (system-augmentation-model, in flight),
1× `ontology-routes.integration.test.ts` (export round-trip),
1× `model-workspace-core` label-registration (that spec is mid-execution in the same working tree).
None touch files this spec owns.

**Next**: first PR — three open items close together there (completion conditions, not follow-up niceties):

1. **Commit provenance** (task-review rev-3 C-01): commit the spec artifacts (and going forward, at each approved revision — archive superseded review texts, e.g. `review-design.pass1.md`, instead of overwriting, per design-review C-01) plus the implementation, so plan errata are diffable and the T-20 PR-based verification can run.
2. **AC-19 / NFR-01 proof** (task-review rev-3 C-02): open the PR's `integration` job, confirm green (postgres service healthy, migrations "applied", hard-asserted boot, suites pass), record wall-time in the PR description; if > ~4 min apply the design §4.8 trim levers in order.
3. **Design doc amendments** (out-of-band design review, sanctioned "no re-review"): three one-line landed-form corrections to §4.7/§4.9 (`export` keyword on `errorEnvelopeSchema`), §4.8 (CI boots `bun run src/server.ts`, not `bun run start`), §4.8a (root-anchored `.env` sourcing); plus N-01 (add a V-05 row for the vacuous FR-02 "time filters" phrase) and N-02 (fold the resolved `<main>`-landmark contingency). These are design.md edits — a design-author touch, not tasks.
