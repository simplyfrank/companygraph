# Spec: cto-analytics
**Size**: medium | **Created**: 2026-05-22 | **Current Phase**: execution:complete — BUILD set T-07..T-14, T-19..T-21 shipped + verified 2026-07-04; T-15..T-18 deferred to cto-analytics-reporting; T-01..T-06 ratify as-built

## Build set vs deferred (execution fan-out, 2026-07-04)

All seven design §10 open questions resolved by owner decision (RD-1..RD-7).

- **BUILD (this spec, in scope now):** T-07, T-08, T-09, T-10, T-11, T-12, T-13, T-14, T-19, T-20, T-21.
- **RATIFY (as-built, no code):** T-01, T-02, T-03, T-04, T-05, T-06.
- **DEFERRED to follow-up spec `cto-analytics-reporting` (ratification-only, no code):** T-15 (FR-10 scheduler+cache), T-16 (FR-11 settings+audit), T-17 (FR-08 PDF+hash), T-18 (FR-11a snapshot).

No BUILD task is `Blocked by` a DEFERRED task. Dependency spine: T-20 (read-only module + migrated engine, foundational) → T-14 (route scaffold) → T-09/T-11/T-12/T-13/T-19 + T-10; T-07 on T-20+T-21. AC-10 closes at T-19 over the shipped 7 report GETs.

Files the BUILD tasks create/modify are enumerated in design §7.2 (per-file table) and each task's `Files` list — complete for the enforcement hook (`enforced: true`).

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (revision 2 — pass-1 findings absorbed, 2 partial open-accepted) | frank | 2026-05-22 |
| Req Review | pass-1 revise (4 blockers, 4 concerns, 5 nits, 3 open-nit-accepted) → pass-2 approve (14/14 cleanly absorbed, 2 partial open-accepted, 0 regressed) | spec-review-agent | 2026-05-22 |
| Design | **approved** (revision 2 — as-built reconciliation; pass-2 verdict approve, autonomous review gate per 2026-07-04 governance completion) | spec-reviewer (pass-2 approve) | 2026-07-04 |
| Design Review | pass-1 revise (B-01; C-01..C-05; N-01..N-03) → all 9 absorbed in rev 2 → **pass-2 approve** (cap reached; new non-blocking C-06 view-registration gap + N-04/N-05 carry to execution) | spec-reviewer | 2026-07-04 |
| Tasks | revised (revision 3 — open questions resolved; T-15..T-18 converted to deferral-ratification; no renumbering; no task review per medium rules). Note C-06: T-09/T-10/T-11/T-12 register views in `route.ts`/`views/index.tsx` (tab registration for report tabs rides in T-09) | frank | 2026-07-04 |
| Task Review | n/a (medium spec — no task review per workflow) | - | - |
| Execution | in-progress — open questions resolved 2026-07-04; BUILD set T-07..T-14, T-19..T-21; T-01..T-06 ratify as-built; T-15..T-18 deferred to `cto-analytics-reporting` | - | 2026-07-04 |

**Review passes**: requirements=2 (cap reached), design=2 (cap reached — approved 2026-07-04)

## Changelog — 2026-07-04 open questions resolved (requirements rev 3, design rev 3, tasks rev 3)

Owner delegated + authorised autonomous resolution of all seven design §10
open questions. Recorded as design §10 Resolved Decisions (RD-1..RD-7,
RD-N ⇔ former OQ-N) and propagated across requirements/design/tasks. One line
per resolution:

- **RD-1 (OQ-1):** Abstract Neo4j behind a shared read-only module — new `api/src/neo4j/read-only-graph.ts` (`fetchGraph`/`runReadOnlyGraph`, uncapped full-graph read); graphology engine migrates to `api/src/analytics/graph.ts`; no direct `getDriver()`/`driver.session()` in `api/src/analytics/`; NFR-02/AC-11 reworded; T-19 grep enforces. (T-20 creates the module + migration.)
- **RD-2 (OQ-2):** Build FR-04's weighted `depth × systems × roles` (T-10); as-built proxy kept as interim label only (T-03).
- **RD-3 (OQ-3):** Keep as-built short route names (`matrix`, `ai`); new tabs use FR names (`systems`, `consolidation`, `single-system`, `critical-paths`). FR-02/FR-07/AC-02/Scope updated.
- **RD-4 (OQ-4):** Rule-based AI candidates; analytics adopts chat's `leverage_score` ranking (analytics ≡ chat). `Ai.tsx` placeholder → real tab in T-13.
- **RD-4a (OQ-4a):** Ratify as-built vocabulary (`repetition`/`data_richness` enum `"med"`, `leverage_score` ≥ 0.5); FR-07 defaults + empty-state + AC-07(a) fixture revised; `"medium"`→`"med"` fixed in Dependencies.
- **RD-5 (OQ-5):** Detokenize `Complexity.tsx`/`Ai.tsx` chart hex → `var(--…)` tokens inside T-10/T-13; ramp tokens in T-21.
- **RD-6 (OQ-6):** Defer FR-08/FR-10/FR-11/FR-11a (PDF+hash, scheduler+cache, settings+audit, snapshot) to follow-up spec `cto-analytics-reporting` — FRs annotated `priority: deferred`; T-15/16/17/18 converted to deferral-ratification tasks (no code); AC-10 re-pointed to close at T-19 over the shipped 7 report GETs; PDF-library choice moves with the deferral; nothing deleted. Weights + AI-candidate definition ship as code-default constants (design §10.2) so no BUILD task depends on a deferred one.
- `scripts/spec/spec-traceability.sh .claude/specs/cto-analytics` → OK (12 FRs, 19 ACs, 21 tasks all traced).

