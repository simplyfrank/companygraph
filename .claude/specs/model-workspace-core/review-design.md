---
feature: "model-workspace-core"
reviewing: "design"
reviewing_revision: 4
artifact: "design.md (revision 4, reviewing_requirements_revision: 4)"
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-04"
---

# Review: model-workspace-core / design (pass 1/2 — revision 4)

Fresh cold review of `design.md` **revision 4** against approved
`requirements.md` rev 4, `blueprint.md` (View Tree, UX-01..06, XD-01..18),
`.claude/CLAUDE.md`, `_baseline` conventions, and the as-built codebase.

**Process note.** The ledger records a completed 2/2 design-review cycle that
approved revision 3; a prior on-disk `review-design.md` was itself a
pass-1-of-rev-4 approve. This review **supersedes that file** with an
independent re-verification (nothing was taken on trust): every finding below
was re-derived from the artifact and checked against the code. Finding IDs
continue the established series (B-01..B-03, C-01..C-13, N-01..N-15 consumed
by prior passes) so cross-references in design/tasks/STATUS stay valid.
Execution is recorded complete, which makes this review partly post-hoc — but
that also allowed direct verification of design claims against shipped code.

## As-built claims verified this pass

- `pwa/src/route.ts` — Model surface appended (`kbd:"0"`) with all **seven**
  View-Tree tab ids **verbatim**: `models, canvas, stories, key-activities,
  kpi-impact, systems, export` (lines 110–120). Exact match to blueprint +
  §4.9. Nine pre-existing surfaces hold `kbd` 1–9.
- `pwa/src/App.tsx` lines 51–57 — keydown branch is `/^[0-9]$/`, `"0" →
  index 9`, `e.preventDefault()` kept; the line-41 comment reads
  `Alt+1..9 / Alt+0` (N-02 applied). Exactly §4.9(a).
- `api/src/errors.ts` lines 37–45 — all 9 new codes present, additive.
- `api/src/auth/rbac-permissions.ts` lines 257–305 — all §5 rows present with
  the §5 permissions; specific rows (`module-instances/*`, `:id/domains`,
  `archive`, `fork`, `upgrade`, `edges`) listed **before** `models/:id`
  (interleaved story/key-activity rows from downstream specs are also
  pre-`models/:id`; no shadowing).
- `scripts/design-conformance.ts` — header confirms **"INERT BY DEFAULT"**
  without `--view`/`--surface`; the design's two `--view <file>` invocations
  (§6/§8, D-5/C-11) are the enforced form.
- `pwa/src/styles/companygraph/tokens.css` and `pwa/src/views/_shared.tsx`
  (`Loading`, `ErrorState`) exist as cited (N-01 path fix correct).
- `api/src/ontology/storage/{node-labels,edge-types}.ts` exist
  (`createNodeLabel`/`createEdgeType` registration path, §4.1).
- All §7 File Changes paths are real: `api/src/storage/{model-scope,models,
  modules,model-lifecycle-guard}.ts`, `api/src/routes/{models,modules}.ts`,
  `pwa/src/context/ActiveModelContext.tsx`, etc.
- `api/src/routes/journey-versions.ts` exists (FR-06 prior art).
- `pwa/src/context/ActiveModelContext.tsx` — persists `cg.activeModelId`,
  reads `model=<id>` from the **hash** query string (see N-14).
- `tasks.md` rev 4 — T-16 carries the §4.7 `--down --force` refusal + the
  AC-08 second-model-survives assertion (prior C-12 is landed; see below).

## Status of prior findings

- ~~B-01~~/~~B-02~~/~~B-03~~ → resolved (rev 2/3): synthetic content-id
  scheme (§3.3/§3.4), instance-qualified `forkLocalKey` anchor, fully
  specified sibling edge route. Verified present in §3.4/§4.4/§4.5 and in
  `api/src/storage/modules.ts` as shipped.
- ~~C-01~~..~~C-08~~, ~~N-01~~..~~N-09~~ → resolved in rev 2/3; spot-checked
  (no `?model=` on any GET; migration keyed on `isReference:true`; canonical
  checksum spec §3.3; Deviations Register landed as requirements rev-3/4
  errata/body).
- ~~C-09~~ (deleted-fork-anchor) → **resolved** in §4.4/§4.5 exactly as
  pinned in tasks T-08 (`404 module_instance_node_not_member` on write,
  empty-content envelope on read, never a 500).
- ~~C-10~~ → **resolved** (documented-limitation arm): §4.7 `--force`
  refusal + script-header limitation.
- ~~C-11~~ → **resolved**: requirements rev 3/4 landed all five deviations;
  §2.1 is verifiably a historical ledger — I diffed each D-row against
  requirements rev 4 (FR-18/AC-21 no-`?model=`; D-2 `targetDomainId` errata;
  D-3 explicit-version publish in AC-04; D-4 lifecycle-guard arm in
  FR-08/AC-06; D-5 two `--view` invocations in AC-16). Zero divergences
  remain.
