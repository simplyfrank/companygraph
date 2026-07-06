---
feature: "saas-metric-library"
reviewing: "design"
artifact: "design.md (rev 1 — first design pass; requirements rev 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "1 of at most 2"
---

# Design Review: saas-metric-library

## Summary

This design is unusually well-grounded. Every load-bearing mechanism it relies on
was verified against the tree and holds:

- **OQ-1 (a) is real and clean.** `MEASURES` is a fresh name
  (`grep -rn MEASURES shared/src api/src pwa/src` → empty, confirmed). The generic
  `POST /api/v1/edges` route accepts a runtime-registered type because
  `edgeCreateSchema.type` is deliberately `z.string().min(1)`, **not**
  `z.enum(EDGE_TYPES)` (`shared/src/schema/edges.ts:52-56`), and the endpoint
  whitelist is resolved from the runtime `_OntologyEdgeEndpoint` registry via
  `getEdgeEndpoints` (`api/src/storage/edges.ts:49`), not the compile-time matrix.
  So registering `MEASURES` with a `KPI→MetricDefinition` pair via `createEdgeType`
  is sufficient — zero `EDGE_TYPES`/`EDGE_ENDPOINTS` edit, zero guard edit.
- **The lifecycle guards pass.** `MEASURES ∉ LIFECYCLE_EDGES` and
  `MetricDefinition ∉ LIFECYCLE_LABELS` (`api/src/storage/model-lifecycle-guard.ts:18-31`
  — the sets hold exactly the 4 model labels + 5 model edges the design names),
  so both `POST /api/v1/edges {type:MEASURES}` and
  `POST /api/v1/nodes/MetricDefinition` (`handleNodePost`, `nodes.ts:32`, resolves
  the label via `parseRegistryLabel`) clear their guards.
- **The XD-06-erratum required by requirements B-01 is recorded** in
  `blueprint-saas-operator.md` (lines 153, 237-240) naming the edge `MEASURES`
  verbatim. The design does not silently diverge from app-level law.
- **RBAC / error-code claims verify.** `ontology:write` (rbac-permissions.ts:89/94),
  `node:write`/`node:read` (:51-54), `edge:write` (:57), `query:read` (:67),
  `data:write` (:45) all present; `kpi_metric_already_linked` is correctly **not**
  an `ERROR_CODES` member, and the design keeps it helper-local rather than
  extending the closed wire enum.
- **PWA precedents verify.** `pwa/src/views/_shared.tsx` is a single file (not a
  dir) exporting `ViewRegion`/`ViewHeader`/`Loading`/`EmptyState`/`ErrorState`
  with exactly the signatures the design uses; `FunctionMap.tsx:23` imports them
  `from "../_shared"`; the foundation design pins the
  `metrics: () => <BusinessTabPlaceholder tab="Metrics" spec="saas-metric-library" />`
  line this feature replaces (`saas-operator-foundation/design.md:543`).

No blockers. Six FRs and all NFRs are covered; every AC traces to a design element
and a test artifact. Findings below are concerns and nits only.

## Findings

### Blockers

None.

### Concerns

**C-01 — AC-17's "linked KPI activates on Enter" is untestable in read-only v1.**
§6.5 says the per-metric KPI list is "read-only, optional in v1," yet AC-17 (from
requirements) asserts "any linked KPI activates on Enter" and §6.5 promises a
native anchor deep-linking into Explorer via `toHash({surface:"explorer", …})`.
If the KPI-per-metric list is not shipped in v1 (the seed carries **no** `MEASURES`
edges — Rule D — so a freshly-seeded catalog has zero KPIs to list), AC-17's
Enter-activation clause has no DOM target and the manual repro cannot be executed
as written. **Recommendation:** in tasks, pin explicitly whether the KPI list ships
in v1. If it does not, reduce AC-17's scope to "focus lands on the ViewRegion
landmark, then the category filter, then each metric row in DOM order" and drop the
KPI-Enter clause (or move it to a follow-up spec that authors KPI→metric links).
If it does, the design must state where the per-metric KPI read comes from (a second
cypher `MATCH (k:KPI)-[:MEASURES]->(m) …`) — currently §6.4 fetches only the metric
list, so the KPI list has no data source.

