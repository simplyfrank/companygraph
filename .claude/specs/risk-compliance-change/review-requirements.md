---
feature: "risk-compliance-change"
artifact: "requirements.md (revised, 2026-07-06)"
reviewing: "requirements"
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-06"
---

# Requirements Review: risk-compliance-change (pass 2 of ≤2)

## Verdict: approve

This is the re-review of the revision that answered pass-1's 2 blockers,
5 concerns, and 3 nits. Every pass-1 finding is resolved and I
re-verified each fix against code, not just against the revision log.
No new blockers. Two minor items are recorded below as fresh nits
(N-04, N-05) — neither blocks approval. The spec is well-grounded: its
as-built claims (aggregation count, report envelopes, router/handler id
mismatch, status enum, empty-patch codes, uuid-v4 usage, CI Postgres
service, RBAC rows) all check out against the current tree.

The review budget (1 review + 1 re-review) is now spent; this verdict
lets design proceed with the two nits carried as open notes.

---

## Pass-1 findings — resolution status (re-verified against code)

### ~~B-01~~ → resolved — "eight aggregations" corrected to five
Every site now says **five**. Summary line 21 ("five read-only
aggregation endpoints"), FR-02 (cites the five handlers
`handleRiskAggregationBy{Domain,Owner,Category,RiskType}`/`Summary` +
router lines 653-657), FR-08 ("the five aggregation reads"), and AC-13
("the 5 aggregations"). Confirmed against code: exactly five handlers at
`risk-register.ts:292,311,330,348,366`, five router lines at
`router.ts:653-657`, five RBAC rows at
`rbac-permissions.ts:152-156`. The brace-list now matches the count.

### ~~B-02~~ → resolved — AC-10 no longer asserts `count:0` on the inventory
AC-10 is rewritten per-report: `regulated-activity-inventory` →
`{ domains:[], regulations:[], matrix:[] }` (asserts empty arrays, **no
`count`**); `sod-violations` → `count === 0`; `third-party-register` →
`count === 0`. Confirmed against `risk-compliance.ts`: inventory returns
`{ domains, regulations, matrix }` (lines 59-62) with no `count` key;
the other two return `{ …, count }` (lines 100, 138). NFR-04 (no
invented envelope field) is honored.

### ~~C-01~~ → resolved — empty-patch codes carved out of AC-11
AC-11 now scopes itself to "zod-rejection" cases and adds the explicit
carve-out: empty-patch rejections keep their as-built codes —
`invalid_payload` for risk-register, `bad_request` for change-requests.
Confirmed: `change-requests.ts:187` returns `bad_request`; risk-register
returns `invalid_payload`. FR-04/AC-05 and AC-11 no longer conflict.

### ~~C-02~~ → resolved — transition enum pinned to code
FR-11 and DEC-01 now cite the verified source: migration
`001_create_change_requests.sql:9` and the zod
`updateChangeRequestSchema` (`change-requests.ts:20`) **both** declare
the identical enum `('draft','pending_review','approved','rejected','released')`.
I confirmed both lines carry that exact five-value set, so
`pending_review` is a real as-built value, not an inference. Only the
allowed *edges* between statuses are flagged as the DEC-01 decision, and
the decision text instructs re-derivation if a future migration changes
the enum. Correct.

### ~~C-03~~ → resolved — `should`-descoping off-ramp added
A dedicated "`should`-descoping rule (C-03)" paragraph now follows the
Acceptance Criteria, and AC-08 (FR-11) and AC-12 (FR-10) each carry an
explicit "struck, not failed" off-ramp routed to the consolidated
report. This reconciles the two `should` FRs with the XD-17 single-shot
deterministic gate.

### ~~C-04~~ → resolved — router anchors de-lined and interleaving called out
Scope Boundaries now states ownership of `router.ts` is **partial**,
enumerates the **four (non-contiguous)** owned blocks by section comment
(`// Compliance rule routes`, `// Change request routes`,
`// Risk register routes`, `// Risk aggregation routes` +
`// Risk & Compliance routes`), and explicitly **excludes** the ontology
block at 598-624 as owned elsewhere. Confirmed against `router.ts`: the
compliance-rules block (~587-596) sits immediately above the ontology
RDF/query/rollback block, and the change-request/risk blocks sit below
it — the interleaving is real and now documented. Line numbers are
marked indicative-only.

### ~~C-05~~ → resolved — path-form vs literal `evaluate` disambiguated
FR-06, FR-12, and AC-09 now state that GET/PATCH/DELETE detail routes
move to the **path** id after FR-12, while `evaluate` stays the fixed
literal `POST /compliance/rules/evaluate` taking its id from body/query
(no `:id` segment). Confirmed against `router.ts`: `ruleOne` regex
`^compliance/rules/([^/]+)$` matches at line ~591 and extracts `id`, but
the three detail calls currently discard it; `compliance/rules/evaluate`
is dispatched as a separate literal below. FR-12 correctly names both
the router call-site edits and the handler-signature edits
(`compliance-rules.ts:67,83,111` read `?id=`) as in-scope, and DEC-03
retires the undocumented `?id=` form. AC-09 no longer implies a
path-shaped evaluate the router does not match.

### ~~N-01~~ → resolved (accurate; no change needed)
CI Postgres service confirmed at `.github/workflows/ci.yml:68-73`;
`run-migrations.ts` step at line 94. FR-13's "verify, add only if
missing" posture is correct.

