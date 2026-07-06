---
feature: "saas-operator-foundation"
reviewing: "requirements"
artifact: "requirements.md (revision 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: 2
---

# Review: saas-operator-foundation — requirements.md (rev 2)

Review pass **2 of 2** (final). Re-reviewed cold against the blueprint
(`blueprint-saas-operator.md`), house rules (`.claude/CLAUDE.md`), the dependency
spec (`model-workspace-core/requirements.md`), and the as-built code every FR
rests on (`api/src/routes/import.ts`, `api/src/router.ts`,
`api/src/storage/models.ts`, `api/scripts/seed.ts`,
`api/src/scripts/seed-rbac-roles.ts`, `api/src/auth/rbac-permissions.ts`,
`pwa/src/route.ts`).

Both pass-1 blockers are resolved with code-accurate fixes, and every pass-1
concern and nit is addressed in the artifact. What remains are two small
path-string inaccuracies (nit-level) that do not change any acceptance semantics.
The requirements are ready for design.

## Resolved from pass 1

- **~~B-01~~ → resolved.** FR-03 no longer relies on `attachDomain` supplying a
  stable client id or being idempotent. Verified against
  `api/src/storage/models.ts:256-305`: `attachDomain` does `const domainId =
  generateId()` and `CREATE (d:Domain …) CREATE (d)-[:IN_MODEL …]` with no
  MERGE — exactly as B-01 asserted. Rev-2 FR-03 closes this (OQ-4) with a
  **lookup-before-attach on `attributes.seedKey`** guard *in the seed script*,
  reusing the well-known function slugs (`marketing`/`sales`/`finance_accounting`
  /`customer_success`/`product_delivery`/`platform_ops`) as the content specs'
  stable handle, and explicitly does **not** edit the `model-workspace-core`-owned
  attach path. The rejected alternatives (fixed client id → cross-ownership edit)
  are recorded. AC-03 proves the re-run adds zero domains and no duplicate
  `Marketing`. Feasible and ownership-clean.

- **~~B-02~~ → resolved.** FR-07/FR-09/AC-08/Dependencies now name **`POST
  /api/v1/import`** (`handleImport → realImport`) as the process-content write
  path and explicitly distinguish it from `POST /api/v1/ontology/import`
  (`handleOntologyImport`). Verified against code: `router.ts:410` routes
  `import` → `handleImport`; `router.ts:545` routes `ontology/import` →
  `handleOntologyImport`; `realImport` (`import.ts`) carries the lifecycle
  pre-scan (`assertNotLifecycleLabel/Edge`, the T-23 block) that rejects
  `409 model_lifecycle_route_required` payload-atomically; and `seed.ts:14` does
  POST to `/api/v1/ontology/import`, so rev-2's "this loader deliberately does
  **not** reuse that route" is correct and the earlier false "same writer `bun run
  seed` uses" clause is gone. `model-workspace-core` FR-08 independently confirms
  "`POST /api/v1/import` joins the FR-08 lifecycle guard set." The FR-09 guarantee
  is now pinned to the route that actually contains the guard.

- **~~C-01~~ → resolved.** FR-14 stops hedging: it states `models.ts` exposes no
  such route, rules out adding one (ownership), routes the read through the
  existing `query:read` Cypher path, and names a design-scoped read-only fallback
  (owned by this foundation, `query:read`-mapped) if one call can't express the
  per-domain count. (See N-02 below on the exact path string.)

- **~~C-02~~ → resolved.** FR-05 now fixes the graph shape (graph `Role` + `Persona`
  nodes), the seed key (node `name` + `attributes.seedKey` slug), and the
  idempotency mechanism (MERGE-on-`name`), mirroring `model-workspace-core` FR-11's
  documented "MERGE by role/persona name" precedent (verified at
  `model-workspace-core/requirements.md:215`). AC-05 proves it.

