---
feature: "key-activity-optimizer"
created: "2026-07-04"
revised: "2026-07-05"
author: "spec-author"
status: "draft"
revision: 3
reviewing_requirements_revision: 2
reviewing_design_revision: 4
size: "medium"
total_tasks: 20
---

# Tasks: key-activity-optimizer

> Revision 3 — realigned to **design revision 4** (2026-07-05, which traces
> **requirements revision 2**, approved 2026-07-05). Ground truth changed since
> revision 2: the implementation of T-01..T-16 has **landed on disk** (files
> carry `key-activity-optimizer T-xx` tags; every test file of design §8
> exists — re-verified 2026-07-05). Revision 2's task bodies are therefore
> compressed to as-built records with their verification, and the **residual
> work is four new tasks T-17..T-20** implementing design §1.2's three
> conformance deltas (Δ1 handoff non-empty guard, Δ2 isolated-activity
> depth-0, Δ3 catalog `DataTable` extension per DD-11). Task IDs T-01..T-16
> are stable — none renumbered, none deprecated; one citation corrected
> (T-01's verification path is the as-built `shared/__tests__/key-activity.test.ts`,
> not the never-created `shared/src/schema/__tests__/` path).

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`); no out-of-order execution. T-01..T-16 are
  **landed as-built** (status line per task); only T-17..T-20 remain to
  execute.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook blocks STATUS.md updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one
  judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. Tasks touching
  `pwa/src/views/` or `pwa/src/components/` additionally run
  `bun run scripts/design-conformance.ts --view <file>` for **every** touched
  `.tsx` and `.module.css` (one invocation each).
- Integration tests (`*.integration.test.ts`) need Neo4j
  (`bun test:integration` after `bun run dev`); unit/component tests run under
  `bun test`.

## Residual work — the three §1.2 deltas (and the OQ-A gate)

| Δ | What | Owner task(s) | Gate |
|---|------|---------------|------|
| Δ1 | FR-04 empty-set handoff rule — the as-built `disjoint()` (`api/src/derive/key-activity-score.ts:174-177`) treats an empty set as disjoint, so a roleless/systemless activity spuriously receives handoffs | T-17 | none — execute |
| Δ2 | FR-03 isolated-activity rule — the as-built `recordPath` (`key-activity-score.ts:96-102`) records length-1 paths, so an isolated activity gets `longestChainDepth 1` instead of `0` | T-18 | none — execute |
| Δ3 | FR-12 catalog `DataTable` extension (DD-11; supersedes DD-10) — the as-built `KeyActivityBoard.tsx:271-340` renders its own inline `<table>` | T-19, T-20 | **OQ-A** — see below |

**OQ-A gate (binding):** design rev 4 follows requirements rev 2 FR-12
("inventing a non-catalog table is not an option") via DD-11 — extend the
catalog `DataTable` additively and refactor the shipped board onto it. The
user has previously approved BOTH the rev-2 requirements and the earlier
design whose DD-10 blessed the in-view table, so one artifact must give.
**T-19 and T-20 execute only if the user confirms DD-11 at the design-rev-4
gate.** If the user instead amends FR-12 to bless the as-built in-view sort:
mark T-19/T-20 **deprecated** here (do not renumber), record the FR-12
amendment in requirements.md, and the as-built T-14 board is final — zero
code churn. Do not resolve OQ-A silently in either direction.

## Pinned decisions — executed as-built

The decisions revision 2 pinned from `review-design.md` (pass 2, approve) have
all **landed**; recorded here so execution history stays traceable:

| Decision | As-built evidence |
|----------|-------------------|
| final-review C-01 — `unmark` rides **raw `fetch` + `res.ok`**, never `json<T>` (204 no-body would throw in `res.json()` and spuriously roll back a successful unmark); shared `json<T>` (`pwa/src/api.ts:49`) not modified | `pwa/src/api.ts:387` `keyActivities` block; AC-10 test mocks fetch with a real `new Response(null, {status:204})` |
| final-review C-02 — journey **aggregated** in query 1 + lowest-`id` pick (multi-journey-parent activity → one row); scorer de-dupes activities by id defensively | `api/src/storage/key-activities.ts:87-100`; `key-activity-score.ts:187-193` |
| final-review N-02 — unmark of unmarked skips statement 2 entirely: `204`, attributes **and** `updatedAt` untouched (true no-op) | `api/src/storage/key-activities.ts:306-311` |
| pass-2 C-02 — `coalesce(a.createdAt, "~")` sentinel + `id` total tiebreak fallback | read query (§4.2); scorer sort (`key-activity-score.ts` rank pass) |
| pass-2 C-03 — scoped-set threading (`opts.scoped`) so a mark runs `scopedNodeIds` once | `key-activities.ts:64`, `:197` |
| cold-pass B-01 — `getModel` gate first; empty scoped set → `200 rows:[]`, never 404 | `key-activities.ts:63`; scores handler |

## Deviations from requirements (orchestrator: land as errata, no ID renumbering)

| Requirement text | Executed as | Why | Source |
|------------------|-------------|-----|--------|
| AC-14 `manual: run … design-conformance.ts …` | **CLI** verification (`bun run scripts/design-conformance.ts --view …` — deterministic exit code) | Deterministic script with an exit code (verified `--view` flag), not a hand walk | requirements AC-14, design §8 |
| Requirements NFR-01 scoping wording | Scoping bounds the **Activity set + intra-scope `PRECEDES`** only; `EXECUTES`/`USES_SYSTEM` reads to **shared** Role/System deliberately unfiltered (never in the scoped set; filtering would zero every handoff) | NFR-01 rev-2 wording + design DD-02 agree; recorded so no implementer "fixes" it backwards | design DD-02 |
| OQ-1 (budgets 20 nodes/1000/4 s), OQ-2 (constant weights `{1,1,1}`), OQ-3 (betweenness) | Executed as the recorded design defaults (DD-03, DD-09, §4.3 caps — as-built `key-activity-score.ts:50-55`) | One-line/additive changes if the user prefers otherwise. **Orchestrator may still surface OQ-1/2/3.** | design DD-03, DD-09, §4.3 |

## Task list — landed as-built (T-01..T-16)

Each task below is **landed** (design §1.2 ground truth); the Verification
entry is the as-built test that proves it. Re-run the listed tests during the
final sweep; do not re-implement.

### T-01 — Key-activity zod schemas (shared)

- **Files** (1): `shared/src/schema/key-activity.ts` (new)
- **Implements**: design §3.2, §3.3, §5 — supports FR-02..FR-08, FR-10; owns
  the camelCase wire shape (DD-06)
- **Complexity**: moderate
- **Blocked by**: — · **Blocks**: T-03, T-04, T-07, T-08, T-13
- **Steps** (as-built): `subScoresSchema` (three `z.number().min(0).max(1)`),
  `keyActivityMarkSchema` (`marked: z.literal(true)`, `markedAt` ISO,
  `scoreSnapshot: subScoresSchema.extend({composite})`, `rank` positive int),
  `activityScoreRowSchema` (id/name/journeyId·Name nullable/rank/composite/
  scores/evidence blocks/`key` nullable), `keyActivityScoresSchema`
  (**`rows`** field pinned — §3.3 — plus `meta{activityCount, hasCycle,
  truncated?, truncationReason?, weights}`). No recommendation field
  (NFR-04); mark/unmark have **no request body** (§3.2); `createdAt` never in
  the wire shape.
- **Verification**: `shared/__tests__/key-activity.test.ts` (as-built path —
  corrected from revision 2's phantom `shared/src/schema/__tests__/`);
  `bun run typecheck`.
- **Status**: landed as-built.

### T-02 — Model-scoped subgraph read (`getModel` gate + `scopedNodeIds`)

- **Files** (1): `api/src/storage/key-activities.ts` (new — `readModelSubgraph`)
- **Implements**: design §4.2, DD-02, DD-08 — closes AC-01 (read half);
  supports FR-01, NFR-01
- **Complexity**: complex
- **Blocked by**: — · **Blocks**: T-04, T-05
- **Steps** (as-built): `getModel` gate first (`:63` — unknown model →
  `404 model_not_found`; empty scoped set → valid empty subgraph, never 404);
  `scopedNodeIds` (`model-workspace-core` FR-18) imported, never
  re-implemented, threadable via
  `opts.scoped` (`:64`); activities-in-scope query with **aggregated**
  journeys + lowest-`id` pick (`:87-100`), `coalesce(a.createdAt,"~")`
  sentinel, **unfiltered** shared Role/System reads (DD-02(c));
  `PRECEDES` with both endpoints scoped, self-loops excluded, `DISTINCT`;
  carries `attributesById` for the live-mark attach. `NODE_LABELS`/
  `EDGE_ENDPOINTS` untouched (NFR-02, AC-17); generic primitives untouched
  (FR-09).
- **Verification**: `api/__tests__/key-activity-scores.integration.test.ts`
  (read shape, unknown-model 404, empty-model 200, multi-journey activity
  appears once) and
  `api/__tests__/key-activity-scope-authz.integration.test.ts`
  (two-model isolation, cross-scope `PRECEDES` excluded).
- **Status**: landed as-built.

### T-03 — Pure scoring module (Neo4j-free)

- **Files** (2): `api/src/derive/key-activity-score.ts` (new),
  `api/__tests__/key-activity-score.test.ts` (new)
- **Implements**: design §4.1, §4.3, §4.4, DD-01, DD-03 — closes AC-02,
  AC-03, AC-04, AC-05 (unit half); supports FR-02..FR-05, NFR-04, NFR-05
- **Complexity**: complex
- **Blocked by**: T-01 · **Blocks**: T-04, T-11, T-17, T-18
- **Steps** (as-built): pure `scoreActivities(sg)` (DD-01, no Neo4j);
  duplicate-id + self-loop/duplicate-edge input guards (`:187-207`);
  betweenness via the reused `buildGraphologyGraph`
  (`api/src/analytics/graph.ts:42`, not edited) with
  `{getEdgeWeight: null}`, normalised by model max, all-zero → all 0;
  budgeted DFS critical path (caps 20 nodes/1000/4 s, `:50-52`), cycle-safe,
  truncation surfaced; handoff density over distinct cleaned-edge
  neighbours with the mutual-pair pin; composite with `DEFAULT_WEIGHTS`
  `{1,1,1}` (`:55`), rank desc, tie `createdAt`→`id`.
- **Verification**: `api/__tests__/key-activity-score.test.ts` (hub/leaf
  centrality, cycle + depth-cap truncation, handoff boundary vs all-shared,
  mutual-pair, composite ties, duplicate-id collapse, no recommendation
  field); `bun test`.
- **Status**: landed as-built — **except Δ1 (empty-set handoff) and Δ2
  (isolated-activity depth), fixed by T-17 and T-18 below.**

### T-04 — Scores orchestrator + live-mark attach

- **Files** (1): `api/src/storage/key-activities.ts` (extend — `computeScores`)
- **Implements**: design §4.4 — closes AC-01 (compute half); supports FR-01,
  FR-06
- **Complexity**: moderate
- **Blocked by**: T-02, T-03 · **Blocks**: T-05, T-08
- **Steps** (as-built): `readModelSubgraph` → `scoreActivities` → attach
  `row.key` from parsed `attributes_json`, validated by
  `keyActivityMarkSchema`; any failing stored value (incl. `marked:false`) →
  `key: null` + `warn` log, node untouched (read tolerance, `:168-174`);
  `opts.scoped` threading.
- **Verification**: `api/__tests__/key-activity-scores.integration.test.ts`
  (marked activity shows live scores + `key` snapshot; hand-planted
  `marked:false` → `key:null`).
- **Status**: landed as-built.

### T-05 — Mark / unmark — attribute-preserving lock-first write

- **Files** (1): `api/src/storage/key-activities.ts` (extend —
  `markActivity`, `unmarkActivity`)
- **Implements**: design §4.5, DD-05 — closes AC-06, AC-07 (storage half);
  supports FR-07, FR-08, FR-09, NFR-02, NFR-03
- **Complexity**: complex
- **Blocked by**: T-04 · **Blocks**: T-06, T-08
- **Steps** (as-built): gate sequencing `model_not_found` →
  `activity_not_found`; server-side score snapshot via `computeScores`
  (threaded scoped set, `:197`; best-effort point-in-time — not
  tx-consistent with the write, by design); lock-first read-merge-write in
  one `executeWrite` (`:232` — no-op `SET` takes the exclusive lock before
  the read; merge in JS, no APOC); siblings preserved byte-for-byte
  (AC-06); unmark deletes only the key, unmark-of-unmarked skips statement 2
  entirely — `204`, `updatedAt` untouched (`:306-311`, NFR-03); re-mark
  writes a fresh snapshot (XD-03). Generic `createNode`/`patchNode`
  byte-for-byte unchanged (FR-09, AC-17).
- **Verification**: `api/__tests__/key-activity-mark.integration.test.ts`
  (sibling preservation, 404 sequencing, byte-equal restore, true no-op
  `updatedAt`, fresh re-mark snapshot); `bun test:integration`.
- **Status**: landed as-built.

### T-06 — Import-interaction test + schema-contingency documentation

- **Files** (1): `api/__tests__/key-activity-import.integration.test.ts` (new)
- **Implements**: design §4.6, DD-04, DD-05 — closes AC-06
  (import-round-trip half); pins requirements risk row 7 / FR-09
  qualification
- **Complexity**: moderate
- **Blocked by**: T-05 · **Blocks**: —
- **Steps** (as-built): no code change to import/`upsertNode` (DD-04); test
  proves pre-mark snapshot re-imports without the mark, post-mark snapshot
  restores it with point-in-time evidence; docstring + storage-module
  comment pin the permissive-`Activity`-schema assumption.
- **Verification**: `api/__tests__/key-activity-import.integration.test.ts`;
  `bun test:integration`.
- **Status**: landed as-built.

### T-07 — Additive error code

- **Files** (1): `api/src/errors.ts` (modify)
- **Implements**: design §3.4 — closes part of FR-10
- **Complexity**: simple
- **Blocked by**: T-01 · **Blocks**: T-08, T-10
- **Steps** (as-built): one additive code `activity_not_found` (404,
  `errors.ts:64`); `model_not_found` reused (`:37`), never re-added;
  exhaustiveness assertion intact; reachable from mark + unmark (no
  reserved code).
- **Verification**: `api/__tests__/key-activity-openapi.integration.test.ts`
  (code in `ERROR_CODES` + the OpenAPI enum + returned by a real request);
  `bun run typecheck`.
- **Status**: landed as-built.

### T-08 — Route handlers + router dispatch

- **Files** (2): `api/src/routes/key-activities.ts` (new),
  `api/src/router.ts` (modify)
- **Implements**: design §4.7 — supports FR-06, FR-07, FR-08, FR-10
- **Complexity**: complex
- **Blocked by**: T-04, T-05, T-07 · **Blocks**: T-09, T-10, T-11, T-12
- **Steps** (as-built): three handlers on the `{error:{code,message,details?}}`
  envelope (`_helpers.ts`); `GET` scores (`200`; empty model → `200 rows:[]`,
  never 404), `POST` mark (`200` rank row), `DELETE` unmark (`204`); 404s
  sequenced `model_not_found` → `activity_not_found`; no request bodies;
  dispatch block in `api/src/router.ts:416`, specific-before-parameterized;
  auth stays in the central gate — no per-route check (NFR-06).
- **Verification**: `api/__tests__/key-activity-scores.integration.test.ts`
  + `api/__tests__/key-activity-mark.integration.test.ts` +
  `api/__tests__/key-activity-scope-authz.integration.test.ts`;
  `bun run typecheck`.
- **Status**: landed as-built.

### T-09 — Route-permission mapping + RBAC role grant

- **Files** (2): `api/src/auth/rbac-permissions.ts` (modify),
  `api/src/scripts/seed-rbac-roles.ts` (modify)
- **Implements**: design §4.8 — closes AC-08 (authz half); supports FR-11
- **Complexity**: moderate
- **Blocked by**: T-08 · **Blocks**: T-12
- **Steps** (as-built): three `ROUTE_PERMISSIONS` rows
  (`rbac-permissions.ts:301-303` — `key_activity:read` on the GET,
  `key_activity:write` on mark/unmark); no route `public`;
  `business_architect` gains both permissions
  (`seed-rbac-roles.ts:120-121`, idempotent MERGE — role created by
  `model-workspace-core`, only its list extended).
- **Verification**: `api/__tests__/key-activity-scope-authz.integration.test.ts`
  (403 without `key_activity:write`, 200/204 with; `getRoutePermission`
  never `null`; role resolves both; no `isPublicRoute`);
  `bun run typecheck`.
- **Status**: landed as-built.

### T-10 — OpenAPI registration

- **Files** (1): `api/src/routes/openapi.ts` (modify)
- **Implements**: design §4.9 — closes AC-08 (openapi half); supports FR-10
- **Complexity**: moderate
- **Blocked by**: T-07, T-08 · **Blocks**: —
- **Steps** (as-built): three paths + the T-01 schemas registered from the
  same zod definitions (`openapi.ts:835-858`); GET documents
  `404: model_not_found`; mark/unmark document the combined
  `model_not_found | activity_not_found` (story-route convention, `:742`).
- **Verification**: `api/__tests__/key-activity-openapi.integration.test.ts`;
  `bun test:integration`.
- **Status**: landed as-built.

### T-11 — Scores/centrality/critical-path/handoff integration tests

- **Files** (4): `api/__tests__/key-activity-scores.integration.test.ts`,
  `api/__tests__/key-activity-centrality.integration.test.ts`,
  `api/__tests__/key-activity-critical-path.integration.test.ts`,
  `api/__tests__/key-activity-handoff.integration.test.ts` (all new)
- **Implements**: design §8, §4.2–§4.4 — closes AC-01, AC-02, AC-03, AC-04,
  AC-05 (integration half); supports NFR-04, NFR-05
- **Complexity**: complex
- **Blocked by**: T-08 · **Blocks**: —
- **Steps** (as-built): API-only seeding (design §8 — models + domains +
  journeys + activities + edges routes; no direct-driver seeding); full
  ranked-shape + meta + evidence assertions; unknown-model 404 vs
  empty-model 200; multi-journey de-dupe; hub/leaf centrality; cycle +
  depth-cap truncation; handoff boundary evidence; composite tie order;
  no recommendation field.
- **Verification**: `api/__tests__/key-activity-scores.integration.test.ts`
  + `api/__tests__/key-activity-centrality.integration.test.ts` +
  `api/__tests__/key-activity-critical-path.integration.test.ts` +
  `api/__tests__/key-activity-handoff.integration.test.ts`;
  `bun test:integration`.
- **Status**: landed as-built. **T-17/T-18 add the Δ1/Δ2 fixture cases to
  the handoff and critical-path files respectively.**

### T-12 — Model-isolation + authz integration test

- **Files** (1): `api/__tests__/key-activity-scope-authz.integration.test.ts`
  (new)
- **Implements**: design §4.2, §4.8, DD-02, DD-08 — closes AC-08 (isolation
  + authz half of the two-file split; T-10 owns the openapi half); supports
  NFR-01, FR-11
- **Complexity**: moderate
- **Blocked by**: T-08, T-09 · **Blocks**: —
- **Steps** (as-built): two models with a cross-scope `PRECEDES` edge;
  model A's GET excludes model-B-only activities and the cross-scope edge
  contributes nothing; marking a B activity under A →
  `404 activity_not_found`; 403/200/204 permission matrix;
  `business_architect` resolves both permissions; no route public.
- **Verification**: `api/__tests__/key-activity-scope-authz.integration.test.ts`;
  `bun test:integration`.
- **Status**: landed as-built.

### T-13 — PWA api client (`keyActivities` block; raw-fetch unmark)

- **Files** (1): `pwa/src/api.ts` (modify)
- **Implements**: design §4.11, DD-07 — supports FR-12, FR-13
- **Complexity**: simple
- **Blocked by**: T-01 · **Blocks**: T-14
- **Steps** (as-built): exported `keyActivities` block (`:387`) — `list`/
  `mark` on `json<T>`; `unmark` on **raw `fetch` + `res.ok`**
  (`stories.remove` precedent — a 204 no-body must not hit `res.json()`);
  shared `json<T>` (`:49`) not modified; types inferred from the T-01
  schemas.
- **Verification**: `pwa/src/__tests__/key-activity-detail.test.tsx` (the
  204 path asserted at fetch level — `new Response(null, {status: 204})`,
  no throw, no rollback); `bun run typecheck`.
- **Status**: landed as-built.

### T-14 — KeyActivityBoard view + sort + mark toggle + evidence panel + registration

- **Files** (3): `pwa/src/views/model/KeyActivityBoard.tsx` (new),
  `pwa/src/views/model/KeyActivityBoard.module.css` (new),
  `pwa/src/views/index.tsx` (modify)
- **Implements**: design §4.10, §6 — closes AC-09, AC-10, AC-14, AC-15;
  supports FR-12, FR-13, FR-14, NFR-07, UX-01/02/05/06
- **Complexity**: complex
- **Blocked by**: T-13 · **Blocks**: T-15, T-16, T-20
- **Steps** (as-built): `key-activities` dispatch swapped to
  `<KeyActivityBoard route={r}/>` (`views/index.tsx:170` — the only edit;
  the tab slot is `model-workspace-core` FR-17's, route
  `#/model/key-activities` verbatim from the View Tree);
  `useActiveModel()` consumed, fetch keyed on `activeModel.id` (FR-14);
  all four states (loading `Loading`; empty `Card` on
  `meta.activityCount === 0` pointing to `#/model/canvas`; error
  `ErrorState` + sibling retry `Button`; ready ranking); truncation/cycle
  banner; optimistic mark toggle with rollback-only-on-rejection; evidence
  `Modal` (live vs snapshot drift visible); tokens-only CSS; keyboard-
  reachable sort headers with `aria-sort`.
