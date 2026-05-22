---
feature: process-explorer-ui
reviewing: requirements
reviewer: spec-review-agent
verdict: revise
reviewed_at: 2026-05-22
pass: 1
---

# Review: process-explorer-ui requirements (Pass 1 of 2)

## Summary

Revision 1 of `process-explorer-ui/requirements.md` is an ambitious draft
for the largest downstream spec in the project — 18 stories spanning two
personas, full PWA gesture/keyboard/touch surface, both read and write
paths, and an interactive canvas. The author has done genuine work: the
story→FR→AC chain is intact for all 18 stories (no orphans), the
Platforms & Input Modes table is populated row-by-row with explicit
yes/no/degrade per surface, and the Native Conflicts table is the
strongest in the project so far (11 rows, every row has a real conflict
+ a real suppression).

That said, the spec leans on at least one `graph-core` API surface
(`GET /api/v1/schema`) that **does not exist** in `graph-core` revision 4
nor in `graph-core/design.md` revision 3 — only `/api/v1/openapi.json`
exists. FR-28 also subscribes to a Server-Sent-Events endpoint
(`/api/v1/ontology/events`) that `ontology-manager/FR-17` does NOT
expose — `ontology-manager` ships an **in-process** `EventEmitter` only.
Both are blockers because they silently push API-surface work onto
upstream specs that have already been approved and frozen.

Three other blockers are around AC verification precision (multiple ACs
fail the SKILL.md rule "test path OR `manual: <one-line procedure>` with
input mode + observable outcome" — `manual smoke` and Lighthouse-by-hand
do not qualify), plus the verification-metadata attribute namespace
collision risk vs. `ontology-manager`'s attribute schemas.

The remaining concerns are about whether server-side enforcement of the
out-of-domain guard makes sense at all under single-tenant NFR-08, and
about service-worker cache shape on iOS Safari.

## Verdict

**revise** — 5 blockers, 7 concerns, 4 nits. This is the largest spec
in the project and the largest set of gaps; pass 2 should be quick once
the cross-spec surface contracts (B-01, B-02) are fixed in either this
spec or the upstream specs.

## Story → FR → AC traceability matrix

All 18 stories are covered by at least one FR + one AC. No orphans.

| Story | FR(s) | AC(s) |
|-------|-------|-------|
| PE-1.1 | FR-01, FR-02 | AC-01 |
| PE-1.2 | FR-03 | AC-02 |
| PE-1.3 | FR-04, FR-06, FR-07 | AC-03 |
| PE-1.4 | FR-05 | AC-04 |
| PE-2.1 | FR-08 | AC-05 |
| PE-2.2 | FR-09 | AC-06 |
| PE-2.3 | FR-10 | AC-07 |
| PE-3.1 | FR-11, FR-12 | AC-08, AC-09 |
| PE-3.2 | FR-13 | AC-10 |
| PE-3.3 | FR-14 | AC-11 |
| SME-1.1 | FR-15 | AC-12 |
| SME-1.2 | FR-16 | AC-13 |
| SME-1.3 | FR-17 | AC-14 |
| SME-2.1 | FR-18, FR-19 | AC-15 |
| SME-2.2 | FR-20 | AC-16 |
| SME-2.3 | FR-21 | AC-17 |
| SME-3.1 | FR-22 | AC-18 |
| SME-3.2 | FR-23 | AC-19 |

Cross-cutting concerns: FR-24..FR-28 (shell, connectivity banner, stats,
service worker, schema subscription) — no story IDs (cross-cutting),
covered by AC-20 (SW) + AC-21 (schema subscription) + AC-25 (keyboard) +
AC-26 (touch targets) + AC-27 (no-auth grep) + AC-28 (new search helper).
FR-24 (shell extension) and FR-25/26 (banner + stats) carry NO direct
ACs — they're verified by inclusion in AC-01 / AC-05 etc., which is
acceptable but worth a sentence.

## Blockers

### B-01 — `GET /api/v1/schema` is referenced as if it exists in `graph-core`, but it does not

FR-27 line 109 says the service worker "precaches the app shell + the
latest schema export from `/api/v1/schema`". FR-28 line 110 falls back
to "polls `/api/v1/schema` on a 5-min interval". The Dependencies table
line 231 doubles down: "the schema cache is built from `/api/v1/schema`
(which `graph-core` already exposes — story OA-2.1 AC-1)".

