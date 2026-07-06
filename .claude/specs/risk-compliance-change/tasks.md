---
feature: "risk-compliance-change"
created: "2026-07-06"
author: "spec-author (blueprint: business-modeling-studio; backfill of _baseline FR-09)"
status: "revised"
size: "large"
reviewing_requirements_status: "approved (re-review, 0 blockers)"
reviewing_design_status: "approve (pass 1, 0 blockers, 3 concerns folded here)"
reviewing_tasks_status: "revise (pass 1, 2 blockers, 4 concerns, 3 nits — all addressed)"
total_tasks: 12
---

# Tasks: risk-compliance-change

## Design-review concerns folded into this plan

`review-design.md` (pass 1, verdict **approve**, 0 blockers) left three
concerns and two nits, all sanctioned for the tasks author to absorb
without a re-review. Each is dispositioned here and pinned into the task
that owns it — no design change, no AC renumber.

| Finding | Disposition | Locked in task |
|---------|-------------|----------------|
| **C-01** — FR-09's "byte-identical envelope" justification is inaccurate; the router's `ZodError` backstop (`router.ts:304-309`) already maps issues identically to `parseWith` (`_helpers.ts:87-89`), so the 400 envelope is unchanged today | FR-09 is executed as **maintainability consolidation onto the single `parseWith` channel**, not a wire-shape fix. The pin tests (AC-11) assert `400` + `code:"invalid_payload"` + `issues[]` **present** — they do **not** claim the conversion changed the shape. The `parseWith` swap must leave the emitted 400 byte-for-byte identical (that is the pin). | T-02 (steps), T-06/T-07 (AC-11 assertion scope) |
| **C-02** — DD-07 is decidable now: `bad_request` is **confirmed absent** from the `ERROR_CODES` tuple (`errors.ts`), yet `change-requests.ts:187` calls `error(400, 'bad_request', …)`. `error()` is typed `code: ErrorCode`, so this is a **latent type error** surviving only because `bun build --no-bundle` strips (never checks) types. | DD-07 is promoted from conditional to **decided**: T-05 adds `bad_request` to `ERROR_CODES` **additively** alongside `invalid_transition`, in the same task. Both new codes must clear the OpenAPI `z.enum(ERROR_CODES)` registration (`openapi.ts:116`) and the `story-openapi.integration.test.ts`-style membership assertion pattern. The emitted code is **not** renamed (AC-11 carve-out). | T-05 (steps + verification) |
| **C-03** — Postgres `bigint` (COUNT) / `numeric` (AVG) aggregates deserialize as **strings** under the `pg` driver; AC-03 assertions on `total_risks`/`avg_severity` will trip on `"3"` vs `3`. | The AC-03 aggregation assertions use `Number(row.total_risks)` / string-equality, matching how `sla-compliance.integration.test.ts` handles its Postgres counts. Pinned as a binding note in T-04. | T-04 (steps) |
| **N-01** — moving `createChangeRequestSchema` to shared must preserve `dependencyImpacts: z.array(...).default([])` (a runtime default, not just a type) so AC-05's "`dependency_impacts` defaults to `[]`" still holds | The schema move in T-06 copies the `.default([])` verbatim; T-03's create-round-trip asserts the `[]` default survives. | T-06 (steps), T-03 (assertion) |
| **N-02** — `risk-compliance-change` is absent from the blueprint Feature Inventory table | Bookkeeping only; the backfill is directly commissioned by the governance-backfill brief and mirrors XD-16. T-12 records it in the consolidated-report flags; no inventory edit (blueprint is frozen). | T-12 (flags) |

## Task-review findings folded into this revision

`review-tasks.md` (pass 1, verdict **revise**) raised 2 blockers, 4 concerns,
3 nits. All are addressed here; no stable ID renumbered. Where each is resolved:

| Finding | Disposition | Fixed in |
|---------|-------------|----------|
| **B-01** — T-08's AC-11 assertion for `compliance-rules` asserted `issues[]`, but the as-built route emits `details.fieldErrors` (a `{field: string[]}` object) from a `safeParse` hand-rolled envelope (`compliance-rules.ts:47-51`, `:91-96`); it is **not** in the FR-09 `parseWith` conversion list (only `risk-register` + `change-requests` are). Asserting `issues[]` would fail the as-built pin, breaking verify-then-fix. | AC-11's compliance-rules pin now asserts the **actual** as-built shape: `400 invalid_payload` with `details.fieldErrors` (object of field → messages), **not** `issues[]`. compliance-rules is **not** added to the `parseWith` conversion (out of FR-09/§8 scope). A carve-out note distinguishes it from the two Postgres files' `issues[]` shape. | T-08 (step 3), Reading guide, Traceability |
| **B-02** — evaluate reads the rule id from `?id=` query **only** (`compliance-rules.ts:131`); a body id is ignored, yielding `400 "Missing rule id"`. The plan loosened it to "body/query," which would mis-author the AC-09 pin. | T-08 step 3 now states precisely: evaluate is `POST /api/v1/compliance/rules/evaluate?id=<ruleId>` — id is a **query param**, never a body field. "body/" dropped everywhere it described the evaluate id source. | T-08 (step 1, step 3) |
| **C-01** — `handleRiskAggregationSummary` (`risk-register.ts:366-386`) runs `COUNT(*) … FROM risk_register` with **no WHERE/GROUP BY** — table-global. Exact-count assertions collide with AC-15's dirty-stack rerun. | T-01's AC-03 step pins `summary` to **shape + relational/monotonic** checks (all keys present; `critical+high+medium+low === total`; buckets are numbers), reserving exact-count assertions for the `GROUP BY` aggregations filtered to a seeded domain/owner. Seed-count isolation is structurally impossible for `summary`. | T-01 (AC-03 step) |
| **C-02** — T-01's AC-03 step omitted the status buckets + `max_severity` the as-built summary also returns. | T-01 now lists the full summary key set: `open_risks/mitigating_risks/accepted_risks/resolved_risks`, `max_severity`, `avg_severity`, the four severity buckets, `escalated_risks`, `domains_affected`, `owners_involved`. | T-01 (AC-03 step) |
| **C-03** — T-05's `bun run typecheck` "expect exit 0 (latent type error now resolvable)" implies typecheck verifies the `bad_request` fix; `bun build --no-bundle` strips types and never surfaced the gap, so exit 0 proves nothing. | T-05 verification keeps the `bun -e` membership check as the **binding** signal; the typecheck line is downgraded to "still exit 0 — regression guard only; it never surfaced the latent gap." | T-05 (verification) |
| **C-04** — AC-14/T-11 is a manual GitHub-Actions inspection with no durable artifact in STATUS. | T-12 step 4 now requires the AC-14 `verification_artifact` to be the concrete Actions **run URL** plus the `run-migrations.ts` log excerpt showing 001/002/005, so the manual verification is pinned to a durable reference. | T-12 (step 4) |
| **N-01** — T-05 numbered before T-01 reads awkwardly vs. "tasks execute top-to-bottom." | Reading-guide note added: task numbers are **authoring order**; **execution order is the stage headers + explicit `Blocked by`/`Blocks`** (T-05 is Stage 0 and blocks T-03; T-01/T-02 do not depend on it). | Reading guide |
| **N-02** — confirm T-05 is a hard predecessor of T-03 even under the FR-11 off-ramp. | Already handled — T-03 carries `Blocked by: T-05`, and the off-ramp text keeps `invalid_transition` unadded if FR-11 descopes. One-line confirmation added to T-03's off-ramp. | T-03 (off-ramp) |
| **N-03** — T-09 fixture didn't state the exact node labels/properties the three report Cypher queries match on, risking a false-pass "empty" branch. | T-09 now cross-references the exact labels + property names each report's WHERE clause matches (from `risk-compliance.ts`), so the fixture provably lands in the **populated** branch. | T-09 (steps) |

