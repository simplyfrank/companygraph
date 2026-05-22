---
feature: process-explorer-ui
reviewing: design
reviewer: spec-review-agent
verdict: approve
reviewed_at: 2026-05-23
pass: 2
hard_cap: reached
---

# Review: process-explorer-ui design (Pass 2 of 2 — HARD CAP)

## Verdict

**approve** — All 4 blockers and 9 concerns from pass 1 are
factually absorbed in revision 2. 5 nits absorbed. One partial
absorption surfaces (B-03 prose-bleed: AC-15 + AC-18 in
`requirements.md` rev-3 still embed the OLD route names
`/sme/review-queue` and `#/sme/review-quarterly` in their prose,
even though the frontmatter claims they were updated). This is
**downgraded to a carry-forward for the tasks phase** (one-line
sed during T-22 AC sweep would fix it) — NOT a blocker, because
(a) the design's §3 + §11 file map + §10 AC-25 are internally
consistent with the new names, (b) the design also explicitly
ships `requirements.md` rev-3 in §11's modified-files list with a
"B-03 fix" note, and (c) blocking on a one-string text fix when
the design itself is correct would waste the only remaining
review pass. The pass-1 strengths all carry forward unchanged.
No new blockers introduced; no strengths regressed.

The hard-cap rule applies: this is pass 2 of 2 for the design
phase. Even if open items remain, the gate closes. They surface
as carry-forwards in §"Open-accepted carried for tasks phase"
below.

## Absorption matrix — all 18 pass-1 findings