- ~~C-12~~ (tasks T-16 out of sync with the rev-4 `--force` contract) →
  **resolved**: tasks rev 4 syncs T-16 (refusal guard, forced-`--down`
  survival assertion, documented limitation) — verified in `tasks.md` (rev-4
  header + T-16 body).
- ~~N-10~~..~~N-12~~ → resolved (four-label count; DELETE-body note;
  AC-05 "identical modulo projected handles").
- **C-13 remains open** — see Concerns.
- **N-13/N-14/N-15 remain open** — re-confirmed below.

## Blockers

None.

## Concerns

- **C-13 (carried, independently re-confirmed) — concurrent first-edit fork
  race is unspecified, and the shipped code has the same shape.** §4.4 calls
  `forkInstance` "idempotent" but specifies no concurrency gate. In
  `api/src/storage/modules.ts` the check is a **read in one session**
  (`readInstanceRow` → `row.forked`) followed by a **separate
  `executeWrite`** that materializes the subtree — two concurrent first
  writes (nodes route + edges route, or two clients) can both observe
  `forked=false` and both materialize, producing duplicate `forkLocalKey`
  values. That breaks §3.4's "globally unique by construction" (the §4.3
  `forkLocalKey` indexes are *lookup* indexes, not uniqueness constraints)
  and makes the §4.5 anchor read (`{forkLocalKey: <instanceId>::journey}`)
  ambiguous. Low likelihood on a loopback single-operator stack and no AC
  exercises it, so not blocking. *Recommendation (one sentence in §4.4 + a
  follow-up code fix):* run the check-and-set inside **one `executeWrite`**
  whose first statement is the conditional gate `MATCH (i:ModuleInstance
  {id:$id}) WHERE i.forked = false SET i.forked = true` — Neo4j's node
  write-lock serializes racers; the loser matches nothing and takes the
  already-forked read-back path. Alternatively (belt + suspenders) declare
  the `forkLocalKey` indexes as uniqueness constraints on
  `UserJourney`/`Activity` — Neo4j exempts nodes missing the property, so
  ordinary nodes are unaffected.

## Nits

- **N-13 (carried, re-confirmed)** — §4.7 `--down` does `DETACH DELETE m` on
  the reference root but is silent on `ModuleInstance`s `INSTANCE_IN`
  Model #1: their `INSTANCE_IN` edge dies with the root, leaving orphaned
  instance nodes (and, if forked, live subtrees under now-unscoped domains).
  AC-08's count assertions are instance-blind, so they still pass. Add one
  line: either `--down` also deletes Model #1's instances, or the script
  header documents the orphaning under the same "entered knowingly"
  limitation.
- **N-14 (carried, re-confirmed)** — §4.9 says the context "reconciles
  against a `?model=<id>` URL param". On this hash-router the param only
  works in the **hash** query string (`#/model/models?model=<id>`;
  `location.search` is invisible to `route.ts`). The shipped
  `ActiveModelContext.tsx` already reads the hash. Say "hash query param" in
  §4.9 so AC-18's playwright spec asserts the right URL shape.
- **N-15 (carried, re-confirmed)** — command drift: requirements AC-16 says
  `bun scripts/design-conformance.ts --view …`, design §6/§8 say
  `bun run scripts/design-conformance.ts --view …`. Both work under Bun;
  quote one form in T-20's DoD.
- **N-16 (new)** — §3.3's `snapshot_json` example omits `description` on the
  activity rows (`{ "localKey": "a0", "name": "...", "attributes": {…} }`)
  while the journey row carries one. The shipped serializer **does** include
  `description` on every activity row (`modules.ts`, `description:
  a.description ?? ""`), and the §3.3 checksum covers the full snapshot
  object — so a re-implementation from the design text verbatim would (a)
  lose activity descriptions on fork and (b) compute a **different checksum**
  than the shipped serializer for the same subtree. Since §3.3 is the
  normative snapshot shape, add `description` to the activity row in the
  example. Purely a doc fix; the code is right.

## Completeness / Traceability

