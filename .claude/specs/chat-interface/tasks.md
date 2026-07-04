---
feature: "chat-interface"
created: "2026-05-23"
phase: "tasks"
revision: "3.1"
status: "draft"
based_on: "design.md v2 (approved 2026-05-23)"
---

# Tasks: chat-interface (rev 3.1)

## Task-review pass-1 resolutions (2026-05-23)

| Finding | Disposition | Section(s) updated |
|---------|-------------|---------------------|
| **B-01** Registry file-write collision (T-12..T-15 all edit `registry.ts`) | Registry switched to **auto-discovery at server boot**: tools self-register by exporting a `TOOL_DEF` const from each file; `registry.ts` imports the directory via an explicit barrel `tools/all.ts` that lists each tool's import (one-line additions per task — these are merged at the barrel level which is cheap to resolve). T-12..T-15 each add their import line to `all.ts`; concurrent edits to the barrel are append-only and conflict-free in 90%+ of cases (the orchestrator runs `bun build` after each task to validate). | T-10, T-12..T-15 |
| **B-02** T-22 tier inconsistency | T-22 pinned to **Tier 1**. T-14 + T-15 (Tier 2) Deps explicitly include T-22. Effort table updated. | dependency graph, parallel tiers, effort table |
| **B-03** T-11 wrongly marked parallel with T-12..T-15 | T-11 moved to **Tier 1.5** (after T-09 + T-10, before T-12..T-15). T-12..T-15 unblock once T-11 is done. The graph + tier list both updated. | T-11, dependency graph, parallel tiers |
| **C-01** T-11 under-rated | Complexity bumped from `moderate` → `high`. 20 markdown overlays @ ~400 words each is genuine work plus the classifier parser and CI coverage test. | T-11 |
| **C-03** Missing `tool-error-narration.integration.test.ts` | Added explicit Verification entry for AC-27 (a/c) tool error narration on T-16 (already covers AC-27, fleshed out). Test file now named. | T-16 |
| **C-05** Missing perf-smoke task | Added **T-28 — Performance smoke test** measuring P50/P99 for single-tool + 3-tool + 5-tool flows against the `MockLLMClient` (latency comes mostly from tool exec; pinned latency budget invariants stay testable without Anthropic API calls). | T-28 (new), Dependency graph, Tier 7 |

