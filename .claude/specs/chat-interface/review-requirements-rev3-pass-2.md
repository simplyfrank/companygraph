---
feature: chat-interface
reviewing: requirements
reviewer: spec-review-agent
verdict: approve
reviewed_at: 2026-05-23
pass: 2
revision: 3.1
---

# Review: chat-interface requirements (rev 3.1) — pass 2 of 2 (FINAL)

## Verdict

**approve.** All 3 pass-1 blockers + all 6 concerns + all 4 nits land
cleanly. The `shared/seed/journey-catalog.json` fixture exists, parses
as valid JSON, and contains exactly the 14 `uj_*` + 5 cross-section
ids + `default_role_id: "graph_analyst"` + empty `exclusion_list[]`
that the rewired FR-R01 CI test (`shared/__tests__/role-coverage.test.ts`)
will assert against. The fixture's `journey_ids[]` matches the role
catalog's 14 journey rows verbatim, character-for-character. No
architectural regressions introduced by the absorption. Two minor new
concerns + one open-accepted carry-over for design phase, all
non-blocking. The HARD CAP gate (≤ 2 review passes per phase) is
respected — this is the final requirements pass.

The safety story is now airtight under the expanded tool surface:
FR-T14's narrative paragraph (lines 226–247) explicitly walks the
`runPassthrough` → `ValidationError("write_statement_rejected")` →
dispatch envelope → orchestrator → FR-G03 chain, names APOC posture
on the Neo4j Community deployment, and AC-33 pins the chain
end-to-end with four sub-cases (`CREATE`, `MERGE`, `SET`, `DELETE`).
The classifier topology contradiction is closed by committing
embedded — FR-A04, FR-R02, AC-20, and Risks #3 all sing the same
note now.

## Pass-1 finding disposition (3 / 6 / 4)

### Blockers (3 / 3 cleanly absorbed)

#### B-01 — Classifier topology contradiction (FR-A04 vs FR-R02 vs AC-20)

**Cleanly absorbed.** FR-A04 (lines 198) now reads as a hard commit
to the embedded topology: *"The first LLM call of every turn carries
a structured-output response schema requiring the LLM to emit
`{ intent: 'in_scope' | 'oos', role_id?: string }` as the FIRST
tokens of its response (a single round-trip — no separate classifier
call; pass-1 B-01 lock)."* FR-R02 (line 285) is consistent: *"the
orchestrator relies on the FR-A04 embedded classifier — the first
LLM call's structured-output response schema emits …. No separate
classifier call."* AC-20 (line 435) is consistent: *"when the FR-A04
embedded classifier emits `intent: 'oos'` as the first structured-
output field of the first LLM call's response, the orchestrator
short-circuits: no tool dispatch runs, the ReAct loop never starts."*
Risks #3 (line 520) is consistent: *"Locked to **embedded topology**
… NOT a separate Haiku-tier round-trip."* Four call sites, one
topology. No contradiction remains.

#### B-02 — Role-coverage CI test pivot to `journey-catalog.json`