This is wrong. `graph-core/requirements.md` (revision 4, approved)
exposes:

- `GET /api/v1/healthz` (FR-11)
- `GET /api/v1/stats` (FR-11)
- `GET /api/v1/openapi.json` (FR-16)
- `GET /api/v1/export` (FR-17)
- `GET /api/v1/export.ndjson` (FR-18)
- `GET /api/v1/query/{listDomains,getDomain,getJourney,getActivity,findPath,neighbors}` (FR-07)
- `POST /api/v1/query/cypher` (FR-07)

`/api/v1/schema` does NOT appear in `graph-core` requirements or design.
The reference to "story OA-2.1 AC-1" is misdirection: that AC is owned
by `ontology-manager`, not `graph-core`, and `ontology-manager/FR-14`
talks about *extending* a `graph-core/GET /api/v1/schema` that doesn't
exist yet.

Pick one fix:

(a) **Add `/api/v1/schema` to NFR-07's "one API surface extension" list.**
    NFR-07 line 122 already says "one read-only search helper (FR-17 —
    `/api/v1/query/search`)" is the only allowed extension. Tighten or
    relax: either say "two extensions (search helper + schema endpoint)"
    or move the schema endpoint into `ontology-manager`'s surface as a
    hard precondition.

(b) **Drop reliance on `/api/v1/schema` and use the OpenAPI doc.**
    `/api/v1/openapi.json` already enumerates every node label + edge
    type via the zod schemas (graph-core/FR-16 + AC-24). The PWA could
    pull labels from the OpenAPI doc until `ontology-manager` ships.

(c) **Defer FR-28 entirely to ontology-manager.** Mark FR-28 as
    `should` already (line 110), but the FR also has a polling fallback
    that depends on this missing endpoint. Either drop the fallback or
    upgrade to ontology-manager being a hard precondition.

Adopt (a) or (b) — fastest fixes. Re-state NFR-07 to enumerate ALL the
endpoints this spec adds and rename the dependency note. AC-28 only
covers `/api/v1/query/search`; a parallel AC for `/api/v1/schema` would
be needed under (a).

### B-02 — `ontology.changed` SSE endpoint `/api/v1/ontology/events` is invented; `ontology-manager` only exposes an in-process EventEmitter

FR-28 line 110 says "listens to `ontology.changed` (via Server-Sent
Events on `/api/v1/ontology/events`; see `ontology-manager/FR-17`)".

`ontology-manager/FR-17` (line 77 of that file) says explicitly:

> Mechanism in this spec: an in-process `EventEmitter` exposed on the
> API workspace. Cross-process / multi-instance broadcast is out of
> scope (single-tenant single-process per `graph-core/NFR-08`).

There is no SSE endpoint. There is no cross-process broadcast. The PWA
running in the browser is by definition a separate process from the API,
so an in-process EventEmitter is **unreachable** from the PWA — the very
thing FR-28 needs.

Two clean fixes:

(a) **Add `/api/v1/ontology/events` (SSE) as a new requirement on
    `ontology-manager` to receive this spec's listener.** This is the
    honest mapping. Note this in this spec's Dependencies + Risks
    tables, and either get `ontology-manager` to revise (it's still
    draft, revision 1) or accept that this spec blocks until that
    surface is added.

