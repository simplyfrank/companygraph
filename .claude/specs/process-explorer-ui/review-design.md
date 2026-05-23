---
feature: process-explorer-ui
reviewing: design
reviewer: spec-review-agent
verdict: revise
reviewed_at: 2026-05-23
pass: 1
---

# Review: process-explorer-ui design (Pass 1 of 2)

## Summary

`design.md` (revision 2) is a long, dense, conscientious document.
The locked-in stack (react-flow 11.x + zustand 4.5 + hand-rolled SW
+ @dagrejs/dagre + html-to-image) is sound. §0 absorbs the prior
pass-1 findings from the design's own internal review trail and §10
maps every AC to a test path. The graph-core amendment (T-31) is
concrete enough to ship and STATUS.md confirms it is already shipped
+ verified live (6 tests passing 2026-05-23). The client-side
read-modify-write story for `_review` / `_verification` attribute
preservation (§4.11 + AC-15/16/19 tightening) is the correct answer
to the `attributes_json` replace-the-whole-map storage shape.

That said, this is still a pass-1 review and four blockers surface
when the file is read against the live scaffold + the requirements +
the upstream APIs. Three of the four are file-level facts (the
design hand-waves the scaffold's actual route shape, the actual tab
IDs, and the Settings UI that gates FR-21) and one is a Cypher
correctness bug in `reviewQueueForDomain` that will mis-truncate the
review queue in production. None of the four require architectural
revision — they're all surgical text + Cypher fixes — but they
cannot be deferred to tasks-phase because each one shifts a contract
that downstream tasks will lock in.

The 11 concerns include the missing Settings UI for `setHomeDomain`,
the `useIsHomeDomain` Cypher-per-render fan-out, the dual-RT
bulk-paste rollback's residual-failure UI gap, and several smaller
AC-test pairings that don't quite line up. The 7 nits are file-line
drift and prose-level cleanups.

Verdict: **revise**. None of the blockers are "rewrite the
architecture" — all four can be fixed in a single revision-3 sweep
that probably runs <100 lines diff. Pass-2 should approve cleanly.

## Verdict

**revise** — 4 blockers, 11 concerns, 7 nits.

## Blockers

### B-01 — Route names diverge three ways between requirements, design §3, and the live scaffold; AC-11 / AC-29 / AC-30 tests will fail outright

`design.md §3` (lines 158–173) declares the explorer routes as
`#/explorer/journey/:id`, `#/explorer/journey/:id/canvas`,
`#/explorer/path`, `#/explorer/systems`, with the note "scaffold tab
id: 'journey' (singular, kept from scaffold)". But the scaffold's
actual `pwa/src/route.ts:12–22` defines tab IDs
**`journey-detail`**, **`journey-graph`**, **`path-finder`**,
`domains`, `systems`. And `pwa/src/views/index.tsx:48–60` keys
`VIEWS.explorer` on those same hyphenated IDs.

Worse, `requirements.md` rev-3 uses **plural** `journeys` in FR-03
(`#/explorer/journeys/:id`), FR-11 (`#/explorer/journeys/:id/canvas`),
FR-14, AC-02, AC-10, AC-11, AC-24, AC-29, AC-30. Design's own §10 AC
table is inconsistent: AC-04 (line 1659), AC-11 (line 1666), AC-29
(line 1684), and AC-30's render call at line 1538 all reference
`#/explorer/journeys/<id>` (plural) while §3 (line 162) declares
`#/explorer/journey/:id` (singular) and the scaffold tab ID is
`journey-detail` (compound).

That's three contradictory shapes inside the same document
post-revision-2:

1. **Scaffold (live):** `#/explorer/journey-detail/:id`, `#/explorer/journey-graph/:id`, `#/explorer/path-finder`
2. **Requirements rev 3:** `#/explorer/journeys/:id`, `#/explorer/journeys/:id/canvas`, `#/explorer/path` (?)
3. **Design §3:** `#/explorer/journey/:id`, `#/explorer/journey/:id/canvas`, `#/explorer/path`, `#/explorer/systems`

Design §0's B-03 absorption row claims "scaffold tab-id naming wins"
and points at "requirements rev 3" with `#/sme/{add,review,quarterly}`
— but that resolution covers only the SME surface (`sme/*`), not the
*explorer* surface. The requirements rev-3 frontmatter
(`requirements.md:11`) explicitly scopes the rename to SME routes
only:

> Rename SME routes to match the PWA scaffold tab ids …
> #/sme/new-journey → #/sme/add, …. No semantic change — pure
> rename.

