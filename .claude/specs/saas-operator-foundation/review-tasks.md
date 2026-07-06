---
feature: "saas-operator-foundation"
reviewing: "tasks"
artifact: "tasks.md (revision 1, reviewing requirements rev 2 + design rev 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: 1
---

# Review: saas-operator-foundation — tasks.md (pass 1)

## Summary

This is a strong, unusually well-grounded tasks artifact. Every AC (AC-01…AC-19)
maps to a closing task; every FR/NFR is served; every task carries a concrete
`Verification` field (test path or `manual:` repro with input mode + observable
outcome), so the completion hook will not reject STATUS.md. The dependency graph
is a valid DAG (topological sort succeeds, 15 nodes, no cycle). No task edits a
file outside design §9's permission surface, and the ownership-guard note (reading
guide) restates the "Explicitly NOT edited" boundary correctly.

I verified the load-bearing claims against the codebase — all check out:

- `pwa/src/route.ts` `SURFACES` has ten surfaces with `kbd` "1".."9","0" all
  taken (T-10's `kbd:""` + "no App.tsx edit" is correct — there is no free
  Alt-digit slot), and `exec` (kbd "7") is a real surface to hang `operator` on.
- `parseHash`/`toHash` resolve `#/<surface>/<tab>` generically and support a
  third `entityId` segment; `#/explorer/domain-detail/<id>` is a real virtual tab
  (`EXPLORER_VIRTUAL_TABS`, `route.ts:152`) already produced verbatim by
  `DomainCard.tsx:219` — T-13's deep-link target is grounded, not invented.
- `pwa/src/views/_shared.tsx` exports `ViewRegion`, `Loading`, `EmptyState`,
  `ErrorState`, `ViewHeader` — every catalog primitive T-03/T-13/T-14 name exists.
- `ModelTabPlaceholder` exists as the precedent T-03 twins.
- `createModel` (`models.ts:55`) and `attachDomain` (`models.ts:256`) exist with
  the cited signatures; `seed-rbac-roles.ts` uses the direct-driver
  `MERGE (…) ON CREATE SET` pattern T-07 reuses (`:RBACRole`/`:Persona` at
  lines 157/177) — T-07's `:Role` claim is a faithful extension, not a fork.
- `createRiskSchema` (`risk-register.ts:7`) is a module-private `const` (NOT
  exported) — T-04's "do not import it, hand-build the literal" is correct; the
  literal `{name, owner, domain, likelihood, impact, status, trend, description?}`
  exactly matches the schema's required fields (verified).
- Routes `query/cypher` (`query:read`), `risk-register` (`risk:write`), `slas`
  (`sla:write`), `compliance/rules` (`compliance:write`), `personas`
  (`persona:write`) all exist and are permission-mapped as the pins claim.
  `slaCreateRequestSchema` (kpi-sla) and `complianceRuleSchema` (ontology) are
  exported and importable — T-04's asymmetry (build from schema for SLA/compliance,
  hand-build for risk) is correct.
- The router gate injects a full-permission `devSession()` when `ONELOGIN_ISSUER`
  is unset (`router.ts:333-355`), so the loader/helper/persona loopback POSTs pass
  the gate the same way the existing `seed.ts` does — the deferred-green tests are
  runnable.

No blockers. Two minor concerns and two nits below; none requires a re-review.

## Findings

### Blockers

None.

### Concerns

**C-01 — "Order: tasks execute top-to-bottom" contradicts the T-12/T-13
dependency edges.**
The reading guide asserts (line 17): *"Order: tasks execute top-to-bottom.
Dependencies are explicit … no out-of-order execution."* But T-12 is listed
**above** T-13 in the file, while T-12 declares `Blocked by: T-03, T-10, **T-13**`
and T-13 declares `Blocks: T-12`. So following the literal top-to-bottom order
would execute T-12 before its own blocker T-13 — a direct contradiction of the
guide's own rule. The `Blocked by`/`Blocks` fields are internally consistent and
authoritative (the DAG is acyclic and correct: T-11→T-13→T-12→T-14), and the
final Traceability paragraph is fine — only the "top-to-bottom == valid order"
promise is wrong for this pair.
*Recommendation:* either swap the file order of T-12 and T-13 (list T-13 before
T-12, matching the topological order) or soften the reading-guide line to
"execution order is the dependency graph, not the numeric order — see each task's
`Blocked by`." Either is a one-line edit; the dependency fields need no change.

