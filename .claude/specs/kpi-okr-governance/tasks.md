---
feature: "kpi-okr-governance"
created: "2026-07-04"
author: "spec-author (blueprint: business-modeling-studio, XD-16)"
status: "approved"
revision: 4
reviewing_requirements_revision: 2
reviewing_design_revision: 2
size: "large"
total_tasks: 21
---

# Tasks: kpi-okr-governance

## Revision 4 — post-execution erratum (rev-3 fresh-review dispositions)

A fresh cold review of revision 3 (`review-tasks.md`, 2026-07-04,
verdict **approve**, 0 blockers) confirmed the rev-3 erratum envelope,
re-derived the plan's soundness against requirements rev 2 / design
rev 2 / the blueprint, and verified the artifact's claims against the
executed tree. Its findings are dispositioned here; the executed plan
is otherwise unchanged from rev 3. No IDs renumbered; no scope,
ordering, or verification change; execution (complete 2026-07-04) is
unaffected.

| Finding | Disposition |
|---------|-------------|
| C-01 (concern) | Git provenance: the spec directory and the implementation are uncommitted, so superseded plan revisions are not mechanically diffable and the T-20 PR-based verification cannot yet run. Process item, not a plan defect — carried in STATUS.md **Next** as a first-PR completion condition (commit spec artifacts at each approved revision + commit the implementation). No plan change. |
| C-02 (concern) | AC-19 / the NFR-01 wall-time budget remain *asserted*, not *verified*, until the first PR's `integration` job runs green with wall-time recorded. This was already binding on T-20 ("NFR-01 checkpoint (binding)"); STATUS.md keeps the checkpoint explicitly open as a completion condition, not a follow-up nicety. No plan change. |
| N-01 (nit) | Last `Blocks`/`Blocked by` asymmetry tidied under the review's standing "tidy only if the file is touched again" rule — this erratum is that touch: T-12 `Blocked by` += T-01 (T-12 consumes `slaCreateRequestSchema`/`slaPatchRequestSchema`; T-01 `Blocks` already listed T-12). Pure metadata — transitively implied via T-11 ← T-01 and executed in that order. Resolves: rev-3 review N-01. |
| N-02 (nit) | STATUS.md header `review_passes` self-contradiction fixed on this STATUS touch, per the review's "fix on the next STATUS touch" sanction (the counter is per-phase and resets on phase advance; Design and Tasks each consumed their 2/2 cap — the phase table is the record). Resolves: rev-3 review N-02 (STATUS.md edit; recorded here for traceability). |

## Revision 3 — post-approval erratum (task-review pass 2 dispositions)

Task review pass 2 (`review-tasks.md`, verdict **approve**, 0 blockers)
recorded one concern and two nits "for the executor", each explicitly
sanctioned for fixing without re-review. Revision 3 records their
dispositions and applies exactly those edits — the reviewed plan is
otherwise unchanged, and execution (T-01…T-21, complete 2026-07-04 per
STATUS.md) is unaffected. No IDs renumbered; no scope change.

