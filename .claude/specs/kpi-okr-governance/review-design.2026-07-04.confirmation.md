---
feature: "kpi-okr-governance"
reviewing: "design"
reviewing_revision: 2
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-04"
invocation_note: >
  Invoked cold as review pass 1 of at most 2. The on-disk artifact chain,
  however, already records a completed design pass 1 (revise) + pass 2
  (approve), an approved tasks phase, and execution:complete (STATUS.md),
  and the prior file at this path was itself an independent confirmation
  re-review (also invoked as "pass 1", also verdict approve). This file
  supersedes it; every load-bearing claim below was re-verified against
  the working tree directly, not inherited. See C-01.
---

# Review: kpi-okr-governance / design (rev 2) — independent cold review (pass 1)

Method: read `design.md` rev 2 in full, then `requirements.md` rev 2, the
blueprint (`.claude/specs/blueprint.md` — View Tree, UX-01…06, XD-01…18),
CLAUDE.md, the spec-review skill, and the prior review at this path. The
working tree already contains this design's implementation (execution
completed 2026-07-04 per STATUS.md), so as-built ("pin") claims were
checked for internal consistency and target-state claims were checked
against the tree as it stands. File:line evidence in the spot-check log.

## Verdict

**approve** — zero blockers. The design is complete, traceable to
requirements rev 2, faithful to the blueprint (View Tree routes verbatim,
UX-01/02/05/06 satisfied, UX-03/04 correctly n/a, XD-02-as-amended /
XD-16 / XD-17 honored), and every load-bearing claim I re-checked matches
the working tree. The two concerns are workflow bookkeeping (C-01) and
doc-only accounting drift on co-owned-file touches (C-02); neither
changes a design decision.

## Blockers

none.

## Concerns

- **C-01 — Pass-counter vs artifact state; the audit chain at this path
  keeps being overwritten.** This review was invoked as "pass 1 of at
  most 2", but `design.md` frontmatter records `status: approved` /
  `approved_via: review-design.md pass 2`, and STATUS.md records
  "Design Review: approve on pass 2/2" plus `Execution: complete
  (T-01…T-21)`. The original pass-1 and pass-2 design-review texts no
  longer exist in the tree — this path has now hosted at least three
  successive review documents, each overwriting the last, so the only
  surviving record of the original findings is the author's own
  resolution map in design §2 and the STATUS.md counts. STATUS.md's
  `review_passes: 1` line also contradicts its own "pass 2/2" phase
  rows. Nothing in the artifact content misstates history, but the
  phase's review budget is already spent; consuming this file as a
  fresh pass 1 would double-count. **Recommendation:** the orchestrator
  reconciles its pass counter with STATUS.md before acting on this
  verdict, treats this file as an out-of-band confirmation review, and
  from now on archives superseded review texts (e.g.
  `review-design.pass1.md`) instead of overwriting, so blocker
  provenance stays auditable.

