---
feature: process-explorer-ui
reviewing: design
reviewer: spec-review-agent
verdict: revise
reviewed_at: 2026-05-23
pass: 1
---

# Review: process-explorer-ui design (Pass 1 of 2)

## Verdict

**revise** — 4 blockers, 9 concerns, 5 nits. The design is ambitious and
mostly cohesive (cross-spec consumption is correctly attributed,
amendment scope is tight, NFR-02 bundle budget is plausibly computed
at ~202 KB gz, all 30 + 1 ACs have file mappings and verification
paths, all 5 open-accepted req-pass-2 items are absorbed). However it
rests on **two factually-incorrect upstream claims** that, if shipped
as-is, will silently corrupt data on every SME write path
(`patchNode` and `upsertNode` REPLACE `attributes_json`, not merge),
plus a stale read of `graph-core/STATUS.md` (T-24..T-30 are NOT
deferred — they shipped 2026-05-23, exactly the date this design was
written). One additional blocker concerns a divergence between the
design's `#/sme/{add,review,quarterly}` routes and requirements'
`#/sme/{new-journey,review-queue,review-quarterly}` routes — the design
doesn't justify the rename and AC-25 explicitly references the
requirements route, breaking the AC. The fourth blocker is a one-line
NFR-07 expansion that the design quietly takes (6 new fulltext indexes
+ index DDL changes) but never AC's against `bun run schema:apply`
idempotency on second run.

The pass-2 carry-forwards (NC-01, OC-01..OC-05) are all addressed; the
amendment policy ("one new graph-core endpoint, no other extensions")
is honoured for the endpoint itself; the static-tuple fallback for
ontology-manager is sound and reversible.

## Open-accepted req-pass-2 carry-forwards — absorption check (all 5 absorbed)

| Code | Required disposition | Where absorbed | Verdict |
|------|----------------------|----------------|---------|
| **NC-01** | Clarify ETag/If-None-Match contract on `/api/v1/schema` | §1 row "NC-01"; §4.4 cache-lifecycle pseudocode; §5.3 "Open coordination notes" with three bullets (binding ETag, must-revalidate, retry hint) | absorbed |
| **OC-01** | Risks #3 historical residue | §1 row "OC-01"; notes residue is acknowledged + out-of-scope for design | absorbed |
| **OC-02** | Risks #8 `createdAt` tiebreaker now in FR-03 | §1 row "OC-02"; §1 decision (8) restates it; §12 risk #8 marked "Resolved — retire from Risks" | absorbed |
| **OC-03** | Platforms table edge cases (Pencil, macOS Safari back) | §7 (the entire section); two explicit rows added with reasoning | absorbed |
| **OC-04** | Missing AC for iPhone bulk-paste "open on desktop" hint | New AC-31 (§10); new file `BulkPasteMobileStub.tsx` (§11); new test `iphone-bulk-paste-hint.test.tsx` | absorbed |
| **OC-05** | Multi-tab divergence | §1 row "OC-05" — explicitly scope-out, no new code | absorbed (correctly as a no-op) |

## Blockers

### B-01 — Design's claim that `patchNode` and `upsertNode` JSON-merge `attributes` is wrong; every SME write path will clobber prior meta-attributes

§4.11 (FR-23 bulk sign-off, lines 930–935):

> graph-core's `/import` uses `MERGE` (upsert) on node `id`, so the
> existing journey is updated; the `attributes` JSON map is merged on
> the server side (per `graph-core/design.md §4.2` `upsertNode`
> semantics — the `attributes` map is JSON-patched, not replaced).

And §4.11 (FR-18 flag-for-review, lines 850–853):

> The patch body **only sets `attributes._review`**; graph-core's
> `patchNode` merges attributes (does not replace).

**Both claims are false.** Verified against `api/src/storage/nodes.ts`:

- `patchNode` (line 106–108): `n.attributes_json = $attrsJson` — assigns
  the whole serialised blob.
- `upsertNode` (line 152–153): `ON MATCH SET … n.attributes_json =
  $props.attributes_json` — same; replaces.

Cross-checked against `graph-core/design.md` §4.1/§4.2 (lines 336 and
367): the SET clauses are identical to the source — the attributes JSON
is replaced wholesale, not patched.

**Consequence:**

1. `FR-23` bulk sign-off via `/import` with `{nodes:[{id, label,
   attributes:{_verification:{...}}}]}` (design §4.11) will **delete
   any existing `_review` flag** on the same journey, because the
   incoming `attributes_json` becomes the entire stored value.
2. `FR-18` flag-for-review via `PATCH /api/v1/nodes/:label/:id` with
   `{attributes:{_review:{...}}}` will **wipe any user-registered
   attributes** (the ontology-manager-attached attributes per
   ontology-manager FR-04) and also wipe `_verification`. AC-15 line
   1332 asserts the wire shape matches `{attributes:{_review:...}}`
   only; nothing in AC-15 catches the clobber.