| Code | Verdict | Justification (design § or file:line evidence) |
|------|---------|------------------------------------------------|
| **B-01** attributes_json clobber | **absorbed** | §0 row B-01 + §4.11 lines 1005–1046 add the **client-side read-modify-write `mergeAttributes()` helper**; flag-for-review (§4.11 lines 1048–1074), verify-journey (§4.11 lines 1076–1104), and bulk sign-off (§4.11 lines 1149–1206) all route through it. AC-15 + AC-16 + AC-19 in §10 (lines 1670, 1671, 1674) tightened to assert prior `_review` survives a `_verification` write (and vice versa). Race window acknowledged in §12 line 1840. NFR-07 stays honoured (option (b) of pass-1 review picked, no graph-core write extension). |
| **B-02** stale graph-core task state | **absorbed** | §0 row B-02 + §5.2 lines 1344–1353 + §15 lines 1892–1900 rewrite the coordination story: graph-core is **`execution:complete` (T-01..T-30 shipped + verified 2026-05-23 per graph-core/STATUS.md)**; amendment files as **new T-31** (not into a non-existent deferred backlog). PR strategy spelled out (same-commit OR block-on-graph-core). Verified against `graph-core/STATUS.md:12` which confirms execution complete. |
| **B-03** SME route divergence | **partial (downgraded — see §"Carry-forwards")** | §0 row B-03 + §3 lines 170–172 + §3 lines 175–199 adopt the scaffold's shorter names (`#/sme/{add,review,quarterly}`) and §15 lines 1902–1906 commit to bumping requirements to revision 3. `requirements.md` IS now at rev 3 (frontmatter line 6) with the `revision_3_change` note (line 11) declaring the rename. AC-25 prose at line 205 IS updated to `#/sme/add`. **However**: AC-15 prose at line 195 still references `/sme/review-queue`, and AC-18 prose at line 198 still references `#/sme/review-quarterly`. Internal grep traceability is mildly broken (a future grep for the canonical route `#/sme/review` from AC-15 will miss the AC). The design itself uses the new names consistently; only the AC prose in requirements lags. **Carry forward to T-22 AC sweep**, do not block. |
| **B-04** wrong file path + missing idempotency AC | **absorbed** | §0 row B-04 + §5.2 lines 1310–1322 (DDL inside `applySchema()` in `api/src/neo4j/bootstrap.ts`) + §9 lines 1643–1650 (T-31 amendment table) + §11 line 1803 all use `api/src/neo4j/bootstrap.ts`. Zero references to the non-existent `api/src/db/schema.ts` remain (verified via grep of design.md). New AC-32 in §10 line 1687 covers schema:apply idempotency (second-run zero index-create attempts; `SHOW FULLTEXT INDEXES` count = 6 unchanged). I verified `api/src/neo4j/bootstrap.ts` exists and has the `applySchema()` loop iterating `NODE_LABELS` (lines 13–22 in the actual code) — the design's amendment plan slots in cleanly. |
| C-01 scaffold file rename audit | **absorbed** | §0 row C-01 + §9 lines 1598–1608 explicitly state the one-file-per-tab pattern and list which scaffold stubs are **replaced**, not new. §11 lines 1776–1788 file-list flags 8 stub replacements. Verified against actual scaffold (`ls pwa/src/views/explorer/` returns `Domains.tsx`, `Graph.tsx`, `Journey.tsx`, `JourneyGraph.tsx`, `Path.tsx`, `Systems.tsx`; `ls pwa/src/views/sme/` returns `Add.tsx`, `Quarterly.tsx`, `Review.tsx`) — the design's "8 stub replacements" claim matches the actual file count (Domains/Journey/Graph/Path/Systems = 5 in explorer; Add/Quarterly/Review = 3 in sme = 8). One minor note: `JourneyGraph.tsx` exists in the scaffold but isn't called out in §9 or §11 — likely subsumed by Journey.tsx's canvas mode, but a tasks-phase author may want to decide whether to delete it or fold it in. Carry-forward, not a blocker. |
| C-02 SSE→poll transition | **absorbed** | §0 row C-02 + §4.4 lines 422–451 spell out the 3-strike state machine (CONNECTED → ERR-COUNT 1..3 → close + setInterval poll + 30-min SSE retry). New test `schema-subscription.test.tsx` covers both paths per §10 AC-21 + the test file list at line 1750. |
| C-03 SchemaBootstrap 404 vs ErrorState | **absorbed** | §0 row C-03 + §4.3 lines 386–393 + §4.4 lines 467–475 split the failure modes: **404 = silent fall-through** to static tuples + console warning; **5xx / network = `<ErrorState/>` + Retry**. Implementation branches on `res.status`, not `!res.ok`. The component is listed in §11 line 1720 with the C-03 fix annotation. |
| C-04 html-to-image Safari export AC | **absorbed** | §0 row C-04 + §10 line 1665 tightens AC-10 with Playwright spec `pwa/playwright/canvas-export.safari.spec.ts` asserting (a) pixel-diff text legibility and (b) `<text>` elements present in SVG export. File listed in §11 line 1761. §12 line 1839 documents the html-to-image quirk + fallback. |
| C-05 bulk-paste rollback | **absorbed** | §0 row C-05 + §4.11 lines 926–960 add the pre-delete snapshot + try/catch rollback that re-issues original `PRECEDES` edge ids via `/import` (MERGE-on-id). New integration test `bulk-paste-rollback.integration.test.ts` listed in §11 line 1756 + §10 AC-13 line 1668. Residual risk (network failure mid-rollback) surfaced in §12 line 1841. |
| C-06 cypher passthrough greppability | **absorbed** | §0 row C-06 + new module `pwa/src/data/cypher-queries.ts` housed in §11 line 1709 holds all 4 raw Cypher strings (`activityFilterAnd` §4.9 line 770; `reviewQueueForDomain` §4.11 line 981; `verifyingRoleName` §4.11 line 1097; `homeDomainResolution` §4.11 line 1112; `quarterlyHomeJourneys` §4.11 line 1153 — actually 5 once `quarterlyHomeJourneys` is counted). Greppable surface achieved. |
| C-07 useIsHomeDomain dedup key | **absorbed** | §0 row C-07 + §4.2 (referenced in §0) + §4.11 lines 1120–1140 spell out the new `reads.cypherDedup()` variant keyed by `URL + sha256(JSON.stringify(body))` via Web Crypto. No extra dep added. |
| C-08 PathRow → label hydration | **absorbed** | §0 row C-08 + §4.8 lines 705–730 spell out the two-step hydration (`findPath` returns id-arrays; PathFinder issues one Cypher hydrate-nodes call + one Cypher hydrate-edges call). Verified against actual `pwa/src/api.ts:50` where `PathRow = {length, nodes: string[], edges: string[]}` — id-only. Total 3 calls per "Find path" click documented as acceptable. |
| C-09 PART_OF*1..3 depth cap | **absorbed** | §0 row C-09 + §4.11 line 987 (review queue) + §4.11 line 1113 (`homeDomainResolution`) BOTH bumped to `PART_OF*1..8`, matching graph-core/NFR-09's `maxDepth` ceiling. 5 s per-query timeout bounds cost. |
| N-01 bundle table tightness | **absorbed** | §0 row N-01 + §6.3 lines 1500–1518 add the per-chunk methodology, defensive 275 KB threshold (with `isFirstThreeRuns()` ramp), and per-chunk size logging in CI. |
| N-02 SSE `retry: 5000` | **absorbed** | §0 row N-02 + §5.3 lines 1376–1379 add the coordination ask to ontology-manager. |
| N-03 dagre package name pin | **absorbed** | §0 row N-03 + §4.6 line 604 + §6.3 line 1484 pin `@dagrejs/dagre` (1.x maintained fork) explicitly; legacy deprecated `dagre` NOT used. §11 line 1796 lists it in `pwa/package.json` deps. |
| N-04 slugify divergence | **absorbed** | §0 row N-04 + §13 item 4 + §12 line 1842 file the cross-spec coverage test as a tasks-phase follow-up gated on ontology-manager shipping. |
| N-05 §13 items 5+6 pinned | **absorbed** | §0 row N-05 + §6.3 line 1514 (defensive 275 KB threshold locked here) + §4.4 lines 461–464 (console warning copy locked here). §13 line 1867 explicitly notes items 5+6 are now pinned and removed from the list. |