**Cleanly absorbed.** Fixture verified at
`/Users/frank/Documents/coding/companygraph/shared/seed/journey-catalog.json`
(1204 bytes, parses as JSON, 14 journey_ids + 5
cross_section_view_ids + `default_role_id: "graph_analyst"` + empty
`exclusion_list`). The 14 journey ids match the role catalog
(requirements.md lines 297–310) one-for-one. FR-R01 (line 284) now
explicitly pivots the test source: *"`shared/__tests__/role-coverage.test.ts`
reads `shared/seed/journey-catalog.json` (the maintained mirror of
the wireframe's `uj_*` ids) — NOT `retail-mini.json`, whose nodes
carry UUIDv7 ids per `graph-core/NFR-07` and have no `uj_*`-shaped
strings."* Dependencies table (line 512) declares the fixture as a
spec dependency and explicitly notes it is "Consumed ONLY by
`shared/__tests__/role-coverage.test.ts` — NOT by the graph-data
seed importer." Drift mitigation is named in Risks #21 (line 556)
with a regeneration script (`pnpm run sync:journey-catalog`)
deferred to design phase. The vacuous-pass failure mode that B-02
flagged is structurally impossible against the new fixture.

#### B-03 — FR-T14 free-Cypher safety story narration

**Cleanly absorbed.** FR-T14 (line 224) now carries a dedicated
"safety story" paragraph (lines 226–247) that is locally readable
without cross-referencing four other FRs. The chain is explicit:
*"(1) the tool dispatcher calls `runPassthrough`
(`api/src/neo4j/read-only-session.ts:25`, …) which opens a session
with `AccessMode.READ`; (2) the Neo4j driver rejects any write at
the session boundary and `runPassthrough` re-throws as
`new ValidationError("write_statement_rejected")`; (3) the tool
dispatcher's `try/catch` converts this to
`{ ok: false, error: { code: 'write_statement_rejected', … } }`;
(4) the orchestrator catches the envelope and emits the **FR-G03**
fixed string verbatim."* The defensive posture is **explicitly named
parallel to `aggregate` (FR-T08)**: *"The `AccessMode.READ` setting
is the sole **structural** stop — same posture as the `aggregate`
tool (FR-T08) per Risks #7."* Risks #7 (line 528) now carries the
APOC paragraph the pass-1 review asked for: *"Today's `graph-core`
`docker-compose.yml` ships **Neo4j 5 Community edition without
APOC** — there is no plugin-side write surface to escape into …
Design phase confirms this assumption against the actual
`docker-compose.yml` and pins a CI check that fails if APOC write
procedures are ever enabled."* AC-33 (line 448) pins the chain
end-to-end against the real Neo4j integration fixture (not a mock)
with 4 sub-cases (`CREATE`, `MERGE`, `SET`, `DELETE`) and asserts the
verbatim FR-G03 string. Local readability achieved; the chain is now
one paragraph + one AC.

### Concerns (6 / 6 cleanly absorbed)

#### C-01 — XSS list extension to 7 vectors

**Cleanly absorbed.** AC-22 (line 437) lists 7 vectors with explicit
`(f)` and `(g)` items for `<svg><use href="javascript:alert(1)" />`
and `<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>`.
NFR-06 (line 381) cross-references "7 injection vectors per AC-22"
and adds the structural rule *"the answer-body markdown renderer
pins `allowedSchemes: ['http','https','mailto']` AND excludes all
SVG tag names from `allowedTags`."* The test recipe is precise: *"no
`<script>`/`<a javascript:>`/`<img>`/`<iframe>`/`<foreignObject>`/
`<use>`/`<a xlink:href>` element survives render."*

#### C-02 — `cypher_planning_hint` orphan field dropped

**Cleanly absorbed.** FR-R02 (line 285) emission shape is now exactly
`{ intent: 'in_scope' | 'oos', role_id?: string }` — the dead field
is gone. The Pass-1 resolutions table (line 30) explicitly states
*"`cypher_planning_hint` (FR-R02) … **Dropped.** FR-R02's classifier
emission is now just `{ intent, role_id? }`."* No vestiges anywhere
in the doc.

#### C-03 — `bound_context` 50-id cap promoted to FR-M01

**Cleanly absorbed.** FR-M01 (line 338) now carries the cap inline,
not buried in Native Conflicts: *"`bound_context.node_ids` and
`bound_context.edge_ids` are each hard-capped at 50 entries (FIFO —
oldest dropped). When the cap is exceeded, the eviction is silent
(no user-visible error, but the orchestrator emits a server-log
warning `chat.bound_context.evict`)."* AC-14 (line 429) is extended
in two parts: Part 1 asserts the existing 2-id carry-forward; Part 2
*"simulate 50 prior turns each citing a distinct node id; on turn
51, citing `n_51` evicts `n_1` (FIFO), so `bound_context.node_ids`
contains `n_2..n_51` (50 entries, no `n_1`). Same for `edge_ids[]`.
The orchestrator emits a `chat.bound_context.evict` log line on
eviction."* Native Conflicts row 17 (line 493) is reworked to make
the per-request framing explicit (see N-03 below).

#### C-04 — FR-B07 race window

**Cleanly absorbed.** FR-B07 (line 370) now spells out the race
contract: *"Race contract (pass-1 C-04): between the client's
`POST /api/v1/chat/messages` and the orchestrator allocating +
persisting the `message_id`, a conversation has exactly one
in-flight message; the conversation-keyed lookup is unambiguous.
Once `message_id` lands in the response envelope (or the SSE
stream), the message-keyed path takes over for subsequent polls."*
The endpoint signature now accepts EITHER `?conversation_id=<id>`
alone OR `?message_id=<id>`. AC-32 (line 447) asserts both paths and
the race-window transition. The pre-completion race the pass-1
review flagged is gone.

#### C-05 — Auto-routing "low confidence" numeration

**Cleanly absorbed.** FR-R02 (line 285) now reads: *"the LLM is
instructed to deterministically pick one `role_id` from the 20-role
registry; 'low confidence' is expressed by the LLM emitting `role_id:
"graph_analyst"` (the default role) — no numeric threshold, the
prompt is the threshold. The prompt explicitly says: *'If no journey
or cross-section role clearly applies, return `graph_analyst`.'"*
This is option (b) from the pass-1 fix recommendation — the simpler,
prompt-shaped path. No fuzzy threshold; the LLM's emission is the
test surface.

#### C-06 — `MockLLMClient` fixture selector promoted to FR-T16

**Cleanly absorbed.** New FR-T16 (line 249) names the selector
precisely: *"`MockLLMClient` (FR-B03) reads its active fixture from
`process.env.MOCK_LLM_FIXTURE` at construction time, falling back to
`"default"` when unset. Fixtures live in
`api/src/chat/llm/fixtures/<name>.ts`, each exporting a typed
`MockFixture` shape `{ tool_calls: ToolCall[], final_text: string,
classifier: { intent, role_id? } }`. Per-test override via
`vi.stubEnv('MOCK_LLM_FIXTURE', '<name>')` or the test-process
env."* FR-B03 (line 366) cross-references FR-T16. Every AC that
relies on "mock LLM emits …" (AC-04, AC-21, AC-31, AC-33) now has a
named selector to bind to.

### Nits (4 / 4 cleanly absorbed)

#### N-01 — Chat-domain return types pinned to `shared/src/types.ts`

**Cleanly absorbed.** Dependencies row (line 508) names the file
explicitly: *"`shared/src/types.ts` (chat-domain extension, pass-1
N-01) | Home for the chat-tool return types named in
FR-T03/T07/T08/T09/T10/T11/T12/T13: `Hotspot`, `Handoff`,
`SoDConflict`, `SoDEntry`, `AICandidate`, `AggRow`, `AggregatePattern`
enum."* Coverage clause: *"every chat-domain type referenced in FR-T
tables must be exported from this file."*

