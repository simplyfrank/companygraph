---
feature: "navigation-ia"
reviewing: "requirements"
reviewing_revision: 1
reviewer: "spec-review-agent"
verdict: "revise"
review_pass: 1
reviewed_at: "2026-07-04"
---

# Review: navigation-ia / requirements (pass 1/2)

## Verdict

**revise** — the document is well-structured and most of its diagnosis of the
broken navigation is verified accurate against the codebase, but its central
sequencing premise is stale (the Model surface it claims to "reserve" is
already registered by an execution-complete spec), it silently drops four live
cto-analytics tabs, and two must-FRs (FR-09 resume, FR-12 alias target) are
unimplementable as written under the spec's own constraints.

## Blockers

- **B-01 — FR-01 / Motivation §4 / Dependencies are written against a stale
  codebase: the Model surface is already registered.** The spec says "The
  TopBar already has 9 surfaces", "`#/model` … is NOT registered here; a
  documented insertion point … reserves it for `model-workspace-core`", and
  "This spec must land before `model-workspace-core` executes". Reality:
  `model-workspace-core` is **execution:complete**
  (`.claude/specs/model-workspace-core/STATUS.md`), and `pwa/src/route.ts:107-118`
  already registers the `model` surface with all seven blueprint tabs
  (comment: "model-workspace-core T-17 … owns ALL seven blueprint View-Tree
  tabs VERBATIM"); `App.tsx:54` maps Alt+0 → index 9 and `views/index.tsx:155-163`
  registers all seven Model views. FR-01's "exactly seven surfaces" would
  **delete** `#/model/*` — a direct violation of the blueprint's frozen View
  Tree and of that spec's file ownership. Fix: rewrite FR-01 as *eight*
  surfaces including `model` verbatim (position decided explicitly), delete the
  "reserved insertion point" mechanism and the "must land before
  model-workspace-core" motivation, and restate the Downstream dependency as
  coordination with an already-landed surface.

- **B-02 — FR-04 drops four live analytics tabs; the FR-11 wildcard alias
  breaks them and FR-20/FR-21 then contradict FR-04.** The current `analytics`
  surface (`route.ts:51-66`) has `systems`, `consolidation`, `single-system`,
  `critical-paths` — cto-analytics BUILD tasks shipped + verified 2026-07-04
  (`.claude/specs/cto-analytics/STATUS.md`; tests
  `analytics-system-map.test.tsx`, `analytics-accent-ramp.test.tsx:61-68`
  explicitly assert `#/analytics/systems` resolves to the systems tab, not a
  fallback). FR-04's insights list (`overview, matrix, complexity, ai,
  context-alignment, finance, people, transform`) omits all four, so the
  `analytics/* → insights/*` alias maps them to unregistered tabs →
  `parseHash` silently falls back to `overview` (`route.ts:171-172`), and
  `AnalyticsSystems`/`AnalyticsConsolidation`/`AnalyticsSingleSystem`/
  `AnalyticsCriticalPaths` become orphans — failing the spec's own FR-20/FR-21
  guard. NFR-02 ("update tests to canonical routes") is unsatisfiable because
  no canonical target exists. Fix: add the four tabs to FR-04's insights list
  (or give each an explicit disposition + alias row), and re-verify the FR-11
  table row-by-row against the full `SURFACES` catalogue.

- **B-03 — FR-12/AC-17 assert a route resolution that `parseHash` cannot
  produce, and the frozen-route coordination is understated.** The alias
  target `insights/performance` is not in FR-04's tab list; per the fallback
  in `route.ts:164-173` an unknown tab resolves to the surface's first tab, so
  `#/exec/performance` would land on `#/insights/overview` **silently** —
  AC-17's "resolves to `#/insights/performance` … assert route resolution
  only" is unimplementable without a semantics change the requirements never
  specify. Additionally, the approved-and-authorized (blueprint Phase C,
  single-shot resumed) `kpi-okr-performance-dashboards` spec registers
  `performance` as an **exec tab** (blueprint View Tree: "`#/exec/performance`
  … NEW exec tab") — but FR-01 deletes the `exec` surface entirely, so that
  spec's registration site ceases to exist. Fix: (a) specify the mechanism —
  either register a `performance` placeholder tab under insights now, or
  require parseHash to pass through alias-produced unknown tabs to a NotFound
  view instead of first-tab fallback (state which, since it changes fallback
  behavior for *all* routes); (b) promote the "round-5 blueprint amendment"
  from a coordination note to an explicit precondition/dependency, since it
  retargets an already-approved spec's registration surface.

- **B-04 — FR-09 "resume" is unachievable under NFR-04 and the FR-10 API
  surface.** `AgentChat` (`pwa/src/views/chat/AgentChat.tsx:37-45`) takes no
  props, reads no hash params, and initializes `conversationId` to
  `undefined`; the API has **no** route to fetch a conversation's message
  history (`api/src/router.ts:446-449` — only `POST chat/messages` +
  progress; FR-10 adds only a *list* route). So opening
  `#/chat/thread?conversation=<id>` today changes nothing, and making the
  thread honor the param — let alone render prior messages — is an interior
  change to `AgentChat` that NFR-04's exception list ("new Conversations view,
  mode-dispatch for journeys, FlagForReviewButton") does not permit. Fix:
  either (a) spec resume properly — add `GET /api/v1/chat/conversations/:id`
  (or messages sub-resource) to FR-10, add AgentChat param-read + history
  render to NFR-04's exceptions, and add an AC that the resumed thread shows
  prior messages; or (b) honestly descope FR-09 to "link opens the thread
  pinned to the conversation for *future* messages" and still amend NFR-04 —
  but note that variant shows the user an empty thread, which is a UX trap
  worth rejecting.

## Concerns

- **C-01 — FR-11's journey-graph alias condition misses the dominant legacy
  link form.** The rule "`explorer/journey-graph → explorer/journeys`
  (+`graph` mode when an entityId is present)" keys on the path segment, but
  `ExplorerJourneyGraph` selects the journey via `route.params["journey"]`
  (`JourneyGraph.tsx:386`) — i.e. legacy links are
  `#/explorer/journey-graph?journey=<id>` with **no** entityId. Those would
  alias to `#/explorer/journeys?journey=<id>`, which `ExplorerJourney` ignores
  (it reads `entityId ?? params["id"]`, `Journey.tsx:30`) — rendering the
  picker and losing both graph mode and the selection. AC-03 only says such
  links "resolve", which is untestably vague. Recommend: the alias entry for
  `journey-graph` must translate `?journey=<id>` → `/:id/graph`
  (entityId + mode), and AC-03 should assert the resulting canonical hash.

- **C-02 — FR-03's "No view interior is rewritten" needs an adapter and a
  defined no-id graph mode.** Mode-dispatching `ExplorerJourneyGraph` at
  `#/explorer/journeys/:id/graph` requires remapping `entityId` →
  `params.journey` (dispatch-level prop adaptation is possible without
  touching the interior — say so explicitly, or allow a one-line interior
  change). Also unaddressed: `JourneyGraph` *without* a journey renders a
  multi-journey portfolio/board view distinct from `Journey`'s picker — where
  does that live post-merge (`#/explorer/journeys` with `?layout=multi`? a
  mode without an id, which `toHash` at `route.ts:193-195` cannot even emit)?
  Design will need this decided; requirements should at least name it.

- **C-03 — Mid-flight blueprint execution collisions beyond B-01/B-03.**
  (a) FR-16's index-derived shortcuts renumber Model to Alt+8, contradicting
  model-workspace-core's decided Alt+0 mapping (`App.tsx:52-54`, design §4.9)
  — fine to change, but say so and update that expectation explicitly.
  (b) `kpi-okr-governance` (execution:complete + verified) just tested
  `KpiManagement`/`OkrManagement` at `#/exec/*`; FR-05 relocates them to
  `#/govern/*` — NFR-02 covers test churn, but the blueprint amendment in
  FR-12 should also record these relocations, not just `performance`.
  (c) Wave-3/4 blueprint features not yet executed may carry route/test
  expectations against pre-restructure hashes; the Dependencies section should
  name the blueprint execution state as an upstream coordination risk instead
  of "Upstream: none blocking".

- **C-04 — FR-10 file/surface ownership overlap with chat-interface.** The
  conversations list route will live in `api/src/routes/chat.ts` (or a
  sibling), a chat-interface-owned surface; the out-of-scope section defers
  conversation *management* to "chat-interface backfill" while claiming the
  list route here. Record the ownership explicitly (this spec claims the
  read-only list route; chat-interface backfill owns everything else) so the
  one-feature-owns-a-file rule has a written answer.

- **C-05 — FR-15's mechanism assumption may not hold.** "entity name resolved
  from already-fetched view data" presumes the shell can read view-local fetch
  state; today views fetch privately via `useFetch` and the shell has no
  channel (cf. `ActiveModelProvider` — a context was needed for exactly this).
  Keep the requirement, but drop or soften the parenthetical so design is free
  to choose (context bus, title store, or a shell-level fetch) without
  violating requirements.

- **C-06 — FR-17's "entityId, if still valid" is undefined.** What makes a
  persisted entityId invalid (deleted entity? requires a fetch before
  navigation?), and what happens then (tab without id? first tab?) is
  unspecified, so AC-18 tests only the happy path. Recommend defining
  validity as "restore blindly; views already own their not-found states" —
  cheapest and consistent with NFR-04 — or specifying the check.

- **C-07 — UX-02 conformance has no real AC.** The UX allowance table cites
  "AC-15" for `scripts/design-conformance.ts` passing on touched views, but
  AC-15 is the Alt+N shortcut criterion. No acceptance criterion actually runs
  design-conformance. Add one (or correct the cross-reference to a new AC).

## Nits

- **N-01** — The "~4,000 lines" orphan claim checks out (3,992 across the ten
  named files; verified unimported — nice diagnostic accuracy). Consider
  citing the file list in the FR-20 row so the audit scope is closed-form.
- **N-02** — AC-06 asserts "relative time"; relative-time renders are
  clock-flaky in tests — spec a fixed-clock or injectable `now` for the
  Conversations view test.
- **N-03** — NFR-05 (<100ms for 1,000 conversations) has no verification
  mapping anywhere; either add it to AC-19's test or mark it
  measured-not-gated.
- **N-04** — The FR-11 row "`data/export → data/export` (unchanged)" is a
  no-op alias entry; drop it or mark the whole `data` surface as
  identity-mapped to keep the table meaningful for AC-16's exhaustive
  iteration.
- **N-05** — `DomainDetail.tsx` already embeds a `RollDownTab`
  (line 1362) overlapping the orphaned `RollDown` view's territory; worth a
  note in the FR-20 audit scope so design de-duplicates rather than wiring two
  roll-down UIs.

## Traceability check

| Check | Result |
|-------|--------|
| Every FR has ≥1 AC | pass — FR-01→AC-01, FR-02→AC-02/04/13, FR-03→AC-03, FR-04→AC-07, FR-05→AC-08, FR-06→AC-09, FR-07→AC-10, FR-08→AC-11, FR-09→AC-06, FR-10→AC-19, FR-11→AC-16 (+03/04/07/10/11), FR-12→AC-17, FR-13→AC-16, FR-14→AC-12/13, FR-15→AC-14, FR-16→AC-15, FR-17→AC-18, FR-18→AC-05, FR-19→AC-20, FR-20→AC-21, FR-21→AC-21 |
| Every AC traces to an FR and is testable | fail — AC-17 asserts behavior parseHash cannot produce (B-03); AC-03's "legacy links resolve" is outcome-unspecified (C-01); AC-06 "resume" behavior lacks an AC for the thread side (B-04); all others testable with named test files |
| Alias table covers all current routes | fail — analytics `systems`/`consolidation`/`single-system`/`critical-paths` unmapped-to-nothing (B-02); `#/model/*` unaccounted for (B-01); sme/api/exec/data/admin/ontology/chat/explorer otherwise fully covered |
| Routes/views match the blueprint View Tree verbatim | fail — deletes the registered `#/model` surface (B-01); retargets `#/exec/performance`'s registration surface (B-03) |
| UX-* allowances covered in ACs | partial — UX-01/04/05/06 covered; UX-02 cites the wrong AC and has no conformance AC (C-07) |
| Platforms & Input Modes + Native Conflicts tables present | pass — thorough, incl. macOS Option-digit and Firefox `/`/Cmd+K conflicts with suppression strategies |
| No file ownership conflict with another spec | fail — `route.ts`/`views/index.tsx` vs model-workspace-core (execution:complete, B-01); `api/src/routes/chat.ts` vs chat-interface (C-04) |
| Verified codebase claims | pass — dead `#/chat/conversations` (no view registered), unroutable `ProductDetail` (not in `EXPLORER_VIRTUAL_TABS`), placebo search/Filters (`App.tsx:106-113`), hardcoded crumbs (`App.tsx:99-102`), 10 orphan files (3,992 lines), `chat_conversations` table with `title`/`created_at`/`last_message_at`, no list route in router, `prefStore` exists |

## Summary

- The diagnosis is excellent: every named bug (dead chat tab, unroutable
  ProductDetail, placebo affordances, hardcoded crumbs, ten orphans) was
  verified true against the working tree, and the AC table is unusually
  complete — full FR↔AC coverage with named test files and honest
  platform/input-mode/native-conflict tables.
- The fatal flaw is staleness: the document argues from a pre-2026-07-04
  snapshot in which `model-workspace-core` had not executed and cto-analytics
  had not shipped its four report tabs. Both have landed; FR-01 and FR-04 as
  written would delete governed, tested, blueprint-frozen surface area.
- Fix order: rewrite FR-01/Motivation/Dependencies around the eight-surface
  reality (B-01), fold the four analytics tabs into FR-04/FR-11 (B-02),
  specify the unknown-tab/alias-target mechanism and make the blueprint
  round-5 amendment a precondition (B-03), and make FR-09/FR-10/NFR-04
  mutually consistent about what "resume" means (B-04).
- The alias-table idea itself (permanent, declarative, exhaustively tested,
  history-replace canonicalization) is sound and well-constrained — B-02/B-03
  are enumeration and mechanism gaps, not a wrong approach.
