---
feature: graph-core
reviewing: requirements
reviewer: spec-review-agent
verdict: approve
reviewed_at: 2026-05-22
pass: 2
---

# Review: graph-core requirements (Pass 2 of 2 — final)

## Summary

Revision 2 of `graph-core/requirements.md` cleanly resolves every pass-1
finding. The schema is now coherent (six edge types, no inverse-pair
duplication), every API path is namespaced under `/api/v1/`, every NFR
has a corresponding AC, query depth + row caps are bounded, the seed is
locked to an exact fixture, and the CLAUDE.md replacement has a content
floor instead of just a "no old strings" check. The document is in good
shape and unblocks design.

Two new issues surfaced in the revised text — both are line-edits at the
requirements level that design can absorb without revisiting the
requirements gate. Neither is a blocker. Per the workflow's "this is the
last allowed pass" rule, the bar for `revise` is fundamental architectural
conflict; these are concerns flagged for the design author's attention.

## Verdict

**approve** — zero blockers, two concerns, three nits. Design phase may
proceed. Author should note the two concerns when scoping the design doc
(both feed into FR-12 / NFR-08 detail).

## Pass 1 → Pass 2 delta

Every pass-1 finding is verified against revision 2:

| Pass-1 ID | Pass-1 verdict | Resolution in revision 2 | Verified |
|-----------|----------------|--------------------------|----------|
| **B-01** `EXECUTES` / `PLAYS_ROLE` duplication | blocker | FR-04 line 51 — `PLAYS_ROLE` removed; `EXECUTES` (Role→Activity) is the canonical binding with explicit "no inverse `PLAYS_ROLE` edge — the inverse direction is reached via Cypher". Edge count is now 6 (down from 8) — `BELONGS_TO` also collapsed into `PART_OF` (see N-01). | ✓ |
| **B-02** `POST /edges` payload undefined | blocker | FR-06 line 53 — locks request body to `{type, fromId, toId, attributes?}` and response to `{id, type, fromId, toId, attributes, createdAt}` with explicit cross-reference to NFR-07 for the server-generated UUIDv7 `id`. AC-06 line 115 asserts the round-trip shape. | ✓ |
| **B-03** FR-13 has no AC | blocker | AC-18 line 127 covers FR-13 — fires `GET /api/v1/healthz` and `GET /api/v1/query/listDomains`, captures stdout, asserts each line has `{ts, method, path, status, durationMs}` and the query call additionally carries `cypherDurationMs`. | ✓ |
| **C-01** NFR coverage gaps | concern | AC-19 (NFR-02 bind-host), AC-20 (NFR-05 envelope), AC-21 (NFR-07 UUIDv7 + monotonicity), AC-22 (NFR-08 no-auth) all added. NFR-09 + NFR-10 (newly introduced) carry their own ACs (AC-23 and the explicit `neighbors` spelling in FR-07 / NFR-10). | ✓ |
| **C-02** `findPath` uncapped | concern | NFR-09 line 76 caps `maxDepth ≤ 8` and `≤ 1000` rows for `findPath` / `neighbors` / Cypher passthrough; AC-23 verifies both boundaries (pass at 8 / 1000, fail at 9 / 1001). | ✓ |
| **C-03** No `/api/v1/` prefix | concern | FR-06 line 53 sentence "**Every API path in this spec is mounted under `/api/v1/`**", echoed in FR-07, FR-09 (PWA proxy), FR-11, and every applicable AC (AC-06, AC-07, AC-11, AC-12, AC-14, AC-15, AC-18, AC-20, AC-23). Platforms & Input Modes table also updated. | ✓ |
| **C-04** AC-17 has no content floor | concern | AC-17 line 126 now requires (a) title contains "companygraph", (b) forbidden strings expanded to include `grammY` + `osascript`, (c) four named H2 sections (Architecture / Schema / Development / Follow-up specs or equivalents), (d) all four follow-up specs each cited at least once. Risk #6 still flags the wholesale-vs-authoritative trade-off for the design phase. | ✓ |
| **C-05** Seed too large to assert exactly | concern | FR-08 line 55 — locked to exact fixture: 4 × 2 × 4 = 32 activities, 6 roles, 6 systems, 4 locations (2 stores + 1 DC + 1 HQ wired via `PART_OF`). AC-07 line 116 asserts the exact node-count map. Edge counts intentionally left at "non-zero for every type" so seed edits are bounded only by the node count. Trade-off explicit and accepted. | ✓ |
| **C-06** Docker Desktop assumption | concern | Risk #7 enumerates Docker Desktop, OrbStack, colima, Podman 4+, Rancher Desktop with the explicit failure-mode requirement ("compose runtime not detected" not "command not found"). NFR-03 line 70 broadened. AC-15 line 124 says "supported container runtime running". | ✓ |
| **N-01** `BELONGS_TO` vs `PART_OF` | nit | Resolved by unifying both under `PART_OF` (Journey→Domain, Activity→Journey, Location→Location). Edge count dropped to 6. | ✓ |
| **N-02** `neighbours` spelling | nit | FR-07 line 54 → `neighbors` with inline note "en-US spelling — codebase convention". NFR-10 line 77 codifies the convention. README will document. | ✓ |
| **N-03** Poll cadence undefined | nit | FR-09 line 56 — "on mount, on `visibilitychange→visible`, and every 30 s while the tab is visible (no polling while hidden)". AC-14 line 123 verifies the 30-s flip. | ✓ |
| **N-04** `zod` "or equivalent" hedge | nit | Dependencies table line 172 — `zod` is now **locked**, with rationale: single ecosystem keeps API surface predictable for `ontology-manager`. | ✓ |