### ~~N-02~~ → resolved — openapi line numbers replaced by section anchor
Motivation §2 now anchors by "the `compliance/rules` block in
`openapi.ts`." Confirmed the three compliance/rules paths are at
`openapi.ts:500,511,523` and that `risk-register`, `change-requests`,
and `risk-compliance` are absent — matching the OpenAPI-gap claim.

### ~~N-03~~ → resolved — `ids.ts` recorded as permanent `uuid` consumer
FR-10 now states the `uuid` package stays regardless because
`api/src/ids.ts:1` imports `{ v7 as uuidV7 }`, and only the
`{ v4 as uuidv4 }` route imports are removed. Confirmed both route files
import v4 (`risk-register.ts:2`, `change-requests.ts:2`) and `ids.ts`
uses v7.

---

## New findings (this pass)

### N-04 (nit) — `invalid_transition` error code is net-new and must clear the exhaustiveness assertion
FR-11/DEC-01 introduce a `400 invalid_transition`. Confirmed
`ERROR_CODES` in `api/src/errors.ts` does **not** currently contain
`invalid_transition` (only `invalid_payload` etc.). The spec already
flags this: Risk #2 requires the design to enumerate the additive
`ERROR_CODES` line + any exhaustiveness-switch update, and DEC-01 notes
"a new `invalid_transition` error code is needed (additive)." No spec
change required — recorded so the design phase does not treat the enum
edit as free. Additive per the versioning policy (no `/api/v2/` bump).

### N-05 (nit) — feature is absent from the blueprint feature inventory
`risk-compliance-change` does not appear in the blueprint's Feature
Inventory table (unlike its sibling `kpi-okr-governance`, which is
listed as a `foundation`/`must` entry). The spec's Dependencies section
says "Downstream dependents: none declared in the blueprint feature
inventory" — technically true because the feature itself is not
inventoried. The work is nonetheless directly commissioned by the
governance-backfill brief and mirrors the sanctioned `kpi-okr-governance`
foundation posture (XD-16), so this is a bookkeeping gap, not a scope
conflict. Recommend the consolidated report note that this backfill ran
outside the inventory, or add an inventory row for traceability.

---

## Completeness / Traceability

Fourteen FRs (FR-01…FR-14), fifteen ACs (AC-01…AC-15). Every FR maps to
at least one AC and every AC back to an FR; the author's Traceability
table is complete and correct. Re-verified coverage:

| FR | AC(s) | As-built verified? | Note |
|----|-------|--------------------|------|
| FR-01 risk CRUD | AC-01 | yes — envelopes, escalation default `\|\| 1` (line 151), ordering, 404s | ok |
| FR-02 filters + aggregations | AC-02, AC-03 | yes — **five** handlers/router/RBAC rows | ~~B-01~~ resolved |
| FR-03 risk validation | AC-04 | yes — zod `[1,5]` ranges (line 22), enums | ok |
| FR-04 change-request CRUD | AC-05, AC-06 | yes — `bad_request` empty-patch (line 187), JSONB, cascade | ok |
| FR-05 reviews + sign-offs | AC-07 | yes — zod role/status enums (lines 28-29,35-36), `signed_at` iff `signed` (line 247) | ok |
| FR-06 compliance CRUD + evaluate | AC-09 | yes — path vs literal evaluate disambiguated | ~~C-05~~ resolved |
| FR-07 risk-compliance reports | AC-10 | yes — per-report empty shapes | ~~B-02~~ resolved |
| FR-08 OpenAPI coverage | AC-13 | yes — 3 absent surfaces confirmed; five aggregations | ~~B-01~~ resolved |
| FR-09 zod → 400 envelope | AC-04, AC-07, AC-11 | yes — `parseWith` exists (`_helpers.ts:84`); empty-patch carved out | ~~C-01~~ resolved |
| FR-10 UUIDv7 ids (should) | AC-12 | yes — v4 in both files; `ids.ts` v7; off-ramp present | ~~N-03~~/~~C-03~~ resolved |
| FR-11 transition guard (should) | AC-08 | yes — enum pinned to migration+zod; off-ramp present | ~~C-02~~/~~C-03~~ resolved (N-04) |
| FR-12 path routing | AC-09 | yes — router extracts+discards id; handlers read `?id=` | ok |
| FR-13 Postgres in CI | AC-14 | yes — service + migrations 001/002/005 + run step | ok |
| FR-14 self-provisioning tests | AC-14, AC-15 | yes — mirrors sla-compliance pattern | ok |

**House-rule / blueprint conformance (re-affirmed):** zod-only (NFR-02),
en-US identifiers, no `tsc`, loopback `127.0.0.1:8787` (NFR-05), auth via
central router gate + `api/src/auth/` with existing `risk:*`/`compliance:*`/`change_request:*`
RBAC rows (NFR-05) — all honored, no per-route auth added. NFR-03's two
retirements (DEC-01 guard, DEC-03 `?id=`) are correctly argued as
defect fixes on an unreachable/undocumented shape, not `/api/v2/`
breaks. Platforms & Input-Modes and Native Conflicts tables present and
correctly `n/a` (API + CI only; no `pwa/` surface, so no View Tree route
is invented — UX-* and the verbatim-route rule are vacuously satisfied).

---

## Summary for orchestrator
- **Verdict:** approve
- **Blockers:** 0 (both pass-1 blockers resolved and code-verified)
- **Concerns:** 0 (all five pass-1 concerns resolved)
- **Nits:** 2 open (N-04 additive `invalid_transition` code for design to
  land; N-05 feature missing from blueprint inventory) — neither blocks
  approval; carry to design / consolidated report.