The explorer surface is untouched, so requirements still says
`/explorer/journeys/:id` (plural) but design says
`/explorer/journey/:id` (singular) AND scaffold says
`/explorer/journey-detail/:id`. AC-11's deep-link test asserts
`#/explorer/journeys/<seed-id>` loads — but `parseHash` in scaffold
will route that to `tab="domains"` (the surface's first tab, per the
fallback at `route.ts:136`), failing the test outright.

**Fix required**: pick one shape and align all three sources in a
**requirements rev 4** (this is more than a typo — it's the literal
URL contract for FR-14 + AC-11). Two viable options:

- (a) **Adopt the scaffold's hyphenated tab IDs** (`journey-detail`,
  `journey-graph`, `path-finder`) + rewrite all design and
  requirements URLs to match. Most consistent with the SME-surface
  resolution from rev 3.
- (b) **Extend `EXPLORER_VIRTUAL_TABS`** in `route.ts:112` to accept
  `journey` / `journeys` / `path` so `parseHash` routes them
  correctly. Requires a `route.ts` patch + a normalisation step
  (canonicalise `journeys` ↔ `journey-detail` etc.) — more code, less
  rename churn.

Either way, the design cannot leave the contradiction in place —
every AC-02 / AC-11 / AC-24 / AC-29 / AC-30 test path bakes in
`#/explorer/journeys/<id>` (line 1657 onwards) and will not even
reach the journey view as the scaffold stands today.

Cites: design.md lines 158–173 (§3 route declarations), 1538, 1657,
1659, 1666, 1684 (AC table prose using `/journeys/`);
requirements.md lines 96, 114, 117, 182, 190, 191, 204, 209, 210;
pwa/src/route.ts:12–22; pwa/src/views/index.tsx:48–60.

### B-02 — `reviewQueueForDomain` LIMIT 1001 happens BEFORE the client-side `_review.status === "needs_review"` filter — verified rows will starve `needs_review` rows in production

`design.md §4.11` (lines 977–1003) ships:

```cypher
MATCH (n)
WHERE n.attributes_json CONTAINS '"_review"'
  AND ( $homeDomainId IS NULL OR EXISTS { (n)-[:PART_OF*1..8]->(:Domain {id: $homeDomainId}) } )
RETURN n.id AS id, n.name AS name, labels(n) AS label, n.attributes_json AS attrs
ORDER BY n.updatedAt DESC
LIMIT 1001
```

…and immediately below states: "The result is filtered client-side
for entries whose parsed attrs include `_review.status ===
'needs_review'`."

That's wrong by construction. The Cypher matches **every node whose
`attributes_json` contains the substring `"_review"`** — including
nodes that have already been verified (status `"verified"`),
deprecated (status `"deprecated"`), or any future status value FR-18
allows. The LIMIT 1001 then truncates the top-N-by-updatedAt of
*that broader set*, and the client-side filter discards everything
except `needs_review`. For an SME working through a 90-day
verification cadence, the steady-state population is dominated by
`verified` rows (persona-P5's job is to *clear* the queue), so the
limit will silently drop the actual `needs_review` work onto the
floor.

Two further mis-steps in the same query:

1. **Substring-on-JSON-string is fragile.** `"_review"` will also
   match a `description` field that happens to contain the literal
   text `"_review"` (e.g. a journey named "_review board procedure"
   or a description copied from a Confluence page). False positives
   are surfaced as bogus queue items.
2. **`labels(n)` returns an array, not a single label.** Graph-core's
   model puts a single label on each node in practice, but the
   Cypher contract is array-shaped. Client code needs to take
   `labels[0]` or the design needs to call that out. Design §4.11
   says "`labels(n) AS label`" but never handles the array.

**Fix required**: push the `needs_review` predicate into Cypher.
Options:

- (a) **Native JSON path** — Neo4j 5.x has no native JSON-path
  operator outside APOC; APOC isn't pinned in graph-core. Would need
  another graph-core amendment.
- (b) **Regex substring tightening** — match
  `n.attributes_json =~ '.*"_review"\\s*:\\s*\\{[^}]*"status"\\s*:\\s*"needs_review".*'`
  — works without APOC. The LIMIT then truncates the *correct* set.
- (c) **Mirror `_review.status` to a top-level property** (e.g.
  `n.review_status`) on every flag/verify write so a property-indexed
  predicate is possible. Cleanest long-run, but bumps the FR-18 write
  payload shape and the storage write contract.

Recommend (b) for v1 (no graph-core dependency) with a tasks-phase
note to revisit (c) when the queue volume warrants. Same shape needed
for the `quarterlyHomeJourneys` partitioning of overdue/current — see
lines 1153–1158, where the `_verification.at` predicate is also
client-side post-LIMIT.

Cites: design.md lines 980–1003 (reviewQueueForDomain),
1153–1158 (quarterlyHomeJourneys — same shape, same bug);
FR-18 spec at lines 1052–1063; AC-15 test at line 1670.

### B-03 — Settings UI for `setHomeDomain` is referenced in tooltip + spec but absent from §3 routes, §9 files, and §11 file list — FR-21 is unbuildable

FR-21's user-facing tooltip is hard-coded as `"You're outside your
home domain — switch home in Settings to edit here"` (design.md line
1145, requirements.md line 129). `prefStore.setHomeDomain` is
specified in §4.1 (line 311) as `(id: string) => void` but the
design's §9 file matrix (lines 1610–1640) has NO file that calls
`setHomeDomain` — no Settings view, no settings sheet, no inline
"set home" affordance. The user is told to "switch home in Settings"
in a tooltip but Settings doesn't exist in the route model (§3, lines
158–173) and doesn't appear in §11's new-files list (lines 1693–1773).

