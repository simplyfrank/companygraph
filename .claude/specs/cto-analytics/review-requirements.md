---
feature: cto-analytics
reviewing: requirements
reviewer: spec-review-agent
verdict: revise
reviewed_at: 2026-05-22
pass: 1
---

# Review: cto-analytics requirements (Pass 1 of 2)

## Summary

`cto-analytics/requirements.md` revision 1 is well-organised, has good
story-to-FR traceability, and correctly identifies the load-bearing
reproducibility risk in its Risks section. The 8 user stories map cleanly
to the 11 FRs, the 16 ACs all carry verification recipes, and the spec
correctly enforces the "all Cypher through `/api/v1/query/cypher` + no
write paths" architectural posture inherited from `graph-core`.

However, the load-bearing claims about reproducibility (NFR-04 + NFR-05
+ AC-08 + AC-09) have **two concrete gaps that will silently produce
non-reproducible PDFs**: (a) the hash input does not include the score
weights even though FR-08's PDF body depends on them — the Risks section
*identifies* this in Risk #2 but the FR/NFR/AC text does not actually
*commit* the fix; (b) `graph-core`'s edge export shape does not include
`updatedAt`, so FR-08's "a reader can compute the same hash from
`graph-core/GET /api/v1/export`" claim is not actually achievable as
written. There are also two more compact blockers — a stale-data MUST/CAN
contradiction between AC-08 and FR-10, and a settings-pane platform/AC
gap that would let a non-admin clobber the cached PDF hash by editing
weights between PDF renders.

Per the verdict rules (blockers OR > 3 concerns → revise), this is
**revise**. The fixes are all surgical at the requirements layer — no
re-architecture needed.

## Verdict

**revise** — 4 blockers, 4 concerns, 5 nits. Fix the four blockers and
re-submit for pass 2.

## Traceability — 8 user stories ↔ FR/AC coverage

| Story | FR(s) | AC(s) | Notes |
|-------|-------|-------|-------|
| AN-1.1 (system map) | FR-01 | AC-01 | Covered. AC's "verify no rainbow palette (visual inspection)" is weak; see N-01. |
| AN-1.2 (domain↔system matrix) | FR-02 | AC-02 | Covered. Cell deep-link target uses `process-explorer-ui` route; soft dep flagged correctly. |
| AN-1.3 (consolidation panel) | FR-03 | AC-03 | Covered. |
| AN-2.1 (complexity score) | FR-04 + FR-11 | AC-04 | Covered. Settings round-trip is asserted. |
| AN-2.2 (single-system journeys) | FR-05 | AC-05 | Covered. |
| AN-2.3 (critical path) | FR-06 | AC-06 | Covered. Cyclic case explicitly tested. |
| AN-3.1 (AI-candidate filter) | FR-07 | AC-07 + AC-15 | Covered. Empty-state copy is literal-asserted. |
| AN-3.2 (exec-summary PDF) | FR-08 | AC-08 + AC-09 | Covered structurally — but see B-01 + B-02 for hash-determinism gaps. |

All 8 stories have ≥ 1 FR and ≥ 1 AC. The story persona-card success
criterion ("Top 3 AI candidates surfaced with quantified evidence each
quarter") is met by FR-07 + FR-08 together.

## Blockers

### B-01 — NFR-05 / AC-09 / FR-08: graph-state hash protocol is under-specified for `attributes_json`

`requirements.md` lines 81, 98–99, 139–140, 224–229 jointly claim that
two runs against the same graph produce byte-identical PDF output, and
that the hash is "canonical JSON ordering (keys sorted alphabetically,
arrays ordered by `id`)". The Risks section (line 224, Risk #6)
acknowledges that `attributes_json` is stored as a JSON-string and would
hash differently for `{a:1,b:2}` vs `{b:2,a:1}` unless re-parsed and
canonicalised. **But the FR/NFR/AC text does not actually require the
hash protocol to do that re-parsing — Risk #6 only says "design phase
commits this in `hash-protocol.md`".**