#### N-02 — `advisory_banner` envelope placement

**Cleanly absorbed.** FR-G06 (line 358) is explicit: *"the banner
travels on the chat envelope as a dedicated top-level field
`advisory_banner?: string | null`, NOT appended to `answer`. The PWA
renders it as a styled banner above the answer body with a 'Switch
role' action button."* FR-B01 (line 364) and NFR-08 (line 383)
response schemas both include `advisory_banner?: string | null`. The
test author has a single field to assert.

#### N-03 — Anthropic 200K framing tightened to per-request

**Cleanly absorbed.** Native Conflicts row 17 (line 493) is reworded:
*"Anthropic API per-request input-token ceiling (Sonnet 4.6's context
window applies to input + output combined per single request)
exceeded by an oversized tool result or large carried
`bound_context` | Orchestrator | Truncate `tool_calls[].result_preview`
to 200 chars (FR-A05); cap `bound_context.node_ids` / `edge_ids` at
50 each (FR-M01 hard cap); surface a server-log warning when
truncation fires. The 200K ceiling is per-request, not
per-conversation — only the assembled current-turn payload matters."*
The misstated framing is gone.

#### N-04 — `degraded: 'mock_llm'` added to FR-B01 schema

**Cleanly absorbed.** FR-B01 (line 364) schema now lists
`degraded?: 'mock_llm'` between `advisory_banner?` and `error?`.
NFR-08 (line 383) success envelope mirrors the same. Symmetry with
FR-B06 + AC-31 is now visible at first read of FR-B01.