(b) **Replace SSE with HTTP polling against `/api/v1/schema`'s
    `ETag` / `If-Modified-Since`.** This is the alternative `ontology-manager/Risks
    #3` already names ("downstream code polls `/api/v1/schema` with an
    `?ifModifiedSince=` header"). The FR-28 fallback line already
    mentions 5-min polling — promote it to the only mechanism and drop
    SSE.

(b) is the lowest-friction fix and aligns with the existing 30-s
healthz polling cadence in FR-25. It also dodges the SW-vs-SSE-vs-Safari
swamp (Safari historically buggy with EventSource + SW).

### B-03 — Multiple ACs fall short of the "test path OR `manual: <one-line procedure>` with input mode + observable outcome" rule

The SKILL.md governance and the user prompt are explicit: bare "manual
smoke", "manual Lighthouse run", or "visual inspection" is unacceptable.
The following ACs need tightening:

| AC | Problem text |
|----|--------------|
| AC-02 line 151 | "+ manual smoke on `retail-mini`" — no input mode, no observable outcome |
| AC-04 line 153 | Only `pwa/__tests__/system-view.test.tsx` — no platform-spread manual; the criterion claims "all four" platforms but the verification only runs a single jsdom test |
| AC-06 line 155 | Same — `pwa/__tests__/activity-filter.test.tsx` only; no manual on iPhone/iPad to confirm URL-shareable + "survives reload" claim works on touch surfaces |
| AC-10 line 159 | "+ manual smoke" — no procedure |
| AC-12 line 161 | "+ integration: assert one POST to `/import` not multiple" — fine for desktop but FR-15 is `degrade` on iPhone and the AC lists `all four` platforms; no procedure for the small-form vertical experience |
| AC-18 line 167 | "+ manual smoke" — same problem |
| AC-23 line 172 | "manual Lighthouse run; CI gate optional (manual for now)" — Lighthouse on what? Throttling profile? Pass threshold? "≤ 2 s on a 2021 MacBook Air on a clean cache" needs a repeatable script (e.g. `lighthouse https://… --throttling.cpuSlowdownMultiplier=1 --form-factor=desktop --only-categories=performance` with an asserted `interactive < 2000`) |
| AC-24 line 173 | "manual: per-frame logger; assert median ≤ 16 ms over 5 s pan-zoom session" — better, but doesn't name the logger (Chrome DevTools Performance? `requestAnimationFrame` instrumented?), doesn't say *what* pan-zoom session (which journey, how many nodes, what gesture), and doesn't fix the input mode (trackpad or mouse?) |
| AC-25 line 174 | "manual: walk through every route with Tab" — better, but doesn't define "no trap" — escape route through tab cycles? what's the success condition? |
| AC-27 line 176 | "n/a (codebase)" but verification is `pwa/__tests__/no-auth-grep.test.ts — reuses the `graph-core` grep pattern" — fine, but `graph-core/AC-22` itself was flagged in `graph-core/review-requirements.md` (pass-2, concern C-01) for the `session` token producing false positives. This spec inherits the same flaw without fixing. |

The Native Conflicts table reduces the risk substantially because each
row's suppression is testable, but the ACs that verify the high-level
gesture outcomes (AC-09 for pinch/pan, AC-25 for Tab, AC-26 for
44×44 px) are the ones that the implementer will use to know whether
they're done. They have to be sharper.

**Fix sketch for AC-09:**

> Manual on iPad Safari (touch only): (a) open `#/explorer/journeys/<seed-journey-id>/canvas`; (b) pinch-out on the canvas — expect canvas zoom in, page does NOT zoom (verify via `window.visualViewport.scale === 1`); (c) two-finger drag on the canvas — expect canvas pan, no scrollY change on `document.scrollingElement`; (d) single-finger tap on a node — expect side panel opens with that node's detail; (e) swipe from the LEFT edge of the viewport — expect Safari back-gesture fires (URL changes). Repeat on iPhone Safari with the same observable outcomes (canvas tolerated smaller).

Adopt this density across the AC table.

### B-04 — `home_domain` server-side enforcement contradicts `graph-core/NFR-08` and FR-21 hides this in prose

FR-21 line 98 says:

> The server-side validator (in `graph-core`'s edge / node handlers; OR
> a new middleware in this spec) rejects writes to a node whose parent
> domain ≠ `home_domain` with `403 {error:{code:"out_of_domain"}}`.

This is a backend modification to `graph-core` not enumerated in NFR-07
("API contract from `graph-core` is **not extended** by this spec
except for one read-only search helper (FR-17 — `/api/v1/query/search`)").
Either FR-21 or NFR-07 is wrong.

Worse, the Risks section (Risks #3 line 256) implicitly admits this:

> Recommend (a) — the guard is an SME workflow nudge, not a security
> boundary. AC-17 should test "out-of-domain write disabled in UI" + a
> server-side test of the 403 if the operator overrides via curl.

If the spec's owner takes Risks #3 (a), then FR-21 should say "**UI
disables write buttons** for out-of-domain nodes; server-side
enforcement is intentionally absent because single-tenant single-trust
per `graph-core/NFR-08`". AC-17 then drops the
`api/__tests__/out-of-domain-guard.integration.test.ts` half.

If the owner takes (b), then NFR-07 needs to enumerate the server-side
middleware as a second API extension, and `graph-core/FR-06` needs a
corresponding addition.

Pick one. As written, FR-21 + NFR-07 + Risks #3 are mutually
inconsistent; design-phase author cannot proceed without a decision.

### B-05 — Verification-metadata attribute names (FR-20) risk colliding with `ontology-manager`'s attribute namespace

FR-18 (review status) and FR-20 (verification metadata) both write
attributes onto nodes:

- `review_status` ∈ `{needs_review | verified | deprecated}`
- `review_reason`
- `verified_by`
- `verified_at`

These are bare attribute names stored in `node.attributes`. But
`ontology-manager/FR-04` enforces an attribute schema per label —
`ontology_attribute_schemas`. If a future Maya (the ontology author)
registers a `Journey.verified_at` attribute as `date-only`, but this
spec writes ISO datetime, the validator rejects the write.

Worse: `ontology-manager/FR-04` says missing required attributes return
`400 attribute_violation`. If `verified_at` is registered as required,
every existing journey is now invalid because FR-20 verification
metadata is **optional** on creation.

Three fixes:

(a) **Namespace the meta-attributes** — write into a reserved key like
    `node.attributes._review = {status, reason}` and
    `node.attributes._verification = {by, at}`. `ontology-manager` keeps
    user-registered attribute names free of clashes; the `_` prefix is
    the namespace agreement (mirrors `ontology-manager/Risks #1`
    "labels prefixed with `_`").

(b) **Promote these to top-level node properties** at the `graph-core`
    schema level. Means adding optional `review_status`, `review_reason`,
    `verified_by`, `verified_at` to `nodeReadSchema`. This is a
    `graph-core` schema change and breaches NFR-07.

(c) **Register the four attributes with `ontology-manager` at PWA-load
    time** via `POST /api/v1/ontology/node-labels/:name` patches. This
    pushes the responsibility into the workspace bootstrap.

(a) is the cleanest. State it in FR-18 + FR-20 + the Native-Conflicts
adjacent text. AC-15 + AC-16 then assert the `_review` / `_verification`
prefix.

The current spec is silent on this and the implementer will collide on
day 1.

## Concerns

### C-01 — Story PE-1.3 is mapped to both FR-04 and FR-06 + FR-07, but FR-06/07 carry "(implied)" as their Story column

FR-06 line 68 and FR-07 line 69 both say "PE-1.3 (implied)". The user
story PE-1.3 reads:

> As a Process Explorer, I want to pivot from any activity to the roles,
> systems, and locations bound to it.

So FR-04 (activity detail with four bound lists) directly covers PE-1.3,
and FR-06 (role-centric view) + FR-07 (location-centric view) are
*useful but not directly requested by the story*. The "(implied)"
qualifier is technically honest but suggests the FR-06/07 priority might
be over-cooked.

Either:

- **Lower their priority** to `should` and admit they're out of the
  18-story commitment, OR
- **Spawn a new story PE-1.5** ("role-centric view") for full
  traceability if the spec owner truly wants these as `must`. The user
  stories HTML is currently v0.1 — adding stories is easy.

The cost of the current "(implied)" wording is that the design phase
might cut FR-06/07 to hit the bundle budget (NFR-02) and the spec text
silently won't complain.

### C-02 — FR-21 server-side guard puts the validator "in `graph-core`'s edge / node handlers; OR a new middleware in this spec"

The "OR" makes the integration shape unspecified. Design phase needs to
know which workspace owns the validator. If `graph-core`, then NFR-07
is breached (see B-04). If the PWA's own API workspace (a new BFF
proxy), then this spec needs to specify a new HTTP layer — which it
doesn't.

Pin it to one of:

- A `graph-core` middleware that reads a `?home_domain=:id` query
  param (admits the NFR-07 breach in B-04).
- A PWA-side BFF (back-end-for-frontend) layer that sits in front of
  `graph-core` (adds a new server-side component this spec doesn't
  mention).
- Pure client-side enforcement (the Risks #3 (a) path; no server
  guard).

### C-03 — FR-16 "Order in the paste = initial PRECEDES chain" — what about re-paste with reordering?

FR-16 line 93 says re-paste is "idempotent" and matches by `name` within
the journey. But if Maya pastes `[A, B, C]` then re-pastes `[B, A, C]`,
should `PRECEDES` be `B→A→C` (reorder) or remain `A→B→C` (idempotent)?
The doc says idempotent — implying the second paste does nothing — but
also says "rebinds order without duplicating activities", implying the
order does change.

Pin this. The contract should be one of:

- **Order-preserving:** re-paste rewrites `PRECEDES` to match the new
  order; the only thing that's idempotent is the activity creation,
  not the chain.
- **Order-frozen:** order in the *first* paste wins; re-paste only adds
  missing names at the end of the chain.

Risks #10 line 309 already flags duplicate-name handling but not
reorder.

### C-04 — Service-worker degradation contract on Safari is hand-wavy (FR-27, AC-20)

FR-27 line 109 says "Network-first for `/api/v1/*` data; cache-first
for static assets". AC-20 line 169 says "Safari has SW restrictions;
degrade gracefully". What "degrade gracefully" means is undefined.
Specifically:

- **iOS Safari evicts SW caches aggressively** (≈ 7 days unused).
  Does "degrade" mean "shows the offline UI as if SW never registered"?
- **Private browsing** disables SW entirely. Does the app still load?
- **iOS Safari quota** is shared per-origin and small (≈ 50 MB).
  Precaching schema + app shell is fine; what's the upper bound for
  cached graph data?

Pin a contract:

> SW registration may fail (Safari private mode, quota exhausted, user
> denied). When registration fails, the app loads normally without
> offline support; the connectivity banner from FR-25 continues to work
> as the only offline-state indicator. No reads are cached. Writes are
> attempted online-only and surface their own network errors. The
> "stale" banner from FR-27 does not appear when SW isn't registered.

### C-05 — `findPath` `maxDepth` selector wired through but the 1000-row cap from `graph-core/NFR-09` isn't surfaced

FR-10 line 77 says "Depth selector range 1..8 … inline error from API
surfaces as a friendly banner". `graph-core/NFR-09` also caps results at
1000 rows. The UI doesn't say what happens when `result_truncated` (the
other 400 error code from `graph-core/AC-23`) surfaces — banner? new
error code? AC-07 (line 156) tests only the depth-overflow path.

Add the `result_truncated` handling to FR-10 + AC-07.

### C-06 — `findPath` returns "zero or one row" per `graph-core/design.md` §5.1 — UI must handle the "no path" case

`graph-core/design.md` line 530 commits: "single shortest path (Cypher
`shortestPath((a)-[*..maxDepth]-(b))`)… zero or one row". The UI in
FR-10 doesn't address what happens when there is no path. The user
sees... nothing? An empty list? A "no path within depth N" message?

