---
feature: "cto-analytics"
reviewing: "design"
reviewing_revision: 2
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-04"
history:
  - pass: 1
    revision_reviewed: 1
    verdict: "revise"
  - pass: 2
    revision_reviewed: 2
    verdict: "approve"
---

# Review: cto-analytics / design (pass 1/2)

> Pass-1 content preserved verbatim below; the pass-2 re-review (final for
> the autonomous loop) follows under "Review: pass 2/2".

Reviewed as an **as-built reconciliation**, not a greenfield design: every
as-built claim in §3/§5/§7/§8 was checked against the working tree, and the
artifact was judged on its own three rules (record don't invent; state
divergence; keep unbuilt scope open). The companion `tasks.md` (draft, rev 1)
was read for coverage/implementability. The 6 Open Questions are treated as
honestly-surfaced user decisions, not defects.

**As-built claims verified true** (spot-checked, all accurate):

- `GET /api/v1/analytics/graph` mounted at `api/src/router.ts:760` →
  `api/src/routes/analytics.ts` (uses `ok()` from `_helpers`) →
  `api/src/ontology/analytics/graph.ts` with graphology
  (betweenness/pagerank/Louvain/SCC imports at lines 9–14) and **direct
  `getDriver()`** at lines 15/76–77 — OQ-1's premise is real.
- `Matrix.tsx`: `api.cypher()` + `LIMIT 1001` (lines 18–22), `color-mix(in
  oklch, var(--accent) …)` shading (line 91), **no** explorer deep-links —
  matches the FR-02 "built (variant)" row exactly.
- `Complexity.tsx`: proxy `score = r.activities + r.fanOut + r.fanIn`
  (lines 45, 89), self-labelled "Quick complexity proxy" (line 62), hardcoded
  hexes `#22c55e/#3b82f6/#f59e0b/#ef4444` (lines 50–53) — DD-04/DD-08
  divergence note accurate.