3. `FR-15` new-journey via `/import` with activity_stub nodes is
   greenfield (no prior attributes) so this is safe — but the
   subsequent `FR-20` "verify-journey" PATCH after the journey is
   created will wipe whatever the SME or ontology-manager wrote to
   `attributes` in between.

**Required fix (pick one):**

(a) **Server-side, change graph-core to JSON-merge attributes on PATCH
    and on `upsertNode`'s ON MATCH branch.** This is a graph-core
    amendment beyond the one allowed by NFR-07 of this spec (which
    explicitly says "one read-only search helper … any other backend
    need must go through a separate spec amendment"). So either escalate
    NFR-07 to allow this OR file a separate amendment row in
    `graph-core/tasks.md` AND add an AC verifying merge semantics.

(b) **Client-side, do read-modify-write.** Before every
    flag-for-review / verify-journey / bulk-signoff write, GET the
    current `attributes` blob, splice in `_review` / `_verification`,
    PATCH/import the merged value. This keeps NFR-07 honest but is
    racy (two SMEs flagging at the same time may overwrite each other).
    Document the race or add an optimistic ETag-style header (which is
    another graph-core extension).

(c) **Promote `_review` and `_verification` to first-class node
    properties on the graph-core nodeReadSchema.** This was already
    flagged + rejected in requirements-pass-1 B-05; reviving it would
    rewrite B-05's resolution.

(b) is the lowest-friction path. The design must pick AND surface the
chosen mechanism in §4.11 (FR-18, FR-20, FR-23 all write through this
codepath), AND extend AC-15 / AC-16 / AC-19 to assert that a node with
prior `attributes._review` retains it after a `_verification` write
(and vice versa). The current AC-15 only asserts the PATCH body shape,
not the post-write read; this is the verification gap that hides the
bug.

### B-02 — Design misrepresents graph-core's task state; the "deferred backlog" doesn't exist

§1 decision (9), §5.2 ("Coordination"), and §15 all assert that the
graph-core amendment can be filed "against the graph-core deferred
backlog (T-24 of graph-core/tasks.md)" and §5.2 line 1050 states:

> Coordination: file a one-line amendment against `graph-core/tasks.md`
> (it's at status `execution:foundation-complete; T-24..T-30 deferred`),
> slotted into the deferred backlog.

This contradicts `.claude/specs/graph-core/STATUS.md` line 2 which says
the current phase is `execution:test-packs-shipped (T-01..T-29 done;
T-30 manual smoke remains)`. T-24..T-29 are **already shipped** test
packs (T-24 bootstrap+health, T-25 nodes+edges+validation, T-26
import+dry-run+phase-errors, T-27 query+caps, T-28 OpenAPI+export,
T-29 .claude cleanup). T-30 is one end-to-end manual smoke task.

**Consequence:** there is no "deferred backlog" row in
`graph-core/tasks.md`. The proposed coordination mechanism is
unworkable as written. The design's PR will need to either:

(a) Add the search endpoint + 6 fulltext indexes as a NEW task (T-31)
    in `graph-core/tasks.md` with explicit FR/AC mapping back to
    graph-core's existing requirements OR escalate to a new requirements
    revision of graph-core ("FR-21: substring search helper"), OR
(b) Ship the amendment as inline changes in this spec's PR with
    explicit cross-spec amendment notes, bumping graph-core's revision
    counter when merged.

**Required fix:** rewrite §5.2 "Coordination" and §15 to reflect the
actual graph-core state, and pick one of (a) / (b) above. Mention this
in the "Cross-spec amendments required" entry of STATUS.md. Without
this, the tasks-phase author of process-explorer-ui will hit a wall
when looking for the deferred backlog row that doesn't exist.

### B-03 — Design routes (`#/sme/add`, `#/sme/review`, `#/sme/quarterly`) diverge from requirements (`#/sme/new-journey`, `#/sme/review-queue`, `#/sme/review-quarterly`) without justification; AC-25 references the requirements route

§3 lists the routes:

```
#/sme/add                                           (FR-15, FR-16)
#/sme/review                                        (FR-19)
#/sme/quarterly                                     (FR-22, FR-23)
```

But `requirements.md` (revision 2, approved) FR-15 line 122 says:

> route `#/sme/new-journey`

FR-19 line 126 says `#/sme/review-queue`. FR-22 line 129 says
`#/sme/review-quarterly`. AC-25 line 204 (approved requirements)
explicitly says `open #/sme/new-journey, Tab into the form, press
Escape — expect form closes` — meaning the AC test will fail against
the design's `#/sme/add` route.

The scaffold (`pwa/src/route.ts` line 41–44) does use `add`, `review`,
`quarterly`, so the design appears to be reconciling-to-scaffold
silently. Two problems:

1. **The design must declare the divergence and choose.** Either bump
   requirements to revision 3 with shorter route names AND patch AC-25
   to use `#/sme/add`, or extend `pwa/src/route.ts` SURFACES to use the
   requirements names (the scaffold is not contract; the requirements
   spec is).
2. **Verbatim FR-19 says `#/sme/review-queue`** which is functionally
   different from `#/sme/review` (the scaffold tab id, "review",
   suggests a singular review view; the requirements' "review-queue"
   suggests a list view of pending reviews — which is what FR-19 asks
   for). They mean the same thing semantically but a future grep for
   `review-queue` will turn up empty.

**Required fix:** pick a canonical name set, add a one-line note in §3
saying "the requirements-revision-2 names are renamed to match the
existing `pwa/src/route.ts` scaffold; a follow-on requirements
revision will sync them" (OR bump requirements now), and either
patch AC-25 in this design's §10 to use the design's name or commit to
the requirements name and patch the scaffold. The current state — AC
in requirements points at one route, design implements another —
breaks the AC-to-route traceability on contact.

### B-04 — graph-core amendment ships 6 new fulltext indexes via `api/src/db/schema.ts` but no such file exists; the schema bootstrap is at `api/src/neo4j/bootstrap.ts`. The amendment is also missing the idempotency AC for `bun run schema:apply` second-run

§5.2 (lines 1034–1043) directs the 6 `CREATE FULLTEXT INDEX … IF NOT
EXISTS` DDLs to a file path that does not exist:

```
**New indexes** added by `api/src/db/schema.ts` (idempotent):
```

§11 "Modified files" line 1463 doubles down: `api/src/db/schema.ts`.

Actual scaffold (verified via `ls`): `api/src/db/` does NOT exist. The
constraint + range-index bootstrap lives at `api/src/neo4j/bootstrap.ts`
(NOT `api/src/db/schema.ts`), which iterates `NODE_LABELS` and emits
the per-label `CREATE CONSTRAINT node_id_unique_<label>` and
`CREATE INDEX node_name_<label>` statements.

**Required fix:** patch every `api/src/db/schema.ts` reference in
§5.2, §11, §9 amendment table to `api/src/neo4j/bootstrap.ts`. The
6 fulltext indexes should be added inside the existing `applySchema`
loop (one extra statement per label after the existing range index).

**Compounding gap:** the amendment ships 6 new DDLs but no AC checks
that `bun run schema:apply` is still idempotent on second run (the
existing graph-core/AC-04 covered the original constraint set). Adding
fulltext indexes after the range index could re-create the same name
under a different shape if the syntax disagrees with `IF NOT EXISTS`
(unlikely, but Neo4j 5 versions differ on how `db.index.fulltext.queryNodes`
resolves indexes). Add an AC to this spec OR to graph-core's amendment
row: "second run of `bun run schema:apply` after the amendment makes
zero index-create attempts" (verifies via `SHOW INDEXES YIELD …`).

## Concerns

### C-01 — Scaffold reality check: `pwa/src/views/index.ts` is actually `index.tsx`; existing SME view file `Quarterly.tsx` is in the scaffold but design says "new"

§3 and §9 reference `pwa/src/views/index.ts` (line 183, 1454). The
scaffold has `pwa/src/views/index.tsx` (a `.tsx`, not `.ts`). Either
is renamed at edit time or the design's path is wrong; either way it
needs to be consistent.

Existing scaffold files (`Quarterly.tsx`, `Review.tsx`, `Add.tsx`,
`Domains.tsx`, `Journey.tsx`, `Path.tsx`, `Systems.tsx`, `Graph.tsx`)
are all already present but stubs. §9 marks `Quarterly.tsx` as `new`
(line 1294) — should be `modify` (replace stub). Same for `Review.tsx`
→ `ReviewQueue.tsx` (rename + replace); `Add.tsx` →
`NewJourneyForm.tsx` + `BulkPaste.tsx` (split); `Domains.tsx` →
`DomainIndex.tsx` (rename); `Journey.tsx` → `JourneyDetail.tsx`
(rename); `Graph.tsx` → `JourneyCanvas.tsx` (rename + extend);
`Systems.tsx` → `SystemDetail.tsx` (rename); `Path.tsx` →
`PathFinder.tsx` (rename).

**Fix:** in §9 and §11 audit every "new" entry, mark the renames as
"modify + rename" (or "replace"), and pin the existing stub paths so
the tasks-phase author isn't surprised by a same-name collision.

### C-02 — Schema cache fallback path is sound but the SSE failure mode "HTTP 404" is unrealistic

§4.4 (line 393–395):

> Failure modes handled:
> - SSE never opens (HTTP 404 — ontology-manager not yet deployed)
>   → schema cache stays static; 5-min poll-fallback kicks in.

A non-existent endpoint on a Bun server returns the route's 404
handler — but the `EventSource` constructor in the browser will throw
or fire an `error` event, NOT cleanly resolve to "5-min poll kicks
in". The implementation will rely on the EventSource `error` event +
a manual retry counter or backoff. The design says "fall back to 5-min
polling" but doesn't show the transition mechanism (the SSE never
"finishes" — it errors immediately and reconnects). Spell out:

- On `EventSource.onerror`, increment a connect-fail counter; after N
  failures (e.g. 3), close the EventSource and call `setInterval(poll,
  300_000)`.
- If poll succeeds where SSE failed, the next attempt to open
  EventSource happens on what schedule? Or never?
- AC-21 tests the success path (mock EventSource fires
  `ontology.changed`); add a test for the SSE-unavailable fallback
  path.

### C-03 — `<SchemaBootstrap/>` "ensures schema cache is hydrated before its children render" — but the fallback path also boots without ontology-manager. What does SchemaBootstrap render when /api/v1/schema returns 404?

§4.3 line 333: "while loading, shows the design-token `<Loading/>`
placeholder; on error, the `<ErrorState/>` placeholder."

But §4.4's fallback path says: "if `/api/v1/schema` returns 404 …
falls back to importing `NODE_LABELS` and `EDGE_TYPES` from
`@companygraph/shared/schema/{nodes,edges}` at boot". This means the
"error" branch of `<SchemaBootstrap/>` should NOT render the error
state when ontology-manager is not yet deployed — it should
transparently fall through. The two paths contradict: error state vs
fall-through.

Decision needed:

- (a) If `VITE_SCHEMA_SOURCE=runtime` AND `/api/v1/schema` 404s → log
  the console warning, populate `schemaStore.schema` from static
  tuples, mark `schemaStore.fetchedAt = Date.now()`, do NOT show
  `<ErrorState/>`.
- (b) If `VITE_SCHEMA_SOURCE=runtime` AND `/api/v1/schema` returns 5xx
  → show `<ErrorState/>` because that's a real server fault, not a
  not-yet-deployed scenario.

Currently §4.3 + §4.4 together imply both "error" and "fall-through"
which can't both be right. Tasks phase will hit this on day 1.

### C-04 — html-to-image bundle size and Safari `<foreignObject>` quirks are flagged in §12 but no AC catches a Safari export regression

§6.3 line 1185: "html-to-image | ~14 KB | PNG/SVG export (FR-13)".
§12 line 1496 ("NEW" risk): "html-to-image relies on `<foreignObject>`
which Safari renders inconsistently. PNG export via `dom-to-image-more`
is a fallback if Safari tests fail. Decision deferred to tasks-phase
test results."

AC-10 line 1327 only tests on macOS Safari (trackpad+kb) and asserts
"the rendered canvas matches the screen contents" — but doesn't pin
what "matches" means. If Safari renders text as blank rectangles
(known `<foreignObject>` issue with CSS variables), the manual repro
might still pass a casual inspection.

**Fix:** tighten AC-10 to assert one of: (a) the exported PNG contains
recognisable text via OCR / pixel-diff threshold; (b) the SVG opens
in Figma with `<text>` elements visible. OR move the html-to-image
risk acceptance to a real Safari-export-regression-test in
`pwa/playwright/canvas-export.safari.spec.ts` (the design lists
`canvas-export.test.tsx` only as jsdom-only blob-shape assertion).

### C-05 — Bulk paste "two round-trips" exception bypasses the FR-15 "single batched call" guideline; the spec needs to AC that this round-trip happens client-side, not in two browser requests visible to the user

§4.11 (FR-16, lines 781–788):

> Followed by the import call to add the new chain. **Two round-trips**
> in this flow (delete then import) — an exception to the "one POST"
> rule of FR-15. Documented because the alternative is a graph-core
> write-via-cypher endpoint that we're not adding. AC-13 covers both
> hops.

AC-13 (in requirements §10): `pwa/__tests__/bulk-paste.test.tsx +
manual on macOS Chrome: paste 4 names, expect 4 activities created;
re-paste same content reordered, expect activities reused (id stable)
+ PRECEDES rewired`. The AC does NOT explicitly assert "two requests"
vs "one request" — so the design's exception is invisible to the AC.

If a future implementer naively wraps the two calls in a try/catch
without atomic rollback, a re-paste that succeeds at delete and fails
at import will leave the journey with an empty PRECEDES chain (data
loss). Pin one of:

- (a) Spell out the rollback path: "if `/import` fails after the delete
  succeeded, the client re-issues the PRECEDES edges from the original
  ordering computed pre-delete". Add this to §4.11 + AC-13.
- (b) Accept the partial-state risk and document it in §12 Risks: "a
  re-paste that delete-succeeds + import-fails leaves the journey
  without ordering; operator must re-paste to recover".

Currently neither is in the design.

### C-06 — Cypher passthrough for activity multi-filter (FR-09) and review queue (FR-19) bypasses graph-core's typed query helpers; readability + maintainability risk

§4.9 (FR-09 activity multi-filter) uses:

```cypher
MATCH (a:Activity)
WHERE ($systemId IS NULL OR …)
  AND ($roleId   IS NULL OR …)
  AND ($locId    IS NULL OR …)
RETURN a.id AS id, a.name AS name
ORDER BY a.name ASC
LIMIT 1001
```

§4.11 (FR-19 review queue) and §4.11 (FR-20 role-name lookup) also
issue raw Cypher via `/api/v1/query/cypher`. Graph-core's design
explicitly favours typed query helpers (listDomains, getDomain, etc)
over raw Cypher. The cypher passthrough has a 1000-row cap (NFR-09)
and a 5 s timeout — fine, but four ad-hoc Cypher strings buried in
view code make the API surface unclear from outside.

This is not a B-grade blocker (the cypher passthrough is explicitly
designed for this), but worth two improvements:

- Move the four Cypher strings into a single module
  `pwa/src/data/cypher-queries.ts` so the surface is greppable.
- Add the queries' worst-case complexity to §12 Risks (a 1000-activity
  AND-filter cypher with three EXISTS sub-queries each scanning labels
  could hit the 5 s timeout on a 10k-node graph).