This is a requirements-layer blocker because:

1. The acceptance test (AC-09, line 140) only permutes "the input
   nodes/edges array order" — it does NOT exercise attribute-key-order
   permutation. A naive implementation that JSON-serialises
   `attributes_json` as-stored would pass AC-09 and fail in production
   the first time a node's `attributes` is re-serialised by Neo4j after
   an unrelated PATCH (whose JSON.stringify key order is not guaranteed
   to be stable across runtime/library versions).
2. `graph-core/design.md` §3.1 explicitly says "the storage layer keeps
   an `attributes_json` STRING property on each node" and "the JSON ↔
   string conversion happens exclusively inside `storage/nodes.ts`". The
   string is the storage shape; the parsed object is the wire shape. The
   hash protocol must pin down which one it canonicalises over, and the
   answer must be "parsed-then-re-stringified with sorted keys".

**Required fix:** Promote Risk #6's "design phase commits" promise into
a binding requirement at the FR or NFR level. Concretely:

- Rewrite NFR-05 (line 99) to read something like: *"The graph-state
  hash is deterministic — input is the canonical JSON serialisation of
  `{nodes:[…], edges:[…]}` where (a) the outer object's keys are
  alphabetically sorted; (b) `nodes` and `edges` arrays are sorted by
  `id` ASC; (c) each node/edge object's keys are alphabetically sorted;
  (d) each node/edge's `attributes` field is the **parsed object**
  (NOT the storage `attributes_json` string), and its keys are
  recursively alphabetically sorted before serialisation; (e) numeric
  values use no locale-dependent formatting; (f) UTF-8 NFC normalisation
  on string values; (g) `\n` (LF only, no CRLF) for any embedded
  newlines; (h) hash algorithm SHA-256."*
- Add to AC-09 an explicit "permute attribute-map key order on one
  fixture node → assert hash unchanged" case alongside the existing
  array-order permutation case.

Without this, NFR-04 + AC-08 (PDF byte-equality) is a dice roll
against `JSON.stringify` key-iteration order — which in V8 happens to be
insertion-order today but is not a spec guarantee, and Bun's JSC
backend may behave differently.

### B-02 — FR-08 vs graph-core `/api/v1/export`: edge export shape does not include `updatedAt`

`requirements.md` line 81 (FR-08) says the hash is computed over "the
underlying nodes + edges + their `updatedAt` values" and adds *"a reader
can compute the same hash from `graph-core/GET /api/v1/export` to
confirm the snapshot."* This is the verifiability claim that makes the
exec-summary PDF defensible.

But `graph-core/design.md` §3.2 defines `edgeReadSchema` as
`edgeCreateSchema.extend({id, createdAt})` — **no `updatedAt`**. Only
nodes (`nodeReadSchema` at design line 203–211) carry `updatedAt`. So
the edge contribution to the hash either (a) uses `createdAt` instead,
(b) uses something that isn't in `/api/v1/export`, or (c) the claim
"reader can compute the same hash from `/api/v1/export`" is false for
the edge portion.

Risk #8 (line 235) discusses `updatedAt` granularity but only for
nodes — it does not catch the edge schema gap.

