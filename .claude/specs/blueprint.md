# Blueprint: Business Modeling Studio

## Status: executing — single-shot build resumed after final user arbitration (2026-07-04)
## Author: spec-app (decompose pass; round 4 extension 2026-07-04)
## Created: 2026-07-04

> **Phase C (2026-07-04):** all 10 features have requirements/design/tasks under
> `.claude/specs/<slug>/`, every reviewed phase at verdict `approve`, **zero
> unresolved blockers**. Route/View-Tree conformance verbatim across all 8
> UI-touching specs; no conflicting file rewrites (two additive coordination
> hotspots: `seed-rbac-roles.ts`, `JourneyCanvas.tsx`/`journeyData.ts`).
> XD-01/02/15 honoured with `git diff` guard ACs. Foundations
> `kpi-okr-governance` + `system-augmentation-model` are **execution:complete +
> verified**; `model-workspace-core` mid-execution.
>
> **FINAL ARBITRATION (user, 2026-07-04 — supersedes any conflicting session
> record):** (1) **Resume single-shot build** — implementation of all remaining
> features is authorized; (2) canonical KPI-measurement source is **Neo4j
> `:KPIMeasurement`** (XD-02 amended; Postgres `kpi_measurements` split-brain
> documented, not fixed, by this app); (3) quantified activity→KPI impact
> **extends the as-built `ALIGNED_TO` edge** (XD-04); `DRIVES_KPI` remains
> KeyResult→KPI. Both prior escalations are CLOSED — implementers of
> `kpi-impact-mapping` and `kpi-okr-performance-dashboards` follow XD-02/XD-04
> as written below over any older wording inside their spec documents.

---

## Summary

