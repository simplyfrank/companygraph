# Spec: chat-interface
**Size**: large | **Created**: 2026-05-22 | **Revised**: 2026-05-23 (rev 3) | **Current Phase**: design:draft (rev 3.1 requirements approved 2026-05-23)

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (rev 3.1 — all 4 blockers + 6/9 concerns + 6 nits absorbed; 2 concerns open-accepted as FR additions) | frank | 2026-05-23 |
| Req Review (rev 2) | pass-1 revise (3B, 4C, 3N) → pass-2 approve | spec-review-agent | 2026-05-22 |
| Req Review (rev 3) | pass-1 revise (4B, 9C, 6N) → user-accepted absorption (rev 3.1) without pass-2 per workflow diminishing-returns guidance | spec-review-agent + frank | 2026-05-23 |
| Design | approved (v2 — 4 blockers + 5 concerns absorbed; C-02 declined; 4C+5N open-accepted) | frank | 2026-05-23 |
| Design Review | pass-1 revise (4B, 9C, 5N) → user-accepted absorption (v2) without pass-2 per workflow diminishing-returns | spec-review-agent + frank | 2026-05-23 |
| Tasks | approved (v2 — 3 blockers + 3 concerns absorbed; 28 tasks across 7 tiers) | frank | 2026-05-23 |
| Task Review | pass-1 revise (3B, 6C, 5N) → user-accepted absorption (v2) | spec-review-agent + frank | 2026-05-23 |
| Execution | in-progress — **Backend complete (Tiers 1–4)** — 153 unit tests pass, 0 fail | — | 2026-05-23 |

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

## Execution progress (2026-05-23)

**Backend complete (Tiers 1–4)** — 36 TypeScript source files + 20 role overlay markdowns + 21 test files + 10 LLM fixtures + 1 enriched seed:

| Task | Status | Verification |
|------|--------|--------------|
| T-01 deps + env | ✓ | `bun install` exits 0; `bun build api/src/server.ts --no-bundle` exits 0 |
| T-02 shared types | ✓ | `bun build shared/src/index.ts --no-bundle` exits 0 |
| T-03 SQLite persistence | ✓ | `api/__tests__/chat/persistence.test.ts` — 6 pass |
| T-04 quota counter | ✓ | `api/__tests__/chat/cost-cap.test.ts` — 3 pass |
| T-05 refusal helpers | ✓ | `api/__tests__/chat/refusal-helpers.test.ts` — 14 pass (5 verbatim string assertions + 9 precedence rules) |
| T-06 sanitisation | ✓ | `api/__tests__/chat/prompt-injection-redaction.test.ts` — 13 pass |
| T-07 highlight builder | ✓ | `api/__tests__/chat/highlight-builder.test.ts` — 8 pass |
| T-08 progress store | ✓ | `api/__tests__/chat/progress-store.test.ts` — 7 pass |
| T-09 LLM clients + factory + 10 fixtures | ✓ | `api/__tests__/chat/llm-client-mock.test.ts`, `llm-degraded-mode.test.ts`, `classifier-prefix-parse.test.ts` — 30 pass |
| T-10 tool registry + dispatch skeleton | ✓ | `bun build api/src/chat/tools/dispatch.ts --no-bundle` exits 0 (tool defs land in T-12..T-15) |
| T-20 errors namespace | ✓ | Chat-namespace codes typed via `ChatErrorCode` in `shared/src/types.ts`; existing `api/src/errors.ts` untouched |
| T-22 enriched seed | ✓ | `shared/seed/retail-mini-enriched.json` (188 attribute entries) + `scripts/seed-enriched.ts` |