Open-accepted (don't change tasks):

- **C-02** OpenAPI regeneration — `graph-core` ships an auto-generated `/api/v1/openapi.json`; chat routes will appear automatically if registered via the same mechanism. T-17 modifies `router.ts`, which is the canonical registration site. No additional task.
- **C-04** CLAUDE.md docs update — not in scope for this spec; will land in a follow-up doc-maintenance task.
- **5 nits** absorbed inline.



Tasks are ordered by dependency. The orchestrator implements them in
order; parallel-safe tasks are flagged in the **Parallel?** column.

Conventions:
- **Files** — concrete paths to create or modify, with line ranges
  where editing existing files.
- **AC** — acceptance-criteria coverage (from `requirements.md`).
- **DD** — design decisions implemented (from `design.md`).
- **Verification** — either a test path (preferred) OR
  `manual: <one-line repro with input mode + observable outcome>`.
  Required by the spec-completion hook.
- **Complexity** — trivial / simple / moderate / high.
- **Parallel?** — `yes` means runnable in a separate Agent
  sub-task in parallel with same-tier tasks; `no` means must run
  sequentially after its `Deps`.

## T-01 — Add dependencies + env vars

| Field | Value |
|-------|-------|
| **Files** | `api/package.json` (add `@anthropic-ai/sdk`, `better-sqlite3`, `zod-to-json-schema`); `.env.example` (`ANTHROPIC_API_KEY=`, `CHAT_DB_PATH=data/chat.db`); `.gitignore` (`data/chat.db*`); `api/src/env.ts` (extend Env shape) |
| **AC** | gates AC-31, NFR-09 |
| **DD** | File Changes preamble |
| **Verification** | `manual: run \`bun install\` from project root; expect exit 0 and dep tree includes new packages; \`bun build api/src/server.ts --no-bundle\` exits 0` |
| **Complexity** | trivial |
| **Deps** | — |
| **Parallel?** | no (sets up everything else) |

## T-02 — Shared types

| Field | Value |
|-------|-------|
| **Files** | `shared/src/types.ts` (extend with `ChatRoleId`, `ToolName`, `HighlightPayload`, `ChatEnvelope`, `ToolCall`, `LatencyBreakdown`, `BoundContext`, `ChatRequest`) |
| **AC** | foundation for AC-01, AC-07, AC-14, AC-15, AC-26 |
| **DD** | DD-01 envelope shape |
| **Verification** | `bun build shared/src/index.ts --no-bundle` exits 0; `shared/__tests__/types-smoke.test.ts` imports each new type without error |
| **Complexity** | simple |
| **Deps** | T-01 |
| **Parallel?** | no (everything downstream imports from here) |

## T-03 — SQLite persistence layer

| Field | Value |
|-------|-------|
| **Files** | `api/src/chat/persistence.ts` — exports `initChatDb()`, `getDb()`, `closeChatDb()`, CRUD for all 4 tables (`chat_conversations`, `chat_messages`, `chat_llm_quota`, `chat_bookmarks`); `api/src/chat/schemas.ts` (zod schemas for chat request + persisted rows) |
| **AC** | AC-14 (context carry persistence), AC-29 (cost cap), AC-16 (bookmarks), AC-17 (share URL) |
| **DD** | DD-08 (schema), DD-22 (loadBoundContext, generateTitle) |
| **Verification** | `api/__tests__/chat/persistence.test.ts` — round-trip create-conv/insert-msg/load-bound-context; assert WAL mode on; assert idempotent `IF NOT EXISTS` boot |
| **Complexity** | moderate |
| **Deps** | T-01, T-02 |
| **Parallel?** | no |

## T-04 — Quota counter (transactional)

| Field | Value |
|-------|-------|
| **Files** | `api/src/chat/quota.ts` — exports `isQuotaExhausted(conv_id)`, `incrementQuotaOrFail(conv_id)`. Uses `db.transaction()` on `chat_llm_quota`. |
| **AC** | AC-29 |
| **DD** | DD-09 |
| **Verification** | `api/__tests__/chat/cost-cap.test.ts` — simulate 51 calls in one conversation (assert 51st refused with `chat:tool_budget_exhausted`); simulate 501 calls across conversations in one UTC day (assert 501st refused); concurrent test: fire 100 increments in parallel; assert exact count |
| **Complexity** | simple |
| **Deps** | T-03 |
| **Parallel?** | no |

## T-05 — Refusal strings + helpers

| Field | Value |
|-------|-------|
| **Files** | `api/src/chat/refusal.ts` — exports 5 string constants (FR_G01..G05), `isAllZeroRows()`, `anyWriteRejection()`, `anyResultTruncated()`, refusal precedence resolver |
| **AC** | gates AC-03, AC-19, AC-20, AC-21 |
| **DD** | DD-13 (precedence table) |
| **Verification** | `api/__tests__/chat/refusal-helpers.test.ts` — unit tests for each helper; assert exact strings (5 verbatim assertions); assert precedence resolver against all 6 scenarios |
| **Complexity** | simple |
| **Deps** | T-02 |
| **Parallel?** | yes (with T-06, T-07, T-08) |

## T-06 — Sanitisation / injection redaction

| Field | Value |
|-------|-------|
| **Files** | `api/src/chat/sanitise.ts` — exports `redactInjection(s: string): string` using DD-14 regex |
| **AC** | AC-28 |
| **DD** | DD-14, NFR-10 |
| **Verification** | `api/__tests__/chat/prompt-injection-redaction.test.ts` — assert 5 positive cases redact, 5 negative cases pass through; `api/__tests__/chat/redaction-fp-check.test.ts` — run regex over all node descriptions in `retail-mini.json` + `retail-mini-enriched.json`; FP-rate ≤ 1% |
| **Complexity** | simple |
| **Deps** | T-02 |
| **Parallel?** | yes (with T-05, T-07, T-08) |

## T-07 — Highlight payload builder

| Field | Value |
|-------|-------|
| **Files** | `api/src/chat/highlight.ts` — exports `buildHighlight(toolCalls, role) → HighlightPayload`, `tryBuildDeepLink(highlight, role) → string \| null` (returns null pending FR-H03 grammar lock) |
| **AC** | AC-07, AC-09 (graceful degrade null path) |
| **DD** | DD-11 (per-tool extraction) |
| **Verification** | `api/__tests__/chat/highlight-builder.test.ts` — feed synthetic tool results for each tool type; assert nodes/edges/paths/style population; assert null deep-link return path |
| **Complexity** | moderate |
| **Deps** | T-02 |
| **Parallel?** | yes (with T-05, T-06, T-08) |

## T-08 — Progress snapshot store

| Field | Value |
|-------|-------|
| **Files** | `api/src/chat/progress.ts` — exports `initProgress(message_id, conv_id)`, `setProgress(message_id, state, partial?)`, `getProgress(message_id)`. In-memory Map + 60s TTL sweeper. |
| **AC** | AC-32 server side |
| **DD** | DD-10 (race-safe variant) |
| **Verification** | `api/__tests__/chat/progress-store.test.ts` — round-trip set/get; assert TTL eviction with fake time; assert idempotent re-set of state |
| **Complexity** | simple |
| **Deps** | T-02 |
| **Parallel?** | yes (with T-05, T-06, T-07) |

## T-09 — LLM client interface + factory + Anthropic + Mock impls

| Field | Value |
|-------|-------|
| **Files** | `api/src/chat/llm/client.ts` (interface + types `SystemPromptBlock`); `api/src/chat/llm/anthropic.ts` (uses `@anthropic-ai/sdk` Messages API with tool-use, prompt-caching via `cache_control: 'ephemeral'`); `api/src/chat/llm/mock.ts` (fixture-backed); `api/src/chat/llm/factory.ts` (env-driven selection); `api/src/chat/llm/fixtures/*.json` (at least 10 fixture scenarios — one per AC-driven flow) |
| **AC** | AC-01, AC-02, AC-03, AC-31 |
| **DD** | DD-07 (interface + caching), DD-18 (classifier-prefix parsing) |
| **Verification** | `api/__tests__/chat/llm-client-mock.test.ts` — assert fixture playback against all 10 scenarios; `api/__tests__/chat/llm-degraded-mode.test.ts` — assert factory returns MockLLMClient when `ANTHROPIC_API_KEY` unset, envelope carries `degraded: 'mock_llm'`; `api/__tests__/chat/classifier-prefix-parse.test.ts` — assert parser handles fenced JSON, bare JSON, no prefix, malformed JSON, empty text — all without throwing |
| **Complexity** | high |
| **Deps** | T-02 |
| **Parallel?** | yes (independent of T-05..T-08) |

## T-10 — Tool registry + dispatch (skeleton, auto-discovery via barrel)

| Field | Value |
|-------|-------|
| **Files** | `api/src/chat/tools/registry.ts` (registry assembled from auto-discovery: `import * as all from './all'` then `Object.values(all).forEach(def => REGISTRY[def.name] = def)`; exports `listToolsForRole` + `zod-to-json-schema` wiring); `api/src/chat/tools/all.ts` (barrel that re-exports each tool's `TOOL_DEF` — populated by T-12..T-15); `api/src/chat/tools/dispatch.ts` (`runTool(name, args, ctx)` with error wrapping + per-turn memoization); `api/src/chat/tools/types.ts` (`ToolContext`, `ToolResult`, `ToolDef<TArgs, TData>`) |
| **AC** | AC-06 (role gating), AC-27 (error envelope conversion) |
| **DD** | DD-03 |
| **Verification** | `api/__tests__/chat/tool-dispatch.test.ts` — fake tools; assert role-gating rejects unauthorised; assert zod-validation errors → `invalid_payload`; assert per-turn memoization; assert thrown `ValidationError` converts to `{ ok: false, error }` |
| **Complexity** | moderate |
| **Deps** | T-02 |
| **Parallel?** | yes (independent — tools land later) |

## T-11 — Behavioral role registry + system prompts (Tier 1.5 — gates T-12..T-15)

| Field | Value |
|-------|-------|
| **Files** | `api/src/chat/roles/registry.ts` (20 roles with `allowed_tools` + `suggested_prompts`); `api/src/chat/roles/prompts/*.md` (20 markdown overlay files); `api/src/chat/roles/auto-route.ts` (classifier parser using DD-18); `shared/__tests__/role-coverage.test.ts` (CI check: every `uj_*` in seed has a role) |
| **AC** | AC-04, AC-05 (server side), AC-06, FR-R01 invariants |
| **DD** | DD-05, DD-17, DD-18 |
| **Verification** | `api/__tests__/chat/role-registry.test.ts` — assert 20 roles, allowed_tools per FR-R01 table, every role's prompt file exists + ≤ 400 words; `api/__tests__/chat/role-autoroute.test.ts` — mock LLM emits prefix → assert role resolution; `shared/__tests__/role-coverage.test.ts` — every `uj_*` in seed maps to a role |
| **Complexity** | high (20 markdown overlays × ~400 words + classifier parser + CI coverage) |
| **Deps** | T-09, T-10 |
| **Parallel?** | no — gates T-12..T-15 (Tier 2 consumers) |

## T-12 — Tool: list_domains, get_domain, list_nodes_by_label, neighbors, find_path, describe_schema

| Field | Value |
|-------|-------|
| **Files** | `api/src/chat/tools/list-domains.ts`, `get-domain.ts`, `list-nodes-by-label.ts`, `neighbors.ts`, `find-path.ts`, `describe-schema.ts`; each exports a `TOOL_DEF` const; **append 6 lines to `api/src/chat/tools/all.ts` barrel** (auto-discovery; no edits to `registry.ts`) |
| **AC** | AC-01 (covers `get_journey` follow-up + `get_domain`), AC-30 (describe_schema) |
| **DD** | DD-04 (Cypher), DD-15 (schema-context), FR-T01,T02,T05,T06,T07,T15 |
| **Verification** | `api/__tests__/chat/tool-simple-queries.integration.test.ts` — integration against seeded Neo4j; assert each tool returns expected shape; `api/__tests__/chat/describe-schema-tool.integration.test.ts` — live ontology path + compile-time fallback; assert EventEmitter invalidation |
| **Complexity** | moderate |
| **Deps** | T-10, T-11 |
| **Parallel?** | yes (with T-13, T-14, T-15) |

## T-13 — Tool: get_journey, get_activity, cypher

| Field | Value |
|-------|-------|
| **Files** | `api/src/chat/tools/get-journey.ts` (multi-clause Cypher DD-04), `get-activity.ts`, `cypher.ts` (passthrough to `runPassthrough`; only callable from `graph_analyst` role — enforced at dispatch by T-10); each exports `TOOL_DEF`; append 3 lines to `api/src/chat/tools/all.ts` |
| **AC** | AC-01, AC-06 (cypher role-gate), AC-21 (write-attempt refusal via cypher) |
| **DD** | DD-04, FR-T03, FR-T04, FR-T14 |
| **Verification** | `api/__tests__/chat/tool-journey-activity.integration.test.ts`; `api/__tests__/chat/refusal-write-attempt.integration.test.ts` — mock LLM emits `cypher('CREATE (n:X)')` → assert FR-G03 fixed string and `error.code === 'write_statement_rejected'` from `runPassthrough` |
| **Complexity** | moderate |
| **Deps** | T-10, T-11 |
| **Parallel?** | yes (with T-12, T-14, T-15) |

## T-14 — Tool: aggregate + aggregate-patterns (6 closed-enum patterns)

| Field | Value |
|-------|-------|
| **Files** | `api/src/chat/tools/aggregate.ts` (dispatch only, rejects unknown patterns) — exports `TOOL_DEF`; `aggregate-patterns.ts` (6 server-owned Cypher templates per DD-16); append 1 line to `api/src/chat/tools/all.ts` |
| **AC** | AC-27 (b) pattern enum gate |
| **DD** | DD-16 |
| **Verification** | `api/__tests__/chat/aggregate-pattern-enum.test.ts` — assert all 6 patterns dispatchable; assert unknown pattern → `invalid_payload` with allowed_patterns in details; assert params validation rejects malformed input; `api/__tests__/chat/aggregate-integration.integration.test.ts` — round-trip each of 6 patterns against enriched seed |
| **Complexity** | moderate |
| **Deps** | T-10, T-22 (enriched seed) |
| **Parallel?** | yes (with T-12, T-13, T-15) |

## T-15 — Tools: sla_hotspots, handoff_matrix, sod_register, ai_candidates, initiative_impact

| Field | Value |
|-------|-------|
| **Files** | `api/src/chat/tools/sla-hotspots.ts`, `handoff-matrix.ts`, `sod-register.ts`, `ai-candidates.ts`, `initiative-impact.ts`; each exports `TOOL_DEF`; append 5 lines to `api/src/chat/tools/all.ts` |
| **AC** | AC-02 (multi-step uses `sla_hotspots`), AC-07 (highlight ids from these tools) |
| **DD** | DD-04, FR-T09..T13 |
| **Verification** | `api/__tests__/chat/tool-cross-section.integration.test.ts` — each of the 5 cross-section tools against the enriched seed; assert NULL-safe behaviour (run also against basic seed, assert zero rows but no crash) |
| **Complexity** | moderate |
| **Deps** | T-10, T-22 |
| **Parallel?** | yes (with T-12, T-13, T-14) |

## T-16 — Orchestrator (ReAct loop, refusal dispatch, highlight assembly)

| Field | Value |
|-------|-------|
| **Files** | `api/src/chat/agent.ts` — exports `runAgentTurn(req: ChatRequest): Promise<ChatEnvelope>` per DD-06; ~250 LoC |
| **AC** | AC-01, AC-02, AC-03, AC-04, AC-05, AC-07, AC-14, AC-19, AC-20, AC-21, AC-26, AC-27 (a/c), AC-29 |
| **DD** | DD-06 (control flow), DD-11 (highlight), DD-13 (refusal precedence), DD-22 (context loading) |
| **Verification** | `api/__tests__/chat/agent-grounded-answer.integration.test.ts` (AC-01); `api/__tests__/chat/agent-react-loop.integration.test.ts` (AC-02); `api/__tests__/chat/tool-budget-cap.test.ts` (AC-03); `api/__tests__/chat/role-autoroute.test.ts` + `role-pinned.test.ts` (AC-04/AC-05); `api/__tests__/chat/highlight-payload.integration.test.ts` (AC-07); `api/__tests__/chat/context-carry.integration.test.ts` (AC-14); `api/__tests__/chat/refusal-{zero-rows,oos,write-attempt}.integration.test.ts` (AC-19/20/21); `api/__tests__/chat/tool-error-narration.integration.test.ts` — mock LLM + mock tool emits `{ ok: false, error: { code: 'depth_exceeded' } }`; assert orchestrator final answer narrates "depth_exceeded" + tool name (AC-27 a/c) |
| **Complexity** | high |
| **Deps** | T-03..T-15 |
| **Parallel?** | no |

## T-17 — Chat REST endpoint + progress endpoint

| Field | Value |
|-------|-------|
| **Files** | `api/src/routes/chat.ts` (`handleChatMessage`, `handleChatProgress`); `api/src/router.ts` (mount `POST /api/v1/chat/messages`, `GET /api/v1/chat/messages/:id/progress`); `api/src/server.ts` (boot `initChatDb()`) |
| **AC** | AC-32 (server side), AC-15 (envelope shape), AC-26 (latency footer wire) |
| **DD** | DD-01, DD-10 |
| **Verification** | `api/__tests__/chat/chat-endpoint-envelope.test.ts` — assert success envelope shape, error envelope shape; `api/__tests__/chat/progress-endpoint.integration.test.ts` — mid-loop poll returns partial tool_calls_so_far; final poll returns `state: 'done'` + full envelope |
| **Complexity** | moderate |
| **Deps** | T-16 |
| **Parallel?** | no |

## T-18 — Coverage grep tests (read-only gate, no writes, no auth, sanitisation)

| Field | Value |
|-------|-------|
| **Files** | `api/__tests__/chat/no-direct-driver.test.ts` (AC-23); `api/__tests__/chat/no-write-imports.test.ts` (AC-24); `api/__tests__/no-auth-grep.test.ts` (modify — extend include list to chat surface) (AC-25) |
| **AC** | AC-23, AC-24, AC-25 |
| **DD** | NFR-03, NFR-04, NFR-05 |
| **Verification** | `api/__tests__/chat/no-direct-driver.test.ts` (AC-23) + `api/__tests__/chat/no-write-imports.test.ts` (AC-24) — both green in `bun test`. **As-built note (2026-07-04):** the AC-25 leg (`api/__tests__/no-auth-grep.test.ts`) was deleted in the 2026-07-04 `_baseline` adoption — the no-auth invariant (NFR-05) is retired per `_baseline` DD-07 and design DD-23; AC-25 no longer verifiable nor required. |
| **Complexity** | simple |
| **Deps** | T-16 (chat code must exist) |
| **Parallel?** | yes (with T-19, T-20) |

## T-19 — Schema-attrs presence sanity check + role-coverage CI

| Field | Value |
|-------|-------|
| **Files** | `api/__tests__/chat/seed-attrs-presence.test.ts` (DD-21); `shared/__tests__/role-coverage.test.ts` (FR-R01 CI) |
| **AC** | DD-21 invariant, FR-R01 invariant |
| **DD** | DD-21, FR-R01 |
| **Verification** | `api/__tests__/chat/seed-attrs-presence.test.ts` (loads `retail-mini-enriched.json`, asserts each queried attribute exists on ≥ 1 node/edge) + `shared/__tests__/role-coverage.test.ts` (every `uj_*` + cross-section id in `shared/seed/journey-catalog.json` maps to a role) — both green in `bun test` |
| **Complexity** | simple |
| **Deps** | T-11, T-22 |
| **Parallel?** | yes (with T-18, T-20) |

## T-20 — Errors module extension (chat-namespace codes)

| Field | Value |
|-------|-------|
| **Files** | `api/src/errors.ts` — adds `ChatErrorCode` type (NOT extending `ERROR_CODES`); `api/src/chat/tools/dispatch.ts` uses it for `chat:tool_unauthorised_for_role`, `chat:tool_budget_exhausted`, `chat:llm_provider_error`. **As-built deviation (2026-07-04):** `ChatErrorCode` landed in `shared/src/types.ts:106` (shared with the PWA), not in `api/src/errors.ts` — `ERROR_CODES` stayed untouched, which honours the intent. |
| **AC** | AC-06, AC-29 |
| **DD** | DD-03 error envelope |
| **Verification** | `api/__tests__/chat/cost-cap.test.ts` (quota exhaustion path, green in `bun test`); plus `manual: from repo root run \`grep -rn "chat:tool_unauthorised_for_role" shared/src/types.ts api/src/chat/tools/dispatch.ts\` in a shell — expect ≥ 1 hit in each file, verifying the chat-namespace codes are typed in shared and dispatched at the tool boundary` |
| **Complexity** | trivial |
| **Deps** | T-02 |
| **Parallel?** | yes (with T-18, T-19) |

## T-21 — PWA api client extensions

| Field | Value |
|-------|-------|
| **Files** | `pwa/src/api.ts` — adds `api.chat.send(req)`, `api.chat.progress(message_id)`, `api.chat.history(conv_id)`, `api.chat.bookmarks.list/create/delete`, `api.chat.conversations.get/share/fork` |
| **AC** | AC-01..AC-32 client wire |
| **DD** | DD-01 |
| **Verification** | `pwa/__tests__/api-chat.test.ts` — mocked fetch; assert each method posts/gets the right URL with the right body shape |
| **Complexity** | simple |
| **Deps** | T-02, T-17 |
| **Parallel?** | yes (with T-22, T-23) |

## T-22 — Seed enrichment

| Field | Value |
|-------|-------|
| **Files** | `shared/seed/retail-mini-enriched.json` — extends the 60 nodes / 128 edges with SLA / team / leverage / criticality attrs per DD-21; `scripts/seed-enriched.ts` — runs after `seed.ts`, idempotent; `package.json` — adds `bun run seed:enriched` script |
| **AC** | DD-21 invariant; enables AC-02, AC-07, AC-19 against the demo journeys |
| **DD** | DD-21 |
| **Verification** | `api/__tests__/chat/seed-attrs-presence.test.ts` (T-19); `manual: bun run seed && bun run seed:enriched && curl http://127.0.0.1:8787/api/v1/query/cypher -d '{"statement":"MATCH ()-[r:PRECEDES]->() WHERE r.sla_p99_ms IS NOT NULL RETURN count(r) AS c"}' \| jq .rows[0].c — expect > 0` |
| **Complexity** | moderate |
| **Deps** | T-01 |
| **Parallel?** | yes (with T-21, T-23) |

## T-23 — PWA chat pane (AgentChat replaces Thread)

| Field | Value |
|-------|-------|
| **Files** | `pwa/src/views/chat/AgentChat.tsx` (replaces existing `Thread.tsx`); `pwa/src/views/chat/MessageList.tsx`; `pwa/src/views/chat/RolePicker.tsx`; `pwa/src/views/chat/SuggestedPrompts.tsx`; `pwa/src/views/chat/Citation.tsx`; `pwa/src/views/chat/SidePanel.tsx`; `pwa/src/views/chat/ReasoningDisclosure.tsx`; `pwa/src/views/chat/LatencyFooter.tsx`; `pwa/src/views/chat/BookmarkMenu.tsx`; `pwa/src/views/chat/sanitise.ts`; `pwa/src/styles/chat.css`; `pwa/src/views/chat/Thread.tsx` (modify to re-export `AgentChat` for the existing route mount, OR update `pwa/src/views/index.tsx` to import `AgentChat` directly) |
| **AC** | AC-01 (UI), AC-02 (UI), AC-05 (slash prefix), AC-10..AC-13, AC-15..AC-18, AC-22, AC-26 |
| **DD** | DD-12 (citation + sanitisation), FR-C01..C04, FR-M01..M05 |
| **Verification** | `pwa/__tests__/chat/sanitise-5-vectors.test.tsx` (AC-22 — 5 injection vectors); `pwa/__tests__/chat/citation-click.test.tsx` (AC-10); `pwa/__tests__/chat/side-panel.test.tsx` (AC-11); `pwa/__tests__/chat/show-reasoning.test.tsx` (AC-12); `pwa/__tests__/chat/selection-aware-suggest.test.tsx` (AC-13); `pwa/__tests__/chat/role-slash-prefix.test.tsx` (AC-05); `pwa/__tests__/chat/latency-footer.test.tsx` (AC-26); `pwa/__tests__/chat/bookmark.test.tsx` (AC-16); `pwa/__tests__/chat/reset.test.tsx` (AC-15); `pwa/__tests__/chat/share-url.test.tsx` (AC-17); `pwa/__tests__/chat/share-readonly.test.tsx` (AC-18) |
| **Complexity** | high |
| **Deps** | T-21 |
| **Parallel?** | no (depends on api client; downstream of T-21) |

## T-24 — Canvas highlight integration (PWA)

| Field | Value |
|-------|-------|
| **Files** | `pwa/src/views/chat/highlight-bus.ts` (event bus); `pwa/src/views/explorer/canvas-highlight.ts` (subscriber); modify `pwa/src/views/explorer/Graph.tsx` (or `JourneyGraph.tsx`) — wire subscriber via `useEffect`; modify `pwa/src/styles/chat.css` to include `.gnode.selected` + `.gedge.highlight` exactly per wireframe `companygraph-views.html:373-452` |
| **AC** | AC-07 (envelope), AC-08 (CSS class application), AC-09 (deep-link round-trip — graceful null) |
| **DD** | DD-11 |
| **Verification** | `pwa/__tests__/chat/highlight-canvas.test.tsx` (AC-08); `pwa/__tests__/chat/deep-link-restore.test.tsx` (AC-09) |
| **Complexity** | moderate |
| **Deps** | T-23 |
| **Parallel?** | no |

## T-25 — PWA progress polling

| Field | Value |
|-------|-------|
| **Files** | `pwa/src/views/chat/useProgressPolling.ts` (custom hook — polls every 500ms, terminates on `done`/`error`/synchronous-response-resolved); wire into `AgentChat.tsx` |
| **AC** | AC-32 (client side) |
| **DD** | DD-10 |
| **Verification** | `pwa/__tests__/chat/progress-surface.test.tsx` — mock fetch; assert poll cadence; assert termination on both signals (race tolerance); assert idempotent store updates |
| **Complexity** | moderate |
| **Deps** | T-23 |
| **Parallel?** | no |

## T-26 — Hash-route extensions

| Field | Value |
|-------|-------|
| **Files** | `pwa/src/route.ts` — add `#/chat/conversations/:id` parsing + `share` query string for share/fork (FR-M04) |
| **AC** | AC-17 |
| **DD** | DD-01 PWA mounting |
| **Verification** | `pwa/__tests__/chat/share-url.test.tsx` (AC-17); covers parseHash + toHash round-trip |
| **Complexity** | simple |
| **Deps** | T-21 |
| **Parallel?** | yes (with T-22, T-23) |

## T-28 — Performance smoke test (NFR-02 latency budget)

| Field | Value |
|-------|-------|
| **Files** | `api/__tests__/chat/perf-smoke.integration.test.ts` — measures P50/P99 latency for three flows: (1) single-tool turn, (2) 3-tool ReAct loop, (3) 5-tool budget-exhausted. Uses `MockLLMClient` with realistic per-call delay simulated (configured via fixture); tool exec measured against the live seeded Neo4j. Assertions: single-tool P50 ≤ 4 s, P99 ≤ 10 s; 3-tool P50 ≤ 12 s, P99 ≤ 30 s. **Caveat**: Mock LLM delay is configurable; the *real* Anthropic-API latency surfaces only in production. The test is a structural budget check, not a wall-clock guarantee. |
| **AC** | NFR-02 invariant |
| **DD** | DD-06 (loop) + DD-09 (quota inside the loop) — perf-impact paths |
| **Verification** | `api/__tests__/chat/perf-smoke.integration.test.ts` — 2 tests green (single-turn p50 ≤ 100 ms / p99 ≤ 500 ms with `MockLLMClient`; 5-tool budget-exhausted turn ≤ 5 s wall + FR-G05 appended). **As-built note (2026-07-04):** thresholds are structural mock-LLM budgets, tighter than but not equivalent to NFR-02's Anthropic wall-clock budgets — real-provider latency remains unmeasured (caveat already declared in Files column). |
| **Complexity** | moderate |
| **Deps** | T-16, T-22 |
| **Parallel?** | yes (with T-27) |

## T-27 — Final integration test + verification artifact collection

| Field | Value |
|-------|-------|
| **Files** | `api/__tests__/chat/end-to-end.integration.test.ts` (manual happy path + 5 refusal paths); collect `verified_at` + `verification_artifact` for STATUS.md |
| **AC** | meta-AC — verifies all 32 ACs pass green |
| **DD** | DD-19 (test strategy) |
| **Verification** | `manual: bun test && bun test:integration both green; bun build --no-bundle exits 0 for api + pwa + shared; manual: bun run dev then load #/chat/thread in browser, ask 'show me hand-offs in Order Fulfillment', expect: tool_calls.length ≥ 1, citations populated, canvas highlights apply` |
| **Complexity** | moderate |
| **Deps** | T-01..T-26 |
| **Parallel?** | no |

## Dependency graph (corrected — Tier 1.5 introduced for T-11)

```
T-01 ─→ T-02 ─┬─→ T-03 → T-04
              ├─→ T-05 ─┐
              ├─→ T-06 ─┤
              ├─→ T-07 ─┤
              ├─→ T-08 ─┤
              ├─→ T-09 ─┴─→ T-11 (Tier 1.5: gates Tier 2) ─┐
              ├─→ T-10 ────────────────────────────────────┤
              ├─→ T-20 ─┐                                  │
              └─→ T-22 ─┴───────────────────────────────────┴─→ T-12,T-13,T-14,T-15 (Tier 2 parallel) ─→ T-16 → T-17 ─┬─→ T-18, T-19 (Tier 4 parallel)
                                                                                                                       ├─→ T-21 ─→ T-23 ─→ T-24, T-25 (Tier 6 parallel)
                                                                                                                       ├─→ T-26 (Tier 5 parallel with T-21)
                                                                                                                       └─→ T-27, T-28 (Tier 7 parallel — final perf+E2E)
```

Parallel tiers (orchestrator fans out via `Agent` subagents per tier):

- **Tier 1** (parallel, 8 tasks): T-03, T-05, T-06, T-07, T-08, T-09, T-10, T-20, T-22 (T-04 sequential after T-03)
- **Tier 1.5** (sequential, gates Tier 2): T-11 (after T-09 + T-10)
- **Tier 2** (parallel, 4 tasks): T-12, T-13, T-14, T-15 (all after T-11 + T-22)
- **Tier 3** (sequential): T-16 (orchestrator), then T-17 (REST)
- **Tier 4** (parallel, 2 tasks): T-18, T-19 (after T-17)
- **Tier 5** (parallel, 2 tasks): T-21, T-26 (after T-17)
- **Tier 6** (parallel, 2 tasks): T-24, T-25 (after T-23, which depends on T-21 + T-25 needs T-23 mounted)
- **Tier 7** (parallel, 2 tasks): T-27 (final E2E), T-28 (perf smoke)

## Effort estimate

| Tier | Tasks | Cumulative wall-clock if parallel | Cumulative if sequential |
|------|-------|-----------------------------------|--------------------------|
| 1 | T-01, T-02, T-05..T-09, T-10, T-20, T-22 | ~1.5 h | ~5 h |
| 2 | T-11, T-12..T-15 | ~1.5 h | ~6 h |
| 3 | T-16, T-17 | ~2 h | ~3 h |
| 4-5 | T-18..T-26 | ~2 h | ~5 h |
| 6 | T-23, T-24, T-25 | ~2 h | ~3 h |
| 7 | T-27 | ~30 min | ~30 min |
| **Total** | **28 tasks** | **~10–11 h** | **~24–27 h** |

Estimate is for one experienced operator-with-agents pair. Parallel
execution requires the orchestrator to fan out Agent subagents per
tier, gate the merge on transpile + test, and serialize where a
later task imports an earlier task's exports.

## As-built reconciliation (2026-07-04)

The feature shipped 2026-05-23; the 2026-07-04 drift adoption
(`.claude/specs/_baseline/`) ratified the surrounding platform
changes. The tasks below backfill task-level traceability for
requirements that never reached this file (modelled on `_baseline`'s
ratify tasks — they record what exists, they do not schedule new
work). Existing task ids are untouched.

Concordance for the rev-2 carry-forward references (full table in
design DD-24): rev-2 FR-12 → FR-M03, rev-2 FR-13 → FR-M04,
rev-2 FR-14 → FR-M05 (all three: remainder deferred, see §Deferred
scope below); rev-2 FR-18 → FR-B05 (built — ratified by T-30).

### T-29 — Ratify AC-33 write-rejection chain (as-built backfill 2026-07-04)

- **Covers**: AC-33 (FR-T14 → FR-G03 chain), NFR-04
- **Files**: `api/src/chat/tools/cypher.ts`, `api/src/chat/tools/dispatch.ts`, `api/src/neo4j/read-only-session.ts`, `api/src/chat/refusal.ts`, `api/src/chat/agent.ts`
- **As-built status**: the chain is verified **piecewise**, not by the single `cypher-write-rejection.integration.test.ts` file AC-33 names (that file was never created). Link 1–3 (dispatch → `runPassthrough` `defaultAccessMode: "READ"` → `{ ok: false, error: { code: 'write_statement_rejected' } }`) is pinned for `CREATE`/`SET`/`MERGE`; link 4 (orchestrator emits the FR-G03 string verbatim, precedence rule 2) is pinned at the refusal-resolver unit level and wired in `agent.ts`. The `DELETE` sub-case and the consolidated 5-step end-to-end test are deferred (§Deferred scope).
- **Verification**: `api/__tests__/chat/refusal-write-attempt.integration.test.ts` (3 tests: CREATE/SET/MERGE → `write_statement_rejected` out of dispatch; needs Neo4j, `bun test:integration`) + `api/__tests__/chat/refusal-helpers.test.ts` ("FR-G03 write-rejected string" character-exact + "rule 2 — write_statement_rejected wins over all" → `resolveAnswerBody` returns the FR-G03 string; `bun test`)
- **Complexity**: trivial (ratification)
- **Deps**: — (records shipped state)

### T-30 — Ratify NFR + rev-2 carry-forward coverage (as-built backfill 2026-07-04)

- **Covers**: NFR-01, NFR-06, NFR-07, NFR-08, and rev-2 FR-18 → FR-B05 (design DD-23 + DD-24 rows)
- **Files**: `package.json` (typecheck script), `pwa/src/views/chat/sanitise.ts`, `api/src/chat/sanitise.ts`, `api/src/neo4j/read-only-session.ts`, `api/src/routes/chat.ts`, `api/src/chat/schema-context.ts`, `api/src/chat/tools/describe-schema.ts`
- **Verification**: NFR-01 — `manual: run \`bun run typecheck\` in a shell from repo root — expect exit 0 (api + pwa transpile clean, no tsc)`. NFR-06 — `pwa/__tests__/chat/sanitise-5-vectors.test.tsx` (8 tests green; vectors (a)–(e) — SVG vectors (f)/(g) deferred, see below). NFR-07 — caps inherited structurally because `runPassthrough` is the sole graph path, proven by `api/__tests__/chat/no-direct-driver.test.ts`. NFR-08 — `api/__tests__/chat/end-to-end.integration.test.ts` ("envelope shape conforms to ChatEnvelope"). FR-B05 (rev-2 FR-18) — `api/__tests__/chat/describe-schema-tool.integration.test.ts` (live-ontology path + compile-time fallback + EventEmitter invalidation)
- **Complexity**: trivial (ratification)
- **Deps**: — (records shipped state)

### Deferred scope (2026-07-04 reconciliation — open, visible in STATUS.md)

Verified NOT BUILT in the working tree on 2026-07-04; kept as open
scope under stable-ID rules (nothing deleted or renumbered):

| Item | Requirement | What exists / what's missing |
|------|-------------|------------------------------|
| Chat audit logging | NFR-11 | Nothing — no log emission in `api/src/chat/agent.ts` or `api/src/routes/chat.ts`; no chat hook in `api/src/logging.ts`. |
| Bookmarks end-to-end | FR-M03 (rev-2 FR-12) | `chat_bookmarks` table + CRUD shipped (`api/src/chat/persistence.ts`, tested in `persistence.test.ts`); REST endpoint not routed; `pwa/src/views/chat/BookmarkMenu.tsx` is a stub. |
| Shareable conversation URLs | FR-M04 (rev-2 FR-13) | Hash-route parsing shipped in `pwa/src/route.ts`; no conversation-history REST endpoint; no cold-load restore (AC-17 remains `manual`-only and unmet end-to-end). |
| Read-only share + Fork | FR-M05 (rev-2 FR-14) | Not built anywhere (AC-18 unmet). |
| AC-33 completions | AC-33 | `DELETE` sub-case + consolidated `cypher-write-rejection.integration.test.ts` (piecewise chain ratified by T-29). |
| AC-22 SVG vectors | NFR-06 | Test cases for vectors (f) `<use href>` and (g) `<a xlink:href>` (structural defence exists — text-only rendering). |