### C-07 — `useIsHomeDomain` hook fetches via `api.cypher` on every render; cache 5-min TTL but no shared key — N copies of the same query

§4.11 (FR-21, lines 880–891):

> // Walk PART_OF chain to find Domain.
> // Cached via reads.ts for 5 min.

If two side-by-side write buttons (`<FlagForReviewButton/>` and
`<VerifyJourneyButton/>`) both call `useIsHomeDomain(entity)` on the
same entity, `reads.ts` single-flight de-duplication (§4.2) handles
the concurrent request — but the cache key is the URL/Cypher
statement. Cypher passthrough requests have identical URLs but
different bodies; `reads.ts` keys by URL only. Two write buttons that
both call `useIsHomeDomain(entity)` will issue two separate POST
requests because the URL `/api/v1/query/cypher` is the same but the
body differs.

**Fix:** in §4.2 + §4.11 spell out that the de-dup key for cypher
passthrough requests is `URL + JSON.stringify(body)` or that
`useIsHomeDomain` uses a typed helper instead.

### C-08 — `findPath` returns `{rows: PathRow[]}` per graph-core's contract — but PathRow has shape `{length, nodes, edges}` (ids only), not `{node, edge, node, edge, …}` with names and labels. FR-10's render `"Activity → USES_SYSTEM → System"` requires a second lookup; the design doesn't say where

