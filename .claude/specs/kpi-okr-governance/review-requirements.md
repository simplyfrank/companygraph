---
feature: "kpi-okr-governance"
reviewing: "requirements"
reviewing_revision: 2
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-04"
note: >
  Independent cold re-review of revision 2. A prior review file (pass 2,
  approve) existed on disk at invocation time; this review supersedes it and
  re-verified every load-bearing claim directly against git HEAD (the
  pre-implementation as-built state the spec documents) rather than trusting
  either the revision notes or the prior review. Prior-review findings that
  I independently confirmed are retained with attribution.
---

# Review: kpi-okr-governance / requirements (revision 2)

## Verdict

**approve** — zero blockers. Every pass-1 blocker and concern is genuinely
resolved in revision 2, and every as-built claim I spot-checked against HEAD
is accurate, with four exceptions recorded below as concerns (two carried
from the prior on-disk review and independently confirmed, two newly found).
All four are documentation-accuracy defects, not requirement-validity
defects: the requirement set is implementable as written, and the concerns
belong in the design phase's as-built notes / the XD-17 consolidated report.

Context note: the working tree already contains the full implementation
(STATUS.md: execution complete, T-01…T-21). This review judges the
requirements artifact on its own terms — against HEAD for as-built claims,
against `_baseline` and `blueprint.md` for traceability.

## Pass-1 findings — resolution status (re-verified at HEAD)

| Pass-1 finding | Status | Independent verification |
|----------------|--------|--------------------------|
| ~~B-01~~ (FR-11 misstated as-built validation) | **resolved** | Confirmed at HEAD: `kpi-crud`, `sla-crud`, `kpi-trends`, `kpi-sla-alignment`, `sla-compliance` import no zod; `okr-crud`, `kpi-measurements`, `sla-breaches`, `roll-down` do. FR-11 correctly split into (a) conversion + (b) ZodError→400; AC-12 names the four already-zod files. Residual "anywhere" overstatement → C-01. |
| ~~B-02~~ (FR-15/AC-14 had no REST source) | **resolved** | Confirmed at HEAD: three `api.cypher` calls (`KpiManagement.tsx:50` KPI list, `:51` domain list, `OkrManagement.tsx:40-43` top-level directives); router at HEAD has no `GET kpis|slas|domains` list dispatch and unfiltered `GET okr-directives` falls through (dispatch only on `domain_id`/`product_id`); `domain-crud.ts` at HEAD exports POST/PATCH/archive/audit only. FR-10a-d + AC-21 close all of it; genuinely additive (NFR-03 holds). |
| ~~C-01~~ (Open Questions in single-shot mode) | **resolved** | DEC-01/DEC-02 recorded with deterministic defaults, flagged for the consolidated report; consistent with blueprint XD-17. DEC-02's placeholder claim confirmed (`kpi-crud.ts:174` "Placeholder for audit log", `user_id: "system"` at `:196`). |
| ~~C-02~~ (FR-14 untraceable) | **resolved (with a new gap → C-03)** | UUIDv7 assertions added to AC-01/AC-04/AC-08; generators confirmed at HEAD (`kpi-crud.ts:32` `crypto.randomUUID()`; `uuid` v4 at `kpi-measurements.ts:8,26` and `sla-breaches.ts:9,38`; `okr-crud`/`roll-down` already on `generateId`). But the FR-14 file list is incomplete — see C-03. |
| ~~C-03~~ (UX-05 partial) | **resolved** | AC-17 covers keyboard reachability, visible focus, logical focus order, ARIA landmarks — the full blueprint UX-05 allowance, with a concrete manual repro. |
| ~~C-04~~ (router.ts co-ownership) | **resolved** | Partial-ownership rule in Scope Boundaries (owned dispatch blocks, section granularity, merge rule delegated to design.md); tracked as Risk 7. |
| ~~N-01~~ / ~~N-02~~ | **resolved** | FR-11a limits GET-only surfaces to path/query schemas; AC-14/AC-15 platform is `jsdom (automated)`. |

## Findings

### Blockers

None.

### Concerns

- **C-01 — Motivation §3 / FR-11(b) overstate "no ZodError → 400 mapping
  anywhere … in `router.ts`, `server.ts`, `_helpers.ts`, or the route
  files."** Independently confirmed exception at HEAD:
  `roll-down.ts:1318-1319` wraps `.parse()` and returns
  `error(400, "invalid_payload", "schema validation failed", e instanceof
  z.ZodError ? e.flatten() : {})` (second catch near `:1415`, same SLA
  section). All other parse sites in the four zod files are unwrapped, so
  FR-11(b)'s required work is unchanged — only the universal claim is wrong.
  In a spec whose premise is exact as-built documentation, the design phase's
  as-built notes must record this exception, and the FR-11(b) DD
  (per-route `safeParse` vs shared mapper) should decide whether the shared
  400 envelope adopts or replaces that handler's `e.flatten()` details shape.
  *(Carried from the prior on-disk review; independently confirmed.)*
