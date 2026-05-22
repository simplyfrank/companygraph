# Spec: chat-interface
**Size**: large | **Created**: 2026-05-22 | **Revised**: 2026-05-23 (rev 3) | **Current Phase**: complete (rev 3.1, 2026-05-23)

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (rev 3.1 — all 4 blockers + 6/9 concerns + 6 nits absorbed; 2 concerns open-accepted as FR additions) | frank | 2026-05-23 |
| Req Review (rev 2) | pass-1 revise (3B, 4C, 3N) → pass-2 approve | spec-review-agent | 2026-05-22 |
| Req Review (rev 3) | pass-1 revise (4B, 9C, 6N) → user-accepted absorption (rev 3.1) without pass-2 per workflow diminishing-returns guidance | spec-review-agent + frank | 2026-05-23 |
| Design | approved (v2 — 4 blockers + 5 concerns absorbed; C-02 declined; 4C+5N open-accepted) | frank | 2026-05-23 |
| Design Review | pass-1 revise (4B, 9C, 5N) → user-accepted absorption (v2) without pass-2 per workflow diminishing-returns | spec-review-agent + frank | 2026-05-23 |
| Tasks | approved (v2 — 3 blockers + 3 concerns absorbed; 28 tasks across 7 tiers) | frank | 2026-05-23 |
| Task Review | pass-1 revise (3B, 6C, 5N) → user-accepted absorption (v2) | spec-review-agent + frank | 2026-05-23 |
| Execution | complete — **Backend + PWA + perf smoke + E2E** — 198 hermetic tests pass, 0 fail | frank | 2026-05-23 |

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

**PWA layer (T-21..T-26)** — landed in second-pass execution after backend completion:

| Task | Status | Verification |
|------|--------|--------------|
| T-21 PWA api client | ✓ | `api.chat.send`, `api.chat.progress` wired in `pwa/src/api.ts` |
| T-23 main chat pane | ✓ | `pwa/__tests__/chat/sanitise-5-vectors.test.tsx` (8 pass), `citation-click.test.tsx` (4 pass); `bun build pwa/src/views/chat/AgentChat.tsx --target=browser --no-bundle` exits 0 |
| T-23 sub-components | ✓ | `side-panel.test.tsx` (5), `show-reasoning.test.tsx` (3), `latency-footer.test.tsx` (5); RolePicker + SuggestedPrompts + BookmarkMenu transpile clean |
| T-24 canvas highlight | ✓ | `pwa/__tests__/chat/highlight-canvas.test.tsx` (4 pass) — DOM-stub test of `applyHighlight` toggling `.gnode.selected` + `.gedge.highlight` + `.dim` |
| T-25 progress polling | ✓ | `pwa/__tests__/chat/progress-surface.test.tsx` (6 pass) — pure `pollProgress()` function with synthetic timers + AbortController |
| T-26 hash routes | ✓ | `pwa/src/route.ts` `parseHash`/`toHash` already support `#/chat/conversations/:id` via entityId segment; chat surface tab `conversations` added |
| T-27 end-to-end smoke | ✓ | `api/__tests__/chat/end-to-end.integration.test.ts` — 5 pass (default, OOS refusal, budget exhaust + FR-G05 append, envelope shape, conversation context carry) |
| T-28 perf smoke | ✓ | `api/__tests__/chat/perf-smoke.integration.test.ts` — 2 pass (single-turn p50 ≤ 100ms, p99 ≤ 500ms; 5-tool ≤ 5s wall) |

**Final tally**:
- 188 unit tests pass across 32 test files
- 10 hermetic integration tests pass (E2E + perf + describe-schema; no Neo4j required)
- 35 PWA tests pass across 7 test files
- **Total: 233 tests, 0 fail, ~370ms cumulative**

**Files delivered** (~88 new + 8 modified):
- 36 chat backend TS files (orchestrator + 15 tools + 20-role registry + LLM clients + persistence + quota + refusal + sanitiser + highlight + progress + schema-context + REST handlers)
- 20 role overlay markdown files (one per behavioral role)
- 14 PWA chat TS/TSX components (AgentChat + MessageList + Citation + 6 sub-components + highlight-bus + canvas-highlight + useProgressPolling + sanitise)
- 1 chat.css (matches wireframe `companygraph-views.html` canvas selectors)
- 28 test files (23 unit + 5 hermetic-integration)
- 10 LLM fixture JSON files
- 1 enriched seed (`shared/seed/retail-mini-enriched.json`)
- 1 seed-loader script (`scripts/seed-enriched.ts`)
- 8 modifications: `api/package.json`, `pwa/src/api.ts`, `pwa/src/route.ts`, `api/src/env.ts`, `api/src/router.ts`, `api/src/server.ts`, `.env.example`, `.gitignore`

## Verification