- **Verification**: `pwa/src/__tests__/key-activity-board.test.tsx` +
  `pwa/src/__tests__/key-activity-detail.test.tsx` (AC-09/AC-10); CLI
  (AC-14): `bun run scripts/design-conformance.ts --view
  pwa/src/views/model/KeyActivityBoard.tsx` and `… --view
  pwa/src/views/model/KeyActivityBoard.module.css` — both exit 0; manual
  (AC-15, input mode: keyboard): load `#/model/key-activities`
  keyboard-only — Tab to a sortable header, Enter (expect `aria-sort` flips
  + rows reorder), Space on a mark toggle (expect key indicator toggles),
  Enter on a row detail (expect focus enters the Modal, Escape returns it).
- **Status**: landed as-built — **but the ranking is the superseded DD-10
  inline `<table>` (`KeyActivityBoard.tsx:271-340`). Δ3 (T-19 + T-20,
  OQ-A-gated) refactors it onto the extended catalog `DataTable` per DD-11;
  AC-14/AC-15 re-run after.**

### T-15 — KeyActivityBoard view-state tests (loading / empty / error+retry / banner)

- **Files** (1): `pwa/src/__tests__/key-activity-board-states.test.tsx` (new)
- **Implements**: design §4.10, §6 — closes AC-11, AC-12, AC-13
- **Complexity**: moderate
- **Blocked by**: T-14 · **Blocks**: —
- **Steps** (as-built): loading skeleton while pending (AC-11); empty state
  driven by a mocked `200 {rows:[], meta:{activityCount:0}}` — the shape an
  existing 0-activity model actually returns, never a 404 (AC-12); error
  state = `ErrorState` + sibling retry `Button` whose click refetches
  (AC-13); `truncated`/`hasCycle` → non-blocking banner above the
  still-rendered ranking (AC-13, FR-03).
