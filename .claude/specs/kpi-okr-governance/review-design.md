---
feature: "kpi-okr-governance"
reviewing: "design"
reviewing_revision: 2
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-04"
invocation_note: >
  Invoked as review pass 1 of at most 2, cold. The on-disk artifact chain,
  however, already records a completed design pass 1 (revise) + pass 2
  (approve), an approved tasks phase, and execution:complete (STATUS.md).
  This file therefore functions as an independent confirmation re-review of
  design revision 2; it supersedes the prior pass-2 file at this path, whose
  resolution map is re-verified (not trusted) below. See C-01.
---

# Review: kpi-okr-governance / design (rev 2) — independent cold review

Method: read design.md rev 2 in full, then requirements.md rev 2, the
blueprint (View Tree, UX-01…06, XD-01…18), CLAUDE.md, and the prior
review file at this path. Every load-bearing claim was re-verified
against the working tree directly (file paths and line numbers cited
below), not taken from the prior review. Note the working tree already
contains the implementation of this design (execution completed
2026-07-04), so "as-built" (pre-fix) claims were checked for internal
consistency and against the surviving code shape, while target-state
claims were checked against the tree as it stands.

## Verified claims (spot-check log)

| Design claim | Tree evidence | Result |
|---|---|---|
| §4.2 `parseWith` helper + envelope | `api/src/routes/_helpers.ts:84` (`parseWith`), `:74` (`parseQueryBool`), `:49` (`readJson`), `:14` (`parseId`) | confirmed |
| §4.2 router ZodError backstop | `api/src/router.ts:274` (`e instanceof ZodError`) | confirmed |
| §4.1 roll-down `sla/domain` third contract change (DD-01 iii) | `api/src/routes/roll-down.ts` `handleSlaDomainRollDownPost` now uses `parseWith` with an in-code comment citing DD-01 (iii) and req-review pass-2 C-01; 422 not-found catch intact further down | confirmed |
| §4.10 RBAC entries | `api/src/auth/rbac-permissions.ts`: `GET kpis`, `POST kpis/:id/archive`, `GET kpis/:id/audit`, SLA mirror, `GET domains` all present with §4.10 comments; stale `POST kpis/:id` / `POST slas/:id` overload rows gone; `GET okr-directives` pre-existing | confirmed |
| §4.9 router anchors (12 owned blocks + Domain narrow touch) | `api/src/router.ts:611–779` — all 12 anchor comments present; `:646` one-line `handleDomainList` dispatch inside the Domain block | confirmed |
| §4.4/§4.6 kpi-crud fixes | `api/src/routes/kpi-crud.ts:24` (`z.string().uuid()` DD-04 guard), `:43` (`generateId()` replacing `crypto.randomUUID()`), `:96/:119` (list/detail handlers) | confirmed |
| §4.5 FR-10c byte-for-byte predicate | `api/src/routes/okr-crud.ts:127` — `NOT n.attributes_json CONTAINS '"domain_id"' … ORDER BY n.createdAt DESC` (camelCase per prior N-01) | confirmed |
| §4.6 keep-`uuid` resolution | `api/src/ids.ts` imports `{ v7 } from "uuid"` | confirmed |
| §4.7 OpenAPI module + hook | `api/src/routes/openapi-kpi-okr.ts` exists; `openapi.ts:64` import, `:712` call, `errorEnvelopeSchema` **exported** at `:70` (see C-02) | confirmed |
| §4.8 CI postgres + boot | `.github/workflows/ci.yml:46-89` — postgres:16-alpine service, migrations step, background boot, healthz wait, hard `curl -fsS … || exit 1` with log capture | confirmed (one drift, C-02) |
| §4.8a env sourcing | `scripts/test-integration.sh` — root-anchored `ROOT="$(git rev-parse --show-toplevel)"` sourcing (prior N-01 already applied) | confirmed |
| §6 views on REST, states, tablist | `KpiManagement.tsx:63-64` (`api.kpi.list()` + `api.domains.list()`), `OkrManagement.tsx:68` (`okr.listDirectives()`); zero `api.cypher` in either; `role="tablist"` + `aria-label` (`:113`/`:116`); `data-testid="empty-state"` (`:136`/`:140`); both `.module.css` files exist | confirmed |
| §7 test files | all 10 `api/__tests__/*.integration.test.ts` + `rbac-route-permissions.test.ts` + both `pwa/src/__tests__/exec-*.test.tsx` exist | confirmed |
| View Tree verbatim | blueprint round-4 block: `#/exec/kpi-management`, `#/exec/okr-management` → "existing views, verified + tested [owner: kpi-okr-governance]"; `pwa/src/route.ts:75-76` ids `kpi-management`/`okr-management`; no new/renamed routes | confirmed |
| DD-05 split-brain kept | blueprint XD-02 **amended final ruling 2026-07-04**: Neo4j `:KPIMeasurement` canonical for trends; Postgres table stays as-built; "split-brain is documented, not fixed" — matches DD-05/§3.4 exactly | confirmed |
| `bun run start` script | `api/package.json:9` exists (`--env-file=../.env`) | confirmed (but see C-02) |