`pwa/src/api.ts` line 50 defines `PathRow` as `{length: number; nodes:
string[]; edges: string[]}` — these are id-arrays. FR-10's UI promise
("Renders each hop with the edge-type label inline (e.g. `Activity →
USES_SYSTEM → System`)") needs the node name + label and the edge
type. The id→label mapping comes from where?

**Fix:** add to §4.8 "after `api.findPath()` returns, fetch each node
by id in parallel via `api.cypher(`MATCH (n) WHERE n.id IN $ids
RETURN n.id, labels(n)[0] AS label, n.name`, {ids})` to hydrate the
path render". Otherwise the implementer will discover the gap on day
1 of T-10.

### C-09 — `?home_domain=:id` filter for review queue (`#/sme/review`, FR-19) uses `PART_OF*1..3` but Location → Domain may be > 3 hops; design caps depth at 3 without justification

§4.11 (FR-19, lines 808–824):

```cypher
MATCH (n)
WHERE n.attributes_json CONTAINS '"_review"'
  AND (
    $homeDomainId IS NULL
    OR EXISTS {
      MATCH (n)-[:PART_OF*1..3]->(:Domain {id: $homeDomainId})
    }
  )
```

The design comments: "`PART_OF*1..3` covers `Activity → UserJourney →
Domain` (depth 2) and `Location → Location → Location → … → Domain`
(deeper chains; v1 caps at 3)."

Locations can nest arbitrarily (per graph-core's `PART_OF`
Location→Location hierarchy — `shared/src/schema/edges.ts`). Capping
at depth 3 silently excludes deeply-nested locations from the review
queue. Either:

- (a) Bump the cap to `PART_OF*1..8` to match graph-core/NFR-09's
  `maxDepth` cap (acceptable since the per-query 5 s timeout bounds
  cost), OR
- (b) Add a Risks entry documenting the silent exclusion: "review
  queue may miss `Location` nodes more than 3 hops from a Domain;
  workaround: SME flags from the entity detail page directly".

The "v1 caps at 3" is undefended — the depth budget cost between 3
and 8 is microseconds on the small fixture, so why cap?

## Nits

### N-01 — Bundle table in §6.3 understates app-code

§6.3 line 1183: "App code (pwa/src/*) | ~80 | all views + components".

49 new files + 10 modified, plus 5 zustand stores + a search palette
+ typeahead + side panel + 6 entity detail views + canvas wrapper +
SME write paths is closer to ~120 KB un-gzipped, ~50–60 KB gz at
worst. The 80 KB estimate may be aggressive. Recommend documenting
the measurement methodology in `pwa/scripts/bundle-check.mjs` so
tasks-phase can verify against the budget early.

### N-02 — `EventSource` reconnection logic for SSE assumes server emits `retry: 5000`

§4.4 line 366: "we do NOT need to manually re-implement; the browser
respects the `retry:` hint emitted by the server (ontology-manager
FR-17 recommends 5 s)".

The ontology-manager design §5.4 shows the SSE handler enqueues
events without an explicit `retry:` line in the stream prelude. The
browser's default reconnect delay is 3 s but is implementation-
defined. If the design wants 5 s, ontology-manager must explicitly
emit `retry: 5000` on each connect. This is a cross-spec coordination
note worth surfacing in §5.3 alongside the ETag bullets.

### N-03 — `dagre` cited in §4.6 layout but not in §11 file list as a new dep

§4.6 line 510: "Layout: `dagre` (~10 KB gz) computes initial x/y for
top-to-bottom flow".

§11 modified `pwa/package.json` line 1457 lists "deps: react-flow,
dagre, zustand, html-to-image, react-focus-lock, uuidv7" — OK, dagre
is there.

But the bundle table in §6.3 line 1180 reads "react-flow + dagre |
~40 KB". The exact dagre version isn't pinned, and §4.6 says "10 KB
gz" but bundles into a "40 KB" combined line. The arithmetic checks
out (30 + 10) but the pinning is loose — tasks-phase should pick a
dagre major (current is `@dagrejs/dagre` 1.x vs the deprecated `dagre`
1.x). Pin the package name in §11.

### N-04 — `(FR-13) Filename embeds journey slug + ISO date` — slugify is locked to ontology-manager's slug function but ontology-manager hasn't shipped yet

§4.6 line 524–527: "slug function is identical to ontology-manager's
(lowercase, ascii, hyphenate non-word)".

Until ontology-manager ships, this spec re-implements slugify in
`pwa/src/lib/slugify.ts` (§11 line 1373). When ontology-manager
lands, the two implementations could diverge; a coverage test asserts
no divergence. Optional — but the design could note "follow-up
consolidation when ontology-manager lands".

### N-05 — §13 "Open-accepted carried for tasks phase" lists 6 items but two are stylistic (#5 bundle threshold tuning, #6 console-warning copy); both could land in this design instead

§13 lists 6 items deferred to tasks. Items 5 (bundle-check threshold
tuning) and 6 (schema-fallback warning copy) are pure text/value
decisions that the design could pin in 1-2 sentences each. Pinning
them here reduces tasks-phase ambiguity without growing scope.

## Cross-spec amendment policy — compliance check

The user prompt requires the per-spec amendment policy: "one new
graph-core endpoint, no other graph-core extensions."

- **Endpoint added**: `GET /api/v1/query/search?label=:L&q=:q&limit=:n`
  — single endpoint, read-only, well-specified (§5.2), AC-28 verifies.
  **Compliant.**
- **Indexes added**: 6 fulltext indexes — these are not endpoints but
  database schema additions. The design treats them as part of the
  same amendment. **Borderline.** The amendment policy is silent on
  index DDL changes — they don't extend the API surface but they do
  extend the schema bootstrap. **Recommendation:** explicitly list
  this in §5.2 as "scope of amendment: 1 endpoint + 6 indexes" so the
  graph-core reviewer can validate both.
- **Storage helper changes**: §4.11's reliance on `patchNode` /
  `upsertNode` attribute-merge semantics is currently broken (B-01).
  If the fix is server-side (option (a) of B-01), this becomes a
  second graph-core extension and breaches NFR-07. The design must
  pick the client-side (b) path to stay compliant.

**Verdict on amendment policy:** compliant IF B-01 is resolved
client-side. Otherwise non-compliant.

## NFR-02 bundle-budget feasibility

The bundle accounting in §6.3 sums to ~202 KB gz against the 300 KB
cap (NFR-02 + AC-22). Crosscheck:

| Module | Design claim | Realistic gz | Verdict |
|--------|--------------|--------------|---------|
| react + react-dom 18.3 | 45 KB | ~42 KB | OK |
| react-flow 11.x (core, no extras) | (combined with dagre) | ~30 KB | OK |
| dagre / @dagrejs/dagre | (combined) | ~10 KB | OK |
| html-to-image | 14 KB | ~15 KB | OK (close) |
| zustand 4.5+ | 3 KB | ~3 KB | OK |
| react-focus-lock | 3 KB (mentioned §8) | ~4 KB | OK |
| uuidv7 | 1 KB | ~1 KB | OK |
| App code | 80 KB | likely 70–110 KB given file count | tight |
| CSS tokens | 20 KB | ~20 KB | OK |
| **Total** | **~202** | **~195–230 KB** | well under 300 KB |

The headroom is ~70–105 KB even with app-code upper bound — comfortable.
**Verdict: bundle budget is plausibly hit; AC-22 enforces.**

### One pinch point

§6.3 "If `react-flow` brings us over budget unexpectedly … dynamic-
import of the canvas chunk so it loads only on
`#/explorer/journeys/:id/canvas` routes". The dynamic-import wrapper
is "preemptive" per the design. **Recommendation:** ship the dynamic
import from day 1 (T-11) regardless of budget headroom — first paint
on non-canvas routes (which is 8 of 9 explorer surfaces) is faster
and the headroom is preserved for emergencies. This is more of a
design preference than a blocker.

## FR → file mapping coverage (§9)

Verified all 28 FRs have entries in §9 OR are explicitly "covered by"
another FR's entry (FR-02 → FR-01 + parseHash; FR-12 → JourneyCanvas;
FR-26 → inherited from TopBar).