| Finding | Disposition |
|---------|-------------|
| C-01 (concern) | T-21's step (1) sweep included the full `error-scenarios/exec` tree. Executed as written on 2026-07-04 and the tree was green (9/9 — see STATUS.md), so the risk of gating on unowned suites (`finance/`, `ops/`, `people/`, `risk/`, `transform/` also live under that directory) did not materialize. The review-sanctioned narrowed form is now pinned in T-21 as the binding command for any future re-run of the sweep. Resolves: C-01. |
| N-01 (nit) | `Blocks`/`Blocked by` symmetry residue tidied, as the review permits "if the file is touched again": (a) T-06/T-07/T-08 `Blocked by` now list T-01 (each consumes a T-01 schema); (b) T-11/T-12 `Blocked by` now list T-03 (their tests' direct-driver cleanup needs the env fix), with T-03 `Blocks` updated symmetrically. Pure metadata — no ordering change (T-01/T-03 are Stage 0 and already executed first). Resolves: N-01. |
| N-02 (nit) | Line-number citations for the shell `<main>` landmark dropped (the element sat at `App.tsx:94` at authoring, `:93` at review, `:97` now — the file carries uncommitted drift exactly as the review predicted). All references now read "the `<main className={styles.main}>` wrapper in `pwa/src/App.tsx`". The substantive claim (shell provides the landmark; owned views render no `<main>`) is unchanged and re-verified in the current tree. Resolves: N-02. |

## Revision 2 — task-review pass 1 fixes

Every finding in `review-tasks.md` (pass 1) is addressed; individual
changes are tagged `Resolves:` inline.

| Finding | Change |
|---------|--------|
| B-01 (blocker) | All four PWA verifications (T-16…T-19), T-21 sweep step (1), the reading-guide checkpoint bullet, and the Validation-checkpoints table now use the vitest entry points (`cd pwa && bunx vitest run <path>`). Root `bun test` never discovers pwa files and Bun's runner cannot execute them (no jsdom, no `@`/`@shared` aliases, no setup files). |
| C-01 | T-15 `Blocked by` now names T-01, T-04, T-05, T-09 (whose exported schemas it registers) alongside T-11, T-12, T-13. |
| C-02 | Decision: the AC-14/AC-15 jsdom pins ARE CI-gated — T-20 adds one sanctioned step to the `unit` job running exactly the two exec-view vitest files. Scoped to the two owned files (not `bun run --cwd pwa test`) so this spec does not silently adopt the un-triaged legacy `error-scenarios` tree into the merge gate. The remaining pwa-suite CI gap is recorded in T-21's consolidated-report flags. |
| C-03 | Contingency resolved at authoring time: the app shell provides the `main` landmark (the `<main className={styles.main}>` wrapper in `pwa/src/App.tsx` wraps the routed view — line-number citation dropped per pass-2 N-02). Noted in T-16/T-18; T-21 step (4) is observation-only — no source edits in the completion task. |
| N-01 | `Blocks`/`Blocked by` symmetry restored everywhere: T-02 Blocks += T-10; T-03 Blocks += T-07, T-09, T-13; T-04/T-05/T-09 Blocks += T-15; T-12 Blocks += T-13; T-16 Blocks += T-18. |
| N-02 | No change — 4-file waiver on T-11/T-12 stands as pre-declared; recorded by the review. |
| N-03 | Fallback noted on T-01/T-02: if `bun -e` quoting/cwd misbehaves, move the snippet to a scratch file and `bun <file>`; expected outputs unchanged, no re-review needed. |

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocks` / `Blocked by`); no out-of-order execution.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook blocks STATUS.md updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h with one
  judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. Tasks touching
  `pwa/src/views/` or `pwa/src/components/` additionally run
  `bun run scripts/design-conformance.ts --view <file>`.
- **PWA tests are vitest, never `bun test` (Resolves: B-01)**: root
  `bun test` → `scripts/test-unit.sh`, which cds into `api/` and
  `shared/` only and never discovers a `pwa/` file; invoking
  `bun test <pwa path>` uses Bun's runner, which ignores
  `pwa/vitest.config.ts` (no jsdom, no `@`/`@shared` aliases, no
  `setupFiles`). Any test under `pwa/src/__tests__/` is run as
  `cd pwa && bunx vitest run <path relative to pwa/>` (design §8:
  jsdom/vitest).
- **Integration-test naming**: `scripts/test-integration.sh` selects by
  test-name pattern `^integration:` — every `describe` in a new
  `*.integration.test.ts` file MUST be prefixed `integration: ` or the
  suite silently skips it.
- **Same-task pairings (binding, from design DD-01/DD-12; the design
  review asks the task review to check exactly these):**
  1. Each of the three sanctioned contract changes lands in the same
     task as the test that pins it: DEC-01 overload retirement → T-11
     (KPI) / T-12 (SLA); FR-04 weight bound → T-07; roll-down
     `issues[]` details standardization → T-09.
  2. Every route-surface change lands in the same task as its
     `ROUTE_PERMISSIONS` edit (DD-12): T-10, T-11, T-12. (T-13's FR-10c
     route is already covered by the existing `P("GET","okr-directives")`
     entry — no RBAC edit, per design §4.10.)
  3. The NFR-01 CI wall-time checkpoint is carried on T-20.
- **File-count note**: T-11 and T-12 carry 4 files each — the 3-file
  guideline yields to pairing rules 1+2 above (route file + owned
  router block + RBAC section + pinning test are inseparable by
  design). Both are single-surface tasks; splitting them would land a
  sanctioned contract change or an RBAC-guarded route in a task
  without its pin, which the design forbids.

## Open design concerns — pinned decisions

Design review pass 2 (verdict: **approve**) left one concern and two
nits for the tasks author to pin. Decisions here are binding for
execution.

| Concern | Decision | Rationale | Locked in task |
|---------|----------|-----------|----------------|
| C-01 — `errorEnvelopeSchema` is module-private in `api/src/routes/openapi.ts:53`, but `openapi-kpi-okr.ts` must reference it; the sanctioned touch was "exactly two lines" | **Export the const** (`const` → `export const` on line 53) and have `registerKpiOkrPaths` import it from `./openapi`. The §4.9 sanctioned touch on `openapi.ts` is re-accounted as: import line + call line + the `export` keyword — nothing else. The alternative (passing the schema as a second argument) was rejected: it makes the registry call-site carry schema plumbing and reads as if the envelope were this spec's to define. Resolves: design-review C-01. | One envelope definition in one OpenAPI doc (no duplicate-schema drift); the touch stays enumerable for the §4.9 merge rule | T-15 |
| N-01 — `[ -f .env ] && . ./.env` resolves against the invocation cwd, not the repo root | Anchor the sourcing: `ROOT="$(git rev-parse --show-toplevel)"; set -a; [ -f "$ROOT/.env" ] && . "$ROOT/.env"; set +a` placed before the existing `cd`. A direct `scripts/test-integration.sh` run from `api/` now behaves identically to `bun run test:integration` from the root. Resolves: design-review N-01. | One env path regardless of caller cwd; CI unaffected (`[ -f … ]` guard) | T-03 |
| N-02 — requirements AC-16 repro (`bun scripts/design-conformance.ts`, no args) passes vacuously — the script is inert without `--view`/`--surface` | AC-16 verification is executed as **two explicit `--view` invocations**, one per touched view: `bun run scripts/design-conformance.ts --view pwa/src/views/exec/KpiManagement.tsx` and `… --view pwa/src/views/exec/OkrManagement.tsx`, each expected to exit 0. The bare-command form from requirements AC-16 is not used. Resolves: design-review N-02. | The check must actually scan the two owned files to verify anything | T-16, T-18, T-21 |

## Task list

### Stage 0 — plumbing (no route behaviour changes)

### T-01 — Shared request/query schemas in `kpi-sla.ts`

- **Files** (1): `shared/src/schema/kpi-sla.ts` (modify)
- **Implements**: design §3.3 — serves FR-11a, FR-12 (feeds AC-01, AC-04,
  AC-06, AC-07, AC-12, AC-13)
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-02, T-06, T-07, T-08, T-11, T-12, T-15
- **Steps**: Append, verbatim from design §3.3: `kpiCreateRequestSchema`,
  `kpiPatchRequestSchema` (`.omit({domain_id:true}).partial()`),
  `slaCreateRequestSchema`, `slaPatchRequestSchema`,
  `kpiAlignmentCreateRequestSchema` (weight `.min(0).max(1)` — the one
  sanctioned tightening), `slaAlignmentCreateRequestSchema`,
  `kpiTrendsQuerySchema`, `slaComplianceQuerySchema`, `listQuerySchema`
  (`z.enum(["true","1"]).optional()` — documentation-only; keep the
  design's comment banning `z.coerce.boolean()` and stating handlers
  parse via `parseQueryBool`). Do NOT touch the existing read schemas
  (`kpiSchema`, `slaSchema`, …). No enum enforcement beyond what §3.3
  writes (DD-03). en-US identifiers; zod only.
- **Verification**: manual: from repo root run
  `bun -e 'import {kpiCreateRequestSchema, kpiAlignmentCreateRequestSchema} from "./shared/src/schema/kpi-sla"; console.log(kpiCreateRequestSchema.safeParse({}).success, kpiAlignmentCreateRequestSchema.safeParse({kpi_id:"x",target_type:"journey",target_id:"y",weight:1.5,attribution_type:"direct"}).success)'`
  (CLI) — expect output `false false` (missing required fields rejected;
  weight 1.5 rejected). If `bun -e` quoting/cwd misbehaves, drop the
  snippet into a scratchpad file and run `bun <file>` — same expected
  output, no re-review needed (Resolves: N-03)

### T-02 — `parseWith` helper + router ZodError backstop

- **Files** (2): `api/src/routes/_helpers.ts` (modify),
  `api/src/router.ts` (modify — sanctioned 3-line touch (b) in the
  `route()` catch, outside the owned dispatch blocks, per design §4.9)
- **Implements**: design §4.2 / DD-02 — serves FR-11b (feeds AC-12)
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-04, T-05, T-06, T-07, T-08, T-09, T-10, T-11, T-12, T-13
  (T-10 added — Resolves: N-01)
- **Steps**: (1) Add `parseWith<S extends z.ZodTypeAny>(schema, input)`
  to `_helpers.ts` exactly as design §4.2: `safeParse`; on failure
  `throw new ValidationError("invalid_payload", { issues:
  r.error.issues.map(i => ({ path: i.path.join("."), message:
  i.message, code: i.code })) })`. It rides the existing
  `ValidationError → fromValidationError` 400 channel — do not add an
  `ERROR_CODES` entry. (2) In `router.ts`'s `route()` catch, add the
  defensive branch: `if (e instanceof ZodError)` → `error(400,
  "invalid_payload", …)` with the same `issues[]` mapping (backstop for
  future direct `.parse()` calls). No other router lines change in this
  task.
- **Verification**: manual: from repo root run
  `bun -e 'import {parseWith} from "./api/src/routes/_helpers"; import {z} from "zod"; try { parseWith(z.object({a:z.string()}), {}) } catch (e) { console.log(e.constructor.name, JSON.stringify(e.details.issues[0].path)) }'`
  (CLI) — expect `ValidationError "a"`. Same scratch-file fallback as
  T-01 if `bun -e` misbehaves (Resolves: N-03)

### T-03 — Test-process env in `scripts/test-integration.sh`

- **Files** (1): `scripts/test-integration.sh` (modify)
- **Implements**: design §4.8a — serves FR-18 (feeds AC-20); pins
  design-review N-01
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-04, T-05, T-06, T-07, T-08, T-09, T-11, T-12, T-13 (all
  tasks whose tests open the production `getDriver()` / `pg` client
  directly; T-07/T-09/T-13 added for symmetry with their `Blocked by` —
  Resolves: pass-1 N-01; T-11/T-12 added rev 3 — Resolves: pass-2 N-01b)
- **Steps**: Before the existing `cd`, insert the root-anchored sourcing
  per the pinned N-01 decision: `ROOT="$(git rev-parse --show-toplevel)"`
  then `set -a; [ -f "$ROOT/.env" ] && . "$ROOT/.env"; set +a`, with the
  design's comment ("root .env is the source of truth locally; absent in
  CI, where the job env applies"). Nothing else changes; test files stay
  env-loading-free (they use the production `getDriver()` and `query()`
  singletons).
- **Verification**: manual: with the `bun run dev` stack up, run
  `bash scripts/test-integration.sh` from inside `api/` (CLI) — expect
  the existing integration suite to connect and pass (no Neo4j auth /
  missing-env failure), identical to a root `bun run test:integration` run

### Stage 1 — fix + pin, surfaces without router/RBAC changes

### T-04 — kpi-measurements: parseWith + UUIDv7 + Postgres pin

- **Files** (2): `api/src/routes/kpi-measurements.ts` (modify),
  `api/__tests__/kpi-measurements.integration.test.ts` (new)
- **Implements**: design §4.1 (kpi-measurements), §4.2, §4.6, §3.4 —
  closes AC-04, AC-12 (measurements rows); serves FR-02, FR-11b, FR-14,
  FR-18
- **Complexity**: moderate
- **Blocked by**: T-02, T-03
- **Blocks**: T-15 (exports schemas it registers — Resolves: C-01), T-20
- **Steps**: Route file: replace `schema.parse(body)` with
  `parseWith(schema, body)` and bare `await req.json()` with
  `readJson(req)`; swap `import { v4 } from 'uuid'` for `generateId()`
  from `api/src/ids.ts`; `export` the body schemas (for T-15). Test file
  (all describes prefixed `integration: `): `beforeAll` awaits
  `runMigrations()` (idempotent); POST → 201 echo (NUMERIC `value` comes
  back as string on the POST echo, GETs `parseFloat` it — pin exactly);
  new id version nibble is `7`; `GET ?kpi_id=` required else 400,
  `limit`/`offset` defaults 100/0; `GET /:id` 404 unknown; `DELETE /:id`
  → `{deleted:true}`; malformed body → 400
  `{error:{code:"invalid_payload",…,details.issues[]}}` (was 500
  as-built — AC-12); assert the row exists in Postgres via `query()`
  from `api/src/storage/postgres/client`. Fresh UUIDv7 fixture ids;
  `afterAll` deletes seeded rows (`DELETE … WHERE id = ANY($1)`).
- **Verification**: `api/__tests__/kpi-measurements.integration.test.ts`
  (via `bun run test:integration`; needs Postgres up)

### T-05 — sla-breaches: parseWith + UUIDv7 + Postgres pin

- **Files** (2): `api/src/routes/sla-breaches.ts` (modify),
  `api/__tests__/sla-breaches.integration.test.ts` (new)
- **Implements**: design §4.1 (sla-breaches), §4.2, §4.6, §3.2 — closes
  AC-08, AC-12 (breaches rows); serves FR-06, FR-11b, FR-14, FR-18
- **Complexity**: moderate
- **Blocked by**: T-02, T-03
- **Blocks**: T-08, T-15 (exports schemas it registers — Resolves: C-01),
  T-20
- **Steps**: Mirror of T-04 on `sla-breaches.ts`: `parseWith` +
  `readJson`, `generateId()` replaces `uuid` v4, export schemas. Test:
  POST → 201 with `resolution_status` forced `'open'`; severity enum
  (minor|major|critical) enforced → 400 on garbage; list filters
  `sla_id` (required) + `resolution_status`; PATCH partial resolution
  updates, empty patch body → 400 `no fields to update`; DELETE →
  `{deleted:true}`; malformed body → 400 `issues[]` envelope; v7 nibble
  on new ids; Postgres row asserted via `query()`; `runMigrations()` in
  `beforeAll`; paired cleanup. Note: the DB CHECK omits `investigating`
  — pinned as-is (design §3.2), do not "fix".
- **Verification**: `api/__tests__/sla-breaches.integration.test.ts`
  (via `bun run test:integration`; needs Postgres up)

### T-06 — kpi-trends: query schema + UUID-any guard + pin

- **Files** (2): `api/src/routes/kpi-trends.ts` (modify),
  `api/__tests__/kpi-trends.integration.test.ts` (new)
- **Implements**: design §4.1 (kpi-trends), §4.3, DD-04, §3.4 seeding —
  closes AC-05; serves FR-03, FR-11a
- **Complexity**: moderate
- **Blocked by**: T-01 (consumes `kpiTrendsQuerySchema` — Resolves:
  pass-2 N-01a), T-02, T-03
- **Blocks**: T-20
- **Steps**: Route file: parse `window_days`/`ma_period`/
  `anomaly_threshold` via `parseWith(kpiTrendsQuerySchema, …)` (replaces
  raw `parseInt`/`parseFloat`; garbage now 400s instead of `NaN`); path
  guard switches from `parseId` (v7-only) to a local `z.string().uuid()`
  check (DD-04 — pre-existing v4 KPI ids stay addressable). Test: create
  a KPI via `POST /api/v1/kpis`; seed `:KPIMeasurement` nodes
  (`{kpi_id, id, measured_at, value}`) through the production
  `getDriver()` singleton (the pattern
  `neo4j-bootstrap.integration.test.ts` uses — the passthrough is
  read-only and the label is unregistered, so the driver is the only
  write path, design §3.4/V-02); assert: zero measurements → empty
  payload (`trend:null, moving_average:[], anomalies:[]`); seeded set →
  `trend` present (slope per week), moving-average series, z-score
  anomalies fields; unknown/archived KPI → 404; non-UUID path id → 400.
  `afterAll` `DETACH DELETE` seeded nodes by id.
- **Verification**: `api/__tests__/kpi-trends.integration.test.ts`
  (via `bun run test:integration`)

### T-07 — kpi-sla-alignment: zod + weight bound + pin (sanctioned change ii)

- **Files** (2): `api/src/routes/kpi-sla-alignment.ts` (modify),
  `api/__tests__/kpi-sla-alignment.integration.test.ts` (new)
- **Implements**: design §4.1 (kpi-sla-alignment), §4.3, §3.3 — closes
  AC-06, AC-12 (alignment rows); serves FR-04, FR-11a
- **Complexity**: moderate
- **Blocked by**: T-01 (consumes the two alignment request schemas —
  Resolves: pass-2 N-01a), T-02, T-03
- **Blocks**: T-20
- **Steps**: Route file: replace the `if (!field)` ladder with
  `parseWith(kpiAlignmentCreateRequestSchema | slaAlignmentCreateRequestSchema,
  await readJson(req))`. The weight `[0,1]` bound is the single
  sanctioned tightening (DD-01 rule (ii)) — it lands here WITH its pin.
  Keep as-built semantics otherwise: KPI + target existence checks
  (404s), `ALIGNED_TO` edge storage, `alignment_id = elementId(r)`
  (opaque string, NO UUID guard on the DELETE param — design §3.1),
  `GET ?target_type&target_id` required else 400, `domain` branch lists
  by `domain_id` property. Test: create/list/delete both mirrors
  (kpi-alignments incl. `target_type:"domain"`; sla-alignments
  journey|activity only); weight `-0.1` and `1.1` → 400 `issues[]`;
  bad `target_type` → 400; unknown KPI/target → 404; DELETE unknown
  elementId → 404. Fixtures create their own Domain/Journey/KPI/SLA
  nodes; paired cleanup.
- **Verification**: `api/__tests__/kpi-sla-alignment.integration.test.ts`
  (via `bun run test:integration`)

### T-08 — sla-compliance: query schema + UUID-any guard + pin

- **Files** (2): `api/src/routes/sla-compliance.ts` (modify),
  `api/__tests__/sla-compliance.integration.test.ts` (new)
- **Implements**: design §4.1 (sla-compliance), §4.3, DD-04, §3.4 —
  closes AC-09; serves FR-07, FR-11a
- **Complexity**: moderate
- **Blocked by**: T-01 (consumes `slaComplianceQuerySchema` — Resolves:
  pass-2 N-01a), T-02, T-03, T-05 (breach-shape conventions shared)
- **Blocks**: T-20
- **Steps**: Route file: `window_days` via
  `parseWith(slaComplianceQuerySchema, …)`; path-id guard →
  `z.string().uuid()` (DD-04). Test: create SLAs via `POST /api/v1/slas`;
  seed deterministic `:SLABreach` node sets
  (`{sla_id, id, breach_at, severity, resolution_status, actual_value,
  target_value}`) via `getDriver()` (Neo4j — NOT the Postgres table;
  split-brain pinned per DD-05/V-02); assert all three endpoints
  (`/all`, `/:slaId`, `/domain/:domainId`) return the counting fields
  (`breaches.total/open/by_severity`) matching the seed, and
  `compliance_rate ∈ [0,100]`, `risk_score ∈ [0,100]` — do NOT assert
  the scoring formulas (implementation detail, kept free to refactor).
  Paired cleanup.
- **Verification**: `api/__tests__/sla-compliance.integration.test.ts`
  (via `bun run test:integration`)

### T-09 — roll-down: parseWith swap + P0-flow pin (sanctioned change iii)

- **Files** (2): `api/src/routes/roll-down.ts` (modify),
  `api/__tests__/roll-down.integration.test.ts` (new)
- **Implements**: design §4.1 (roll-down), §4.2 — closes AC-11, AC-12
  (roll-down rows); serves FR-09, FR-11b
- **Complexity**: complex
- **Blocked by**: T-02, T-03
- **Blocks**: T-15 (exports the seven roll-down schemas it registers —
  Resolves: C-01), T-20
- **Steps**: Route file: swap every `schema.parse(body)` →
  `parseWith(schema, body)` and bare `req.json()` → `readJson(req)`;
  **delete the pre-existing try/catch flatten mapper in
  `handleSlaDomainRollDownPost` (`roll-down.ts:1311-1320`)** — its 400
  `details` shape changes from `e.flatten()` to `issues[]` and its
  message from `"schema validation failed"` to `"invalid_payload"`;
  this is the third sanctioned contract change (DD-01 rule (iii)) and
  its pin lands in THIS task. Leave the `:1415` not-found→422 catch
  untouched. `export` the seven roll-down body schemas (for T-15). Test
  (P0 floor per Risk 3): KPI roll-down create→get→`/commit` (status
  `committed`)→`/approve` (status `approved`); OKR create→get→`/reject`;
  `GET /contributions` + `/contributions/:domainId`; table-driven zod
  rejections — `weight: -1`, `weight: 101`, missing
  `domain_assignments`, malformed `assignment_id`, and a
  `POST /roll-down/sla/domain` malformed-body row asserting the NEW
  `issues[]` shape + `invalid_payload` message. Product/program
  variants: shared rejection table only (should-level; first NFR-01
  trim lever). Always use id-suffixed GET forms (V-04 matcher shadow —
  documented, not fixed). Paired cleanup of created nodes.
- **Verification**: `api/__tests__/roll-down.integration.test.ts`
  (via `bun run test:integration`)

### Stage 2 — reshaped surfaces (route change ↔ RBAC edit, same task)

### T-10 — `GET /api/v1/domains` list (FR-10d)

- **Files** (3): `api/src/routes/domain-crud.ts` (modify — narrow:
  `handleDomainList` + its export ONLY, rest stays `_baseline`-owned),
  `api/src/router.ts` (modify — one dispatch line inside the
  `// Domain CRUD routes (US-DM-05)` block, sanctioned touch (a) §4.9,
  + import), `api/src/auth/rbac-permissions.ts` (modify — add
  `P("GET", "domains", "domain:read")` in the `── Domains ──` section)