## Blockers

none.

## Concerns

- **C-01 — Orchestrator pass-counter vs artifact state; audit-chain
  preservation.** This review was invoked as "pass 1 of at most 2", but
  design.md rev 2 frontmatter records `status: approved` /
  `approved_via: review-design.md pass 2`, STATUS.md records
  `Design Review: approve on pass 2/2` and `Execution: complete
  (T-01…T-21)`, and the prior file at this path was that pass-2 approve
  review. The artifact content did not misstate anything — the history
  it cites existed on disk — but the review budget (1 review + 1
  re-review per phase) is already spent, so this file must be consumed
  as an out-of-band confirmation review, not a fresh pass 1, or the
  bookkeeping double-counts. **Recommendation:** the orchestrator
  reconciles its pass counter with STATUS.md before acting on this
  verdict, and archives the superseded pass-2 review text (its findings
  and resolution map are re-verified in this file) if the audit chain
  requires the original.

- **C-02 — Co-owned-file touch accounting in the design text is stale
  against the landed tree (doc-only; no decision changes).** Two spots:
  **(a)** §4.7/§4.9 still sanction "exactly two lines (import + call)"
  on `api/src/routes/openapi.ts`, but the landed touch is three tokens —
  import (`:64`), call (`:712`), **and** the `export` keyword on
  `errorEnvelopeSchema` (`:70`) — exactly what the prior pass-2 C-01
  recommended; the design text was never amended to match. **(b)** §4.8's
  YAML boots the server with `bun run start`, but the landed workflow
  (`ci.yml:82`) runs `bun run src/server.ts` directly (sidestepping
  `start`'s `--env-file=../.env` in CI). The design is the governing
  record of sanctioned touches on co-owned files (§4.9 merge rule), so
  its accounting should match what landed. **Recommendation:** one-line
  amendments to §4.7/§4.9 (add the export keyword to the sanctioned
  `openapi.ts` touch) and §4.8 (boot command as landed); no re-review
  needed for either.

## Nits

- **N-01 — FR-02's "time filters" phrase is vacuous and the design
  corrects it silently.** Requirements FR-02 says the measurements list
  is verified "with time filters as-built", but as-built (and as pinned
  in §4.1 and the tree, `kpi-measurements.ts:51-56`) the list supports
  only `kpi_id` (required) + `limit`/`offset` — no time filters exist.
  The design's pin is correct; the divergence from the requirement text
  just deserves a V-05 row in the §2 verification-findings table so the
  consolidated report inherits it, matching the V-01…V-04 discipline.
- **N-02 — §6's `<main>`-landmark contingency is resolved; fold it in.**
  The design leaves "if execution finds the shell lacks a `main`
  landmark…" open; the tree resolves it (both view headers document
  that `pwa/src/App.tsx` supplies the landmark and the views render
  none). A one-line design note would close the conditional.

## Completeness / Traceability

