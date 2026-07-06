---
feature: "saas-metric-library"
reviewing: "requirements"
artifact: "requirements.md (revision 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "2 of 2"
---

# Review: saas-metric-library / requirements.md (rev 2)

## Verdict: approve

Revision 2 resolves every actionable finding from rev-1. B-01's collision is
fully framed (FR-02 + OQ-1 + the XD-06-erratum caveat + a REVIEW-STATUS header
that surfaces it to the orchestrator); C-01's false "ensure-hook seam" premise
is corrected and now matches the real loader; C-02 freezes the catalog to an
exact design-table roster; C-03 pins the `_shared` import path; N-01/N-02 are
folded in. The one open item — OQ-1 — is a genuine architectural decision the
requirements artifact **cannot** resolve on its own (it needs a user pick and,
for option (a), a blueprint erratum); the spec correctly surfaces it as the sole
blocking Open Question rather than pretending to close it. That is the right
state for a requirements artifact to enter the design gate in. Approve, with
OQ-1 recorded as an open concern the design phase must not start without.

I re-verified every code claim rev-2 touches against the tree; all hold.

---

## Resolution of prior findings

- **~~B-01~~ → resolved (as a requirements-artifact matter).** The collision is
  fully specified: FR-02 states it, OQ-1 lists options (a)/(b)/(c) with the
  author's reasoned recommendation, the XD-06-erratum obligation for option (a)
  is spelled out, and lines 16–20 add a REVIEW-STATUS header surfacing the open
  blocker to the orchestrator. Verified against reality: `INSTANTIATES` is in
  `LIFECYCLE_EDGES` (`api/src/storage/model-lifecycle-guard.ts:28`);
  `assertNotLifecycleEdge` gates both `POST /api/v1/edges`
  (`api/src/routes/edges.ts:14,33`) and the import pre-scan
  (`api/src/routes/import.ts:184`). The collision is real and honestly framed.
  **This remains an OPEN user decision** — carried below as a live concern, not a
  spec defect. A requirements artifact cannot pick the option for the user.
- **~~C-01~~ → resolved.** OQ-4 (line 240) now correctly states the foundation
  loader has **no** pluggable ensure-hook seam and reframes the choice as
  (i) a foundation-owned `seed-saas-operator.ts` edit vs (ii) a self-owned
  `seed:saas-metric-library` step. Verified against
  `api/scripts/seed-saas-operator.ts`: the ensure sequence is hardcoded
  (`ensureOperatorRoot` → `ensureFunctionDomains` → `ensureSystems` →
  `ensureRoles` → `ensurePersonas`, lines 37–41) followed by a fixed
  `readdirSync` of `shared/seed/saas-operator/` (line 44+). No seam exists.
  Author's lean toward (ii) keeps the feature inside its ownership boundary.
- **~~C-02~~ → resolved.** FR-04 (line 94) now mandates an **exact frozen
  design-table roster** (`name, seed id, formula, unit, category, benchmark`),
  and AC-06 (line 177) asserts set-equality against it (no missing/no extra),
  not a bare ≥17 floor. The 17 blueprint metrics are the mandatory minimum.
- **~~C-03~~ → resolved.** FR-10, NFR-05, and Dependencies now cite
  `from "../_shared"` matching `FunctionMap.tsx:23` verbatim. Verified: the
  catalog components (`ViewRegion`/`ViewHeader`/`Loading`/`EmptyState`/
  `ErrorState`) live in the single file `pwa/src/views/_shared.tsx`, and
  `FunctionMap.tsx:23` imports them via `from "../_shared"`.