Without a writer for `prefStore.homeDomainId`, FR-21 collapses to
"all writes always enabled" — the `useIsHomeDomain` hook (lines
1117–1128) returns `true` on `home === null`. AC-17's test (line
1672) sets localStorage directly to simulate the gate, but in
production no operator can flip it. The guard is unbuildable as
currently designed.

**Fix required**: pick one of:

- (a) **Add `pwa/src/views/settings/Home.tsx`** to §9 + §11,
  surfaced via a "Set as home" button on every Domain detail page.
  Cleanest separation; aligns with the scaffold's per-tab convention.
- (b) **Inline "Set this domain as my home" affordance** on each
  Domain detail page (no separate Settings surface). Update the
  tooltip copy to match ("Open this domain to set it as your home")
  + add the button in `Domains.tsx`'s file row.
- (c) **Drop FR-21 from this spec** and tag it `should` (currently
  `must`) with a follow-on spec. Cleanest if the writer UI is out
  of scope for v1.

Option (b) is probably the smallest diff and best matches the
SME-workflow framing. Pick one and patch §3 + §9 + §11 + the tooltip
copy + AC-17's manual repro instructions accordingly.

Cites: design.md lines 311 (`setHomeDomain`), 1117–1128
(`useIsHomeDomain`), 1145 (tooltip copy), 1632 (FR-21 row in §9 has
`prefStore.ts` but no Settings UI), 1670–1672 (AC-17 test directly
mutates localStorage but no manual-repro path).

### B-04 — File-line citations to `api/src/storage/nodes.ts:121` and `:162` are off by ~30–50 lines — patchNode is at line 151, upsertNode is at line 200

§4.11's "Critical clarification: `patchNode` REPLACES
`attributes_json` (B-01)" paragraph (lines 1006–1018) cites:

> `graph-core`'s `patchNode` (`api/src/storage/nodes.ts:121`) and
> `upsertNode` (`api/src/storage/nodes.ts:162`) both SET
> `n.attributes_json = <serialised whole map>`.

The actual file has `patchNode` at line **151** and `upsertNode` at
line **200** (verified via `grep -n "^export async function"`). Line
121 is `throw e;` in `createNode`'s constraint-violation catch block.
Line 162 is mid-`patchNode` body. Same pattern at line 1195
(`api/src/storage/nodes.ts:162` again, cited for `/import`'s
`ON MATCH SET ... attributes_json = $props.attributes_json` clause —
that clause is at line **229** in the actual file).

Less critical than B-01..B-03 but enough to flag as a blocker because
the *whole point* of the B-01 absorption was "go look at this exact
source line and you'll see why we need RMW". If the line numbers are
wrong, the reader who follows the citation looks at unrelated code
and the absorption argument falls apart. A new implementer following
the design's "see line 121" pointer will get confused.

**Fix required**: re-grep current line numbers and update all four
citations (two for `patchNode`, two for `upsertNode`, one for the
`ON MATCH SET` clause).

Cites: design.md lines 1008–1009 (B-01 fix paragraph cites :121 /
:162); 1195 (bulk sign-off prose cites :162); actual file at
api/src/storage/nodes.ts:92 (createNode), 151 (patchNode), 200
(upsertNode), and `ON MATCH SET` at 229.

## Concerns (sharp edges to pin)

### C-01 — `useIsHomeDomain` fires a Cypher round-trip on every render of every entity panel that has a write button