## Reading guide

- **Order (Resolves: N-01)**: task **numbers are authoring order, not execution
  order** — T-05 is numbered before T-01 but is Stage 0. Execution order is the
  **stage headers plus the explicit `Blocked by` / `Blocks` edges**: T-05 (Stage
  0) blocks T-03; T-01/T-02 do **not** depend on T-05 and may run first. Read
  the dependency edges, not the numeric order, to sequence work. No out-of-order
  execution relative to the declared edges.
- **Verify-then-fix (design §4.1, governing rule)**: for every route, the
  integration test that **pins** the as-built accepted-payload contract is
  authored to pass **before** the gap fix is applied, and must still pass
  after — that is the guard against silent tightening. Concretely, each
  route's test file is written and its as-built pins made green **first**,
  then the same task applies the fix (`parseWith`, `generateId`, transition
  guard, path-id) and re-runs the file. The `must` pins FR-01…FR-07 are pure
  pinning; FR-08…FR-12 are the fixes each pinned test then re-asserts.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook (`.claude/hooks/spec-completion-check.sh`) blocks STATUS.md
  updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h with one
  judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task run `bun run typecheck`; after
  tasks that ship behaviour also run the listed test. This spec touches **no**
  `pwa/` file (design §6), so no `design-conformance.ts` run applies.
- **Integration-test naming (binding)**: `scripts/test-integration.sh` selects
  by test-name pattern `^integration:` from `api/` cwd. Every `describe` in a
  new `*.integration.test.ts` file MUST be prefixed `integration: ` or the
  suite silently skips it. The env is root-anchored by that script, so test
  files stay env-loading-free and use the production `getDriver()` (Neo4j) and
  `query()` (Postgres) singletons.
- **Store of record per surface (design §1, pinned)**: `risk-register` +
  `change-requests` → **Postgres** (migrations 001/002/005); `risk-compliance`
  + `compliance-rules` → **Neo4j**. Postgres tests import `query` from
  `api/src/storage/postgres/client`; Neo4j tests use `getDriver()` from
  `api/src/neo4j/driver` (the pattern `sla-compliance.integration.test.ts`
  uses).
- **Same-task pairings (binding, from design §4.1 verify-then-fix + §8):**
  1. Each route's fix lands in the **same task** as the pin test that guards
     it did not tighten the contract: FR-09 `parseWith` + FR-10 `generateId`
     → T-02 (risk) / T-03 (change); FR-11 transition guard → T-03; FR-12
     path-id → T-08.
  2. The `ERROR_CODES` additions (`invalid_transition` for FR-11, `bad_request`
     for the confirmed C-02 type-gap) land in **one task** (T-05) **before**
     the change-request patch guard (T-03) references `invalid_transition`.
  3. The OpenAPI registration (FR-08) and its shared-schema module land
     together in T-06/T-07 so the routes and OpenAPI share one zod source
     (design DD-05).