Add an explicit "no path" UI state to FR-10 + AC-07.

### C-07 — XC-1.1 / XC-1.2 inheritance is asserted but no AC verifies it on this spec's shell

FR-25 + FR-26 (lines 107–108) say the connectivity banner + stats
counts are "inherited from `graph-core`" — no new polling logic. But
the AC table doesn't carry an AC saying "the inherited banner from
`graph-core/AC-14` still works in this spec's shell". A regression in
this spec's shell that breaks the polling (e.g. by occluding the
header) would not be caught by `graph-core/AC-14` (which tests the
placeholder shell).

Add one AC: "the connectivity banner from FR-25 surfaces on every route
in this spec; switching the API server off flips the banner to
disconnected within 30 s on `#/explorer/journeys/:id` (which is the
route with the most chrome)."

## Nits

### N-01 — Author email + revision header

The frontmatter says `revision: 1` and `status: "draft"` but omits the
`author` field that the other specs (`graph-core`, `ontology-manager`)
carry. Add `author: "frank"` for consistency.

### N-02 — "graph-core/Risks #1" cross-ref text is correct but a `(see canvas-library choice in Dependencies)` inline reference would help

The summary calls out that this spec resolves `graph-core/Risks #1`
(canvas library) — Dependencies row "Canvas library" line 232 has the
options. A one-sentence note in FR-11 saying "the canvas library is
named in Dependencies and locked at design phase" would close the loop
for a reader who hits FR-11 first.