| FR / NFR / AC | Design element | Verified against tree | Status |
|---|---|---|---|
| FR-01 KPI lifecycle | §4.1 kpi-crud pin; §4.4/§4.6 fixes | kpi-crud.ts, kpi-crud.integration.test.ts | covered |
| FR-02 measurements (Postgres) | §4.1, §3.2 | kpi-measurements.ts, migration 003, test file | covered (N-01 wording) |
| FR-03 trends | §4.1, §3.4 driver-seeding | kpi-trends.integration.test.ts | covered |
| FR-04 alignments + weight bound | §3.3 schemas (the one sanctioned tightening), §4.1 | kpi-sla.ts:193, alignment test | covered |
| FR-05/06/07 SLA surface | §4.1 mirrors, §3.2 migration 004 | sla-* files + tests | covered |
| FR-08 OKR surface | §4.1 (raw-Node + `attributes:{}` defects pinned honestly) | okr-crud.ts, test | covered |
| FR-09 roll-down P0 floor | §4.1 + DD-01(iii) `issues[]` pin | roll-down.ts, test | covered |
| FR-10a–d lists | §4.5 table, §4.10 RBAC rows | router.ts:646/673/689/710, rbac table, kpi-sla.ts:226 doc-only schema | covered |
| FR-11a zod conversion | §3.3 (kpi-sla.ts:155-226), §4.3, DD-03 no-tightening | shared schemas present | covered |
| FR-11b ZodError→400 | §4.2 `parseWith` + router backstop | _helpers.ts:84, router.ts:274 | covered |
| FR-12 OpenAPI | §4.7 owned module + hook | openapi-kpi-okr.ts, openapi.ts:64/712 | covered (C-02a accounting) |
| FR-13 detail routes / DEC-01 | §4.4, §5, §4.10 stale-row removal | router + rbac table | covered |
| FR-14 UUIDv7 | §4.6 keep-`uuid` resolution | ids.ts, kpi-crud.ts:43 | covered |
| FR-15 views on REST | §6 data layer; three named client methods | api.ts:199/988, both views | covered |
| FR-16 states/tokens/a11y | §6 states, tokens-only modules, tablist | views + .module.css | covered |
| FR-17 CI postgres | §4.8 (hard healthz assert, NFR-01 checkpoint + trim levers) | ci.yml:46-89 | covered (C-02b drift) |
| FR-18 self-provisioning | §4.8a root-anchored env, runMigrations beforeAll, paired cleanup | test-integration.sh | covered |
| NFR-01 CI budget | §4.8 measurement checkpoint + 3 ordered trim levers | — | covered |
| NFR-02 zod-only / en-US / no tsc | §1 rules, §3.3, §4.2 | no second validation lib introduced | honored |
| NFR-03 additive-only | DD-01(i–iii): all three contract breaks enumerated, rationale recorded (DEC-01 never-published; §9 rejected flatten-compat) | — | honored |
| NFR-04 snake_case frozen | §1 rule 2, §3.1 casing tables, §4.5 camelCase note | okr-crud.ts:127 | honored |
| NFR-05 central auth gate | DD-12 + §4.10 + unit-test verification (integration runs are auth-blind, honestly recorded in §8) | rbac-permissions.ts, router.ts:341-365 | honored |
| UX-01/02/05/06 (03/04 n/a) | §6 → AC-14…AC-18; conformance CLI in `--view` form | design-conformance.ts supports `--view`; STATUS records exit 0 | honored |
| XD-02 (amended) / XD-16 / XD-17 | DD-05 split-brain kept per final ruling; verify-then-fix charter; DEC-01/02 recorded decisions, no user gate | blueprint :157/:171/:172 | honored |
| AC-01…AC-13, AC-21 | §7/§8 file map — every AC named in ≥1 test file | all 11 api test files exist | covered |
| AC-14/AC-15 | jsdom tests | both exec test files exist | covered |
| AC-16…AC-20 | §8 manual-with-repro (AC-16 in `--view` form per prior N-02) | STATUS per-AC table | covered |

Cross-checks: every FR reaches §7 File Changes (18/18 FR+NFR rows);
every AC closed by a named test or manual repro (21/21); routes and
view names match the blueprint View Tree verbatim (no invented or
renamed routes; `#/exec/performance` correctly untouched); no ownership
conflict — §4.9's 12 owned anchors match `router.ts` comment-for-comment
and every narrow touch on a co-owned file is enumerated with a merge
rule (modulo the C-02a accounting word).

## What is done well

The contract-change accounting (exactly three sanctioned breaks, each
pinned in the same task it lands), the §2 V-01…V-04 verification-findings
discipline, the DD-12 route↔RBAC-table pairing with an honest admission
that integration runs cannot observe RBAC drift (hence the unit test),
and the §4.9 section-ownership merge rule are all exemplary and were
independently confirmed against the tree.

## Verdict

**approve** — zero blockers. The design is complete, traceable to
requirements rev 2, faithful to the blueprint (View Tree verbatim,
UX-01/02/05/06 satisfied, XD-02-as-amended/XD-16/XD-17 honored), and
every load-bearing claim I re-checked matches the working tree. C-01 is
a workflow-bookkeeping reconciliation, C-02 is a two-line doc amendment;
neither changes a design decision.
