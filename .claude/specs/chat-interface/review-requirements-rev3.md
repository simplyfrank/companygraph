---
feature: chat-interface
reviewing: requirements
reviewer: spec-review-agent
verdict: revise
reviewed_at: 2026-05-23
pass: 1
revision: 3
---

# Review: chat-interface requirements (rev 3.1) — pass 1 of 2

## Verdict

**revise** — the rev-3.1 absorption note at the top of `requirements.md`
(lines 16–41) lands every prior pass-1 finding cleanly, the agentic
redesign preserves all five rev-2 safety invariants, and the
load-bearing tables (Role catalog, FR-T, Refusal strings, Platforms,
Native Conflicts, ACs) are well shaped. **But two FRs contradict each
other** (FR-A04 vs FR-R02 on classifier topology), **the role-coverage
CI test cited in FR-R01 is structurally impossible against the actual
seed file**, and a handful of mid-sized gaps remain in the safety
surface (FR-T14 free-form Cypher is the wide-open back door that
B-04 narrowed for `aggregate` but did not narrow for the escape
hatch; the 5-vector XSS list is missing the explorer-canvas-specific
SVG `<use href>` and `<a xlink:href>` vectors). Three blockers,
six concerns, four nits. Approve-grade after the blockers and at
least four of the concerns land.

The safety story is mostly intact but **not airtight under the
expanded tool surface**. Specifically: every tool except FR-T14
`cypher` is now structurally write-safe; FR-T14 is an
LLM-controlled free-Cypher channel exposed to one role
(`graph_analyst`), and the spec leans on the same two-stop chain
(`runPassthrough`'s driver AccessMode + the orchestrator's
`write_statement_rejected` catch) that B-04 acknowledged is **a single
runtime stop, not two**. That's defensible — the runtime AccessMode
gate is robust — but the spec does not explicitly say "FR-T14 is the
sole free-Cypher surface and its only write-defence is the driver
AccessMode" the way B-04 said it for `aggregate`. Make it equally
explicit.

## Blockers

### B-01 — FR-A04 and FR-R02 commit contradictory classifier topologies

