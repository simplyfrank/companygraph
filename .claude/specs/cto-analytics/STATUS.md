# Spec: cto-analytics
**Size**: medium | **Created**: 2026-05-22 | **Current Phase**: design:draft — as-built reconciliation awaiting review

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (revision 2 — pass-1 findings absorbed, 2 partial open-accepted) | frank | 2026-05-22 |
| Req Review | pass-1 revise (4 blockers, 4 concerns, 5 nits, 3 open-nit-accepted) → pass-2 approve (14/14 cleanly absorbed, 2 partial open-accepted, 0 regressed) | spec-review-agent | 2026-05-22 |
| Design | authored (as-built reconciliation, draft — awaiting review) | - | 2026-07-04 |
| Design Review | pending (medium specs require design review) | - | - |
| Tasks | authored (draft — awaiting design review outcome) | - | 2026-07-04 |
| Task Review | n/a (medium spec — no task review per workflow) | - | - |
| Execution | pending — built surfaces are governed by `_baseline`; this spec tracks its own remaining scope (T-07..T-18) | - | - |

**Review passes**: requirements=2 (cap reached), design=0

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
- 📄 Design: `.claude/specs/cto-analytics/design.md` (draft — as-built reconciliation, 2026-07-04)
- 📄 Tasks: `.claude/specs/cto-analytics/tasks.md` (draft, 2026-07-04)
- 📝 Reviews: `.claude/specs/cto-analytics/review-requirements.md`, `review-requirements-pass-2.md`
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
1. Design review (pass 1/2) of the as-built reconciliation `design.md`.
2. User answers to design §10 OQ-1..OQ-6 (NFR-02 amendment, complexity formula, route naming, AI-candidates scope, chart tokens, PDF/scheduler chunk).
3. On design approval → tasks gate, then execute pending tasks T-07..T-18 (T-01..T-06 are ratifications of already-built code).
