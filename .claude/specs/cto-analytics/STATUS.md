# Spec: cto-analytics
**Size**: medium | **Created**: 2026-05-22 | **Current Phase**: design:approved — tasks approved (no task review per medium rules); execution blocked on design §10 open questions

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (revision 2 — pass-1 findings absorbed, 2 partial open-accepted) | frank | 2026-05-22 |
| Req Review | pass-1 revise (4 blockers, 4 concerns, 5 nits, 3 open-nit-accepted) → pass-2 approve (14/14 cleanly absorbed, 2 partial open-accepted, 0 regressed) | spec-review-agent | 2026-05-22 |
| Design | **approved** (revision 2 — as-built reconciliation; pass-2 verdict approve, autonomous review gate per 2026-07-04 governance completion) | spec-reviewer (pass-2 approve) | 2026-07-04 |
| Design Review | pass-1 revise (B-01; C-01..C-05; N-01..N-03) → all 9 absorbed in rev 2 → **pass-2 approve** (cap reached; new non-blocking C-06 view-registration gap + N-04/N-05 carry to execution) | spec-reviewer | 2026-07-04 |
| Tasks | approved (revision 2 — 21 tasks; T-19..T-21 added, no renumbering; no task review per medium rules). Note C-06: T-10/T-11/T-12/T-17 must register views in `route.ts`/`views/index.tsx` at execution | - | 2026-07-04 |
| Task Review | n/a (medium spec — no task review per workflow) | - | - |
| Execution | pending — built surfaces are governed by `_baseline`; this spec tracks its own remaining scope (T-07..T-21) | - | - |

**Review passes**: requirements=2 (cap reached), design=2 (cap reached — approved 2026-07-04)

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
- `verified_at`: pending
- `verification_artifact`: pending

**Artifacts:**
- 📄 Requirements: `.claude/specs/cto-analytics/requirements.md` (approved 2026-05-22, revision 2)
- 📄 Design: `.claude/specs/cto-analytics/design.md` (revised — as-built reconciliation, revision 2, pass-1 findings absorbed 2026-07-04)
- 📄 Tasks: `.claude/specs/cto-analytics/tasks.md` (draft, revision 2 — 21 tasks, 2026-07-04)
- 📝 Reviews: `.claude/specs/cto-analytics/review-requirements.md`, `review-requirements-pass-2.md`, `review-design.md` (pass 1: revise — absorbed)
- 🗂️ User stories: `companygraph-user-stories.html` (v0.1, 2026-05-22 — AN-1..AN-3)

**User stories owned** (8):
- **AN-1.1..AN-1.3 (System & integration overview)** — system map with degree centrality, domain↔system alignment matrix, consolidation candidates.
- **AN-2.1..AN-2.3 (Complexity & risk metrics)** — complexity score per journey, single-system journey report, critical-path report.
- **AN-3.1..AN-3.2 (AI-leverage candidates)** — `repetitive=true AND data_richness=high` filter, exec-summary PDF with graph-state hash.

**Persona**: P4 — Karim, CTO / Analyst. Weekly cadence with quarterly deep-dive. Success criterion: "Top 3 AI candidates surfaced with quantified evidence each quarter."

**Critical invariants** (must not regress; NFR-06's former no-auth invariant is retired per `_baseline` DD-07):
1. **No write paths from analytics into the graph.** NFR-03 + AC-12. (Cache writes to `analytics_*` SQLite tables are permitted; graph mutations are not.)
2. **Cypher routing per NFR-02 + AC-11** — subject to design OQ-1 (the as-built graphology engine reads the driver directly; needs a user decision before T-14).
3. **Graph-state hash is deterministic** — canonical JSON ordering, including parsed-and-resorted `attributes_json`. NFR-05 + AC-09.
4. **PDF output is byte-reproducible** — same graph-state hash → same PDF bytes (modulo embedded date). NFR-04 + AC-08.

**Next**:
1. User answers to design §10 OQ-1..OQ-6 **+ OQ-4a** (NFR-02 amendment incl. the new `runPassthrough` option (d), complexity formula, route naming, AI-candidates scope, canonical AI-candidate attribute vocabulary, chart tokens, PDF/scheduler chunk). OQ-4a gates T-13; OQ-1 gates T-14.
2. Execute pending tasks T-07..T-21 (T-01..T-06 are ratifications of already-built code). Honor pass-2 carry-forwards: C-06 (register each new view in `route.ts` + `views/index.tsx`), N-04/N-05 (wording only).
