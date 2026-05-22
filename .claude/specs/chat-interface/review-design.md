---
feature: chat-interface
reviewing: design
reviewer: spec-review-agent
reviewed_at: 2026-05-23
verdict: revise
counts: { blockers: 4, concerns: 9, nits: 5 }
---

# Review: chat-interface design

## Verdict

**revise** — the design correctly mirrors existing project patterns
(`runPassthrough`, `getDriver`, `ok()`/`error()`, hash-route SURFACES)
and every cited file/line spot-check passes. However the design's
Cypher templates and aggregate patterns reference graph properties
that do **not exist in `shared/seed/retail-mini.json`** (B-01); the
persistence row in File Changes contradicts DD-08's table count
(B-02); a race between the progress channel and the synchronous
response is unresolved (B-03); and several risk-items (per-conversation
title generation, `loadBoundContext` algorithm, history-window cap)
are silently dropped between requirements and design (B-04). Once
those four are reconciled, the design is approve-grade.

## Blockers

### B-01 — Cypher templates reference attributes the seed does not have

- **Where:** DD-04 (`sla_hotspots`, lines 405-420), DD-16 patterns
  `breach_count_by_journey`, `handoff_count_by_team_pair`,
  `leverage_score_top_k` (lines 912-942).
- **What's wrong:** `grep '"sla_p99_ms"|"observed_p99_ms"|"leverage_score"|"team"' shared/seed/retail-mini.json` → 0 hits. The seed has no `attributes` blocks on any node or edge. Concretely:
  - `r.sla_p99_ms` / `r.observed_p99_ms` on `PRECEDES` — absent.
  - `r1.team` / `r2.team` on `Role` — absent.
  - `a.leverage_score` on `Activity` — absent.
  - Journey ids in the seed are UUIDv7 (e.g. `018f0000-0001-7000-8000-000000000301`), NOT `uj_order_fulfillment` as used throughout the design (DD-05 line 458, DD-17 line 967, AC-01, AC-02 narratives, DD-04 `sla_hotspots` filter param).
- **Why this is a blocker:** Five tools (`sla_hotspots`, `handoff_matrix`, `sod_register`, `ai_candidates`, `aggregate`) AND four agent-integration ACs (AC-01, AC-02, AC-19, AC-27) will return zero rows on the live seed — making every "show breaches"-style fixture an FR-G01 refusal rather than a positive narration. The role registry's `uj_*` id keys also collide with the FR-R01/CI check `role-coverage.test.ts` (line 172) which asserts every seed `uj_*` id has a role — there are none.
- **Fix:** Two options. (a) **Recommended**: extend `shared/seed/retail-mini.json` (a `shared/seed/retail-mini-v2.json` companion is acceptable) with `attributes: { sla_p99_ms, observed_p99_ms }` on PRECEDES, `attributes: { team }` on Role, `attributes: { leverage_score }` on Activity, and add a stable-string `id` (e.g. `uj_order_fulfillment`) alongside or as alias to the UUIDv7. Document the schema additions in a new DD or in the existing DD-16 prose. (b) Rewrite DD-04 + DD-16 to compute these statistically (e.g. `count(*)` per journey) and drop role-id literals from the design narrative. (a) preserves the agent's analytical surface; (b) shrinks the spec.

### B-02 — `persistence.ts` row claims "3 tables" but DD-08 defines 4

- **Where:** File Changes line 149: *"`api/src/chat/persistence.ts` — better-sqlite3 — schema setup + CRUD for **3 tables** (FR-B02)"*. DD-08 defines four `CREATE TABLE IF NOT EXISTS` blocks: `chat_conversations`, `chat_messages`, `chat_llm_quota`, **`chat_bookmarks`** (lines 624-663).
- **Why this is a blocker:** FR-M03 ("bookmark stores `(question, role_id?)`") needs persistence; if `persistence.ts` only sets up 3 tables, the bookmark CRUD has no backing store. AC-16 (`pwa/__tests__/chat/bookmark.test.tsx`) is mapped, but the server side has no integration test — bookmark persistence will not be validated end-to-end.
- **Fix:** (a) Update File Changes line 149 to "4 tables (`chat_conversations`, `chat_messages`, `chat_llm_quota`, `chat_bookmarks`)". (b) Add `api/__tests__/chat/bookmark-persistence.integration.test.ts` to File Changes and map AC-16 server-side. (c) Optional: add `forked_from TEXT REFERENCES chat_conversations(id)` to `chat_conversations` for FR-M05 fork chains, OR explicitly state in DD-08 that fork is "deep copy, no chain tracking in v1".