## Cross-checks against actual code paths (factual verification of §0 claims)

I read each file the design now claims to touch, to validate the
absorption table isn't fiction:

| Claim | File checked | Result |
|-------|--------------|--------|
| `patchNode` REPLACES `attributes_json` (B-01 motivation) | `api/src/storage/nodes.ts:106-108` | **Confirmed** — `n.attributes_json = $attrsJson` is a wholesale SET. The design's RMW workaround is the right call. |
| `upsertNode` ON MATCH REPLACES `attributes_json` (B-01) | `api/src/storage/nodes.ts:153` | **Confirmed** — `n.attributes_json = $props.attributes_json` is a wholesale SET. Bulk sign-off RMW logic is necessary. |
| `applySchema()` lives at `api/src/neo4j/bootstrap.ts` (B-04) | `api/src/neo4j/bootstrap.ts:10-32` | **Confirmed** — the loop iterates `NODE_LABELS` and emits per-label CONSTRAINT + range INDEX with `IF NOT EXISTS`. Adding 6 fulltext-index DDLs inside this loop is mechanically straightforward. |
| `api/src/db/` does NOT exist (B-04) | `ls api/src/db` | **Confirmed** — no such directory. All design references correctly use `api/src/neo4j/bootstrap.ts`. |
| 8 scaffold stub files exist (C-01) | `ls pwa/src/views/{explorer,sme}/` | **Confirmed** — Domains.tsx, Graph.tsx, Journey.tsx, Path.tsx, Systems.tsx, Add.tsx, Quarterly.tsx, Review.tsx all present as scaffold stubs. **One minor**: `JourneyGraph.tsx` also exists in the scaffold and isn't called out in §9; likely subsumed by Journey.tsx canvas mode but worth a tasks-phase note. |
| Scaffold SME tab ids are `add/review/quarterly` (B-03) | `pwa/src/route.ts:39-44` | **Confirmed** — `id:"add"`, `id:"review"`, `id:"quarterly"`. Design's adoption of these names matches the scaffold. |
| `PathRow` shape is id-only (C-08) | `pwa/src/api.ts:50` | **Confirmed** — `PathRow = {length: number; nodes: string[]; edges: string[]}`. Hydration step is necessary. |
| graph-core is `execution:complete` (B-02) | `graph-core/STATUS.md:1-2` + line 12 | **Confirmed** — "Current Phase: **execution:complete** (all 30 tasks shipped; AC-15 verified 2026-05-23)" and Execution row "complete (T-01..T-29 shipped + T-30 smoke verified 2026-05-23)". Filing T-31 as a post-completion amendment is the correct mechanism. |
| Requirements is now at revision 3 (B-03) | `requirements.md:6` frontmatter | **Confirmed** — `revision: 3` + `revision_3_change` line 11 explicitly states the rename. |
| AC-25 prose updated to `#/sme/add` (B-03) | `requirements.md:205` | **Confirmed** — AC-25 line 205 says `open #/sme/add`. |
| AC-15 + AC-18 prose updated (B-03 — full absorption) | `requirements.md:195, 198` | **Partial** — AC-15 line 195 still embeds `fetch /sme/review-queue`; AC-18 line 198 still embeds `load #/sme/review-quarterly`. Stale prose under the new rev-3 frontmatter. See "Carry-forwards" below. |