- **Verification**: `pwa/src/__tests__/key-activity-board-states.test.tsx`;
  `bun test`.
- **Status**: landed as-built.

### T-16 — KeyActivityBoard model-context reload e2e

- **Files** (1): `pwa/playwright/key-activity-board-context.spec.ts` (new)
- **Implements**: design §4.10 — closes AC-16; supports FR-14, UX-06
- **Complexity**: moderate
- **Blocked by**: T-14 · **Blocks**: —
- **Steps** (as-built): model B active → `#/model/key-activities` → reload →
  `KeyActivityBoard` renders model B's ranking (persistence is
  `model-workspace-core` FR-15); no cross-model leakage; API-seeded.
- **Verification**: `pwa/playwright/key-activity-board-context.spec.ts`
  (AC-16).
- **Status**: landed as-built.

## Task list — residual (T-17..T-20)

### T-17 — Δ1: handoff empty-set rule (FR-04 non-empty guard)

- **Files** (3): `api/src/derive/key-activity-score.ts` (modify),
  `api/__tests__/key-activity-score.test.ts` (modify),
  `api/__tests__/key-activity-handoff.integration.test.ts` (modify)
- **Implements**: design §4.4 (Δ1), §1.2 — closes AC-04 (empty-set half);
  supports FR-04, NFR-04
