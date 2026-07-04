---
feature: "pwa-ux-conformance"
artifact: "requirements.md + design.md + tasks.md (revision 1)"
reviewing: "full spec (requirements + design + tasks)"
reviewer: "spec-review-agent (fresh / did-not-author)"
verdict: "revise"
reviewed_at: "2026-07-04"
review_pass: 1
---

# Review: pwa-ux-conformance (full spec)

Reviewed cold against `.claude/skills/spec-review/SKILL.md`, the blueprint
UX-01..UX-06 allowances + View Tree, `.claude/CLAUDE.md` house rules, the
`scripts/design-conformance.ts` gate, `pwa/src/styles/companygraph/tokens.css`,
and `pwa/src/views/_shared.tsx`. All claims were checked against the live
codebase.

**Headline:** the spec's *scope discipline* is excellent (no leak into the
studio-owned `model/**` or `#/exec/performance`), its 16-view UX-02 baseline is
exactly reproducible, and its cited scripts/tests all exist. But the UX-02
baseline it plans against is **materially incomplete**: FR-07/AC-03 gate on
"every file" under the in-scope surfaces + shared primitives, yet the design
only catalogues 16 view `.tsx` files and asserts "the remaining … stay clean" —
which is false. There are **~38 additional failing files** (in-scope
`*.module.css` and shared `components/*`) that no task fixes. As written, FR-07
and AC-03 are unachievable. That is the load-bearing blocker.

---

## What's done well (acknowledged)

- **Scope-boundary integrity is clean.** No FR, DD, AC, or task edits
  `pwa/src/views/model/**` or `exec/Performance*`. Verified live: `model/**`
  has exactly 3 `.tsx` (`ModelWorkspace`, `StoryCatalog`, `ModelTabPlaceholder`)
  matching design §4; no `exec/Perf*` file exists yet (studio not landed).
  DD-07's exclusion and NFR-04's `git diff` scope-check (AC-12) encode the
  boundary in code. FR-06/DD-05 correctly make routing verify-only with a
  byte-unchanged `git diff` guard (AC-08).
- **UX-02 view baseline is exact.** Re-running `design-conformance.ts --view`
  across the 9 in-scope surface dirs yields **exactly the 16 view `.tsx`** named
  in design §5, with findings matching the matrix verbatim (e.g.
  `RiskDashboard` 8 hex, `Erd` 5 hex + `--tone-*`/`--bg-subtle`/`--good-soft`,
  `Journey` 3 hex + `--warn-bg`/`--warn-fg`, `Personas` `#c0392b`).
- **Cited tooling is real.** `--view` is a supported flag; `typecheck` and
  `bundle-check` scripts exist; `keyboard-nav.spec.ts` (covers `/`-focus at
  line 30), `canvas-gestures.ipad.spec.ts`, and `deep-link.test.tsx` all exist
  and are correctly referenced by AC-04/05/09.
- **DD-01 alias targets mostly resolve.** Spot-checked against `tokens.css`:
  `--good`, `--warn`, `--danger`, `--accent`, `--muted`, `--surface`,
  `--surface-2`, `--border`, `--fg`, `--warn-text`, `--accent-soft` all exist —
  the rename-to-canonical claim holds for the aliases actually catalogued.
- **Deferred-execution dependency is captured concretely.** STATUS Execution
  row = "not started — deferred until the studio build lands"; tasks.md header +
  T-11 both gate on the studio build; requirements §Dependencies + Risk 3 spell
  out the file-ownership rationale. An implementer is unlikely to jump the gun.

---

## Blockers

