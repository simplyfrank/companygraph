---
feature: "system-augmentation-model"
reviewing: "design"
reviewing_revision: 2
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-04"
provenance_note: >
  Invoked as pass 1 of at most 2, but the artifact under review arrived
  with frontmatter already claiming approval ("review-design.md pass 2/2:
  approve"), a pre-existing review-design.md (review_pass: 2), a §2.2
  responding to a pass-1 review, and the full implementation already
  present (uncommitted) in the working tree. This review was performed
  cold and independently re-verified the load-bearing claims against the
  codebase; see C-01 for the process finding.
---

# Review: system-augmentation-model / design (rev 2)

## Verdict

**approve** — zero blockers. The design is unusually verifiable: nearly every
factual claim it makes about the as-built system was checked against the
code this pass and held — the 28 px `Button` reality
(`pwa/src/components/Button.module.css:2`), the `newlyRequired`-scoped
backfill in `patchNodeLabel` (`api/src/ontology/storage/node-labels.ts:291`,
wholesale doc SET at `:365` — making DD-14's read-merge-write genuinely
load-bearing, not cosmetic), the exact `ontology.changed` diff shape
(`api/src/routes/ontology-node-labels.ts:120-127`), the seed-fixture System
counts (6 / 7 / 6, with one `agentic` + one `ai_predictive` in the enriched
fixture), the `shared/package.json:13` exports subpath, the
`views/index.tsx:62` wiring, `toHash` at `pwa/src/route.ts:180`, the
additive `pressed?: boolean` → `aria-pressed` Button extension, and the
`attribute_violation` code already present in the closed enum
(`api/src/errors.ts:23`). Every FR and AC traces to a design element and a
named verification artifact. Three concerns are recorded — two of them
process-level, none content-blocking.

## Findings

### Blockers

none

### Concerns

- **C-01 — Review provenance / frontmatter self-approval must be reconciled
  by the orchestrator.** This invocation was scoped as "review pass 1 of at
  most 2", yet `design.md` frontmatter already carries `status: approved`,
  `approved_by: review-gate (review-design.md pass 2/2: approve, 0
  blockers)`, and a prior `review-design.md` (review_pass: 2) existed on
  disk before this review ran. Either a full review cycle already completed
  and this invocation is a mislabeled duplicate (in which case the review
  cap of 1 review + 1 re-review is at risk of being exceeded on paper), or
  the artifact pre-declared a gate outcome only the reviewer may set.
  Content-wise this pass independently re-verified the pass-1/pass-2
  resolution claims (B-01 28 px story, DD-13, DD-14, DD-15, N-01..N-03)
  and all hold — so no substantive re-review is owed. **Recommendation:**
  the orchestrator records the true pass count in STATUS.md and the
  consolidated report, and the house rule "frontmatter `status`/`approved_by`
  is written by the gate, never the author" is stated in workflow.md if it
  isn't already.
- **C-02 — Implementation preceded this design review.** The working tree
  already contains the complete implementation the design describes as
  future work: `shared/src/schema/system-kind.ts`,
  `api/src/ontology/system-kind-migration.ts` (mergedDoc splice, drift
  backfill via `apoc.map.setKey`, Risk-5 invalid-value report, post-commit
  event emit with the exact diff shape), bootstrap step 5 with the DD-15
  try/catch (`api/src/neo4j/bootstrap.ts:118-133`), the import-route
  injection + async dry-run (`api/src/routes/import.ts:95-125`), all six
  API test files, both PWA test files, and the edited
  `touch-targets.test.tsx` (whose stale 44 px comment is indeed corrected,
  referencing tasks T-16/T-17). Design == code in every spot checked, so
  the artifact is an accurate contract for what's built — but the workflow
  ordering (design approved → tasks → implement) was inverted or run
  concurrently. **Recommendation:** the consolidated report must state
  that this review post-dates implementation, and approval here is
  conditional on the deterministic gates actually passing on the built
  state (`bun run typecheck`, both test suites, `bun
  scripts/design-conformance.ts` — AC-14/AC-15).
- **C-03 (carried from prior pass, still open) — shadow `kind` vocabulary
  in the journey canvas.** `pwa/src/lib/journeyData.ts:189` still reads
  `sAttrs.kind` off System attributes — the per-feature kind field XD-15
  rejects. The design's §4.6 inventory (a read/write-path inventory that
  exists precisely to be exhaustive) still does not name it; the only trace
  is a comment in `Systems.tsx:26`. The §4.1 grep guard hunts the literal
  `"ai_predictive"` and can never catch it. **Recommendation:** one line in
  §4.6 (or the consolidated report) naming
  `journeyData.ts`/`JourneyCanvas` as the legacy `kind` read path and
  assigning the `kind` → `systemKind` migration to the spec that owns the
  journey canvas (`ddd-system-modeling` or the canvas-owning surface). No
  code change in this spec's scope.

### Nits

- **N-01 — root script text drift.** §4.3 specifies
  `"migrate:system-kind": "bun --cwd api run scripts/migrate-system-kind.ts"`;
  the actual root `package.json:16` is `"bun --cwd api
  scripts/migrate-system-kind.ts"` (no `run`). Functionally equivalent
  under Bun; align the design text (or leave as-is — the code form is the
  cleaner one).
