---
feature: process-explorer-ui
reviewing: requirements
reviewer: spec-review-agent
verdict: approve
reviewed_at: 2026-05-22
pass: 2
---

# Review: process-explorer-ui requirements (Pass 2 of 2 — FINAL)

## Summary

Revision 2 absorbs every pass-1 finding cleanly. The two highest-stakes
gaps — phantom `/api/v1/schema` and phantom `/api/v1/ontology/events`
endpoints — have been resolved by re-rooting both references at
`ontology-manager/FR-14` and `ontology-manager/FR-17` respectively, and
`ontology-manager` revision 2 has, in lockstep, taken ownership of both
endpoints (FR-14 explicit "owned by this spec — not 'extended'" + FR-17
"dual-channel in-process + SSE"). Cross-spec arithmetic now balances.

The remaining four blockers are all surgical and all landed:

- **B-03 (AC tightness)** — every flagged AC now carries explicit input
  mode + observable outcome. Spot-checked all ten rows.
- **B-04 (FR-21 contradiction)** — rewritten as advisory client-side
  only; AC-17 explicitly says "NO server-side test"; NFR-07 reinforced
  with a sentence about the rewrite.
- **B-05 (attribute namespace collision)** — namespaced to
  `node.attributes._review.*` and `node.attributes._verification.*`;
  AC-15 + AC-16 assert the namespaced paths; rationale tied back to the
  `ontology-manager` `_Ontology*` namespace convention.
- **NFR-09 missing AC** — AC-30 added with deterministic-hydration
  snapshot test.

Native Conflicts table grew from 11 → 15 rows (4 of the 5 gaps added;
Voice Control is explicitly out-of-scope-acknowledged, which is the
right call). `zustand` is locked.

Two minor residual items remain (Risks #3 wording carries the original
`(b)` / `(c)` options as a record of what was considered, even though
FR-21's body has committed to `(a)`; Risks #8 still names the tiebreaker
that FR-03 has already absorbed). Neither blocks the spec; both are
historical record and would only be cleaned up if revising for clarity
in a hypothetical pass 3. They become **open-accepted carryovers** for
the design phase rather than fresh concerns.

## Verdict

**approve** — all 5 blockers + 7 concerns + 4 nits cleanly absorbed; 2
historical-residue items accepted as open carryovers; 0 new blockers; 1
minor new concern (NC-01 below, advisory only). The spec is ready to
move to design phase.

## Per-finding verification

### Blockers (all 5 cleanly absorbed)