- **Complexity**: simple
- **Blocked by**: T-03, T-11 (both landed) · **Blocks**: T-18
- **Steps**: In the handoff pass of `scoreActivities`
  (`key-activity-score.ts`, the neighbour loop around `:250-256`), a role
  handoff counts iff **both sides' role sets are non-empty and disjoint**;
  likewise systems:
  `if (a.roleIds.length > 0 && n.roleIds.length > 0 && disjoint(a.roleIds, n.roleIds)) roleHandoffs += 1;`
  (resp. `systemIds`). Guard at the **call sites** — leave `disjoint()`
  (`:174-177`) itself untouched (its vacuous-truth semantics stay correct
  for genuinely non-empty inputs; the FR-04 rule is about empty sets, which
  the design pins at the counting site). Rationale (FR-04/requirements
  C-03): empty sets are vacuously disjoint from everything; counting them
  would rank an *under-modeled* activity spuriously high — the opposite of
  trustworthy evidence (XD-11). Add the test cases design §8 names for Δ1:
  - unit (`key-activity-score.test.ts`): a roleless activity (empty
    `roleIds`) between role-bearing neighbours gets `roleHandoffs: 0` on
    that dimension (and symmetric for `systemIds`); an activity pair with
    both sides non-empty and disjoint still counts (regression guard on
    the existing boundary case).
  - integration (`key-activity-handoff.integration.test.ts`): fixture rows
    for a roleless and a systemless activity — each counts **no** handoffs
    on its empty dimension; existing disjoint-boundary assertions still
    pass.