| FR | Mapped? | Notes |
|----|---------|-------|
| FR-01..FR-28 | all yes | |
| FR-23 | `pwa/src/views/sme/Quarterly.tsx` + `pwa/src/data/writes.ts` (modify) | the modify on `writes.ts` should also extend `pwa/src/api.ts` (to add `api.import` per §11 line 1456) |

**Verdict:** §9 coverage is complete; one minor cross-reference gap
between `api.ts` and `data/writes.ts` that's already covered in §11.

## AC → verification path coverage (§10)

All 30 ACs + the new AC-31 have a test path + manual-repro mapping
(§10). Cross-checked AC-01 through AC-31:

| AC | Test path | Manual mapping | Verdict |
|----|-----------|----------------|---------|
| AC-01..AC-19 | `pwa/src/__tests__/*.test.tsx` | inputs + outcomes restated from requirements | absorbed |
| AC-20..AC-30 | mix of vitest + playwright + bundle-check | tight | absorbed |
| AC-31 (NEW) | `pwa/src/__tests__/iphone-bulk-paste-hint.test.tsx` | "tap Copy, paste in Notes — expect canonical URL" | absorbed |

**Verdict:** §10 verification path mapping is complete. One concern
(C-04, html-to-image Safari export) flags that AC-10's "rendered
canvas matches the screen contents" is loose.

