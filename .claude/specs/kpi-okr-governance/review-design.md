---
feature: "kpi-okr-governance"
reviewing: "design"
reviewing_revision: 2
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-05"
invocation_note: >
  Invoked cold as review pass 1 of at most 2. The on-disk chain already
  records a consumed design-review cap (pass 1 revise + pass 2 approve),
  an approved tasks phase, and execution:complete (STATUS.md), plus one
  prior out-of-band confirmation review at this path. This review is
  therefore an independent confirmation pass, not a budget-consuming
  pass 1 — see C-03. The superseded review text is archived at
  review-design.2026-07-04.confirmation.md (per its own C-01
  recommendation); every claim below was re-verified against the
  working tree on 2026-07-05, not inherited.
---

# Review: kpi-okr-governance / design (rev 2) — independent cold review (pass 1)

Method: read `design.md` rev 2 in full; then `requirements.md` rev 2,
`.claude/specs/blueprint.md` (View Tree :125, UX-01…06 :143-148,
XD-02-as-amended :157, XD-16 :171, XD-17 :172), CLAUDE.md, STATUS.md,
and the spec-review skill. The tree already contains this design's
implementation, so pin-claims were checked for internal consistency and
target-state claims were checked against the tree directly (spot-check
log below; line numbers are current as of 2026-07-05 and have shifted
slightly since the prior review — concurrent specs are in flight).

## Verdict

**approve** — zero blockers. The design is complete, traceable to
requirements rev 2 (18 FRs, 5 NFRs, 21 ACs — all reach a design element
and a named test or manual repro), faithful to the blueprint (View Tree
routes verbatim, UX-01/02/05/06 satisfied, UX-03/04 correctly n/a,
XD-02-as-amended / XD-16 / XD-17 honored), and every load-bearing claim
I re-checked matches the working tree. The three concerns are
accounting/bookkeeping: the previously sanctioned doc amendments are
still unapplied (C-01), one landed file touch is missing from §7
(C-02), and the review-pass provenance needs orchestrator
reconciliation (C-03). None changes a design decision.

## Blockers

none.

## Concerns

- **C-01 — The three sanctioned "no re-review" design.md amendments
  remain unapplied; §4.7/§4.9, §4.8, and §4.8a are still stale against
  the landed tree.** The design is the governing record of narrow
  touches on co-owned files (§4.9 merge rule), so its accounting must
  be exact. Still wrong in rev 2 as read today:
  **(a)** §4.7/§4.9 sanction "exactly two lines (import + call)" on
  `api/src/routes/openapi.ts`; the landed touch is three tokens —
  import (`openapi.ts:90`), call (`:1008`), and the added `export`
  keyword on `errorEnvelopeSchema` (`:97`).
  **(b)** §4.8's YAML boots the server with `bun run start`; the landed
  workflow runs `bun run src/server.ts` (`.github/workflows/ci.yml:87`)
  because the `start` script hard-codes `--env-file=../.env`, which
  does not exist in CI (recorded as execution deviation 2 in
  STATUS.md).
  **(c)** §4.8a quotes `set -a; [ -f .env ] && . ./.env; set +a` "run
  from the repo root prior to `cd api`"; the landed
  `scripts/test-integration.sh` uses the root-anchored
  `ROOT="$(git rev-parse --show-toplevel)"` form (better — cwd-safe).
  STATUS.md "Next" item 3 already commits to these edits at the first
  PR. **Recommendation:** land the three one-line amendments (plus the
  N-01/N-02 folds below) as a design.md rev-3 erratum in the first-PR
  commit; no re-review needed, the sanction stands.

- **C-02 — §7 File Changes omits `shared/package.json`, a file the
  implementation had to touch.** The landed one-line exports entry
  `"./schema/kpi-sla": "./src/schema/kpi-sla.ts"`
  (`shared/package.json:12`) was required for the §3.3
  `@companygraph/shared/schema/kpi-sla` imports to resolve, and exists
  only as STATUS.md execution deviation 1. The File Changes table is
  what ownership gating and the §4.9 co-ownership rule key off; a
  landed edit with no design row is exactly the accounting gap the
  merge rule cannot tolerate. **Recommendation:** add a
  `shared/package.json | modify (narrow) | FR-11a | one exports entry`
  row in the same rev-3 erratum as C-01.