- **N-02 — §4.5 "before zod parsing" phrasing** (carried): injection runs
  after the envelope-level `importPayloadSchema` parse and before per-row
  `nodeWithLabelSchema` parsing — which is exactly what the code does
  (`import.ts:113`, `:180`) and what the in-code comment now pins; tighten
  the design phrasing to match so no future edit relocates the call.

## Completeness / Traceability

| Requirement | Design element | Verified artifact | Status |
|-------------|----------------|-------------------|--------|
| FR-01 (shared vocabulary) | §3.1 module + exports subpath + re-export | `shared/src/schema/system-kind.ts`, `shared/package.json:13`, `shared/src/index.ts:4`; AC-01 guard `api/__tests__/system-kind-vocabulary.test.ts` (scan roots + `shared/seed/` class exclusion confirmed) | covered |
| FR-02 (tightened registry doc, no `default`) | §3.1 doc const + §3.2 | doc within `jsonSchemaDocSchema` subset; AC-02 `system-kind-registry.integration.test.ts` | covered |
| FR-03 (POST enforcement) | §4.4 wrapper unchanged; registry data does the work | `checkAttributesAgainstSchema` extraction verified in `api/src/storage/nodes.ts` incl. `not_found → permissive` and missing/type_mismatch split; AC-03..05 test file exists | covered |
| FR-04 (PATCH semantics) | §4.4 (map present → whole-map validation; omitted → untouched) | AC-06 in `system-kind-enforcement.integration.test.ts` | covered |
| FR-05 (import defaulting + dry-run) | §4.5 injection + DD-04 all-labels async dry-run | `import.ts:95-125,180` matches design exactly; AC-07 test file exists | covered (OQ-1 closed by DD-03, per requirements-review C-01 direction) |
| FR-06 (idempotent migration) | §4.3 steps 1–5, DD-14 read-merge-write | `system-kind-migration.ts` matches (mergedDoc, drift backfill Cypher, Risk-5 report, event emit with real diff); AC-08 + a/b/c/d | covered |
| FR-07 (bootstrap + standalone + fresh-seed) | §4.2 seed picker + §4.3 invocations + DD-15 | `seed.ts:152,185-186` picker; `bootstrap.ts:118-133` step 5 + distinct failure log + rethrow; `api/scripts/migrate-system-kind.ts` + root script | covered |
| FR-08 (seed fixtures) | §4.7 + DD-13 AC-09 amendment | 6/7/6 `systemKind` counts confirmed in all three fixtures; enriched has 1 agentic + 1 ai_predictive; AC-09 via direct `POST /api/v1/import` (amendment explicit, carriage into tasks/STATUS mandated) | covered, deviation traceable |
| FR-09 (badges) | §6 Pill tone map, `unclassified` fallback, labels-not-color | `Systems.tsx:42-53` matches; AC-10/AC-13 test files exist | covered |
| FR-10 (URL-first filter) | §6 `?kind=` via `route.params`, `toHash`, unknown → All | `Systems.tsx:62,76,119`, `route.ts:180`, `views/index.tsx:62` | covered |
| FR-11 (states incl. both empties) | §6 states list | `Systems.tsx:153-163` — loading/error/no-systems/zero-match+clear-filter/ready | covered (UX-01) |
| FR-12 (a11y) | §6 input modes; additive `pressed` prop | `Button.tsx:13-43` aria-pressed; `role="group"` + label; AC-13 + manual keyboard repro | covered (UX-05) |
| NFR-01/XD-02 | §3 (no new labels/edges/stores) | no registry tuple change in file list | honoured |
| NFR-02 (v1-compatible) | §5 (no route/error-code/openapi delta) | `attribute_violation` pre-exists in closed enum | honoured |
| NFR-03 (batched backfill) | DD-12 comment-only, timed test rejected | single-statement Cypher confirmed | honoured (aspirational, as requirements-review N-03 allowed) |
| NFR-04 (house rules) | §5 auth via router gate; zod-only; en-US | no auth code in file list; zod throughout | honoured |
| NFR-05 (closed enum) | §3.1 single import point | grep guard | honoured |
| AC-01..AC-15 | §7/§8 | every AC maps to a named, existing test file or an explicit manual repro with input mode + observable outcome (AC-10 touch, AC-13 keyboard, AC-14 script) | complete |

**Blueprint conformance:** route `#/explorer/systems` taken verbatim from
the View Tree round-4 row (`blueprint.md:123`); no new/renamed route; UX-01
through UX-06 each addressed (states, tokens-only + catalog `Pill`/`Button`
+ design-conformance gate, input-modes table with the truthful 28 px story,
no new breakpoints, aria-pressed/Tab/Enter-Space, URL-first deep link);
XD-15 satisfied exactly (attribute via registry, the three literals, default
`functional`, subtype labels re-rejected in §9); XD-17 respected (OQ-1
closed as decided, surfaced for the consolidated report, not re-asked).

**Done well:** §4.6's write-path inventory, the honest DD-09 rewrite
(28 px / WCAG-AA instead of an inherited false 44 px claim), the DD-14
merge whose correctness is provable via `newlyRequired` scoping, and a
rejected-alternatives section that records real trade-offs with reasons.

## Verdict

**approve** — zero blockers; C-01/C-02 (process) and C-03 (shadow `kind`
note) recorded as open concerns for the tasks/consolidated-report stage.