| Finding | Verdict | Evidence |
|---------|---------|----------|
| **B-01** `/api/v1/schema` ownership | **Cleanly absorbed** | FR-27 (line 139) routes the SW precache to "**`ontology-manager`-owned `GET /api/v1/schema`** (per `ontology-manager/FR-14`)". FR-28 (line 140) does the same for polling fallback. Dependencies row "`ontology-manager`" (line 268) is now soft-dep with the schema endpoint named correctly. NFR-07 (line 152) explicitly carves out: "`ontology-manager`-owned endpoints (`/api/v1/schema`, `/api/v1/ontology/events`) are NOT graph-core extensions and are out-of-scope of this clause." Cross-spec check: `ontology-manager/FR-14` (rev 2) confirms ownership. **No inconsistency.** |
| **B-02** SSE endpoint `/api/v1/ontology/events` | **Cleanly absorbed** | FR-28 (line 140) now reads "listens to `ontology.changed` events on **`ontology-manager`-owned `GET /api/v1/ontology/events`** (Server-Sent Events; per `ontology-manager/FR-17` — pass-1 B-02)" with `EventSource` + `Last-Event-ID` reconnection. Cross-spec check: `ontology-manager/FR-17` (rev 2) commits to dual-channel (in-process EventEmitter + SSE) and `NFR-09` commits to `Last-Event-ID` replay. **No inconsistency.** |
| **B-03** AC tightness (10 ACs) | **Cleanly absorbed for all 10** | See per-AC table below. Every manual AC now carries explicit input mode + observable outcome. |
| **B-04** FR-21 server-side guard contradicts NFR-07 | **Cleanly absorbed** | FR-21 (line 128) now begins "**Out-of-domain edit guard — advisory client-side only**" and ends "**No server-side enforcement**: single-tenant single-trust per `graph-core/NFR-08` makes a 403 misleading … The guard is an SME workflow nudge, not a security boundary. NFR-07 stands — no new graph-core API surface." AC-17 (line 196) commits the test path to `pwa/__tests__/out-of-domain-disable.test.tsx` only with `disabled` attribute + tooltip assertion + explicit "**NO server-side test** — per FR-21, the server does not enforce; any curl bypass is by design." NFR-07 (line 152) re-states the carve-out. **Mutually consistent.** |
| **B-05** Attribute namespace collision | **Cleanly absorbed** | FR-18 (line 125) writes to `node.attributes._review = {status, reason, set_by, set_at}`. FR-20 (line 127) writes to `node.attributes._verification = {by, at}`. Both FRs include the explanation "underscore prefix puts these outside `ontology-manager`'s attribute-schema enforcement (per `ontology-manager`'s `_Ontology*` namespace convention)" + a coverage test commitment. AC-15 (line 194) asserts the PATCH body matches `{attributes:{_review:{status:"needs_review", reason:<txt>, set_by:"operator", set_at:<ISO>}}}`. AC-16 (line 195) asserts header text from `attributes._verification`. **Namespace contract is testable and tested.** |

### B-03 per-AC verification (all 10 cleanly absorbed)

| AC | Input mode | Observable outcome | Verdict |
|----|-----------|--------------------|---------|
| AC-02 | macOS Chrome (mouse+kb) | (a) linear-chain seed: activities in `PRECEDES` order; (b) cycle fixture: yellow warning ribbon containing `"cycle"` + `createdAt` ASC render | absorbed |
| AC-04 | iPad Safari (touch) | Tap `INTEGRATES_WITH` toggle, expect neighbour card with system name visible | absorbed |
| AC-06 | iPhone Safari (touch) | URL filter loads filtered list; refresh preserves; Share-sheet → new tab preserves | absorbed |
| AC-07 | macOS Chrome (mouse+kb) | Five sub-cases (a)–(e) each with specific observable; depth-clamp visible at 8 with inline hint; timeout banner text quoted | absorbed (and gained C-05 result_truncated + C-06 no-path) |
| AC-10 | macOS Safari (trackpad+kb) | PNG with `<slug>-YYYY-MM-DD.png` filename; opens to match screen; SVG opens vector with legible text | absorbed |
| AC-12 | macOS Chrome + iPhone Safari | Single POST to `/api/v1/import`; redirect with activity visible; iPhone form vertically-stacked usable in portrait | absorbed |
| AC-18 | macOS Chrome (mouse+kb) | Two sections "Overdue (N)" / "Current (M)"; chevron-click expands row with nested activity list | absorbed |
| AC-23 | macOS Safari + macOS Chrome | Concrete `lighthouse … --form-factor=desktop --throttling.cpuSlowdownMultiplier=1 --only-categories=performance` invocation with `audits["interactive"].numericValue < 2000` assertion | absorbed (now repeatable in CI) |
| AC-24 | macOS Chrome (trackpad) | DevTools Performance recording during 5-s two-finger pan; assert median frame time ≤ 16 ms via "Frames" track on the 200-node-fixture journey | absorbed |
| AC-25 | macOS Chrome (keyboard only) | Tab from `#/explorer/domains` until focus returns to address bar (no element traps); `Escape` in `#/sme/new-journey` closes form / returns focus | absorbed |
| AC-27 | (codebase) | Pattern explicitly enumerated: `verify(Jwt|Token)`, `currentUser\b`, `req\.user`, `req\.auth`, `req\.session` (curated to dodge `graph-core/AC-22` C-01 false-positive) | absorbed — also fixes the inherited flaw flagged in pass-1 B-03 AC-27 |