## Internal-consistency cross-check

| Claim A | Claim B | Verdict |
|---------|---------|---------|
| §1 dec (4) "Hard cap: ≤ 1 MB precache, ≤ 5 MB runtime cache" | §4.5 cache table says "~5 MB LRU" for reads cache + "1 entry" for schema cache + precache "n/a" | consistent |
| §1 dec (5) "2 MB cap in api/src/server.ts" | server is shipped at `api/src/server.ts` (verified); cap not currently set | gap — design implies an api-side change to add Bun's body-size limit which is NOT in the amendment scope; needs to be listed in §11 as a graph-core amendment OR moved to a client-side guard |
| §1 NC-01 absorption "If-None-Match … binding" | §5.3 "open coordination note" says ontology-manager doesn't explicitly say ETag is emitted | the absorption is on the client side (consumer sends If-None-Match); the upstream contract isn't binding because ontology-manager hasn't committed yet. This is OK as documented but the "binding" wording in §1 is a stretch |
| §6.1 "ConnectivityBanner" corrects App.tsx bug | App.tsx polls /healthz on `visibilitychange` only if `visible` (verified in scaffold line 47–49) | correct — App.tsx misses immediate `poll()` on visibility→visible (the current code only calls poll() inside the interval guard, not as an immediate trigger). Design's claim is accurate. |

