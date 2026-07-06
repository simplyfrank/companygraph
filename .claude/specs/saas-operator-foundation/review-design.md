---
feature: "saas-operator-foundation"
artifact: "design.md (revision 2, reviewing requirements revision 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: 2
---

# Design Review: saas-operator-foundation (pass 2)

Revision 2 is a clean, code-accurate response to pass-1. Every pass-1 finding is
resolved, and I re-verified each resolution against the codebase rather than
trusting the §2.2 self-report. The compose-only strategy, idempotency-in-seed-
script model, single route-file ownership, and the B-02 import-route split all
hold. One Concern (a Persona-marker mechanism that the persona route cannot
actually satisfy) and a couple of Nits remain — none blocks approval, and all
are landable inside tasks without a re-review.

## Pass-1 findings — resolution status (re-verified)

- **~~B-01~~ → resolved.** MERGE-on-bare-`name` is dropped. §3.3/§4.3 now MERGE
  catalog Systems on a **top-level `operatorSeedKey`** marker. Verified the
  collision was real: the retail seed has `System {name:"CRM"}` at
  `shared/seed/retail-mini.json:69` (and carries no `operatorSeedKey`), so a
  MERGE on `operatorSeedKey` provably cannot match it. AC-04 (§8) now asserts
  the retail `CRM` is untouched (id + description unchanged, no
  `operatorSeedKey`) and that the operator `CRM` is a distinct node. Correct
  fix. No `System.name` uniqueness constraint exists (only `node_id_unique_*` +
  `business_model_ordinal_unique`, `bootstrap.ts:165,195`), so a plain-property
  MERGE keyed on `operatorSeedKey` adds no constraint — NFR-01 holds.
- **~~B-02~~ → resolved.** §4.3 now names the exact label per kind and the
  sanctioned path. Core `:Role` nodes are created by direct-driver
  `MERGE (r:Role {operatorSeedKey})` — the **same** pattern
  `api/src/scripts/seed-rbac-roles.ts:157` already uses (raw
  `MERGE … ON CREATE SET` against the driver, verified). `:RBACRole` is
  explicitly not seeded. `:Persona` via `POST /api/v1/personas`. Rule A now
  explicitly sanctions the direct-driver seed write as established trusted
  tooling. Accurate and reconciled.
- **~~C-01~~ → resolved.** The "reuses `createRiskSchema`" claim is dropped.
  Verified `createRiskSchema` is module-private (`risk-register.ts:7`, no
  `export`) and the two shared-package schemas ARE exported
  (`slaCreateRequestSchema` `kpi-sla.ts:172`, `complianceRuleSchema`
  `ontology.ts:686`). §3.4/§4.5 now build the risk body as a hand-constructed
  object literal; the loopback POST + route re-parse is the contract. Correct.
- **~~C-02~~ → resolved.** §4.4/§7 state the directory always exists (`.gitkeep`),
  the `existsSync` guard is belt-and-suspenders, and a `.gitkeep`-only directory
  is treated as zero `*.json`. AC-06 uses that fixture.
- **~~C-03~~ → resolved.** §6.4 constrains the count with
  `WHERE desc:UserJourney OR desc:Activity`, matching FR-14/AC-10's intent.
- **~~C-04~~ → resolved.** §6.4 confirms the six-row aggregate is within
  `runPassthrough` `TX_TIMEOUT_MS`/row caps and that any passthrough failure
  (incl. cap hit) maps to the FunctionMap error state (AC-13).
- **~~C-05~~ → resolved.** §8 rows for AC-10/AC-15/AC-16 now note the
  `seed:saas-operator` step (a) scaffold as a fixture precondition.
- **~~N-01/N-02/N-03~~ → resolved.** The phantom `seedKey_marker` is replaced by
  `operatorSeedKey`; §5 FR-01 is narrowed to the `createModel` storage call; the
  Deviations Register + AC-19 target the as-built `/api/v1/slas` and
  `/api/v1/compliance/rules` verbatim.

## Blockers

None.

## Concerns

### C-06 — Personas cannot carry a *top-level* `operatorSeedKey`; `POST /api/v1/personas` writes only a nested `attributes` map

§3.3 states operator personas carry "an `attributes.seedKey` **and** a top-level
`operatorSeedKey` marker," and §4.3 (`ensurePersonas`) checks idempotency by a
"`GET /api/v1/personas` filter, then also checking `operatorSeedKey`." But the
persona create route does a raw `CREATE (p:Persona { … attributes: $attributes … })`
(`api/src/routes/persona.ts:32-42`) — it does **not** accept or set any
top-level `operatorSeedKey` property; whatever the caller passes lands **inside**
the `attributes` map only. So a persona seeded through the sanctioned route
(which the design correctly refuses to edit, NFR-04) can never carry a
`top-level operatorSeedKey` the way Systems and Roles (direct-driver MERGE) can.
This makes the §3.3 "top-level `operatorSeedKey` marker" claim for Personas
unachievable as written, and the §4.3 "check `operatorSeedKey`" is really a check
of `attributes.operatorSeedKey` (nested), not a top-level property.

