---
feature: "system-augmentation-model"
reviewing: "requirements"
reviewing_revision: 1
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-04"
---

# Review: system-augmentation-model / requirements (pass 1/2)

## Verdict

**approve** — zero blockers; every load-bearing factual claim about the
as-built machinery was verified against the codebase and holds, routes and
scope match the blueprint verbatim, and all UX-* allowances are covered by
explicit ACs. Four concerns are recorded for the design author to pin.

## Blockers

none

## Concerns

- **C-01 — OQ-1 ("pending confirmation") is unreachable under XD-17
  single-shot mode.** FR-05 is a `must` requirement marked "**Pending OQ-1
  confirmation**", and OQ-1 says "Orchestrator to confirm with user" — but
  XD-17 (blueprint) replaced interactive gates with deterministic ones until
  the consolidated report, so there is no confirmation channel before design
  starts. A `must`-FR cannot stay pending into design. Resolution: the
  recommended default (**inject on import only; POST/PATCH stay strict**) is
  the correct reading of XD-15 ("seed migration defaults existing systems to
  functional" — legacy import payloads are existing systems) and preserves
  the graph-core export→import round-trip property. **Design must adopt the
  recommended default as decided, strike the "pending" clause, and record
  OQ-1 as closed** (surface it in the consolidated report for the human
  checkpoint).

- **C-02 — AC-07's dry-run parity clause silently requires extending
  dry-run's validation depth.** `api/src/routes/import.ts:72-115`
  (`dryRunPasses`) performs **envelope-only** validation
  (`nodeWithLabelSchema.safeParse`) with zero registry/attribute checks — the
  file's own header comment (lines 51-54) explains dry-run is deliberately
  schema-only because full dry-run would need injected sessions. So today a
  System row with `systemKind: 42` passes dry-run clean while real import
  puts it in `errors[]`. AC-07's "`?dryRun=true` behaves identically without
  writing" is therefore not satisfiable without changing `dryRunPasses` to
  run the attribute-zod validator (feasible — it is a registry READ, no
  writes; `handleImport` is already async). Design must decide explicitly:
  (a) extend dry-run to run attribute validation (and state whether for
  System rows only or all labels — all-labels changes dry-run results for
  every existing consumer payload), or (b) scope AC-07's dry-run clause to
  the defaulting semantics only (missing-key rows pass; the invalid-value
  divergence documented as known dry-run limitation). Option (a) for all
  labels is the coherent choice; either way the decision belongs in
  design.md, not discovered mid-task.

- **C-03 — FR-07's two invocation modes have no closing AC.** FR-07 requires
  (1) automatic migration during server bootstrap "before the API accepts
  writes", (2) a standalone `bun run` script, and (3) fresh-DB seeding with
  the tightened doc directly. AC-08 exercises the migration function on a
  pre-migration DB but never asserts *how it was invoked*: no AC boots the
  server against a stale DB and observes the migrated state, none asserts
  the standalone script exists and exits 0, and none asserts a fresh
  registry seed emits the tightened doc (no permissive window). Recommend
  design/tasks add: AC-08 sub-assertions (or a new AC) covering (i) bootstrap
  path — server start on pre-migration DB → post-conditions of AC-08 hold
  before first write is accepted; (ii) `bun run <script>` standalone run;
  (iii) fresh-DB seed → `GET /api/v1/ontology/node-labels` System row already
  matches FR-02 with zero `_OntologyEvent` backfill rows.

- **C-04 — iPhone Safari (touch) is declared but never verified.** AC-10's
  Platforms column lists "iPhone Safari (touch — tap targets)" and the
  Platforms & Input Modes table promises "Tap targets ≥ existing house
  minimum (`touch-targets.test.tsx` pattern)", but no AC's Verification
  column closes it: AC-10's manual repro is macOS Chrome mouse only, and no
  test path covers tap targets for the new filter controls. Recommend:
  extend `pwa/src/__tests__/touch-targets.test.tsx` (exists, verified) to
  cover the systemKind filter controls, or add a `manual:` repro on iPhone
  Safari to AC-10.

## Nits

- **N-01** — AC-08 should also assert that a second migration run appends
  **no new `_OntologyEvent` / version rows** (not only "no duplicate
  backfill" of data). As written, a migration that re-patches the registry
  doc on every boot would pass AC-08 while spamming the audit log and
  churning the attribute-zod cache each restart.

- **N-02** — AC-01's grep exception list ("imports of this module + the seed
  fixture") will break if Risk 4's optional demo enrichment lands (an
  `agentic`/`ai_predictive` system in `scripts/seed-enriched.ts` would
  contain the literal). Phrase the exclusion as "seed/fixture **data** files"
  rather than naming `retail-mini.json` alone, so the guard survives the
  spec's own nice-to-have.

- **N-03** — NFR-03's numbers (< 10 s for 10,000 Systems; < 1 s bootstrap
  delta) have no verification anywhere. Fine to leave unbenchmarked for a
  single-tenant tool, but design should at least note whether the numbers
  are asserted (a timed integration test) or aspirational (comment only).