## Architectural soundness — final check

| Check | Verdict |
|-------|---------|
| Extends existing scaffold (not greenfield) | yes; route.ts + App.tsx + views/index.tsx all extended |
| Honours per-spec amendment policy (1 endpoint, no other extensions) | yes IF B-01 resolves client-side |
| Static-tuple fallback sound + reversible (ontology-manager soft dep) | yes; gated by `VITE_SCHEMA_SOURCE` env flag with default `runtime` |
| No new auth code paths (NFR-08) | yes; §6.2 grep test specified |
| Bundle budget feasible | yes; ~202 KB gz < 300 KB |
| All FRs file-mapped | yes (§9) |
| All ACs verification-mapped | yes (§10) |
| All 5 open-accepted req-pass-2 items absorbed | yes (NC-01, OC-01..OC-05) |
| Native Conflicts table inherited + extended | yes (§7, §8) |
| Single new graph-core endpoint correctly scoped | yes (§5.2) |
| Cross-spec consistency (graph-core + ontology-manager) | mixed — see B-02 (stale graph-core status) + N-02 (SSE retry hint), otherwise consistent |
| Attribute write semantics correct | **NO — see B-01** |

## Finding counts

- **Blockers: 4** (B-01 attributes_json clobber, B-02 stale graph-core
  task state, B-03 SME route divergence vs requirements, B-04 wrong
  file path for index DDL + missing idempotency AC)