**C-02 — The §5.3 cardinality guard is advisory-only, and AC-05 over-claims.**
§5.3's own callout concedes the guard is "advisory-in-the-helper, not a hard graph
constraint: a raw `POST /api/v1/edges` could still create a second `MEASURES` edge."
That is honest and correctly scoped to what requirements OQ-2 (a) accepts. But the
FR-03 write path is the *only* enforcement, and **content specs are told they may
"replicate the two-step check"** (§5.3) rather than import the helper — meaning the
invariant depends on every downstream author reproducing a read-before-write
correctly, with a TOCTOU race between the count-check and the edge write. AC-05 as
written only proves the helper rejects a second link; it does not (and cannot)
prove the invariant holds against a direct route write. **Recommendation:** keep
the write-path guard (a hard Neo4j constraint is correctly rejected in §12 as
out-of-ownership), but (a) make the helper the **single sanctioned** path in tasks
(drop the "or replicate" escape hatch, or make replication a copy of the exported
helper), and (b) note in AC-05 that enforcement is write-path-scoped, so a later
reviewer of a content spec does not mistake it for a graph-level guarantee.

**C-03 — Empty-state seed command now contradicts the approved requirements text.**
§6.4 (empty state) prompts `bun run seed:saas-metric-library`; requirements FR-11
prompts `bun run seed:saas-operator`. The design's command is the *correct* one
(OQ-4 (ii) makes the seed feature-owned, §5.4/§7), so this is a beneficial
correction — but AC-14's verification does not pin the exact string, and the
requirements text is now stale. **Recommendation:** none blocking; ensure the
AC-14 test asserts the design's command string (`seed:saas-metric-library`) so the
empty-state copy and the actual script name can't drift, and note the requirements
FR-11 wording is superseded.

### Nits

**N-01 — Two stale line-number citations in §2.1/§3.2.** §2.1 cites
`assertEndpointLabelsExist` at `edge-types.ts:218`; it is defined at
`edge-types.ts:150` and *called* at :218. §3.2 repeats the :218 citation for
`assertEndpointLabelsExist`. Substance is correct (the function exists and gates
the endpoint-label existence check); only the "defined at" line is off. Similarly
§6.4 / requirements cite `api.cypher` at `api.ts:157`; it is at `api.ts:159`.
Harmless drift — no action required beyond awareness that these are call-sites, not
definitions.

**N-02 — `additionalProperties: true` weakens the "four enforced attributes" claim
only for extras, which is intended.** §3.1 sets `additionalProperties: true` so
supplementary keys stay open while `required` + the two `enum`s enforce the four
core attributes. This is correct and matches FR-04's "free supplementary keys," but
worth confirming in the AC-09 test that an out-of-enum `unit`/`category` is rejected
*and* that an unrelated extra key is accepted (so a future reader doesn't read
`additionalProperties: true` as "attribute enforcement is off").

**N-03 — Roster count is 20 vs the blueprint's "17 + …".** §4 freezes exactly 20
metrics (17 blueprint-named + LTV:CAC, Rule of 40, Deploy Frequency). This is
consistent with requirements C-02 (freeze the "…" at design time) and the three
additions are all from the requirements' explicit candidate list. No action — noting
only that AC-06's set-equality assertion and the §4 table must be edited together
if the roster ever changes (the design already says this).

## Completeness / Traceability

Every FR maps to a design element and at least one AC with a real test artifact.
Verified against requirements rev 2 and the blueprint.