### B-03 — Progress endpoint race: PWA can double-render

- **Where:** DD-10 (lines 691-721), specifically lines 720-721: *"PWA polls every 500 ms while the chat request is in flight; stops polling on `state === "done"` or after request returns."* The `setProgress(message_id, "done")` call lands inside `runAgentTurn` (DD-06 line 565) BEFORE `runAgentTurn` returns the envelope to the route handler.
- **What's wrong:** Sequence: (a) agent loop finishes; (b) `setProgress("done")` populates `result: envelope` in the in-memory map; (c) PWA's next 500 ms poll arrives and reads `state==="done"` + `result`; (d) PWA renders the result; (e) the synchronous `POST /api/v1/chat/messages` finally returns the same envelope; (f) PWA renders **again**. Or worse, the two renders disagree because of a serialisation quirk.
- **Why this is a blocker:** FR-B01 commits "Async-only — server holds the connection until the loop completes." DD-10 introduces a parallel surface that exposes the result twice. AC-32's verification (`pwa/__tests__/chat/progress-surface.test.tsx`) is mapped but does not assert "single render after both channels converge".
- **Fix:** Three options. (a) **Recommended**: drop `result` from the progress snapshot — the progress channel only carries `state` + `tool_calls_so_far`. The final envelope arrives only via the synchronous response. AC-32 asserts "progress poll returns `state` transitions but never the final envelope". (b) Document the rule "PWA stops polling immediately on `state==="done"` and discards the polled `result` if a synchronous response is in-flight". (c) Lift the synchronous return — make `POST /api/v1/chat/messages` return `202 + message_id` immediately and require the client to poll until `done`. (c) is a bigger architectural change; (a) is the smallest delta.

### B-04 — Three requirements details silently dropped

- **Where:** DD-06 (orchestrator), DD-08 (schema), DD-20 (risks resolution).
- **What's wrong:** Three items from requirements are not addressed anywhere in design:
  1. **Per-conversation `title` generation.** DD-08's `chat_conversations` table has a `title TEXT` column (line 629). FR-B02 / FR-M04 list it. Nothing in the design specifies where the title comes from — first user message verbatim? An LLM call after turn 1? Truncate to N chars? Without this, every conversation row will have `title = NULL`, the share-conversation view (FR-M04) has nothing human-readable to render.
  2. **`loadBoundContext` algorithm.** DD-06 line 504 calls `loadBoundContext(conversation_id)` but the function is never defined. FR-M01 says "the last assistant message's `highlight.nodes ∪ highlight.edges ∪ tool_calls[].result_preview cited ids` carry into the next turn" — but does it use only the last assistant turn, last N turns, the union of all turns? Cap at 50 (per request schema)?
  3. **Conversation history truncation.** DD-06 line 512 calls `buildMessageHistory(conversation_id, req.message)` but no DD addresses the 200K-token cap (Native Conflicts line 444 says "truncate `bound_context` to last 50 node/edge ids" + "truncate `tool_calls` result_preview to 200 chars"; says nothing about history). A long-lived conversation will overflow.
- **Why this is a blocker:** FR-M01, FR-B02, and the Anthropic 200K input cap (Native Conflicts) are all "must" priorities. Missing them is a coverage gap. The DD-20 resolution table doesn't list any of these as deferred either.
- **Fix:** Add three short DDs (or fold into existing): (a) DD on title — "first user message, first 60 chars, no LLM call in v1; live-updates only on first turn". (b) DD on `loadBoundContext` — exact algorithm + the cap (e.g. "last assistant turn only; node_ids and edge_ids capped at 50 each in `chat_messages.highlight`"). (c) DD on history — "send only the last `H` user+assistant turns to the LLM, where `H` is chosen so the serialised prompt + tools + system fits in 150K tokens with 50K headroom; on overflow, oldest turns dropped, no summarisation in v1".

