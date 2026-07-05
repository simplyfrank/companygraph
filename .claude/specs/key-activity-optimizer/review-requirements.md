---
feature: "key-activity-optimizer"
reviewing: "requirements"
reviewing_revision: 2
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-05"
---

# Review: key-activity-optimizer / requirements (pass 2/2 — re-review of revision 2)

## Verdict

**approve** — revision 2 resolves both pass-1 blockers and all seven concerns
faithfully, and every factual claim the revision added was re-verified against
the codebase and the upstream specs. Zero blockers remain. Three residual
nit-level items are recorded below for design to absorb; none warrants
another requirements pass.

## Pass-1 findings — resolution audit

Each pass-1 finding was re-checked in the revised text, not taken on faith:

- ~~**B-01** (unknown `:modelId` unspecified)~~ → **resolved.** FR-06 now
  states the model-existence gate fires **before** `scopedNodeIds` on all
  three routes, returning `404 model_not_found` (explicitly *reusing* the
  `model-workspace-core` FR-13 code — verified present in
  `api/src/errors.ts:37`); an existing-but-empty model returns `200` +
  `meta.activityCount: 0`. FR-07/FR-08 sequence the gate before the
  `:activityId` check; FR-10 names the reuse; AC-08 asserts
  `404 model_not_found` on **all three** routes for an unknown model, and
  AC-12 pins the empty state to the `200`-empty response only.
- ~~**B-02** (NFR-01 wording zeroed FR-04)~~ → **resolved.** NFR-01 is
  reworded exactly as recommended: scoping bounds the `Activity` set +
  intra-scope `PRECEDES` edges; `EXECUTES`/`USES_SYSTEM` edges to shared
  `Role`/`System` reference nodes are read unconditionally, with the DEC-01
  citation (verified closed in `model-workspace-core` requirements.md:258).
- ~~**C-01** (catalog `DataTable` gap)~~ → **resolved.** FR-12 records the
  gap as a named decision (static `{columns, rows}` — re-verified against
  `pwa/src/components/DataTable.tsx`, still no sorting/`aria-sort`/row click)
  and mandates an **additive, backward-compatible** extension, exact choice
  deferred to design's File Changes. UX-02 catalog-first preserved.
- ~~**C-02** (wrong analytics path)~~ → **resolved.** All citations now read
  `api/src/analytics/graph.ts` (5 occurrences; the stale
  `api/src/ontology/analytics/` path has 0). `buildGraphologyGraph` confirmed
  exported at `api/src/analytics/graph.ts:42` and accepting an arbitrary
  node/edge list, as the Dependencies section now states.
- ~~**C-03** (empty-set handoff semantics)~~ → **resolved.** FR-04 pins the
  recommended rule (both sides non-empty **and** disjoint) with an XD-11
  rationale; AC-04 adds the roleless + systemless fixture cases.
- ~~**C-04** (chain-length unit + zero-edge case)~~ → **resolved.** FR-03
  pins the unit (**nodes**, deviating from the pass-1 recommendation of edges
  with a written justification — legitimate: both are valid `[0,1]` gradings,
  boundary behavior identical), defines "chain requires ≥ 2 nodes", guards
  `criticalPathLength === 0 → 0`, and AC-03 adds the zero-edge fixture.
- ~~**C-05** (over-strong reversibility + lost-update window)~~ → **resolved.**
  NFR-03 restated as "siblings as of unmark time preserved; interim edits
  never reverted"; FR-09 adds the per-activity atomicity requirement with the
  mechanism left to design, as recommended.
- ~~**C-06** (phantom `envelope.test.ts` reachability claim)~~ → **resolved.**
  FR-10 now anchors the no-dead-codes discipline in this spec's own
  `key-activity-openapi.integration.test.ts` (AC-08 asserts enum presence +
  a real-request return of `activity_not_found`).