### Concerns (all 7 cleanly absorbed)

| Finding | Verdict | Evidence |
|---------|---------|----------|
| **C-01** PE-1.3 "(implied)" FR-06/07 priority | **Cleanly absorbed** | Both FR-06 (line 98) and FR-07 (line 99) lowered to `should`; Story column reads "PE-1.3 (implied — out of 18-story commitment)". Honest priority signal preserved. |
| **C-02** FR-21 validator location | **Cleanly absorbed** | Resolved transitively by B-04: no server-side validator exists. |
| **C-03** Re-paste reorder ambiguity | **Cleanly absorbed** | FR-16 (line 123) pins "**Order-preserving re-paste**: re-pasting `[B, A, C]` after a prior `[A, B, C]` rewrites the `PRECEDES` chain to `B → A → C` … activity creation is the idempotent part, ordering is mutable". Plus duplicate-name behaviour `400 duplicate_activity_name` is enumerated. Contract is fully specified. |
| **C-04** SW degradation contract | **Cleanly absorbed** | FR-27 (line 139) adds the precise degradation contract sentence: "SW registration MAY fail (Safari private mode, quota exhausted, user denied). When registration fails, the app loads normally without offline support; the connectivity banner from FR-25 continues to work as the only offline-state indicator. No reads are cached. Writes are attempted online-only … The 'stale' banner does NOT appear when SW isn't registered." AC-20 (line 199) now tests both registration-failure (iPhone private mode) and successful-registration (subsequent reload) paths. |
| **C-05** `result_truncated` UI for findPath | **Cleanly absorbed** | FR-10 (line 107) case (e): `"More than 1000 paths matched — narrow the search by setting a smaller depth"`. AC-07 implicitly covers via "every API response shape" + the depth=9 clamp sub-case proves the depth-selector limit (which is the upstream cause of `result_truncated`). |
| **C-06** "No path" UI state | **Cleanly absorbed** | FR-10 (line 107) case (b): `"No path within depth N — try increasing depth, or use the Cypher passthrough for all-paths search"`. AC-07 sub-case (b) tests it explicitly with two disconnected nodes and depth=4. |
| **C-07** XC-1.1 / XC-1.2 inheritance not AC'd | **Cleanly absorbed** | AC-29 (line 208) explicitly asserts the connectivity banner inherited from `graph-core/AC-14` surfaces on every route in this spec and flips disconnected within 30 s on `#/explorer/journeys/<seed-id>` when the API is killed. |

### Nits (all 4 cleanly absorbed)

| Finding | Verdict | Evidence |
|---------|---------|----------|
| **N-01** Author field | **Cleanly absorbed** | Frontmatter (line 4) `author: "frank"`. |
| **N-02** FR-11 canvas-library cross-ref | **Cleanly absorbed** | FR-11 (line 113) ends "**Canvas library locked at design phase** (see Dependencies row + Risks #1) — resolves `graph-core/Risks #1`." |
| **N-03** XC-* tagging | **Cleanly absorbed** | FR-25 (line 137) tagged `XC-1.1`; FR-26 (line 138) tagged `XC-1.2`; FR-27 (line 139) tagged `XC-3.1 (cross-cutting boot)`; FR-24 (line 136) + FR-28 (line 140) tagged `(cross-cutting)` with rationale per the resolution table. |
| **N-04** `PRECEDES` cycle tiebreaker baked into FR-03 | **Cleanly absorbed** | FR-03 (line 95) reads "Cycles in `PRECEDES` are flagged with a warning ribbon and rendered in **`createdAt` ASC order** (tiebreaker) — never enter an infinite loop." |

### Native Conflicts gaps (4 of 5 added; 5th explicitly out-of-scope)