## Concerns

### C-01 — Anthropic SDK `system` shape claim should be re-verified before locking the dated model variant

DD-07 line 588 declares `system: string` as the parameter shape. Per the current `@anthropic-ai/sdk` types (as of 2026-05), `system` can be either `string` OR `SystemContentBlock[]` where each block is `{ type: "text", text: string, cache_control?: {...} }`. The block-array form is the only one that admits prompt-caching via `cache_control: { type: "ephemeral" }`. Design phase locks `string`, which means caching the system prompt overlay across turns (DD-07 picks a 400-word markdown overlay per role) is forfeited. With 50 LLM calls per conversation (NFR-09) at ~1500 tokens of system prompt each, that's ~75K wasted input tokens per conversation. **Fix**: change `LLMClient.callTurn`'s param type to `system: string | SystemContentBlock[]` (or always block-array) and have `AnthropicLLMClient` set `cache_control: { type: "ephemeral" }` on the role-overlay block. Worth a follow-up DD; not blocking but a meaningful cost saving once the API key is set.

### C-02 — `claude-sonnet-4-6` model alias is stale; current is `claude-sonnet-4-7`

DD-07 line 597, line 614 pin `claude-sonnet-4-6` as the alias to lock against. The current assistant runtime ID per the platform context is `claude-opus-4-7[1m]` — Sonnet 4.7 (`claude-sonnet-4-7-20251015` or similar) is the equivalent current alias. Requirements N-01 also pins 4.6. **Fix**: bump both requirements and design to `claude-sonnet-4-7` and lock the dated variant at design time. Cross-link to the `claude-api` skill's migration note.

### C-03 — Embedded JSON-prefix classifier (DD-18) is fragile to LLM-output drift

DD-18 line 996 asks the LLM to prefix its response with a JSON envelope `{ "intent": ..., "role_id": ..., "oos_reason": ... }`. Three failure modes are not addressed:
  1. Claude often wraps JSON in ```json fences when asked for "JSON output". The "strict JSON regex extractor" (line 1005) must handle both bare-prefix and fenced-prefix.
  2. If `stop_reason === "tool_use"` on the very first call (model wants to fetch data before classifying), the prefix never lands — the orchestrator falls through to `graph_analyst` silently. AC-04 (auto-route to `sod_register`) will be flaky.
  3. If the LLM emits intent text but malformed JSON, design says "regex extractor" — but no fallback is specified. The orchestrator should fall back to `intent: "in_scope", role_id: req.role_id ?? "graph_analyst"`.
**Fix**: spell out the fallback chain explicitly in DD-18; add a unit test `classifier-prefix-parse.test.ts` (already cited line 1010) that covers (a) bare JSON, (b) fenced JSON, (c) no JSON / first call is tool_use, (d) malformed JSON. Consider an alternative: instead of prefix-parsing, use the Anthropic tool-use API to expose a `classify_intent(intent, role_id)` tool that the LLM MUST call first; the orchestrator can then enforce the call order trivially.

### C-04 — Highlight payload "superset" leak

DD-11 line 727 iterates **all** tool calls' results, adding every returned node/edge id to the highlight set. The LLM's final answer body may only cite a subset (e.g. tool fetched 50 activities; answer cites 3). The canvas will then highlight 50 — a "superset" of citation. FR-H01 line 273 reads "the orchestrator builds the payload from the tool-result ids" — design is consistent. But the wireframe expectation (citation-first nav) may not be: a user clicks `cite[a_pick_pack]` and expects only that node highlighted, but the canvas already has 50 lit up. **Fix**: either (a) split into two payloads — `highlight.context` (superset, dim) vs `highlight.cited` (subset, bright), with corresponding CSS classes; or (b) add a `style.cited: NodeId[]` field driven by `extractCitations(toolCalls, finalText)` (already computed on line 559). Recommend (b) — smallest delta.

### C-05 — DD-18 classifier costs a 6th LLM call in some scenarios

DD-18 says "0 extra LLM calls" because the classifier is embedded in the first turn. But if the LLM's first response is `stop_reason: "tool_use"` (it wants `list_domains` to figure out scope), there is no prefix to parse. The orchestrator then needs to either (a) re-call the LLM after the first tool returns, asking again for the classification (extra call); or (b) accept the implicit "in_scope" + default role. (b) silently breaks AC-20 (OOS refusal) because OOS detection requires the classifier to fire. **Fix**: document this corner case in DD-18; pick one of the two paths and assert in `refusal-oos.integration.test.ts` (line 182).

### C-06 — `describe_schema` localhost loopback is a self-call hazard

DD-15 line 866 fetches `http://127.0.0.1:8787/api/v1/schema` from within the chat handler — i.e. an HTTP self-call. Two issues:
  1. If `API_PORT` is configured non-default in `.env`, the hard-coded port breaks. Use `loadEnv().apiPort`.
  2. If the bun HTTP server is single-threaded and the chat handler holds the connection until done (FR-B01), a self-fetch is fine in Bun (event-loop yields). On other runtimes this would deadlock. The design should acknowledge this is Bun-specific.