## Verification matrix

| Pass-1 finding | Disposition | Evidence in rev 3.1 |
|----------------|-------------|---------------------|
| B-01 (classifier topology) | clean | FR-A04 L198, FR-R02 L285, AC-20 L435, Risks #3 L520 — all four sing the same embedded-topology note |
| B-02 (role-coverage CI test) | clean | Fixture `shared/seed/journey-catalog.json` exists + parses + 14+5+1+0 ids match catalog; FR-R01 L284 pivoted; Dependencies L512 names it; Risks #21 L556 names drift mitigation |
| B-03 (FR-T14 safety story) | clean | FR-T14 paragraph L226–247; Risks #7 L528 APOC paragraph; AC-33 L448 4-sub-case integration test |
| C-01 (XSS 7 vectors) | clean | AC-22 L437 lists vectors (a)–(g); NFR-06 L381 cross-references 7 vectors + adds renderer-config structural rule |
| C-02 (`cypher_planning_hint` orphan) | clean | FR-R02 L285 emission shape is `{intent, role_id?}` only — orphan dropped |
| C-03 (`bound_context` cap promoted) | clean | FR-M01 L338 hard cap of 50 inline; AC-14 L429 Part 2 asserts 51st-id eviction + log emission |
| C-04 (FR-B07 race window) | clean | FR-B07 L370 race contract paragraph; endpoint accepts either key; AC-32 L447 covers both paths |
| C-05 (low-confidence numeration) | clean | FR-R02 L285 — option (b): prompt is the threshold, LLM emits `graph_analyst` literal |
| C-06 (`MockLLMClient` fixture selector) | clean | New FR-T16 L249 names env var + fallback + per-test override + fixture shape |
| N-01 (chat types file) | clean | Dependencies L508 names `shared/src/types.ts` + 7 type names + coverage clause |
| N-02 (banner placement) | clean | FR-G06 L358 dedicated envelope field; FR-B01 L364 + NFR-08 L383 schemas updated |
| N-03 (200K per-request framing) | clean | Native Conflicts row 17 L493 rewritten to "per-request, not per-conversation" |
| N-04 (`degraded` in FR-B01) | clean | FR-B01 L364 + NFR-08 L383 schemas now list `degraded?: 'mock_llm'` |

**Counts: 13 cleanly absorbed / 0 partially absorbed / 0 regressed.**

## New concerns (pass 2, ≤ 2 allowed under HARD CAP)

### NC-01 (minor) — `runPassthrough` line number citation hardcoded

FR-T14 (line 226), FR-T error envelope conversion contract (line 266),
NFR-04 (line 379), and AC-33 (line 448) all cite the symbol's exact
location as `api/src/neo4j/read-only-session.ts:25` (and `:30` for
the `defaultAccessMode` setting). If the file is touched during
design or execution phase, these line numbers drift and the spec
becomes self-inconsistent. **Recommendation for design phase**:
either (a) drop the line numbers and let the symbol name carry the
reference; or (b) pin them with a CI grep that fails if
`runPassthrough` is no longer at line 25. Non-blocking — the symbol
name is unambiguous and the references are correct today.

### NC-02 (minor) — Pass-1 resolutions table is duplicated at the top + the rev-3 → rev-3.1 resolution table is preserved below

Lines 17–38 contain the pass-1 rev-3.1 resolutions table; lines 40–66
preserve the earlier rev-3 → rev-3.1 absorption table. Both are
useful for audit, but the doc now opens with ~50 lines of two
historical resolution tables before the spec proper begins. A
reader who hasn't followed the review history hits two
review-trail-shaped tables before seeing the supersession notice
and motivation. **Recommendation**: at design-phase kickoff, fold
the earlier table into a `## Review history` appendix at the bottom
so the active resolution table stays prominent. Non-blocking —
the audit trail is correct, just verbose at the top.

