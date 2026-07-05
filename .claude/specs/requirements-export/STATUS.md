# Spec: requirements-export
**Size**: small | **Created**: 2026-07-04 | **Current Phase**: execution:complete

review_passes: 0
<!-- Per-phase review counter for the HARD CAP (1 review + max 1 re-review).
     Small spec: no design + no reviews per size rules — counter stays 0. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | orchestrator (XD-17 single-shot) | 2026-07-05 |
| Tasks | approved | orchestrator (XD-17 single-shot) | 2026-07-05 |
| Execution | complete | orchestrator | 2026-07-05 |

<!-- Small spec: Design, Design Review, Req Review, and Task Review rows omitted
     per spec-workflow (small = requirements → tasks → execute; no reviews). -->

**Execution ledger:**
| Task | Status | Date |
|------|--------|------|
| T-01 shared schema (spec-export.ts) | done | 2026-07-05 |
| T-02 pure assembler (spec-document.ts) | done | 2026-07-05 |
| T-03 Markdown renderer (spec-markdown.ts) | done | 2026-07-05 |
| T-04 route handler + dispatch (spec-export.ts) | done | 2026-07-05 |
| T-05 error code + RBAC + seed role | done | 2026-07-05 |
| T-06 OpenAPI registration | done | 2026-07-05 |
| T-07 integration test (deferred — needs live Neo4j) | pending | - |
| T-08 SpecExport view replaces placeholder | done | 2026-07-05 |
| T-09 PWA api client (specExport) | done | 2026-07-05 |
| T-10 download controls + degraded banner | done | 2026-07-05 |
| T-11 PWA unit tests | done | 2026-07-05 |

**Verification:**
- `verified_at`: 2026-07-05
- `verification_artifact`: `bun test` (16 unit tests pass: 7 schema, 3 assembler, 6 markdown, 3 PWA); `bun run typecheck` passes; integration tests (T-07) deferred until live Neo4j

**Artifacts:**
- 📄 Requirements: `.claude/specs/requirements-export/requirements.md`
- 📄 Tasks: `.claude/specs/requirements-export/tasks.md` (11 tasks; small spec — no design/review)

**Next**: Present tasks at the gate for approval; on approval, execute (small spec skips design + reviews). Execution is **blocked by build order** — all five dependencies (`story-spec-core`, `key-activity-optimizer`, `kpi-impact-mapping`, `ddd-system-modeling`) + transitive `model-workspace-core` must merge first (wave 5). Orchestrator: surface OQ-1 (in-process seam) + OQ-2 (hand-rolled Markdown) in the consolidated report (XD-17).