**Fix**: import `getOntology()`/`getSchema()` directly (the existing `api/src/ontology/cache/schema.ts` is in-process and is exactly what `/api/v1/schema` returns). The "API-boundary discipline" justification (line 884) is weak — they're in the same process and the cache is the right primitive.

### C-07 — Cost-cap counter is correct but un-decremented on failure

DD-09 line 672 increments the counter inside a SQLite transaction (correct — better-sqlite3 is single-connection sync, transactions are atomic against concurrent requests in the same process; the design's claim holds). But if the LLM call **fails** mid-loop (network error, 429, malformed response), the counter has already incremented. Over a noisy week this drifts upward. **Fix**: either (a) decrement on caught `chat:llm_provider_error` paths (NB: requires a second transaction; simpler than rolling back); or (b) accept the drift and document it ("counter counts attempts not completions; tune NFR-09 caps with a 10–20 % headroom").

### C-08 — Refusal precedence has FR-G05 path-twice ambiguity

DD-13 lines 829-836 lists 6 precedence rules; rules 1 and 5 both terminate on FR-G05 (quota exhausted = sole body; budget exhausted = appended). If quota exhausts on the 5th tool call (rule 1 + rule 5 fire simultaneously), DD-13 doesn't specify which wins. The DD-06 control-flow lines 517-521 check quota inside the loop, FR-G05 string overwrites. Then line 549 appends FR-G05 again if budget exhausted. Result: FR-G05 appears twice in the body. **Fix**: rule 1 should explicitly subsume rule 5 — "if rule 1 fires, skip rule 5". Add a unit test asserting "only one copy of FR-G05 in the body".

### C-09 — `ChatErrorCode` enum separate from `ERROR_CODES` is fine but breaks one invariant

File Changes line 117 says chat-namespace codes (`chat:*`) live in a *separate* `ChatErrorCode` enum, not extending `ERROR_CODES`. CLAUDE.md says "The `ERROR_CODES` enum (`api/src/errors.ts`) is closed and asserted exhaustive — adding a code is a non-breaking additive change". The chat envelope's `error.code` field is typed `ErrorCode | ChatErrorCode` — the OpenAPI generator (FR-16) needs to know both. **Fix**: add a DD noting that the chat router's OpenAPI generation union the two enums; or add the three chat codes to `ERROR_CODES` and accept the namespacing-by-prefix convention. The first option is more isolated; the second is more uniform with the rest of the codebase. Either way, document it.

## Nits

- **N-01** — DD-02 file layout (line 277) lists `tools/` files but not the `__tests__/chat/role-pinned.test.ts` AC-05 server-side, even though File Changes line 177 maps it. Cosmetic but worth aligning.
- **N-02** — DD-03 line 348 calls `zodToJsonSchema(def.schema, { target: "openApi3" })`. Anthropic's tool-use accepts JSON Schema (draft 2020-12-ish), not OpenAPI 3.1. `target: "jsonSchema7"` is the conventional setting. Verify against Anthropic's tool-input-schema validator before locking.
- **N-03** — DD-09 line 681 uses `INSERT … ON CONFLICT … DO UPDATE` with `count = count + 1`. The column `count` is unqualified; some SQLite dialects need `excluded.count + 1` or `chat_llm_quota.count + 1`. Verify with `better-sqlite3` at integration-test time.
- **N-04** — DD-14 redaction regex line 842 says case-insensitive (`/.../i`) but the requirements NFR-10 regex includes `(?i)` inline (`(?i)\b(ignore|disregard|override)\b...`). Equivalent; redundant flag. Drop one for clarity.
- **N-05** — DD-17 `uj_order_fulfillment.md` example (line 974) cites tool name `find_path` with positional args; design phase should commit the actual `find_path` JSON-Schema-shaped args (per FR-T07 — `{ fromId, toId, maxDepth }`). The example narrative will mislead the LLM otherwise.

## Strengths

- File-path + line-number citations in the Overview (lines 22-38) and Architecture all spot-checked correctly: `_helpers.ts:42-71` (`ok`/`error`/`fromValidationError`), `query.ts:135-145` (`handleCypher`), `read-only-session.ts:25-77` (`runPassthrough` with `ValidationError("result_truncated", { limit: ROW_CAP })` matches DD-06 line 574 verbatim), `driver.ts:4-38` (`getDriver` singleton + `closeDriver` + `_resetDriver`), `errors.ts` (ValidationError class + ERROR_CODES enum), `route.ts:5-103` (SURFACES catalog). The design earned trust here.
- ReAct loop control flow (DD-06) is concrete enough to implement: explicit `messages.push` shapes for tool_use + tool_result, explicit invariants for the cap, explicit refusal post-processing order.
- Refusal precedence table (DD-13) is the right shape and matches FR-G01..G05 + FR-G06 strings verbatim.
- DD-20 risks-resolution table covers all 20 risk items from requirements §Risks (line 1033-1054). Confirmed by 1:1 walkthrough.
- The 22 test paths map to 32 ACs without gaps; every AC-XX has a named test file in File Changes (cross-checked AC-01 through AC-32). The split between server-integration / PWA-jsdom / static-grep is sensible.
- Scope creep check: no UI animations, no streaming, no multi-LLM routing. The "Out of scope" section (line 1072) holds the line.

## Coverage check

- **Every FR-* mapped to a File Changes row**: yes, with minor caveats. FR-A01..A05 → `agent.ts`; FR-T01..T15 → individual `tools/*.ts`; FR-R01..R03 → `roles/`; FR-H01..H03 → `highlight.ts` + `canvas-highlight.ts`; FR-C01..C04 → `views/chat/*.tsx`; FR-M01..M05 → `agent.ts` + `persistence.ts` + `AgentChat.tsx`; FR-G01..G06 → `refusal.ts` + `agent.ts`; FR-B01..B07 → `routes/chat.ts` + `persistence.ts` + `quota.ts` + `progress.ts` + `llm/factory.ts`. **Gap**: FR-B02's `chat_bookmarks` table — see B-02.
- **Every AC-* mapped to a test path**: yes — all 32 ACs (AC-01 through AC-32) appear in File Changes test rows. Spot-checked AC-22 (`pwa/__tests__/chat/sanitise-5-vectors.test.tsx`), AC-27 (`tool-error-narration.integration.test.ts` + `aggregate-pattern-enum.test.ts` for sub-cases a/b/c), AC-32 (server + client).
- **Every requirements §Risks item resolved in DD-20**: yes — DD-20 table at lines 1033-1054 covers Risks #1 through #20. Confirmed.
- **Every DD references a real file path or shows real code**: spot-checked 6 cited paths, all verified. The Cypher in DD-04/DD-16 would parse against Neo4j — but **the seed lacks the referenced properties** (see B-01).
- **No scope creep beyond requirements**: yes — out-of-scope list (line 1072) is consistent with requirements §Scope Boundaries. The "verification gates" section (line 1083) does not add new requirements.

## Recap

Four blockers (B-01 seed-attribute coverage, B-02 persistence row count, B-03 progress race, B-04 silently-dropped FRs), nine concerns mostly tactical, five nits. Recommend a 3.2 design revision absorbing B-01..B-04, then re-review (smaller scope — just the deltas).