**Required fix:** Either (a) tighten FR-08 to say the edge contribution
to the hash uses `createdAt` (since edges are immutable post-creation
in `graph-core` — there's no PATCH-edge endpoint, only DELETE + CREATE),
documenting this explicitly so a reader knows what to feed into the
hash; or (b) ask `graph-core` for an `updatedAt` field on edges (which
is a graph-core requirements-level change). Recommend (a) — edge
immutability is a real `graph-core` property; lean on it. Also add a
sentence to FR-08 enumerating the exact field list used to derive the
hash (it currently says "nodes + edges + their `updatedAt` values"
ambiguously).

### B-03 — Risk #2 (weight tunability) is not folded into FR-08 / NFR-05 / AC-08 / AC-09

Risk #2 (line 202) says: *"Tunable weights mean two operators with
different settings produce different PDFs from the same graph. The
graph-state hash captures the graph but not the weights. Design phase:
include the weights JSON in the hash input — so the PDF's hash represents
`(graph_state, weights)`."*

This is exactly right. But the **FR/NFR/AC text does not commit to it**.
FR-08 (line 81) describes the hash as "SHA-256 of a canonical JSON
serialisation of the underlying nodes + edges + their `updatedAt` values"
— no weights. NFR-05 (line 99) makes no mention of weights. AC-09 (line
140) only permutes the input nodes/edges arrays, not the weights.

The consequence: two operators with different weights produce different
PDFs containing the same hash header. The hash header lies. The
"reproducibility" claim is broken at the user-visible layer, exactly
the failure mode the hash was introduced to prevent.

**Required fix:** Promote Risk #2 into NFR-05 + AC-09. NFR-05 should
read e.g. *"hash input is the tuple `{graph_state, weights}`, where
`weights` is the `analytics_settings` weight row at the time of PDF
generation, JSON-serialised with the same canonical rules as
`graph_state`."* AC-09 should add: *"mutate weights via `PATCH
/analytics/settings`, re-render the PDF on the same graph, assert the
hash header changes; revert weights, assert the hash header reverts."*

Without this, the hash header is decoration, not proof.

### B-04 — FR-10 ("nightly precompute serves stale") and AC-08 ("byte-identical PDF") are not jointly testable

FR-10 (line 88) says endpoints serve from cached `analytics_*` SQLite
tables, with a `degraded: true, last_run_at` flag when stale. FR-08
(PDF generation) reads from the same caches (this is implicit but
required — otherwise the exec-summary would do a real-time recompute
which contradicts NFR-07's 30-minute budget premise).

AC-08 (line 139) requires "two runs against the same graph produce
byte-identical PDF (modulo embedded date)". But "the same graph" is
ambiguous between (a) the same underlying Neo4j state and (b) the same
underlying *cache table contents*. If the cache was last rebuilt at T0
and the underlying graph mutates at T1 > T0, then the PDF rendered at T2
> T1 has the cached top-5 (from T0) but the hash *is computed over the
current graph state* (T1) — which means **AC-08 byte-equality can hold
only between two PDFs rendered against the same cache snapshot, not the
same graph snapshot**. Two operators rendering minutes apart across the
nightly run boundary will see different PDFs and the hash will not
explain why.

**Required fix:** Add a clarifying sentence to FR-08 specifying that the
hash is computed over the **cache snapshot** used to render the PDF,
not the live graph — AND that the PDF body includes the
`analytics_journey_scores.last_run_at` timestamp so the verifier can
distinguish "same graph, different cache" from "different graph".
Alternative: lock FR-08 to live recompute (and accept the budget
implication). Pick one; the current text is ambiguous.

This also affects the FR-08 wording *"a reader can compute the same
hash from `graph-core/GET /api/v1/export`"* — the reader would need to
compute it from the **cache state at PDF generation time**, which is
NOT obtainable from `/api/v1/export` (which always returns live state).
Either (a) add an analytics-side export endpoint that returns the
cached snapshot, or (b) acknowledge that the verifiability claim only
holds when the cache is fresh (last_run_at within last 60 s or so).
Currently FR-08 promises something it cannot deliver.

## Concerns

### C-01 — FR-04 and FR-11 expose weight-mutating settings with NO admin gate

FR-04 (line 72) says weights are tunable via `#/analytics/settings`,
stored in `analytics_settings`. FR-11 (line 89) defines `GET` + `PATCH
/api/v1/analytics/settings`. The spec is single-tenant (NFR-06, "no
auth code paths") — fine — but the *consequence* is that any visitor to
the PWA can PATCH the weights and silently re-render the next exec-summary
PDF with different scores.

Combined with B-03 (weights not in the hash), this means: an attacker
or accidental misclick rewrites the weights between two PDF generations,
and **the hash header LOOKS unchanged because it doesn't cover weights**.

If B-03 is fixed (weights in hash), this concern degrades: at least the
hash will visibly change, surfacing the mutation. But B-03 needs to land
to make this safe.

Suggested addition: a sentence in FR-11 like *"settings mutations write
a row to a `analytics_settings_audit` table with `{ts, before, after}`
so PDF readers comparing two hash headers can trace which weight change
caused the drift."* This is cheap and matches the spirit of `graph-core/FR-13`'s
structured logging.

### C-02 — FR-07's CSV export charset story is in Risks #7 but not in the FR or AC

Risk #7 (line 231) commits to a UTF-8 BOM on CSV. FR-07 (line 80) says
"CSV export button" with no charset spec. AC-07 (line 138) tests the
endpoint shape but not the BOM or the charset.

This is the same pattern as B-01 (risk identifies the fix, FR/AC don't
commit). Smaller stakes — Excel rendering of "Café" — but the same
"design phase will commit" handwave that bit B-01.

**Suggested fix:** Add to FR-07 one sentence: *"CSV is UTF-8 with BOM
(`\xEF\xBB\xBF`), CRLF line endings, RFC 4180 quoting."* Add to AC-07 a
byte-level assertion that the first three bytes of the CSV are
`EF BB BF`. Tests are cheap; the failure mode is a real Maya-class user
complaint.

### C-03 — FR-06 critical-path algorithm: NP-hard claim conflicts with O(V+E) shortest-path posture in graph-core

Risk #1 (line 195) acknowledges the longest-acyclic-path problem is
NP-hard worst-case. FR-06 (line 74) says "longest acyclic `PRECEDES`
chain". `graph-core/design.md` §5.4 explicitly chose
`shortestPath((a)-[*..maxDepth]-(b))` for `findPath` — *shortest*, not
longest — because the longest-simple-path problem is NP-hard and
graph-core punted on it ("All shortest paths / all paths semantics are
out of scope for this spec — callers needing those use
`/api/v1/query/cypher` and accept the row cap + timeout").

Two problems flow from this:

1. cto-analytics's FR-09 says all Cypher routes through
   `/api/v1/query/cypher`. But that route enforces a 5 s per-tx
   timeout (`graph-core/design.md` §5.4) and a 1000-row cap (NFR-09).
   The longest-acyclic-path algorithm on a 50-activity journey under
   DFS+memo *might* complete in < 1 s as Risk #1 claims, but the row
   cap is a problem: a journey with 50 activities and average degree 2
   has DFS path-count bounded by 2^50 in pathological cases. The depth
   cap of 20 (Risk #1) is the actual safety net, but the **requirements
   don't surface that cap to the caller or the AC**.
2. AC-06 (line 137) tests a fixture with one cyclic journey. It does
   NOT test a journey near the depth cap or one where the DFS exceeds
   the Cypher passthrough's 5 s timeout. The graceful-degradation path
   (returning `{has_cycle: true, longest_partial: …}` when the
   algorithm times out or hits the row cap) is not specified.

**Suggested fix:** Add to FR-06 a sentence like *"if the depth-bounded
DFS exceeds 1000 candidate paths or 4 s wall-clock, the response carries
`{has_cycle?: true, truncated: true, longest_partial: <chain so far>}`
and the PDF flags the truncation."* Add an AC for the truncation path.

### C-04 — FR-10 nightly precompute does not specify what happens to scores when ontology-manager mutates `Activity.repetitive` / `Activity.data_richness` schema between runs

Dependencies (line 187) marks `ontology-manager` as "mandatory soft" —
the AI-candidate filter (FR-07) hinges on those two attributes being
registered. Risk #9 (line 242) acknowledges schema coupling and proposes
storing attribute names in `analytics_settings`.

But FR-07's filter (line 80) hard-codes the values
`repetitive = true AND data_richness = "high"`. If `ontology-manager`
allows the operator to change the legal values of `data_richness` (e.g.
from `"low"|"medium"|"high"` to `"low"|"high"`), or rename it, the
nightly precompute (FR-10) silently produces empty `analytics_ai_candidates`
and the PWA shows the empty-state copy AS IF no activities were tagged
— exactly the failure mode FR-07's empty-state copy is supposed to
disambiguate.

**Suggested fix:** Fold Risk #9 into FR-07 and FR-10. FR-07 should read
the attribute key + match value from `analytics_settings` (an
`ai_candidate_definition` row), defaulting to the FR-07 literals. FR-10
should re-validate the definition against `ontology-manager/schema`
before each run and surface a banner if the attributes have been
renamed/removed.

## Nits

### N-01 — AC-01's "verify no rainbow palette (visual inspection)" is not a real verification recipe

AC-01 (line 132) ends with "visual inspection". Per the spec-review
SKILL.md ("AC-* are testable, not subjective"), this is a soft spot.

**Suggested fix:** Replace with a programmatic assertion such as
*"snapshot test asserts every cluster's fill colour is in the 5-stop
ramp `[--accent-100, --accent-300, --accent-500, --accent-700, --accent-900]`
defined in `pwa/src/theme.ts`"*. The 5-stop ramp is already promised in
FR-01 (line 64) — make AC-01 enforce it.

### N-02 — FR-09 lists 8 endpoints but section says 8 in scope-boundaries (line 117) — count math

Scope Boundaries (line 117) says "Eight new `/api/v1/analytics/*` REST
endpoints". FR-09 (line 87) enumerates 8 endpoints (`systems`,
`domain-system-matrix`, `consolidation`, `complexity`,
`single-system-journeys`, `critical-paths`, `ai-candidates`,
`exec-summary.pdf`). FR-11 (line 89) adds **two more**: `GET
/api/v1/analytics/settings` + `PATCH /api/v1/analytics/settings`.

So the real total is 10. Either update the Scope Boundaries line, or
extract settings into FR-09 so the count is honest. Trivial.

### N-03 — Native Conflicts table only has 7 rows (matches the "≥ 7 rows" floor but is at the floor)

The brief specifies "at least 7 rows" — the table has exactly 7. Fine
as a floor, but you've missed a real one: **iOS Safari's tap-to-zoom on
double-tap of the system map** would fight the canvas pan/zoom on the
matrix and map. FR-01's monochromatic system map needs the same
`touch-action: none` treatment that's applied to "Pan/zoom on system
map" — but double-tap is separate from pinch-zoom on iOS.

**Suggested addition:** add a row *"Double-tap-to-zoom on iOS Safari
fires on the system map — Affected: System map (FR-01) — Suppression:
`touch-action: manipulation` removed via `touch-action: none` on the map
container; custom double-tap handler treats double-tap as 'fit to view'."*
Same pattern as `process-explorer-ui` Native Conflicts row for canvas.

### N-04 — FR-02 deep-link target URL has unmatched `{system}` / `{domain}` placeholders

FR-02 line 65: *"Cells link to the underlying activity list
(`process-explorer-ui /#/explorer/activities?system=:id&domain=:id`)"*.
Both query params use `:id` — but they refer to different ids (the
system and the domain). The convention in `process-explorer-ui/FR-09`
uses `?system=:id&role=:id&location=:id` — same gotcha. This isn't a
bug in this spec, but it's an inherited oddity worth flagging now so
both specs adopt `:system_id` / `:domain_id` (or `:sid`/`:did`) to
avoid confusion.

### N-05 — Risks section #10 ("Refresh now" button) is a UX decision masquerading as a risk

Risk #10 (line 251) proposes a "Refresh now" button on the dashboard.
This is a real product decision, not a risk to be deferred — the
nightly-staleness window is the operating model, and a refresh button
costs ~one CPU minute per click. Either commit to it as an FR or
explicitly defer it to a follow-on spec. Leaving it in Risks is a
classic spec-rot accelerator (six months later someone reads "design
phase decides" and quietly decides "we're not building it").

**Suggested fix:** Move Risk #10's recommendation (a) into FR-10 as a
new sentence: *"endpoints accept `?refresh=true` which triggers an
on-demand recompute (lock-protected; second concurrent call returns the
in-progress run's eventual result)."* Or move it to Scope Boundaries →
Out of scope, with a one-line rationale.

## Open nits, accepted

- **Hash header on the PDF first page vs in metadata.** FR-08 says
  "header includes a graph-state hash" — should the hash be in the PDF
  visible header (page 1 footer / header text), in the PDF metadata
  (`/Subject` or `/Custom`), or both? AC-08 only tests "hash header is
  present" via manual inspection. Suggest "visible on page 1 in
  monospace + also in PDF metadata" but accept the call going either
  way in design.
- **Risk #4 PDF page count.** "Top-5 / top-3 / top-3 is a fixed budget
  — PDF stays ~5 pages regardless of graph size." Fine until the AI
  candidate or consolidation list grows long enough that a single
  candidate's detail spans multiple pages. Design-phase concern.
- **`#/analytics/exec-summary/export` vs `GET /api/v1/analytics/exec-summary.pdf`.**
  FR-08 (line 81) uses both — the PWA route and the API endpoint. The
  PWA route is presumably a tiny launcher that hits the API and renders
  the file. Worth saying that explicitly so a future PR doesn't try to
  render PDFs client-side.

## Strengths

Worth carrying forward:

1. **Story-to-FR-to-AC traceability is complete and table-driven.** Each
   of the 8 stories has at least one FR and at least one AC; the
   tables make it cheap to audit.
2. **Architectural guardrails (NFR-02, NFR-03, NFR-06) are inherited
   from `graph-core` and re-asserted with coverage tests (AC-11, AC-12,
   AC-14).** This is the right pattern for a downstream spec.
3. **Risks section is substantive** — 10 numbered risks, each with a
   concrete recommended mitigation. The problem (B-01 / B-03 / C-02)
   is that the mitigations don't make it back into FR/NFR/AC. Fix is
   surgical: promote the "design phase commits" lines into binding
   requirements.
4. **Empty-state UX names ontology-manager (FR-07 + AC-15) explicitly.**
   Most specs treat empty-state as a stylesheet problem; flagging the
   schema-registration step inside the copy is correct and matches the
   `ontology-manager` empty-state pattern.
5. **Scope-boundary out-of-scope list is honest** — real-time refresh,
   ML scoring, cross-tenant comparison, email/Slack PDF, historical
   trends — all the natural extensions are named and deferred. This
   prevents scope creep at the design phase.
6. **Native Conflicts table is populated** with real conflicts (pinch-zoom,
   horizontal scroll vs back-gesture, pull-to-refresh, Safari iOS
   download UX). Just one missing row (N-03).
7. **Dependencies table flags the right cross-spec coupling** —
   `graph-core` (hard), `ontology-manager` (mandatory soft), and
   `process-explorer-ui` (soft) — with correct precision on what each
   one provides.
8. **NFR-07 ("30-min budget on 10k-node fixture")** is a realistic
   performance target with a documented fallback (design phase confirms
   via a stress fixture). Better than "fast" or "performant".

## Pass tracking

This is **pass 1 of 2** for the requirements phase. Revise to fix the
four blockers. Pass 2 will verify the fixes and either approve or hold
for a final round.

## Finding counts

- Blockers: **4** (B-01 hash protocol attributes_json gap; B-02 edges
  `updatedAt` missing; B-03 weights not in hash; B-04 cache-snapshot vs
  graph-snapshot ambiguity)
- Concerns: **4** (C-01 settings ungated; C-02 CSV BOM in Risks not
  FR/AC; C-03 critical-path truncation; C-04 ontology-manager schema
  coupling)
- Nits: **5** (N-01 visual-inspection AC; N-02 endpoint count mismatch;
  N-03 missing double-tap Native Conflicts row; N-04 deep-link
  placeholder; N-05 Risk #10 should be FR or out-of-scope)
- Open-nit-accepted: **3**
- Verdict: **revise**