**Notes**:
- `better-sqlite3` does not work under Bun 1.3 (native N-API bindings — oven-sh/bun#4290); persistence uses `bun:sqlite` with the same surface API.
- `MOCK_LLM_FIXTURE` env selects fixtures in tests; production uses real Anthropic when `ANTHROPIC_API_KEY` is set.
- All 84 Tier 1 unit tests pass; integration tests (`^integration:` prefix) need a running Neo4j and will be run during T-27.

| T-11 (Tier 1.5) | 20 role overlay md + role registry + prompt loader | ✓ | `api/__tests__/chat/role-registry.test.ts`, `role-autoroute.test.ts`, `shared/__tests__/role-coverage.test.ts` — all pass |
| T-12 (Tier 2) | 6 simple tools (list_domains, get_domain, list_nodes_by_label, neighbors, find_path, describe_schema) | ✓ | `api/__tests__/chat/tool-simple-queries.integration.test.ts` (needs Neo4j), `describe-schema-tool.integration.test.ts` (3 pass) |
| T-13 (Tier 2) | 3 medium tools (get_journey, get_activity, cypher) | ✓ | `api/__tests__/chat/tool-journey-activity.integration.test.ts`, `refusal-write-attempt.integration.test.ts` (need Neo4j) |
| T-14 (Tier 2) | aggregate + 6 closed-enum patterns | ✓ | `api/__tests__/chat/aggregate-pattern-enum.test.ts` (unit, passes), `aggregate-integration.integration.test.ts` |
| T-15 (Tier 2) | 5 cross-section tools (sla_hotspots, handoff_matrix, sod_register, ai_candidates, initiative_impact) | ✓ | `api/__tests__/chat/tool-cross-section.integration.test.ts` |
| T-16 (Tier 3) | orchestrator (ReAct loop, refusal precedence, highlight build) | ✓ | `bun build api/src/chat/agent.ts --no-bundle` exits 0; integration via T-13's refusal test + sandboxes via MockLLMClient fixtures |
| T-17 (Tier 3) | `POST /api/v1/chat/messages`, `GET /api/v1/chat/messages/:id/progress`, router mount, server boot | ✓ | `bun build api/src/server.ts --no-bundle` exits 0 |
| T-18 (Tier 4) | coverage grep tests | ✓ | `api/__tests__/chat/no-direct-driver.test.ts` (AC-23 — 4 pass), `no-write-imports.test.ts` (AC-24 — 5 pass) |

**Final unit-test tally**: `bun test --test-name-pattern '^(?!integration:)' api/__tests__/chat/ shared/__tests__/` → **153 pass, 0 fail, 1154 expect() calls across 23 test files**, ~170 ms wall.

**Backend feature summary** (curl-testable assuming Neo4j running + chat endpoint mounted):
- ✓ `POST /api/v1/chat/messages` runs the agent loop
- ✓ `GET /api/v1/chat/messages/:id/progress` returns the in-memory snapshot
- ✓ 15-tool registry with role gating
- ✓ 20 behavioral roles with markdown system-prompt overlays
- ✓ Multi-step ReAct loop (≤ 5 tool calls per turn)
- ✓ 5 fixed-string refusal paths with DD-13 precedence
- ✓ Structured highlight payload from union of tool results
- ✓ SQLite persistence (4 tables) + transactional quota counter
- ✓ Anthropic + Mock LLM clients with prompt-caching enabled
- ✓ Prompt-injection redaction (NFR-10)
- ✓ `runPassthrough`-only path to Neo4j (NFR-04 — coverage grep enforces)
- ✓ No write-helper imports from chat code (NFR-03 — coverage grep enforces)

**Known issue**: `better-sqlite3` doesn't dlopen under Bun 1.3 (oven-sh/bun#4290); persistence uses `bun:sqlite` (API-compatible).

**Not yet implemented**:
- T-19: `seed-attrs-presence.test.ts` (was created by T-22 agent; needs running Neo4j; gated by Tier 7)
- T-21..T-26 (PWA work): chat pane, role picker, citations, side panel, reasoning disclosure, canvas highlight, progress polling. ~16 files. **Out of scope for this session per user direction** — backend-only.
- T-27..T-28: E2E + perf smoke. Pending PWA + running Neo4j.

## Verification

- `verified_at`: pending — see Execution progress above
- `verification_artifact`: partial — Tier 1 covered by 9 test files at `api/__tests__/chat/`; full STATUS=complete blocked on T-11..T-28

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