This is not a Blocker: persona idempotency does not actually depend on a
top-level marker — the design's own pre-create name lookup (keyed on the operator
persona `name`, disambiguated from `model-workspace-core`-seeded personas such as
`Business Architect`, `seed-rbac-roles.ts:177`) is sufficient, and the marker
can live nested in `attributes`. The inconsistency is confined to the marker's
*location* for Personas versus Systems/Roles.

**Recommendation:** In §3.3/§4.3, state that for Personas the operator marker
lives at `attributes.operatorSeedKey` (nested, because the persona route only
writes the `attributes` map), while Systems/Roles carry it top-level (direct
MERGE). Keep the primary persona idempotency key as the operator persona `name`
lookup. Carry this into the tasks so the AC-05 test asserts the nested location
for personas, not a top-level property. (Landable in tasks; no re-review needed.)

### C-07 — `ensureRoles` re-affirm write clobbers `attributes_json` on `ON MATCH` for Systems but not Roles — minor asymmetry, confirm intent

§4.3's `ensureSystems` `ON MATCH SET … s.attributes_json = $attrs` re-writes the
whole attributes blob on every re-seed (converges the operator's own node —
safe, since the MERGE can only match the operator node). `ensureRoles`'
`ON MATCH SET` deliberately omits `attributes_json` (leaves `{seedKey}` as first
written). The asymmetry is defensible but undocumented. If a content spec ever
depends on a re-seed refreshing a Role's `seedKey`/attributes, the Role path
won't do it. **Recommendation:** One sentence stating the intended re-seed
convergence semantics per kind (Systems converge attributes; Roles keep
first-written attributes) so the AC-04/AC-05 idempotency tests assert the right
post-state. Nit-adjacent; optional.

## Nits

### N-04 — FunctionMap uses a raw `<section aria-label>` where the catalog exports `ViewRegion`

§6.4 specifies the accessibility landmark as `<section aria-label="…">`. The
shared catalog (`pwa/src/views/_shared.tsx`) already exports a `ViewRegion`
landmark component (used by the ux-conformance suite,
`__tests__/ux-conformance/shared-primitives.test.tsx`), and UX-05 in the
blueprint names `ViewRegion` as the landmark primitive. Using a raw `<section>`
slightly contradicts NFR-06/UX-02 "catalog components before inventing new
ones." Recommendation: use `ViewRegion` (or note why a raw section is required)
so AC-14/AC-15 assert against the catalog primitive.

### N-05 — §6.3 cites `pwa/src/views/_shared` as the catalog source — accurate but it is a file, not a directory

Verified `_shared` resolves to `pwa/src/views/_shared.tsx`, which exports
`ViewHeader`, `Loading`, `ErrorState`, `EmptyState`, `ViewRegion`,
`NotFoundPanel` — exactly what `DomainDetail.tsx:5` imports and §6.3/§6.4 reuse.
No action needed; noting only that the empty-state prompt (AC-12) should reuse
the exported `EmptyState`, and loading (AC-11) the exported `Loading`, to keep
the "catalog first" promise concrete in tasks.

## Completeness / Traceability

Every FR and NFR maps to a design section and at least one AC; re-verified
against requirements rev 2. Credit where due — this design's code grounding is
unusually thorough and I confirmed the load-bearing claims independently.