All 13 pass-1 findings resolved. Edge-count math (8 → 6) propagates correctly through FR-04, FR-08, FR-11, AC-06, AC-07, AC-12 — re-verified.

## Blockers

None.

## Concerns

### C-01 (pass 2) — AC-22 grep pattern will false-positive on `neo4j-driver` session calls

AC-22 line 131 verifies NFR-08 (no auth code paths) via:

> `grep -rE "(authorization|bearer|jwt|session|cookie|user_id|tenant)" api/src/ pwa/src/` returns zero production hits

The `session` token is a guaranteed false-positive: the Neo4j JS driver
mandates `const session = driver.session(); … session.run(…); session.close();`
or its `executeRead`/`executeWrite` equivalents. Any module that touches
Neo4j in `api/src/` will fail this grep on day one.

`cookie` and `authorization` are also weak: the Vite proxy config (if it
ever lands inside `pwa/src/`) sets `changeOrigin` and may touch `Cookie`
headers; CloudFront / nginx-style commentary in code may mention
`Authorization` even when no code path reads or sets it.

**Fix (design phase, no requirements re-spin needed):** Tighten the grep
in AC-22 to one of:

- Word-boundary + tokens that are unambiguously auth-related —
  `grep -rEw "(bearer|jwt|user_id|tenant_id|authenticate|authorize)"`
  and drop `session` / `cookie` / bare `authorization` / `tenant`.
- Or: keep the broad grep but allowlist via `--exclude` for known-benign
  patterns: `driver.session(`, `\.session\(\)`, `// no auth`.

The intent of NFR-08 (no auth model snuck in) is sound; only the
verification recipe needs hardening. Marking concern not blocker because
(a) design phase owns the test author's recipe, (b) the AC's intent is
clear from the surrounding text, (c) the requirements-level commitment
(NFR-08) is unambiguous.

### C-02 (pass 2) — FR-12 write validation must enforce `PART_OF` *type-pair* validity now that `PART_OF` spans three pairs

The B-01 / N-01 unification collapsed `BELONGS_TO` into `PART_OF`, so
`PART_OF` is now legal between Journey→Domain, Activity→Journey, and
Location→Location — but **not** between, say, Role→Domain or
System→Activity. FR-12 line 59 says:

> Server-side write validation: required properties present, referenced
> endpoints exist before edge creation, label/type whitelist enforced.

"Label/type whitelist" was unambiguous when each edge type bound exactly
one node-type pair (`BELONGS_TO` was Journey→Domain only). After
unification, "type whitelist" alone does not catch `PART_OF` between an
illegal pair (e.g. Role→Domain). A naive validator that only checks
`type ∈ {PART_OF, EXECUTES, USES_SYSTEM, AT_LOCATION, PRECEDES, INTEGRATES_WITH}`
will accept a Role→Domain `PART_OF` edge and write a structurally
corrupt graph.

The other edges are still single-pair (`EXECUTES` is Role→Activity,
`AT_LOCATION` is Activity→Location, etc.) so they're self-disambiguating.
Only `PART_OF` needs the extra check.