- **C-03 — Pass-counter vs artifact state; orchestrator must not
  double-count this review.** Invoked as "pass 1 of at most 2", but
  design.md frontmatter records `approved_via: review-design.md pass 2`
  and STATUS.md records the design-review cap as consumed
  ("Design Review: approve on pass 2/2") with execution complete
  (T-01…T-21) and two prior out-of-band confirmation reviews. The
  original pass-1/pass-2 texts no longer exist; this path has now
  hosted its fourth successive document. I have archived the
  immediately prior text as `review-design.2026-07-04.confirmation.md`
  so the chain stops losing provenance. **Recommendation:** the
  orchestrator reconciles its counter with STATUS.md, treats this file
  as an out-of-band confirmation (not a cap-consuming pass), and keeps
  archiving superseded review texts, per the standing STATUS.md "Next"
  item 1.

## Nits

- **N-01 (carried, still open) — Requirements FR-02's "time filters
  as-built" phrase is vacuous and the design corrects it silently.**
  As-built the measurements list supports only `kpi_id` (required) +
  `limit`/`offset` — no time filters exist. §4.1's pin is correct; add
  a V-05 row to the §2 verification-findings table so the consolidated
  report inherits the divergence with the same discipline as V-01…V-04.
- **N-02 (carried, still open) — §6's `<main>`-landmark contingency is
  resolved; fold it in.** STATUS.md AC-17 records the landmark is
  shell-provided (`pwa/src/App.tsx` wraps the routed view in `<main>`)
  and the views render none. One line closes the conditional.

## Verified claims (spot-check log, 2026-07-05)

| Design claim | Tree evidence | Result |
|---|---|---|
| §4.2 `parseWith` on the ValidationError channel; `readJson`/`parseQueryBool`/`parseId` as described | `api/src/routes/_helpers.ts:84/:49/:74/:14` | confirmed |
| §4.2 router ZodError backstop | `api/src/router.ts:270` import, `:292` `e instanceof ZodError` branch | confirmed |
| §4.9 owned dispatch anchors + narrow Domain touch | `router.ts:655` Roll-down, `:688` Domain CRUD, `:717` KPI CRUD (comment cites FR-10a/FR-13), `:733` SLA CRUD, `:748` KPI alignment, `:754` OKR Directive, `:773` Key Result, `:786` OKR Performance (+ SLA alignment/measurement/breach/trend/compliance blocks) | confirmed |
| §4.10 RBAC rows added; stale overload rows gone | `api/src/auth/rbac-permissions.ts:188` (`GET domains`, comment cites FR-10d), `:205-210` KPI block (list/archive/audit/detail), `:214-219` SLA mirror, `:254` pre-existing `GET okr-directives`; zero `P("POST", "kpis/:id")` / `P("POST", "slas/:id")` matches | confirmed |
| §4.3/§4.4/§4.6 kpi-crud fixes | `kpi-crud.ts:24` `z.string().uuid()` DD-04 guard, `:28/:145` `parseWith`, `:43` `generateId()` (comment cites FR-14), `:96` `handleKpiList`, `:119` `handleKpiGet`; no `crypto.randomUUID` remains | confirmed |
| §4.5 FR-10c byte-for-byte predicate + camelCase ordering | `okr-crud.ts:122` `handleOkrDirectiveList`, `:127` `NOT n.attributes_json CONTAINS '"domain_id"' … ORDER BY n.createdAt DESC` | confirmed |
| §4.1/§4.2 third sanctioned contract change (DD-01 iii) | `roll-down.ts:1300` `handleSlaDomainRollDownPost` uses `parseWith`; in-code comment cites DD-01 (iii) + req-review pass-2 C-01; zero `flatten()` / "schema validation failed" in the file | confirmed |
| §3.3 shared request schemas incl. the one sanctioned tightening + doc-only `listQuerySchema` | `shared/src/schema/kpi-sla.ts:155-226`; `:197` `weight: z.number().min(0).max(1)`; `:226` `listQuerySchema` | confirmed |
| §4.7 OpenAPI owned module + hook | `api/src/routes/openapi-kpi-okr.ts:75` `registerKpiOkrPaths`; `openapi.ts:90` import, `:1008` call (comment cites FR-12/§4.7); `export` on `errorEnvelopeSchema` `:97` | confirmed (C-01a accounting) |
| §4.8 CI postgres + migrations + hard-asserted boot | `ci.yml:52` `postgres:16-alpine`, `:60` `pg_isready`, `:70` `POSTGRES_URI`, `:77` migration step, `:87-92` background boot + healthz wait + hard `curl -fsS … \|\|` assert | confirmed (C-01b boot-command drift) |
| §4.8a env sourcing for the test process | `scripts/test-integration.sh` — root-anchored `.env` sourcing, tolerant when absent, `--max-concurrency 1` | confirmed (C-01c form drift) |
| §6 views on REST, states, tablist, tokens | `KpiManagement.tsx:63-64` (`api.kpi.list()` + `api.domains.list()`), `OkrManagement.tsx:68` (`okr.listDirectives()`); zero `api.cypher` matches in either; `role="tablist"` + `aria-label` (`:113`/`:116`); `data-testid="empty-state"` (`:136`/`:140`); both `.module.css` files exist | confirmed |
| View Tree verbatim, no invented/renamed routes | blueprint `:125` `#/exec/kpi-management, #/exec/okr-management → existing views, verified + tested`; `pwa/src/route.ts:85-86` ids `kpi-management`/`okr-management`; `#/exec/performance` untouched | confirmed |
| DD-05 split-brain kept per blueprint law | XD-02 amended final ruling (blueprint `:157`): Neo4j `:KPIMeasurement` canonical for trends, Postgres table stays as-built, "documented, not fixed" — matches §3.4/DD-05 exactly | confirmed |
| §7/§8 test artifacts | ten `api/__tests__/{kpi,sla,okr,roll-down}*.integration.test.ts` + `rbac-route-permissions.test.ts` + `pwa/src/__tests__/exec-{kpi,okr}-management.test.tsx` all exist | confirmed |
| — (C-02 basis) | `shared/package.json:12` `"./schema/kpi-sla"` exports entry — landed, absent from §7 | gap → C-02 |