- **Verification**: `api/__tests__/key-activity-score.test.ts` (`bun test`)
  + `api/__tests__/key-activity-handoff.integration.test.ts`
  (`bun test:integration`); `bun run typecheck`.

### T-18 — Δ2: isolated-activity critical-path score (FR-03 ≥2-node chain rule)

- **Files** (3): `api/src/derive/key-activity-score.ts` (modify),
  `api/__tests__/key-activity-score.test.ts` (modify),
  `api/__tests__/key-activity-critical-path.integration.test.ts` (modify)
- **Implements**: design §4.3 (Δ2, req-review N-03), §1.2 — closes AC-03
  (isolated-activity half); supports FR-03, NFR-04
- **Complexity**: simple
- **Blocked by**: T-17 (same files — sequential to avoid collision) ·
  **Blocks**: —
- **Steps**: In `computeCriticalPath`'s `recordPath`
  (`key-activity-score.ts:96-102`): only paths of **≥ 2 nodes** contribute
  to `longestThrough` (and to `best`) — a chain requires ≥ 2 nodes
  (FR-03), so an isolated activity (no intra-scope `PRECEDES` edges)
  keeps `longestChainDepth 0` → `criticalPath 0`, **even in a model that
  does have a critical path**. Keep the `pathCount` increment unconditional
  (it is the DFS budget, not a chain count) and keep
  `criticalPathLength = best.length >= 2 ? best.length : 0` (already
  correct — the change makes `longestThrough` consistent with it). The
  `longestThrough.get(a.id) ?? 0` read in the scoring pass then yields 0
  for isolated nodes with no further change. Add the design §8 Δ2 cases:
  - unit (`key-activity-score.test.ts`): a subgraph **with** a critical
    path plus one isolated activity → that activity's evidence shows
    `longestChainDepth: 0`, `criticalPathLength` = the model's chain
    length, and `scores.criticalPath === 0`; the zero-edge-model all-0 case
    still passes.
  - integration (`key-activity-critical-path.integration.test.ts`): fixture
    row — a model with a chain and one unconnected activity → that row's
    `criticalPath` sub-score is `0` with `longestChainDepth 0` evidence.