### B-01 — The UX-02 baseline omits every in-scope `*.module.css` and shared `components/*`; FR-07/AC-03 are unachievable as written
`FR-07` requires `design-conformance.ts --view <file>` to PASS for **"every
file under `pwa/src/views/{explorer,…,admin}/` and the shared primitives"**, and
`AC-03` iterates **"every in-scope view + shared primitive."** `requirements.md`
§Scope explicitly puts `pwa/src/components/*` and `pwa/src/styles/*` in scope.
But design §4 Totals ("**16 UX-02 failures** … the remaining 57 in-scope views
stay clean") and §5 catalogue **only 16 view `.tsx` files.** Live sweep results:

- In-scope **`*.module.css`** failing: **≥10** — e.g.
  `explorer/Journey.module.css` (unknown `--dur-fast`, `--ease-out`),
  `explorer/JourneyGraph.module.css` (inline `oklch()`),
  `ontology/Erd.module.css` (3 rgba), `JourneyDetailSlide/DomainDetailSlide/
  DomainComparisonInline/JourneyComparisonInline.module.css` (rgba),
  `ontology/{RollbackModal,AddEdgeModal,AddEntityModal}.module.css` (rgba).
- Shared **`components/*`** failing: **~28** — e.g. `JourneyCanvas.tsx`,
  `SearchPalette.tsx`, `Modal.tsx`, `GraphCanvas.module.css`, `KpiDashboard.*`,
  `SlaDashboard.*`, `charts/KpiCard.module.css`, etc.

None of these appear in §5, and **no task (T-03/T-04) touches them.** The design
even asserts (§5) they "stay clean" — they do not. As written, T-05's sweep and
T-11's gate will exit non-zero on files the plan never fixes, and the
alias-map/DD-01 offers no target for `--dur-fast`, `--ease-out`, or the rgba
literals.
**Recommendation:** re-run the sweep over the *complete* FR-07 target set
(views `.tsx` **and** `.module.css` **and** `components/*` **and** `styles/*`),
publish the true failing-file count in §4, extend the §5 matrix (or a new §5b)
to cover every failing CSS/component file with its DD-01/DD-02 fix, and add the
missing alias/literal targets (`--dur-fast`, `--ease-out`, rgba→token,
inline-`oklch`→token) to DD-01. Either that, or **narrow FR-07/AC-03 scope in
requirements** to "the 16 catalogued view files" and explicitly declare the CSS
+ component debt out of scope — but that contradicts the current §Scope and the
blueprint UX-02 wording ("every touched view"), so the fix is almost certainly
to enlarge the baseline, not the gate.

### B-02 — Task T-06/T-07 each edit ~73 files, violating the "≤3 files / verifiable slice" task rule
The Tasks Review checklist requires "No task modifies more than 3 files" and
tasks small enough to verify. `T-06` ("~73 roots") and `T-07` (all data-fetching
views, "grouped by surface") are each single tasks spanning dozens of files with
one Verification line. This is too coarse to review completion against, and
collides with FR-08's remediation-not-rewrite guard: a 73-file ARIA wrap is
where a silent structural rewrite hides.
**Recommendation:** split T-06 and T-07 per surface (explorer / chat / ontology /
… ), one task per surface, each with its own Verification and a `git diff`
behavior-preservation check. The tasks.md preamble already claims "1–3 files
where practical" — honor it for the two `significant` tasks that break it.

### B-03 — The "73 views / 73-of-73 coverage" figure is internally inconsistent with the author's own enumeration (70)
FR-05, AC-07, design §4 Totals, DD-04, and T-06 all assert **73** in-scope views
and a "~14/73 → 73/73" coverage target. But design §4's own per-surface table
sums to **70** (14+10+13+4+9+3+12+2+3 = 70), which matches the live count of
`.tsx` under the 9 surface dirs exactly (70). The "73" is unsourced and
contradicts the spec's own inventory. AC-07 is therefore untestable as written —
an implementer cannot prove "73/73" against a 70-file set.
**Recommendation:** reconcile to the real number (70 view `.tsx`, or state
precisely what the extra 3 are and add them to the §4 table). Every "73"
reference must match §4. If shared `components/*` are meant to be in the ARIA
coverage denominator too (they are separately in scope), state the true combined
count and enumerate it.

---

## Concerns

### C-01 — UX-01/03/04/06 "already conforms" is asserted per-FR but not substantiated per-AC
FR-03/04/06 and design §1 lean on "the behavior largely already conforms (it
shipped under process-explorer-ui / the baseline)." That is plausible, but the
design provides **no per-view evidence** — no list of which views were checked,
what the current cold-load render is, or which of the canvas surfaces actually
carry `touch-action: none` today vs. need it added. FR-03 names 6 canvas/search
surfaces "verify + close any unhandled conflict" without saying which currently
*lack* suppression, so T-09 can't tell verify-only files from fix files.
**Recommendation:** add a small "current state" column to the §Native Conflicts
table (or a T-09 sub-checklist) marking each surface `already-suppressed` vs
`needs-fix`, sourced from a grep of the actual handlers. An unverified "already
conforms" is otherwise discovered mid-execution.