**C-02 — AC-02 closure is split across T-14 and T-15, but the Traceability table
attributes AC-02 only to T-14 (boundary) and T-15 without stating each half's
scope; the two halves overlap on the `git diff` schema-array check.**
AC-02 has two obligations: (a) *no txn-entity nodes seeded* and (b) *no
`shared/src/schema/{nodes,edges}.ts` additions*. T-15's steps assert (a) via a
Neo4j query and reference (b) via "Pair with the CLI check in T-14"; T-14's steps
assert (b) via `git diff`. This is correct but the closure is diffuse: T-15's
`Verification` says the no-txn test *plus* a `manual: git diff` of the schema
files, and T-14 also runs that same `git diff`. The redundancy is harmless but it
means neither task solely "closes" AC-02, and the T-14 row already carries AC-16,
AC-18, and the AC-02 boundary — a heavy task.
*Recommendation:* make T-15 the sole closer of AC-02 (it already runs both the
node query and the schema `git diff`) and downgrade T-14's AC-02 line to "supports
(boundary sweep, also covered by T-15)", so exactly one task owns AC-02's DoD.
Cosmetic — does not block.

### Nits

**N-01 — Design §6.4 still says the FunctionMap root is `<section aria-label>`;
tasks correctly upgrade it to catalog `ViewRegion` (N-04).**
T-13 and T-03 pin `ViewRegion` (right — it is the catalog landmark, UX-05/NFR-06),
which is *stricter* than design §6.4's raw `<section>`. This is the tasks author
correctly landing the design-review N-04 pin over a stale design sentence. No
action needed in tasks; flagged only so the implementer trusts the task over the
design prose. (The `ModelTabPlaceholder` precedent uses a raw `<section>`; T-03's
`ViewRegion` is an intentional, defensible improvement.)