§4.11 (lines 1116–1128) ships `useIsHomeDomain(entity)` as a hook
that calls `reads.cypherDedup(homeDomainResolution, {id: entity.id})`
to walk the `PART_OF*1..8` chain. Every component that conditionally
renders a `disabled` write button reads this hook — that's
`FlagForReviewButton`, `VerifyJourneyButton`, `BulkSignOffCheckbox`,
`NewJourneyForm.submit`, `BulkPasteTextarea.submit` (lines 1142–1147)
— so every entity-detail view triggers at least one
`/api/v1/query/cypher` round-trip on mount, even when `home_domain`
is null and the guard is a no-op.

Two mitigations:
1. **Short-circuit when `home === null`** before the fetch. Today's
   code (line 1119) returns `true` without firing the fetch — that's
   correct in the code sketch. But the `useFetch(...)` wrapper at
   line 1123 still subscribes to the Cypher call signal even though
   the return value is ignored on the null-home path. Verify the
   wrapper actually skips the fetch on null-home, not just the
   result-handling.
2. **Cache home-domain-resolution per entity-id across panels** with
   a much longer TTL than 5 min. The home-domain ancestry of a node
   is essentially immutable for the lifetime of the node (the only
   mutation path is moving a node to a different parent, which is
   rare). 30 min cache is safer.

§4.11 line 1121 says "Cached via reads.ts for 5 min" — verify that
the dedup-by-URL-and-body-hash key (C-07 absorption from prior pass,
line 1136) actually persists across panel remounts. If it's a
module-scope `Map`, yes; if it's component-scope, no.

Cites: design.md lines 1107–1129 (useIsHomeDomain), 1117 (write-button
fan-out list), 1136 (cypherDedup body-hash key).

### C-02 — Bulk-paste rollback can itself fail; "please re-paste" UX is hand-waved

C-05 absorption (§0 + §4.11 lines 924–960) adds a pre-delete
snapshot + rollback `/import` if the new-chain `/import` fails. The
Risks table row at line 1843 acknowledges:

> Residual risk: network failure mid-rollback (i.e. snapshot was
> fine, delete succeeded, both import attempts failed). Operator
> must re-issue the paste manually. Surfaced in the UI banner:
> "Bulk paste failed and rollback did not complete — please
> re-paste".

That banner exists nowhere in §4.11 / §9 / §10. AC-13 (line 1668)
only covers the rollback success path (`forces /import to fail after
delete; asserts PRECEDES chain restored`). There's no test for the
double-fault path, no UI mock-up of the banner, no specification of
whether the snapshot data is kept in component state (lost on
navigation) or sessionStorage (recoverable across reloads).

**Recommended sharp edge**: add an AC-13b row that asserts:
1. On double-fault, the snapshot is persisted to `sessionStorage` so
   it survives a navigation.
2. A banner shows the snapshot contents + a "Restore" button that
   re-fires the rollback `/import`.
3. The banner is dismissable only after the operator confirms
   (or the restore succeeds).

Without this, the persona-P5 SME hits a real partial-corruption case
once a month and has no recovery path.

Cites: design.md lines 924–960 (rollback path), 1843 (risk row),
1668 (AC-13 test scope).

### C-03 — `mergeAttributes` race window is documented but the post-write UI doesn't surface "your write conflicted with another SME's"

§4.11 lines 1041–1047 acknowledges the race:

> Race window: between step 1 and step 3, another SME may have
> written. The race is rare … and is acknowledged in §12 Risks.

But the post-PATCH response is *the merged map the client sent*, not
the merged map the server stored after the conflicting writer landed
its own merge. Today's `patchNode` returns the node it just set; the
client has no way to detect "the body I sent was based on stale
attributes". Single-tenant single-trust handles this gracefully
(persona-P5's daily-to-weekly cadence vs the 1-second RTT window is
~10⁻⁵ collision probability), BUT in the rare case it triggers, the
losing writer's flag/verify silently vanishes.

§12's mitigation says "the SME refreshes the entity detail page
after the conflict is detected" — but the conflict isn't detected.
The losing writer sees its PATCH return 200 with the (apparently)
merged map, and only on a manual refresh later notices that another
attribute they wrote is missing.

