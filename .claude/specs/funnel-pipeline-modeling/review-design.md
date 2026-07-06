---
feature: "funnel-pipeline-modeling"
reviewing: "design"
reviewing_revision: 1
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-06"
---

# Review: funnel-pipeline-modeling / design (pass 1/2)

## Verdict

**approve** — zero blockers. This is a strong, unusually well-verified design. A
cold codebase check confirms every load-bearing claim: the strict-CREATE / `409
name_conflict` idempotency reality, the router's null-permission gate hole, the
`createEdge` delegation shape, the attribute-zod `required`-keyword support, the
`uuidv7` export, and every PWA precedent (`FunctionMap`, `useActiveModel`,
`api.cypher`, `_shared` catalog). All three carried-forward requirements findings
(B-03, C-05, C-06) are resolved with mechanisms that match the codebase and mirror
the already-approved sibling `saas-metric-library` design. The one genuine
divergence (D-1 — a new server route needs two additive framework wirings the
requirements understated) is honestly disclosed, correctly reasoned as a security
necessity, and kept strictly additive. Remaining items are concerns/nits that do
not block the next phase.

## Prior-review findings — resolution status

| Requirements finding | Status in design | Verified |
|----------------------|------------------|----------|
| ~~B-03~~ (re-register-via-POST is not a no-op; route is strict-CREATE `409`) | **resolved** — §2, §4.1, Rule B: `ensureFunnelOntology` POSTs each payload and treats `201` **and** `409 name_conflict` as success; AC-01 re-read as "routine run twice → exactly one label, errors nothing." | `node-labels.ts:191-193` and `edge-types.ts:206,240` both throw `name_conflict` on duplicate — confirmed. Mirrors approved `saas-metric-library` §5.1/§5.2 (`ensureMetricDefinitionLabel` / `ensureMeasuresEdgeType` use the identical `201`-or-`409`-tolerance shape). |
| ~~C-05~~ (does the `json_schema_doc` subset enforce `required: stageOrder`) | **resolved** — §3.2, §2: `json_schema_doc:{type:"object",required:["stageOrder"],properties:{stageOrder:{type:"integer"}}}`. | `jsonSchemaDocSchema` accepts `required` (`ontology.ts:71`, `z.array(z.string()).optional()`); `attribute-zod.ts` compiles the whole doc via `json-schema-to-zod` (`attribute-zod.ts:27,68-71`) before each `createNode` — confirmed. |
| ~~C-06~~ (name the `Funnel`→operator-root attachment for the listing scope) | **resolved** — §2, §3.1, §4.5: no graph attachment edge; a top-level `attributes.modelId` marker stamped at create, filtered by a `CONTAINS` prefilter + client-side exact parse. Avoids a new `PART_OF Funnel→Domain` endpoint pair (correctly deferred to content wave-2). | Reasonable and ownership-safe; see C-01 below for one soundness caveat on the `CONTAINS` prefilter. |

## Findings

### Blockers

None.

### Concerns

- **C-01 — the FR-09 listing `WHERE f.attributes_json CONTAINS $rootIdNeedle`
  prefilter can both false-positive and (in a corner case) false-negative, so the
  design's own words are load-bearing: the *authoritative* check MUST be the
  client-side parse, not the Cypher.** §4.5 correctly states the `CONTAINS` clause
  is "a coarse index-free prefilter" and that `FunnelBoard` "does the authoritative
  check by parsing each row's `attributes_json` and keeping only rows whose
  `modelId === operatorRootId`." Good — but two edge cases deserve a pinned note so
  the implementer does not treat the Cypher result as final: (a) a UUIDv7 root id
  substring could appear inside *another* attribute's value (false positive — the
  client parse catches it, fine); (b) a `Funnel` whose `modelId` is present but
  whose `attributes_json` the operator obtains from `useActiveModel()` under a
  different id representation would be dropped. The design already handles (a)/(b)
  by making the parse authoritative, but the **server integration test AC-10**
  asserts "listing scoped to the operator root's `modelId` marker excludes a retail
  funnel" — that test exercises the Cypher, not the client parse. **Recommendation:**
  in tasks, split AC-10 verification so the *authoritative exclusion* is asserted
  where it actually lives (either assert the client-side filter in the PWA test, or
  make the integration test assert the parse-level exclusion rather than trusting
  `CONTAINS` alone). Non-blocking — the design is sound; this is a test-placement
  precision the tasks phase must get right.