## New findings introduced by revision 2

None of the 7 pass-1 strengths have regressed:

| Strength carried forward | Status in rev 2 |
|---------------------------|------------------|
| 1. Cross-spec attribution correct | unchanged — §5.3 still attributes ontology-manager endpoints |
| 2. Per-spec amendment policy honoured for the endpoint | strengthened — §5.2 line 1333 now lists "scope of the amendment" as 1 endpoint + 6 indexes + 1 zod schema + 1 OpenAPI registration + 1 integration test (5 touch points), making the boundary auditable |
| 3. All 5 open-accepted req-pass-2 items absorbed | unchanged — NC-01 / OC-01..OC-05 all still present in §1 |
| 4. Bundle budget plausibly computed | improved — §6.3 line 1491 splits main bundle (~150 KB) from canvas chunk (~55 KB), reflecting the dynamic-import-from-day-1 decision. Combined max ~205 KB gz vs 300 KB NFR-02 cap. |
| 5. Scaffold-extension framing is honest | strengthened — §9 lines 1598–1608 now explicitly identify scaffold stubs as "modify, replace stub" |
| 6. Native Conflicts implementation table strongest part | unchanged — §8 retained verbatim |
| 7. AC density survived | strengthened — AC-15 / AC-16 / AC-19 now carry post-write read assertions for the RMW path |

**Sole new minor observation (NOT a blocker):**

- §9 lists `pwa/src/views/explorer/Activities.tsx` as **new** (line 1615) and again `Roles.tsx` and `Locations.tsx` as **new** (lines 1617–1618). The scaffold does NOT have any of these as files (I verified `ls pwa/src/views/explorer/`). This is internally consistent — they are correctly marked "new". However, **the route dispatch in §3 lines 161–168 routes `#/explorer/activities` (no scaffold tab) AND `#/explorer/systems` (scaffold tab "systems")** under explorer; the design notes (line 196) that roles + locations are routed under the existing `journey` tab file "via the entity-id segment". This routing implication is subtle and a tasks-phase implementer may need clarification: does `Activities.tsx` mount inside `Journey.tsx`'s `renderView` branch, or directly via `renderView` in `index.tsx`? §4.10 + §3 suggest the latter (direct dispatch in `views/index.tsx`). Carry-forward for tasks-phase clarity; not a defect.

## Cross-spec amendment policy — re-check

Pass-1 framed the policy as: "one new endpoint, no other graph-core extensions." Revision 2 preserves this:

- **Endpoint added**: 1 (`GET /api/v1/query/search`).
- **Indexes added**: 6 (per-label fulltext on `name`). These are
  schema additions, not endpoint additions — explicitly listed
  in §5.2's "scope of the amendment" enumeration (line 1334)
  along with 1 zod schema + 1 OpenAPI registration + 1 test.