## Open-accepted carry-overs for design phase

These items remain open by deliberate design (not regressions, not
unresolved blockers — explicit design-phase commitments):

1. **System-prompt + few-shot per role (Risks #1).** 20 roles × 2–4
   examples each. Design phase commits the prompts + a hash-pinned
   regression test in `api/src/chat/roles/prompts/<role_id>.md`.

2. **Highlight CSS variant classes (Risks #4, FR-H02 last paragraph).**
   `style.breach`/`style.warn`/`style.selected` payload keys are
   reserved; canvas-class mapping deferred. Until design ships
   variants, breach/warn edges render with `.gedge.highlight` + a
   tooltip-state surface. Wireframe today only has the variants on
   mini-svg `arrow` elements, not on the canvas — design confirms.

3. **Deep-link URL grammar (Risks #16, FR-H03).** Cross-spec contract
   with `process-explorer-ui`. FR-H03 demoted to `should`; field is
   `null` when grammar not yet locked or payload > 2048 chars.
   Design phase coordinates with `process-explorer-ui/design.md`.

4. **Progress surface short-poll vs SSE (Risks #17, FR-B07, AC-32).**
   Design phase picks. AC-32 binds to whichever lands.

5. **Aggregate-pattern initial set + Cypher templates (Risks #7).**
   The 6 patterns are enumerated; design phase commits each
   `aggregate-patterns.ts` template.

6. **Journey-catalog fixture regeneration script (Risks #21).** The
   `pnpm run sync:journey-catalog` script that re-parses the
   wireframe and rewrites the fixture; design phase commits it. Out
   of scope for requirements.

7. **Anthropic dated model variant (Risks #14, FR-B03).** Model alias
   `claude-sonnet-4-6`; design phase pins the dated variant
   (`claude-sonnet-4-6-YYYYMMDD`).

8. **SQLite migration ergonomics (Risks #20).** Three tables in v1;
   design phase commits the migration tool (recommendation:
   `CREATE TABLE IF NOT EXISTS` for v1, defer migration tooling).

9. **APOC presence check (Risks #7 last sentence).** Design phase
   pins a CI check that fails if APOC write procedures are ever
   enabled on the `graph-core` `docker-compose.yml`.

10. **`runPassthrough` line-number citations (NC-01 above).** Either
    drop the line numbers or pin them with a grep.

11. **Resolution-table archival (NC-02 above).** Fold the rev-3 →
    rev-3.1 table into a `## Review history` appendix.

## Strengths preserved (carry into design phase)

1. **Two-tier resolution-tables at the top.** Lines 17–38 (this pass)
   + lines 40–66 (prior pass) are a clean, line-numbered audit trail.
   Every finding maps to a section. Folding into `## Review history`
   at design kickoff (NC-02) keeps the trail without crowding the
   spec proper.

2. **`runPassthrough` is the single named structural gate.** FR-T14
   safety paragraph, FR-T08 (aggregate) Risks #7 lock, NFR-04, and
   AC-33 all name the same single chokepoint (the driver's
   `AccessMode.READ` setting at `read-only-session.ts:30`). One gate,
   one named symbol, one integration test. The pass-1 review's worry
   that FR-T14 was implicitly hedging on "what stops a write?" is
   gone.

3. **Closed-enum `aggregate` + named-symbol `cypher` is the right
   architectural split.** FR-T08's 6-pattern enum eliminates
   LLM-controlled Cypher fragments from the aggregation surface;
   FR-T14 keeps a single deliberate free-form escape hatch gated to
   one role with one structural stop. Clean separation of intent.

4. **20-role catalog matches the fixture matches the wireframe.**
   Verified line-by-line: 14 journey rows in the catalog (lines
   298–310) match 14 `journey_ids` in the fixture
   (`journey-catalog.json` lines 5–20) match the 14 `uj_*` ids in
   `companygraph-journeys.html`. 5 cross-section rows in the catalog
   (lines 311–315) match 5 `cross_section_view_ids` in the fixture
   (lines 21–27). Default role `graph_analyst` (catalog line 296)
   matches `default_role_id` in the fixture (line 28). The CI test
   in FR-R01 will close the loop.

5. **5 + 1 fixed-string refusal paths (FR-G01..G06) emitted by the
   orchestrator, not the LLM.** Character-exact strings; AC-19
   through AC-21 + AC-29 + AC-33 all assert verbatim. The FR-G06
   advisory banner has a dedicated envelope field — never appended
   to `answer`. No ambiguity for the test author.

6. **AC-33 uses the real Neo4j integration fixture (not a mock) for
   the driver gate.** Line 448: *"uses the real Neo4j integration
   test fixture (not a mock) for the driver-side gate; runs in the
   `bun test:integration` job."* The single structural stop is
   tested against the real implementation.

7. **`degraded: 'mock_llm'` is the spec's reliability story for an
   unset API key.** FR-B06 + AC-31 + envelope field in FR-B01 +
   NFR-08. The server doesn't refuse to boot; it degrades visibly,
   and the chat envelope marks every response so the UI can show a
   banner.

## Coverage check (delta from pass 1)

| Check | Status |
|-------|--------|
| All 9 chat user stories addressed | **Pass** (unchanged from pass 1) |
| All 14 journey roles ↔ wireframe ↔ fixture | **Pass.** Now backed by `journey-catalog.json` with 14 verified ids; CI test in FR-R01 is structurally valid. |
| All 5 cross-section views ↔ wireframe ↔ fixture | **Pass.** All 5 ids in fixture; CI test extends to them. |
| 5 rev-2 safety invariants preserved | **Pass.** Read-only invariant (NFR-04) + no-write-imports (NFR-03 + AC-24) + LLM-output sanitisation (NFR-06 + AC-22, now 7 vectors) + refusal-not-confabulation (5 + 1 fixed strings) + no auth (NFR-05 + AC-25). |
| ReAct cap = 5 enforced + tested | **Pass** (unchanged from pass 1) |
| Highlight payload matches wireframe | **Pass** (unchanged from pass 1, design-phase variants honestly deferred) |
| Scope boundaries explicit | **Pass** (unchanged from pass 1) |
| Dependencies enumerated | **Pass.** Adds `shared/src/types.ts` row (N-01) + `shared/seed/journey-catalog.json` row (B-02). 11 rows total. |
| Risks enumerated | **Pass.** 21 risks (was 20 in pass 1; Risks #21 added for fixture drift). All design-phase open questions named. |
| ACs sized correctly | **Pass.** 33 ACs (was 32 in pass 1; AC-33 added for the FR-T14 chain). |
| Platforms & Input Modes populated | **Pass** (unchanged from pass 1) |
| Native Conflicts table — no `(none)` rows | **Pass** (unchanged from pass 1; row 17 framing tightened per N-03) |
| **Pass-2 new: fixture file present + parses + structurally matches** | **Pass.** `shared/seed/journey-catalog.json` (1204 bytes) parses as JSON, `journey_ids` length 14, `cross_section_view_ids` length 5, `default_role_id` is `"graph_analyst"`, `exclusion_list` is `[]`. |

## Finding counts

- **Pass 1**: 3 blockers + 6 concerns + 4 nits (13 items).
- **Pass 2**: 0 blockers + 2 minor new concerns (NC-01, NC-02) + 0 nits.
  All 13 pass-1 items cleanly absorbed.
- **Open-accepted for design phase**: 11 items (see §Open-accepted
  carry-overs above) — none blocking.

## Pass tracking

- Pass 1 of 2: revise — 3B / 6C / 4N.
- **Pass 2 of 2 (this pass): approve — 0B / 2 minor NC / 0N.**
- HARD CAP respected: 2 passes total. No further requirements review
  rounds. The spec proceeds to design phase.

---

**End of review.**