- **Verification**: `api/__tests__/key-activity-score.test.ts` (`bun test`)
  + `api/__tests__/key-activity-critical-path.integration.test.ts`
  (`bun test:integration`); `bun run typecheck`.

### T-19 — Δ3a: additive catalog `DataTable` sort extension (DD-11) — OQ-A-gated

- **Files** (3): `pwa/src/components/DataTable.tsx` (modify),
  `pwa/src/components/DataTable.module.css` (modify),
  `pwa/src/__tests__/data-table.test.tsx` (new)
- **Implements**: design DD-11, §4.10, §6 — supports FR-12 (catalog-gap
  decision), NFR-07, UX-02/05
- **Complexity**: moderate
- **Blocked by**: user confirmation of **OQ-A** (DD-11 path) ·
  **Blocks**: T-20
- **Steps**: Extend `DataTable` **itself** (not a `SortableDataTable`
  variant — DD-11) with optional props, exactly the design §4.10 shapes:
  per-column `sortable?: boolean`; `sort?: {column: string, dir:
  "asc"|"desc"}` (controlled); `onSort?: (columnId: string) => void`;
  `getRowKey?: (row, i) => string` (stable identity under client-side
  re-sort — replaces index keying only when supplied). A `sortable` column
  renders `<th aria-sort={ascending|descending|none}>` containing a native
  `<button type="button">` (Enter/Space for free) with the label + a
  token-styled sort glyph; clicking calls `onSort(column.id)`. Sort
  **logic/state never enter the catalog** — the component renders state and
  reports clicks. **Without the new props the render output is
  byte-identical to today** (plain `<th>{label}`, index-keyed rows,
  verified current shape `DataTable.tsx:18-52`) so every existing consumer
  compiles and renders unchanged (FR-12 backward-compatibility). No
  `onRowClick` (deliberate — DD-11; row selection stays a per-cell
  ReactNode button, UX-05). `DataTable.module.css` additions
  (sort-header button reset + glyph) are tokens-only `var(--…)` (NFR-07).
  The new `data-table.test.tsx` pins the contract: (a) prop-less render
  matches the pre-extension markup (no `<button>` in `<th>`, index keys);
  (b) a `sortable` column renders the header button with the correct
  `aria-sort` for `sort` state; (c) activating the header (click and
  keyboard Enter) calls `onSort` with the column id; (d) `getRowKey`
  drives row keys.