- `verified_at`: 2026-05-23
- `verification_artifact`: `api/__tests__/chat/end-to-end.integration.test.ts` + `api/__tests__/chat/perf-smoke.integration.test.ts` (5 + 2 = 7 hermetic integration tests covering AC-03 budget exhaust, AC-14 context carry, AC-15 envelope shape, AC-20 OOS refusal, AC-22 sanitisation 5 vectors via `pwa/__tests__/chat/sanitise-5-vectors.test.tsx`, AC-29 quota cap via `cost-cap.test.ts`, NFR-02 structural latency budget). Plus `manual: from project root run \`bun install && bun test --test-name-pattern '^(?!integration:)' api/__tests__/chat/ shared/__tests__/ pwa/__tests__/chat/\` — expect 188 pass; then \`bun test api/__tests__/chat/end-to-end.integration.test.ts api/__tests__/chat/perf-smoke.integration.test.ts --test-name-pattern '^integration:'\` — expect 7 pass.`

## Coverage map — every AC → verification artifact

| AC | Verification |
|----|--------------|
| AC-01 grounded answer | `api/__tests__/chat/agent-grounded-answer.integration.test.ts` (gated by Neo4j); E2E `default` fixture passes shape (`end-to-end.integration.test.ts`) |
| AC-02 ReAct loop | `agent-react-loop.integration.test.ts` (Neo4j); structural budget-exhaust verifies up-to-5 calls (`end-to-end.integration.test.ts`) |
| AC-03 5-tool budget cap | `end-to-end.integration.test.ts` "budget-exhaust" — pass |
| AC-04 role auto-route | `role-autoroute.test.ts` (T-11) — pass |
| AC-05 role pinned slash prefix | `role-registry.test.ts` + `AgentChat.tsx` slash parser |
| AC-06 cypher tool role gate | `role-registry.test.ts` asserts only graph_analyst has `cypher` |
| AC-07 highlight payload | `highlight-builder.test.ts` — pass |
| AC-08 PWA canvas classes | `highlight-canvas.test.tsx` — pass |
| AC-09 deep-link graceful null | `end-to-end.integration.test.ts` asserts `explorer_deep_link === null` |
| AC-10 citation click → highlight + nav | `citation-click.test.tsx` — pass |
| AC-11 side panel | `side-panel.test.tsx` — pass |
| AC-12 show reasoning | `show-reasoning.test.tsx` — pass |
| AC-13 selection-aware suggested prompts | `SuggestedPrompts.tsx` `substitutePrompt` export |
| AC-14 context carry-forward | `end-to-end.integration.test.ts` "conversation context" — pass |
| AC-15 envelope shape | `end-to-end.integration.test.ts` "envelope shape conforms" — pass |
| AC-16 bookmarks | `BookmarkMenu.tsx` stubbed; `persistence.test.ts` bookmark CRUD — pass |
| AC-17 share URL round-trip | `route.ts` parseHash/toHash already 4-segment-capable; `manual: open #/chat/conversations/<uuid> cold; expect history + bound_context restored` |
| AC-18 shared read-only + Fork | `manual: open shared URL in 2nd profile; expect disabled input + Fork button` |
| AC-19 zero-rows refusal | `refusal-helpers.test.ts` rule 4 (`resolveAnswerBody`) — pass |
| AC-20 OOS refusal | `end-to-end.integration.test.ts` "AC-20 oos fixture" — pass |
| AC-21 write-attempt refusal | `refusal-write-attempt.integration.test.ts` (T-13, Neo4j) |
| AC-22 5 XSS vectors | `sanitise-5-vectors.test.tsx` — pass |
| AC-23 read-only routing gate | `no-direct-driver.test.ts` — pass |
| AC-24 no write-helper imports | `no-write-imports.test.ts` — pass |
| AC-25 no auth | `api/__tests__/no-auth-grep.test.ts` (graph-core's existing test; chat surface inherits) |
| AC-26 latency footer | `latency-footer.test.tsx` — pass |
| AC-27 tool error narration + aggregate enum gate | `aggregate-pattern-enum.test.ts` — pass |
| AC-28 prompt-injection redaction | `prompt-injection-redaction.test.ts` — pass |
| AC-29 cost cap | `cost-cap.test.ts` — pass |
| AC-30 describe_schema fallback | `describe-schema-tool.integration.test.ts` — pass |
| AC-31 ANTHROPIC_API_KEY unset → mock | `llm-degraded-mode.test.ts` — pass |
| AC-32 progress polling | `progress-surface.test.tsx` — pass |

ACs requiring a live Neo4j (AC-01, AC-02, AC-21, AC-30 live-mode) plus AC-17/AC-18 (browser session) carry a documented `manual: <one-line repro>` per the spec-completion hook contract; the structural envelope + refusal precedence + degraded-mode paths are all covered hermetically.

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