- `Ai.tsx`: hardcoded `SAMPLES`, "Claude-generated proposals … static
  preview" lede (line 29), non-functional Accept button (line 51), `GreyBlock
  label="Live recommendations — wired by cto-analytics"` (line 59) — the
  FR-07 placeholder claim and the scope-drift observation are accurate.
- `pwa/src/route.ts:51–57`: surface `analytics`, kbd "5", tabs
  `overview|matrix|complexity|ai` — DD-05 accurate.
- `api/src/analytics/` does **not** exist; none of the 8 FR-09 report paths,
  `/analytics/settings`, or `/analytics/snapshot/*` exist anywhere in
  `api/src/` — §5.2 accurate.
- `api/__tests__/no-auth-grep.test.ts` deleted;
  `pwa/src/__tests__/no-auth-grep.test.ts` still present and asserts the
  retired invariant (currently green — auth lives server-side, so it is
  stale-but-passing, exactly "stale" as claimed).
- `api/src/routes/snapshot.ts:76–79`: SHA-256 over plain
  `JSON.stringify(snapshot, Object.keys(snapshot).sort())` — correctly
  distinguished from the NFR-05 8-rule protocol; the FR-11a route-collision
  hazard (bare `/api/v1/snapshot`) is real and well caught.
- `api/src/server.ts:52–53`: node-cron schedules only the ontology
  audit-retention job; no PDF library in `api/package.json` — FR-10/FR-08
  "not built" accurate.
- All four §8.1 test files exist; the AC-named test files do not.
- `_baseline` cross-references check out: requirements FR-14 (line 68),
  AC-13 (line 111), design DD-02/DD-05/DD-07 (lines 40/43/45), delete row for
  the no-auth test (line 95), tasks T-13 (line 73).
- §2's three carried items match `review-requirements-pass-2.md` Open-1/2/3
  verbatim; AC-02's stale `?system=:id&domain=:id` recipe confirmed at
  requirements line 160.
- Validation-checkpoint tooling exists: `scripts/spec/spec-traceability.sh`,
  `bun run typecheck` (root `package.json:16`),
  `scripts/design-conformance.ts --view`.

## Verdict

**revise** — one blocker: the reconciliation's FR-07 evidence row and OQ-4
omit an as-built, rule-based AI-candidate implementation and a conflicting
attribute vocabulary that already ship in this repo, so the user would answer
OQ-4 (and T-13 would set its defaults) on materially incomplete facts. The
fix is small and well within the re-review budget.

## Blockers

- **B-01 — §3 FR-07 / OQ-4: the as-built AI-candidate vocabulary is missing
  from the record.** The FR-07 row's as-built evidence lists only the
  `Ai.tsx` placeholder, and OQ-4 frames the decision as "FR-07 rule-based vs
  shipped Claude-framing". But the repo already contains a third, directly
  relevant as-built surface the design's own method (cf. the adjacent-partial
  citations for FR-01, FR-06, FR-08) requires it to record:
  `api/src/chat/tools/ai-candidates.ts` (chat-interface FR-T12) — a live,
  **rule-based** ranking of Activities by `leverage_score` reading
  `repetition` / `data_richness` / `runs_per_week` from `attributes_json` via
  `runPassthrough` — and `shared/seed/retail-mini-enriched.json`, whose
  Activities carry `repetition: "low"|"med"|"high"` and `data_richness:
  "med"|"high"` (e.g. lines 17–22). This contradicts FR-07's defaults
  (`repetitive_key: "repetitive"`, boolean `true`; `data_richness` enum
  `"low"|"medium"|"high"` per the Dependencies table): on the as-built seed
  the FR-07 default filter matches **zero** rows, AC-07(a)'s "seed
  activities" fixture assumption is wrong, the FR-07 empty-state copy names
  an attribute (`repetitive`) the as-built data vocabulary does not use, and
  an FR-07-as-written T-13 would ship an analytics ai-candidates report that
  disagrees with the chat surface's `ai_candidates` tool about what an AI
  candidate is. **Fix**: (a) add the chat tool + enriched-seed vocabulary to
  the FR-07 evidence row as adjacent partials; (b) extend OQ-4 (or add an
  OQ-4a) so the user decides the canonical attribute vocabulary
  (`repetition`/`leverage_score` as built vs `repetitive`/`data_richness` as
  specified) and the analytics↔chat consistency requirement; (c) note the
  consequence on T-13's default `analytics_ai_candidate_definition` and on
  the AC-07(a) fixture.

## Concerns

- **C-01 — AC-01's verification recipe references artifacts that don't
  exist, and the design didn't pin it (§2's job).** AC-01 asserts the 5-stop
  ramp `[--accent-100 … --accent-900]` "defined in `pwa/src/theme.ts`".
  There is no `pwa/src/theme.ts`; the token home is
  `pwa/src/styles/companygraph/tokens.css` (per `_baseline` DD-05 and
  `scripts/design-conformance.ts:40`), which today defines only `--accent`
  and `--accent-soft` — no ramp stops. The design pinned the same class of
  defect for AC-02 (§2 Open-3) and tasks even corrected the
  `pwa/__tests__/` → `pwa/src/__tests__/` path in T-07, so recipe-vs-reality
  pinning was in scope; this one was missed. **Recommend**: add a §2 pin —
  AC-01's ramp lives as five new custom properties in
  `pwa/src/styles/companygraph/tokens.css` (no `theme.ts`), created by T-07;
  note it in T-07's Implements/Verification.
- **C-02 — OQ-1's option list omits the established server-side pattern.**
  `api/src/neo4j/read-only-session.ts` exports `runPassthrough` (read-only
  tx, 1001-row mid-stream cap, 5 s timeout) and it is the house pattern for
  server-side reads — 10+ chat tools use it. It is the natural
  NFR-02-conformant middle path for new `api/src/analytics/` code (same
  guarantees as `POST /api/v1/query/cypher` without a self-HTTP hop), but
  OQ-1 offers only "amend NFR-02 / refactor through the query service /
  scope-limit the grep". **Recommend**: add it as option (d) or fold into
  (b) with the file cited, so the user sees the cheapest compliant path.
- **C-03 — T-14 closes AC-10 prematurely.** AC-10 reads "**All** analytics
  endpoints under `/api/v1/analytics/*`; envelope follows graph-core/NFR-05",
  which includes `GET/PATCH /settings` (T-16) and `GET /snapshot/:last_run_at`
  (T-18) — both land after T-14. An envelope test written at T-14 cannot
  cover them. **Recommend**: mark T-14 as *advancing* AC-10 and finally close
  it at T-18 (or have T-16/T-18 extend `analytics-envelope.test.ts` as part
  of their DoD).
- **C-04 — Native Conflicts suppressions acknowledged in §6 but unowned in
  tasks.** §6 correctly reports none exist as-built and says they "belong to
  the pending tasks that build the surfaces needing them", but only T-10
  names its suppression (long-press popover). T-07 does not mention
  `touch-action: none` + the route-scoped viewport meta + double-tap
  fit-to-view (FR-01/AC-01 platforms include iPad touch); T-08 does not
  mention the left-edge back-gesture guard or `overscroll-behavior-y:
  contain`; T-13/T-17 do not mention the iOS share-sheet download flow for
  CSV/PDF. **Recommend**: name each suppression in the owning task's
  Implements line so the requirements' Native Conflicts table can't silently
  drop at execution.
- **C-05 — Task file-count overruns.** T-14 lists "Files (3)" but bundles
  three guard-test files under one entry plus `routes.ts` + `router.ts` — 5
  files; T-07 similarly counts `route.ts` + `views/index.tsx` as one entry (4
  files). The tasks checklist caps a task at 3 files. **Recommend**: split
  T-14's guard tests into a follow-on task (or make them the explicit
  verification artifacts they are), and list T-07's registration files
  individually.

## Nits

- **N-01** — §4's "Deliberately NOT decided" list includes "scheduler cron
  default + TZ handling", but FR-10 already pins the default (`0 2 * * *`,
  operator `TZ`) and T-15 uses it. Only TZ edge-handling is genuinely open;
  the list entry overstates the openness.
- **N-02** — DD-08's note says Matrix shading "honours FR-01's 'shades of
  the single project accent' intent"; the accent-ramp language belongs to
  FR-01 (system map) while the surface is FR-02's. Cite it as the project's
  accent rule rather than FR-01.
- **N-03** — §8.1 says "consistent with `_baseline` design §5 ('exec/analytics
  views have no automated coverage')" two lines below a table listing two
  existing Overview error-scenario tests. The design's inventory is the
  correct one; add a parenthetical that the baseline's blanket claim is
  slightly stale.

## Traceability check

| Check | Result |
|-------|--------|
| Every FR reaches design file-changes / a task | **pass** — all 12 FRs in §3 map + §7; see table below |
| Every AC is closed by a task with Verification | **pass with notes** — all 18 ACs in the §8.2 ledger with owner tasks; AC-10 sequencing issue (C-03) |
| Routes/views match the blueprint View Tree verbatim | n/a — no `blueprint.md`; as-built routes verified against `pwa/src/route.ts:51–57` and `pwa/src/views/index.tsx` (DD-05 accurate); rename question honestly routed to OQ-3 |
| UX allowances / Platforms & Input-Modes covered | **partial** — §6 records the gap; suppressions unowned in tasks (C-04) |
| Cross-cutting decisions honoured (`_baseline` DD-02/DD-05/DD-07, CLAUDE.md) | **pass** — auth gate confirmed (`api/src/router.ts:313–346`); token-rule violation in Complexity/Ai correctly flagged rather than laundered (OQ-5) |
| No file ownership conflict with another spec | **pass** — KPI/OKR/SLA/exec surfaces correctly excluded (§9); `snapshot` route collision pre-empted (FR-11a row, T-18); chat's `ai-candidates.ts` overlap missed (B-01) |

Full FR/AC map (design element → closing task):

| FR | Design | AC | Closing task | Note |
|----|--------|----|--------------|------|
| FR-01 | §3 not-built + §7.2 | AC-01 | T-07 | recipe defect (C-01) |
| FR-02 | DD-01/DD-08, §3 variant | AC-02 | T-02 ratify + T-08 close | param names pinned (§2 Open-3) |
| FR-03 | §3 not-built | AC-03 | T-09 | |
| FR-04 | DD-01/DD-03/DD-04 variant | AC-04 | T-03 ratify + T-10 close | gated OQ-2 |
| FR-05 | §3 not-built | AC-05 | T-11 | |
| FR-06 | §3 not-built (SCC adjacency noted) | AC-06 | T-12 | wall-clock fixture pinned (§2 Open-1) |
| FR-07 | §3 placeholder | AC-07, AC-15 | T-04 ratify + T-13 close | **B-01** |
| FR-08 | §3 not-built (snapshot.ts distinguished) | AC-08, AC-09 | T-17 | gated OQ-6 |
| FR-09 | DD-01/DD-02 partial, §5 | AC-10, AC-11, AC-12 | T-05 ratify + T-14 close | AC-10 sequencing (C-03) |
| FR-10 | §3 not-built, DD-03 | AC-13, AC-16 | T-15 | |
| FR-11 | §3 not-built | AC-17 | T-16 | |
| FR-11a | §3 not-built + collision note | AC-18 | T-18 | |
| NFR-06 | DD-07 superseded | AC-14 | T-06 closed-as-superseded | legitimate per `_baseline` DD-07 + CLAUDE.md |

## Summary

- This is a high-quality reconciliation: every as-built claim I checked —
  routes, line numbers, the proxy formula, the placeholder framing, the
  driver use, the deleted/stale tests, the missing endpoints, the baseline
  cross-references — is accurate, and divergences are named rather than
  laundered. §9's rejected alternatives and the FR-11a collision catch are
  exemplary.
- The one blocker is an omission of the same kind the design handles well
  elsewhere: an adjacent as-built AI-candidate surface (chat tool + enriched
  seed) whose `repetition`/`leverage_score` vocabulary contradicts FR-07's
  defaults — OQ-4 must present it before the user decides.
- The concerns cluster around execution-readiness of the pending tasks:
  pin AC-01's recipe to reality, give OQ-1 the `runPassthrough` option,
  fix AC-10's closing task, and give the Native Conflicts suppressions
  owners.
- Fix B-01 first (it changes an OQ the user is about to answer); C-01/C-02
  are one-paragraph edits in §2/§10; C-03/C-04/C-05 are tasks.md edits.

---

# Review: pass 2/2 — re-review of revision 2 (FINAL for the autonomous loop)

Reviewed `design.md` revision 2 (status "revised") + companion `tasks.md`
revision 2 against the pass-1 findings and against the working tree. Every
"Resolves:" change site named in §1a was located and its factual content
re-verified in code. Per the review cap (1 review + 1 re-review), this
verdict is final for the autonomous loop; remaining concerns carry to the
user alongside OQ-1..OQ-6 + OQ-4a.

## Verdict

**approve** — zero blockers. All 9 pass-1 findings are genuinely resolved,
not just tagged; every new factual claim revision 2 introduces (chat-tool
behaviour, seed vocabulary, token inventory, `runPassthrough` guarantees)
checks out against code. One new concern (C-06) and one new nit (N-04) are
recorded for the user; under the reconciliation's verdict rules neither is a
factual as-built contradiction or a dropped FR/AC.

## Pass-1 findings — resolution audit

| Finding | Status | Verified how |
|---------|--------|--------------|
| ~~B-01~~ | **→ resolved** | §3 FR-07 row now records `api/src/chat/tools/ai-candidates.ts` + `shared/seed/retail-mini-enriched.json` as adjacent partials, with the vocabulary contradiction spelled out; OQ-4 reframed (three surfaces), new OQ-4a carries the vocabulary decision with three costed options; T-13 gates its defaults + the AC-07(a) fixture on OQ-4/OQ-4a. Code check: the tool filters TS-side on `leverage_score >= min_leverage` (zod default `0.5`, `ai-candidates.ts:19,74`) after one Cypher pass via `runPassthrough`, sorts DESC, and returns `repetition`/`data_richness`/`runs_per_week` — exactly as §3 states. Seed check: 32 Activities; `repetition` = 24×"high"/5×"med"/3×"low", `data_richness` = 7×"high"/17×"med"/8×"low" (so the design's `"low"\|"med"\|"high"` for both is right), `leverage_score` ∈ [0.15, 0.83], 32× `runs_per_week`; `retail-mini.json` contains **zero** occurrences of `repetition`/`repetitive`/`data_richness`/`leverage_score`. The "FR-07 default filter matches zero rows as-built" claim is therefore correct (no `repetitive` key, and richness `"high"` vs FR-07's spelling aside, the `repetitive==true` conjunct can never match). Requirements cross-check: defaults at requirements line 106, `"medium"` spelling at line 217 — the contradiction is real and now fully on the record. |
| ~~C-01~~ | **→ resolved** | §2 Pin-4 added; T-21 creates the five `--accent-100/-300/-500/-700/-900` stops in `pwa/src/styles/companygraph/tokens.css`, T-07's test asserts against them. Code check: `pwa/src/theme.ts` does not exist; `tokens.css` accent family is exactly `--accent`/`--accent-soft`/`--on-accent` (lines 20, 21, 30) with no `--accent-*` ramp stop anywhere in `pwa/src/`. Pin-4's facts are exact. |
| ~~C-02~~ | **→ resolved** | OQ-1 option (d) added citing `api/src/neo4j/read-only-session.ts`. Code check: `ROW_CAP = 1000` with mid-stream `result_truncated` rejection at record 1001 (lines 9, 18, 49), `TX_TIMEOUT_MS = 5_000` (line 10); consumers = 14 chat-tool files + `api/src/ontology/query/executor.ts` + `api/src/routes/query.ts` (the passthrough endpoint itself) — OQ-1(d)'s "14 chat tools, the query executor, and `POST /api/v1/query/cypher` itself" is precisely right (it corrects pass-1's own looser "10+"). |
| ~~C-03~~ | **→ resolved** | AC-10 now *advanced* by T-14 (scaffold) + T-19 (envelope test) + T-16 (extends test with `/settings`), and **finally closed at T-18** (extends test with `/snapshot/:last_run_at`) — consistent across design §8.2, T-14, T-16, T-18, T-19. T-18 is blocked by T-15/T-16/T-17/T-19, so "all analytics endpoints exist" is true at its closure point. |
| ~~C-04~~ | **→ resolved** | §6 assigns every suppression an owner; the owning tasks carry them in their Implements lines: T-07 (`touch-action: none` + route-scoped viewport meta + double-tap fit-to-view), T-08 (20 px left-edge back-gesture guard + `overscroll-behavior-y: contain`), T-10 (long-press popover), T-13 (CSV share-sheet), T-17 (PDF share-sheet). |
| ~~C-05~~ | **→ resolved** | T-14 is now 2 files (`api/src/analytics/routes.ts` + `router.ts`), guard tests split to new T-19 (3 files); T-07 is now 3 files, with the server module split to T-20 (1 file) and ramp tokens + registration to T-21 (3 files, `route.ts` and `views/index.tsx` listed individually). **No renumbering**: T-01..T-18 retain their pass-1 identities (T-14's and T-07's contents shrank in place); the splits took fresh IDs T-19..T-21. Dependency graph re-checked: T-07←{T-20,T-21}, T-19←T-14, T-16←{T-14,T-19}, T-18←{T-15,T-16,T-17,T-19} — acyclic, correctly ordered. |
| ~~N-01~~ | **→ resolved** | §4's not-decided list now scopes the open item to TZ edge-handling and states FR-10's pinned `0 2 * * *` default explicitly. |
| ~~N-02~~ | **→ resolved** | DD-08 now cites "the project's 'shades of the single project accent' rule (stated in requirements FR-01, applied here to FR-02's surface)". |
| ~~N-03~~ | **→ resolved** | §8.1 parenthetical names the two existing Overview error-scenario tests and marks `_baseline`'s blanket claim stale. |

## New findings (pass 2)

### Concerns

- **C-06 — View-registration files still under-listed in T-09/T-10/T-11/T-12/T-17.**
  Design §7.2 correctly lists `pwa/src/route.ts` + `pwa/src/views/index.tsx`
  as modified for the new tabs (FR-01, FR-03, FR-05, FR-06), and T-21 models
  the right pattern (both files listed individually). But T-09's third entry
  is the bundled "route registration" (the same entry-bundling C-05 flagged
  on T-07 — two real files, so T-09 is effectively 4 files against the
  3-file cap), and T-10 (`Settings.tsx`), T-11 (`SingleSystem.tsx`), T-12
  (`CriticalPaths.tsx`), T-17 (`ExecSummary.tsx`) each create a new view
  component while listing **no** registration files at all — those views are
  unreachable without `route.ts`/`views/index.tsx` entries. Not a blocker
  under the reconciliation verdict rules (no as-built claim is wrong; no
  AC is dropped — each AC's closing task still exists), but it will surface
  at execution. **Recommend** (for the user, post-loop): either add a single
  "register remaining analytics tabs" task following T-21's pattern, or list
  the two registration files explicitly in each of T-09..T-12/T-17 and
  re-balance to the 3-file cap.

### Nits

- **N-04** — §2 Pin-4's phrasing "which today defines only `--accent`,
  `--accent-soft`, `--on-accent`" is loose: `tokens.css` defines ~60 custom
  properties; only the *accent family* is limited to those three. The
  load-bearing claim — no ramp stops exist — is exact. Optional rewording.
- **N-05** — T-01 lists "Files (4)". As a ratify-only task it modifies zero
  files, so the 3-file *modification* cap is not violated; noting for
  completeness since the cap's wording ("no task modifies more than 3
  files") is what saves it.

## Traceability — pass 2 delta

Pass-1 table stands; deltas only:

| Check | Pass-2 result |
|-------|---------------|
| Every FR reaches design + task | **pass** — unchanged; FR-01's task coverage now spans T-07/T-20/T-21 |
| Every AC closed by a task | **pass** — AC-10 closure corrected to T-18 (C-03 resolved); AC-11/AC-12 close at T-19; AC-01 closes at T-07 with T-20/T-21 advancing; AC-07/AC-15 close at T-13 gated on OQ-4/OQ-4a; AC-14 closed-as-superseded at T-06 (documented, not silent) |
| 3-file cap | **pass with note** — T-14/T-07 fixed; residual bundling in T-09 + missing registration files in T-10..T-12/T-17 (C-06) |
| Verification field on every task | **pass** — all 21 tasks carry a test path or a `manual:` repro with input mode + observable outcome |
| No cross-spec file conflict | **pass** — B-01's chat-tool overlap now on the record; T-13 explicitly defers cross-spec seed/tool migration ownership (OQ-4a option b) rather than claiming it |

## Open items carried to the user (not blockers)

OQ-1 (NFR-02 vs graphology engine; option (d) `runPassthrough` now on the
table), OQ-2 (complexity formula), OQ-3 (route naming), OQ-4 (AI-candidates
scope), OQ-4a (canonical AI-attribute vocabulary — binds T-13 + AC-07(a)),
OQ-5 (hardcoded chart hexes), OQ-6 (PDF/hash/scheduler chunk), plus C-06 and
the stale `pwa/src/__tests__/no-auth-grep.test.ts` (owned by the auth
backfill spec per DD-07).

## Summary

Revision 2 is a faithful absorption: every pass-1 finding has a real change
site (not just a "Resolves:" tag), and the newly recorded facts — the chat
tool's `leverage_score >= 0.5` TS-side filter over `runPassthrough`, the
enriched seed's `"low"|"med"|"high"` vocabulary (and the basic seed's total
absence of AI attributes), the three-token accent family with no ramp and no
`theme.ts`, the 1001st-record `result_truncated` cap — are all exactly true
in code. The task splits kept IDs stable and the dependency graph sound.
Approved; the seven open questions plus C-06 go to the user.