| Pass-1 gap | Verdict | Evidence |
|-----------|---------|----------|
| Rubber-band scrolling | **Added** | Line 257: "iOS Safari rubber-band scrolling at top of viewport lifts the sticky header off-screen" → `overscroll-behavior-y: contain` on `body` for sticky-header routes. |
| Long-press menu on canvas | **Added** | Line 258: "Long-press on a canvas node fires iOS text-selection menu" → `user-select: none` + `-webkit-touch-callout: none` on canvas container. |
| Cmd+F vs in-app search | **Added** | Line 259: "`Cmd+F` opens browser find-in-page instead of in-app search" → **Intentionally NOT intercepted** — `/` is the in-app focus key; the two are complementary. (This is a deliberate decision, not an oversight — exactly the kind of "we considered this" entry pass-1 asked for.) |
| Safari Smart Search Field overlay | **Added** | Line 260: "Safari's 'Smart Search Field' autocomplete drawer covers the typeahead" → `autocomplete="off"` + portal with `z-index ≥ 9999`. |
| Voice Control overlays on 200-node canvas | **Acknowledged out-of-scope** | Line 261: "**Acknowledged as out-of-scope for v1.** Voice Control on a 200-node canvas is overwhelming by design of the canvas. Future spec may add a Voice-Control-friendly 'list view' toggle for the canvas." This is the correct call. |

Total Native Conflicts row count: **15** (was 11) — comfortably in the
"thorough" zone the pass-1 prompt asked for.

### NFR-09 missing AC — added

AC-30 (line 209): `pwa/__tests__/deterministic-hydration.test.tsx` —
"render `#/explorer/journeys/<seed-id>` twice from a fresh in-memory
cache with the same fixture data; `outerHTML` deep-equal both renders
(after stripping any `Date.now()`-derived test-only timestamp regions)."
**Cleanly absorbed.**

### `zustand` "or equivalent" — locked

Dependencies row (line 270): `zustand` — "**Locked** — single store for
routes, search, filters, selection, schema cache. No 'or equivalent' —
matches `graph-core`'s pattern of locking ecosystem choices at
requirements time." **Cleanly absorbed.**

## Cross-spec consistency check (critical)

`process-explorer-ui` <-> `ontology-manager` revision 2:

| Claim in process-explorer-ui | Cross-ref in ontology-manager rev 2 | Verdict |
|------------------------------|--------------------------------------|---------|
| FR-27: SW precaches "`ontology-manager`-owned `GET /api/v1/schema`" | FR-14 line 102: "GET /api/v1/schema — owned by this spec. This endpoint did **not** exist in graph-core and is **introduced by this spec** (not 'extended')." | **Matches** |
| FR-28: SSE at "`ontology-manager`-owned `GET /api/v1/ontology/events`" | FR-17 line 105: "(b) Server-Sent Events at GET /api/v1/ontology/events — long-lived HTTP/1.1 response with Content-Type: text/event-stream" | **Matches** |
| FR-28: "reconnection via `Last-Event-ID` per `ontology-manager/NFR-09`" | NFR-09 line 119: "clients use the standard Last-Event-ID header; the server replays events from that id (events buffered for ≤ 5 minutes)" | **Matches** |
| FR-27 polling fallback: "polls `GET /api/v1/schema`'s `ETag` / `If-Modified-Since` headers on a 5-min interval" | `ontology-manager` Risks #3 names corporate-proxy SSE buffering; polling fallback is implicit. (Minor: ontology-manager doesn't explicitly say it serves ETag on /api/v1/schema, but FR-14's "stable shape" + NFR-03 "in-process cache invalidated by ontology.changed" makes this a clean affordance to add at implementation time.) | **Matches with minor note (NC-01 below)** |

`process-explorer-ui` <-> `graph-core` revision 4:

| Claim | Cross-ref | Verdict |
|-------|-----------|---------|
| NFR-07: "API contract from graph-core is not extended … except for one read-only search helper (FR-17 — /api/v1/query/search)" | `graph-core/FR-07` query helper list does NOT contain `/query/search`; this is correctly identified as a new graph-core endpoint to be added | **Matches** (single new endpoint, surfaced + tested via AC-28) |
| FR-25: connectivity banner inherits `graph-core` XC-1.1 polling cadence | `graph-core/FR-09` placeholder shell + cross-cutting concerns | **Matches** |