- **Implements**: design §4.5 (row 4), §4.9, §4.10 — serves FR-10d,
  NFR-05 (feeds AC-21 domains half, pinned in T-11's test)
- **Complexity**: simple
- **Blocked by**: T-02
- **Blocks**: T-11, T-14, T-16
- **Steps**: `handleDomainList`: `MATCH (d:Domain) RETURN d.id AS id,
  d.name AS name, d.description AS description ORDER BY d.name` →
  `ok({rows})`. Dispatch: `if (sub === "domains" && method === "GET")
  return handleDomainList(req);`. RBAC entry lands in this same task
  (DD-12). No other section of either co-owned file is touched.
- **Verification**: manual: with the dev stack up, run
  `curl -s http://127.0.0.1:8787/api/v1/domains` (CLI) — expect 200
  `{"rows":[…]}` with seeded domains ordered by `name` (automated pin
  follows in T-11's test file)

### T-11 — KPI CRUD reshape + pin (sanctioned change i, KPI half)

- **Files** (4 — see file-count note): `api/src/routes/kpi-crud.ts`
  (modify), `api/src/router.ts` (modify — owned block
  `// KPI CRUD routes (KPI-SLA-02)` + imports), 
  `api/src/auth/rbac-permissions.ts` (modify — `── KPIs ──` section),
  `api/__tests__/kpi-crud.integration.test.ts` (new)
- **Implements**: design §4.3, §4.4, §4.5 (row 1), §4.6, §4.10 — closes
  AC-01, AC-02 (kpis), AC-03, AC-12 (kpi rows), AC-21 (domains half);
  serves FR-01, FR-10a, FR-11a, FR-13, FR-14
- **Complexity**: complex
- **Blocked by**: T-01, T-02, T-03 (test cleanup of `:KPI` nodes has no
  REST delete path — direct-driver cleanup needs the env fix; Resolves:
  pass-2 N-01b), T-10
- **Blocks**: T-12, T-14, T-15, T-16, T-20
- **Steps**: Route file: body handling →
  `parseWith(kpiCreateRequestSchema | kpiPatchRequestSchema,
  await readJson(req))`, delete the `if (!field)` ladders;
  `crypto.randomUUID()` → `generateId()`; path guard →
  `z.string().uuid()` (DD-04 — as-built v7-only `parseId` made v4-id
  lifecycles 400, V-01); new `handleKpiList` (§4.5 Cypher,
  `include_archived` via `parseQueryBool` ONLY — `listQuerySchema` is
  documentation, never wired); new `handleKpiGet` (archived KPIs ARE
  returned; `archived_at` tells the caller); archive + audit handlers
  move to subpaths. Router block becomes exactly design §4.4:
  `kpis` POST create / GET list; `kpis/:id` GET resource / PATCH;
  `kpis/:id/archive` POST; `kpis/:id/audit` GET — subpath regexes
  matched BEFORE the `:id` regex; the old `POST /kpis/:id` and
  `GET /kpis/:id` overloads are REMOVED (DEC-01 clean retirement, pin
  in this task). RBAC same task (DD-12): add `P("GET","kpis","kpi:read")`,
  `P("POST","kpis/:id/archive","kpi:write")`,
  `P("GET","kpis/:id/audit","kpi:read")`; remove stale
  `P("POST","kpis/:id","kpi:write")` (line ~194). Test: full lifecycle
  create→patch→archive (POST 200 not 201 — pinned; `updated_at` bump;
  404 on missing/archived; second archive 404); 400 on each missing
  required field with `issues[]` envelope; v7 nibble on new ids
  (AC-01); list ordering `created_at` DESC + `include_archived=true`
  (AC-02); detail GET, archive/audit subpaths, audit placeholder row
  (`user_id:"system"`, DEC-02), retired overloads → 404 (AC-03);
  `GET /api/v1/domains` → `{rows}` ordered by name (AC-21 half, T-10's
  endpoint). Paired cleanup.
- **Verification**: `api/__tests__/kpi-crud.integration.test.ts`
  (via `bun run test:integration`)

### T-12 — SLA CRUD reshape + pin (sanctioned change i, SLA half)

- **Files** (4 — see file-count note): `api/src/routes/sla-crud.ts`
  (modify), `api/src/router.ts` (modify — owned block
  `// SLA CRUD routes (KPI-SLA-03)`),
  `api/src/auth/rbac-permissions.ts` (modify — `── SLAs ──` section),
  `api/__tests__/sla-crud.integration.test.ts` (new)
- **Implements**: design §4.3, §4.4 (mirror), §4.5 (row 2), §4.6, §4.10
  — closes AC-02 (slas), AC-07, AC-12 (sla rows); serves FR-05, FR-10b,
  FR-11a, FR-13, FR-14
- **Complexity**: moderate
- **Blocked by**: T-01 (consumes `slaCreateRequestSchema`/
  `slaPatchRequestSchema` — Resolves: rev-3 review N-01), T-03
  (direct-driver `:SLA` cleanup — Resolves: pass-2 N-01b), T-11 (mirror
  the reviewed pattern)
- **Blocks**: T-13, T-14, T-15, T-20 (T-13 added — Resolves: N-01)
- **Steps**: Exact mirror of T-11 on the SLA surface: seven required
  fields (`slaCreateRequestSchema`), its own PATCH allow-list,
  `handleSlaList` / `handleSlaGet`, `slas/:id/archive` +
  `slas/:id/audit` subpaths, overload retirement. RBAC: add
  `P("GET","slas","sla:read")`, `P("POST","slas/:id/archive","sla:write")`,
  `P("GET","slas/:id/audit","sla:read")`; remove stale
  `P("POST","slas/:id","sla:write")` (line ~200). Test mirrors T-11's
  shape (lifecycle + negatives + list + subpaths + retired-overload
  404s + `issues[]` envelope).
- **Verification**: `api/__tests__/sla-crud.integration.test.ts`
  (via `bun run test:integration`)

### T-13 — OKR unfiltered list + parseWith + pin

- **Files** (3): `api/src/routes/okr-crud.ts` (modify),
  `api/src/router.ts` (modify — owned block `// OKR Directive routes`,
  unfiltered-list fallthrough), `api/__tests__/okr-crud.integration.test.ts` (new)
- **Implements**: design §4.5 (row 3), §4.2, §4.1 (okr-crud) — closes
  AC-10, AC-12 (okr rows), AC-21 (okr half); serves FR-08, FR-10c,
  FR-11b
- **Complexity**: complex
- **Blocked by**: T-02, T-03, T-12
- **Blocks**: T-14, T-15, T-18, T-20
- **Steps**: Route file: `parseWith` swap on the three existing zod
  schemas + `export` them (for T-15); new `handleOkrDirectiveList` with
  the predicate **byte-for-byte** from design §4.5:
  `MATCH (n:OKRDirective) WHERE NOT n.attributes_json CONTAINS '"domain_id"'
  RETURN n ORDER BY n.createdAt DESC` — bug-compatible with the Cypher
  `OkrManagement.tsx` runs today (pinned decision, req-review pass-2
  C-02; parse-based filtering explicitly rejected, design §9); returns
  `{rows:[mapped]}` while the filtered GETs keep their bare-array shape
  (asymmetry pinned, NOT harmonized — harmonizing breaks `OkrCrud.tsx`).
  NOTE the property is camelCase `n.createdAt` (`:OKRDirective` follows
  the graph-core convention — design N-01; there is no `created_at` on
  this label; fixtures and assertions must use `createdAt`). Router:
  unfiltered `GET /okr-directives` dispatches to the new handler; with
  `?domain_id=`/`?product_id=` it keeps dispatching to the as-built
  filtered handlers (AC-21 asserts this). No RBAC edit — existing
  `P("GET","okr-directives","okr:read")` already covers the unfiltered
  form (design §4.10). Test: directive + key-result CRUD with filters
  (creates return raw Node serialization — assert `properties.id` etc.,
  not the wrapper; key-result list `attributes` always `{}` — as-built
  defect pinned with a caveat comment; DELETE returns `{success:true}`
  even for unknown ids — pinned); unfiltered list: top-level directives
  only, ordered `createdAt` DESC, **including a decoy directive whose
  attribute VALUE contains the string `"domain_id"`** (must be
  excluded — pins the string-contains semantics, AC-21);
  `okr-performance?domain_id=` aggregates for a seeded domain; v7 ids;
  malformed bodies → 400 `issues[]` (was 500). Paired cleanup.
- **Verification**: `api/__tests__/okr-crud.integration.test.ts`
  (via `bun run test:integration`)

### T-14 — RBAC route-permission unit test

- **Files** (1): `api/__tests__/rbac-route-permissions.test.ts` (new)
- **Implements**: design §4.10 verification clause — serves NFR-05,
  FR-10, FR-13 (guards DD-12)
- **Complexity**: simple
- **Blocked by**: T-10, T-11, T-12, T-13
- **Blocks**: T-20
- **Steps**: Plain unit test (`*.test.ts`, runs in the `unit` CI job —
  integration runs execute with `ONELOGIN_ISSUER` unset, so no
  integration test can observe a missing permission mapping; design §8).
  Call `getRoutePermission` directly and assert: each new/changed §5
  route returns its §4.10 permission and never `null` —
  `GET kpis → kpi:read`, `POST kpis/:id/archive → kpi:write`,
  `GET kpis/:id/audit → kpi:read`, the three SLA mirrors,
  `GET domains → domain:read`, unfiltered `GET okr-directives →
  okr:read`; and the two retired overload patterns resolve per the live
  table (`POST /api/v1/kpis/:id` → `null`, same for slas).
- **Verification**: `api/__tests__/rbac-route-permissions.test.ts`
  (via `bun test`)

### Stage 3 — OpenAPI

### T-15 — OpenAPI coverage module + hook + path-enumeration test

- **Files** (3): `api/src/routes/openapi-kpi-okr.ts` (new),
  `api/src/routes/openapi.ts` (modify — import + call +
  `export` keyword on `errorEnvelopeSchema` line 53, per pinned C-01;
  nothing else), `api/__tests__/openapi.integration.test.ts` (modify)
- **Implements**: design §4.7 / DD-08 — closes AC-13; serves FR-12
- **Complexity**: complex
- **Blocked by**: T-01, T-04, T-05, T-09 (the exported schemas this task
  registers must exist and transpile — Resolves: C-01, N-01), T-11,
  T-12, T-13 (final route surface fixed)
- **Blocks**: T-20
- **Steps**: `openapi-kpi-okr.ts` exports
  `registerKpiOkrPaths(registry: OpenAPIRegistry): void`: registers the
  T-01 request/query schemas, the existing read schemas from
  `shared/src/schema/kpi-sla.ts` (documented response shapes with the
  DD-03 leniency-gap description), the schemas exported in
  T-04/T-05/T-09/T-13, and a `registerPath` entry for EVERY row of the
  design §5 table (kpis, slas, measurements, breaches, trends,
  alignments, compliance, okr-directives incl. the unfiltered list,
  key-results, okr-performance, roll-down, domains). 400/404 responses
  reference the now-exported `errorEnvelopeSchema` imported from
  `./openapi`; audit endpoints document the DEC-02 placeholder row
  shape verbatim. `openapi.ts`: two lines (import + call inside
  `getOpenApiDoc()`) + the `export` keyword — the full sanctioned §4.9
  touch. Test extension: append an `integration: `-prefixed describe
  asserting `GET /api/v1/openapi.json` contains a required-path array
  enumerated from §5 with `{param}` placeholders (mechanical from the
  six-row SLA + KPI blocks and the rest of the table).
- **Verification**: `api/__tests__/openapi.integration.test.ts`
  (via `bun run test:integration`)

### Stage 4 — exec views (owned: KpiManagement, OkrManagement)

### T-16 — KpiManagement on REST + states + tokens

- **Files** (3): `pwa/src/api.ts` (modify — narrow §4.9 touch: add
  `kpi.list()` → `GET /api/v1/kpis` and `domains.list()` →
  `GET /api/v1/domains`), `pwa/src/views/exec/KpiManagement.tsx`
  (modify), `pwa/src/views/exec/KpiManagement.module.css` (new)
- **Implements**: design §6 — serves FR-15, FR-16, UX-01/02/05 (feeds
  AC-14/15 pinned in T-17; AC-16 via conformance)
- **Complexity**: complex
- **Blocked by**: T-10, T-11
- **Blocks**: T-17, T-18 (T-18 added for symmetry — Resolves: N-01)
- **Steps**: Replace the view's `api.cypher(…)` calls with the two new
  typed client methods (zero `api.cypher` remains in the file); rows
  read snake_case `created_at` (fixes the as-built `createdAt`
  mismatch); interface types corrected accordingly. Reuse existing
  write-path methods (`api.kpi.create`, `api.kpi.createAlignment`) —
  do not duplicate. Components from the catalog only: `ViewHeader`,
  `Loading`, `ErrorState` (from `views/_shared`), `Card`, `Pill`,
  `Button`, `Modal`, `DataTable`; raw utility-class `<button>`/`<table>`
  markup replaced; tab row becomes `role="tablist"` of `Button`s with
  `aria-selected` + `aria-label="KPI management sections"`. "+ Create
  KPI" opens a catalog `Modal` form posting through `api.kpi.create`
  then reloads the list (the dangling `showCreateModal` state finally
  renders). Four states: `Loading`, `ErrorState` on fetch failure,
  NEW `data-testid="empty-state"` Card ("No KPIs defined yet — create
  the first one") when the ready list is empty, DataTable when ready.
  All styling in the new CSS module, `var(--…)` tokens only — zero
  hex/rgba/oklch literals. Focus order header → tablist → primary
  action → table via DOM order (no tabindex tricks). The `main`
  landmark is provided by the app shell (the
  `<main className={styles.main}>` wrapper in `pwa/src/App.tsx` wraps
  the routed view — Resolves: pass-2 N-02) — the view does NOT render
  its own `<main>`; AC-17's landmark check relies on the shell
  (Resolves: C-03).
- **Verification**: manual: run `bun run scripts/design-conformance.ts
  --view pwa/src/views/exec/KpiManagement.tsx` (CLI, pinned N-02 form)
  — expect exit 0 with no violations; then `cd pwa && bunx vitest run
  src/__tests__/error-scenarios/exec/kpi-management` (vitest entry
  point, per B-01 — root `bun test` cannot run pwa tests) — expect the
  existing suite green (Resolves: B-01)

### T-17 — KpiManagement jsdom pin (AC-14/AC-15)

- **Files** (1): `pwa/src/__tests__/exec-kpi-management.test.tsx` (new)
- **Implements**: design §8 (jsdom) — closes AC-14, AC-15 (KPI view);
  serves FR-15, FR-16
- **Complexity**: moderate
- **Blocked by**: T-16
- **Blocks**: T-20
- **Steps**: Mock `fetch` for `/api/v1/kpis` + `/api/v1/domains`.
  Assert: loading state renders first, then ready rows with dates
  derived from `created_at`; a fetch spy sees ZERO `/query/cypher`
  requests (safe: KpiManagement does not mount `KpiCrud` — design
  review verified); `{rows:[]}` → `empty-state` testid rendered and
  distinct; mocked 500 → `ErrorState` rendered. Follow the existing
  `error-scenarios` harness conventions for router/mount setup.
- **Verification**: `pwa/src/__tests__/exec-kpi-management.test.tsx`
  (via `cd pwa && bunx vitest run src/__tests__/exec-kpi-management.test.tsx`
  — vitest/jsdom, not `bun test`; Resolves: B-01)

### T-18 — OkrManagement on REST + states + tokens

- **Files** (3): `pwa/src/api.ts` (modify — add `okr.listDirectives()`
  → unfiltered `GET /api/v1/okr-directives`),
  `pwa/src/views/exec/OkrManagement.tsx` (modify),
  `pwa/src/views/exec/OkrManagement.module.css` (new)
- **Implements**: design §6 — serves FR-15, FR-16, UX-01/02/05
- **Complexity**: complex
- **Blocked by**: T-13, T-16 (reuse the T-16 patterns)
- **Blocks**: T-19
- **Steps**: Mirror of T-16: `api.cypher` → `api.okr.listDirectives()`
  (rows expose mapped camelCase `createdAt` — the REST list returns the
  mapped shape, design §4.5); keep `OkrPerformanceBoard` on the
  performance tab (it already uses `api.okr.getPerformance`); DROP the
  unused `OkrCrud` import; tablist `aria-label="OKR management
  sections"`; "+ Create OKR Cycle" Modal posts via
  `api.okr.createDirective` then reloads; empty state "No OKR cycles
  yet"; tokens-only CSS module. Same shell-provided `main` landmark
  note as T-16 (the `<main className={styles.main}>` wrapper in
  `pwa/src/App.tsx` — pass-2 N-02) — no view-level `<main>` (Resolves:
  C-03).
- **Verification**: manual: run `bun run scripts/design-conformance.ts
  --view pwa/src/views/exec/OkrManagement.tsx` (CLI, pinned N-02 form)
  — expect exit 0; then `cd pwa && bunx vitest run
  src/__tests__/error-scenarios/exec/okr-management` (vitest entry
  point, per B-01) — expect green (Resolves: B-01)

### T-19 — OkrManagement jsdom pin (AC-14/AC-15, strict)

- **Files** (1): `pwa/src/__tests__/exec-okr-management.test.tsx` (new)
- **Implements**: design §8 (jsdom) — closes AC-14, AC-15 (OKR view);
  serves FR-15, FR-16
- **Complexity**: moderate
- **Blocked by**: T-18
- **Blocks**: T-20
- **Steps**: Mirror of T-17 mocking unfiltered `/api/v1/okr-directives`.
  This file carries the STRICT assertions for the OKR view — the
  existing `error-scenarios/exec/okr-management` suite "stays green by
  leniency, not by design" (it stubs `/api/v1/okrs` + `/query/cypher`
  with a soft either/or; design §8/N-03): assert zero `/query/cypher`
  traffic, ready rows ordered/dated from `createdAt`, `empty-state`
  testid on `{rows:[]}`, `ErrorState` on 500.
- **Verification**: `pwa/src/__tests__/exec-okr-management.test.tsx`
  (via `cd pwa && bunx vitest run src/__tests__/exec-okr-management.test.tsx`
  — vitest/jsdom, not `bun test`; Resolves: B-01)

### Stage 5 — CI + final sweep

### T-20 — CI: postgres service + migrations + API server boot

- **Files** (1): `.github/workflows/ci.yml` (modify — `integration` job
  + one sanctioned two-line step in the `unit` job, per C-02 below)
- **Implements**: design §4.8 / DD-10 — closes AC-19, CI-gates the
  AC-14/AC-15 verification artifacts; serves FR-17, FR-18, NFR-01
  (fixes V-03)
- **Complexity**: moderate
- **Blocked by**: T-04, T-05, T-06, T-07, T-08, T-09, T-11, T-12, T-13,
  T-14, T-15, T-17, T-19 (the job must run the full new suite green)
- **Blocks**: T-21
- **Steps**: Apply the §4.8 yaml verbatim: `postgres:16-alpine` service
  (user/db `companygraph`, `pg_isready` healthcheck, port 5432);
  job-level `env: POSTGRES_URI=…` (the existing `NEO4J_*` entries
  stay); after `bun install`: (1) `cd api && bun run
  src/storage/postgres/run-migrations.ts` (resolves migrations relative
  to cwd — the `cd api` is required; logs "applied" for AC-19);
  (2) "Boot API server" step — background `bun run start` with output
  to `$RUNNER_TEMP/api-server.log`, 60×1 s healthz wait loop, then the
  HARD assert: `curl -fsS …/healthz || { echo "::error::API server
  failed to boot"; cat "$RUNNER_TEMP/api-server.log"; exit 1; }` (the
  loop alone exits 0 on timeout — the assert is load-bearing, design
  C-02 fix); (3) `bun run test:integration`; (4) **`unit` job (second
  sanctioned `ci.yml` touch — Resolves: review C-02):** after the
  existing `bun run test` step add
  `- run: bunx vitest run src/__tests__/exec-kpi-management.test.tsx src/__tests__/exec-okr-management.test.tsx`
  with `working-directory: pwa` — this CI-gates exactly the two
  AC-14/AC-15 pin files (T-17/T-19). Deliberately scoped to the two
  owned files rather than `bun run --cwd pwa test`: the legacy
  `error-scenarios` tree is un-triaged and adopting it wholesale into
  the merge gate is out of this spec's charter (gap flagged in T-21's
  consolidated report). **NFR-01 checkpoint
  (binding):** record the integration-job wall-time in the PR
  description of the first green run; if > ~4 min, trim in the design's
  order — (1) drop the roll-down should-level product/program rejection
  rows, (2) collapse per-file zod-rejection tables into one shared
  file, (3) lower the healthz wait ceiling (boot observed <5 s locally).
- **Verification**: manual: open the PR's `integration` job run in
  GitHub Actions (browser) — verify the postgres service container
  reports healthy, the migration step logs "applied", the boot step
  passes its hard healthz assert, and `kpi-measurements` +
  `sla-breaches` integration tests pass; verify the `unit` job runs the
  two exec-view vitest files green (C-02 step); record the job
  wall-time in the PR description (expect < 5 min)

### T-21 — Final validation sweep + STATUS completion

- **Files** (1): `.claude/specs/kpi-okr-governance/STATUS.md` (modify)
- **Implements**: spec completion gate — closes AC-16, AC-17, AC-18,
  AC-20; serves FR-16, FR-18
- **Complexity**: moderate
- **Blocked by**: T-20
- **Blocks**: —
- **Steps**: Run the full sweep and record per-AC verification
  artifacts in STATUS.md (`verified_at` + `verification_artifact` —
  the completion hook blocks otherwise): (1) `bun test` +
  `bun run test:integration` green, PLUS the pwa vitest run
  `cd pwa && bunx vitest run src/__tests__/exec-kpi-management.test.tsx
  src/__tests__/exec-okr-management.test.tsx
  src/__tests__/error-scenarios/exec/kpi-management
  src/__tests__/error-scenarios/exec/okr-management` green — neither
  root command touches the AC-14/AC-15 artifacts (Resolves: B-01).
  The sweep is scoped to the two OWNED `error-scenarios/exec` subtrees
  (Resolves: pass-2 C-01 — the parent directory also holds `finance/`,
  `ops/`, `people/`, `risk/`, `transform/` suites this spec does not
  own; completion must not gate on them. Historical note: the
  2026-07-04 execution ran the full tree, which happened to be green —
  see STATUS.md; this narrowed form is binding for any re-run);
  (2) AC-20 — run
  `bun run test:integration` TWICE back-to-back against the same
  running stack; (3) AC-16 — both pinned `--view` conformance
  invocations (N-02 form) exit 0; (4) AC-17 — keyboard walk on both
  views per the requirements repro (Tab order header → tabs → primary
  action → list, visible focus ring, Enter opens the create modal,
  devtools a11y pane shows the shell-provided `main` landmark
  (the `<main className={styles.main}>` wrapper in `pwa/src/App.tsx`,
  verified at authoring — observation only, this task edits NO source
  files; were the wrap ever needed it belongs in T-16/T-18; Resolves:
  C-03, pass-2 N-02) + labeled tab group); (5) AC-18 — deep-link Cmd+R
  reload on both routes; (6) confirm no `api.cypher` remains in either
  owned view (`grep -n "api.cypher" pwa/src/views/exec/KpiManagement.tsx
  pwa/src/views/exec/OkrManagement.tsx` → no matches). Update STATUS.md
  Execution → complete with the results table and the consolidated-
  report flags (DEC-01/DEC-02, V-02 split-brain, V-04 shadow,
  `KpiCrud.tsx` internal cypher call, FR-10c string-contains predicate,
  and — Resolves: review C-02 — the pwa CI gap: only the two exec-view
  pin files are CI-gated by T-20's unit-job step; the wider pwa vitest
  suite, incl. the legacy `error-scenarios` tree, still runs locally
  only and is left for a downstream spec to adopt).
- **Verification**: manual: with the dev stack up, run
  `bun run test:integration` twice consecutively (CLI) — expect exit 0
  both runs with no unique-constraint or leftover-fixture failures
  (AC-20); keyboard + browser checks per steps (4)–(5) observed passing

## Traceability

| AC | Closed by | | FR | Implemented by |
|----|-----------|-|----|----------------|
| AC-01 | T-11 | | FR-01 | T-11 |
| AC-02 | T-11, T-12 | | FR-02 | T-04 |
| AC-03 | T-11 | | FR-03 | T-06 |
| AC-04 | T-04 | | FR-04 | T-07 |
| AC-05 | T-06 | | FR-05 | T-12 |
| AC-06 | T-07 | | FR-06 | T-05 |
| AC-07 | T-12 | | FR-07 | T-08 |
| AC-08 | T-05 | | FR-08 | T-13 |
| AC-09 | T-08 | | FR-09 | T-09 |
| AC-10 | T-13 | | FR-10a–d | T-11, T-12, T-13, T-10 |
| AC-11 | T-09 | | FR-11a | T-01, T-06, T-07, T-08, T-11, T-12 |
| AC-12 | T-04, T-05, T-07, T-09, T-11, T-12, T-13 | | FR-11b | T-02, T-04, T-05, T-09, T-13 |
| AC-13 | T-15 | | FR-12 | T-15 |
| AC-14 | T-17, T-19 | | FR-13 | T-11, T-12 |
| AC-15 | T-17, T-19 (+ existing error-scenarios, T-16/T-18) | | FR-14 | T-04, T-05, T-11, T-12 |
| AC-16 | T-16, T-18, T-21 | | FR-15 | T-16, T-18 |
| AC-17 | T-21 | | FR-16 | T-16…T-19, T-21 |
| AC-18 | T-21 | | FR-17 | T-20 |
| AC-19 | T-20 | | FR-18 | T-03, T-04, T-05, T-20, T-21 |
| AC-20 | T-21 | | NFR-05 (§4.10) | T-10…T-14 |
| AC-21 | T-11 (domains), T-13 (okr) | | | |

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour (api/shared) | the task's listed test (`bun test <path>` / `bun run test:integration`) |
| tasks with behaviour (pwa) | the task's listed test via `cd pwa && bunx vitest run <path relative to pwa/>` — never root `bun test` (Resolves: B-01) |
| T-16, T-18 | `bun run scripts/design-conformance.ts --view <view file>` (pinned N-02 form) + the view's existing `error-scenarios` suite via `cd pwa && bunx vitest run src/__tests__/error-scenarios/exec/<view>` |
| T-11, T-12, T-13 | re-run `api/__tests__/rbac-route-permissions.test.ts` once it exists (T-14) — route/table pairing must not drift |
| T-20 | GitHub Actions `integration` job green + `unit` job's exec-view vitest step green (C-02); wall-time recorded (NFR-01 checkpoint) |
| final task (T-21) | `bun test` + `bun run test:integration` ×2 (needs Neo4j + Postgres) + `cd pwa && bunx vitest run src/__tests__/exec-kpi-management.test.tsx src/__tests__/exec-okr-management.test.tsx src/__tests__/error-scenarios/exec/kpi-management src/__tests__/error-scenarios/exec/okr-management` (Resolves: B-01; scoped to owned subtrees per pass-2 C-01) + full AC sweep (AC-16…AC-20 manual repros) |
