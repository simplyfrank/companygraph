---
feature: "system-augmentation-model"
reviewing: "design"
reviewing_revision: 3
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-05"
provenance_note: >
  Invoked cold as "pass 1 of at most 2". The on-disk record shows this is
  not the first design-review event for the phase: STATUS.md records
  pass 1 (revise) → rev 2 → pass 2 (approve, cap reached) → a post-cap
  cold re-review (approve), and this file replaces that re-review on
  disk. Implementation is already complete in the working tree
  (T-01..T-17 recorded green). Every load-bearing factual claim in the
  artifact was independently re-verified against the codebase and the
  blueprint this pass; nothing below was inherited untested from the
  prior review. See C-01 for the process finding.
---

# Review: system-augmentation-model / design (rev 3, pass 1/2)

## Verdict

**approve** — zero blockers. Revision 3 is a non-normative reconciliation
of an already-approved design against the as-built tree, and on
independent verification it is accurate: every mechanism it claims
exists (registry-data enforcement, read-merge-write migration, import
injection call site, 28 px Button truth, seed picker, no-`run` script
form) is in the code exactly as described, and it honours the blueprint
(route verbatim, all six UX-* allowances, XD-15/XD-02/XD-17). The
residue is process governance, one bookkeeping gap rev 3 was supposed to
close and did not, and three manual verification legs still pending an
operator.

## Blockers

none

## Concerns

- **C-01 — Review-cap accounting and post-approval author amendment
  (process; owed to the orchestrator, not the author).** The design
  phase has now consumed at least five review events against a declared
  cap of two (pass 1 revise → pass 2 approve → post-cap cold re-review →
  this pass), and revision 3 was written by the author *after* approval
  while preserving the gate's rev-2 `approved_by`/`approved_at`
  frontmatter verbatim (design.md frontmatter, lines 5–10). The design
  documents this honestly (§2.3) and STATUS.md carries the
  reconciliation note, but self-documented honesty is not a substitute
  for a protocol. Content-wise I diff-checked the three rev-3
  amendments — §4.6's legacy-`kind` note, §4.3's no-`run` script form
  (`package.json:16` matches), §4.5's injection call-site pin
  (`api/src/routes/import.ts:114`/`:206` match) — all non-normative and
  all true. **Recommendation:** orchestrator freezes the review record
  here (no further design reviews for this phase); STATUS.md's pass
  history is the record of truth; adopt a workflow.md rule that
  frontmatter `status`/`approved_by` is written only by the gate, so
  post-approval amendments require an explicit amendment protocol.
- **C-02 — §7 File Changes still omits a file this spec actually
  edited, despite rev 3 existing precisely to reconcile design with the
  as-built state.** STATUS.md execution deviation 2 records a minimal
  edit to `api/__tests__/chat/tool-cross-section.integration.test.ts`
  (its helper PATCHed `attributes: {}` onto System nodes — a 400 by
  design post-tightening). The prior on-disk review asked for exactly
  this row; rev 3 added the §2.3 reconciliation table but not the §7
  row. The design's own §4.6 sets the standard it now fails: "scope-creep
  edits outside the §7 table would themselves violate spec governance."
  **Recommendation:** add one §7 row (action: modify; serves: AC-15
  regression / STATUS execution deviation 2; note: flagged to the
  chat-interface surface owner) or an explicit §7 footnote pointing at
  the STATUS deviation. This is the only defect in an otherwise complete
  file-change contract and should land with the consolidated report.
- **C-03 — Three manual verification legs remain pending operator, and
  one of them is the sole proof of its AC clause.** AC-10 (mouse
  reload), AC-10 (touch, iPhone Safari) and AC-13 (keyboard, macOS
  Safari) have good §8 repros but are recorded "pending operator" in
  STATUS.md (lines 45–55). Because DD-09 deliberately moved the
  touch-target proof out of automation (the `touch-targets.test.tsx`
  extension asserts structure only — verified: the file's comment now
  states the true 28 px house size, lines 4–7), the manual iPhone leg is
  the *only* verification of AC-10's touch clause. **Recommendation:**
  the consolidated report must carry the three manual outcomes or state
  explicitly that they remain open; do not report AC-10/AC-13 closed on
  the automated legs alone.

