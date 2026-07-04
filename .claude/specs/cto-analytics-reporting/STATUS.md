# Spec: cto-analytics-reporting
**Size**: large | **Created**: 2026-07-04 | **Current Phase**: execution:complete — T-00..T-09 built + verified 2026-07-04 (router.ts mount + index.tsx view-registration are in the working tree and typecheck green; they commit separately from the code because a concurrent model/KPI session co-edits those two shared files)

Follow-up spec that `cto-analytics` deferred to (owner decision **RD-6**,
2026-07-04). Owns the four FRs `cto-analytics` carried forward verbatim:
**FR-08** (exec-summary PDF + graph-state hash), **FR-10** (nightly
precompute scheduler + cache tables), **FR-11** (settings + audit),
**FR-11a** (cache-snapshot read endpoint). FR/AC IDs are kept identical to
`cto-analytics` because its T-15..T-18 deferral-ratification tasks cite
them by number.

## Requirements are inherited & pre-reviewed

Per governance for large specs, all three phases normally get reviewed —
BUT the requirements here are **inherited** from `cto-analytics`'s approved
requirements (they were written, reviewed pass-1 + pass-2, and approved
there). So `requirements.md` ships `status: approved` (inherited). The
**load-bearing NEW review is the design** — the PDF byte-determinism
protocol, the 8-rule hash module, the scheduler lock, and the cache/
settings storage are genuinely new engineering (that is *why* RD-6 deferred
them). `design.md` + `tasks.md` ship `status: draft` — a design review pass
follows; they are NOT self-approved.

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (inherited from cto-analytics rev 3 — FR-08/10/11/11a + AC-08/09/13/16/17/18 verbatim) | frank (via cto-analytics) | 2026-07-04 |
| Req Review | inherited — pass-1 revise + pass-2 approve happened on cto-analytics's requirements | spec-review-agent (cto-analytics) | 2026-05-22 |
| Design | **approved** (revision 2 — pass-2 verdict approve; both blockers B-01/B-02 verified vs pdfkit source) | spec-reviewer (pass-2) | 2026-07-04 |
| Design Review | pass-1 revise (2B/5C/3N) → all absorbed → **pass-2 approve** (cap reached, 0 findings) | spec-reviewer | 2026-07-04 |
| Tasks | **approved** (revision 2; no separate task review — folded into design pass per governance) | frank | 2026-07-04 |
| Task Review | n/a (folded) | - | - |
| Execution | **complete** — T-00..T-09 (10 build tasks) shipped + verified via `spec-exec` fan-out (T-00..T-07) + orchestrator (T-08/T-09 finished after the fan-out hit a usage limit) | - | 2026-07-04 |

**Review passes**: design=2 (cap reached — approved 2026-07-04), tasks=0 (folded)

## Changelog

- **2026-07-04 — design pass-1 review absorbed (status → revised).** Fixed
  all pass-1 findings from `review-design.md`:
  - **B-01** — dropped the vendored TTF; PDF font is now standard-14
    `Courier` (`doc.font("Courier")`), no embedded font stream, no
    `api/assets/fonts/` asset (DD-02/DD-03, §5.3, §7.4, T-05).
  - **B-02** — byte-determinism: all determinism-critical metadata
    (`CreationDate`/`ModDate`/`Producer`/`Creator`) is now pinned via the
    `PDFDocument` **constructor `info` option** so pdfkit's `generateFileID`
    hashes fixed values and the trailer `/ID` is deterministic; documented
    that `/Subject` may be set post-construction (DD-03, §5.3, AC-08 test).
  - **C-01** — `withCacheEnvelope` unified to the single one-arg
    `withCacheEnvelope(body)` signature across DD-10/§5.4/T-01.
  - **C-02** — dropped the retired "no auth code paths" rule; reworded to
    the central-router-gate + sentinel-actor convention (§1, DD-09, §10).
  - **C-03** — added DD-12 (rolling N=7 `analytics_run` retention),
    `pruneSnapshots()` write path (§5.4/§5.6, T-01/T-04), and pruned-run →
    `404 not_found` for `/snapshot/:last_run_at` (§5.7, AC-18, T-06).
  - **C-04** — hash field renamed `attributes_parsed` → `attributes` to
    match NFR-05 rule (d) (§5.1/§5.2, T-04).
  - **C-05** — rule (g) now LF-normalises CRLF in string VALUES before
    hashing; AC-09 gains a CRLF-vs-LF test case (§5.1/§8, T-02).
  - **N-01** — `analytics-cache.test.ts` added to design §7.5 test table.
  - **N-02** — `analytics_run.status` DDL gains `CHECK (status IN ('ok','ai_skipped'))`.
  - **N-03** — `validateAiKeys` pinned to a direct in-process schema-cache
    import (no HTTP) (§5.6, T-04).

## Inventory