- **C-02 — the listing `CONTAINS` scan is unindexed and NFR-06's ≤50 ms p99 bound
  is only claimed for the single-funnel *composition* read, not the listing.**
  §4.5 notes the listing does "a `MATCH (:Funnel)` … `CONTAINS` prefilter"; NFR-06
  bounds only the FR-08 composition read (≤20 stages). At wave-2 content scale the
  `Funnel` count is tiny (marketing + sales funnels), so this is not a real
  performance risk *now*, and the design's design-only fallback (a `query:read`
  funnel route) is the correct escape hatch. **Recommendation:** state explicitly
  that the listing has no perf bound because the `Funnel` cardinality is O(funnels)
  and small, or add a one-line NFR-06 note that the unindexed `CONTAINS` scan is
  acceptable at expected scale. Immaterial to approval.

- **C-03 — D-1 widens AC-21's git-diff boundary check to permit two files
  (`api/src/router.ts`, `api/src/auth/rbac-permissions.ts`) that requirements AC-21
  explicitly lists as forbidden.** The design's reasoning is correct and the
  security argument is verified (the router gate at `router.ts:386-387`,
  `if (requiredPermission && requiredPermission !== "public")`, lets a
  null-permission route through on any authenticated session — so an unmapped
  transition route would be *weaker* than the generic `/api/v1/edges` it fronts).
  But requirements AC-21 as written asserts "no `rbac-permissions.ts` … edits" and
  the design cannot edit requirements. The design routes this through the
  Deviations Register (§2.1, D-1) for the orchestrator to land as a
  requirements-errata note. **Recommendation:** confirm the orchestrator records the
  D-1 errata against requirements AC-21 before tasks lock, and that the tasks-phase
  AC-21 verification uses the *widened* diff allow-list (§8 already restates it).
  This is a process/traceability concern, not a design defect — the two edits are
  genuinely necessary and genuinely additive. Flagging so the errata is not lost.

- **C-04 — the design depends on `saas-operator-foundation` having pre-registered a
  `business` surface + a `funnels` `BusinessTabPlaceholder` entry in
  `views/index.tsx`, but that surface does not exist in the current `views/index.tsx`
  `VIEWS` map (verified: `VIEWS` has `explorer`/`model`/`chat`/`insights`… and no
  `business` key).** This is expected — foundation is an unbuilt wave-1a dependency
  — and both requirements and design correctly scope the edit to "replace *only* the
  `funnels` entry foundation pre-registered." But §6.2's shown diff assumes a
  `business:` block with a `funnels: … BusinessTabPlaceholder` line to replace; if
  foundation registers it under a different shape, the "one import + one map line"
  claim needs re-checking at build time. **Recommendation:** add an explicit
  build-time precondition (§6.2 or §8 fixture-precondition) that the `funnels`
  placeholder entry exists in the shape the diff assumes before `FunnelBoard`
  replaces it — a dependency-ordering guard, not a design change.

### Nits

- **N-01 — §4.6 says a branch renders overall conversion as `"n/a"` but the
  composition Cypher (§4.5) has no explicit branch detection.** The linear-chain
  assumption is fine (OQ-2), and "branch → `n/a`" is the correct degradation, but
  the client derivation must detect a stage with >1 outgoing `CONVERTS_TO` to emit
  `"n/a"` rather than silently multiplying one arbitrary path. The unit test
  `funnel-board-analytics.test.tsx` should include a branch case. Optional — fold
  into the AC-11 test scope at tasks.

- **N-02 — §5's API table lists `invalid_payload` among "existing closed members"
  used by the route, but §4.4 / §3.4 only ever throw `attribute_violation`,
  `edge_endpoint_label_mismatch`, and `id_conflict`.** `readJson` failures may
  surface `invalid_payload` generically, so it is not wrong, just unreferenced in
  the flow. Cosmetic.

- **N-03 — §3.4 imports `uuidv7` from `@companygraph/shared/schema/nodes` citing
  "nodes.ts:26."** Verified correct (`nodes.ts:26` is the `uuidv7` export). No
  action; noting the citation checks out.

## Completeness / Traceability

Every FR maps to a design element and every AC to a file change + test. Verified
against requirements rev-2.