A modeling pipeline on top of the companygraph process graph: author any
business's workflows across roles as first-class user stories with
Given/When/Then acceptance criteria (the "complete specification of a
business"), land the model in the graph, identify and optimize the key
activities, make those activities measurable through quantified KPI
impact, and use the process requirements as the base for domain-driven
IT system modeling (capabilities, bounded contexts, support-gap
analysis).

The pipeline is: **author → graph → optimize → measure → systematize**.
Multiple business models coexist side-by-side and share **versioned,
journey-level business modules**.

**Round-4 extension (user ask, 2026-07-04):** manage the business from
this view. Three additions: (1) every augmenting IT system is classified
**functional / agentic / AI-predictive** (`systemKind` foundation
vocabulary consumed by DDD modeling, dashboards, and analytics);
(2) the adopted-but-ungoverned KPI/OKR/roll-down surface gets its owed
**governance backfill** (verification + integration tests) as a
foundation, and a **KPI/OKR performance dashboard** (`#/exec/performance`)
provides trends, target/breach status, and OKR roll-down control sliceable
by augmentation kind; (3) support for domain experts modeling key
activities per role is **verified through explicit ACs** in the authoring
specs (XD-18), not assumed. Mode: **single-shot** (XD-17).

---

## App-Level Architecture

```
 model-workspace-core (foundation 1)
   BusinessModel roots · journey-level versioned modules + instances
   retail graph becomes Model #1 · Business Architect persona/RBAC
   Model surface shell + route registration
        │
 story-spec-core (foundation 2)
   UserStory + AcceptanceCriterion (Given/When/Then) as runtime labels
   REST CRUD · generate-then-edit bootstrap · StoryCatalog
        │
   ┌────┼──────────────────────┬───────────────────────┐
   ▼    ▼                      ▼                       ▼
 business-model-      key-activity-optimizer   ddd-system-modeling
 authoring            (descriptive scores,     (stories → capabilities
 (wizard/canvas,       manual key-marking)      → systems → bounded
  blank + retail            │                    contexts, gap analysis)
  template)                 ▼                       │
                      kpi-impact-mapping            │
                      (quantified links,            │
                       coverage matrix)             │
                            └───────────┬───────────┘
                                        ▼
                              requirements-export (MD + JSON)
```

Reuses as-built surfaces (never re-specs them): graph-core CRUD +
import, ontology-manager runtime registry, journey-versions route
pattern, KPI/SLA routes + Postgres measurements, `DRIVES_KPI` /
`userStoryKPI` schemas, bounded-contexts + glossary routes,
persona/RBAC subsystem.

---

## View Tree (frozen at blueprint approval)

New top-level **Model** surface in `pwa/src/route.ts`, following the
existing `#/<surface>/<tab>` convention. `model-workspace-core` owns the
`route.ts` registration for ALL Model tabs (one feature owns a file).

```
#/model                     → Model surface        [owner: model-workspace-core]
├── #/model/models          → ModelWorkspace       [owner: model-workspace-core]
├── #/model/canvas          → ModelCanvas          [owner: business-model-authoring]
├── #/model/stories         → StoryCatalog         [owner: story-spec-core]
├── #/model/key-activities  → KeyActivityBoard     [owner: key-activity-optimizer]
├── #/model/kpi-impact      → KpiImpactMatrix      [owner: kpi-impact-mapping]
├── #/model/systems         → SystemModeler        [owner: ddd-system-modeling]
└── #/model/export          → SpecExport           [owner: requirements-export]
```

| Route | View component | Owner (slug) | Nav surface | States specced |
|-------|----------------|--------------|-------------|----------------|
| `#/model/models` | `ModelWorkspace` | `model-workspace-core` | Model tab | loading·empty·error·ready |
| `#/model/canvas` | `ModelCanvas` | `business-model-authoring` | Model tab | loading·empty·error·ready |
| `#/model/stories` | `StoryCatalog` | `story-spec-core` | Model tab | loading·empty·error·ready |
| `#/model/key-activities` | `KeyActivityBoard` | `key-activity-optimizer` | Model tab | loading·empty·error·ready |
| `#/model/kpi-impact` | `KpiImpactMatrix` | `kpi-impact-mapping` | Model tab | loading·empty·error·ready |
| `#/model/systems` | `SystemModeler` | `ddd-system-modeling` | Model tab | loading·empty·error·ready |
| `#/model/export` | `SpecExport` | `requirements-export` | Model tab | loading·empty·error·ready |

Round-4 additions on EXISTING surfaces (no new surface):

```
#/exec/performance    → PerformanceDashboard  [owner: kpi-okr-performance-dashboards]  NEW exec tab
#/explorer/systems    → (existing view gains systemKind badges + filter)
                                              [owner: system-augmentation-model]
#/exec/kpi-management, #/exec/okr-management  → existing views, verified + tested
                                              [owner: kpi-okr-governance]
```

| Route | View component | Owner (slug) | Nav surface | States specced |
|-------|----------------|--------------|-------------|----------------|
| `#/exec/performance` | `PerformanceDashboard` | `kpi-okr-performance-dashboards` | Exec tab | loading·empty·error·ready |

Active-model context (which BusinessModel the user is working in) is a
shell-level concern owned by `model-workspace-core`; every other Model
view consumes it, never reimplements it.

---

## UI/UX Allowances

| ID | Allowance | Requirement |
|----|-----------|-------------|
| UX-01 | View states | Every view specs loading / empty / error / ready states in its ACs |
| UX-02 | Design system | Tokens only; components from the catalog before inventing new ones; `scripts/design-conformance.ts` passes on every touched view |
| UX-03 | Input modes | Platforms & Input Modes + Native Conflicts tables for any canvas/gesture work (ModelCanvas) |
| UX-04 | Responsiveness | Desktop-first, matching the existing PWA; no new breakpoints |
| UX-05 | Accessibility | Keyboard reachability, focus order, ARIA landmarks per view |
| UX-06 | Navigation | Routes from this View Tree verbatim; deep links survive reload; active-model context survives reload |

---

## Cross-Cutting Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| XD-01 | New labels (BusinessModel, BusinessModule/version nodes, UserStory, AcceptanceCriterion, Capability) are **runtime ontology labels** via the ontology-manager registry, not compile-time `NODE_LABELS` additions | The registry is the sanctioned extension path; keeps the core stable |
| XD-02 | Story/AC/model/module data in **Neo4j**; no new store. **Amended (final ruling 2026-07-04):** canonical KPI-measurement source for roll-ups/trends/dashboards is Neo4j **`:KPIMeasurement`** (what the governed `kpi-trends` reads); the Postgres `kpi_measurements` table stays as-built for the routes that own it — the split-brain is documented, not fixed, by this app | Zero-migration path; consistent with XD-04 and the shipped read paths |
| XD-03 | "Key activity" is an **attribute + score evidence**, not a new label | Activities stay one label; scores recomputable, marking reversible |
| XD-04 | KPI impact rides the as-built **`ALIGNED_TO`** edge (activity→KPI) + `userStoryKPI` link schema, **extended with direction + quantified weight**; a runtime `IMPACTS_KPI` edge covers story→KPI (Round 3; rejected: qualitative-only). Roll-up reads the governed `kpi-trends` route, whose source is Neo4j **`:KPIMeasurement`** (user decision 2026-07-04; the Postgres `kpi_measurements` split-brain is left as-is — not this app's fix). NB: the literal `DRIVES_KPI` named in earlier drafts is `KeyResult→KPI`, not the weighted activity link — see kpi-impact-mapping DEC-01/OQ-1 | "Measurable" = directional, weighted impact links + coverage scoring + roll-up vs the `:KPIMeasurement` source |
| XD-05 | DDD modeling extends the existing **bounded-contexts** ontology surface with a Capability layer | Context CRUD exists; this adds story→capability→system mapping on top |
| XD-06 | **Multiple business models side-by-side**; scoping via a BusinessModel root each subgraph hangs off (Round 1; rejected: single evolving model) | Model a client's business next to the retail reference |
| XD-07 | **Business modules are journey-level, versioned, instantiated per model** — publish at version, models reference a version, in-model edits fork a local instance, upgrades explicit (Round 2; rejected: live share-by-reference, copy-only) | Predictable isolation with a path to roll improvements across models |
| XD-08 | **New Business Architect persona** owns model-authoring write paths via the existing persona/RBAC subsystem (Round 1; rejected: extending SME) | SME keeps review/annotate |
| XD-09 | Stories bootstrap by **generate-then-edit** — one-click derivation from graph structure creates editable persisted nodes (Round 1; rejected: author-only). Server-side port of `pwa/src/lib/userStories.ts` | Keeps today's derived behavior as the on-ramp |
| XD-10 | Acceptance criteria are **structured Given/When/Then** (Round 3; rejected: free text, both) | Machine-checkable, exports into requirements docs and future test scaffolds |
| XD-11 | Optimization is **descriptive** — scores + rankings + manual marking (Round 1; rejected: prescriptive recommendations) | Deterministic and explainable; suggestions deferred to the chat surface |
| XD-12 | The existing retail graph is **migrated to Business Model #1** (Round 3; rejected: legacy-outside) | One regime in the graph; doubles as the reference example + template source |
| XD-13 | Templates: **blank + retail reference clone** using the module-instantiation machinery (Round 3; rejected: industry library, blank-only) | Cheap; exercises the same code path as module reuse |
| XD-14 | Export is **Markdown + JSON** (Round 2; rejected: PDF) | Human + machine readable; PDF deferred (cto-analytics pattern exists if wanted later) |
| XD-15 | **`systemKind` is a required enum attribute on System** (`functional` \| `agentic` \| `ai_predictive`) via the ontology registry, seed migration defaults existing systems to `functional` (Round 4; rejected: subtype labels, per-feature enums) | One augmentation vocabulary consumed by SystemModeler, dashboards, and AI-candidate analytics; attributes keep the label registry stable |
| XD-16 | **KPI/OKR governance backfill is a foundation of this app** — the adopted kpi-*/okr-crud/roll-down/sla-* surface gets verification + integration tests before anything builds on it (Round 4; rejected: dashboards on ungoverned surface) | Clears the `_baseline` debt exactly where it becomes a dependency |
| XD-17 | **Single-shot mode** — blueprint approval authorizes spec + implementation end-to-end; deterministic gates (hooks, typecheck, tests, design-conformance) replace interactive gates until the consolidated report (Round 4) | User decision; Phase A gate carries full weight |
| XD-18 | **Verification mandate** — "domain experts can model key activities per role end-to-end" is proven by explicit ACs in `story-spec-core` + `business-model-authoring` (Role/Activity/EXECUTES + Persona write paths exercised per platform), not assumed from the as-built surface (Round 4; rejected: separate verification spec) | Verification lives where the behavior is specced; no orphan spec |

---

## Feature Inventory

| Slug | Feature | Tier | Priority | Size | Depends on | Scope |
|------|---------|------|----------|------|-----------|-------|
| `model-workspace-core` | Multi-model workspace + versioned modules | foundation | must | large | — | BusinessModel roots, journey-level module publish/instantiate/fork/upgrade, retail→Model #1 migration, Business Architect persona/RBAC, Model surface shell + route registration, ModelWorkspace view. Out: stories, authoring wizard |
| `story-spec-core` | Stories + acceptance criteria as graph citizens | foundation | must | large | `model-workspace-core` | UserStory/AC (Given/When/Then) registry labels + edges, REST CRUD, generate-then-edit bootstrap, StoryCatalog view. Out: KPI links, capabilities |
| `business-model-authoring` | Author a business model into the graph | feature | must | large | `story-spec-core` | Wizard + canvas: domains→journeys→activities×roles→stories+ACs; blank + retail template; lands via import/module instantiation. Out: optimization, KPIs |
| `key-activity-optimizer` | Identify + mark key activities | feature | must | medium | `story-spec-core` | Per-model graph scoring (centrality/critical-path/handoff density), manual key-marking, KeyActivityBoard. Out: KPI attachment, recommendations |
| `kpi-impact-mapping` | Make key activities measurable via KPI impact | feature | must | medium | `story-spec-core`, `key-activity-optimizer`, `kpi-okr-governance` | Quantified activity/story→KPI links (direction+weight), coverage matrix, measurability gaps, roll-up vs the governed `kpi-trends` read (Neo4j `:KPIMeasurement` source — user decision 2026-07-04). Out: KPI CRUD (exists) |
| `ddd-system-modeling` | Model IT systems supporting the steps, domain-driven | feature | must | large | `story-spec-core`, `system-augmentation-model` | Capability layer, story/activity→capability→system mapping (each mapping carries the system's `systemKind`), bounded-context assignment + context map, support-gap analysis incl. augmentation mix per capability (functional/agentic/AI coverage), SystemModeler view. Out: context CRUD (exists), systemKind schema (foundation) |
| `requirements-export` | Business specification export | feature | should | small | all above | Assembled per-model spec document (stories+ACs+key activities+KPI impact+system map) as MD + JSON. Out: PDF |
| `system-augmentation-model` | Augmentation vocabulary (systemKind) | foundation | must | medium | — | `systemKind` enum attr on System via registry + zod + seed migration (default `functional`); systemKind badges + filter on `#/explorer/systems`; API validation + tests. Out: SystemModeler UI (ddd-system-modeling), dashboards |
| `kpi-okr-governance` | KPI/OKR surface governance backfill | foundation | must | large | — | Verify + integration-test the adopted kpi-crud/kpi-measurements/kpi-trends/kpi-sla-alignment/sla-*/okr-crud/roll-down routes + KpiManagement/OkrManagement views against `_baseline` FR-07/FR-08; close functional gaps found; postgres service in CI for these tests. Out: new dashboards |
| `kpi-okr-performance-dashboards` | KPI/OKR performance control | feature | must | large | `kpi-okr-governance`, `system-augmentation-model` | `#/exec/performance`: KPI trends + target/breach status, OKR roll-down performance, slice by domain/journey/systemKind; reads existing routes (extends read-only aggregates under `/api/v1/analytics/performance` if needed). Out: KPI/OKR CRUD (exists), impact editing (kpi-impact-mapping) |

---

## Dependency Graph

```
model-workspace-core ──> story-spec-core ─┬─> business-model-authoring ─────┐
                                          ├─> key-activity-optimizer ─┐     │
                                          │        └─> kpi-impact-mapping ──┼─> requirements-export
                                          └─> ddd-system-modeling ──────────┘
system-augmentation-model ─┬─> ddd-system-modeling
                           └─> kpi-okr-performance-dashboards
kpi-okr-governance ────────┬─> kpi-impact-mapping
                           └─> kpi-okr-performance-dashboards
```

- **Foundation wave 1:** `model-workspace-core`, `system-augmentation-model`, `kpi-okr-governance` (independent — pipeline together)
- **Foundation wave 2:** `story-spec-core`
- **Parallel wave 3:** `business-model-authoring`, `key-activity-optimizer`, `ddd-system-modeling`, `kpi-okr-performance-dashboards`
- **Wave 4:** `kpi-impact-mapping`
- **Wave 5:** `requirements-export`

---

## Build Order / Milestones

| Milestone | Features | Goal |
|-----------|----------|------|
| M1 | `model-workspace-core`, `story-spec-core`, `system-augmentation-model`, `kpi-okr-governance` | Walking skeleton + augmentation vocabulary + governed KPI/OKR base |
| M2 | `business-model-authoring`, `key-activity-optimizer` | Author a new business end-to-end, rank + mark its key activities |
| M3 | `kpi-impact-mapping`, `ddd-system-modeling`, `kpi-okr-performance-dashboards` | Key activities measurable; systems mapped domain-driven with augmentation mix; performance control live |
| M4 | `requirements-export` | The complete business specification as a document |

---

## Risks

| Risk | Mitigation |
|------|------------|
| ~~kpi backfill owed~~ — resolved: `kpi-okr-governance` is now a foundation feature of this app (XD-16) | kpi-impact-mapping and the dashboards depend on it explicitly |
| Single-shot scale: 10 pipelines ≈ 60–80 agents incl. builds; deterministic gates are the only in-run control | Foundation waves serialize the riskiest specs; hooks + typecheck + tests + design-conformance gate every artifact; consolidated report is the human checkpoint |
| Auth-hardening debt (dev fallback grants synthetic admin) is NOT in this decomposition | Tracked in PROJECT-ROLLUP; must precede any non-local deploy |
| Retail→Model #1 migration touches every existing node's scoping | Migration is idempotent + reversible in model-workspace-core's design; run behind `bun run seed`-style script with dry-run |
| Module fork/upgrade semantics are the hardest novel design | model-workspace-core is a large spec with full review depth; journey-versions route pattern is prior art |
| Canvas authoring scope explosion | Wizard-first; canvas reuses JourneyCanvas/react-flow patterns; canvas polish is `should` inside that spec |
| Runtime-registry label additions vs. compile-time expectations in older code | story-spec-core design verifies the registry path end-to-end (validators are registry-backed already) |

---

## Open Questions

None — all settled in discussion Rounds 1–4 (recorded as XD-06…XD-18).

---

## Round-5 Amendment (navigation-ia, 2026-07-06)

> **Scope:** records the eight-surface IA restructure and route relocations
> from the `navigation-ia` spec (requirements rev 2, approved). This
> amendment is the FR-12 design-gate precondition for that spec. It does
> not modify any XD-* decision, the View Tree, or the feature inventory —
> it records relocations of already-landed routes with permanent aliases.

### (a) Eight-surface IA

The PWA top-level navigation is restructured from ten spec-silo surfaces
to eight task-oriented surfaces, in this order:

| Position | Surface | Alt shortcut | Notes |
|----------|---------|--------------|-------|
| 1 | `explorer` | Alt+1 | Domains, journeys, activities, roles, systems, locations, path-finder + curation group (review, add, quarterly) |
| 2 | `model` | Alt+2 | Blueprint-frozen, seven tabs VERBATIM — only TopBar position/shortcut changes |
| 3 | `chat` | Alt+3 | Thread + conversations (new) |
| 4 | `insights` | Alt+4 | Merged analyst home: analysis + reports + business groups |
| 5 | `govern` | Alt+5 | KPI/OKR management, roll-down, risk, compliance, programs |
| 6 | `ontology` | Alt+6 | Existing six tabs + glossary + generator |
| 7 | `data` | Alt+7 | Merged Data + API: map, import, export, endpoints, errors |
| 8 | `admin` | Alt+8 | Personas, RBAC roles, users, platform, settings |

The `model` surface's TopBar position changes from 10th (Alt+0) to 2nd
(Alt+2). The Alt+0 special case in `App.tsx` is removed; shortcuts are
index-derived from `SURFACES` array position.

### (b) Route relocations with permanent aliases

All legacy routes resolve permanently via a declarative alias table in
`pwa/src/route.ts` (not a transition shim). Landing on a legacy hash
canonicalizes to the new route via `history.replaceState` (no extra
back-stack entry).

| Legacy route | New canonical route | Status |
|--------------|---------------------|--------|
| `#/analytics/{overview,systems,matrix,consolidation,complexity,single-system,critical-paths,ai}` | `#/insights/{same}` | 8 tabs relocated |
| `#/analytics/exec-summary` | `#/insights/exec-summary` | Tab relocated (kept — distinct from Model/Export: PDF vs MD/JSON) |
| `#/exec/{finance,people,transform}` | `#/insights/{same}` | 3 tabs relocated |
| `#/exec/performance` | `#/insights/performance` | Relocated (dashboard landed) |
| `#/exec/{risk,kpi-management,okr-management}` | `#/govern/{same}` | 3 tabs relocated |
| `#/exec/ops` | `#/admin/platform` | Relocated (infrastructure, not business) |
| `#/sme/{review,add,quarterly}` | `#/explorer/{same}` | 3 tabs relocated |
| `#/sme/home` | `#/admin/settings` | Relocated (home-domain picker) |
| `#/api/{endpoints,errors,import}` | `#/data/{same}` | 3 tabs relocated |
| `#/explorer/journey-detail[/:id]` | `#/explorer/journeys[/:id]` | Tab merged |
| `#/explorer/journey-graph?journey=<id>` | `#/explorer/journeys/:id/graph` | Tab merged + param transform |
| `#/explorer/journey-graph` (no param) | `#/explorer/journeys?view=graph` | Tab merged |
| `#/analytics` (bare) | `#/insights/overview` | Surface default |
| `#/exec` (bare) | `#/insights/finance` | Surface default |
| `#/sme` (bare) | `#/explorer/review` | Surface default |
| `#/api` (bare) | `#/data/endpoints` | Surface default |

Identity-mapped (no alias rows needed): `#/chat/*`, `#/data/{map,export}`,
`#/admin/{personas,rbac-roles,users}`, `#/ontology/*` (existing six),
`#/model/*`.

### (c) kpi-okr-performance-dashboards registration retarget

`kpi-okr-performance-dashboards` (execution:complete, verified 2026-07-05)
originally registered `#/exec/performance` as a NEW exec tab per the
blueprint View Tree. The canonical registration target is retargeted to
`#/insights/performance`. The alias row `exec/performance →
insights/performance` is owned by the `navigation-ia` spec. The
`PerformanceDashboard` view component and its API routes are unchanged —
only the surface/tab registration moves from `exec` to `insights`.