| Check | Result |
|-------|--------|
| Every FR/NFR from requirements rev 4 reaches a design section + §7 file change | **pass** (table below) |
| Every AC (AC-01..AC-21) closed by a §8 test artifact or concrete manual repro | **pass** — all 21 mapped; manual entries carry input mode + observable outcome |
| Routes/views match the blueprint View Tree **verbatim** | **pass** — `#/model/{models,canvas,stories,key-activities,kpi-impact,systems,export}` exact; verified in `route.ts` as shipped; no invented/renamed route |
| UX-* allowances covered | **pass** — UX-01 (four states, §6 + AC-13..15), UX-02 (tokens-only + catalog-first + enforced `--view` runs, AC-16), UX-03 (n/a — no canvas here; tables reflect it), UX-04 (no new breakpoints), UX-05 (AC-17 keyboard/ARIA/focus), UX-06 (verbatim routes + deep-link/context reload survival, AC-18) |
| XD-* honoured | **pass** — XD-01/02 (registry-only labels, Neo4j only, `NODE_LABELS` untouched + AC-20 git-diff guard), XD-06 (BusinessModel roots via `IN_MODEL`), XD-07 (publish/pin/fork/upgrade exactly as decided; explicit upgrade only), XD-08 (Business Architect through existing RBAC, no `node:write`), XD-12 (idempotent + reversible + dry-run migration), XD-17 (DEC-01 closed at gate, silent-accept recorded in frontmatter) |
| House rules | **pass** — zod-only (`shared/src/schema/model-workspace.ts`), no tsc, central router gate only (§4.8/§5, no per-route auth), loopback unchanged, all routes under `/api/v1/`, `ERROR_CODES` additions additive, en-US identifiers |
| File ownership | **pass** — `route.ts` owned here per blueprint; `seed-rbac-roles.ts` handled additively (known coordination hotspot) |

### FR / NFR → design mapping

| Req | Covered by | Status |
|-----|-----------|--------|
| FR-01 `BusinessModel` label (registry, idempotent) | §3.1, §4.1, §4.3 | ok |
| FR-02 module label set (four) | §3.2–3.4, §4.1 | ok |
| FR-03 `IN_MODEL` + transitive scope | §3.5, §4.1, §4.2 | ok |
| FR-04 lifecycle edges + endpoint rows | §3.5, §4.1 | ok |
| FR-05 Model CRUD, ordinal, delete cascade, at-most-one-reference | §3.1, §4.3, §5 | ok — transactional check picked (rev-4 N-06); forked copies in cascade (N-07) |
| FR-06 publish/versions (blob, checksum, explicit-version D-3) | §3.3, §4.4, §5 | ok |
| FR-07 instantiate (`targetDomainId` D-2) + `:id/domains` setup | §3.4, §4.3–4.5, §5 | ok |
| FR-08 fork trigger + sibling edge route + lifecycle guard | §4.4, §4.6, §5 | ok — deleted-anchor specified; concurrency → C-13 |
| FR-09 explicit upgrade + downgrade guard | §4.5, §5 | ok (N-09 handle warning present) |
| FR-10 migration apply/`--down --force`/`--dry-run` | §4.7 | ok — instance orphaning → N-13 |
| FR-11 Business Architect role/persona | §4.8 | ok |
| FR-12 route-permission mapping, ordering | §4.8, §5 | ok — verified in shipped `rbac-permissions.ts` |
| FR-13 openapi + 9 additive error codes | §3.6, §5, §7 | ok — each code reachable via a named route |
| FR-14 Model surface + 7 verbatim tabs + accelerator | §4.9, §6 | ok — `Alt+0`, Risk 6 decision recorded |
| FR-15 shell active-model context, persisted + reconciled | §4.9 | ok (N-14 wording) |
| FR-16 ModelWorkspace, 4 states, one-fetch counts | §4.9, §6 | ok |
| FR-17 sibling-tab placeholder | §4.9, §6 | ok |
| FR-18 scope helper, no `?model=`, proven twice | §4.2 | ok — agrees with requirements rev-4 C-09 |
| NFR-01 registry-only, no new store | §3, §4.1 | ok |
| NFR-02 idempotent/reversible/dry-run | §4.7 | ok |
| NFR-03a/b isolation | §4.2 / §4.4 | ok |
| NFR-04 version immutability (structural + guard) | §3.3, §4.4, §4.6 | ok — single reachability for `module_version_immutable` |
| NFR-05 house rules | throughout | ok |
| NFR-06 tokens-only, conformance | §6 | ok — `companygraph/tokens.css` path, enforced `--view` form |

### AC → test artifact (spot summary)

AC-01..AC-10, AC-21 → named `api/__tests__/*.integration.test.ts` files (§8),
each with the specific assertions the AC text demands (incl. the AC-06
two-instance disambiguation, edge-first-fork, deleted-anchor arms; AC-08
guard-abort, `--force` refusal + survival, dry-run). AC-11..AC-15, AC-19 →
named component tests; AC-18 → playwright spec; AC-16/AC-17/AC-20 → manual
repros with input mode + observable outcome. No AC is uncovered.

## Verdict

**approve** — zero blockers. Revision 4 is a complete, internally consistent
design that traces every FR/NFR/AC of approved requirements rev 4; routes and
view names match the blueprint View Tree verbatim; all UX-* allowances and
XD-* decisions are carried by named ACs; house rules are honoured throughout;
and every as-built claim checked verifies against the shipped code. Open
items for the tasks/execution ledger: **C-13** (one-sentence transactional
fork gate in §4.4 + matching code fix in `forkInstance`) and nits
**N-13/N-14/N-15/N-16** (all one-line doc fixes). None requires a design
re-review; the remaining review budget (pass 2/2) stays unspent.