- **~~C-03~~ → resolved.** FR-06 raised `should`→`must` with the barrier
  rationale, and new **AC-19** proves the helper round-trips one row against each
  named governed route (`/api/v1/risk-register`, `/api/v1/sla-crud`,
  `/api/v1/compliance-rules`) while editing none of their storage code. OQ-3
  (missing-field gap → flagged to owning spec) is retained correctly.

- **~~C-04~~ → resolved.** All three identity/idempotency questions are closed to
  their default options in-artifact, satisfying the XD-09 single-shot "zero open
  questions" gate: OQ-1 → option (a) (`name:"SaaS Operator"` + `saasOperatorRoot`
  attribute lookup), OQ-2 → option (a) (no `Alt`-digit accelerator; keyboard-
  reachable only), OQ-4 → folded into FR-03 (`seedKey` lookup). Each records the
  rejected alternative and why. No open question remains.

- **~~N-01/N-02~~ → resolved.** The loader is placed at `api/scripts/seed-saas-
  operator.ts` (matching the existing `api/scripts/seed.ts` dir and its
  `bun --cwd api scripts/…` invocation), and `seed:saas-operator` follows the
  `seed`/`seed:enriched` script precedent.

## Concerns

None blocking. (The two items below are nits, not concerns.)

## Nits

### N-01 — FR-05 inline path for `seed-rbac-roles.ts` is wrong (`api/scripts/` vs `api/src/scripts/`)
FR-05's body cites the pattern file as `api/scripts/seed-rbac-roles.ts`, but the
file is at **`api/src/scripts/seed-rbac-roles.ts`** (verified: `find api -name
seed-rbac-roles.ts`). The Dependencies section (line 211) cites it correctly as
`api/src/scripts/seed-rbac-roles.ts`, so the artifact contradicts itself. Note
that this is a *different* directory from the FR-07 loader (`api/scripts/`,
matching `seed.ts`) — both dirs legitimately exist, which is exactly why the
inconsistency is easy to miss. **Recommendation:** correct FR-05's inline
citation to `api/src/scripts/seed-rbac-roles.ts` when the design lands; harmless
so long as the design reads the right file.

