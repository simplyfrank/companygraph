# Spec: cto-analytics
**Size**: medium | **Created**: 2026-05-22 | **Current Phase**: requirements:approved — ready for design

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (revision 2 — pass-1 findings absorbed, 2 partial open-accepted) | frank | 2026-05-22 |
| Req Review | pass-1 revise (4 blockers, 4 concerns, 5 nits, 3 open-nit-accepted) → pass-2 approve (14/14 cleanly absorbed, 2 partial open-accepted, 0 regressed) | spec-review-agent | 2026-05-22 |
| Design | pending | - | - |
| Design Review | pending (medium specs require design review) | - | - |
| Tasks | pending | - | - |
| Task Review | n/a (medium spec — no task review per workflow) | - | - |
| Execution | pending | - | - |

**Review passes**: requirements=2 (cap reached), design=0

**Open-accepted for design phase** (carried from pass-2 review):
1. Open-1: AC-06 covers `depth_cap` and `path_budget` truncation reasons but not the third enumerated reason `wall_clock` — add a manual repro or extend the test fixture.
2. Open-2: Scope says "Ten" endpoints but the breakdown (`8 + GET/PATCH /settings + /snapshot`) reads as either 10 or 11 depending on whether GET+PATCH count as one or two — design phase should commit to the count.
3. Open-3: N-04's FR-02 rename to `?system_id=:sid&domain_id=:did` did not propagate to AC-02's verification recipe (still reads `?system=:id&domain=:id`).

**User stories owned** (8):
- **AN-1.1..AN-1.3 (System & integration overview)** — system map with degree centrality, domain↔system alignment matrix, consolidation candidates.
- **AN-2.1..AN-2.3 (Complexity & risk metrics)** — complexity score per journey, single-system journey report, critical-path report.
- **AN-3.1..AN-3.2 (AI-leverage candidates)** — `repetitive=true AND data_richness=high` filter, exec-summary PDF with graph-state hash.

**Persona**: P4 — Karim, CTO / Analyst. Weekly cadence with quarterly deep-dive. Success criterion: "Top 3 AI candidates surfaced with quantified evidence each quarter."

**Depends on**:
- `graph-core` — for the Cypher route (read-only) + `GET /api/v1/export` (basis for the graph-state hash).
- `ontology-manager` — **mandatory soft dependency** for the `Activity.repetitive` (boolean) and `Activity.data_richness` (enum) attribute schemas. If those attributes are not registered, the AI-candidate filter shows the named empty-state copy in FR-07.
- `process-explorer-ui` — soft dependency for the deep-links from matrix cells / consolidation rows / critical-path rows / AI-candidate rows into the underlying activity lists.

**Sizing rationale**: 11 FRs, 16 ACs, 8 new REST endpoints under `/api/v1/analytics/*`, SQLite cache + nightly scheduler, server-side PDF generation. ~10–12 files. Classified **medium** — requires design phase + design review, no task review.

**Verification:**
- `verified_at`: pending
- `verification_artifact`: pending

**Artifacts:**
- 📄 Requirements: `.claude/specs/cto-analytics/requirements.md`
- 📄 Design: `.claude/specs/cto-analytics/design.md` (pending)
- 📄 Tasks: `.claude/specs/cto-analytics/tasks.md` (pending)
- 📝 Reviews: `.claude/specs/cto-analytics/review-*.md` (pending)
- 🗂️ User stories: `companygraph-user-stories.html` (v0.1, 2026-05-22 — AN-1..AN-3)

**Critical invariants** (these must NOT regress across reviews / execution):
1. **No write paths from analytics into the graph.** NFR-03 + AC-12. (Cache writes to `analytics_*` SQLite tables are permitted; graph mutations are not.)
2. **All Cypher routes through `/api/v1/query/cypher`.** NFR-02 + AC-11. No direct driver use in `api/src/analytics/`.
3. **Graph-state hash is deterministic** — canonical JSON ordering, including parsed-and-resorted `attributes_json`. NFR-05 + AC-09.
4. **PDF output is byte-reproducible** — same graph-state hash → same PDF bytes (modulo embedded date). NFR-04 + AC-08.

**Open design questions** (carried from requirements §Risks for the design phase to resolve):

1. Critical-path algorithm on cyclic graphs — depth-limited DFS + memoization with cap ≤ 20 (Risks #1).
2. Complexity-score weights folded into the graph-state hash so PDFs are weight-reproducible (Risks #2).
3. Nightly precompute cron expression vs tz-aware string (Risks #3).
4. PDF layout + page count budget (~5 pages) (Risks #4).
5. Domain↔system matrix virtualisation strategy at 10k cells — `react-window` + pre-filter (Risks #5).
6. Hash protocol committed in a `hash-protocol.md` artifact — sorted keys, parsed `attributes_json`, deterministic stringify (Risks #6).
7. CSV export UTF-8 BOM (Risks #7).
8. AI-candidate attribute schema coupling via `analytics_settings` (Risks #9).
9. "Refresh now" button vs accept-staleness operating model (Risks #10).
10. PDF library choice — `@react-pdf/renderer` (recommended for React stack coherence) vs `pdfkit` vs `puppeteer`.

**Next**:
1. Requirements gate (this spec) — user approval, then medium-spec review pass via the spec-review sub-agent.
2. Sequencing note: this spec can run in parallel with `chat-interface`, but BOTH depend on `ontology-manager` being far enough along to register the `repetitive` / `data_richness` attribute schemas (FR-07).
3. After approval → design phase. Design must commit the PDF library, the hash protocol, the critical-path algorithm, and the scheduler cadence.
