# Spec: chat-interface
**Size**: large | **Created**: 2026-05-22 | **Revised**: 2026-05-23 (rev 3) | **Current Phase**: design:draft (rev 3.1 requirements approved 2026-05-23)

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (rev 3.1 — all 4 blockers + 6/9 concerns + 6 nits absorbed; 2 concerns open-accepted as FR additions) | frank | 2026-05-23 |
| Req Review (rev 2) | pass-1 revise (3B, 4C, 3N) → pass-2 approve | spec-review-agent | 2026-05-22 |
| Req Review (rev 3) | pass-1 revise (4B, 9C, 6N) → user-accepted absorption (rev 3.1) without pass-2 per workflow diminishing-returns guidance | spec-review-agent + frank | 2026-05-23 |
| Design | approved (v2 — 4 blockers + 5 concerns absorbed; C-02 declined; 4C+5N open-accepted) | frank | 2026-05-23 |
| Design Review | pass-1 revise (4B, 9C, 5N) → user-accepted absorption (v2) without pass-2 per workflow diminishing-returns | spec-review-agent + frank | 2026-05-23 |
| Tasks | in-progress | — | 2026-05-23 |
| Task Review | pending (large spec — task review required) | — | — |
| Execution | pending | — | — |

**Review passes** (per-phase, reset on rev 3 redesign): requirements=1 (cap=2, accepted at 1), design=0, tasks=0

## Revision history

- **rev 1** (2026-05-22) — initial draft, NL→Cypher→narrate.
- **rev 2** (2026-05-22) — absorbed pass-1 review's 3 blockers, 4 concerns, 3 nits. Approved by frank.
- **rev 3** (2026-05-23) — agentic redesign per user directive "fully implement the dynamic agentic chat application to manage the interactions with the graph". Adds tool registry (15 tools), behavioral roles (20), ReAct loop (≤ 5 calls/turn), highlight payload contract, statistics & aggregation. Supersedes rev 2's single-turn architecture. All rev-2 safety invariants preserved (refusal-not-confabulation, read-only Cypher routing, sanitisation, no-write coverage, no-auth grep).

## Locked decisions (rev 3)

| Decision | Lock | Rationale |
|----------|------|-----------|
| LLM provider | Anthropic Claude Sonnet 4.6 via `@anthropic-ai/sdk` | House pick; tool-use API mature |
| Agent loop | Multi-step ReAct, cap=5 tool calls/turn | Matches wireframe interactions; cap = NFR-budget |
| Roles | 14 journey + 5 cross-section + 1 default = 20 | One-to-one with `companygraph-journeys.html` mock |
| Highlight contract | `{ nodes, edges, paths, style }` | Matches wireframe CSS selectors `.gnode.selected`, `.gedge.{highlight,breach,warn}` |

## Sizing rationale (rev 3 → large)

- 30 acceptance criteria (was 18 in rev 2)
- ~25–35 source files (chat handler, agent loop, 15 tools, 20 role configs, LLM client, schema-context, SQLite migrations, PWA chat pane + highlight, citations, side panel, reasoning disclosure)
- Tool review required per workflow (large)

## User stories owned (9 + journey-coverage)

- **CU-1.1..CU-1.4** — Ask in plain English; refusal; context carry; side-panel citations
- **CU-2.1..CU-2.3** — Trust + guard-rails (read-only, truncation, latency)
- **CU-3.1..CU-3.2** — Bookmarks; share + fork
- **journey coverage** — every `uj_*` in `companygraph-journeys.html` mapped to one role

## Depends on

- `graph-core` — hard. All Cypher via `POST /api/v1/query/cypher`. `find_path` via `GET /api/v1/query/findPath`. `neighbors` via `GET /api/v1/query/neighbors/:id`.
- `ontology-manager` — soft. `describe_schema` tool prefers `GET /api/v1/schema`; fallback to compile-time `NODE_LABELS`/`EDGE_TYPES`.
- `process-explorer-ui` — soft. Citations + highlight canvas integration. Degrades to chat-only when not yet shipped.

## Critical invariants (rev 3) — must not regress

1. **No write paths from chat.** AC-23, AC-24. Coverage greps on `api/src/chat/` + `api/src/chat/tools/` for `driver`, `executeRead`, `executeWrite`, `createNode`, etc.
2. **No HTML/Markdown interpretation from LLM output.** AC-22 (3 vectors). Never `dangerouslySetInnerHTML`.
3. **Refusal-not-confabulation.** 5 fixed strings (FR-G01..G05). Orchestrator-emitted, not LLM-emitted.
4. **Read-only Cypher gate.** Every tool's Cypher routes through `executeCypherPassthrough`.
5. **No auth code paths.** AC-25. Extends `graph-core/AC-22` grep to chat surface.

## Verification

- `verified_at`: pending
- `verification_artifact`: pending

## Artifacts

- 📄 Requirements: `.claude/specs/chat-interface/requirements.md` (rev 3)
- 📄 Design: `.claude/specs/chat-interface/design.md` (pending)
- 📄 Tasks: `.claude/specs/chat-interface/tasks.md` (pending)
- 📝 Reviews (rev 2): `.claude/specs/chat-interface/review-requirements.md`, `.claude/specs/chat-interface/review-requirements-pass-2.md`
- 📝 Reviews (rev 3): `.claude/specs/chat-interface/review-requirements-rev3.md` (pending)
- 🗂️ User stories: `companygraph-user-stories.html` (v0.1, 2026-05-22 — CU-1..CU-3)
- 🗂️ Journey + cross-section mock: `companygraph-journeys.html` (v0.1, 2026-05-22 — 14 journeys, 5 cross-section views)

## Open design questions (carried from rev-3 requirements §Risks)

1. Per-role system prompts + few-shot examples — design phase commits 20 prompts under `api/src/chat/roles/prompts/`.
2. `zod` → JSON Schema converter for Anthropic tool-use API.
3. Auto-routing classifier latency — embedded vs separate call.
4. Highlight CSS class catalog — confirm + extend.
5. Share preserves `role_id_pin`?
6. Tool-result memoization within a turn.
7. `aggregate` pattern injection risk — template + grammar.
8. Selection-aware substitution for path selections.
9. Tool-budget exhausted — system-prompt addendum to avoid speculation.
10. Role-registry CI check: every journey id has a role.
11. Prompt-injection regex FP tuning.
12. `describe_schema` vs `tool_registry.list()` separation.
13. SQLite migrations + IF NOT EXISTS boot.
14. Anthropic API quota / `ANTHROPIC_API_KEY` startup check.
15. Why LLM lock at requirements (rev-3 decision).

## Next

1. **Requirements gate (rev 3)** — user approves the rev 3 requirements (THIS STEP).
2. After approval → spawn spec-review sub-agent for pass 1 of rev 3.
3. Resolve blockers (if any) → optionally pass 2 → approve.
4. Design phase.
5. Design review.
6. Tasks phase + review.
7. Execution (fan out parallel agents where independent).
8. Verification gate.