Two options:
- (a) **Document the failure mode in the operator-facing docs**
  (single line in the SME workflow how-to: "if your flag
  disappears, it's because another SME flagged the same node within
  the same second").
- (b) **Add a coarse-grained ETag** via `updatedAt`: the client
  reads `node.updatedAt`, sends it in an `If-Match` header on PATCH;
  graph-core rejects with 412 if mismatch. Requires a graph-core
  amendment — likely out of scope per NFR-07.

Pick (a) for v1 and pin it. The current design's "acknowledged in §12"
is too quiet.

Cites: design.md lines 1041–1047, 1841.

### C-04 — react-flow `nodesDraggable={false}` claim in §4.6 collides with the SME bootstrap workflow

§4.6 (line 638) states:

> react-flow's `nodesDraggable={false}` after initial layout further
> reduces re-renders; the canvas is a viewer, not an editor.

Requirements FR-11 says "renders the journey's activities + bound
entities as a force-directed graph. Targets ≤ 200 nodes at 60 fps".
It does **not** specify whether the SME / Ravi can rearrange nodes
manually. AC-08's manual repro (line 1664) says "drag-pan +
pinch-zoom" — that's pan, not node-drag. So the design's choice is
defensible against the strict text of FR-11.

But persona-P5's bootstrap workflow (SME-1) inevitably involves
"this layout is wrong, let me drag that activity over there". If we
ship a fixed-layout canvas in v1 and an SME files a "can I drag?"
ticket day 1, we'll regret it.

**Sharp edge**: either (a) lock `nodesDraggable={false}` and add a
sentence to design's §4.6 explaining the trade-off + a "node-drag
deferred to follow-on spec" Risks row; or (b) flip to
`nodesDraggable={true}` and accept the re-render cost (react-flow
11.x handles node drag efficiently; the perf claim doesn't
necessarily collapse). Don't leave it as an undocumented design
choice.

Cites: design.md lines 636–640.

### C-05 — SchemaBootstrap 404-vs-5xx branch leaves `network unreachable` ambiguous

C-03 absorption (§0 + §4.3 lines 387–401) splits 404 (silent
fallback) from 5xx (`<ErrorState/>`). But what about an *abort* /
*network unreachable* / DNS failure?

`fetch("/api/v1/schema")` rejects with `TypeError: NetworkError`
when there's no response at all. That's neither a 404 nor a 5xx;
it falls into the `catch` block. §4.3's prose says "On
`/api/v1/schema` returning 5xx **or network failure** →
`<ErrorState/>`" — good. But the implementation sketch at line 475
says "branches on `res.status` not on `!res.ok`" — `res` doesn't
exist on network failure (no Response object). The branch must
catch the rejection explicitly.

This is a 5-line code fix at implementation time, not an
architectural blocker, but the design's wording at line 475 is
slightly misleading and will trip an implementer.

Cites: design.md lines 387–401, 475.

### C-06 — SSE→POLL-MODE state machine doesn't say what happens if `EventSource` constructor throws synchronously

§4.4 (lines 424–442) ships a 3-strike state machine for SSE
disconnects. But iOS Safari has a known issue where
`new EventSource(url)` can throw a `SecurityError` synchronously
when the URL is cross-origin and the manifest's CSP doesn't allow
`connect-src` matching. The handler hooks `onerror` after the
constructor — if the constructor itself throws, ERR-COUNT never
increments and the app silently has no schema subscription.

Wrap the `new EventSource(url)` in a `try` and increment ERR-COUNT
on the synchronous throw too. This is a one-liner but worth pinning
because the existing `schema-subscription.test.tsx` (already shipped
in the repo at pwa/src/__tests__/) mocks `EventSource` and would
miss this code path.

Cites: design.md lines 424–442 (state machine); existing test at
`pwa/src/__tests__/schema-subscription.test.tsx:89` (FakeEventSource).

### C-07 — `html-to-image` Safari export AC uses a brittle "pixel-diff threshold asserts the journey name is recognisable as text"

AC-10 (lines 1665–1666) ships:

> the Playwright spec asserts the exported PNG contains the journey
> name as legible text via pixel-diff threshold; SVG opens with
> `<text>` elements present.

Pixel-diff against a baseline image is OS-specific (macOS Safari's
font rendering differs from Linux CI; the threshold needs to be
loose enough to tolerate antialiasing but tight enough to fail on
foreignObject-stripped exports). The C-04 absorption claims this is
sufficient evidence of regression but doesn't specify:
- (a) what baseline image to diff against
- (b) what threshold value (1 %? 5 %? per-channel?)
- (c) whether the test runs in CI (where Safari isn't always
  available) or only locally

The SVG side is sound (`<text>` element presence is binary). The
PNG side needs concretisation in tasks-phase or this AC is
unverifiable.

Pin the threshold or replace the PNG check with a "PNG file size >
N KB" smoke test (foreignObject-stripped exports are dramatically
smaller — easier to assert).

Cites: design.md lines 1665–1666 (C-04 absorption), 30 (B-01 review
absorption row).

### C-08 — `/api/v1/stats` variable-keyset (from `ontology-manager` T-09b) is not addressed in the design's stats / connectivity-banner consumers