- **FRs (4):** FR-08 (PDF+hash), FR-10 (scheduler+cache), FR-11 (settings+audit), FR-11a (snapshot).
- **NFRs (7):** NFR-04 (byte-reproducible PDF), NFR-05 (8-rule hash), NFR-07 (30-min budget), NFR-R1 (SQLite isolation), NFR-R2 (additive error codes), NFR-08 (envelope), NFR-01 (transpile).
- **ACs (9):** AC-08, AC-09, AC-13, AC-16, AC-17, AC-18 (inherited verbatim) + AC-R1 (settings seed), AC-R2 (launcher), AC-R3 (degraded wiring).
- **DDs (12):** DD-01 file layout, DD-02 pdfkit, DD-03 byte-determinism (standard-14 Courier + constructor-pinned `/ID`), DD-04 hash reuse, DD-05 capture query, DD-06 cache tables, DD-07 lock, DD-08 settings seed, DD-09 sentinel actor, DD-10 degraded helper (one-arg), DD-11 fenced router block, DD-12 N=7 snapshot retention.
- **Tasks (10):** T-00 add pdfkit → T-01 cache+env → T-02 hash → T-03 settings+audit → T-04 scheduler+capture+lock → T-05 deterministic PDF → T-06 snapshot → T-07 degraded wiring → T-08 PWA launcher → T-09 router mounts.

## Files the BUILD tasks create/modify (hook coverage, `enforced:true`)

Enumerated in design §7 **and** each task's `Files` list. New backend:
`api/src/analytics/reporting/{hash,capture,cache,settings,scheduler,exec-summary}.ts`,
`api/src/analytics/reporting-routes.ts`. Modified backend: `api/package.json`,
`api/src/env.ts`, `api/src/analytics/routes.ts`, `api/src/server.ts`,
`api/src/router.ts`, `.env.example`. New/modified PWA:
`pwa/src/views/analytics/ExecSummary.tsx` + `.module.css`, `pwa/src/route.ts`,
`pwa/src/views/index.tsx`. **No vendored asset** (OQ-1 resolved to standard-14
Courier; the former `api/assets/fonts/` TTF is dropped — B-01). Test files
(allow-globbed): the 10 in design §7.5 (incl. `analytics-cache.test.ts`, N-01).

## Open Questions — RESOLVED (design pass-1)

- **OQ-1** — RESOLVED: standard-14 `Courier`, no vendored asset (B-01).
- **OQ-2** — RESOLVED: rolling N=7 `analytics_run` retention, prune heavy
  JSON blobs beyond the window; pruned run → `404 not_found` (DD-12/C-03).
- **OQ-3** — RESOLVED: no `ERROR_CODES` additions (reuse `not_found`/`invalid_payload`).

The load-bearing risk (**PDF byte-determinism, DD-03 / NFR-04**) is
addressed: `CreationDate`/`ModDate`/`Producer`/`Creator` pinned via the
`PDFDocument` constructor `info` so the trailer `/ID` is deterministic
(B-02), `compress:false`, and standard-14 Courier with no embedded font
stream (B-01) — removing the font-subset-ordering nondeterminism source.

## Dependency spine

T-00 (pdfkit) → T-01 (cache+env) → { T-02 (hash), T-03 (settings) } →
T-04 (scheduler+capture+lock) → T-05 (PDF) → T-06 (snapshot) →
T-07 (degraded wiring) → T-08 (PWA launcher) → T-09 (router mounts).
Foundational: T-01, T-02, T-04.

**Verification:**
- `verified_at`: 2026-07-04
- `verification_artifact`: `bun run typecheck` green; AC-08 byte-deterministic PDF `bun test api/__tests__/analytics-exec-summary-pdf.test.ts` → 4 pass / 0 fail (incl. explicit trailer `/ID` array equality per B-02, and `/Courier` present + no `/FontFile` per B-01); all reporting server tests `bun test api/__tests__/analytics-{cache,hash-determinism,settings-audit,settings-seed,scheduler,scheduler-budget,exec-summary-pdf,snapshot-endpoint,degraded-envelope}.test.ts` → 43 pass / 0 fail; RD-1 guard `analytics-no-direct-driver` → zero direct getDriver/driver.session in api/src/analytics/; PWA launcher `bun --cwd pwa run test src/__tests__/analytics-exec-summary-launcher.test.tsx` → 2 pass (fetches the endpoint + triggers download; imports no PDF lib). Live endpoint smoke (`GET /api/v1/analytics/exec-summary.pdf`, `?refresh=true`, `/settings`, `/snapshot/:id`) is `manual:` with a seeded stack (`bun run dev` + `bun run seed`) — the router mount is wired in the working tree.

**Artifacts:**
- 📄 Requirements: `.claude/specs/cto-analytics-reporting/requirements.md` (approved — inherited)
- 📄 Design: `.claude/specs/cto-analytics-reporting/design.md` (draft — review next)
- 📄 Tasks: `.claude/specs/cto-analytics-reporting/tasks.md` (draft)
- 📊 STATUS: `.claude/specs/cto-analytics-reporting/STATUS.md`

**Next**:
1. Run design review **pass-2** on `design.md` (pass-1 findings B-01/B-02, C-01..C-05, N-01..N-03 all absorbed; OQ-1..OQ-3 resolved). This is the final review pass under the 2-pass cap.
2. After design approves, task review (large spec), then execution in the T-00→T-09 spine order.