- **C-02 — FR-10c's "top-level = no `domain_id` in `attributes_json`" is
  ambiguous between string-contains and parsed-JSON semantics.** The view
  Cypher being replaced uses the string predicate
  `WHERE NOT o.attributes_json CONTAINS '"domain_id"'`
  (`OkrManagement.tsx:42` at HEAD) — bug-compatible replication excludes any
  directive whose attribute *values* merely mention `"domain_id"`. AC-21's
  fixtures must pin whichever semantics the design chooses and document it as
  a deliberate choice. *(Carried from the prior on-disk review; independently
  confirmed. Note: the executed implementation chose bug-compatible
  string-contains and pinned a decoy test — the design record should state
  this was the decision.)*
- **C-03 (new) — FR-14's file enumeration is incomplete: `sla-crud.ts:35` at
  HEAD also uses `crypto.randomUUID()`.** FR-14 lists only `kpi-crud`
  (`crypto.randomUUID()`) and `kpi-measurements`/`sla-breaches` (`uuid` v4
  package); `sla-crud` is omitted, and no AC asserts UUIDv7 format on SLA
  create — AC-07 lacks the version-nibble assertion AC-01 carries for KPIs.
  The implementers caught this anyway (working-tree `sla-crud.ts:42`
  generates via `generateId()` with an explicit "FR-14" comment), so this is
  now a traceability/documentation gap, not a behavior gap: FR-14's text and
  AC-07 should be amended (add `sla-crud` to FR-14; add the v7 assertion to
  AC-07) so the shipped behavior is spec-covered, and the consolidated report
  should note the requirement was implemented broader than written.