- **Concerns: 9** (C-01 scaffold-file rename audit, C-02 SSE→poll
  transition, C-03 SchemaBootstrap error vs fallback contradiction,
  C-04 html-to-image Safari regression AC, C-05 bulk-paste two-RT
  rollback, C-06 cypher passthrough greppability, C-07 useIsHomeDomain
  dedup, C-08 PathRow → label lookup, C-09 PART_OF*1..3 depth cap
  silent exclusion)
- **Nits: 5** (N-01 bundle table tightness, N-02 SSE retry hint,
  N-03 dagre package name pin, N-04 slugify divergence, N-05 §13
  items that could land in this design)

## Pass tracking

- This is **pass 1 of 2** for the design phase. One more design
  review is permitted before the gate closes.
- Pass-2 author should focus on:
  1. **B-01 attributes_json semantics** — pick read-modify-write
     (option b) and rewrite §4.11 FR-18/FR-20/FR-23 to spell out the
     GET-then-PATCH/import path. Tighten AC-15 / AC-16 / AC-19 to
     assert that prior `_review` survives a `_verification` write and
     vice versa.
  2. **B-02 graph-core state** — read graph-core's actual STATUS.md
     and rewrite §5.2 "Coordination" + §15 "Cross-spec touch points"
     to reflect T-24..T-29 shipped, T-30 manual smoke remaining.
     File the amendment as T-31 (a new row, not a backfill into a
     non-existent "deferred backlog").
  3. **B-03 SME routes** — decide canonical names and patch either
     requirements or design + AC-25 consistently.
  4. **B-04 file path** — change every `api/src/db/schema.ts`
     reference to `api/src/neo4j/bootstrap.ts` and add a
     `schema:apply` idempotency AC.
  5. **C-03 SchemaBootstrap behaviour on 404** — pin one of fall-
     through-silently or `<ErrorState/>`. Currently both are implied.

## Strengths

Worth carrying forward to pass 2:

1. **Cross-spec attribution is correct.** `/api/v1/schema` and
   `/api/v1/ontology/events` are attributed to ontology-manager, not
   invented in this spec. The fallback to compile-time tuples is
   sound and reversible via `VITE_SCHEMA_SOURCE`.
2. **Per-spec amendment policy is honoured for the endpoint itself.**
   One new `/api/v1/query/search`, fully specified with zod schema,
   error envelope, fulltext-index DDLs, and tied to AC-28. No
   sprawling secondary extensions.
3. **All 5 open-accepted req-pass-2 carry-forwards are absorbed**
   (NC-01 + OC-01..OC-05). NC-01 is folded into §4.4 + §5.3; OC-04
   spawned AC-31 + a new stub component.
4. **Bundle budget is plausibly computed and headroom is sufficient.**
   ~202 KB gz with explicit per-module breakdown vs the 300 KB
   ceiling. Dynamic-import fallback documented as preemptive.
5. **The scaffold-extension framing is honest.** The design doesn't
   pretend to be greenfield — it explicitly identifies the existing
   App.tsx polling bug, the missing visibility-change immediate-fetch
   path, the existing TopBar component, and the existing route.ts
   2-segment parser. The corrections are surgical.
6. **Native Conflicts implementation table (§8) is the strongest part
   of the document.** Every conflict row from requirements gets an
   explicit code path + file mapping. The intentional non-suppression
   of Cmd+F is the right call.
7. **AC density survived from requirements pass-2 review** — all 30
   ACs have specific test paths + manual repros with input mode +
   observable outcome. AC-31 (new) inherits the same density.