- ~~**C-07** (unqualified export/import claim)~~ → **resolved.** FR-09
  qualifies the round-trip claim ("under the current permissive Activity
  attribute schema") and risk row 7 records the strict-schema hazard for the
  future spec that would introduce it.
- ~~**N-01**~~ (casing vs cto-analytics contract) → resolved — explicit
  casing note in FR-03, incl. the decision that the partial chain is not
  exposed in `meta` (per-activity `longestChainDepth`/`criticalPathLength`
  evidence instead). ~~**N-02**~~ (stale absence note) → resolved — the
  Dependencies note now records all four `model-workspace-core` interfaces
  as landed (re-verified on disk). ~~**N-03**~~ (premature `approved`
  status) → resolved (`status: "revised"`). ~~**N-04**~~ (untested < 2 s
  bound) → resolved — NFR-05 declares it a soft bound, timing assertion
  optional in design. ~~**N-05**~~ (private `json<T>`) → resolved —
  Dependencies cites exported `api.*` methods only (re-verified: `json<T>`
  at `pwa/src/api.ts:49` is module-private).

## Blockers

None.

## Concerns

None.

## Nits (new in revision 2 — for design to absorb; no re-review needed)

- **N-01 — Depth-cap unit after the node-count decision.** FR-03 pins chain
  *length* in **nodes** but keeps "depth cap = 20" from the cto-analytics
  contract without saying whether the cap is 20 nodes or 20 edges. AC-03's
  "30-deep linear fixture … scores against the depth-20 partial" and
  cto-analytics AC-06's `longest_partial.length = 20` both read as **20
  nodes** — design should state that in one clause so the DFS bound and the
  length unit use the same measure.
- **N-02 — Ranked-list field name is implied, not declared.** FR-06 says
  "returns the ranked list" while AC-08/AC-12 assert on an empty **`rows`**
  field. Harmless, but design's response schema should pin the field name
  once (`rows` appears to be the intent) so the ACs and the zod shape agree
  byte-for-byte.
- **N-03 — Isolated-activity sub-score is only implicit.** For a model that
  *has* `PRECEDES` edges plus one isolated activity, FR-03's "an isolated
  activity forms no chain" + the graded formula imply `longestChainDepth 0 →
  criticalPath 0`, but it is never stated outright (FR-04 states its
  analogue explicitly: "no `PRECEDES` neighbours scores `0`"). Worth one
  sentence in design or a fixture row in AC-03's test.

## Completeness / Traceability

| Check | Result |
|-------|--------|
| Every FR reaches ≥1 AC | pass — FR-01→AC-01/02/08 · FR-02→AC-01/02 · FR-03→AC-03/13 · FR-04→AC-04 · FR-05→AC-01/05 · FR-06→AC-01/05/08/12 · FR-07→AC-06/08 · FR-08→AC-07 · FR-09→AC-06/07 · FR-10→AC-06/08 · FR-11→AC-08 · FR-12→AC-09/11/12/13/14 · FR-13→AC-10/15 · FR-14→AC-09/16 |
| Every NFR reaches an AC or static guard | pass — NFR-01→AC-08 (B-02 wording fixed) · NFR-02→AC-06/17 · NFR-03→AC-07 (C-05 wording fixed) · NFR-04→AC-01/05 · NFR-05→AC-03 + declared soft bound · NFR-06→AC-17 · NFR-07→AC-14 |
| Every AC traces to ≥1 FR + Platforms + Verification | pass — AC-01..AC-17 all cite FR/NFR sources; Platforms + Verification populated; AC-15 is a proper `manual:` repro with input mode + observable outcomes; AC-14/AC-17 are CLI-verifiable |
| Routes/views match the blueprint View Tree verbatim | pass — `#/model/key-activities` → `KeyActivityBoard`, owner `key-activity-optimizer` (blueprint.md:103,114); placeholder replacement without touching `route.ts` matches `model-workspace-core` FR-17's ownership split (and the as-built dispatch in `pwa/src/views/index.tsx:170` already conforms) |
| UX-* allowances covered | pass — UX-01: AC-09/11/12/13 · UX-02: AC-14 (`--view` flag confirmed, `scripts/design-conformance.ts:125`) · UX-03: n/a declared **and** Platforms/Native-Conflicts tables populated anyway · UX-04: NFR-07 · UX-05: AC-15 · UX-06: FR-12/FR-14 + AC-16 |
| XD-* honoured | pass — XD-11 descriptive-only (NFR-04; no-recommendation-field asserted in AC-05) · XD-03 attribute + score evidence, reversible (FR-07/08/09, NFR-02/03, AC-06/07/17 `git diff` guard) · XD-06 model scoping (FR-01/NFR-01, corrected) · XD-02 Neo4j-only evidence (NFR-02) · XD-08 Business Architect via existing RBAC, central router gate only (FR-11) |
| Error contract complete | pass — `model_not_found` (reused) + `activity_not_found` (added) cover unknown-model / non-scoped-activity on all three routes; empty-vs-unknown disambiguated (B-01 fixed); 403/permission cases in AC-08 |
| House rules (CLAUDE.md) | pass — zod-only, no tsc, en-US identifiers, loopback, `/api/v1/` only, central router gate + `api/src/auth/` (FR-11, NFR-06); additive `ERROR_CODES` change consistent with the versioning policy |
| No file-ownership conflict | pass — new files + additive rows in shared hotspots (`rbac-permissions.ts`, `seed-rbac-roles.ts`, `errors.ts`); consumes but never edits `route.ts`, `model-scope.ts`, `ActiveModelContext.tsx`, graph-core primitives |

## Verified-against-reality notes (pass 2)

- `api/src/errors.ts` — `model_not_found` (line 37) and `activity_not_found`
  (line 64) present, with an in-code comment matching FR-10's "reused, not
  re-added" discipline.
- `api/src/auth/rbac-permissions.ts:301-303` — the three
  `models/:modelId/key-activities*` rows with `key_activity:read`/`:write`
  exactly match FR-11 (spec and as-built agree; no drift).
- `pwa/src/views/index.tsx:170` — `key-activities` tab dispatches to
  `KeyActivityBoard`, the exact FR-12 placeholder replacement.
- `api/src/analytics/graph.ts:42` `buildGraphologyGraph(nodes, edges)`;
  `api/src/storage/model-scope.ts:22` `scopedNodeIds(driver, …)`;
  `pwa/src/styles/companygraph/tokens.css`, `_shared.tsx`
  `Loading`/`ErrorState` — all citation paths real.
- cto-analytics FR-06 caps 20/1000/4 s + snake_case truncation surface
  confirmed — FR-03's "contract, not byte-level field names" note is accurate.
- Blueprint feature row (blueprint.md:184) scope matches this spec's
  in/out boundaries verbatim (KPI attachment + recommendations out).

## Summary

Revision 2 is a disciplined, complete response to pass 1: both blockers were
wording/contract fixes and both landed exactly as recommended; the concern
family around score edge-case semantics (empty sets, zero edges, atomicity,
export/import qualification) is now pinned tightly enough that design cannot
silently change who ranks as "key". The one deliberate deviation from a
pass-1 recommendation (node-count instead of edge-count chain length) is
justified in place and behavior-equivalent at the boundaries. Approved;
the three nits above are design-phase absorbable.