- **Where:** FR-A04 (line 174); FR-R02 (line 237); §rev-3.1 resolutions table row C-07 (line 34); Risks #3 (line 469).
- **What's wrong:** FR-A04 reads *"Before sending the first LLM call, the LLM is asked (as part of the system prompt's response schema) to classify the question."* That **locks the embedded topology** (single LLM call, response-schema field) at FR level. FR-R02 reads *"Classifier topology is design-phase choice (single round-trip via response schema on the main LLM call OR a separate cheap Haiku-tier call — see Risks #3)."* That **leaves topology open**. They cannot both be true. The §rev-3.1 resolutions table row for C-07 confirms it "open-accepted to design phase", which conflicts with FR-A04's commitment.
  - Downstream impact: AC-20 (line 387) asserts *"the loop never starts"* on OOS — that wording implicitly assumes the embedded topology (no pre-loop separate call). If design picks Haiku, the "loop" never started, but a separate LLM round-trip already happened — semantically different for latency, billing, and audit.
- **Fix:** Pick one. Recommended: align FR-A04 with FR-R02 by softening to *"Before the orchestrator dispatches any tool, the LLM (either as part of the first agent call's response schema or via a dedicated classifier call — see FR-R02) classifies the question. If `intent === 'oos'`, no tool calls run."* Then update Risks #3 to flag that AC-20's "loop never starts" wording must survive either topology choice (it does — but make it explicit).

### B-02 — FR-R01's role-coverage CI test cannot run against `retail-mini.json` as currently shaped

- **Where:** FR-R01 (line 236) — *"A CI check (`shared/__tests__/role-coverage.test.ts`) asserts every `uj_*` id in `shared/seed/retail-mini.json` has a corresponding role id OR appears in a documented exclusion list."*
- **What's wrong:** Per `CLAUDE.md` line 51 (project README) and `graph-core/FR-04`, *every node carries `id` (UUIDv7, server-generated)*. I grepped `shared/seed/retail-mini.json` for `"id":\s*"uj_"` patterns — **zero hits**. The 14 `uj_*` ids (`uj_web_browse_buy`, `uj_order_fulfillment`, …) exist only in `companygraph-journeys.html` as wireframe IDs, NOT in the seed data. The seed encodes journeys with UUIDv7 ids + `"name"` fields like `"Order Fulfillment"`. The role registry's `uj_order_fulfillment` is a stable string identifier in the role config — there is no link from seed UUIDv7 → role id.
  - Consequence: the CI test as worded ("every `uj_*` id in `retail-mini.json`") will pass vacuously (0 ids in the seed match the `uj_` pattern → 0 missing) and provide zero coverage. Worse, the spec's claim that the test enforces journey↔role mapping is false.
- **Fix:** Either (a) extend the seed to carry a `wireframe_id: "uj_order_fulfillment"` attribute on each `UserJourney` node (and update graph-core's `attributes` JSON schema if needed); or (b) restate FR-R01's CI check to assert against the **wireframe** as the source of truth: `shared/__tests__/role-coverage.test.ts` parses the 14 `uj_*` ids out of `companygraph-journeys.html` (or a manually-maintained `shared/role-coverage-fixture.ts`) and asserts each appears in the role registry. Recommend (b) — it matches the documented source-of-truth chain (`companygraph-journeys.html` → role registry) and does not require a graph-data schema change. Update the test's exclusion-list semantics to match.

### B-03 — FR-T14 free-Cypher escape hatch has no enumerated parse_error / write_statement_rejected → user-narration mapping; safety invariant under-specified

- **Where:** FR-T14 (line 200); FR-G03 (line 307); §rev-3.1 resolutions row C-08 (line 31); Risks #7 (line 477).
- **What's wrong:** B-04 was admirably narrowed: `aggregate` (FR-T08) is now closed-enum, no free Cypher, with the only structural gate being the driver AccessMode (per Risks #7). That same logic is **untouched** for FR-T14: the `cypher` tool accepts an LLM-emitted free statement, role-gated to `graph_analyst` only. The driver AccessMode is the only stop. **That's the same single gate B-04 was honest about.** But FR-T14's narrative does not say so. Risks #7's lock language applies to `aggregate` only.
  - More importantly: the rev-3.1 resolutions row C-06 (line 30) says `runPassthrough`'s `ValidationError("write_statement_rejected")` is converted to a tool envelope and then surfaced. FR-G03 (line 307) says that conversion triggers the FR-G03 fixed string. **But FR-T14's spec text never explicitly invokes FR-G03** — the chain is implicit through the tool error envelope and the orchestrator's catch. A reader walking FR-T14 cannot trace "what happens when the LLM emits `CREATE`?" without cross-referencing four other FRs.
  - Defence-in-depth gap: the LLM can craft a Cypher fragment that is read-only at the surface but uses `apoc.cypher.runMany` or `CALL ... YIELD` to escape — these would fail at the driver AccessMode level if APOC writes, but APOC reads (e.g. `apoc.text.regexGroups`) would pass. The spec says nothing about disabling APOC procedures. If the Neo4j 5 Community deployment doesn't have APOC, that's moot — but the spec should state the assumption (graph-core's `compose.yml` / `bootstrap.ts` likely settles this; verify).
- **Fix:**
  1. Add an explicit paragraph to FR-T14 cross-referencing FR-G03 (and FR-T error envelope) so the safety story is locally readable: *"When the LLM emits a write statement, `runPassthrough` rejects with `ValidationError('write_statement_rejected')`; the tool dispatcher converts to `{ ok: false, error: { code: 'write_statement_rejected', … } }`; the orchestrator catches and emits the FR-G03 fixed string. The driver AccessMode is the sole structural stop — same posture as `aggregate` (FR-T08) per Risks #7."*
  2. Add a new Risks entry (or extend #7) on APOC / `CALL` procedures: *"FR-T14's Cypher statement reaches the Neo4j driver unfiltered. If the deployment includes APOC or other procedure plugins, design phase must confirm none of them can write. Today's `docker-compose.yml` (graph-core/T-04) ships Community-edition Neo4j 5 with no APOC — confirm at design phase."*
  3. Add an AC (call it AC-33) that asserts the FR-T14 → FR-G03 chain end-to-end against the actual driver (integration test, MockLLMClient emits `cypher("CREATE (n) RETURN n")`, assert response body is the FR-G03 string verbatim). AC-21 currently covers this for `MERGE` / `CREATE` but does not pin the chain to FR-T14 specifically — make the linkage testable.

## Concerns

### C-01 — XSS vector list is JS-DOM-shaped; misses two SVG/canvas-specific vectors that the explorer surface exposes

AC-22 + NFR-06 enumerate 5 vectors: `<script>`, Markdown `[link](javascript:)`, `<img onerror>`, `<iframe srcdoc>`, SVG `<foreignObject>`. The `companygraph-views.html` canvas is **SVG-based** (verified — `.gnode` is a `<g>`, `.gedge` is a `<line>`). The two missing canvas-native vectors:

- **SVG `<use href="javascript:…">`** — historically a Chrome/Safari bypass for sanitisers that whitelist SVG elements.
- **SVG `<a xlink:href="javascript:…">`** — same family, different attribute.

Both can land via the answer body (LLM directly emits SVG) AND via a node's `description` round-trip. The 5-vector test does not catch them. Either extend AC-22 to 7 vectors or commit to a structural rule (e.g. *"answer-body rendering uses a markdown renderer with `allowedSchemes: ['http','https','mailto']` and `allowedTags` excluding all SVG"*), which collapses the test to a renderer-config assertion plus 2 sample vectors.

### C-02 — `cypher_planning_hint` field in FR-R02 has no downstream consumer

FR-R02 (line 237) defines the classifier emission shape `{ intent, role_id?, cypher_planning_hint?: string }`. Nothing else in the spec consumes `cypher_planning_hint`. Either (a) it's intended for the orchestrator's system-prompt overlay (then state so + add an AC asserting the hint reaches the LLM's prompt), or (b) it's dead weight from an earlier draft and should be removed. Risks #3 doesn't mention it either.

### C-03 — `bound_context` (FR-M01) data-flow has an undocumented growth path

FR-M01 (line 290) describes the carry-forward as *"`highlight.nodes ∪ highlight.edges ∪ tool_calls[].result_preview cited ids`"*. There's no stated bound. Native Conflicts row 17 (line 444) mentions a 50-id truncation in the "Anthropic API max-input-tokens" row, but that's in the conflicts table, not in FR-M01. Promote the truncation to an explicit FR sub-clause: *"`bound_context.node_ids` and `bound_context.edge_ids` each capped at 50 (oldest dropped); rationale at Native Conflicts row 17."* AC-14 currently tests 2 ids — extend to test the 51st-id eviction.

### C-04 — FR-B07 progress endpoint URL grammar collides with FR-B01

FR-B01 (line 316): `POST /api/v1/chat/messages` — synchronous, holds connection. FR-B07 (line 322): `GET /api/v1/chat/messages/:message_id/progress`. The progress endpoint requires a `message_id`, but FR-B01 only emits `message_id` in the **response body** at loop completion. If the loop takes 30 s and the UI wants to start polling within 1 s of POST, it has no `message_id`. The standard fix is to emit `message_id` (or a `correlation_id`) immediately in the response headers (`X-Chat-Message-Id`) or to switch the request topology to "POST returns a `message_id`; client polls; loop runs server-side". Spec doesn't say. Either:
1. Restate FR-B01: *"POST returns `{ message_id }` immediately + 202 Accepted; client polls FR-B07; loop completes in the background."* — but that contradicts "Async-only — server holds the connection until the loop completes" at FR-B01 line 316.
2. Spec a `correlation_id` request body field that the client supplies upfront (UUIDv7 client-side) and that `message_id = correlation_id` at completion. The progress endpoint accepts the `correlation_id`.

Pick one. The current text is incoherent.

### C-05 — Auto-routing classifier "low confidence" threshold not numerated

FR-R02 (line 237): *"Default role `graph_analyst` is selected on tie / low confidence."* No threshold (0.5? 0.7? log-probs?), no test. Without a number, the test author and the LLM-prompt author cannot align. Either (a) commit a threshold ("default if max-confidence < 0.7" or "default if top-2 confidences differ by < 0.1"), or (b) state that the classifier emits a single role_id and there is no confidence score; the LLM is asked to pick deterministically; "low confidence" means the LLM-emitted `role_id` is the literal string `"graph_analyst"`. (Recommend (b) — simpler, prompt-shaped.)

### C-06 — `MockLLMClient` deterministic fixtures (FR-B03) under-specified

FR-B03 (line 318) names `MockLLMClient` as *"fixture-backed"*. AC-04, AC-21, AC-03 etc. all rely on the mock for assertions. Without specifying the fixture-selection mechanism (env var? per-test setup? hard-coded?), tests will end up coupling to whatever T-09 (STATUS line 73) shipped. STATUS line 80 reveals the answer (`MOCK_LLM_FIXTURE` env var) but the requirements doc does not. Pull the mechanism into FR-B03 or an adjacent FR. This is approve-grade if FR-B03 is amended to name the selector.

## Nits

### N-01 — FR-T03 + FR-T07 + FR-T08 schemas leak Cypher specifics into the tool surface

FR-T03's return shape includes `sla_edges: Edge[]`, `handoffs: Handoff[]`, `sod_conflicts: SoDConflict[]`. These types are not yet defined in `shared/src/types.ts` (per STATUS line 75 they were extended during T-02 — fine), but the requirements doc does not name where the type definitions live. Add a Dependencies row pointing at `shared/src/types.ts` for the chat-domain types, parallel to the existing `zod` row.

### N-02 — FR-G05 string is appended with `\n\n` join (N-04 resolution); FR-G06 banner string has no specified placement

FR-G06 (line 310): *"the orchestrator returns a banner above the answer"*. "Above" suggests a separate envelope field (e.g. `advisory_banner: string | null`), not appended to `answer`. Spec does not say. The test author needs to know where to assert. Either (a) add a top-level envelope field `advisory_banner?: string` and update FR-B01's response shape; or (b) merge into `answer` with a `---` separator (parallel to FR-G05's `\n\n` join).

### N-03 — Native Conflicts row 17 "Anthropic API max-input-tokens" — 200K is per-message, not per-conversation

The row says *"max-input-tokens (200K) exceeded by large `bound_context` or oversized tool result"*. Sonnet 4.6's context window is per-request (input + output combined under the model's max); `bound_context` accumulates across turns but the *per-turn* token count is what matters. The mitigation (truncate `bound_context` to 50 ids) is the right answer but the framing slightly misstates the limit. Tighten or strike.

### N-04 — `degraded: 'mock_llm'` envelope field (FR-B06) absent from FR-B01's response shape

FR-B01 (line 316) enumerates the response fields: *"`{ message_id, role_id, answer, highlight, citations, tool_calls, explorer_deep_link, latency_ms_breakdown, error? }`"*. FR-B06 (line 321) introduces a new field `degraded: 'mock_llm'`. AC-31 asserts it. The FR-B01 schema list should include `degraded?: 'mock_llm'` for symmetry — the schema author will read FR-B01 first.

## Strengths preserved (don't lose at design phase)

1. **§rev-3.1 resolutions table at the top of the doc.** Line 16–41 is the single best artifact in this spec for downstream reviewers. Resolution per finding, exact section pointers — keeps the audit trail one click away.

2. **B-04 closed-enum `aggregate` is the right architectural lock.** FR-T08's pattern enum + server-owned templates is structurally write-safe — no LLM-controlled Cypher fragment touches `runPassthrough`. The Risks #7 lock language is honest about the single remaining structural stop (driver AccessMode) and does not claim phantom defences. This is the model FR-T14 should follow (B-03 above).

3. **Five fixed refusal strings verbatim in the FR text** (FR-G01..G05) + FR-G06 as advisory-not-coercive. Tests assert character-exact strings; no ambiguity. The `\n\n` join character on FR-G05 (N-04 resolution from prior pass) is exactly the right level of detail.

4. **Read-only invariant carried through 15 tools.** AC-23 + AC-24's grep recipes are precise and extend to `api/src/chat/tools/`. The fact that STATUS line 90 reports 5/4 passing tests against these greps (T-18) gives confidence the test recipe works.

5. **20-role registry is enumerated in a table with allowed_tools[]** (FR-R01 catalog table line 247–268). Every cell is testable; no role is "TBD". The `cypher` tool's role-gate to `graph_analyst` only (FR-T14) is the cleanest possible expression of the escape-hatch invariant — single role, single tool, single audit point.

6. **5-fixed-refusal precedence is implicit** — orchestrator emits the string, never the LLM. STATUS line 70 reports T-05 verified 5 verbatim string assertions + 9 precedence rules. The spec text doesn't explicitly state precedence order (e.g. write-rejected > zero-rows > truncation > OOS > tool-budget — what's the order if two trigger simultaneously?) but the implementation has it. Carry the precedence ladder into design phase as a §Refusal precedence subsection.

7. **Highlight payload + canvas integration matches the verified `companygraph-views.html` classes.** B-02 (prior pass) corrected the wireframe source-of-truth; rev-3.1 honours the correction (FR-H02 line 274 cites views.html:426 / views.html:436). The `style.breach`/`style.warn` keys are reserved but their CSS mapping is honestly deferred to design phase (FR-H02 + Risks #4).

8. **Cost cap is SQLite-backed not in-memory** (FR-B02 + AC-29). The transactional counter increment is the right approach to defeat concurrent-request bypass. The two scope keys (`conv:<id>` + `day:YYYY-MM-DD`) cover both the conversation-runaway and the daily-billing-runaway scenarios.

## Coverage check

| Check | Status |
|-------|--------|
| **All 9 chat user stories addressed.** | **Pass.** CU-1.1 (AC-01, AC-11, AC-12); CU-1.2 (AC-19, AC-20); CU-1.3 (AC-14, AC-15, FR-M01, FR-M02); CU-1.4 (AC-11, AC-12, FR-C02, FR-C03); CU-2.1 (AC-21, AC-23, AC-24); CU-2.2 (FR-G04, AC-09 deep-link fallback); CU-2.3 (AC-26 latency footer, FR-A02 budget); CU-3.1 (AC-16, FR-M03); CU-3.2 (AC-17, AC-18, FR-M04, FR-M05). All 9 stories trace to ≥ 1 FR + ≥ 1 AC. |
| **All 14 journey roles in role catalog ↔ wireframe.** | **Pass with caveat.** All 14 `uj_*` ids in §Role catalog (line 247–268) match `companygraph-journeys.html` (verified line-by-line: `uj_web_browse_buy` line 271, … `uj_instore_complaint` line 1321). **But the FR-R01 CI test that asserts this mapping is structurally broken — see B-02.** |
| **All 5 cross-section views in role catalog ↔ wireframe.** | **Pass.** `sla_hotspots`, `handoff_matrix`, `sod_register`, `ai_candidates`, `initiative_impact` all match views in `companygraph-journeys.html` lines 1393–1480. |
| **All 5 rev-2 safety invariants preserved.** | **Pass.** (1) No write paths — AC-23 + AC-24 grep extended to `api/src/chat/tools/`. (2) No HTML interp from LLM — AC-22 (5 vectors); see C-01 for SVG canvas-specific extension. (3) Refusal-not-confabulation — 5 verbatim strings (FR-G01..G05) emitted by orchestrator, not LLM. (4) Read-only Cypher — every tool routes through `runPassthrough` (NFR-04, AC-23); see B-03 for the FR-T14 narrative-clarity gap. (5) No auth — AC-25 extends `no-auth-grep.test.ts` to `api/src/chat/` + `pwa/src/views/chat.tsx`. |
| **ReAct cap = 5 tool calls/turn enforced + tested.** | **Pass.** FR-A02 caps; FR-G05 verbatim string on exhaustion; AC-03 asserts mock LLM at 6 calls → forced termination + FR-G05 string. |
| **Highlight payload `{nodes, edges, paths, style}` matches wireframe.** | **Pass with caveat.** FR-H01/H02 commit the shape; FR-H02 cites the two verified CSS classes from `views.html`. `style.breach`/`style.warn` keys are reserved but their canvas-class mapping is design-phase work (FR-H02 last paragraph + Risks #4). Acceptable; honest. |
| **Scope boundaries explicit (streaming, voice, multi-agent, RAG OOS).** | **Pass.** "Out of scope" block (line 354) names: streaming, voice, LLM-driven mutations, RAG, multi-LLM routing, localization, per-user rate-limiting, agent-authored tools. |
| **Dependencies enumerated.** | **Pass.** `graph-core` (hard), `ontology-manager` (soft), `process-explorer-ui` (soft), `@anthropic-ai/sdk`, `better-sqlite3` (with the Bun-incompat caveat at STATUS line 79), `zod`, `zod-to-json-schema@^3.22` locked, both wireframes. |
| **15 open-design-question risks enumerated.** | **Pass.** Risks 1–20 in §Risks (line 463 onward) — actually 20, not 15. The over-delivery is fine; spec brief allowed for ≥ 15. |
| **30 ACs sized correctly.** | **Pass.** AC-01..AC-32 = 32 ACs. The two additions (AC-31 `ANTHROPIC_API_KEY` degrade; AC-32 progress endpoint) absorbed the C-03 + C-05 rev-3 pass-1 findings. Each AC carries Platforms + Verification; no "manual test" / "visual check" bare strings. |
| **Platforms & Input Modes table populated.** | **Pass.** 16 rows × 4 surface columns, no missing cells (Pencil row is intentionally `n/a` on the 3 non-iPad surfaces). |
| **Native Conflicts table — no `(none)` rows.** | **Pass.** 18 rows all populated; chat-specific conflicts (`Cmd+K`, `/`, iOS Smart Punctuation, keyboard covers input) all carry real suppression mechanisms. |

## Finding counts

- **Blockers: 3** — B-01 (FR-A04/FR-R02 contradiction), B-02 (FR-R01 CI test structurally impossible), B-03 (FR-T14 free-Cypher safety story under-narrated).
- **Concerns: 6** — C-01 (XSS missing SVG canvas vectors), C-02 (`cypher_planning_hint` orphan), C-03 (`bound_context` growth path), C-04 (FR-B07 needs `message_id` before completion), C-05 (auto-routing threshold), C-06 (`MockLLMClient` fixture selector).
- **Nits: 4** — N-01 (chat-domain types location), N-02 (FR-G06 banner placement), N-03 (Anthropic 200K framing), N-04 (`degraded` field absent from FR-B01 schema).

Approve-grade once the 3 blockers and ≥ 4 of the 6 concerns land. The
safety story is structurally sound; the gaps are clarity-and-coverage,
not architecture.

## Pass tracking

- **Pass 1 of 2 (this pass): revise** — 3B, 6C, 4N.
- Pass 2 of 2: gated on user acceptance of pass 1.

---

**End of review.**