- **`should` off-ramps (requirements C-03 rule)**: FR-10 (UUIDv7 ids, AC-12)
  and FR-11 (transition guard, AC-08) are `should`. Under single-shot mode
  (XD-17) there is no mid-run user gate. If either proves risky at execution
  (FR-11's guard would reject a real as-built transition path a consumer
  depends on; FR-10's switch would break a consumer — none known in-repo),
  it is **dropped**: its AC is **struck (not failed)**, the retained as-built
  behavior (free-form status / v4 ids) is documented as a known gap in the
  consolidated report (T-12), and the corresponding test asserts the retained
  behavior instead. The `must` ACs (AC-01…AC-07, AC-09…AC-11, AC-13…AC-15)
  have no off-ramp.
- **Router co-ownership (design §4.7, requirements C-04)**: `api/src/router.ts`
  is **partially** owned — exactly the four comment-anchored dispatch blocks
  (`// Compliance rule routes`, `// Change request routes`, `// Risk register
  routes`, `// Risk aggregation routes` + `// Risk & Compliance routes`). The
  ontology block (RDF/query/rollback/node-labels/edge-types) is **interleaved
  between** them and owned **elsewhere** — never edited by this spec. FR-12
  (T-08) is the only functional router edit; all other blocks are read-only
  pins. Conflicts resolve by section ownership, not last-writer-wins.

---

## Task list

### Stage 0 — additive error codes (no route behaviour change; unblocks the guard)

### T-05 — Additive `ERROR_CODES`: `invalid_transition` + `bad_request`

- **Files** (1): `api/src/errors.ts` (modify)
- **Implements**: design §3.6, §4.2 (DD-07 promoted per review C-02), §4.4 —
  serves FR-11 (feeds AC-08) and the confirmed `bad_request` type-gap
  (feeds AC-01/AC-05 empty-patch pins, AC-11 carve-out)
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-03 (references `invalid_transition`), T-06/T-07 (OpenAPI
  `z.enum(ERROR_CODES)` must include both new members)
- **Steps**:
  1. Append `"invalid_transition"` to the `ERROR_CODES` tuple (§3.6 —
     additive, non-breaking per NFR-03; no reorder, no removal).
  2. Append `"bad_request"` to the same tuple. This is the **decided** C-02
     fix: `bad_request` is confirmed absent (`errors.ts` grep) yet already
     emitted at `change-requests.ts:187`; adding it makes that as-built call
     type-correct **without changing the emitted code** (AC-11 carve-out — the
     empty-patch code stays `bad_request`, it is NOT converged to
     `invalid_payload`).
  3. Update any exhaustiveness switch / assertion co-located in `errors.ts`
     that enumerates the tuple (if present) so it still compiles with the two
     new members. Both members flow automatically into the OpenAPI error enum
     (`openapi.ts:116` `z.enum(ERROR_CODES)`) — no `openapi.ts` edit here.
- **Note**: neither code is renamed anywhere; `invalid_transition` is reached
  only from T-03's guard, `bad_request` only from the pre-existing empty-patch
  line. If FR-11 is descoped (`should` off-ramp), `invalid_transition` is
  **not** added; `bad_request` is added **regardless** (it fixes a latent
  type error, not a `should` feature).
- **Verification (Resolves: C-03)**: the **binding** signal is the membership
  check — manual: from repo root run
  `bun -e 'import {ERROR_CODES} from "./api/src/errors"; console.log((ERROR_CODES as readonly string[]).includes("invalid_transition"), (ERROR_CODES as readonly string[]).includes("bad_request"))'`
  (CLI) — expect `true true` (or `false true` if FR-11 is descoped). Then
  `bun run typecheck` (CLI) — expect **still exit 0**, as a **regression guard
  only**: `typecheck` is `bun build --no-bundle`, which strips (never checks)
  types and so **never surfaced** the latent `change-requests.ts:187`
  `bad_request` gap — exit 0 was true before this task too, so typecheck does
  **not** verify the `bad_request` fix. The `bun -e` membership check is the
  only thing that proves the codes were added.

---

### Stage 1 — Postgres route pins + fixes (verify-then-fix, same task)

### T-01 — risk-register: pin as-built contract (CRUD, filters, aggregations, validation)

- **Files** (1): `api/__tests__/risk-register.integration.test.ts` (new)
- **Implements**: design §4.5, §5, §7 (risk pins) — closes AC-01, AC-02,
  AC-03, AC-04 (as-built half); serves FR-01, FR-02, FR-03, FR-14
- **Complexity**: complex
- **Blocked by**: —
- **Blocks**: T-02 (the fix task re-runs this file), T-06 (OpenAPI path
  enumeration mirrors the pinned surface)
- **Steps**: New Postgres integration test, every `describe` prefixed
  `integration: `. Import `query` from `../src/storage/postgres/client`; fetch
  `http://127.0.0.1:8787/api/v1/...` (booted server, same convention as
  `sla-compliance.integration.test.ts`). Seed rows via `POST /api/v1/risk-register`
  (exercises id-gen + validation), tracking returned ids; `afterAll` runs
  `DELETE FROM risk_register WHERE id = ANY($1)` on the tracked ids (design
  §4.8). Assert, all as-built:
  - **AC-01** create→get→patch→delete round-trip; `POST` omitting
    `escalation_level` stores `1` (`risk-register.ts:151` `|| 1`); `GET /:id`
    unknown → 404; empty `PATCH` → `400 invalid_payload "No valid fields to
    update"` (`:266` — pinned code, NOT routed through `parseWith`, C-01);
    second `DELETE` → 404; `DELETE` success → 200 `{message}`.
  - **AC-02** `GET /risk-register` returns `{data:[...]}` ordered by
    `(likelihood*impact) DESC, created_at DESC`; each documented filter
    (`owner`, `domain`, `status`, `category`, `risk_type`,
    `linked_entity_type`, `linked_entity_id`, `escalation_level` as `>=`
    threshold) narrows the set.
  - **AC-03** five aggregation endpoints (`domain`, `owner`, `category`,
    `risk-type`, `summary`) each return the as-built rollup:
    `domain`/`owner` include `escalated_risks` (`escalation_level >= 3`),
    `category`/`risk-type` do not.
    **`summary` full key set (Resolves: C-02):** `summary` (shape
    `ok({data: result[0]})`, `risk-register.ts:366-386`) exposes the **complete**
    envelope — assert **all** of: the four severity buckets (`critical_risks >=16`,
    `high_risks 9..15`, `medium_risks 4..8`, `low_risks <4`), the four **status
    buckets** (`open_risks`, `mitigating_risks`, `accepted_risks`,
    `resolved_risks`), `avg_severity`, `max_severity`, `escalated_risks`,
    `domains_affected`, `owners_involved`. Under-asserting the shape defeats the
    point of a read-and-pin backfill.
    **`summary` is table-global — assert shape + relations, not exact counts
    (Resolves: C-01):** `handleRiskAggregationSummary` runs
    `COUNT(*) … FROM risk_register` with **no WHERE/GROUP BY** (`:383`), so its
    totals include any pre-existing rows. AC-15 (T-12) reruns
    `test:integration` **twice against a dirty local stack**, so an equality
    assertion on `total_risks` / bucket counts would be non-deterministic. Pin
    `summary` to: (a) **all keys present**; (b) each bucket is a number
    (post-`Number(...)`); (c) the **relational invariant**
    `critical_risks + high_risks + medium_risks + low_risks === total_risks`
    (and, similarly, the four status buckets sum to `total_risks`). Seed-count
    isolation is structurally impossible for `summary` — do **not** assert
    `total_risks === <seeded N>`. Reserve **exact-count** assertions for the
    `domain`/`owner`/`category`/`risk-type` **`GROUP BY`** aggregations, which
    are filtered to a seeded key (assert the seeded domain/owner row's counts).
    **Binding (design C-03):** Postgres `bigint`/`numeric` aggregates
    round-trip as **strings** under `pg` — assert with `Number(row.total_risks)`
    / string equality, never `toBe(3)` against `"3"`.
  - **AC-04** validation: `likelihood`/`impact`/`escalation_level` outside
    `[1,5]`, bad `status`/`trend`/`risk_type` enum, and any missing required
    field (`name`/`owner`/`domain`/`likelihood`/`impact`/`status`/`trend`)
    each → `400 invalid_payload` with `details.issues[]`. These assertions are
    authored to hold **both** before and after T-02's `parseWith` swap
    (verify-then-fix pin).
  - **AC-15 seed** (isolation): fixtures use fresh ids; the file is
    order-independent and re-runnable (paired cleanup).
- **Verification**: `api/__tests__/risk-register.integration.test.ts`
  (via `bun run test:integration`; needs Postgres up)

### T-02 — risk-register: parseWith + UUIDv7 (apply fixes, re-run pin)

- **Files** (1): `api/src/routes/risk-register.ts` (modify)
- **Implements**: design §4.2 (FR-09), §4.3 (FR-10) — closes AC-11 (risk
  half), AC-12 (risk id); serves FR-09, FR-10
- **Complexity**: moderate
- **Blocked by**: T-01 (pin must be green first — verify-then-fix)
- **Blocks**: T-06 (imports the moved schemas)
- **Steps**:
  1. **FR-09 (C-01 framing — maintainability consolidation, no wire change):**
     replace the two bare `.parse()` sites — `createRiskSchema.parse` (`:127`)
     and `updateRiskSchema.parse` (`:164`) — with `parseWith(schema, body)`,
     importing `parseWith` from `./_helpers`. The emitted 400 stays
     byte-identical (the router's `ZodError` backstop already produced the
     same `issues[]`); this routes both through one channel. **Preserve
     exactly:** the empty-patch guard at `:266`
     (`error(400, 'invalid_payload', 'No valid fields to update')`) is **not**
     routed through `parseWith` — it is not a schema failure (C-01).
  2. **FR-10 (`should`):** remove `import { v4 as uuidv4 } from 'uuid';`
     (`:2`); add `import { generateId } from '../ids';`; replace `uuidv4()`
     (`:129`) with `generateId()`. The `uuid` package **stays** in
     `api/package.json` (permanent consumer `api/src/ids.ts:1`, N-03).
  3. Re-run T-01's file: every as-built pin must still pass (no tightening).
     Add the AC-12 assertion (created risk id version nibble is `7`; no
     `uuidv4` import remains in the file) here or in T-01's file — pin it in
     `risk-register.integration.test.ts`.
- **Off-ramp (FR-10 `should`):** if the `generateId` switch would break a
  consumer (none known), drop step 2 — the file keeps v4, AC-12 is struck (not
  failed), recorded in T-12's flags.
- **Verification**: `api/__tests__/risk-register.integration.test.ts`
  (via `bun run test:integration`) — the AC-11 zod-rejection cases and the
  AC-12 v7-nibble/no-`uuidv4`-import assertions pass alongside the unchanged
  AC-01…AC-04 pins

### T-03 — change-requests: pin as-built + parseWith + UUIDv7 + transition guard

- **Files** (2): `api/__tests__/change-requests.integration.test.ts` (new),
  `api/src/routes/change-requests.ts` (modify)
- **Implements**: design §3.2/3.3, §4.2 (FR-09), §4.3 (FR-10), §4.4 (FR-11),
  §4.5 — closes AC-05, AC-06, AC-07, AC-08, AC-11 (change half), AC-12
  (change/review/sign-off ids); serves FR-04, FR-05, FR-09, FR-10, FR-11, FR-14
- **Complexity**: complex
- **Blocked by**: T-05 (the patch guard references the `invalid_transition`
  code)
- **Blocks**: T-07 (imports the moved schemas)
- **Steps**: **Pin first (verify-then-fix), then fix in the same task.**
  - **Test file** (`integration: ` prefixes; Postgres via `query` from
    `../src/storage/postgres/client`; server-fetch convention; tracked-id
    cleanup `DELETE FROM change_requests WHERE id = ANY($1)` — FK cascade
    removes reviews/sign-offs):
    - **AC-05** create→get→patch→delete; `POST` forces `status:"draft"`
      (`:124`); `draftSnapshot`/`baseSnapshot`/`diff` persist as JSONB and
      round-trip; `dependencyImpacts` **defaults to `[]`** on create (the
      `.default([])` preserved by T-07's schema move — Resolves: N-01);
      camelCase body → snake_case column mapping (design §3.3); `DELETE`
      cascades reviews + sign-offs (assert via `query` on `reviews`/`sign_offs`
      by `change_request_id`).
    - **AC-06** `GET /change-requests` returns `{data,limit,offset}`;
      `status`/`author` filters + `limit`/`offset` paging; each row carries
      `reviews` + `signOffs` arrays.
    - **AC-07** `POST …/:id/reviews` (201; `reviewer_role` ∈
      {entity_manager, domain_manager, technical_lead}; `status` ∈
      {approved, rejected, changes_requested} — the **zod** vocabulary, DD-06,
      NOT the wider DB `CHECK` that also allows `pending`) and
      `POST …/:id/sign-offs` (201; `signer_role` ∈ {entity_manager,
      domain_manager}; `status` ∈ {signed, declined}; `signed_at` set iff
      `status="signed"` `:247`); both → 404 when the parent CR is unknown.
    - **AC-08** transition guard: `PATCH` with an allowed transition
      (`draft→pending_review`) succeeds; a disallowed jump (`draft→released`)
      → `400 invalid_transition` with `{from,to}` details; a non-`status`
      patch and an identity `status` patch always succeed. Authored to run
      before the guard (asserting free-form) is **not** required — instead the
      guard test is authored to the DEC-01 allowed set and passes only after
      step-3 lands. Pin the empty-patch guard: empty `PATCH` → `400 bad_request
      "No valid fields to update"` (`:187` — as-built code, kept; AC-11
      carve-out).
    - **AC-11** zod-rejection to `POST`/`PATCH`/reviews/sign-offs →
      `400 {error:{code:"invalid_payload",…,details.issues[]}}` via `parseWith`;
      as-built-valid payloads still succeed.
    - **AC-12** created change-request/review/sign-off ids have version nibble
      `7`; no `uuidv4` import remains in the file.
  - **Route fixes** (apply after the create/review/sign-off pins are green;
    re-run to prove no tightening):
    1. **FR-09:** convert the four `.parse()` sites (`createChangeRequestSchema`
       `:109`, `updateChangeRequestSchema` `:139`, `createReviewSchema` `:215`,
       `createSignOffSchema` `:238`) to `parseWith(schema, body)` (import from
       `./_helpers`). Leave the `:187` empty-patch `bad_request` guard as-is
       (C-01).
    2. **FR-10 (`should`):** remove `import { v4 as uuidv4 } from 'uuid';`
       (`:2`); import `generateId` from `../ids`; replace the four `uuidv4()`
       calls (`:111`, `:222`, `:245`, and the CR id site) with `generateId()`.
    3. **FR-11 (`should`):** insert the transition guard in
       `handleChangeRequestPatch` **after** the existing-row fetch (`:141`)
       and **before** the dynamic SET, only when `validated.status !==
       undefined`, per design §4.4. Add a module-local `isAllowedTransition(from,
       to)` implementing the DEC-01 set exactly: `draft→pending_review`;
       `pending_review→{approved,rejected,draft}`; `approved→released`;
       `rejected→draft`; identity always allowed. Disallowed → `error(400,
       'invalid_transition', "change request cannot move from '<from>' to
       '<to>'", {from, to})`. Reviews/sign-offs stay **advisory** (DEC-02 —
       creating one does NOT auto-transition; documented, not changed).
- **Off-ramps (`should`):** FR-10 → as T-02. FR-11 → if the guard rejects a
  real as-built transition path a consumer depends on, drop step 3 and the
  `invalid_transition` code (T-05); AC-08 struck (not failed); free-form status
  recorded in T-12's flags.
- **Dependency confirmation (Resolves: N-02):** T-05 is a **hard predecessor**
  of T-03 (see `Blocked by: T-05`) — step 3's guard references
  `invalid_transition`, which T-05 adds. The FR-11 off-ramp keeps this
  consistent: if FR-11 is descoped, step 3 is dropped **and** `invalid_transition`
  is never added in T-05, so T-03 no longer references a missing code. The
  executor must treat T-05 as a hard predecessor whenever step 3 is retained.
- **Verification**: `api/__tests__/change-requests.integration.test.ts`
  (via `bun run test:integration`; needs Postgres up)

---

### Stage 2 — Neo4j route pins + compliance-rule path fix

### T-08 — compliance-rules: path-id threading + pin (router + handlers)

- **Files** (3): `api/src/routes/compliance-rules.ts` (modify),
  `api/src/router.ts` (modify — owned `// Compliance rule routes` block only),
  `api/__tests__/compliance-rules.integration.test.ts` (new)
- **Implements**: design §4.5.1 (FR-12, DD-04, C-05), §4.7 (router
  co-ownership), §5 — closes AC-09, AC-11 (compliance half); serves FR-06,
  FR-12, FR-14
- **AC-11 carve-out (Resolves: B-01):** compliance-rules pins the
  **`details.fieldErrors`** envelope (hand-rolled `safeParse` at
  `compliance-rules.ts:47-51`/`:91-96`), which is **distinct** from the
  `details.issues[]` shape the two Postgres files carry via `parseWith`. This
  route is **not** converted to `parseWith` (out of FR-09/§8 scope).
- **AC-09 note (Resolves: B-02):** evaluate's rule id is a `?id=` **query
  param** only (`compliance-rules.ts:131`), never a body field.
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-06 (compliance/rules stays present in the OpenAPI enumeration)
- **Steps**:
  1. **Handlers** (`compliance-rules.ts`): change the three detail handler
     signatures — `handleComplianceRule`, `handlePatchComplianceRule`,
     `handleDeleteComplianceRule` — to accept `id: string`, and drop the
     `url.searchParams.get("id")` + "Missing rule id" 400 guard from each
     (`:64-71`, `:80-88`, `:108-115`). Leave `handleEvaluateComplianceRule`
     **untouched** — it keeps reading its rule id from `?id=` (`:131`), because
     it is dispatched as the fixed literal `POST /compliance/rules/evaluate`,
     not a `/rules/:id/evaluate` path (C-05).
  2. **Router** (`// Compliance rule routes` block, owned per §4.7): the
     `ruleOne` match already computes `const id = decodeURIComponent(ruleOne[1]!)`
     but discards it — thread it into the three detail calls, mirroring
     `handleChangeRequestGet(req, id)`: `handleComplianceRule(req, id)`,
     `handlePatchComplianceRule(req, id)`, `handleDeleteComplianceRule(req,
     id)`. Touch **no other** router block; the interleaved ontology block is
     not owned. The `evaluate` literal dispatch line is unchanged. The
     undocumented `?id=` query form is retired (DEC-03) — no alias kept; no
     path string changes, so RBAC rows (`compliance:*`) are unaffected (NFR-05).
  3. **Test file** (`integration: ` prefixes; Neo4j via `getDriver()`):
     - **AC-09** create→get→patch→delete through the **path** routes
       `/api/v1/compliance/rules/:id`: seed via `POST /compliance/rules`, then
       `GET /compliance/rules/<id>` returns the rule (this GET returned
       `400 "Missing rule id"` **before** the fix — assert it now returns the
       rule); unknown id → 404; invalid create body → 400. **Evaluate id is a
       query param, not a body field (Resolves: B-02):** evaluate stays at its
       fixed literal path `POST /api/v1/compliance/rules/evaluate?id=<ruleId>`
       — the handler reads **only** `url.searchParams.get("id")`
       (`compliance-rules.ts:131`) and ignores any body id. Author the request
       with the id as a **query param**: known `?id=` → evaluation result,
       unknown `?id=` → 404, missing `?id=` → `400 invalid_payload "Missing rule
       id"`. Do **not** put the rule id in the JSON body (it would 400).
     - **AC-11 (Resolves: B-01) — assert the actual as-built `fieldErrors`
       shape, NOT `issues[]`:** zod-rejection to `POST /compliance/rules` (body
       validated by `complianceRuleSchema`) → `400 invalid_payload` with
       **`details.fieldErrors`** — an object of `{ field: string[] }` — because
       `handleCreateComplianceRule` (`compliance-rules.ts:47-51`) and
       `handlePatchComplianceRule` (`:91-96`) call `safeParse` and hand-roll
       `error(400, "invalid_payload", …, { fieldErrors: parsed.error.flatten().fieldErrors })`.
       This route is **not** in the FR-09 `parseWith` conversion list (only
       `risk-register` + `change-requests` are, per FR-09/§4.2/§8), and
       `safeParse` never throws so the router's `ZodError` backstop is never
       reached. Assert `code === "invalid_payload"` and `details.fieldErrors`
       **present** (object keyed by field name). Do **NOT** assert
       `details.issues[]` for compliance-rules — the code cannot emit it, and
       converting this route to `parseWith` is an out-of-scope contract change
       not sanctioned by FR-09/§8. This `fieldErrors` shape is **distinct** from
       the `issues[]` shape the two Postgres files carry (AC-11 halves in
       T-02/T-03).
     - **AC-15 seed**: track created rule ids; `afterAll`
       `MATCH (n:_ComplianceRule) WHERE n.id IN $ids DETACH DELETE n`.
- **Verification**: `api/__tests__/compliance-rules.integration.test.ts`
  (via `bun run test:integration`; needs Neo4j up)

### T-09 — risk-compliance: pin three reports over a seeded subgraph (read-only)

- **Files** (1): `api/__tests__/risk-compliance.integration.test.ts` (new)
- **Implements**: design §3.5, §4.5, §7 — closes AC-10; serves FR-07, FR-14
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-06 (the three report paths mirror the OpenAPI enumeration)
- **Steps**: New Neo4j integration test (`integration: ` prefixes; `getDriver()`
  write session for fixtures — the reports are read-only, so no route write
  path exists). Seed a minimal process subgraph whose shape is **traced to the
  exact labels/relationships/properties each report's WHERE clause matches
  (Resolves: N-03)** so the fixture provably lands in the **populated** branch
  (not the empty-collection false-pass). From `risk-compliance.ts`:
  - **regulated-activity-inventory** (`:20-27`): matches
    `(d:Domain)<-[:PART_OF]-(j:UserJourney)<-[:PART_OF]-(a:Activity)` where
    `a.regulatory_tags IS NOT NULL AND size(a.regulatory_tags) > 0`, then
    `UNWIND a.regulatory_tags`. Seed a `Domain`←(`PART_OF`)`UserJourney`←
    (`PART_OF`)`Activity` with `regulatory_tags: ['GDPR']` (list property, not
    scalar) so the domain × `GDPR` cell is non-zero.
  - **sod-violations** (`:79-87`): matches
    `(a1:Activity)-[:CONFLICTS_WITH]->(a2:Activity)`, `(a1)<-[:EXECUTES]-(r1:Role)`,
    `(a2)<-[:EXECUTES]-(r2:Role)` with `r1.name = r2.name`. Seed **two** distinct
    `Activity` nodes joined by a **directed** `CONFLICTS_WITH` (a1→a2), each
    `EXECUTES`-linked (`Role`→`Activity` direction) to a `Role` with the **same
    `name`** (a single shared Role node or two Roles sharing a `name` value).
  - **third-party-register** (`:116-124`): matches
    `(s:System {is_third_party: true})`, optionally
    `(a:Activity)-[:USES_SYSTEM]->(s)` and `(s)<-[:PART_OF]-(d:Domain)`. Seed a
    `System` with **`is_third_party: true`** (boolean, exact match) plus
    `vendor`, `contract_end`, `dpa_signed`, `data_classification` props; link an
    `Activity`-(`USES_SYSTEM`)→`System` so `critical_journey_count > 0`.
  Assert each
  report's **as-built envelope** (design §4.5, B-02):
  - `GET /risk-compliance/regulated-activity-inventory` → populated
    `{domains:[…], regulations:[…], matrix:[{domain, <reg>:n}]}`.
  - `GET /risk-compliance/sod-violations` → `{violations:[…], count:N}`.
  - `GET /risk-compliance/third-party-register` → `{register:[…], count:N}`.
  - **Empty-graph (AC-10, per-report shapes, NFR-04):** against a
    name-scoped empty/unmatched slice, inventory →
    `{domains:[], regulations:[], matrix:[]}` (**no `count`** —
    `risk-compliance.ts:59-63`); sod-violations → `{violations:[], count:0}`
    (`:100`); third-party-register → `{register:[], count:0}` (`:138`).
    Assert empty arrays on all three and `count===0` **only** on the two that
    expose `count` — invent no `count` on the inventory.
  - **AC-15 seed**: track created node ids; `afterAll`
    `MATCH (n) WHERE n.id IN $ids DETACH DELETE n`.
- **Note**: `risk-compliance.ts` gets **no code change** (read-and-pin) unless
  this test surfaces a defect (design §8); if one is found, the fix lands here
  with its pin.
- **Verification**: `api/__tests__/risk-compliance.integration.test.ts`
  (via `bun run test:integration`; needs Neo4j up)

---

### Stage 3 — OpenAPI coverage (shared schemas + registration)

### T-06 — Shared `risk-change.ts` schemas (move inline zod → shared, preserve defaults)

- **Files** (2): `shared/src/schema/risk-change.ts` (new),
  `api/src/routes/risk-register.ts` (modify — import moved schemas)
- **Implements**: design §4.6, DD-05 — serves FR-08 (feeds AC-13); N-01
- **Complexity**: moderate
- **Blocked by**: T-02 (risk-register fixes settled before its schemas move),
  T-05 (error codes exist for the OpenAPI enum)
- **Blocks**: T-07 (change-request schemas join the same module), T-10
  (OpenAPI registration consumes this module)
- **Steps**: Create `shared/src/schema/risk-change.ts` (mirroring
  `shared/src/schema/kpi-sla.ts`). Move the **risk** inline schemas
  (`createRiskSchema`, `updateRiskSchema`) verbatim from `risk-register.ts`
  into it as named exports, plus a `riskReadSchema` covering the 18 columns
  (design §3.1); add the three report response schemas
  (`regulatedActivityInventorySchema`, `sodViolationsSchema`,
  `thirdPartyRegisterSchema`) matching the as-built envelopes (design §4.5).
  `risk-register.ts` imports `createRiskSchema`/`updateRiskSchema` from
  `@shared/schema/risk-change` instead of defining them inline (identical
  schemas — no behavior change; re-run T-01 to confirm). en-US identifiers;
  zod only.
- **Verification**: `api/__tests__/risk-register.integration.test.ts`
  (via `bun run test:integration`) — unchanged green proves the schema move is
  behavior-neutral; plus `bun run typecheck` exit 0

### T-07 — change-request schemas → shared `risk-change.ts` (preserve `.default([])`)

- **Files** (2): `shared/src/schema/risk-change.ts` (modify),
  `api/src/routes/change-requests.ts` (modify — import moved schemas)
- **Implements**: design §4.6, DD-05, N-01 — serves FR-08 (feeds AC-13)
- **Complexity**: moderate
- **Blocked by**: T-03 (change-request fixes settled), T-06 (module exists)
- **Blocks**: T-10
- **Steps**: Move the **change** inline schemas from `change-requests.ts` into
  `shared/src/schema/risk-change.ts` as named exports:
  `changeRequestCreateSchema`, `changeRequestPatchSchema`,
  `reviewCreateSchema`, `signOffCreateSchema`, plus read schemas
  (`changeRequestReadSchema`, `reviewReadSchema`, `signOffReadSchema`).
  **Binding (Resolves: N-01):** `changeRequestCreateSchema` MUST keep
  `dependencyImpacts: z.array(...).default([])` — the runtime default is
  behavior AC-05 relies on, not just a type. `change-requests.ts` imports
  these instead of defining them inline (identical). Re-run T-03 to confirm
  the `[]` default and all pins survive.
- **Verification**: `api/__tests__/change-requests.integration.test.ts`
  (via `bun run test:integration`) — unchanged green (esp. the `[]` default
  assertion) proves the move is behavior-neutral; plus `bun run typecheck`

### T-10 — OpenAPI registration + path-enumeration test

- **Files** (2): `api/src/routes/openapi.ts` (modify),
  `api/__tests__/openapi.integration.test.ts` (modify)
- **Implements**: design §4.6, DD-05 — closes AC-13; serves FR-08
- **Complexity**: complex
- **Blocked by**: T-06, T-07 (the shared schemas must exist and transpile),
  T-08 (compliance/rules surface stable), T-09 (report shapes stable)
- **Blocks**: T-11 (CI runs the extended test), T-12
- **Steps**: In `openapi.ts`, following the `for (const method of …)` registry
  pattern (`openapi.ts:446-468`), register from the T-06/T-07 shared schemas:
  - `/api/v1/risk-register` (GET, POST), `/api/v1/risk-register/{id}`
    (GET, PATCH, DELETE), and the five
    `/api/v1/risk-register/aggregation/{domain,owner,category,risk-type,summary}`
    (GET).
  - `/api/v1/change-requests` (GET, POST), `/api/v1/change-requests/{id}`
    (GET, PATCH, DELETE), `/api/v1/change-requests/{id}/reviews` (POST),
    `/api/v1/change-requests/{id}/sign-offs` (POST).
  - `/api/v1/risk-compliance/{regulated-activity-inventory,sod-violations,third-party-register}`
    (GET).
  Response envelopes mirror the as-built wrappers (`{data:[…]}` / bare /
  `{data,limit,offset}`) — wrap `riskReadSchema` etc. in the observed
  envelope; do **not** impose `{rows}` (NFR-04). `compliance/rules` is already
  registered (`openapi.ts:497-530`) and stays. Extend
  `api/__tests__/openapi.integration.test.ts` with an `integration: `-prefixed
  assertion enumerating the required path list (risk-register CRUD + 5
  aggregations, change-requests CRUD + reviews + sign-offs, 3 risk-compliance
  reports, compliance/rules already-present set) — **AC-13**.
- **Verification**: `api/__tests__/openapi.integration.test.ts`
  (via `bun run test:integration`) — the enumerated paths (incl. all newly
  registered ones and the retained compliance/rules set) are present

---

### Stage 4 — CI verification + final sweep

### T-11 — CI: verify Postgres migrations + risk/change tests run (expected no-op)

- **Files** (1): `.github/workflows/ci.yml` (verify; edit **only** if
  verification finds migrations/env missing — expected no-op)
- **Implements**: design §4.8, DD-09 — closes AC-14; serves FR-13, FR-14
- **Complexity**: simple
- **Blocked by**: T-01, T-03, T-08, T-09, T-10 (the full new suite must exist
  to run green)
- **Blocks**: T-12
- **Steps**: Verify-first (DD-09). The `integration` job already provisions
  `postgres:16-alpine` (`ci.yml:68-73`), sets `POSTGRES_URI` (`:87`), runs
  `cd api && bun run src/storage/postgres/run-migrations.ts` (`:94` — which
  reads **every** sorted `*.sql`, so 001/002/005 are already applied), boots
  the API server, and runs `bun run test:integration` (`:111`). Confirm on a PR
  run that: the `postgres` service reports healthy; the migrate step logs
  001/002/005 applied (or already-applied); the new `risk-register` +
  `change-requests` Postgres suites run green. **Only if** the risk/change
  tables turn out un-migrated or env-unwired for CI does this task add the
  minimal wiring; the expectation is **zero** `ci.yml` edits. No new service
  container (the `kpi-okr-governance` backfill already added Postgres — reuse).
- **Verification**: manual: open the PR's `integration` job run in GitHub
  Actions (browser) — verify the `postgres` service container reports healthy,
  the `run-migrations.ts` step logs migrations 001/002/005 applied (or
  already-applied), and the `risk-register`/`change-requests` integration
  tests pass; expect no `ci.yml` diff

### T-12 — Final validation sweep + STATUS completion

- **Files** (1): `.claude/specs/risk-compliance-change/STATUS.md` (modify)
- **Implements**: spec completion gate — closes AC-15; records the
  consolidated-report flags; serves FR-14
- **Complexity**: moderate
- **Blocked by**: T-11
- **Blocks**: —
- **Steps**: Run the full sweep and record per-AC verification artifacts in
  STATUS.md (`verified_at` + `verification_artifact` — the completion hook
  blocks otherwise):
  1. `bun run typecheck` exit 0; `bun test` green (unit — incl. the extended
     openapi path enumeration if unit-runnable, else via integration).
  2. **AC-15** — with the `bun run dev` stack up (Neo4j + Postgres), run
     `bun run test:integration` **twice** back-to-back against the same stack;
     expect exit 0 both runs, no unique-constraint or leftover-fixture failures
     in the risk/change/compliance/risk-compliance suites (isolation/idempotence).
  3. Confirm the four new integration files + the extended openapi test all
     pass (AC-01…AC-14) and the fixes are pinned (no `uuidv4` import in the two
     route files; `invalid_transition`/`bad_request` in `ERROR_CODES`;
     `GET /compliance/rules/<id>` returns the rule).
     **AC-14 durable artifact (Resolves: C-04):** because AC-14 is verified by
     manual GitHub-Actions inspection (T-11) with no reproducible local
     artifact, record its `verification_artifact` in STATUS.md as the concrete
     **Actions `integration`-job run URL** plus the `run-migrations.ts` **log
     excerpt** showing migrations 001/002/005 applied (or already-applied). Under
     single-shot mode (XD-17, no interactive gate) this gives the completion hook
     a durable reference rather than an un-pinned "manual" attestation.
  4. Update STATUS.md Execution → complete with the results table and the
     **consolidated-report flags**: DEC-01 (transition guard on a
     previously-unconstrained field — any caller relying on arbitrary status
     writes breaks; none in-repo); DEC-02 (reviews/sign-offs advisory, no
     auto-transition); DEC-03 (`?id=` query form retired); DEC-04 (no
     risk/change audit trail); any `should` off-ramp taken (FR-10 v4 retained /
     FR-11 free-form status retained → the corresponding AC struck-not-failed);
     and — per design-review N-02 — that this backfill ran **outside** the
     blueprint Feature Inventory table (bookkeeping gap, blueprint frozen).
- **Verification**: manual: with the dev stack up, run
  `bun run test:integration` twice consecutively (CLI) — expect exit 0 both
  runs with no unique-constraint or leftover-fixture failures in the
  risk/change/compliance suites (AC-15)

---

## Traceability

| AC | Closed by | | FR | Implemented by |
|----|-----------|-|----|----------------|
| AC-01 | T-01 | | FR-01 | T-01 |
| AC-02 | T-01 | | FR-02 | T-01 |
| AC-03 | T-01 | | FR-03 | T-01 |
| AC-04 | T-01 (+ T-02 parseWith) | | FR-04 | T-03 |
| AC-05 | T-03 | | FR-05 | T-03 |
| AC-06 | T-03 | | FR-06 | T-08 |
| AC-07 | T-03 | | FR-07 | T-09 |
| AC-08 | T-03 (+ T-05 code) | | FR-08 | T-06, T-07, T-10 |
| AC-09 | T-08 | | FR-09 | T-02, T-03 |
| AC-10 | T-09 | | FR-10 | T-02, T-03 |
| AC-11 | T-02, T-03 (`issues[]` via `parseWith`), T-08 (`fieldErrors`, B-01 carve-out) | | FR-11 | T-05, T-03 |
| AC-12 | T-02, T-03 | | FR-12 | T-08 |
| AC-13 | T-10 | | FR-13 | T-11 |
| AC-14 | T-11 | | FR-14 | T-01, T-03, T-08, T-09, T-12 |
| AC-15 | T-12 (+ isolation in T-01/T-03/T-08/T-09) | | | |

Every AC has a closing task; every FR an implementing task. FR-10/FR-11 are
`should` with the off-ramp above (their ACs — AC-12/AC-08 — struck-not-failed
if descoped). The confirmed C-02 `bad_request` addition (T-05) has no owning
AC of its own — it fixes a latent type-gap under the AC-01/AC-05 empty-patch
pins and the AC-11 carve-out; it is tracked in T-12's flags.

**AC-11 shape split (Resolves: B-01).** AC-11 spans **two distinct error-envelope
shapes**, pinned to what the as-built code actually emits: `risk-register` +
`change-requests` (Postgres) carry `details.issues[]` via the FR-09 `parseWith`
conversion; `compliance-rules` (Neo4j) carries `details.fieldErrors` from its
hand-rolled `safeParse` envelope and is **not** converted (out of FR-09/§8
scope). The tasks assert each route's real shape. Requirements AC-11's blanket
"`issues[]` via the shared `parseWith` channel across all four files" is
**inaccurate for compliance-rules** — a one-line requirements carve-out would
align the wording, but that is a re-review-budget call for the orchestrator; at
the task level, no pin asserts a shape the code cannot produce.

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| T-01 | `api/__tests__/risk-register.integration.test.ts` via `bun run test:integration` (Postgres up) |
| T-02 | re-run T-01's file — as-built pins stay green after `parseWith`/`generateId` |
| T-03 | `api/__tests__/change-requests.integration.test.ts` via `bun run test:integration` (Postgres up) |
| T-05 | `bun -e` `ERROR_CODES` membership check + `bun run typecheck` |
| T-06, T-07 | re-run the affected route's integration file — schema move is behavior-neutral |
| T-08 | `api/__tests__/compliance-rules.integration.test.ts` via `bun run test:integration` (Neo4j up) |
| T-09 | `api/__tests__/risk-compliance.integration.test.ts` via `bun run test:integration` (Neo4j up) |
| T-10 | `api/__tests__/openapi.integration.test.ts` via `bun run test:integration` |
| T-11 | GitHub Actions `integration` job green; migrations 001/002/005 logged; expected no `ci.yml` diff |
| final task (T-12) | `bun run typecheck` + `bun test` + `bun run test:integration` **×2** (needs Neo4j + Postgres) + STATUS.md completion with per-AC artifacts and consolidated-report flags |