**Fix (design phase):** FR-12's "label/type whitelist enforced" should
be read as "type whitelist + per-type allowed source/target label
combinations". Either spell this out in FR-12 prose, or accept that
design phase will model the whitelist as a `Map<EdgeType, Array<[FromLabel, ToLabel]>>`
and AC-13 already covers the "wrong type" rejection path. The current
AC-13 wording ("missing required props, unknown label, dangling edge
endpoint, wrong type — each returns 400") is broad enough that the test
author *could* read "wrong type" as covering "wrong source/target label
for the chosen type" — but it's not explicit.

Concern not blocker because the requirements-level intent is correct
(validation rejects malformed edges); the gap is one of precision, and
design phase will close it naturally when writing the validator schema.
A one-sentence addition to FR-12 ("for relationship types that legally
span multiple node-label pairs — currently only `PART_OF` — the
validator enforces the allowed pairs") would tighten it now, but is not
required to unblock design.

## Nits

### N-01 (pass 2) — AC-22 production hits scope is ambiguous on co-located test files

AC-22 line 131 says "only test fixtures permitted" but greps `api/src/`
+ `pwa/src/`. Bun convention is co-located tests (`foo.ts` next to
`foo.test.ts`) inside the same `src/` tree, so the grep will include
test files unless they're separated into a sibling `__tests__/` dir.
The AC-22 verification step should clarify: either `--exclude '*.test.ts'`
on the grep, or move tests under `api/__tests__/` (which is what the
other ACs already assume — AC-03, AC-04, AC-05, AC-06, …, AC-23 all
reference `api/__tests__/*.test.ts`). Tests being under `__tests__/`
rather than co-located is consistent with the rest of the spec, so this
is probably fine as written; just worth a line in the design phase.

### N-02 (pass 2) — Edge-count assertion in AC-07 is asymmetric vs node-count assertion

AC-07 line 116 asserts exact node counts (`Domain:4, UserJourney:8,
Activity:32, Role:6, System:6, Location:4`) but for edges only "…non-zero
for every type used by the fixture…". Per the FR-08 rationale (locked
exact fixture so brittleness is bounded), it would be more consistent
to assert exact edge counts too. On the other hand, edges-per-activity
is harder to lock at requirements time without sketching the fixture
edge-by-edge, and the design-phase fixture author may want flexibility.
Either approach is defensible — flagging as nit so the design author
makes the call deliberately.

### N-03 (pass 2) — NFR-10 (en-US identifier convention) is not directly verifiable

NFR-10 line 77 codifies the en-US identifier rule but there's no AC for
it. This is acceptable for a meta/code-style NFR — the spec itself
demonstrates compliance (FR-07 uses `neighbors`) and the README
documents the convention. A lint rule (`eslint-plugin-spellcheck`) could
in theory verify it, but that's overkill for a foundation spec. Calling
it out so the design phase doesn't accidentally regress to mixed
spelling once the contributor count > 1.

## Open nits, accepted (would catch in a hypothetical pass 3 but accepted here)

- The seed fixture's exact edge counts (N-02 above) — design author's
  call.
- `id2 > id1 lexicographically` in AC-21 line 130 assumes UUIDv7's
  timestamp encoding makes them lexicographically monotonic; this is
  true for UUIDv7 spec-compliant generators but worth verifying the
  chosen library (e.g. `uuidv7` npm package) honours it. Design phase
  finding.

## Strengths

Carried forward from pass 1 and preserved through revision 2:

1. **Scope discipline is excellent** — out-of-scope list explicitly
   names the four follow-up specs and forbids auth, RBAC, multi-tenant,
   production deployment, real-time subscriptions, and migration
   tooling.
2. **Native Conflicts table is honest** — explicit `(none) | n/a | n/a`
   row matches the placeholder PWA reality, with a forward-pointer
   noting `process-explorer-ui` will populate it.
3. **Risks section is concrete and actionable** — Risk 3 (Bun + neo4j),
   Risk 4 (Cypher read-only transaction over regex), Risk 5
   (registry-based constraint runner so `ontology-manager` doesn't have
   to refactor it), Risk 7 (container runtime matrix) are the kind of
   architectural foresight that prevents a v2 spec.
4. **Idempotency called out twice** — FR-05 (schema bootstrap) and
   NFR-04 + AC-08 (bulk import) — correctly recognises two separate
   idempotency surfaces.
5. **Inherited project boilerplate acknowledged head-on** — FR-15 +
   AC-17 give the spec licence to clean up the borrowed `.claude/CLAUDE.md`,
   and revision 2's AC-17 floor (title + forbidden strings + four H2
   sections + four follow-up specs cited) closes the loophole.
6. **Verification fields present on every AC** — all 23 ACs have either
   a test path or a `manual: <repro>` with input mode + observable
   outcome. Workflow's hard rule satisfied.
7. **Revision 2 additions are surgical** — author added five ACs
   (AC-18 through AC-23) and one NFR (NFR-09) without re-architecting
   anything, demonstrating clean response to review feedback.

## Pass tracking

- This is **pass 2 of 2** for the requirements phase. The cap is
  reached; no further requirements review will be invoked.
- Next phase: **design**. The design author should keep the two pass-2
  concerns (AC-22 grep recipe + FR-12 type-pair validation for
  `PART_OF`) on the design phase's punch list — both are clean line-edits
  inside the design doc and AC-13 already provides hooks.

## Finding counts

- Blockers: **0**
- Concerns: **2**
- Nits: **3**
- Open-nit-accepted: **2**
- Verdict: **approve**