## Traceability check

| Check | Result |
|-------|--------|
| Every FR reaches design core-logic + file-changes | pass — FR-01…09 → §4.1 pins + ten test files; FR-10a-d → §4.5/§4.9/§4.10; FR-11a → §3.3/§4.3; FR-11b → §4.2 (the FR's open design decision explicitly closed); FR-12 → §4.7; FR-13 → §4.4/§5/§4.10; FR-14 → §4.6 (keep-`uuid` conditional explicitly resolved); FR-15/16 → §6; FR-17 → §4.8; FR-18 → §4.8a |
| Every AC is closed by a named test or manual repro | pass — AC-01…13, 21 → §7/§8 named integration files; AC-14/15 → jsdom files; AC-16…20 → §8 manual-with-repro incl. input modes; 21/21 |
| Routes/views match the blueprint View Tree verbatim | pass — existing routes only, nothing invented or renamed; `#/exec/performance` correctly left to `kpi-okr-performance-dashboards` |
| UX-* allowances covered | pass — UX-01 (§6 four states → AC-14/15), UX-02 (tokens-only modules + catalog + AC-16), UX-03/04 n/a per requirements Platforms table, UX-05 (§6 focus order/tablist/landmark → AC-17; N-02 fold pending), UX-06 (AC-18) |
| XD-* cross-cutting decisions honoured | pass — XD-02-as-amended (DD-05 split-brain pinned not fixed), XD-16 (verify-then-fix charter, DD-01), XD-17 (DEC-01/02 recorded decisions, no user gate) |
| No file ownership conflict with another spec | pass with C-02 — §4.9 enumerates owned router anchors + merge rule for all five shared files; the one landed touch missing from the record is `shared/package.json` (C-02) |
| House rules (zod-only, en-US, no tsc, loopback, central auth gate) | pass — no second validation lib; NFR-05 honored via DD-12 route↔RBAC pairing incl. the honest "integration runs are auth-blind" admission → unit test `rbac-route-permissions.test.ts` |

## Summary

- **Solid:** the contract-change accounting (exactly three sanctioned
  breaks, each landing with its pinning test in the same task), the
  V-01…V-04 verification-finding discipline (V-01's v7-only `parseId`
  making the as-built lifecycle self-contradictory is a genuinely good
  catch, and pinning the fixed contract is correctly reasoned), the
  DD-12 route↔RBAC pairing with unit-level verification, and the §4.9
  section-ownership merge rule. All independently re-confirmed against
  the tree.
- **What the findings have in common:** every one is bookkeeping, not
  design. The decisions are right and implemented; the governing record
  lags the landed tree in four small places (C-01 a-c, C-02) and the
  review chain's provenance needs discipline (C-03, partially remedied
  by archiving).
- **Do first:** fold C-01 a-c + C-02 + N-01 + N-02 into one design.md
  rev-3 erratum in the first-PR commit (STATUS.md "Next" already plans
  this); have the orchestrator reconcile the pass counter before
  consuming this verdict.