- **N-04** — No rollback note for the migration. Forward-only is defensible
  here (loosening = a registry re-patch; the backfilled `"functional"`
  values are semantically harmless), but one sentence in FR-06 saying
  "rollback = re-patch the registry doc permissive; backfilled values are
  retained" would close the migration/rollback checklist item explicitly.

## Traceability check

| Check | Result |
|-------|--------|
| Every FR reaches an AC | **pass with gap**: FR-01→AC-01, FR-02→AC-02, FR-03→AC-03/04/05, FR-04→AC-06, FR-05→AC-07+AC-15, FR-06→AC-08, FR-07→AC-08 (**partial — see C-03**), FR-08→AC-09, FR-09→AC-10, FR-10→AC-10, FR-11→AC-11/12, FR-12→AC-13 |
| Every AC is testable with a named verification path | pass (AC-01..AC-15 all name a test file or a `manual:` repro; C-04 flags one declared platform without a closing verification) |
| Routes/views match the blueprint View Tree verbatim | **pass** — `#/explorer/systems` taken verbatim from the round-4 additions table; owner slug matches; no new/renamed route; component `ExplorerSystems` matches the existing export at `pwa/src/views/explorer/Systems.tsx:17` |
| UX-* allowances covered in ACs | **pass** — UX-01→AC-11/12, UX-02→AC-14 (`scripts/design-conformance.ts` exists), UX-03→Platforms & Input Modes + Native Conflicts tables present, UX-04→stated (no new breakpoints), UX-05→AC-13, UX-06→AC-10 deep-link reload |
| XD-* cross-cutting decisions honoured | **pass** — XD-15 (attribute-not-label, exact enum values, default `functional`), XD-02 (no new store), XD-17 (single-shot — but see C-01), NFR-01 rejects the XD-15 rejected alternatives explicitly |
| No file ownership conflict with another spec | **pass** — `pwa/src/route.ts` untouched (no new route); FR-07's fresh-seed change touches `api/src/ontology/seed.ts` (graph-core-era file) but under this spec's governance, additive per-label doc only |
| Factual claims vs codebase | **pass** — verified: `{missing[], type_mismatch[]}` details shape (`api/src/storage/nodes.ts:51-66`); PATCH replace-the-whole-map + omitted-attributes-untouched (`nodes.ts:157-179`); input-attributes-persisted `default` foot-gun (`nodes.ts:109`, real — `default` IS in the supported keyword subset, `shared/src/schema/ontology.ts:12`); `enum`+`required` supported by `jsonSchemaDocSchema` (`ontology.ts:71,88`); registry seed `MERGE … ON CREATE SET` permissive doc (`api/src/ontology/seed.ts:156-175`); `patchNodeLabel` + `forceBackfill` + `would_invalidate` exist (`api/src/routes/ontology-node-labels.ts`); attribute-zod cache clears on `ontology.changed` (`api/src/ontology/cache/attribute-zod.ts:34`); seed fixture has exactly 6 System rows, none with `attributes`; `Pill`, `DataTable`, `Loading`/`ErrorState`, "Activity usage by system" chart, `#/explorer/activities` `route.params` filter pattern, `touch-targets.test.tsx`, `bun run typecheck` — all exist as described |

## Summary

- **Solid:** this is an unusually well-grounded requirements doc — every
  claim about the as-built enforcement machinery, error-details shape, PATCH
  semantics, registry seed behavior, and PWA catalog checked out exactly
  against the code, including the subtle `default`-keyword foot-gun (FR-02 /
  Risk 2), which is a real hazard the author caught pre-emptively.
- **Common thread in the findings:** the gaps are all at the *boundary of the
  existing machinery's actual behavior* — dry-run's validation depth (C-02),
  the migration's invocation paths (C-03), and one declared-but-unverified
  platform (C-04). None changes direction; all need explicit decisions in
  design.md rather than mid-task discovery.
- **Do first:** close OQ-1 by adopting the recommended inject-on-import
  default (C-01) — it is the only finding that touches a `must`-FR's
  decidedness, and the single-shot mode leaves no later channel to settle it.
- Blueprint conformance is clean: route verbatim, scope matches the feature
  inventory row exactly, out-of-scope list names owning specs, XD-15's
  rejected alternatives are re-rejected rather than re-litigated.