| FR | Design coverage | ACs | Verdict |
|----|-----------------|-----|---------|
| FR-01 `MetricDefinition` runtime label | §3.1, §5.1 (createNodeLabel, 409-as-idempotent) | AC-01, AC-02 | Covered. Mechanism verified. |
| FR-02 `MEASURES` edge type (OQ-1 a) | §3.2, §5.2 | AC-03, AC-04 | Covered. `MEASURES` free; registry-backed endpoint resolution confirmed. |
| FR-03 KPI→metric link + cardinality | §3.3, §5.3 | AC-04, AC-05 | Covered — see C-02 (advisory enforcement scope). |
| FR-04 frozen canonical roster | §4 (20 metrics, stable ids) | AC-06 | Covered. Exact-set freeze honours C-02. |
| FR-05 seed idempotency + retail isolation | §5.4, §7 (MERGE-on-id, feature-owned path) | AC-06, AC-07 | Covered. Register-before-import ordering (Rule B) sound. |
| FR-06 lifecycle-guard-clean fixture | §5.4 (nodes-only, empty edges) | AC-08 | Covered. Guard prescan verified (`import.ts:180-184`). |
| FR-07 CRUD via generic node routes + list read | §5.5, §5.6 | AC-02, AC-10 | Covered. All routes map to existing permissions. |
| FR-08 attribute validation from schema | §3.1 (`json_schema_doc` enums) | AC-09 | Covered — see N-02. |
| FR-09 auth via central gate, no new RBAC | §5.6, §9 | AC-10, AC-11 | Covered. Zero new permission string confirmed. |
| FR-10 `MetricLibrary` view | §6.1, §6.3, §6.4, §6.6 | AC-12, AC-16, AC-17 | Covered. Catalog-first, `_shared` signatures match. |
| FR-11 four view states | §6.4 | AC-12–AC-15 | Covered — see C-03 (empty-state command). |
| FR-12 sole `views/index.tsx` edit | §6.2 (metrics: key, by-key not line) | AC-11, AC-12, AC-18 | Covered. Foundation placeholder line confirmed. |
| FR-13 keyboard/deep-link, read-only v1 | §6.5 | AC-17, AC-18 | Partial — see C-01 (KPI-list data source + AC-17 Enter clause). |
| NFR-01 no compile-time schema/store | §3, §10 | AC-01, AC-03, AC-11 | Covered. `nodes.ts`/`edges.ts` untouched; ownership §9 explicit. |
| NFR-02 idempotency + isolation | §4, §5.4 | AC-07 | Covered. |
| NFR-03 route-file single ownership | §6.2, §9, §10 | AC-11 | Covered. Only `metrics:` line + import. |
| NFR-04 house rules | §3.4, §5.6, §9 | AC-11 | Covered. zod-only, no tsc, loopback, central-gate auth. |
| NFR-05 PWA design conformance | §6.6 | AC-16 | Covered. Two-invocation design-conformance form. |
| NFR-06 ownership boundaries | §5.3, §9 | AC-10, AC-11 | Covered. §9 enumerates every not-edited owned-elsewhere file. |

**OQ resolution table (§2):** all six OQs closed; OQ-1 (a), OQ-2 (a), OQ-3
(six-value enum), OQ-4 (ii), OQ-5 (reuse `query/cypher`), OQ-6 (read-only v1). Each
resolution is consistent with the requirements' author-lean and the blueprint. §12
rejected-alternatives is thorough and each rejection cites the ownership/guard
reason.

**File Changes (§10):** all 21 paths are real or correctly-new; no placeholders.
The permission surface is coherent — new files are feature-owned; the two modify
entries (`package.json` script, `views/index.tsx` one line) are within XD-05's
allowance for a view feature.

## What's done well

- The OQ-1 (a) mechanism is not asserted but *proven* against the exact lines that
  make it work (the `z.string()` edge type, registry-backed `getEdgeEndpoints`, the
  two lifecycle sets). This is the single riskiest decision in the feature and it is
  airtight.
- Ownership discipline (§9, Rules A–D) is exemplary for a fan-out with a
  single-route-owner constraint: not one owned-elsewhere file is edited, and the
  register-before-import ordering hazard (N-02') is handled by owning the whole seed
  step rather than dropping a fixture into the foundation's scan directory.
- The frozen 20-metric roster with stable ids, closed enums, and set-equality
  AC-06 exactly satisfies requirements C-02 — no "≥ 17 floor" escape.

## Verdict

**approve.** Zero blockers. Three concerns (C-01 AC-17/KPI-list data source, C-02
advisory cardinality scoping, C-03 empty-state command string) are all resolvable
in the tasks phase without a design re-write — they refine ACs and pin task-level
choices rather than change the architecture. Recommend the author fold C-01–C-03
into tasks.md and (optionally) footnote the superseded requirements FR-11 wording;
no design re-review is required before proceeding to tasks.