### N-03 — "(cross-cutting)" Story column entries in FR-24..FR-28 should be a hyperlink to the XC-* rows

FR-25 carries Story "XC-1.1", FR-26 carries "XC-1.2", but FR-24, FR-27,
FR-28 carry only `(cross-cutting)`. Match the convention by tagging
FR-27 / FR-28 with the closest XC-* (likely XC-3.1 for service worker
boot speed, none for SW) or accept the gap explicitly in prose. This is
stylistic; not load-bearing.

### N-04 — Risks #8 (`PRECEDES` cycle) — design tiebreaker

Risks #8 line 296 picks "`createdAt` ASC" as the tiebreaker. This is a
design decision; bake it into FR-03 ("cycles render in `createdAt` ASC
order, with a warning ribbon") so the design author can copy-paste.

## Native Conflicts table — strengths and gaps

11 rows is good; this is the strongest Native Conflicts table I've seen
in this project. Verified:

| Row | Conflict | Suppression | Verdict |
|-----|----------|-------------|---------|
| 1 | Pinch-zoom zooms page | viewport meta + `touch-action:none` | sound — but viewport `maximum-scale=1, user-scalable=no` is a global meta tag; "on the canvas route only" is implied by FR-12 but should be enforced via route-level meta swap (which is a design-phase detail; flag) |
| 2 | Two-finger pan scrolls page | `touch-action:none` + `preventDefault` | sound |
| 3 | Browser back-gesture vs canvas pan | 20-px edge cushion | sound, also called out in Risks #7 |
| 4 | `/` key opens Safari quick-find | `keydown` capture + `preventDefault` | sound |
| 5 | Arrow keys scroll page | popover-scoped capture | sound |
| 6 | Tab nav escapes modal | focus trap | sound |
| 7 | Right-click context menu | n/a (intentionally not bound) | acceptable — the row is included for completeness, which is the right call |
| 8 | Pull-to-refresh | `overscroll-behavior-y: contain` | sound |
| 9 | Double-tap-to-zoom | `touch-action:none` + custom dbl-tap handler | sound |
| 10 | bfcache restoring stale state | `pageshow` `persisted` check | sound |
| 11 | `<input>` autocomplete dropdown | `autocomplete="off"` + portal | sound |

Gaps the table SHOULD have, but doesn't:

- **iOS Safari rubber-band scrolling at top of viewport.** When the
  user pulls down at the top of `#/explorer/journeys/:id` to scroll,
  iOS Safari rubber-bands. This is generally fine, but with a sticky
  header (FR-24) the rubber-band can lift the header off-screen
  awkwardly. `overscroll-behavior-y: contain` on `body` would fix this;
  is it intended?

- **Long-press menu on the canvas selecting a node.** Long-press on iOS
  Safari triggers the system text-selection menu. If a single-finger
  tap selects a node (FR-12), long-press on a node may both select it
  AND fire the menu. `user-select: none` + `-webkit-touch-callout: none`
  on the canvas container needed; not in the table.

- **Voice Control (iOS / macOS accessibility).** Voice Control shows
  numbered overlay on every clickable region; with a 200-node canvas,
  that's overwhelming. Out of scope is fine, but acknowledge it.

- **Safari "Smart Search Field" autocomplete on the typeahead.** Row 11
  covers `<input>` browser autocomplete; the Safari search field also
  pops a suggestion drawer that obscures the typeahead. Worth a row.

- **Cmd+F (browser find) conflicting with the in-app search.** Cmd+F
  on macOS opens Safari's find-in-page. The in-app search bar from
  FR-08 is the *primary* search. If the user expects Cmd+F to focus
  the in-app search, this is a conflict. Decide: either bind Cmd+F
  globally to focus the in-app search (NEW row needed in the table),
  or document that Cmd+F → browser find is intentional and `/` is the
  only in-app focus key.

These would push the row count to ~15, in the "thorough" zone the user
prompt expected.

## Platforms & Input Modes table — assessment

Populated row-by-row with explicit yes/no/degrade per surface. Strong.
Minor nits:

- **"Drag/drop / pencil input"** row line 204 says iPad is "optional
  (Pencil treated as touch)" — that's a non-answer. Either yes (treat
  Pencil as a first-class pointer) or no. Pick.