### N-02 — FR-14 / Dependencies name `POST /api/v1/query`, but the route is `POST /api/v1/query/cypher`
FR-14 and the "graph query read route" dependency name `POST /api/v1/query`.
Verified against `router.ts`: there is **no** bare `/api/v1/query` route; the
generic scoped-Cypher read Explorer uses is `POST /api/v1/query/cypher`
(`handleCypher`, mapped to `query:read` at `rbac-permissions.ts:67`). The
mechanism and permission are exactly right; only the path string is imprecise,
and FR-14 already self-hedges ("the read route that runs a scoped
Cypher/traversal") with a named design-scoped fallback — so nothing downstream is
under-specified. **Recommendation:** the design should name
`POST /api/v1/query/cypher` (or the specific read it picks) precisely.

### N-03 — AC-19 platform column
AC-19 exercises the governed-route round-trip against **Postgres**-backed routes;
its Platforms cell reads "server (bun test + Postgres)" — correct, and a good
catch that this AC needs Postgres up (the other server ACs need Neo4j). No
action; noting it so the tasks phase wires the right CI service for that test.

## Completeness / Traceability

| FR | Priority | Covered by AC | Design-needed decisions | Status |
|----|----------|---------------|--------------------------|--------|
| FR-01 operator root (idempotent, OQ-1 closed) | must | AC-01 | `saasOperatorRoot` + name lookup (locked) | ok |
| FR-02 process-layer only, no txn entities | must | AC-02 | — | ok |
| FR-03 six domains, `seedKey` handle, idempotent | must | AC-03 | lookup-before-attach on `seedKey` (locked) | ok (was B-01) |
| FR-04 shared System catalog | must | AC-04 | MERGE-on-seed-id + `systemKind` | ok |
| FR-05 Persona/Role catalog | must | AC-05 | MERGE-on-name (locked); N-01 path typo | ok |
| FR-06 governed-API seed helper | must | AC-19 | round-trip proven; OQ-3 gap-flag path | ok (was C-03) |
| FR-07 directory-iterating loader | must | AC-06 | `POST /api/v1/import`/`realImport` (locked) | ok (was B-02) |
| FR-08 loader idempotency + scoping | must | AC-07 | MERGE-on-id via `realImport` | ok |
| FR-09 lifecycle-guard compat | must | AC-08 | guard pinned to `/api/v1/import` | ok (was B-02) |
| FR-10 `#/business` surface + 4 tabs | must | AC-09 | verbatim View-Tree tabs; sole-owner `route.ts` | ok |
| FR-11 `#/exec/operator` tab | must | AC-09 | reuses `exec` surface; no new accelerator | ok |
| FR-12 route-permission mapping | must | AC-05, AC-18 | reuses `model:write`/`query:read`; no new string | ok |
| FR-13 `views/index.tsx` placeholder wiring | must | AC-17 | `ModelTabPlaceholder` precedent | ok |
| FR-14 FunctionMap + 4 states | must | AC-10..AC-13, AC-15 | read via `query/cypher` (N-02 path) | ok |
| FR-15 default-to-operator context | should | AC-16 | consumes `useActiveModel()`; OQ-1 key | ok |
| NFR-01 no new store/labels | — | AC-02, AC-18 | verified no schema-array edits | ok |
| NFR-02 idempotency + retail isolation | — | AC-01, AC-07 | now unblocked (B-01/B-02 fixed) | ok |
| NFR-03 route-file single ownership | — | AC-09, AC-18 | verified vs `SURFACES`/`route.ts` | ok |
| NFR-04 governed-API-only | — | AC-19, NFR-04 | proven by AC-19 | ok |
| NFR-05 house rules | — | AC-18 | loopback, zod, no tsc, auth gate | ok |
| NFR-06 tokens-only styling | — | AC-14 | `design-conformance.ts` verified | ok |

**Every FR now has at least one AC** (FR-06's pass-1 gap is closed by AC-19), and
**every AC maps to at least one FR**. All four FunctionMap view states are specced
(AC-10 ready, AC-11 loading, AC-12 empty, AC-13 error). The Platforms & Input
Modes and Native Conflicts tables are present, correct, and the `Alt+[0-9]`
"all ten slots taken" analysis re-verifies against `App.tsx`.

**Verified accurate against code (credit where due):** the B-02 route split
(`import.ts` `realImport` behind `POST /api/v1/import` with the lifecycle
pre-scan vs `handleOntologyImport` behind `/api/v1/ontology/import`); the B-01
`attachDomain` non-idempotency (`models.ts:256-305`, `generateId()` + `CREATE`,
no MERGE) that FR-03 now correctly works around; `seed.ts:14` posting to
`/api/v1/ontology/import`; the `query:read` Cypher route + permission; the
`model-workspace-core` FR-08/FR-11/DEC-01 precedents the FRs lean on. Single-owner
`route.ts`/`SURFACES`/`views/index.tsx` discipline (XD-05) is expressed correctly
and asserted by AC-09/AC-18.

## Verdict

**approve.** Both pass-1 blockers (B-01 domain idempotency/stable-handle; B-02
wrong import route) are resolved with fixes that match the as-built code, all
pass-1 concerns (C-01..C-04) and nits (N-01/N-02) are addressed, and the three
identity/idempotency open questions are closed to locked defaults as the XD-09
single-shot gate requires — zero open questions remain. Two residual path-string
inaccuracies (N-01 `seed-rbac-roles.ts` dir, N-02 `/api/v1/query` vs
`/api/v1/query/cypher`) are nit-level and change no acceptance semantics; the
design agent should use the corrected paths but need not re-review requirements
for them. Ready for the design phase.