| FR / NFR | Design coverage | AC | Status |
|----------|-----------------|----|--------|
| FR-01 operator root (idempotent, OQ-1) | §3.1, §4.1 — `createModel` + name/`saasOperatorRoot` lookup | AC-01 | ok (verified `createModel` `models.ts:55`, server-gen id + ordinal) |
| FR-02 process-layer only, no txn entities | §3.3, §4.4 | AC-02 | ok |
| FR-03 six domains, `seedKey` handle, idempotent | §3.2, §4.2 — lookup-before-`attachDomain` | AC-03 | ok (verified `attachDomain` server-gens id, no MERGE — `models.ts:256`) |
| FR-04 shared System catalog | §3.3, §4.3 | AC-04 | ok — B-01 fixed via top-level `operatorSeedKey`; retail `CRM` provably safe |
| FR-05 Persona/Role catalog | §3.3, §4.3 | AC-05 | ok — B-02 fixed (`:Role` via direct MERGE; `:RBACRole` untouched); **C-06** persona marker location |
| FR-06 governed-API seed helper | §4.5, §5 | AC-19 | ok — C-01 fixed; routes verified (`risk-register` `643`, `slas` `779`, `compliance/rules` `588`) |
| FR-07 dir-iterating loader | §4.4, §7, §9 | AC-06 | ok (verified `POST /api/v1/import`→`realImport`, `router.ts:410`; guard `import.ts:167-185`) |
| FR-08 loader idempotency + scoping | §4.4 | AC-07 | ok (MERGE-on-id via `realImport`) |
| FR-09 lifecycle-guard compat | §4.4 | AC-08 | ok (guard verified) |
| FR-10 `#/business` surface + 4 tabs | §6.1 | AC-09 | ok (verbatim View-Tree tabs; sole-owner `route.ts`; 10 slots occupied `route.ts:14-112`) |
| FR-11 `#/exec/operator` tab | §6.1 | AC-09 | ok (reuses `exec` surface kbd 7, `route.ts:78`) |
| FR-12 route-permission mapping | §4.3, §5 | AC-05, AC-18 | ok (all routes pre-mapped in `rbac-permissions.ts`; no new permission) |
| FR-13 view registration + placeholder | §6.2, §6.3 | AC-17 | ok (`ModelTabPlaceholder` precedent verified `views/index.tsx:59`) |
| FR-14 FunctionMap 4 states | §6.4 | AC-10..15 | ok — C-03/C-04 fixed; **N-04** landmark primitive |
| FR-15 default-to-operator context | §4.1, §6.4 | AC-16 | ok (`useActiveModel` verified `ActiveModelContext.tsx:121`) |
| NFR-01 no new store/labels | §3, §9 | AC-02, AC-18 | ok (no schema-array edit; `operatorSeedKey` is a plain property, no constraint) |
| NFR-02 idempotency + retail isolation | §4.1, §4.3, §4.4 | AC-01, AC-07 | ok — B-01 fix removes the retail-mutation risk; AC-04 asserts retail `CRM` untouched |
| NFR-03 route-file single ownership | §6.1, §6.2, §9 | AC-09, AC-18 | ok |
| NFR-04 governed-API only | §4.5, §9 | AC-19 | ok (explicit NOT-edited list; C-06 respects it — no persona-route edit) |
| NFR-05 house rules | Rule A/D, §5 | AC-18 | ok |
| NFR-06 tokens-only + design-conformance | §6.5 | AC-14 | ok — N-04/N-05 refine catalog-first |

**Verified accurate against code (re-confirmed pass 2):** the retail `CRM`
System collision + its lack of `operatorSeedKey` (`retail-mini.json:69`); the
`seed-rbac-roles.ts` direct-driver `MERGE (:RBACRole)` / `MERGE (:Persona)`
pattern (`:157`/`:177`) — and that it never touches `:Role`; `createModel` /
`attachDomain` server-gen-id, no-MERGE signatures; the `realImport` lifecycle
pre-scan (`import.ts:167-185`); the two-route split (`handleImport`
`router.ts:410` vs `handleOntologyImport` `:545`); all governed route strings +
permissions (`risk-register`→`risk:write`, `slas`→`sla:write`,
`compliance/rules`→`compliance:write`, `query/cypher`→`query:read`,
`personas`→`persona:write`); `SYSTEM_KINDS = [functional, agentic,
ai_predictive]`; the ten occupied `Alt+[0-9]` slots (`route.ts:14-112`,
`App.tsx:51`); `ModelTabPlaceholder`; the `_shared.tsx` catalog exports;
`useActiveModel`; and the `explorer/domain-detail` virtual tab the FunctionMap
deep-links target (`route.ts:152`, `views/index.tsx:92`). Routes taken verbatim
from the blueprint View Tree — none invented or renamed.

## Verdict

**approve** — all pass-1 Blockers (B-01 System name collision; B-02 `:Role`
seed path) and Concerns are resolved and independently re-verified against the
codebase. The remaining findings are one Concern (C-06 — the persona marker
must live nested in `attributes`, not top-level, because `POST /api/v1/personas`
writes only the attributes map; persona idempotency still holds via the name
lookup) and Nits (C-07 re-seed asymmetry, N-04 `ViewRegion` landmark, N-05
catalog-first for empty/loading states). None requires an architectural change;
all are landable in the tasks phase. This is review pass 2 of at most 2 — the
design is approved to proceed; carry C-06/N-04 into tasks so the AC-05/AC-14/
AC-15 tests assert the corrected details.