- **Write-path semantics**: NO graph-core write extension. The
  RMW path runs entirely client-side (option (b) of pass-1
  review). NFR-07 holds.

Compliant. The pass-1 concern about borderline compliance (B-01
fix-by-server-extension would have breached) is now resolved by
the client-side RMW choice.

## Open-accepted carried for tasks phase (per hard-cap rule)

These survive the cap close. Tasks-phase author must pin:

1. **B-03 prose-bleed in requirements rev-3** — AC-15 (line 195) embeds `fetch /sme/review-queue` and AC-18 (line 198) embeds `load #/sme/review-quarterly`. The frontmatter `revision_3_change` claims AC-25 was updated; AC-15 + AC-18 were missed. **Fix during T-22 AC sweep**: one-line sed each. Not blocking because the design itself uses the new names everywhere internally, and AC-25 (the one explicitly called out in pass-1 B-03) IS updated.

2. **`JourneyGraph.tsx` scaffold stub disposition** — exists in `pwa/src/views/explorer/` but not mentioned in §9 or §11. Likely subsumed by Journey.tsx canvas mode but a tasks-phase author should decide explicitly: delete, repurpose, or leave dormant.

3. **`Activities.tsx` / `Roles.tsx` / `Locations.tsx` dispatch location** — §3 routes them under `explorer` but they're "new" files (no scaffold stubs). Tasks-phase should clarify whether they mount via `renderView(route)` direct switch in `views/index.tsx` or are nested under another tab file. §4.10 implies direct dispatch but §3 line 196 hedges. One sentence in tasks.md suffices.

4. **§13 carry-forwards** from the original list (items 1–4 — uuidv7 package choice, react-focus-lock vs hand-rolled, dagre nodesep/ranksep tuning, slugify cross-spec coverage test) remain. Items 5 + 6 are now pinned in the design (N-05 fix); the design correctly notes their removal.

## Finding counts

- **Blockers: 0**
- **Concerns absorbed cleanly: 13** (all pass-1 concerns)
- **Concerns absorbed partially: 1** (B-03 — design fully resolved, but requirements rev-3 has prose-bleed in AC-15 + AC-18)
- **Concerns regressed: 0**
- **New blockers introduced by revision 2: 0**
- **New carry-forwards for tasks phase: 3** (B-03 prose-bleed, JourneyGraph.tsx disposition, new-files dispatch location) — none rise to blocker, all are one-line tasks-phase fixes

## Pass tracking

- This is **pass 2 of 2** for the design phase. **HARD CAP REACHED** — the design review gate closes after this pass.
- Verdict: `approve`. STATUS.md may advance the Design Review row to `approve (pass 2/2 — 0B, 1 partial absorption surfaced as carry-forward, 0 regressed)` and proceed to the tasks phase.
- Tasks-phase author should:
  1. Sweep AC-15 + AC-18 prose in `requirements.md` rev-3 to replace `/sme/review-queue` → `/sme/review` and `#/sme/review-quarterly` → `#/sme/quarterly` (one line each). Bump to rev-3.1 or fold into rev-4.
  2. Decide `JourneyGraph.tsx` disposition (delete vs repurpose vs leave).
  3. Pin the dispatch surface for Activities.tsx / Roles.tsx / Locations.tsx in one sentence (likely: `views/index.tsx` `renderView` direct switch under `explorer` surface).
  4. Honour the 4 pinned §13 carry-forwards.

## Strengths preserved

All 7 strengths from pass 1 carry forward unchanged or strengthened:

1. Cross-spec attribution correct.
2. Per-spec amendment policy honoured (1 endpoint, 6 indexes, no write-path extension).
3. All 5 open-accepted req-pass-2 items absorbed (NC-01, OC-01..OC-05).
4. Bundle budget plausibly computed — now with explicit dynamic-import-from-day-1 strategy and per-chunk breakdown.
5. Scaffold-extension framing is honest, now with explicit "modify, replace stub" annotations.
6. Native Conflicts implementation table remains the strongest part.
7. AC density preserved + improved — RMW assertions added to AC-15/16/19.