- **Verification**: `pwa/src/__tests__/data-table.test.tsx` (`bun test`);
  `bun run typecheck`.

### T-20 — Δ3b: KeyActivityBoard refactor onto the extended `DataTable` — OQ-A-gated

- **Files** (3): `pwa/src/views/model/KeyActivityBoard.tsx` (modify),
  `pwa/src/views/model/KeyActivityBoard.module.css` (modify),
  `pwa/src/__tests__/key-activity-board.test.tsx` (modify)
- **Implements**: design §4.10, §6, §1.2 (Δ3) — re-closes AC-09, AC-14,
  AC-15 on the DD-11 markup; supports FR-12, FR-13, NFR-05, NFR-07
- **Complexity**: moderate
- **Blocked by**: T-19 · **Blocks**: —
- **Steps**: Replace the inline ranking `<table>`
  (`KeyActivityBoard.tsx:271-340`) with the extended `DataTable`: keep the
  existing `sortColumn`/`sortDir` state, comparators, and stable
  client-side sort (default `composite` desc = server rank order; no
  re-fetch on sort, NFR-05) **in the view**; pass `sort` + `onSort` +
  `getRowKey={(row) => row.id}` down; build cells as ReactNodes — the
  activity-name cell is the detail-opening button, the Key cell holds the
  badge + mark-toggle `Button` (behaviour unchanged from T-14: optimistic
  with rollback-only-on-rejection, evidence `Modal`). Move the
  table/sort-header styles that now live in `DataTable.module.css` out of
  `KeyActivityBoard.module.css` (drop, don't duplicate); remaining view
  styles stay tokens-only. Update
  `key-activity-board.test.tsx` assertions to target the extended-
  `DataTable` markup (design §8 AC-09 Δ3 note): header buttons inside
  `th[aria-sort]`, re-order on activation without re-fetch, default
  `composite` desc. `key-activity-detail.test.tsx` and
  `key-activity-board-states.test.tsx` must still pass unmodified (states
  and toggle semantics unchanged) — re-run both.
- **Verification**: `pwa/src/__tests__/key-activity-board.test.tsx`
  (`bun test`, AC-09 on DD-11 markup) + CLI (AC-14 re-run):
  `bun run scripts/design-conformance.ts --view
  pwa/src/views/model/KeyActivityBoard.tsx` and `… --view
  pwa/src/views/model/KeyActivityBoard.module.css` — both exit 0 + manual
  (AC-15 re-run, input mode: keyboard): load `#/model/key-activities`
  keyboard-only — Tab to a sortable `DataTable` header button, Enter
  (expect `aria-sort` flips + rows reorder), Space on a mark toggle (expect
  key indicator toggles), Enter on a row detail (expect focus enters the
  Modal, Escape returns it to the originating row).

## Cross-cutting verification (whole-spec)

- **AC-17** (transpile clean + no compile-time schema-array edit):
  `bun run typecheck` exit 0; `manual: run git diff
  shared/src/schema/nodes.ts shared/src/schema/edges.ts in a terminal
  (input mode: CLI) and verify it shows no additions to NODE_LABELS or
  EDGE_ENDPOINTS` (the `keyActivity` judgement lives in the open
  `attributes` map; no new label/edge — NFR-02, XD-03). Not a standalone
  task — checked at the final validation sweep.
- **Final sweep** (before Execution=complete in STATUS.md): re-run the full
  as-built suite — `bun test` + `bun test:integration` (Neo4j up) — plus
  the AC-14 conformance CLIs, the AC-15 keyboard walk, the AC-16 Playwright
  spec, and AC-17 above. Every AC-01..AC-17 must map to a passing test path
  or a written `manual:` repro before STATUS.md gains
  `verification_artifact`/`verified_at` (completion hook enforces).

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour | the task's listed test (`bun test <path>` / `bun test:integration`) |
| tasks touching pwa views/components (T-19, T-20) | `bun run scripts/design-conformance.ts --view <file>` for **every** touched file under `pwa/src/views/` and `pwa/src/components/` — each `.tsx` and `.module.css` its own invocation |
| final task | `bun test` + `bun test:integration` (needs Neo4j) + full AC-01..AC-17 sweep + AC-17 `git diff` check |

## Traceability summary

| FR | Tasks | AC |
|----|-------|-----|
| FR-01 model-scoped read | T-02, T-04 | AC-01, AC-08 |
| FR-02 centrality | T-01, T-03, T-11 | AC-01, AC-02 |
| FR-03 critical-path | T-03, T-11, **T-18 (Δ2)** | AC-03 |
| FR-04 handoff density | T-03, T-11, **T-17 (Δ1)** | AC-04 |
| FR-05 composite rank | T-01, T-03, T-11 | AC-05 |
| FR-06 scores endpoint | T-01, T-04, T-08, T-10 | AC-01, AC-08 |
| FR-07 mark | T-01, T-05, T-08 | AC-06 |
| FR-08 unmark (reversible, idempotent) | T-05, T-08 | AC-07 |
| FR-09 attr-preserving write | T-05, T-06 | AC-06, AC-07, AC-17 |
| FR-10 openapi + error code | T-01, T-07, T-08, T-10 | AC-08 |
| FR-11 route-perm + RBAC | T-09 | AC-08 |
| FR-12 KeyActivityBoard + 4 states + catalog sortable table | T-13, T-14, T-15, **T-19, T-20 (Δ3, OQ-A)** | AC-09, AC-11, AC-12, AC-13, AC-14, AC-15 |
| FR-13 mark toggle + evidence panel | T-13, T-14, T-20 | AC-10, AC-15 |
| FR-14 model-scope + reload survival | T-14, T-16 | AC-16 |
| NFR-01 model isolation | T-02, T-12 | AC-08 |
| NFR-02 no new label / no schema edit | T-02, T-05 | AC-06, AC-17 |
| NFR-03 reversibility | T-05 | AC-07 |
| NFR-04 deterministic + descriptive | T-02, T-03, T-11, T-17, T-18 | AC-05 |
| NFR-05 bounded compute | T-03, T-11, T-20 | AC-03 |
| NFR-06 house rules | T-08, T-09, all | AC-08, AC-17 |
| NFR-07 tokens-only + conformance | T-14, T-19, T-20 | AC-14, AC-15 |