- **"Browser back-gesture passes through at canvas edge"** row line 194
  says "n/a (no swipe-back on macOS)" for macOS Safari. macOS Safari
  *does* have a swipe-back on the trackpad (two-finger horizontal
  swipe). Either confirm it's not relevant (no, it's not — the canvas
  doesn't intercept trackpad horizontal swipe by default) or correct
  the row.

- **Bulk-paste activities (FR-16) row line 198** is `no` on iPhone with
  the justification "paste UX poor on mobile; surface a 'open on
  desktop' hint" — good, but this needs a corresponding AC that asserts
  the hint actually shows on iPhone. No AC currently. (AC-13 is
  macOS-only.)

## Scope-boundary assessment

In-scope list is reasonable. Out-of-scope list is reasonable. Two
boundary calls worth a sanity check:

- **"Comments / annotations on entities — deferred"** is mentioned
  (line 144) but not tied to a downstream spec. Either name the spec or
  drop the line.

- **"Multi-tab state sync (e.g. `BroadcastChannel`)"** is deferred
  (line 143). Without it, two browser tabs open on the same journey
  will diverge on writes — the SME persona may hit this on a real
  workshop ("opened twice, edited in tab A, lost my work in tab B").
  Worth a 1-line risk acknowledgement: writes from tab A invalidate
  tab B's cache via... nothing, in this spec.

