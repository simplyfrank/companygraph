---
feature: chat-interface
reviewing: requirements (rev 3)
reviewer: spec-review-agent
reviewed_at: 2026-05-23
verdict: revise
counts: { blockers: 4, concerns: 9, nits: 6 }
---

# Review: chat-interface requirements rev 3

## Verdict

**revise** — the agentic redesign is well-structured and preserves
rev-2's safety invariants, but it depends on multiple named symbols
and contracts that **do not exist** in the codebase or wireframes as
the spec claims. Four findings are blockers (hallucinated API name,
hallucinated wireframe source, hallucinated CSS classes, hallucinated
deep-link URL syntax). Once those are corrected against the actual
codebase + the correct wireframe, the spec is approve-grade.

## Blockers

### B-01 — `executeCypherPassthrough` does not exist; correct name is `runPassthrough`

- **Where:** FR-T (preamble), NFR-04, FR-A03, depends_on hard row.
  Quoted: *"Every tool routes its Cypher through `executeCypherPassthrough` from `graph-core`"* (FR-T preamble, line 150); *"Every tool that issues Cypher routes through `executeCypherPassthrough` from `api/src/neo4j/`"* (NFR-04).
- **What's wrong:** No such symbol exists. `grep -rn "executeCypherPassthrough" api/src/` returns zero hits. The actual function is `runPassthrough(driver, stmt, params)`, exported from `/Users/frank/Documents/coding/companygraph/api/src/neo4j/read-only-session.ts:25`. The route handler `handleCypher` calls it directly (`api/src/routes/query.ts:143`).
- **Fix:** Global replace `executeCypherPassthrough` → `runPassthrough` (5+ occurrences). Cite the exact file path `api/src/neo4j/read-only-session.ts`. AC-23's grep assertion (line 339) currently says *"for `executeCypherPassthrough` import (at least 1 hit)"* — change to `runPassthrough`.

### B-02 — Highlight CSS-class catalog and wireframe source-of-truth are wrong file + partly invented

- **Where:** FR-H02, motivation §"second reason", Risks #4, Dependencies row "`companygraph-journeys.html` wireframe".
- **What's wrong:**
  1. The spec repeatedly cites `companygraph-journeys.html` as the source of the CSS classes `.gnode.selected`, `.gedge.highlight`, `.gedge.breach`, `.gedge.warn`, `selectNode`, `selectEdge`. **These do not exist in journeys.html.** `grep -nE 'gnode|gedge|selectNode|selectEdge' companygraph-journeys.html` → 0 hits. They exist in **`companygraph-views.html`** (`.gnode` line 373, `.gnode.selected` line 426, `.gedge.highlight` line 436, `selectEdge`/`selectNode` lines 4449/4528).
  2. **`.gedge.breach` and `.gedge.warn` do not exist anywhere** — neither in views.html nor in journeys.html. journeys.html has `arrow.warn`/`arrow.breach`/`sla-dot.warn`/`sla-dot.breach` (line 124-129), which are mini-svg utility CSS, NOT canvas-graph classes. views.html's canvas has no breach/warn variants on `.gedge` at all.
- **Fix:** (a) Change wireframe source from `companygraph-journeys.html` → `companygraph-views.html` everywhere (FR-H01, FR-H02, motivation, Dependencies). (b) Drop `.gedge.breach`/`.gedge.warn` from FR-H02's enumeration, OR move them to Risks #4 as "to-be-added in design phase". (c) Either confirm `.gnode.recommended` (Risks #4) is also a delta against the wireframe, or remove that aside.

### B-03 — Deep-link URL format hallucinated; explorer uses `#/explorer/graph/:id?act=:activityId`, not `#/explorer/journeys/:id?highlight=…`

- **Where:** FR-H03 (line 226). Quoted format: *"`#/explorer/journeys/uj_order_fulfillment?highlight=nodes:a1,a2,a3;edges:e_label_1,e_label_2;style:breach=e_label_1,e_label_2`"*.
- **What's wrong:** Neither `process-explorer-ui/requirements.md` nor either wireframe documents a `?highlight=` query syntax. `grep -nE 'highlight=' companygraph-views.html companygraph-journeys.html` → 0 hits.
  - `process-explorer-ui/FR-14` says hash routes are `#/explorer/journeys/:id`, `#/explorer/activities/:id`, etc. (existed-as-of-rev-2 view).
  - `companygraph-views.html` actually uses `#/explorer/graph/:id?act=:activityId` (lines 942-966, 990-1065).
  - These two themselves disagree, but neither matches FR-H03's `?highlight=nodes:…;edges:…;style:…` mini-format.