## Nits

- **N-01 — stale line citation in §6.** "Wiring change:
  `pwa/src/views/index.tsx` line 62" — the wiring is real but now sits
  at line 81 (`"systems": (r) => <ExplorerSystems route={r} />`); the
  previous review already found it drifted (to 78 then) and concurrent
  specs have moved it again. Cite the mapping key
  (`SURFACES.explorer.systems` factory), not a line number that two
  reviews in a row have found stale.
- **N-02 — the `pressed` prop leaks `aria-pressed` onto the anchor
  render.** §6 specifies the additive `pressed?: boolean → aria-pressed`
  Button extension for the filter *buttons*; the implementation also
  forwards it on the `href`/anchor branch (`pwa/src/components/Button.tsx:32`),
  where `aria-pressed` is not a supported property of the link role.
  Harmless today (no anchor consumer passes `pressed`; `undefined` omits
  the attribute), but the design text should pin the prop to the button
  render so a future href consumer cannot emit invalid ARIA.

## Completeness / Traceability

Every claim below was independently verified against the tree this pass.

| Requirement | Design element | Verified against | Status |
|-------------|----------------|------------------|--------|
| FR-01 (single vocabulary) | §3.1 module + exports subpath + re-export | `shared/src/schema/system-kind.ts` byte-matches §3.1; `shared/package.json:13` subpath; `shared/src/index.ts:4`; repo grep: `ai_predictive` in NO production source outside the module (only test files + seed data; `system-kind-bucketing.test.ts` is ddd-system-modeling's, correctly absent from §7) | covered |
| FR-02 (tightened doc, no `default`) | §3.1 doc const, §3.2 | doc keywords within the `jsonSchemaDocSchema` allow-list; `SYSTEM_ATTRIBUTES_JSON_SCHEMA_DOC` has `required:["systemKind"]`, enum, no `default` | covered |
| FR-03/FR-04 (POST/PATCH enforcement) | §4.4 DD-07 extraction, no per-route check | `checkAttributesAgainstSchema` at `api/src/storage/nodes.ts:41`; throwing wrapper `:78` serving create/patch/upsert `:117/:181/:229` | covered |
| FR-05 (import inject + dry-run parity) | §4.5, DD-03/DD-04, call-site pin | `api/src/routes/import.ts:96` helper; called inside `dryRunPasses` (`:114`) and `realImport` (`:206`), after envelope parse — matches the pin | covered (OQ-1 closed per requirements-review C-01) |
| FR-06 (idempotent migration) | §4.3 steps 1–5, DD-14 read-merge-write | `api/src/ontology/system-kind-migration.ts`: `mergedDoc` splice `:109`, `forceBackfill` `:122-124`, real diff-shape `ontology.changed` emit `:130`, `apoc.map.setKey` drift backfill `:149`, Risk-5 report-not-rewrite `:167-181` | covered |
| FR-07 (bootstrap + standalone + fresh seed) | §4.2 picker, §4.3 invocations, DD-15 | `api/src/ontology/seed.ts:152-153,186` picker; `api/src/neo4j/bootstrap.ts:165-171` step 5 with the exact DD-15 failure line; `api/scripts/migrate-system-kind.ts` exists; root `package.json:16` no-`run` form | covered |
| FR-08 (seed fixtures) | §4.7 + DD-13 AC-09 amendment | systemKind counts 6/7/6 across the three fixtures; enriched carries one `agentic` + one `ai_predictive`; amendment text carried in STATUS.md | covered; deviation traceable |
| FR-09 (badges) | §6 Pill tone map + `unclassified` fallback | `Systems.tsx:42-54` — tones, `SYSTEM_KIND_LABELS`, warn/`unclassified`; reads only `systemKind` (T-14 comment, `:25-34`) | covered |
| FR-10 (URL-first filter) | §6 `?kind=` via `route.params` + `toHash`, unknown → All | `Systems.tsx:61-68`; `views/index.tsx:81` (N-01: §6 cites line 62) | covered |
| FR-11 (states incl. both empties) | §6 states list | `Systems.tsx` loading/error/no-systems/zero-match + clear-filter (`:163`) | covered (UX-01) |
| FR-12 (a11y) | §6 input modes, `pressed` prop, `role="group"` | `Button.tsx:16,43`; `Systems.tsx:119`; see N-02; manual keyboard leg pending (C-03) | covered |
| NFR-01/XD-02 (no new labels/edges/stores) | §3 | no registry tuple change anywhere in §7 | honoured |
| NFR-02 (v1-compatible) | §5 | no route/error-code/openapi delta; `attribute_violation` pre-exists | honoured |
| NFR-03 (batched backfill) | DD-12 comment-only | single-statement Cypher at migration `:149` | honoured (aspirational, as allowed) |
| NFR-04 (house rules) | §5 | central router gate untouched; zod-only; en-US identifiers | honoured |
| NFR-05 (closed enum) | §3.1 single import point | AC-01 grep guard + independent repo grep | honoured |
| AC-01..AC-09, AC-15 | §7/§8 | all six API test files exist on disk; STATUS records them green | closed |
| AC-10..AC-13 | §7/§8 | PWA test files exist; `touch-targets.test.tsx` 44 px comment corrected (DD-09/B-01 confirmed in file); manual legs pending (C-03) | automated legs closed; 3 manual legs open |
| AC-14 | §6 tokens-only / §8 | `Systems.module.css` in §7; STATUS records design-conformance exit 0 | closed |

## Traceability check

| Check | Result |
|-------|--------|
| Every FR reaches design file-changes / a task | pass — with C-02: one *extra* as-built file (chat test helper) missing from §7 |
| Every AC is closed by a named verification artifact | pass on artifacts; 3 manual legs pending execution (C-03) |
| Routes/views match the blueprint View Tree verbatim | pass — `#/explorer/systems` verbatim from the round-4 block (blueprint line 123); existing view extended, no new/renamed route |
| UX-* allowances covered in ACs | pass — UX-01 (AC-11/12), UX-02 (AC-14, tokens-only, catalog Pill/Button/DataTable), UX-03 (Platforms + Native Conflicts tables; honest 28 px story), UX-04 (no new breakpoints), UX-05 (AC-13), UX-06 (AC-10 deep link, reload-safe) |
| XD-* cross-cutting decisions honoured | pass — XD-15 exactly (attribute via registry, three literals, default `functional`, subtype labels re-rejected in §9); XD-02 (no new store); XD-17 (OQ-1 closed as decided, surfaced not re-asked) |
| No file ownership conflict with another spec | pass — SystemModeler/`#/model/systems` untouched; shadow-`kind` read-path migration explicitly assigned downstream (§4.6), not grabbed; `system-kind-bucketing.test.ts` correctly owned by ddd-system-modeling |

## Summary

- The design's engineering content is sound and, unusually, *checkable*:
  the five hardest claims (DD-14 read-merge-write splice, DD-15 bootstrap
  failure line, §4.5 injection call site, 28 px Button truth replacing
  the false 44 px premise, the no-`run` script form) all verified
  against the tree character-for-character this pass.
- What the findings share: nothing is wrong with the design's *content*.
  The residue is governance (C-01 — a five-event review history against
  a two-pass cap, and author-amended approved frontmatter), one
  bookkeeping row the design's own §4.6 standard demands (C-02), and
  verification only an operator can perform (C-03).
- First actions: orchestrator rules on the review-record freeze and the
  amendment protocol; author adds the §7 row/footnote for the chat
  test-helper edit; operator runs the three manual repros before the
  consolidated report claims AC-10/AC-13 closed.
- Nits N-01/N-02 can ride along with the C-02 edit; neither needs a
  re-review.