- **C-04 (new) — the OKR side of the surface is camelCase, not snake_case,
  and three places in the doc misstate it.** At HEAD, `okr-crud.ts:72`
  creates `:OKRDirective` nodes with `createdAt`/`updatedAt` (graph-core
  convention); there is no `created_at` property on that label. Consequently:
  (a) FR-10c and AC-21 say the unfiltered directive list is "ordered
  `created_at` DESC" — the actual as-built field (and the view Cypher's
  `ORDER BY o.createdAt DESC`) is `createdAt`; (b) NFR-04 declares "the
  snake_case field convention of this surface … kept as-built" — true for the
  KPI/SLA/measurement/breach side, false for `okr-crud`; the surface is
  *mixed*, which is exactly what NFR-04 exists to document honestly;
  (c) FR-15's "views sort/read `createdAt` while nodes store `created_at`"
  mismatch is real for `KpiManagement`/`:KPI` (`kpi-crud.ts:53` stores
  `created_at`) but does **not** exist for `OkrManagement`/`:OKRDirective` —
  the plural "views" overclaims. The executed tests got this right
  (`okr-crud.integration.test.ts:25-26` pins ":OKRDirective stores camelCase
  createdAt … there is no created_at on this label"), so again: amend the
  three doc locations to match; flag in the consolidated report. Risk 6
  ("field-casing split will keep confusing view code") is thereby proven by
  the spec's own text.

### Nits

- **N-01 —** NFR-01 cites "`_baseline` FR-16" for the <5-minute CI budget;
  `_baseline` FR-16 covers dev/ops infrastructure but never states the
  number — the budget lives in CLAUDE.md ("full CI in <5 min"). Fix the
  citation.
- **N-02 —** Process bookkeeping is inconsistent: the orchestrator invoked
  this as "review pass 1", the artifact is revision 2 addressing a pass-1
  review, a pass-2 review file already existed on disk, and STATUS.md says
  `review_passes: 1`. Not an author defect; the workflow should reconcile
  the pass counter and record this review as the re-review (pass 2 of the
  1-review + 1-re-review cap).

## Completeness / Traceability

| FR | Priority | AC coverage | Verified against (HEAD unless noted) |
|----|----------|-------------|--------------------------------------|
| FR-01 KPI lifecycle | must | AC-01 | Required-fields list matches `kpi-crud.ts:28-30` verbatim (`name/category/unit/target_value/target_direction/measurement_frequency`); archive/audit overload shape confirmed in router `:645-651` block |
| FR-02 measurements (Postgres) | must | AC-04 | zod body in `kpi-measurements.ts`; migration `003_create_kpi_measurements.sql` exists |
| FR-03 trends | must | AC-05 | `kpi-trends.ts` GET-only, no zod at HEAD |
| FR-04 alignments + sla-alignments mirror | must | AC-06 | Router dispatch for `kpi-alignments` (`:665-668`) and `sla-alignments` (`:705-707`) confirmed |
| FR-05 SLA lifecycle | must | AC-07 | Mirror of FR-01 (`:655-662`); **v7 id assertion missing → C-03** |
| FR-06 breaches (Postgres) | must | AC-08 | `004_create_sla_breaches.sql` exists; `uuid` v4 confirmed |
| FR-07 compliance | must | AC-09 | GET-only, three endpoint shapes |
| FR-08 OKR surface | must | AC-10 | `okr-crud` already zod + `generateId` — "already as-built here" accurate |
| FR-09 roll-down floor | must | AC-11 | `roll-down.ts` = 1,483 lines at HEAD (exact figure checks out); P0-floor + should-variants is a sound answer to Risk 3 |
| FR-10a/b KPI+SLA lists | must | AC-02 | No GET list dispatch at HEAD — gap real, additive |
| FR-10c/d directive+domain lists | must | AC-21 (+AC-14) | Unfiltered directive GET falls through at HEAD; no REST domain list anywhere; **ordering field misstated for OKR → C-04** |
| FR-11 zod + 400 envelope | must | AC-12 | Five zod-free + four unmapped-parse files confirmed; **one mapper exception → C-01** |
| FR-12 OpenAPI | must | AC-13 | `openapi.ts` at HEAD: zero kpi/sla/okr/roll-down references |
| FR-13 resource-shaped routes | must | AC-03, AC-07 | Overloads confirmed at HEAD (POST `/kpis/:id` → archive, GET → audit); DEC-01 rationale (never in OpenAPI, no in-repo consumer) verified on both counts |
| FR-14 UUIDv7 | should | AC-01, AC-04, AC-08 | Generators confirmed; **enumeration misses `sla-crud.ts:35` → C-03** |
| FR-15 views on REST | must | AC-14 | All three `api.cypher` calls have named replacements; `createdAt` mismatch real for KpiManagement only → C-04(c) |
| FR-16 view states + conformance | must | AC-14–AC-18 | `scripts/design-conformance.ts` exists; `error-scenarios/exec/{kpi-management,okr-management}/` exist |
| FR-17 Postgres in CI | must | AC-19 | ci.yml at HEAD has `neo4j` service only — gap real; `postgres:16-alpine` matches docker-compose; `run-migrations.ts` exists |
| FR-18 isolation | must | AC-04, AC-08, AC-20 | AC-20 gives a concrete run-twice repro |

All 21 ACs trace to at least one FR; no orphan ACs. Manual ACs (AC-16–AC-20)
each carry input mode + concrete repro + observable outcome. NFR-01…NFR-05
each cite a source (one citation wrong → N-01) and are enforceable
(`bun run typecheck` exists in root `package.json:19`).

**Blueprint conformance:** `#/exec/kpi-management` and `#/exec/okr-management`
taken verbatim from the round-4 View Tree with owner `kpi-okr-governance`
(blueprint `:125-126`); `#/exec/performance` correctly excluded
(`kpi-okr-performance-dashboards`); no invented or renamed routes. UX-01 →
AC-14/15; UX-02 → AC-16; UX-03/UX-04 justified n/a with the Platforms & Input
Modes and Native Conflicts tables present anyway; UX-05 → AC-17 (full
allowance); UX-06 → AC-18. XD-16 is the charter and the scope row (blueprint
`:189`) matches the spec's in/out boundaries exactly; XD-17 honored via
DEC-01/DEC-02 instead of open questions. House rules: zod-only (FR-11,
NFR-02), central auth gate untouched + loopback retained (NFR-05), additive
under `/api/v1/` (NFR-03), no tsc, en-US identifiers.

**Done well:** the verify-then-fix ordering (Risk 4: contract-pinning tests
before the zod conversion) is the right mechanism for a governance backfill;
DEC-01's breaking-change analysis is honest and correctly flagged for the
consolidated report; the Motivation section's as-built claims were, with the
C-01/C-04 exceptions, accurate to the line at HEAD — rare and valuable in a
backfill spec.

## Handoff

For the design phase record (or, given execution is complete, the XD-17
consolidated report): the `roll-down.ts:1318` mapper exception and the
chosen envelope shape (C-01); the string-contains decision for FR-10c
top-level semantics (C-02); amend FR-14 + AC-07 to cover `sla-crud` (C-03);
correct FR-10c/AC-21 ordering field, NFR-04's mixed-casing reality, and
FR-15's singular-view mismatch (C-04); fix the NFR-01 citation (N-01);
reconcile the review-pass counter (N-02).