- **~~N-01~~ → resolved (with a stale number, N-01' below).** The prose now
  instructs the design to reference the `metrics:` **key**, not the line.
- **~~N-02~~ → resolved.** FR-13 + OQ-6 pin read-only-v1 and state explicitly
  that AC-12..AC-18 cover only the read/browse surface, adding an editor AC only
  if the user elects one at design time.

---

## Findings (rev 2)

### Blockers

None new. OQ-1 is carried as a live open question (see below) — it is the
author's own declared blocker and is correctly surfaced to the orchestrator, not
a defect in the artifact.

### Concerns

**C-01 (open, carried) — OQ-1 must be user-decided before design starts.**
Not a spec defect; a genuine decision the artifact cannot make. FR-02, FR-03,
AC-03, AC-04 are all pinned to an edge name/route that OQ-1 leaves open. The
design phase must not begin until the user picks (a)/(b)/(c), and — if (a) — the
one-line XD-06 erratum is recorded in `blueprint-saas-operator.md`. Author's
recommendation (a) `MEASURES`/`INSTANTIATES_METRIC` is the cleanest (zero
owned-elsewhere edits, zero guard risk). Recommendation to orchestrator: route
OQ-1 to the user; do not start design on FR-02/FR-03/AC-03/AC-04 until it lands.

### Nits

**N-01' — the "line 205" reference is now stale (actual: line 172).** Lines 75,
112, and 225 still say the `metrics:` `BusinessTabPlaceholder` entry is at
`views/index.tsx:205`. In the current tree it is at **line 172**
(`pwa/src/views/index.tsx:172`). This is harmless because the same prose already
instructs the design to reference the `metrics:` **key** rather than the line
number (the exact mitigation N-01 asked for), and foundation owns and may
re-touch that file before this lands. Optional: drop the stale number entirely
rather than update it, since the key reference is authoritative.

**N-02' — FR-05/OQ-4 "also pick up idempotently" parenthetical is a latent
ordering hazard, correctly deferred.** OQ-4 notes the metric fixture "may itself
land … in `shared/seed/saas-operator/` for the foundation loader to *also* pick
up idempotently." Verified that `realImport` runs a per-row registry attribute
check (`api/src/routes/import.ts:123–124`, "Unregistered…"), so a
`MetricDefinition` node row imported by the foundation loader **before** this
feature's registration step would fail. The artifact already frames
ensure-before-import as the core of OQ-4 and leans to a self-owned step (ii),
which sequences correctly; the design must simply not adopt the "drop it in the
foundation dir" sub-option without guaranteeing registration precedes that
loader run. Flag for design; not a requirements blocker.

---

## Completeness / Traceability

Every FR maps to ≥1 AC; every AC traces to ≥1 FR. Re-verified against reality:

| FR | Covered by | Reality check (rev 2) |
|----|-----------|------------------------|
| FR-01 (MetricDefinition runtime label) | AC-01, AC-02 | `nodeLabelCreateSchema` at `shared/src/schema/ontology.ts:178` ✓; `parseRegistryLabel` path ✓; `ontology-node-labels.ts` route ✓ |
| FR-02 (INSTANTIATES endpoint pair) | AC-03, AC-04 | collision verified (`model-lifecycle-guard.ts:28`, `edges.ts:14,33`, `import.ts:184`) — OQ-1 open |
| FR-03 (KPI→metric link CRUD) | AC-04, AC-05 | `KPI` label at `shared/src/schema/nodes.ts:13` ✓; write path pinned to OQ-1 |
| FR-04 (seed catalog, exact roster) | AC-06 | C-02 resolved — exact-set freeze at design time ✓ |
| FR-05 (seed idempotency + retail isolation) | AC-07 | loader hardcoded ensure seq verified (`seed-saas-operator.ts:37–44`); ordering framed by OQ-4 ✓ |
| FR-06 (lifecycle-guard compat of fixture) | AC-08 | import pre-scan `import.ts:180,184` verified ✓ |
| FR-07 (CRUD via generic node routes + list) | AC-02, AC-10 | generic `/api/v1/nodes/:label` path ✓; OQ-5 list-route decision deferred cleanly |
| FR-08 (attribute validation from schema) | AC-09 | `realImport`/attribute-enforcement registry read verified (`import.ts:123`) ✓ |
| FR-09 (auth via central gate, no new RBAC) | AC-10, AC-11 | house-rule conformant; zero new permission strings ✓ |
| FR-10 (MetricLibrary view) | AC-12, AC-16, AC-17 | `_shared.tsx` exports verified; `FunctionMap.tsx:23` import precedent `from "../_shared"` ✓; `api.cypher` at `api.ts:159` ✓; `useActiveModel` at `ActiveModelContext.tsx:121` ✓ |
| FR-11 (four view states) | AC-12..AC-15 | UX-01 satisfied ✓ |
| FR-12 (sole views/index.tsx edit) | AC-11, AC-12, AC-18 | `metrics:` key at line 172 (not 205 — N-01'); route resolves ✓ |
| FR-13 (keyboard/deep-link; editor `should`) | AC-17, AC-18 | OQ-6 pinned read-only v1; ACs cover only read surface ✓ |
| NFR-01..06 | AC-01, AC-03, AC-10, AC-11, AC-16 | XD-02/04/05 conformant; `design-conformance.ts --view` flag verified (`scripts/design-conformance.ts:125`) ✓ |

**UX allowances:** UX-01 (FR-11/AC-12..15), UX-02 (AC-16, script + `--view`
flag verified), UX-03 (correctly N/A — no canvas; `FunnelBoard` owned by
`funnel-pipeline-modeling`), UX-04 (NFR-05), UX-05 (AC-17), UX-06 (AC-18) — all
covered. Platforms & Input-Modes and Native-Conflicts tables present and
correctly scoped (no gesture surface, `(none)` conflicts).

**Scope boundaries:** explicit and owner-named for every out-of-scope item;
ownership boundaries (XD-04/05/08) respected — no overlap with KPI CRUD, funnel,
or the sole-owned `route.ts`/`SURFACES`/`views/index.tsx` registration surface.

**Done well:** the author surfaced and honestly framed the `INSTANTIATES`
lifecycle collision (rather than shipping a design that would 409 at
`POST /api/v1/edges`), got the ensure-before-import ordering right including the
non-obvious fact that registration is not an import row, and made the seed
fixture lifecycle-guard-clean (FR-06/AC-08) — all correctness points most
authors miss. Every referenced file path, schema line, route, and precedent I
spot-checked exists exactly as cited.

---

## Verdict rationale

**approve.** All four rev-1 findings (B-01 framing, C-01 premise, C-02 roster
freeze, C-03 import path) are resolved and re-verified against the codebase; the
two nits are folded in. The sole remaining item, OQ-1, is a live user decision
the artifact correctly cannot and does not close — it is surfaced to the
orchestrator as the blocking open question, exactly as the review budget
intends. Requirements are ready to enter the design gate **contingent on the
user resolving OQ-1** (and recording the XD-06 erratum if option (a) is chosen).
Two minor items for the design phase: refresh/drop the stale "line 205" number
(N-01') and ensure the register-before-import ordering is honored if the fixture
ever lands in the foundation seed dir (N-02'). Re-review budget: this is pass
2 of 2 — no further requirements review.