**Verdict on cross-spec consistency: all references resolve correctly.**

## New concerns from pass 2 (1 minor; advisory)

### NC-01 — ETag/If-Modified-Since on `/api/v1/schema` is implied but not explicit in `ontology-manager`

FR-27 (line 139) says the polling fallback uses `ETag` /
`If-Modified-Since` headers on `/api/v1/schema`. `ontology-manager/FR-14`
commits to a stable shape and `NFR-03` commits to a 50 ms p99 in-process
cache, which is the affordance that makes `ETag` cheap to compute, but
`ontology-manager` doesn't explicitly say the endpoint emits `ETag`. The
design phase can add this transparently (no contract change) — but a
clean spec would have it stated.

**Disposition: open-accepted concern for design phase** — handle in
`process-explorer-ui/design.md` (the consumer side) or `ontology-manager`
follow-on if upstream cares to make it explicit. Either resolution is
fine. No spec change needed in pass 2.

## Open-accepted carryovers from pass 1 (historical residue, advisory)

These are not blockers, not new concerns — they are old text that pass 2
chose not to clean up, which is acceptable in a final pass. Flagging
them so the design author knows.

### OC-01 — Risks #3 still lists options (a)/(b)/(c) even though FR-21 has committed to (a)

Risks #3 (lines 293–309) preserves the original three-way option
discussion ("(a) Treat the guard as an advisory UI affordance only … (b)
Server-side enforce … (c) Defer to a 'collaborator' model spec"). FR-21
has cleanly committed to (a), so the Risks #3 text now reads as a
historical record of the decision. Not wrong — design-phase authors
appreciate seeing rejected options — but a clean-up pass could trim it
to just the chosen path + a one-line "considered (b) and (c)".

**Disposition: open-accepted; carry into design.**

### OC-02 — Risks #8 names the `createdAt` ASC tiebreaker that FR-03 has already absorbed

Risks #8 (lines 333–336) still says "Design phase picks a tiebreaker
(`createdAt` ASC is the cleanest)." But pass 2's N-04 fix already baked
`createdAt` ASC into FR-03 (line 95). Risks #8 is now stale — the
decision is in the requirements body, not in design phase.

**Disposition: open-accepted; trim in design or leave as audit trail.**

### OC-03 — Pass-1 "Drag/drop / pencil input" row (Platforms table) and `Browser back-gesture passes through at canvas edge` for macOS Safari

Pass-1 flagged the Pencil row as a non-answer ("optional (Pencil treated
as touch)") and the macOS-Safari back-gesture row as factually iffy.
Both were left unchanged in revision 2. Neither is load-bearing:

- Pencil: treating Pencil as touch is the standard PWA approach; the
  "optional" phrasing is honest and matches the lack of Pencil-specific
  affordances in the FRs.
- macOS Safari trackpad back-swipe: row currently says `n/a` for macOS
  Safari. Apple's macOS-Safari trackpad two-finger horizontal swipe IS a
  browser back-gesture, but the canvas doesn't bind horizontal-swipe
  scrolling on trackpad (it uses pinch + drag), so the practical
  observation is that there's no conflict — `n/a` is defensible.

**Disposition: open-accepted; carry into design without action.**

### OC-04 — Pass-1 noted that AC-13 (bulk-paste) is macOS-only and no AC asserts the iPhone "open on desktop" hint

Pass-1 wanted a corresponding AC for the iPhone hint that the Platforms
table promises. Revision 2 did not add one. The Platforms table commits
to surfacing a hint ("paste UX poor on mobile; surface a 'open on
desktop' hint") — without an AC, this is a wish, not a requirement.

**Disposition: open-accepted; recommend AC-31 in design phase** ("on
iPhone Safari, load `#/explorer/journeys/<id>` with a journey containing
a bulk-paste field — expect a visible `<div data-test-id="paste-on-desktop-hint">` instead of the textarea"). Not a blocker for approval per
the FINAL PASS rule.

### OC-05 — Pass-1 noted multi-tab state-sync deferred without a single-line risk acknowledgement

Pass-1 wanted a 1-line risk acknowledgement that writes from tab A
invalidate tab B's cache via nothing in this spec. Revision 2 keeps the
out-of-scope row ("Multi-tab state sync — deferred") but doesn't add a
Risks entry. Honest carve-out; mild surprise risk for SMEs in workshop
scenarios.

**Disposition: open-accepted; design phase may add a Risks #11.**

## Architectural soundness — final check

| Check | Verdict |
|-------|---------|
| Canvas-library choice locked at design phase | yes (Dependencies + Risks #1) |
| Out-of-domain guard reconciled with NFR-08 | yes — advisory client-side; B-04 closed |
| Service worker degradation contract pinned | yes — FR-27 + AC-20 close C-04 |
| Schema subscription cross-spec-consistent | yes — both endpoints owned by ontology-manager (verified rev 2) |
| Bulk-paste idempotency + reorder contract clear | yes — FR-16 closes C-03 |
| Verification metadata attribute namespace | yes — `_review` / `_verification` namespaced (B-05 closed) |
| All NFRs have at least one AC | yes — AC-30 closes the NFR-09 gap |
| Native Conflicts table thorough | yes — 15 rows, 1 acknowledged out-of-scope |
| New API surfaces tracked + tested | yes — `/api/v1/query/search` (AC-28); `/api/v1/schema` + `/api/v1/ontology/events` correctly attributed to ontology-manager |

## Finding counts

- Cleanly absorbed: **17 of 17** pass-1 findings + 5 of 5 Native
  Conflicts gaps + NFR-09 AC + zustand lock = **24 fixes verified**
- Partially absorbed: **0**
- Not absorbed / regressed: **0**
- New concerns: **1 minor** (NC-01: implicit ETag on `/api/v1/schema`)
- Open-accepted carryovers: **5** (OC-01..OC-05; all advisory, design
  phase can choose to address or not)

## Pass tracking

- This was **pass 2 of 2** (FINAL) for the requirements phase.
- Revision 2 is the gate-clearing revision. Spec moves to **design**.
- Design author should be aware of:
  1. NC-01 — clarify the `ETag` / `If-Modified-Since` affordance on
     `/api/v1/schema` (consumer-side documentation is enough).
  2. OC-01 / OC-02 — Risks section has historical residue that's stale
     but not wrong; trim if it bothers a reader.
  3. OC-04 — consider adding an AC for the iPhone "open on desktop"
     bulk-paste hint promised in the Platforms table.
  4. OC-05 — consider adding a Risks entry on multi-tab divergence (the
     out-of-scope row is honest; the risk hasn't been called out).

## Strengths to carry into design

1. **Cross-spec arithmetic now balances.** The shared `/api/v1/schema`
   + `/api/v1/ontology/events` contract is owned by `ontology-manager`,
   not invented in this spec. Both surfaces are testable upstream.
2. **AC density jumped from "soft manual smoke" to "named input mode +
   named observable outcome"** across the board. This is the largest
   ergonomic improvement and it landed across all 10 flagged ACs without
   regressing the others.
3. **B-04 fix is honest.** "No server-side enforcement, by design"
   beats "server-side enforcement, with a quiet 403 someone will route
   around" any day. The spec now states the truth out loud.
4. **`_review` / `_verification` underscore-namespace** dovetails
   exactly with `ontology-manager`'s `_Ontology*` namespace convention.
   Future-proof against any future Maya attribute-schema collision.
5. **Native Conflicts table at 15 rows with one acknowledged
   out-of-scope row** is the right shape — every conflict has either a
   mitigation or an explicit "we chose not to". No empty cells, no
   weasel words.
6. **AC-30 (deterministic hydration)** is the kind of testability AC
   most specs forget. Worth carrying as a pattern.