### C-02 — DD-02 ramp (OQ-1 resolution) is under-specified to implement
DD-02 / T-01 say "add `--sev-1..--sev-5` and `--node-type-1..--node-type-5` as
OKLCH values" but **give no actual OKLCH values and no swatch→token assignment**.
For `RiskDashboard` (8 distinct hex) mapping onto a 5-token `--sev-*` ramp, three
swatches must collapse — which three, and does that preserve the heatmap's
category distinctions the DD itself says must stay distinguishable? The mapping
from each of the 8/5/6/4 raw hex to a specific ramp token is the whole risk of
OQ-1, and it is left to execution.
**Recommendation:** pin the concrete OKLCH values in T-01 and add a per-hex→
per-token column to §5 rows 5, 6, 14, 16 (e.g. `#f59e0b → --sev-3`). Note that
`tokens.css` is auto-generated from `.claude/stitch/design-system.yaml` ("DO NOT
EDIT BY HAND … run stitch-tokens-to-css.ts") — DD-02/T-01 must add the ramp to
the **yaml source and regenerate**, not hand-edit `tokens.css`; the design says
"add to tokens.css" which would be reverted on the next generate. Call this out.

### C-03 — The FR-07 sweep glob must reach nested subdirs (`components/charts/`), or it silently under-covers
DD-07 describes a "hardcoded surface allowlist" for `views/{…}` but the shared
`components/*` scope includes a nested `components/charts/` dir (live:
`charts/KpiCard.module.css` already FAILs). A shallow glob would miss it, giving
a green sweep over a non-conformant file.
**Recommendation:** T-05's Verification should assert the sweep recurses (e.g.
`find … -name '*.tsx' -o -name '*.module.css'`) and include a fixture that a
known nested failing file is caught.

### C-04 — AC-01/AC-07 "each in-scope view" test enumeration is not pinned
`view-states.test.tsx` (AC-01) and `aria-landmarks.test.tsx` (AC-07) must render
"each view in the design's state matrix" / "each in-scope view" — but the design
never publishes that enumerated list (the state matrix referenced in FR-01 and
AC-01 does not exist as a table in design.md; §5 is only the 16 token failures).
Without the enumerated data-fetching-view list and per-view state map, AC-01 is
not mechanically testable and DV-01's `empty: n/a` set is only 2 example views.
**Recommendation:** add the promised per-view state matrix (view → does-it-fetch,
loading/empty/error/ready or `n/a+rationale`) to design §5b; it is referenced by
FR-01, AC-01, and T-07 but missing.

### C-05 — `no-auth-grep.test.ts` is cited as a guard but the house rule that created it was retired
AC-12 and design §6/§8 reuse `pwa/src/__tests__/no-auth-grep.test.ts` as a
passing invariant. Per `.claude/CLAUDE.md`, the "no auth code paths" rule
(former NFR-08/AC-22) was **retired in the 2026-07-04 adoption** and the API-side
guard test deleted. The pwa-side test still exists, but NFR-03 leaning on a
retired-rule guard is fragile.
**Recommendation:** confirm the pwa `no-auth-grep` test still reflects a live
invariant (pwa presentation layer touches no auth), or replace the NFR-03
verification with the plain `git diff` scope check already in AC-12.

---

## Nits

- **N-01** — depends_on lists 9 studio specs but the blueprint slug set also
  includes `system-augmentation-model` and `kpi-okr-governance` (owners of
  `#/explorer/systems` badges and `kpi/okr-management` view edits, both in-scope
  surfaces here). If those specs are still editing in-scope files, note the
  sequencing; if done, drop the ambiguity.
- **N-02** — DD-05 is traced by both T-09 and T-10 in tasks.md, but T-09's body
  is about gestures (FR-03) — its "Traces: DD-05" looks like a copy error; it
  should trace FR-03 (there is no DD for FR-03 gestures; consider adding one).