`STATUS.md` lines 148–157 document an upstream contract change from
`ontology-manager`'s T-09b: `/api/v1/stats` now returns a *variable*
keyset (six seed labels + any registry-added labels) instead of a
fixed six-key shape. Design §6.1 (`<ConnectivityBanner/>`) and §4.3
(SchemaBootstrap) read stats / schema but no code shown handles the
variable keyset.

For the connectivity banner this is benign (it shows the count, not
the keyset). For any view that renders per-label cards (FR-26 is
the only ironclad consumer; FR-01's domain index is similar) the
variable keyset matters. Design should add a one-line note in §6.1
that says "the banner reads `Object.values(stats.nodes).reduce(...)`
not per-key" so a future implementer doesn't bake in the seed-six
hard-coding. Same advice for any FR-26 inheritance code touching
shell stats.

Cites: STATUS.md lines 148–157; design.md §4.3 + §6.1.

### C-09 — Bundle composition table in §6.3 sums to ~205 KB but only budgets *new-this-spec* code, not the existing scaffold

§6.3 bundle table (lines 1481–1493) claims a combined ~205 KB gz.
But the scaffold *already* ships substantial code: existing
`pwa/src/components/{Card,Pill,SubNav,TopBar,Button,DomainCard,
GraphCanvas,JourneyCanvas,BoundList,DataTable,…}.tsx` plus
`App.module.css` + `_shared.module.css` + 25+ view stubs. The 80 KB
"App code (pwa/src/*)" line item appears to budget only the
new-this-spec code, not the cumulative.

Until tasks-phase wires the `bundle-check.mjs` script and lands a
first measurement in CI, the 205 KB projection is an unverified
guess. The 300 KB NFR-02 cap has headroom, but the 275 KB defensive
ceiling (N-05 fix, line 1514) is tight.

**Sharp edge**: pin a "first CI run baseline" measurement task in
tasks-phase, and gate the defensive 275 KB ceiling on observing 3
runs under 250 KB **including the existing scaffold code**, not just
the new code.

Cites: design.md lines 1481–1517.

### C-10 — AC-23 (TTI ≤ 2 s) doesn't pin CPU-throttling for CI vs the 2021 MacBook Air baseline

Requirements NFR-03 + AC-23 (requirements.md line 203) target "≤ 2 s
on a 2021 MacBook Air on a clean cache". Design §10 (line 1678)
references `pwa/playwright/lighthouse.spec.ts` (asserts
`audits["interactive"].numericValue < 2000`).

Two missing concretisations:

1. **Where does the lighthouse spec run?** CI's `ubuntu-latest` is
   not a 2021 MacBook Air. The TTI number will be unstable across
   environments. Design should specify either a fixed CPU-throttling
   multiplier (e.g. `--throttling.cpuSlowdownMultiplier=4` to
   simulate the M1 Air's perf budget vs CI's nominal x86 core) OR
   mark AC-23 as "local-machine manual-repro only" and not gate CI
   on it.
2. **`bun run -C pwa preview` vs `bun run -C pwa dev`** — the
   manual-repro line in requirements (line 203) uses `bun run -C pwa
   preview` (production build); design line 1678 says
   `bun run -C pwa preview + lighthouse run`. Pin the preview-build
   path so the lighthouse spec measures the gzipped + minified
   bundle, not the dev-mode un-bundled chunks.

Cites: design.md line 1678; requirements.md line 203.

### C-11 — AC-24 (60 fps canvas) wiring is "manual on macOS Chrome" — automation path is hand-waved

Design §10 AC-24 (line 1679) ships
`pwa/playwright/canvas-perf.spec.ts (uses Performance API; asserts
median frame time ≤16 ms over 5 s of pan)`. But the manual repro
(same line) says "DevTools Performance" — automation isn't
described.

Playwright can drive `performance.now()` ticks via `page.evaluate()`,
but synthesising a 5-second two-finger trackpad-pan in Playwright is
non-trivial (Playwright's `page.touchscreen.tap()` doesn't model
multi-touch gestures well). The test is likely to either fall back
to programmatic `setViewport({scrollX, scrollY})` calls — which
bypass react-flow's gesture handler entirely and measure a different
code path — OR be manual-only, contradicting the "automated"
framing.

Pin this either way in tasks-phase. Without it, AC-24 is unverifiable
and the 60 fps claim relies on react-flow's published perf budget,
not on this app's actual perf.

Cites: design.md line 1679.

## Nits

### N-01 — `routeStore.ts` interface says `query` but the live scaffold uses `params`

`design.md §3` interface `Route` lists `query?: Record<string,
string>` (line 213). `pwa/src/route.ts:107` ships `params:
Readonly<Record<string, string>>`. Same field, two names. The design
should switch to `params` (the scaffold is the ground truth) or
file a rename in T-08 (route.ts extension task).

Cites: design.md line 213; pwa/src/route.ts:107.

### N-02 — §1's "Decision 5" prose contradicts the Risks table — server-side 2 MB cap or no?

Line 55 reads (decision 5):

> The bulk-paste UI enforces a 500-line ceiling: banner above 400
> lines, hard stop at 500. … this design instead trusts that 500
> activity names × ~100 chars/name ≪ Bun's default body limit.

Risks table row at line 1832 then summarises "**Resolved** —
explicit 2 MB cap on the server; client-side 500-line UI ceiling".
The two statements contradict — §1 chose client-side-only; the Risks
row remembers an earlier draft's server-cap decision. Patch the
Risks row to match §1.

Cites: design.md lines 53–55, 1832.

### N-03 — §4.4's `VITE_SCHEMA_SOURCE` env-var has no configuration section

Line 456 mentions:

> `VITE_SCHEMA_SOURCE=static|runtime`, default `runtime`. A one-time
> startup console warning announces fallback so the operator sees it

The env-var defaulting is implementation-level; the design should
either (a) move this to a §6.x "configuration" subsection (which
doesn't currently exist — add one) or (b) drop the env var and
always-auto-fall-back. As is, the env var is documented mid-flow and
won't be discoverable.

Cites: design.md lines 456–462.

### N-04 — Slugify divergence (N-04 absorption) cross-spec coverage test name format is unanchored

The follow-up file name is given as
`pwa-ontology-slugify-coverage.test.ts` (line 1843, 1864) but the
target directory isn't pinned. Should it live in
`pwa/src/__tests__/` (vitest), `pwa/src/__tests__/integration/`
(integration), or root `pwa/scripts/`? Pin the path in tasks-phase.

Cites: design.md lines 40, 1843, 1864.

### N-05 — `proOptions={{hideAttribution: false}}` is the *default*

§4.6 ReactFlow snippet (line 584):

> `proOptions={{hideAttribution: false}}  // OSS license`

react-flow 11.x's default is `hideAttribution: false` — passing it
explicitly is harmless but redundant. Drop the line or add a comment
explaining why it's worth being explicit (e.g. "explicit to prevent
a future codemod from flipping it").

Cites: design.md line 584.

### N-06 — `prompt("Why?")` in `flagForReview` blocks the UI thread and is iOS-Safari-hostile

§4.11 line 1057:

```ts
reason: prompt("Why?") ?? "(no reason given)",
```

`window.prompt` is synchronous, blocks the JS thread, and renders as
a non-stylable native popup that interrupts iOS Safari's keyboard
focus. On macOS Chrome it shows an OS-level dialog. For an SME
workflow it's bottom-tier UX.

Replace with the existing `<Modal/>` (T-12, react-focus-lock) — same
component already used by NewJourney. Trivial fix, mention in
tasks-phase.

Cites: design.md lines 1052–1063.

### N-07 — §15's "Cross-spec touch points" claim "no coordination needed" with chat-interface but chat-interface is in parallel review

Bottom of design (lines 1916–1919):

> `chat-interface` future consumption: the search helper added by
> this spec is also usable by `chat-interface` for its citation
> lookups. No coordination needed beyond the amendment.

`chat-interface` is *also* currently in review (parallel work). If
chat-interface's design also wants the search endpoint, the spec's
T-31 amendment becomes a shared touch point. Cross-link is worth
adding to the `chat-interface` STATUS so we don't end up with two
specs each thinking they own T-31's spec wording.

Cites: design.md lines 1916–1919.

## AC → test path traceability (summary)

| AC | Test file | Verdict |
|----|-----------|---------|
| AC-01..14, 18, 21, 26, 27, 30 | jsdom unit tests in `pwa/src/__tests__/*.test.tsx` | OK |
| AC-15, 16, 19 | jsdom + integration RMW post-write read | OK — B-01 RMW tightening is correct |
| AC-09, 13, 20, 23, 24, 25, 29 | Playwright cross-browser specs in `pwa/playwright/*.spec.ts` | OK shape; see C-10 / C-11 for perf-budget gaps |
| AC-10 | jsdom + Playwright Safari spec | **C-07** brittle pixel-diff threshold |
| AC-17 | jsdom `out-of-domain-disable.test.tsx` | Test OK; **B-03** Settings writer missing in production |
| AC-22 | `pwa/scripts/bundle-check.mjs` | **C-09** baseline measurement not yet pinned |
| AC-28, 32 | `api/__tests__/search-helper.test.ts` | OK — already shipped + passing 6/6 |
| AC-31 | `pwa/src/__tests__/iphone-bulk-paste-hint.test.tsx` | OK (iPhone matchMedia mock) |

## FR → file traceability (summary)

All 28 FRs from requirements rev 3 have at least one file in §9's
matrix. The `FR-26` row (line 1637) is "inherited from graph-core
`<TopBar/>` — no change needed" — strictly correct, and STATUS's
"Incoming contract evolutions" (variable stats keyset) is not a
re-touch for this spec; consumers iterating `stats.nodes` should
already be `Object.keys()`-aware. **C-08** flags the design's
silence here as a sharp edge.

`FR-21` (line 1632) lists `prefStore.ts` + `useIsHomeDomain.ts` +
`cypher-queries.ts` but **no Settings writer** — see **B-03**.

`FR-11`'s row (line 1622) is split across `JourneyGraph.tsx` (stub
replace, the canvas) and `Graph.tsx` (surface-level, marked "may be
unused; tasks-phase confirms"). The design itself is uncertain about
Graph.tsx's role — pin in tasks-phase.

## Cross-spec contract realism

| Contract | Realism check |
|----------|---------------|
| **react-flow 11.x + dagrejs/dagre 1.x + html-to-image** | Locked; bundle composition plausible at ~205 KB gz pre-canvas-chunk. Real failure mode (Safari `foreignObject` regression) acknowledged via fallback to `dom-to-image-more`. **C-07** about pixel-diff test fragility. |
| **zustand 4.5 + 5 single-concern stores** | Sound. Each store boundary is clean; no cross-store mutation paths documented. Selector typing implicit but standard. |
| **Hand-rolled SW (`pwa/public/sw.js`)** | Three-cache shape (shell precache, schema 1-entry, reads ~5 MB LRU) realistic. Safari private-mode degradation contract pinned for AC-20. SW versioning via `pwa/package.json` version baked at build time — clean. |
| **ETag polling + SSE EventSource subscribe** | 3-strike-then-POLL-MODE state machine is sensible. **C-06** about synchronous-throw on EventSource constructor. The 5-min poll fallback uses `If-None-Match` — fine until `ontology-manager` actually emits ETag headers (flagged in §5.3 coordination notes). |
| **Per-platform gesture suppression** | §8 maps every Native Conflicts row to a code location (viewport meta mutation, `touchAction:none`, `overscroll-behavior-y:contain`, `keydown` capture, focus-lock). Comprehensive. The 20 px left-edge ignore-zone for back-gesture is the only acknowledged UX loss. |
| **`graph-core` amendment T-31 (already shipped)** | STATUS.md confirms 6 tests passing live (502 ms, 26 expect()). `search-helper.test.ts` covers AC-28 + AC-32. Endpoint `GET /api/v1/query/search?label&q&limit` verified working against running Neo4j. **No risk here.** |

## What's clean (load-bearing wins)

- **§0 absorption table** is honest and exhaustive — every previous finding gets a section pointer and a disposition.
- **§4.4 SSE→POLL-MODE state machine** is concrete enough to test; the `schema-subscription.test.tsx` is already shipped + green.
- **§4.6 react-flow pick** is well-justified against three alternatives + bundle budget.
- **§4.11 RMW story** is the right answer to the storage shape; AC-15/16/19 tightening with prior-block fixtures will catch regressions cleanly.
- **§8 native-conflict suppression table** maps every row to a code location — much more concrete than typical PWA gesture handling.
- **§10 AC matrix** lists test paths for all 32 ACs; only the perf-budget pair (C-10 / C-11) need concretisation.
- **graph-core amendment T-31 already shipped + verified live** per STATUS.md — biggest cross-spec risk is dissolved.

## Pass-2 entry conditions

To exit `revise` and reach `approve` in pass 2:

1. Resolve **B-01** with a requirements rev 4 + design §3 + AC table sweep on explorer route names.
2. Resolve **B-02** by pushing the `needs_review` predicate into Cypher in `reviewQueueForDomain` (and the symmetric fix in `quarterlyHomeJourneys` for overdue partitioning).
3. Resolve **B-03** by picking option (a), (b), or (c) for the home-domain writer UI.
4. Resolve **B-04** with a fresh grep against `api/src/storage/nodes.ts` and updated line citations.
5. Address ≤ 3 of the 11 concerns (the others can be carried to tasks-phase as open-accepted).
6. Nits can all flow to tasks-phase.

Estimate: 60–90 minutes of focused revision work.