**N-02 — No task explicitly states the loopback POSTs run under the
`ONELOGIN_ISSUER`-unset dev session.**
T-04 (helpers), T-08 (personas), T-09 (loader), and AC-19 all `fetch` the loopback
API with no auth header. This works only because the gate injects a
full-permission `devSession()` when `ONELOGIN_ISSUER` is unset (verified,
`router.ts:333-355`) — the same contract `api/scripts/seed.ts` relies on. The
tasks lean on this implicitly. A one-line note in the T-09/T-04 steps
("loopback POST under the dev-session gate, ONELOGIN_ISSUER unset, as `seed.ts`
does") would save an implementer a debugging detour if they run integration tests
with an issuer configured. Optional.

## Completeness / Traceability

Every AC has a closing task; every task has a verification artifact. Verified:

| AC | Closing task(s) | Verification artifact present? | Grounded? |
|----|-----------------|-------------------------------|-----------|
| AC-01 | T-05 | `saas-operator-root.integration.test.ts` | yes — `createModel` verified |
| AC-02 | T-15 (+T-14 boundary) | no-txn test + `git diff` | yes (see C-02) |
| AC-03 | T-06 | `saas-operator-domains.integration.test.ts` | yes — `attachDomain` verified |
| AC-04 | T-07 | `saas-operator-catalog.integration.test.ts` | yes — `operatorSeedKey` MERGE, retail CRM untouched asserted |
| AC-05 | T-07 (role) + T-08 (persona) | same catalog test | yes — `:Role` vs `:RBACRole` correct; persona nested marker correct |
| AC-06 | T-09 | `saas-operator-seed-loader.integration.test.ts` | yes — `readdirSync` + `.gitkeep` empty no-op |
| AC-07 | T-09 | same loader test | yes — `realImport` MERGE-on-id |
| AC-08 | T-09 | `saas-operator-seed-lifecycle-guard.integration.test.ts` | yes — guard at `import.ts:167-185` verified |
| AC-09 | T-10 | `business-routes.test.ts` | yes — `SURFACES`/`parseHash` verified |
| AC-10 | T-13 | `function-map.test.tsx` | yes — filtered count + deep link grounded |
| AC-11 | T-13 | `function-map-states.test.tsx` | yes — `Loading` exists |
| AC-12 | T-13 | `function-map-states.test.tsx` | yes — `EmptyState` exists |
| AC-13 | T-13 | `function-map-states.test.tsx` | yes — `ErrorState` + retry |
| AC-14 | T-11 (css) + T-13 (tsx) | `design-conformance.ts --view` ×2 | yes — script + two-invocation form verified |
| AC-15 | T-13 | `manual:` keyboard walk | yes — input mode + observable outcome present |
| AC-16 | T-14 | `business-functions-reload.spec.ts` | yes — `pwa/playwright/` exists |
| AC-17 | T-03 (part) + T-12 | `business-placeholder.test.tsx` | yes — `useActiveModel` + placeholder |
| AC-18 | T-14 | `bun run typecheck` + `git diff --stat` | yes |
| AC-19 | T-04 | `saas-operator-seed-helper.integration.test.ts` | yes — routes + schema privacy verified |

FR/NFR coverage (from the tasks' own map, spot-checked): FR-01→T-05, FR-02→T-15,
FR-03→T-06, FR-04→T-01/T-07, FR-05→T-01/T-07/T-08, FR-06→T-04, FR-07→T-02/T-09,
FR-08→T-09, FR-09→T-09, FR-10/FR-11→T-10, FR-12→T-07/T-08, FR-13→T-03/T-12,
FR-14→T-11/T-13, FR-15→T-05/T-13/T-14; NFR-01→T-07/T-14/T-15, NFR-02→T-05/T-06/T-09,
NFR-03→T-10/T-12/T-14, NFR-04→T-04, NFR-05→T-14, NFR-06→T-11/T-13. **Complete.**

**Checklist:**
- [x] Every AC-* appears in ≥1 task
- [x] Dependency order has no cycles (topological sort: 15 nodes, acyclic)
- [x] No task modifies more than 3 files (every task lists 1–2 files)
- [x] Complexity ratings realistic (T-09 `complex`, T-13 `complex` — the two
      hardest, correctly rated; simples are genuinely mechanical)
- [x] Validation checkpoints include transpile checks (`bun run typecheck` after
      every task; design-conformance for every touched `pwa/src/views/` file)
- [x] Execution order matches dependency graph — **except the "top-to-bottom"
      prose vs T-12/T-13 (C-01)**
- [x] Every task has a verification artifact (test path or `manual:` repro)

## What's done well

- The **Design-basis pins** table is exemplary: it front-loads every binding
  decision (OQ-1/OQ-4 identity, B-01 `operatorSeedKey` marker, B-02 `:Role` vs
  `:RBACRole`, C-06 nested persona marker, C-07 re-seed convergence asymmetry, the
  D-1/D-2/D-3 as-built route strings) so the implementer never re-derives them —
  and each pin cites a real line I could verify.
- The **deferred-green rule** is honest about what runs where (unit vs
  integration vs Playwright) and ties each to the stack requirement.
- Ownership boundaries are enforced twice (reading guide + T-14 boundary sweep +
  AC-18 `git diff`), which is exactly right for a fan-out barrier whose whole job
  is to not let siblings collide.

## Verdict

**approve.** Zero blockers. Two cosmetic concerns (C-01 ordering prose, C-02 AC-02
closer split) and two nits — all landable in-place without a re-review. The tasks
are traceable, verifiable, correctly ordered by their dependency fields, and
respect every house rule and ownership boundary. Recommend the author fix C-01
(one-line) during execution; C-02/N-01/N-02 are optional polish.