## NFR coverage

Every NFR has at least one AC except NFR-09:

| NFR | AC |
|-----|-----|
| NFR-01 (transpile) | covered by inheriting `graph-core/AC-02`; no AC in this spec |
| NFR-02 (300 KB bundle) | AC-22 ✓ |
| NFR-03 (≤ 2 s TTI) | AC-23 (weakly — see B-03) |
| NFR-04 (60 fps canvas) | AC-24 (weakly — see B-03) |
| NFR-05 (keyboard-reachable) | AC-25 (weakly — see B-03) |
| NFR-06 (44×44 px touch targets) | AC-26 ✓ |
| NFR-07 (no API extension beyond search helper) | AC-28 ✓ — but contradicts FR-21 (see B-04) |
| NFR-08 (no auth code paths) | AC-27 ✓ |
| **NFR-09 (deterministic hydration)** | **none — no AC** |

NFR-09 (line 124 — "deterministic hydration… byte-identical across
runs") has no AC. The intent is sound (snapshot tests) but without an
AC, this NFR is a wish, not a requirement. Add an AC:

> AC-29: Snapshot test on `#/explorer/journeys/<seed-id>` — render the
> route twice from a fresh cache against the same `/changes?since=`
> cursor; deep-equal the DOM (after stripping Date-now timestamps).

Minor: NFR-01 (TypeScript transpile) isn't AC'd in this spec; it could
inherit `graph-core/AC-02` but the inheritance isn't stated.

## Dependencies — assessment

The Dependencies table is honest about the open choice (canvas
library, state library, SW library). Two adjustments:

- **`zustand` (or React Context + hooks) — "Locked in design phase"**
  (line 233) — the same row in `graph-core` Dependencies was upgraded
  from "or equivalent" to a locked choice (`zod`) in pass 2. Apply the
  same standard here: pick `zustand` or pick React Context, don't ship
  the choice into design.

- **`playwright`** (line 236) for gesture tests is good. But what's
  the CI runtime? `playwright` on macOS in CI for iPad-Safari gesture
  testing is non-trivial (requires WebKit support and the iOS
  simulator). State the test environment up front so the design phase
  isn't surprised.

## Risks — assessment

10 risks; broadly well-chosen. Specifics:

- **Risks #1 (canvas library)** — fine, properly deferred.
- **Risks #2 (search helper)** — fine, AC-28 covers.
- **Risks #3 (home_domain)** — author is leaning toward (a) "advisory
  only"; if so, FR-21 must be rewritten (see B-04). Currently the
  risk + the FR disagree.
- **Risks #4 (SW Safari restrictions)** — see C-04, needs a concrete
  contract.
- **Risks #5 (1000-row payload cap vs bulk paste)** — fine; design
  phase decides.
- **Risks #6 (canvas + offline)** — fine; defer.
- **Risks #7 (back-gesture 20px cushion)** — fine; manual test on
  iPad/iPhone.
- **Risks #8 (PRECEDES cycle tiebreaker)** — pick `createdAt` ASC now
  (see N-04).
- **Risks #9 (search ranking at scale)** — fine; the design must
  confirm with `graph-core/FR-05` whether the index is full-text. As
  written `graph-core/FR-05` says "range indexes on `name`" (not full-
  text). At realistic scale, this FR-08 will fail. This is closer to a
  concern than a risk — promote to C-08 if you'd like.
- **Risks #10 (bulk-paste idempotency)** — fine; pick (a) raise on
  duplicate.

## Architectural soundness — checklist

| Check | Verdict |
|-------|---------|
| Canvas-library choice deferred to design phase | ✓ (Dependencies row + Risks #1) |
| Out-of-domain guard server-side enforcement vs NFR-08 | ✗ (see B-04) |
| Service worker scope appropriate (precache reads, no offline writes) | ✓ (FR-27) but contract is hand-wavy (see C-04) |
| Schema subscription with ontology-manager | ✗ (see B-02 — SSE doesn't exist) |
| Bulk-paste idempotency contract clear | ✗ (see C-03 — reorder ambiguity) |
| Verification metadata attribute namespace doesn't collide | ✗ (see B-05) |
| Pinch-zoom suppression covers iPad Safari (canvas) + viewport meta | ✓ (Native Conflicts row 1) — but route-level meta swap is implicit |
| `/` slash-key conflict has mitigation | ✓ (Native Conflicts row 4) |
| Bfcache (Safari restoring stale React state) explicitly handled | ✓ (Native Conflicts row 10) |
| SW degradation on Safari acknowledged | partial — acknowledged but not contracted (see C-04) |

## Finding counts

- Blockers: **5** (B-01 missing endpoint, B-02 SSE doesn't exist, B-03
  AC verification slack, B-04 home_domain contradiction, B-05
  attribute namespace collision)
- Concerns: **7** (C-01 implied stories, C-02 validator location, C-03
  re-paste reorder, C-04 SW degradation contract, C-05 result_truncated
  UI, C-06 no-path UI, C-07 XC-1.1 inheritance AC)
- Nits: **4** (N-01 author field, N-02 cross-ref, N-03 XC-* tagging,
  N-04 PRECEDES tiebreaker)

## Pass tracking

- This is **pass 1 of 2** for the requirements phase. One more
  requirements review is permitted before the gate closes.
- Pass-2 author should focus on:
  1. Resolving the `/api/v1/schema` and `/api/v1/ontology/events`
     surface contracts (either by adding them to `graph-core` /
     `ontology-manager` upstream or by removing the dependency).
  2. Tightening every `manual:` AC to include input mode + observable
     outcome (the user prompt was explicit about this).
  3. Deciding FR-21 home-domain enforcement (advisory vs server) and
     making FR-21 + NFR-07 + Risks #3 mutually consistent.
  4. Namespacing review/verification attributes (FR-18 + FR-20).
  5. Adding the missing AC for NFR-09 + the missing Native-Conflicts
     rows.

## Strengths

Worth carrying forward to pass 2:

1. **Full 18-story traceability.** No orphans. The Story column on
   every FR is populated.
2. **Honest "(implied)" tagging.** FR-06 + FR-07 flagging themselves as
   "(implied)" is the kind of self-awareness that helps a reviewer.
   Just commit to either lowering priority or spawning new stories.
3. **Native Conflicts table is the strongest in the project.** 11 rows
   with real suppression mechanisms; the right call to add row 7
   (right-click context menu, intentionally not bound) — that kind of
   "we considered this and chose not to" row prevents future regret.
4. **Platforms & Input Modes table** is populated row-by-row with
   explicit reasoning ("paste UX poor on mobile") rather than blanket
   yes/no.
5. **Risks section is concrete.** 10 enumerated risks with
   recommendations, including the right meta-call on Risks #3
   (`home_domain` is "an SME workflow nudge, not a security boundary").
6. **Scope boundaries explicitly enumerate the four downstream specs
   that own deferred work** (chat-interface, cto-analytics, follow-on
   offline-write spec, ontology-CRUD admin pane).
7. **NFR-07 sets a hard contract** for API surface extension (one new
   search helper); this is the right shape, even though FR-21 then
   breaches it (B-04).