- **C-02 — §4.9 makes the design the governing record of sanctioned
  touches on co-owned files, but three touch descriptions are stale
  against the landed tree (doc-only; no decision changes).**
  **(a)** §4.7/§4.9 sanction "exactly two lines (import + call)" on
  `api/src/routes/openapi.ts`; the landed touch is three tokens —
  import (`openapi.ts:80`), call (`:867`), **and** the added `export`
  keyword on `errorEnvelopeSchema` (`:84`, comment says "kpi-okr-
  governance pinned C-01"). **(b)** §4.8's YAML boots the server with
  `bun run start`; the landed workflow runs `bun run src/server.ts`
  directly (`.github/workflows/ci.yml`, "Boot API server" step),
  sidestepping `start`'s `--env-file=../.env` in CI. **(c)** §4.8a
  quotes a three-line `set -a; [ -f .env ] && . ./.env; set +a`
  snippet "run from the repo root prior to `cd api`"; the landed
  `scripts/test-integration.sh` uses the root-anchored
  `ROOT="$(git rev-parse --show-toplevel)"` form instead (a prior
  review's improvement, per its own comment). All three landed forms
  are *better* than the design text, but the §4.9 merge rule only works
  if the design's accounting of narrow touches is exact.
  **Recommendation:** three one-line amendments to §4.7/§4.9, §4.8, and
  §4.8a matching the landed forms; no re-review needed.

## Nits

- **N-01 — Requirements FR-02's "time filters as-built" phrase is
  vacuous and the design corrects it silently.** As-built the
  measurements list supports only `kpi_id` (required) + `limit`/`offset`
  (`api/src/routes/kpi-measurements.ts:49-62`) — no time filters exist.
  The §4.1 pin is correct; add a V-05 row to the §2
  verification-findings table so the consolidated report inherits the
  divergence, matching the V-01…V-04 discipline.
- **N-02 — §6's `<main>`-landmark contingency is resolved; fold it in.**
  The design leaves "if execution finds the shell lacks a `main`
  landmark…" conditional; STATUS.md AC-17 records the landmark is
  shell-provided (`pwa/src/App.tsx`) and the views render none. One
  line closes the conditional.

## Verified claims (spot-check log)

| Design claim | Tree evidence | Result |
|---|---|---|
| §4.2 `parseWith` helper on the ValidationError channel | `api/src/routes/_helpers.ts:84` (`parseWith`), `:74` (`parseQueryBool`), `:49` (`readJson`), `:14` (`parseId`) | confirmed |
| §4.2 router ZodError backstop | `api/src/router.ts:262` import, `:284` `e instanceof ZodError` branch | confirmed |
| §4.9 twelve owned dispatch anchors + Domain narrow touch | `router.ts:637` (Roll-down), `:670` (Domain CRUD, `:672` one-line `handleDomainList` dispatch), `:699` (KPI CRUD), `:715` (SLA CRUD), `:730` (KPI alignment), `:736` (OKR Directive), `:755` (Key Result), `:768` (OKR Performance), `:774` (SLA alignment), `:780` (KPI measurement), `:790` (SLA breach), `:801` (KPI trend), `:805` (SLA compliance) | confirmed |
| §4.4 subpaths matched before `:id`; overloads retired (DEC-01) | `router.ts:699-729` — archive/audit regexes precede `kpiOne`/`slaOne`; no `POST /kpis/:id` archive route remains | confirmed |
| §4.10 RBAC entries added / stale rows removed | `api/src/auth/rbac-permissions.ts:178` (`GET domains`), `:196-198` (KPI list/archive/audit), `:205-207` (SLA mirror), `:244` (`GET okr-directives` pre-existing); no `P("POST", "kpis/:id"…)` / `P("POST", "slas/:id"…)` rows | confirmed |
| §4.4/§4.6 kpi-crud fixes | `api/src/routes/kpi-crud.ts:24` (`z.string().uuid()` DD-04 guard), `:28/:145` (`parseWith`), `:43` (`generateId()`, comment cites FR-14), `:96` (`handleKpiList`), `:119` (`handleKpiGet`) | confirmed |
| §4.5 FR-10c byte-for-byte predicate, camelCase ordering | `api/src/routes/okr-crud.ts:122` (`handleOkrDirectiveList`), `:127` — `NOT n.attributes_json CONTAINS '"domain_id"' … ORDER BY n.createdAt DESC` | confirmed |
| §4.1/§4.2 third contract change (DD-01 iii) | `api/src/routes/roll-down.ts:1300` `handleSlaDomainRollDownPost` now `parseWith`, in-code comment cites DD-01 (iii) + req-review pass-2 C-01; no `flatten()`/"schema validation failed" remains in the file | confirmed |
| §4.6 keep-`uuid` resolution; v7 everywhere | `api/src/ids.ts:1` (`v7 from "uuid"`); `uuid`/`@types/uuid` retained in `api/package.json:28/:37`; `kpi-measurements.ts:8/:27` + `sla-breaches.ts:9/:41` use `generateId` | confirmed |
| §3.3 shared request schemas incl. weight bound + doc-only `listQuerySchema` | `shared/src/schema/kpi-sla.ts:155-226`; `:197` `weight: z.number().min(0).max(1)`; `:226` `listQuerySchema` | confirmed |
| §4.7 OpenAPI module + hook | `api/src/routes/openapi-kpi-okr.ts` exists; `openapi.ts:80` import, `:867` `registerKpiOkrPaths(registry)`; `errorEnvelopeSchema` **export** at `:84` (see C-02a) | confirmed (C-02a accounting) |
| §4.8 CI postgres + migrations + hard-asserted boot | `.github/workflows/ci.yml` — `postgres:16-alpine` service w/ `pg_isready` healthcheck, `POSTGRES_URI` job env, `cd api && bun run src/storage/postgres/run-migrations.ts`, background boot + 60×1s healthz wait + hard `curl -fsS … || exit 1` with `$RUNNER_TEMP/api-server.log` dump | confirmed (C-02b boot command drift) |
| §4.8a env sourcing for the test process | `scripts/test-integration.sh` — root-anchored `.env` sourcing, tolerant when absent | confirmed (C-02c form drift) |
| §6 views on REST, states, tablist, tokens | `KpiManagement.tsx:63-64` (`api.kpi.list()` + `api.domains.list()`), `OkrManagement.tsx:68` (`okr.listDirectives()`); zero `api.cypher` in either; `role="tablist"` + `aria-label` (`:113`/`:116`); `data-testid="empty-state"` (`:136`/`:140`); both `.module.css` files exist | confirmed |
| §6 client methods are narrow touches | `pwa/src/api.ts:208-210` (`domains.list`), `:217-218` (`kpi.list`), `~:1030` (`okr.listDirectives`, comment cites the unfiltered list contract) | confirmed |
| View Tree verbatim, no new/renamed routes | blueprint `:125-126` — `#/exec/kpi-management`, `#/exec/okr-management` → "existing views, verified + tested [owner: kpi-okr-governance]"; `pwa/src/route.ts:83-84` ids `kpi-management`/`okr-management` untouched; `#/exec/performance` correctly not touched | confirmed |
| DD-05 split-brain kept per blueprint | XD-02 **amended final ruling 2026-07-04** (blueprint `:157`): Neo4j `:KPIMeasurement` canonical for trends, Postgres table stays as-built, "split-brain is documented, not fixed" — matches §3.4/DD-05 exactly | confirmed |
| §7/§8 test artifacts | all 10 `api/__tests__/*.integration.test.ts` + `rbac-route-permissions.test.ts` + `pwa/src/__tests__/exec-{kpi,okr}-management.test.tsx` exist | confirmed |
| N-01 basis | `kpi-measurements.ts:49-62` — list params are `kpi_id`/`limit`/`offset` only | confirmed |

## Completeness / Traceability

| FR / NFR / AC | Design element | Verified against tree | Status |
|---|---|---|---|
| FR-01 KPI lifecycle | §4.1 kpi-crud pin; §4.4/§4.6 fixes | kpi-crud.ts, kpi-crud.integration.test.ts | covered |
| FR-02 measurements (Postgres) | §4.1, §3.2 migration 003 | kpi-measurements.ts, test file | covered (N-01 wording) |
| FR-03 trends | §4.1, §3.4 direct-driver seeding (read-only passthrough correctly ruled out) | kpi-trends.integration.test.ts | covered |
| FR-04 alignments + weight bound | §3.3 (the one sanctioned tightening), §4.1 elementId note | kpi-sla.ts:197, alignment test | covered |
| FR-05/06/07 SLA surface | §4.1 mirrors, §3.2 migration 004 (`investigating` gap honestly pinned) | sla-* files + tests | covered |
| FR-08 OKR surface | §4.1 — raw-Node echo + `attributes:{}` defect pinned honestly, flagged for report | okr-crud.ts, test | covered |
| FR-09 roll-down P0 floor + rejection table | §4.1 + DD-01(iii) `issues[]` pin on `sla/domain` | roll-down.ts:1300, test | covered |
| FR-10a–d lists | §4.5 table; §4.10 RBAC rows; `{rows}` vs bare-array asymmetry pinned | router.ts:672/703/718, rbac table, api.ts | covered |
| FR-11a zod conversion (5 files) | §3.3 + §4.3, DD-03 no-tightening | shared schemas at kpi-sla.ts:155-226 | covered |
| FR-11b ZodError→400 (9 files) | §4.2 `parseWith` + router backstop; the FR's open design decision explicitly closed | _helpers.ts:84, router.ts:284 | covered |
| FR-12 OpenAPI | §4.7 owned module + narrow hook | openapi-kpi-okr.ts, openapi.ts:80/:867 | covered (C-02a) |
| FR-13 detail routes / DEC-01 retirement | §4.4, §5, §4.10 stale-row removal | router.ts:699-729 | covered |
| FR-14 UUIDv7 | §4.6 incl. explicit keep-`uuid` resolution of the FR's conditional | ids.ts, 4 route files | covered |
| FR-15 views on REST | §6 data layer — all three named `api.cypher` replacements | api.ts, both views | covered |
| FR-16 states/tokens/a11y/deep links | §6 states + tokens-only modules + tablist + AC-16…18 | views + .module.css | covered |
| FR-17 Postgres in CI | §4.8 (V-03 boot fix folded in, hard assert, NFR-01 checkpoint + 3 ordered trim levers) | ci.yml | covered (C-02b) |
| FR-18 self-provisioning tests | §4.8a env + `runMigrations()` beforeAll + paired cleanup | test-integration.sh | covered (C-02c) |
| NFR-01 CI < 5 min | §4.8 measurement checkpoint + trim levers | — | honored |
| NFR-02 zod-only / en-US / no tsc | §1 rules, §3.3, §4.2 — no second validation lib | tree | honored |
| NFR-03 additive-only | DD-01(i–iii) — exactly three contract breaks, each enumerated, pinned, rationale recorded | — | honored |
| NFR-04 snake_case frozen | §1 rule 2, §3.1 casing table, §4.5 camelCase-on-`:OKRDirective` note | okr-crud.ts:127 | honored |
| NFR-05 central auth gate | DD-12 + §4.10 route↔RBAC pairing + honest "integration runs are auth-blind" admission → unit test | rbac-permissions.ts, rbac-route-permissions.test.ts | honored |
| UX-01 view states | §6 states → AC-14/AC-15 | jsdom tests | honored |
| UX-02 tokens + catalog + conformance | §6 component plan, two new modules, AC-16 | .module.css files | honored |
| UX-03/UX-04 | n/a per requirements Platforms table (no canvas/gesture; no new breakpoints) | — | honored |
| UX-05 a11y | §6 focus order, tablist labels, `<main>` landmark → AC-17 | views (N-02 contingency) | honored |
| UX-06 deep links, routes verbatim | §6 view-tree placement; AC-18 | route.ts:83-84, blueprint :125-126 | honored |
| XD-02 (amended)/XD-16/XD-17 | DD-05; verify-then-fix charter; DEC-01/02 recorded, no user gate | blueprint :157/:171/:172 | honored |
| AC-01…AC-13, AC-21 | §7/§8 — every AC named in ≥1 concrete test file | 11 api test files exist | covered |
| AC-14/AC-15 | jsdom test plan incl. strict OKR assertions (N-03 honesty note) | both exec test files | covered |
| AC-16…AC-20 | §8 manual-with-repro (CLI/browser/CI, input modes named) | STATUS per-AC table | covered |

Cross-checks: every FR/NFR reaches §7 File Changes; every AC is closed by
a named test or manual repro (21/21); routes and view names match the
blueprint View Tree verbatim (nothing invented or renamed); §4.9's twelve
owned router anchors match `router.ts` comment-for-comment; every narrow
touch on a co-owned file is enumerated with a merge rule (modulo the
C-02 accounting drift).

## What is done well

The contract-change accounting (exactly three sanctioned breaks, each
landing with its pinning test in the same task), the §2 V-01…V-04
verification-findings discipline (V-01's v7-only `parseId` making the
as-built lifecycle self-contradictory is a genuinely good catch, and the
"pin the fixed contract because the as-built one is unusable" call is
correctly reasoned), the DD-12 route↔RBAC pairing with the honest
admission that integration runs cannot observe RBAC drift (hence the
unit test), and the §4.9 section-ownership merge rule are all exemplary
— and all were independently confirmed against the tree.