- **Fix:** Either (a) downgrade FR-H03 to a `should` and defer the URL grammar to design phase with an explicit pointer to `process-explorer-ui/design.md`; or (b) lock the URL grammar in rev 3 and reconcile with `process-explorer-ui` first (cross-spec contract change → reopen that spec's review counter). Recommend (a).

### B-04 — `aggregate` (FR-T08) write-statement gate is asserted but not enforced

- **Where:** FR-T08 (line 162), Risks #7 (line 422).
- **What's wrong:** FR-T08 lets the LLM emit `matchCypherFragment: string`. Risks #7 lists three mitigations: (a) orchestrator wraps in `MATCH … RETURN …` template, (b) `graph-core/POST /query/cypher`'s write-statement detector applies, (c) `executeRead` driver gate is the ultimate stop. Mitigation (b) is **wrong**: `api/src/routes/query.ts:128-145` and `api/src/neo4j/read-only-session.ts:61` show graph-core retired the regex-based write detector at design pass-1 C-04 (comment on line 128: *"design pass-1 C-04: regex retired"*). The **only** stop is the driver's AccessMode (mitigation c), which catches `CREATE`/`MERGE`/`DELETE` at execution time and raises `write_statement_rejected`. That's still a stop — but the spec's risk text claims "write-statement detector still applies", which is no longer true. **More importantly**, the orchestrator-template wrap (mitigation a) is the only structural protection, and the spec does not specify the template shape, the allowed-fragment grammar, or whether `params` keys are restricted. A fragment like `n) WITH n AS m MATCH (z) DETACH DELETE z RETURN count(m` could slip past a naive `MATCH ${fragment} RETURN …` wrap.
- **Fix:** Either (a) demote `aggregate` to a fixed set of named patterns (no free-form Cypher fragment) — recommended; or (b) commit the wrap template + the grammar (e.g. "fragment must be a single `MATCH` clause, no semicolons, no `CALL`, no `;`, no `//`") to the FR text now, and add an AC asserting the gate. Update Risks #7 to drop the false "write-statement detector still applies" claim.

## Concerns

### C-01 — Tool registry & dispatch + JSON-Schema converter mid-FR

FR-B04 says *"The Anthropic tool-use JSON Schema is auto-generated from each tool's `zod` schema at server boot."* Risks #2 lists the converter as an open design question (likely `zod-to-json-schema`). These contradict: FR-B04 commits a behavior that Risks #2 says is undecided. Either lock the package now (and add it to Dependencies + `package.json`) or move the auto-generation claim from FR-B04 to a Risks/design-phase item.

### C-02 — Latency budget arithmetic under-states LLM thinking time

NFR-02 claims P50 ≤ 8 s with 3 LLM calls @ 1.5 s + 3 tool calls @ 800 ms + 1 narration @ 1.5 s = 8.4 s. Claude Sonnet 4.6 tool-use round-trip on a typical 500-token prompt + small tool-result context is closer to **2.5–4 s P50, 6–8 s P99** per call. A 3-tool ReAct loop's P50 with Sonnet is more like 12–15 s; P99 closer to 30 s. The spec's NFR-02 numbers will fail under realistic load. Recommend re-baselining (e.g. P50 ≤ 12 s, P99 ≤ 30 s for a 3-tool turn) OR adding a "thinking budget" caveat OR forcing tools to be executed in parallel where possible.

### C-03 — Streaming OOS conflicts with 8–20 s response window

Scope says streaming is out (FR-B01: *"server holds the connection until the loop completes"*). At P99 = 20 s (NFR-02) the user sees a blank loading state for 20 s. The Native Conflicts row "Browser back gesture on iOS Safari" hints at "if a chat turn is in-flight" — i.e. an implicit loading state. Make the loading state explicit (a new FR or AC: "While the loop is running, the UI shows a per-tool progress indicator using `tool_calls[].tool_name` populated incrementally — but the request is still one round-trip; the UI just reveals an envelope-side `progress_events[]` after the response lands"), OR lift streaming back in scope.

### C-04 — Cost-cap counter persistence is unspecified

NFR-09 says ≤ 500 LLM calls per day per `ANTHROPIC_API_KEY`. AC-29 says the counter is enforced server-side. FR-B02 only describes `chat_conversations` and `chat_messages` tables. No table or process-memory variable is named for the per-conversation (50) and per-day (500) counters. Add a third SQLite table (e.g. `chat_llm_quota` with columns `(scope_key TEXT PK, window_start TIMESTAMP, count INTEGER)`) or commit to in-process atomic counters with a "resets on server restart" caveat.

### C-05 — `ANTHROPIC_API_KEY` unset boot behavior is in Risks, not FR

Risks #14 says "warn if `ANTHROPIC_API_KEY` is unset (degrade to mock LLM)". Mock-LLM degrade is a behavior change that downstream tests will assert against. Promote it to an FR (e.g. FR-B06): "If `ANTHROPIC_API_KEY` is unset at server boot, `LLMClient` resolves to `MockLLMClient` and `/api/v1/chat/messages` responses include `degraded: 'mock_llm'` in the envelope." Add an AC for this path.

### C-06 — `result_truncated` is a `ValidationError` from `runPassthrough`, not a tool-level error envelope code

FR-T error envelope (line 173-181) lists `result_truncated` as one of the codes the tool envelope surfaces. But `runPassthrough` rejects the promise with `new ValidationError("result_truncated", { limit: ROW_CAP })` (`api/src/neo4j/read-only-session.ts:49`) — a thrown error, not a successful return. The orchestrator must catch it and convert to `{ ok: false, error: { code: 'result_truncated', ... } }`. State this conversion explicitly in FR-T error envelope text and in AC-27.

### C-07 — Behavioral-role auto-routing embedded in main LLM call (Risks #3) is not in an FR

Risks #3 says the design phase will confirm whether the classifier is a separate Haiku call or embedded in the main system prompt. FR-R02 says *"the same LLM call that does the in-scope check from FR-A04 — single round-trip"*. The two are inconsistent. Lock the design choice in FR-R02 now or move FR-R02's "single round-trip" claim to the design-phase risk.

### C-08 — `cypher` tool budget gap (FR-T14) — error path overlap

FR-T14 says the `cypher` tool is the escape hatch enabled only for `graph_analyst`. Spec doesn't enumerate which `ERROR_CODES` codes the LLM-shown narration uses on `parse_error` (a real graph-core code, line 4448 of errors.ts). Add `parse_error` to FR-T's enumerated codes list, and add an AC for "LLM emits invalid Cypher → orchestrator narrates `parse_error` with the offending position".

### C-09 — XSS sanitisation vector coverage gap

AC-22 enumerates 3 vectors: `<script>`, Markdown `javascript:`, `<img onerror>`. Two additional vectors commonly used in jailbreak/exfil attempts are missing:
  - `<iframe srcdoc="…">` — renders arbitrary HTML even when parent escapes
  - SVG with `<foreignObject>` containing HTML (since the explorer canvas uses SVG)
Add both to AC-22 (now 5 vectors) and reflect the count in NFR-06.

## Nits

### N-01 — `claude-sonnet-4-6` model id

Anthropic's model ids are typically `claude-sonnet-4-5-20250929`-style. FR-B03 + Scope Boundaries name `claude-sonnet-4-6` — confirm this is the live id at the time of writing (2026-05-23 — model 4.6 may now be `claude-sonnet-4-6-YYYYMMDD`). Pin the exact dated alias.

### N-02 — `tool_unauthorised_for_role` and `tool_budget_exhausted` not in `ERROR_CODES` enum

FR-T error envelope lists these two "chat-specific additions". `api/src/errors.ts:4-19` shows the enum is closed and asserted exhaustive. Either extend the enum (an "additive change" per `CLAUDE.md`'s versioning policy — fine) or scope them to chat-only by namespacing (`chat:tool_unauthorised_for_role`). Pick one, state it.

### N-03 — `EventEmitter` vs SSE for `describe_schema` invalidation

FR-B05 says invalidation goes through *"In-process EventEmitter subscription from ontology-manager/FR-17"*. `ontology-manager/FR-17` dual-publishes (in-process EE + SSE). Since chat runs server-side, in-process EE is the right channel — but make it explicit: "chat-interface subscribes to the in-process `ontologyEvents` EventEmitter exported from `api/src/ontology/events.ts`, NOT the SSE endpoint."

### N-04 — FR-G05 string ends a sentence with a period in the spec but is described as "appended after the final narration"

FR-A02 / FR-G05 fixed string: `"Reached the per-turn tool budget — answering with the data gathered so far. Refine the question to dig deeper."`. Tests will assert verbatim. Confirm whether the final narration ends with `.` or newline — if narration ends with no trailing period the result is `…answer text\nReached the per-turn tool budget…`. State the join character.

### N-05 — `Cmd+\` shortcut conflict description has a typo

Native Conflicts row: *"Browser `Cmd+\` is unbound on most browsers but `Cmd+Shift+\` is reserved on Chrome"* — `Cmd+Shift+\` is actually Safari's "show/hide tab overview" on some macOS versions; in Chrome `Cmd+Shift+\` toggles fullscreen on certain platforms. Tighten the description or just say "`Cmd+\` is mostly free across macOS browsers; on conflict, fall back to the visible toggle".

### N-06 — Counts disagreement: rev 3 supersession table says "14 read-only tools" (line 31), FR-T defines 15

Line 31: *"Tool registry of 14 read-only tools"*. FR-T01..T15 = 15 tools. Update the supersession table to "15 read-only tools".

## Strengths

(Worth preserving into the design phase.)

1. **Tool registry typed-via-zod with auto-generated JSON Schema** (FR-B04) is the right architectural choice — single source of truth, one validator, no drift between server-side dispatch and Anthropic tool-use payload.
2. **Read-only invariant preserved through agentic redesign** (NFR-03, NFR-04, AC-23, AC-24) — the spec correctly identifies that the new tool surface area is the *new* attack surface and extends the grep test accordingly.
3. **Five fixed-string refusal paths are verbatim in the FR text** (FR-G01..G05) — tests will assert character-exact strings without ambiguity.
4. **Behavioral-role catalog enumerated in a table** (FR-R01 §"Role catalog") — 20 roles with explicit `allowed_tools[]` makes the tool-gate testable per role (AC-06). Each role's "one-line bias" is short enough to inline as system-prompt overlay seed.
5. **Tool-budget cap = 5** (FR-A02) + the explicit FR-G05 partial-answer refusal — pragmatic; prevents runaway loops without hard-killing legitimate complex questions.
6. **Prompt-injection redaction regex** (NFR-10) is conservative + the open-question caveat in Risks #11 (false-positive tuning across seed graph) shows good awareness.
7. **Audit trail** (FR-A05, FR-C03) — `tool_calls: [{ tool_name, args, duration_ms, row_count, error_code?, result_preview }]` is the right "show reasoning" payload for both UX and forensics.

## Coverage check

- **All 18 user stories (CU-1.1..CU-3.2 + journey coverage) addressed: partial.**
  - The chat-interface row in user-stories.html line 1160 lists 9 chat stories (CU-1.1..CU-3.2). Spec frontmatter line 10 claims "18 user stories" (rev 3 expansion = 9 chat + journey/cross-section coverage from journeys.html). Count is inconsistent — frontmatter says 18, user-stories table says 9. Reconcile in the doc.
  - All 14 `uj_*` ids in the Role catalog table do exist in both wireframes (verified line-by-line).
- **All rev-2 invariants preserved in rev 3: yes** — supersession §"What does NOT change" enumerates them; spot-checked NFR-03 (no write paths), NFR-04 (read-only gate), NFR-05 (no auth), NFR-06 (sanitisation) → all present.
- **Platforms & Input Modes table complete: yes** — 4 surfaces × 15 rows, no missing cells (one row is intentionally `n/a` on iPhone for Pencil + Cmd shortcuts).
- **Native Conflicts table complete (no `(none)` rows): yes** — 20+ rows, all populated.
- **Every AC has Platforms + Verification columns: yes** — spot-checked AC-01..AC-30; some `n/a (server)` and `n/a (codebase)` entries which is appropriate for backend ACs.
- **Every FR-T tool's read-only Cypher gate verifiable: yes, except FR-T08 (aggregate).** The aggregate tool accepts free-form `matchCypherFragment` — AC-23 catches `driver.session()` imports but does NOT catch a fragment that smuggles a write through a `runPassthrough` call (the AccessMode driver gate catches it at runtime, but not at static-analysis time). See B-04 for the structural fix.

---

**End of review.** Approve-grade once the 4 blockers are addressed; concerns C-01..C-09 should land before design phase but are not approval-blocking individually.