## Changelog — 2026-07-04 design-review pass 1 absorbed (design rev 2, tasks rev 2)

`review-design.md` (pass 1, verdict: revise — 1 blocker, 5 concerns, 3 nits)
fully absorbed; every finding carries a "Resolves:" tag at its change site
(design §1a is the resolution index):

- **B-01**: design §3 FR-07 row now records the as-built rule-based
  AI-candidate surface — chat's live `ai_candidates` tool
  (`api/src/chat/tools/ai-candidates.ts`, `leverage_score` ranking via
  `runPassthrough`) and `shared/seed/retail-mini-enriched.json`'s vocabulary
  (`repetition: "low"|"med"|"high"`, `data_richness: "low"|"med"|"high"`) —
  including the contradiction with FR-07's `repetitive: true` defaults
  (default filter matches **zero** rows as-built; AC-07(a)'s fixture
  assumption wrong). New **OQ-4a** carries the vocabulary decision; OQ-4
  reframed; T-13 gated on both.
- **C-01**: AC-01's recipe defect pinned as design §2 Pin-4 — token home is
  `pwa/src/styles/companygraph/tokens.css` (no `pwa/src/theme.ts`, no ramp
  stops today); ramp created by T-21, asserted by T-07.
- **C-02**: OQ-1 gained option (d) — `runPassthrough`
  (`api/src/neo4j/read-only-session.ts`), the established server-side
  read-only pattern (14 chat tools), as the cheapest NFR-02-compliant path.
- **C-03**: AC-10 closure moved off T-14 — T-14/T-19 advance it, T-16/T-18
  extend `analytics-envelope.test.ts`, T-18 finally closes it.
- **C-04**: Native Conflicts suppressions assigned owners — T-07 (map
  touch/viewport/double-tap), T-08 (back-gesture guard + overscroll), T-13
  (CSV share-sheet), T-17 (PDF share-sheet); T-10 already owned its popover.
- **C-05**: 3-file cap restored — T-14's guard tests split to **T-19**; T-07
  split into T-07 (view) + **T-20** (server module) + **T-21** (ramp tokens +
  registration). Existing ids never renumbered; total_tasks 18 → 21.
- **N-01/N-02/N-03**: §4 cron entry corrected (FR-10 pins `0 2 * * *`; only
  TZ edge-handling open); DD-08 cites the project accent rule rather than
  FR-01 for FR-02's surface; §8.1 names the two existing Overview tests
  against `_baseline`'s stale "no automated coverage" claim.
- `scripts/spec/spec-traceability.sh .claude/specs/cto-analytics` → OK
  (12 FRs, 19 ACs, 21 tasks all traced).

## Changelog — 2026-07-04 reconciliation

The spec stalled at "requirements approved, design pending" on 2026-05-22.
The analytics surface was subsequently **built off-spec** and ratified on
2026-07-04 under `.claude/specs/_baseline/` (its FR-14 / design §4 coverage
map / task T-13). This reconciliation brings the spec to a truthful state
without pretending a design process happened that didn't:

- `requirements.md` frontmatter corrected `in-review` → `approved` (it had
  drifted from this file's approved row).
- `design.md` authored as an **as-built reconciliation** (status: draft):
  DD-01..DD-08 record decisions inherited from the built code "(as-built,
  adopted 2026-07-04)"; unbuilt FRs carry "not built — open" notes, not
  invented designs; conflicts (NFR-02 vs the graphology engine's direct
  driver use, route names, complexity formula, retired no-auth invariant)
  are surfaced as Open Questions OQ-1..OQ-6.
- `tasks.md` authored (status: draft): T-01..T-06 ratify the as-built
  surfaces (`pwa/src/views/analytics/{Overview,Matrix,Complexity,Ai}.tsx`,
  `api/src/routes/analytics.ts` + `api/src/ontology/analytics/graph.ts`,
  `api/src/routes/stats.ts`); T-07..T-18 are normal pending tasks for the
  genuinely unbuilt FRs (FR-01, FR-03, FR-05, FR-06, FR-07 live filter,
  FR-08, FR-09 endpoints, FR-10, FR-11, FR-11a) — open scope.
- Execution is **not** claimed: only AC-14 is closed (as-superseded per
  `_baseline` DD-07); AC-02/AC-04 are merely advanced by as-built variants;
  all other ACs are open.

**As-built vs open scope (from design §3):**
- Built (variants/partials, ratified via `_baseline`): FR-02 (matrix heatmap,
  no deep-links/virtualisation), FR-04 (proxy score, no weights), FR-09
  (`GET /api/v1/analytics/graph` only), FR-07 (static placeholder only).