- **N-03** — design §4 says model/** has "3 files present" then lists 3 names —
  fine — but the requirements §Scope Out-of-scope list names 8 model components
  (`ModelCanvas`, `KeyActivityBoard`, etc.) that **do not exist yet**. Harmless
  (forward-looking exclusion) but worth a "not-yet-present" note so the sweep
  exclusion isn't assumed to match today's tree.

---

## Completeness / Traceability

### FR → AC → Design → Task
| FR | Allowance | AC(s) | Design | Task(s) | Status |
|----|-----------|-------|--------|---------|--------|
| FR-01 view states | UX-01 | AC-01 | DD-03, §8 | T-02, T-07 | **gap** — promised per-view state matrix absent (C-04) |
| FR-02 tokens | UX-02 | AC-02 | DD-01, DD-02, §5 | T-01, T-03, T-04 | **BLOCKED** — baseline omits CSS + components (B-01); ramp values unspecified (C-02) |
| FR-03 input modes | UX-03 | AC-04, AC-05 | §Native Conflicts | T-09 | ok but verify/fix split unmarked (C-01) |
| FR-04 responsive | UX-04 | AC-06 | DD-08 | T-08 | ok |
| FR-05 a11y | UX-05 | AC-07 | DD-04 | T-02, T-06 | coverage denom wrong (B-03); task too large (B-02) |
| FR-06 nav | UX-06 | AC-08, AC-09 | DD-05 | T-10 | ok (verify-only, guarded) |
| FR-07 gate | UX-02 | AC-03 | DD-07 | T-05, T-11 | **BLOCKED** — unachievable vs true failing set (B-01); glob risk (C-03) |
| FR-08 remediation | constraint | AC-10 | DD-06, §6 | T-11 | ok; strengthened by B-02 split |
| NFR-01/05 | — | AC-11 | §8 | T-11 | ok (scripts exist) |
| NFR-02/03/04/06 | — | AC-12 | §8 | T-11 | ok; C-05 on no-auth guard |

Every AC carries Platforms + Verification columns (SKILL requirement met).
Every task carries a Verification field (met). No AC is orphaned; no FR lacks an
AC. The failures above are correctness/completeness of the baseline, not
missing sections.

### Blueprint UX-01..06 fidelity
All six allowances are quoted **verbatim** from blueprint §UI/UX Allowances and
mapped 1:1 to FR-01..FR-06 (+FR-07 gate). The View Tree is respected: no route
invented/renamed, model tabs + `#/exec/performance` correctly excluded. Faithful.

---

## Verdict: **revise**

Strong scope discipline, an exactly-reproducible 16-view baseline, and real
tooling — but the spec cannot ship to execution because its UX-02 baseline is
factually incomplete: FR-07/AC-03 gate on "every file" across in-scope views,
CSS modules, and shared `components/*`, while the design catalogues and fixes
only 16 view `.tsx` and wrongly asserts the rest "stay clean" (~38 additional
files fail live — B-01). Two secondary blockers compound it: the 73-vs-70
coverage figure is internally inconsistent (B-03) and the two `significant`
sweeps (T-06/T-07) violate the ≤3-file task rule at the exact spot FR-08's
no-rewrite guard needs granularity (B-02). Resolve B-01..B-03, address the
DD-02-ramp and state-matrix under-specification (C-02, C-04), then re-review.
The scope boundary, deferred-execution sequencing, and blueprint fidelity are
already sound and need no rework.

**Blockers: 3 · Concerns: 5 · Nits: 3**

---
---

# Review Pass 2 — revision 2 (final pass, 2-pass cap)

- **reviewer:** spec-review-agent (fresh / did-not-author, second pass)
- **reviewed_at:** 2026-07-04
- **artifact:** requirements.md + design.md + tasks.md (revision 2)
- **verdict:** **approve (with notes)**
- **review_passes now:** 2 of 2 (cap reached)

Re-reviewed cold against the revised artifacts, `scripts/design-conformance.ts`,
`scripts/stitch-tokens-to-css.ts`, `.claude/stitch/design-system.yaml`,
`pwa/src/styles/companygraph/tokens.css`, and the live `pwa/src/**` tree. Every
pass-1 blocker was re-verified by running the checker, not by trusting the
author's claims. **All three blockers are genuinely resolved.** One new
must-carry concern surfaced in the §9 gesture matrix, but it is grep-gated and
self-correcting at execution time, so it does not rise to a blocker.

## Blocker resolutions (verified against the live checker)

### ~~B-01~~ → **resolved** (verified — the inventory is accurate, not fabricated)
Ran `design-conformance.ts --view` over the **complete** in-scope set:

- Live sweep = **198 in-scope files checked, 56 failing** — exactly the design
  §4 claim (55 to remediate + waived `tokens.css` = 56 flagged).
- Bucket tally matches design §4 verbatim: **16** view `.tsx`, **10** in-scope
  view `.module.css`, **28** shared `components/**`, **2** `styles/*` (=
  `chat.css` remediation + `tokens.css` waived). `_shared.tsx/.module.css` and
  `index.css` PASS, as design claims.
- Spot-checked failing files: `admin/Personas.tsx` (1 hex `#c0392b`),
  `exec/RiskDashboard.tsx` (8 hex), `ontology/Erd.tsx` (5 hex +
  `--tone-*/--bg-subtle/--good-soft/--warn-soft`), `explorer/Journey.tsx`
  (3 hex + `--warn-bg/--warn-fg`), `sme/Review.tsx` (6 hex) — all findings match
  §5 exactly. Spot-checked claimed-clean: `chat/AgentChat`, `analytics/Overview`,
  `api/Endpoints`, `explorer/Domains`, `exec/Finance` — all PASS.
- Every one of the 55 remediation files is enumerated with a concrete fix in
  §5 (16 rows) + §5b (39 rows), and the fix routes to a real target: §5a alias
  bridge, §5d new-token declaration (concrete OKLCH pinned), or §5e literal→token
  `color-mix` map. `tokens.css` is correctly waived, not counted in the 55.

FR-07/AC-03 now gate the true failing set. Baseline is complete and reproducible.

### ~~B-02~~ → **resolved**
`tasks.md` now enumerates T-01, T-02, T-03, **T-04a..g** (7 per-surface token
sweeps), T-05, **T-06a..i** (9 per-surface ARIA tasks), **T-07a..i** (9
per-surface state tasks), T-08, T-09, T-10, T-11 — 33 discrete slices. Each
per-surface task batches in ≤3-file groups, traces its FR/DD/AC, and carries its
own Verification **plus** a `git diff` behavior-preservation check (the exact
granularity FR-08's no-rewrite guard needed). No editing task touches `model/**`
(the only two references are T-05's exclusion and T-11's read-only confirmation).

### ~~B-03~~ → **resolved**
No operative "73" survives. Every remaining "73" string is either a
revision-history note describing the *old* mega-tasks ("~73-file"), the
"73 → 70" correction note itself, or an incidental substring (`#1a73e8`,
`oklch(70% 0.17 55)`, `#f97316`). Design §4 sums to 70 (14+10+13+4+9+3+12+2+3),
which matches the live `.tsx` count exactly (verified: 70, per-surface counts
identical). FR-05/AC-07 now assert 70/70, testable against the enumerated §4 list.

## Concern resolutions

- **~~C-01~~ → resolved for structure, but see new C2-01 below.** The §9 gesture
  and §10 routing verify-vs-fix matrices now exist and mark each surface
  `verify-only`/`fix-if-absent`. DD-09 added (T-09 now traces FR-03, fixing N-02).
  The *mechanism* is right — but three §9 "current state (grep)" cells are
  factually wrong (see C2-01).
- **~~C-02~~ → resolved (verified).** The named source
  `.claude/stitch/design-system.yaml` and generator `scripts/stitch-tokens-to-css.ts`
  both exist. The generator **already** supports `--check` (exit-non-zero-if-drift),
  **already** supports a `legacy_aliases:` block emitted as
  `--legacy: var(--canonical)`, and `tokens.css`'s header literally says "DO NOT
  EDIT BY HAND." T-01 correctly edits the yaml + regenerates + asserts `--check`.
  The `motion:` group is a genuine gap in the generator (`emitCss` iterates only
  known groups; the shape validator doesn't reject extra keys), but the design
  flags exactly this and gives a working fallback: motion tokens ride under
  `colors:` (which emits any `--name: value`, so `--dur-fast: 120ms` /
  `--ease-out: cubic-bezier(...)` work with zero generator change) — so the plan
  is implementable either way. The `--cat-1..6` / `--sev-1..5` ramp has concrete
  OKLCH values (§5d) and a per-hex→per-token mapping for all 4 multi-swatch views
  (`RiskDashboard`, `Risk`, `Erd`, `Review`). Swatches kept distinct (DV-02).
- **~~C-03~~ → resolved.** DD-07/T-05 use recursive `find`, explicitly reach
  `components/charts/`, and T-05 injects a temporary hex into
  `components/charts/KpiCard.module.css` to prove recursion. Confirmed live:
  `charts/KpiCard.module.css` is in the failing set and enumerated (§5b row 54).
- **~~C-04~~ → resolved.** The per-view state matrix now exists as design §5c,
  enumerating all 70 views with fetches?/loading/empty/error/ready and a `n/a`
  set with rationale (DV-01). AC-01 and T-07* import and iterate it.
- **~~C-05~~ → resolved.** §8b reframes `no-auth-grep` as a *secondary* pwa-layer
  guard and makes the `git diff --name-only` scope check the primary NFR-03/AC-12
  verification — matches the retired-rule reality in CLAUDE.md.
- **Nits N-01/N-02/N-03** all addressed (§Dependencies N-01 note, DD-09 for N-02,
  §4/§Scope not-yet-present note for N-03).

## New finding (this pass)

### C2-01 (concern, must-carry) — three §9 "current state (grep)" cells are factually wrong; do not trust the pre-filled verify-only column
Design §9 marks `explorer/JourneyGraph`, `components/JourneyCanvas`, and
`components/GraphCanvas` as **`verify-only`**, asserting "`touch-action:none`
present" (and, for JourneyGraph, "pan handler `preventDefault` present"). Live
grep contradicts all three: `touch-action` appears **nowhere** in those files
(or anywhere in `pwa/src` except the unrelated `analytics/Systems`), and
`JourneyGraph.tsx` has **no `preventDefault`**. The canvases carry only
`user-select: none`. So these three surfaces are actually **`fix-if-absent`**,
not verify-only — the same class of unverified "already-conforms" claim C-01
flagged in pass 1, now presented as a sourced grep it doesn't match.

Why this is **not** a re-opened blocker: DD-09/T-09 are grep-gated by design —
T-09's instruction is "confirm suppression is present (grep) … add … **only if
the grep shows it absent**," appending a DV row for any fix that fires. Because
execution is deferred, the implementer re-greps at execution time, finds
`touch-action` absent, adds it, and records a DV — the plan self-corrects and
ships correct output. The defect is in the matrix's stated *current state*, not
in the executable instruction.
**Recommendation (carry into execution, no re-review needed):** the implementer
must treat the §9 "current state (grep)" column as **untrusted** and re-grep
every row before deciding verify-only vs fix. Concretely, flip the three canvas
rows to `fix-if-absent` and add `touch-action: none` (+ `overscroll-behavior-y:
contain` where the pull-to-refresh row also lacks it) to `JourneyGraph.module.css`,
`JourneyCanvas.module.css`, and `GraphCanvas.module.css`. AC-04's reused
`canvas-gestures.ipad.spec.ts` + manual pinch/pan check is the backstop.

## Re-checked (no regression from pass 1)
- Scope boundary intact: no task/design edits `model/**` or `exec/Performance*`;
  both are exclusion/read-only references only.
- Platforms & Input Modes + Native Conflicts tables both present in requirements.
- DD-08 breakpoint allowlist (1100/1080/920/900/720) matches the live `@media`
  set exactly — no new breakpoints.
- Spot-checked literal-removal claims are real: `var(--accent-bg, #eef)` exists
  in SearchPalette + Typeahead; `JourneyCanvas.tsx` inline `oklch(36% 0.12 250)`
  arrowhead exists verbatim (§5d `--edge-arrow` targets it).
- Execution still sequenced after the studio build (STATUS + tasks + §11).

## Verdict: **approve (with notes)**

All three pass-1 blockers are genuinely resolved — verified by re-running the
conformance checker across the full 198-file in-scope set (56 failing, matching
the design's 55-to-remediate + waived `tokens.css` bucket-for-bucket), by
confirming the yaml source + generator + `--check` + `legacy_aliases` all exist,
and by confirming the task list is split into 33 per-surface ≤3-file slices each
with its own verification + `git diff` guard. Counts are corrected to 70
throughout, the state matrix (§5c) and verify-vs-fix matrices (§9/§10) now exist,
and scope discipline / blueprint fidelity remain sound. One concern (C2-01) must
be carried into execution: the §9 gesture matrix mislabels the three canvas
surfaces `verify-only` when live grep shows they lack `touch-action: none` — but
T-09's grep-gated "add only if absent" instruction self-corrects this at
execution time, so it is a must-carry note, not a surviving blocker. The 2-pass
cap is now reached; no further review is warranted or permitted.

**Pass 2 — Blockers: 0 · Concerns resolved: 5/5 · New concerns: 1 (C2-01, must-carry) · Nits resolved: 3/3**