| FR | Design | ACs | Assessment |
|----|--------|-----|------------|
| FR-01 `Funnel` label | §3.1, §4.1 | AC-01 | Complete; idempotency resolved (B-03). |
| FR-02 `Stage` label | §3.2, §4.1 | AC-02 | Complete; `required:["stageOrder"]` verified (C-05). |
| FR-03 `HAS_STAGE` edge type | §3.3, §4.1 | AC-03 | Complete; endpoint-pair + `edge_endpoint_label_mismatch` path verified. |
| FR-04 `CONVERTS_TO` edge type | §3.3, §4.1 | AC-04 | Complete; registration order (`assertEndpointLabelsExist`) verified. |
| FR-05 conversion/drop-off attrs | §3.4, §4.4 | AC-05, AC-06 | Complete; range check on funnel-owned seam. |
| FR-06 node CRUD | §4.2 | AC-02, AC-07 | Complete; reuses generic path, no edit. |
| FR-07 edge writes (funnel-owned route) | §3.4, §4.3, §4.4, §5, §7 | AC-05, AC-06, AC-08 | Complete; `createEdge` delegation shape verified against `edges.ts:127`. |
| FR-08 composition read | §4.5 | AC-09, AC-09a | Complete; id-keyed isolation sound. |
| FR-09 listing read | §4.5 | AC-10 | Complete; `modelId` marker (C-01/C-02 caveats). |
| FR-10 auth/permission mapping | §5, §7 (D-1) | AC-21 | Complete; `edge:write` reuse verified (`rbac-permissions.ts:57`); D-1 errata (C-03). |
| FR-11 drop-off analytics | §4.6 | AC-11 | Complete; linear chain + `n/a` degradation (N-01). |
| FR-12 view registration | §6.1, §6.2 | AC-20, AC-21 | Complete; single `VIEWS` line (C-04 precondition). |
| FR-13 `FunnelBoard` view | §6.3, §6.4, §6.7 | AC-12..16 | Complete; four states, catalog components verified in `_shared.tsx`. |
| FR-14 interactive reorder | §6.5, §6.6 | AC-17, AC-18, AC-19 | Complete; pointer + keyboard, Native Conflicts table concrete (UX-03). |
| FR-15 (`should`) inline edit + deep-link | §6.8 | (none — OK for `should`) | Complete; `entityId` route field verified present (`route.ts` Route interface). |
| NFR-01 no compile-time schema | §3, §9 | AC-01, AC-03, AC-21 | Complete; grep confirms `HAS_STAGE`/`CONVERTS_TO` are brand-new (no collision). |
| NFR-02 route-file ownership | §4.2-4.4, §6.2, §9 | AC-06, AC-07, AC-08, AC-21 | Complete; D-1 additive-only (C-03). |
| NFR-03 idempotent registry | §4.1 | AC-01, AC-03, AC-04 | Complete (B-03). |
| NFR-04 house rules | §3.4, §5, §7 | AC-21 | Complete; zod-only, loopback, central-gate auth, `/api/v1/` all honoured. |
| NFR-05 tokens-only styling | §6.7 | AC-16 | Complete; two-invocation design-conformance form. |
| NFR-06 performance | §4.5, §4.6, §6.5 | AC-11, AC-17 | Complete for composition; listing caveat (C-02). |

**Blueprint / house-rule conformance:** XD-02 registry-only (Rule A, verified no
`shared/src/schema` edit) ✓; XD-03 no operational entities (§4.6 read-only,
scope-out) ✓; XD-05 route.ts/SURFACES ownership (Rule E — D-1 correctly notes the
API `router.ts` is a *different file* from the PWA `route.ts`; the PWA `route.ts`
stays untouched) ✓; UX-01 four states (§6.4) ✓; UX-02 tokens-only (§6.7) ✓; UX-03
Platforms & Input Modes + Native Conflicts tables present and concrete (§6.5) ✓;
UX-05 a11y (§6.6) ✓; UX-06 route verbatim `#/business/funnels` from View Tree
line 106/115 ✓. Route taken verbatim, not invented or renamed.

**Done well:** the B-03 resolution is exactly right and matches the approved
sibling; the D-1 disclosure of the router/rbac wiring is the kind of honest
deviation that prevents a build-time surprise; the security reasoning for mapping
the route (not leaving it null-permission) is correct and codebase-verified; the
rejected-alternatives section (§11) is thorough and each rejection is grounded in
a real code fact.

## Recommendation

Approve for the tasks phase. Carry the four concerns as tasks-phase inputs:
- **C-03** — orchestrator records the D-1 requirements-errata against AC-21 and the
  tasks-phase diff allow-list uses the widened boundary.
- **C-01** — place AC-10's authoritative-exclusion assertion where the check
  actually lives (client parse), not solely on the `CONTAINS` Cypher.
- **C-04** — add the foundation-placeholder-exists build precondition.
- **C-02** — note the unindexed listing scan is acceptable at expected `Funnel`
  cardinality.
Nits N-01..N-03 are optional test/doc polish.