- Not built — open: FR-01, FR-03, FR-05, FR-06, FR-07 (functional), FR-08,
  FR-10, FR-11, FR-11a.
- Superseded: NFR-06/AC-14 (no-auth invariant retired by `_baseline`
  DD-02/DD-07).

**Verification:**
- `verified_at`: 2026-07-04
- `verification_artifact`: BUILD set T-07..T-14, T-19..T-21 shipped via the `spec-exec` autonomous fan-out (11/11 tasks passed independent verify) and re-verified by the orchestrator: `bun run typecheck` green; API analytics server tests `bun test api/__tests__/analytics-{system-map,routes-scaffold,critical-path,complexity,ai-candidates,envelope,no-direct-driver,no-write-imports}.test.ts` → 63 pass / 0 fail; PWA analytics view tests (vitest) `bun --cwd pwa run test src/__tests__/analytics-{matrix,system-map,ai-empty-state,accent-ramp,complexity}.test.tsx` → 39 pass / 0 fail; full PWA suite 310 pass / 0 fail; RD-1 guard `bun test api/__tests__/analytics-no-direct-driver.test.ts` → zero direct `getDriver()`/`driver.session()` in `api/src/analytics/` (17 pass across the 3 guard files). AC-01/02/03/04/07/09(hash)-n-a/10(over shipped 7 GETs)/11/12 closed; AC-08/13/16 roll to `cto-analytics-reporting` with FR-08/10/11/11a. Integration tests `analytics-{consolidation,single-system}.integration.test.ts` — `manual: bun test:integration` with a seeded Neo4j (deferred to a stack run; not gating the unit-verified BUILD set).

**Artifacts:**
- 📄 Requirements: `.claude/specs/cto-analytics/requirements.md` (revised, revision 3 — open questions resolved 2026-07-04)
- 📄 Design: `.claude/specs/cto-analytics/design.md` (revised, revision 3 — §10 Resolved Decisions RD-1..RD-7, 2026-07-04)
- 📄 Tasks: `.claude/specs/cto-analytics/tasks.md` (revised, revision 3 — 21 tasks; T-15..T-18 deferral-ratification, 2026-07-04)
- 📝 Reviews: `.claude/specs/cto-analytics/review-requirements.md`, `review-requirements-pass-2.md`, `review-design.md` (pass 1: revise — absorbed)
- 🗂️ User stories: `companygraph-user-stories.html` (v0.1, 2026-05-22 — AN-1..AN-3)

**User stories owned** (8):
- **AN-1.1..AN-1.3 (System & integration overview)** — system map with degree centrality, domain↔system alignment matrix, consolidation candidates.
- **AN-2.1..AN-2.3 (Complexity & risk metrics)** — complexity score per journey, single-system journey report, critical-path report.
- **AN-3.1..AN-3.2 (AI-leverage candidates)** — rule-based AI-candidate filter (`repetition=="high" AND data_richness=="high" AND leverage_score>=0.5`, adopting chat's ranking per RD-4/RD-4a). The exec-summary PDF with graph-state hash (AN-3.2) is **deferred with FR-08 to `cto-analytics-reporting`** (RD-6).

**Persona**: P4 — Karim, CTO / Analyst. Weekly cadence with quarterly deep-dive. Success criterion: "Top 3 AI candidates surfaced with quantified evidence each quarter."

**Critical invariants** (must not regress; NFR-06's former no-auth invariant is retired per `_baseline` DD-07):
1. **No write paths from analytics into the graph.** NFR-03 + AC-12. (Cache writes to `analytics_*` SQLite tables are permitted; graph mutations are not.)
2. **Analytics graph reads via the shared read-only module** (`api/src/neo4j/read-only-*.ts`) — no direct `getDriver()`/`driver.session()` in `api/src/analytics/`. NFR-02 + AC-11, **RESOLVED via RD-1** (T-20 creates `read-only-graph.ts` + migrates the engine; T-19 grep enforces).
3. **Graph-state hash is deterministic** — NFR-05 + AC-09. **Deferred with FR-08 to `cto-analytics-reporting`** (RD-6).
4. **PDF output is byte-reproducible** — NFR-04 + AC-08. **Deferred with FR-08 to `cto-analytics-reporting`** (RD-6).

**Next**:
1. Execute the BUILD set (T-07..T-14, T-19..T-21) in the design §10.1 / tasks dependency spine order: T-20 → T-14 → report modules + T-19; T-21/T-07 for the system-map view; T-08/T-10/T-13 view completions. T-01..T-06 ratify already-built code; T-15..T-18 record the RD-6 deferral (no code). Honor pass-2 carry-forwards: C-06 (register each new view in `route.ts` + `views/index.tsx` — tab registration for the report tabs rides in T-09), N-04/N-05 (wording only).
2. Open the follow-up spec `cto-analytics-reporting` (via `/spec new`) to carry FR-08/FR-10/FR-11/FR-11a — the PDF+hash, nightly scheduler+cache, settings+audit, and cache-snapshot endpoint, plus the PDF-library choice.
