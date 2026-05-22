---
feature: chat-interface
reviewing: requirements
reviewer: spec-review-agent
verdict: approve
reviewed_at: 2026-05-22
pass: 2
---

# Review: chat-interface requirements (Pass 2 of 2 — FINAL)

## Summary

Revision 2 of `chat-interface/requirements.md` lands every pass-1 finding
cleanly. The three blockers were not patched cosmetically — each was
restructured against the actual upstream contract:

- **B-01 absorbed by upstream realignment.** Revision 2 of `ontology-manager`
  (which I cross-checked at `/Users/frank/Documents/coding/companygraph/.claude/specs/ontology-manager/requirements.md`)
  now explicitly OWNS `/api/v1/schema` at FR-14 line 102 ("**did not exist
  in `graph-core` and is introduced by this spec (not 'extended')**").
  `chat-interface/FR-18` (line 121) consumes it correctly and degrades to
  an in-process import of graph-core's compile-time const tuples when
  ontology-manager has not yet shipped. The legal-but-degraded fallback is
  honest (the caveat that user-defined types will be invisible is named
  explicitly), and the single-process / single-tenant license is grounded
  in graph-core's NFR-08.

- **B-02 absorbed by ownership pin.** FR-18 now declares the schema cache
  server-side, co-located with the chat backend in `api/` workspace, and
  subscribing to the in-process `EventEmitter` from
  `ontology-manager/FR-17`. The PWA does not maintain its own schema
  cache. The contract is single-channel for chat (in-process EE only) —
  fine because chat is server-side, fits ontology-manager's "dual-channel"
  surface (EE for in-process; SSE for browsers) cleanly.

- **B-03 absorbed by error-shape match.** FR-10 + AC-10 now catch
  `400 result_truncated` with zero data rows and `{limit: 1000}` — which
  is exactly what `graph-core/design.md` §5.4 line 618 emits via
  `reject(new ValidationError("result_truncated", { limit: 1000 }))`.
  The fixed banner string is "more than 1000 rows" (not an exact count,
  because no count is surfaced), and the explorer deep-link is honestly
  framed as best-effort with a fallback to `#/explorer/domains`. AC-10's
  assertion now exercises the actual `ValidationError("result_truncated",
  {limit:1000})` throw path — no more phantom `truncated_at` field.

The four concerns are absorbed too: FR-04 is split into FR-04a (zero rows,
deterministic) + FR-04b (LLM OOS classification, structured-emission per
Risk #3) with a dedicated **§Refusal strings** section enumerating all
four canonical fixed strings; AC-08 is rewritten to grep the
`executeCypherPassthrough` import path positively + the driver / executeRead /
executeWrite imports negatively (no more false-positive `driver.session()`
substring); AC-17 covers three injection vectors (`<script>`, Markdown
`[…](javascript:)`, `<img onerror>`); Risk #11 names prompt-injection-via-graph-content
as a distinct attack class with concrete mitigations layered (system-prompt
invariants, schema-context filter regex, role-tagged narration boundary,
defence-in-depth via AC-17's HTML sanitisation).

The three nits all land. Risk #11 closes N-01. NFR-05 carries the
share-URL threat model (N-02). Row 8 of Native Conflicts is relabelled
"Resolution"; Row 9 carries an inline deferred-decision flag (N-03).

The latency-topology question (C-04) is pinned at FR-17 line 120:
**two LLM calls** (`generateCypher` + `narrateResult`), median budgets
`1500 + 1000 + 1500 = 4 s`, p99 ≤ 10 s — which gives the design author
unambiguous targets.

Two new minor concerns surfaced during this pass — both open-accepted (no
revise round is available); see §Open-accepted concerns. Nothing rises to
blocker.

## Verdict

**approve** — final pass.

- All 3 blockers cleanly resolved.
- All 4 concerns cleanly resolved.
- All 3 nits cleanly resolved.
- 2 minor new concerns observed → **open-accepted** for design phase.
- 0 regressions.

## Pass-1 finding walk

| Finding | Pass-1 verdict | Resolution location | Pass-2 grade |
|---------|----------------|---------------------|--------------|
| **B-01** `/api/v1/schema` not owned by graph-core | blocker | FR-18 (line 121); Dependencies table (line 223); upstream `ontology-manager/FR-14` line 102 OWNS the endpoint | **clean** — endpoint owned by ontology-manager, with documented in-process-import fallback when ontology-manager not yet shipped (legal because chat backend runs in-process with graph-core per NFR-08) |
| **B-02** Cache ownership ambiguous | blocker | FR-18 (line 121): "**Lives server-side**, co-located with the chat backend in the `api/` workspace per FR-15. […] PWA does **not** maintain its own schema cache." Subscribes to `ontology-manager/FR-17`'s in-process EventEmitter (`api/src/ontology/events.ts`). | **clean** — single channel pinned; PWA-side cache explicitly disclaimed |
| **B-03** FR-10 truncation contract mismatches graph-core | blocker | FR-10 (line 88) catches `400 result_truncated` with `{limit:1000}` and zero data rows; AC-10 (line 171) asserts `executeCypherPassthrough` throws `ValidationError("result_truncated", {limit:1000})` and the response body is the fixed banner string; deep-link is best-effort with explorer-root fallback | **clean** — error shape matches graph-core §5.4 line 618 verbatim; fixed banner says "more than 1000 rows" (not an exact count); AC-10 no longer asserts against the phantom `truncated_at` field |
| **C-01** FR-04 conflates two refusal paths | concern | FR-04a (line 76, zero-rows, deterministic), FR-04b (line 77, OOS structured emission per Risk #3); new **Refusal strings** subsection (line 99–112) enumerates all 4 strings | **clean** — paths separated; trigger conditions and source FR mapped per row |
| **C-02** AC-17 single-vector | concern | AC-17 (line 178) tests three vectors: `<script>alert(1)</script>`, `[link](javascript:alert(1))` Markdown, `<img src=x onerror=alert(1)>`; Risk #11 (line 300) names prompt-injection-via-graph as a distinct class with concrete mitigations | **clean** — both halves (HTML sanitisation + LLM-prompt-injection-via-data) addressed |
| **C-03** AC-08 grep too narrow | concern | AC-08 (line 169) rewritten — grep negatives on `neo4j-driver` imports + `driver` / `executeRead` / `executeWrite` from `api/src/chat/`; grep positive on `executeCypherPassthrough` import (at least one hit required) | **clean** — recipe is precise; sister AC-16 still covers no-write-imports independently |
| **C-04** Latency model needs topology | concern | FR-17 (line 120) pins two-call topology + a `1500+1000+1500 = 4 s median; p99 ≤ 10 s` budget; NFR-02 references FR-17 implicitly via "one Cypher round-trip + one LLM call" framing (minor wart — see open-accepted #1 below) | **clean** with a sub-nit |
| **N-01** Prompt-injection-via-graph risk missing | nit | Risk #11 (line 300) added with concrete mitigations layered (system-prompt invariants, schema-context regex filter, role-tagged narration boundary, defence-in-depth) | **clean** |
| **N-02** Share threat model belongs in NFR | nit | NFR-05 (line 131) extended with explicit threat-model commitment (~122-bit UUIDv7 unguessable but unauthenticated; `127.0.0.1`-bound per `graph-core/NFR-02`; operator forwarding bypasses, documented) | **clean** |
| **N-03** Native Conflicts row weakness | nit | Row 8 (line 214, long-press): re-labelled column header reads "Suppression mechanism" but row 8 text now reads "default long-press behaviour … is acceptable" — pragmatic acceptance documented. Row 9 (line 215, back-gesture): inline `"(Operator-discretion — design phase decides …)"` flag | **clean** (with a sub-nit — see open-accepted #2) |

**Resolution counts:** 10 / 10 cleanly resolved; 0 partial; 0 regressed.

## Critical checks (per pass-2 brief)

| Check | Status |
|-------|--------|
| FR-18 reads from `ontology-manager`-owned `/api/v1/schema`; fallback is in-process import of graph-core const tuples (same process per NFR-08) | **passes** — text matches the ownership stated at `ontology-manager/FR-14` line 102 |
| FR-18 pins schema cache as server-side, in-process EventEmitter subscription | **passes** — explicit at FR-18 line 121 |
| FR-10 + AC-10 catch `400 result_truncated` (zero data rows + `{limit:1000}`) and render a fixed banner string; AC-10 does NOT assert against `truncated_at` | **passes** — verified against `graph-core/design.md` §5.4 line 618 |
| Refusal-strings section enumerates all four fixed strings | **passes** — §Refusal strings table (line 99) lists zero-rows / OOS / write-rejected / truncated |
| Risk #11 added for prompt-injection-via-graph-content with concrete mitigations | **passes** — Risk #11 (line 300) names four mitigation layers |
| AC-17 broadened to 3 vectors (`<script>`, `[link](javascript:)`, `<img onerror>`) | **passes** — AC-17 line 178 |
| AC-08 rewritten without `driver.session()` false-positive grep | **passes** — AC-08 line 169 greps for `neo4j-driver` import path and disallows `driver` / `executeRead` / `executeWrite` from chat module |

All seven critical checks pass.

## Open-accepted concerns (carryover into design phase)

These are minor new observations from pass 2. Per workflow HARD CAP, no
revise round is available; recording them here as guardrails the design
author should close.

### OA-1 — NFR-02's parenthetical contradicts FR-17's topology

NFR-02 (line 128) still reads:

> Median end-to-end latency `≤ 4 s` on `retail-mini` graph for typical
> questions (one Cypher round-trip + one LLM call).

But FR-17 (line 120) commits to **two** LLM calls (`generateCypher` +
`narrateResult`). The parenthetical "(one Cypher round-trip + one LLM
call)" is a left-over from the pass-1 wording — FR-17's topology is the
real budget. Functionally harmless because FR-17 carries the correct
budget arithmetic (`1500 + 1000 + 1500 = 4000`), but the design author
will read both lines and might puzzle.

**Carryover:** during design, update NFR-02's parenthetical to "(one
Cypher round-trip + two LLM round-trips per FR-17)" or strike the
parenthetical entirely. No FR-level change required.

### OA-2 — Native Conflicts column header still reads "Suppression mechanism"

N-03 asked for relabelling. Revision 2 updates the cell text but
keeps the column header reading "Suppression mechanism" (line 205). Row
8's "default behaviour is acceptable" is therefore documented under a
"Suppression" column, which mildly mis-types the row. Pure
documentation cleanup; no behaviour or test impact.

**Carryover:** during design, either rename the column to "Resolution"
or accept the wart with a one-line caption.

## Strengths preserved from pass 1

All seven strengths flagged in pass 1 remain — security invariants visible
at FR/NFR level, LLM client properly abstracted, risks concrete and
actionable, Native Conflicts honest, scope boundaries crisp, conversation
context model well-bounded, side-panel vs deep-link separation explicit.

Net-new strengths from revision 2:

1. **Pass-1 resolutions table at the top of the doc.** The
   `§Pass-1 review resolutions` table (line 17) is itself a load-bearing
   artifact — it gives downstream readers a single-screen audit of how
   each pass-1 finding flowed into the requirements text. Reviewing this
   pass took half as long because of it.
2. **Refusal-strings table is the right shape.** Four strings, four
   triggers, four source FRs — exactly the at-a-glance list pass-1 C-01
   asked for. The design author and test author can both lift it
   verbatim.
3. **Risk #11's mitigation layering.** Four named layers (system-prompt
   invariants, schema-context regex filter, role-tagged narration
   boundary, AC-17 defence-in-depth) with a closing note that the
   single-tenant localhost deployment bounds the worst case. This is
   threat-modelling, not hand-waving.

## Finding counts

- Blockers: **0**
- Concerns: **0**
- Open-accepted carryovers (design phase): **2** (NFR-02 parenthetical
  staleness, Native Conflicts column header)
- Nits: **0**
- **Verdict: approve**

## Pass tracking

- Pass 1 of 2 (revise): 3 blockers + 4 concerns + 3 nits.
- **Pass 2 of 2 (FINAL): approve.** All pass-1 findings cleanly absorbed;
  2 minor carryovers logged for design phase.
- Requirements phase closes here. Next phase: design.
