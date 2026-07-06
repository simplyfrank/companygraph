---
feature: "saas-operator-foundation"
created: "2026-07-06"
author: "spec-author"
status: "revised"
revision: 2
reviewing_requirements_revision: 2
reviewing_design_review_pass: 1
size: "large"
---

# Design: saas-operator-foundation

<!-- The File Changes table (§9) is the permission surface for implementation —
     spec-guard blocks Write/Edit on any source file not listed there (or in
     tasks.md) until this document's frontmatter status is "approved". -->

## 1. Overview

`saas-operator-foundation` is the wave-1a barrier of the SaaS-Operator fan-out
(blueprint `.claude/specs/blueprint-saas-operator.md`). It builds **no new
schema, no new store, and no new business logic of its own** — it composes four
existing, as-built subsystems into a scaffold that every downstream feature
consumes:

1. **A "SaaS Operator" `BusinessModel` root** created through
   `model-workspace-core`'s `createModel` (non-reference, server-assigned
   `ordinal = max+1`), found idempotently by a `name:"SaaS Operator"` +
   `attributes.saasOperatorRoot:true` lookup (OQ-1 option (a)).
2. **Six function `Domain` roots** attached `IN_MODEL` via
   `model-workspace-core`'s `attachDomain`, made idempotent by a
   lookup-before-attach guard on `attributes.seedKey` — **without editing
   `models.ts`/`attachDomain`** (they are `model-workspace-core`-owned).
3. **A shared System/Persona/Role catalog** (MOMS, Helm, Stripe, CRM,
   data-warehouse, Kubernetes, PagerDuty + operator personas/roles) seeded once
   as model-independent reference nodes.
4. **A directory-iterating seed loader** (`bun run seed:saas-operator`) that
   posts every `*.json` in `shared/seed/saas-operator/` through the guarded
   process-content writer `POST /api/v1/import` (`realImport`), plus a
   **governed-API seed helper** that POSTs risk/SLA/compliance rows to the
   existing governed routes without touching their code.
5. **The `#/business` PWA surface shell** — `saas-operator-foundation` is the
   **sole editor** of `route.ts` / `SURFACES` / `views/index.tsx` in the whole
   fan-out; it registers every new route additively (all four `#/business` tabs
   + `#/exec/operator`), wires the live `FunctionMap` view, and stands up a
   shared `BusinessTabPlaceholder` for the sibling tabs downstream specs will
   later replace one line at a time (the proven `ModelTabPlaceholder` pattern).

The design follows four rules:

- **Rule A — compose, never fork.** Every graph write rides an as-built
  sanctioned path (`createModel`, `attachDomain`, `realImport`, the persona
  route) **or the established seed-script direct-driver MERGE pattern**. The
  latter is not a new storage primitive: `api/src/scripts/seed-rbac-roles.ts`
  already writes `:RBACRole`/`:Persona` nodes with raw `MERGE (…) ON CREATE SET`
  Cypher straight against the driver (verified, `seed-rbac-roles.ts:157,177`),
  bypassing the router gate by design — seed scripts run as trusted operator
  tooling, not authenticated requests. `ensureRoles` reuses **exactly** that
  pattern for the operator core `:Role` catalog (§4.3); this is sanctioned, not
  a fork. No new storage primitive, no edit to `model-workspace-core`'s
  `models.ts`, no compile-time `NODE_LABELS`/`EDGE_TYPES` entry, no new runtime
  registry label/edge (NFR-01). (Resolves B-02.)
- **Rule B — idempotency lives in the seed script, not in owned-elsewhere
  handlers.** Both `attachDomain` (no MERGE) and `createModel` (server-generated
  id) are non-idempotent by construction; the seeder wraps each with a
  lookup-before-write guard keyed on a stable attribute
  (`saasOperatorRoot:true` / `seedKey`) so re-seeding is a net-zero no-op
  without any owned-elsewhere edit (FR-01/FR-03/AC-01/AC-03).
- **Rule C — single route-file owner, additive registration.** All route
  registration is confined to `pwa/src/route.ts` + `pwa/src/views/index.tsx`;
  siblings edit only their own one-line `VIEWS` entry (XD-05/NFR-03).
- **Rule D — governed data only through governed routes.** Risk/SLA/compliance
  rows are created by POSTing to the existing governed endpoints; no code under
  `risk-register.ts` / `sla-crud.ts` / `compliance-rules.ts` /
  `change-requests.ts` / `risk-compliance.ts` is edited (XD-04/NFR-04).

Rejected at design level (see §11): a fixed-constant operator-root UUID (needs a
lifecycle-guard-exempt create path, conflicts with `createModel`'s
server-generated id); a client-supplied fixed domain id (would force an edit to
`model-workspace-core`'s `attachDomain`); a hand-listed loader manifest
(reintroduces the file-collision the fan-out avoids); a new `models.ts` route
for the per-domain descendant count (that file is owned elsewhere — the generic
`query/cypher` read serves it).

## 2. Prior-review concerns — resolution in this design

The requirements are approved at rev 2 (status `revised`); every open finding is
already folded into the FR/AC body. This design pins the ones that constrain
implementation:

- **B-02 (import route).** The loader writes through **`POST /api/v1/import`**
  (`handleImport → realImport`, `api/src/routes/import.ts:67,163`;
  `router.ts:410`), which consumes the `{nodes,edges}` payload and carries the
  lifecycle pre-scan guard (`import.ts:167-185`). It **never** uses
  `POST /api/v1/ontology/import` (`handleOntologyImport`, `router.ts:545`),
  which takes the ontology-registry payload and lacks the guard. Verified
  as-built (§4.4, §4.6). NOTE: the existing `bun run seed` posts to
  `/api/v1/ontology/import` — this loader deliberately does not reuse that path.
- **C-01 (FunctionMap read source).** `api/src/routes/models.ts` exposes no
  route returning a model's `IN_MODEL` domains with descendant counts, and that
  file is `model-workspace-core`-owned. FunctionMap therefore reads through the
  existing generic **`POST /api/v1/query/cypher`** route
  (`runPassthrough`, read-only, `query:read` — `router.ts:509`,
  `rbac-permissions.ts:67`), which can express the operator-root → `IN_MODEL`
  domains → `PART_OF*` descendant-count aggregate in one query (§6.4). No new
  `models.ts` route is added.
- **C-02 (Persona/Role graph shape).** Two node kinds are seeded: core-label
  `Role` nodes (the `EXECUTES` targets, seeded via the `seed-rbac-roles.ts`
  extension pattern) and `Persona` nodes (`shared/src/schema/nodes.ts:10`,
  seeded via `POST /api/v1/personas`). Both are model-independent reference
  nodes, idempotent by MERGE-on-name + `attributes.seedKey` (§4.3).
- **C-03 (FR-06 must).** The governed-API seed helper is `must`; §4.5 ships the
  helper mechanism and AC-19 proves the round-trip against each named route.
- **C-04 (OQ-1/OQ-4 closed).** OQ-1 → root identity by `saasOperatorRoot:true` +
  name lookup (§4.1); OQ-4 → domain identity by `seedKey` lookup-before-attach
  (§4.2). Both implemented; neither leaves an open question for the single-shot
  gate.

## 2.1 Deviations Register

Three requirements citations name governed-route paths that differ from the
as-built router. The design could not edit `requirements.md`; each divergence is
recorded here for the orchestrator to land as a requirements-errata note. None
changes an FR's intent — only the concrete endpoint string the FR-06 helper and
AC-19 target.

| # | Requirements text | As-built route (verified) | This design |
|---|-------------------|---------------------------|-------------|
| D-1 | FR-06/AC-19/NFR-04 name `/api/v1/sla-crud` for SLA writes | The SLA create route is **`POST /api/v1/slas`** (`handleSlaPost`, `api/src/routes/sla-crud.ts:25`; `router.ts` `"slas"` POST → `sla:write`) — the **file** is `sla-crud.ts` but the **route** is `/slas` | Helper POSTs `/api/v1/slas`; AC-19 targets `/api/v1/slas`; NFR-04's "no edit to `sla-crud.ts`" holds verbatim (§4.5, §8) |
| D-2 | FR-06/AC-19/NFR-04 name `/api/v1/compliance-rules` for compliance writes | The compliance-rule create route is **`POST /api/v1/compliance/rules`** (`handleCreateComplianceRule`, `api/src/routes/compliance-rules.ts:42`; `router.ts:588` → `compliance:write`) — the **file** is `compliance-rules.ts` but the **route** is `/compliance/rules` | Helper POSTs `/api/v1/compliance/rules`; AC-19 targets `/api/v1/compliance/rules`; NFR-04's "no edit to `compliance-rules.ts`" holds verbatim (§4.5, §8) |
| D-3 | Dependencies list `api/src/scripts/seed-rbac-roles.ts`; FR-07 names `api/scripts/seed-saas-operator.ts` | `seed.ts` lives at **`api/scripts/`**; `register-model-labels.ts` and `seed-rbac-roles.ts` live at **`api/src/scripts/`** | The new loader is `api/scripts/seed-saas-operator.ts` (matches the `seed.ts` sibling + the `bun --cwd api scripts/…` package-script pattern); it imports the shared Role catalog from a new module co-located with the persona/RBAC seed under `api/src/scripts/` (§4.3, §9) |

## 2.2 Design-review pass 1 — resolution (revision 2)

Every Blocker and Concern in `review-design.md` (pass 1) is addressed in this
revision. Summary of where each is resolved:

| Finding | Resolution | Section |
|---------|-----------|---------|
| **B-01** — MERGE-on-`name` for catalog `System` collides with retail `CRM`, aliasing/mutating a retail-owned node (violates NFR-02/XD-01/AC-04) | Catalog Systems are no longer MERGE'd on bare `name`. Idempotency is keyed on a top-level, operator-owned marker property `operatorSeedKey` (mechanism (b) from the review). The MERGE matches only operator catalog nodes, never the retail `CRM`. AC-04 gains an explicit "retail `CRM` untouched" assertion. Same guard extended to `Persona`/`Role`. | §3.3, §4.3, §8 |
| **B-02** — `ensureRoles` conflates `:Role` with `:RBACRole`; core `:Role` seed path unspecified | §4.3 now states the exact label per kind and the sanctioned path: core `:Role` nodes are created by direct-driver `MERGE (r:Role {operatorSeedKey})` in the seed script — the same established pattern `seed-rbac-roles.ts` uses (direct driver write, no route), reconciled with Rule A explicitly. `:RBACRole` is **not** seeded by this spec. `:Persona` via `POST /api/v1/personas`. | §3.3, §4.3, Rule A |
| **C-01** — FR-06 risk helper "reuses `createRiskSchema`" but that schema is module-private (unimportable without editing `risk-register.ts`, forbidden by NFR-04) | Dropped the "reuses `createRiskSchema`" claim for the risk helper. The risk body is a hand-constructed object literal matching the route's shape; the loopback POST + route re-parse is the whole contract. Only the two **shared-package** schemas (`slaCreateRequestSchema`, `complianceRuleSchema`) are importable and are noted as such. | §3.4, §4.5 |
| **C-02** — `.gitkeep` empty-dir path needs its own guard note | §4.4/§7 now state the directory always exists (§7 creates it with `.gitkeep`), the `existsSync` guard is belt-and-suspenders, and a directory containing only `.gitkeep` is treated as empty (zero `*.json`) — AC-06's fixture is exactly that. | §4.4, §7 |
| **C-03** — FunctionMap descendant count is unfiltered vs. FR-14's "journeys/activities" intent | The count Cypher now constrains `WHERE desc:UserJourney OR desc:Activity` so the surfaced number is exactly the journey/activity count FR-14/AC-10 promise. | §6.4 |
| **C-04** — `runPassthrough` transaction/row caps vs. FunctionMap read not addressed | §6.4 now confirms the six-domain aggregate is well within `runPassthrough`'s `TX_TIMEOUT_MS`/row caps, and that any passthrough error (including a cap hit) maps to the FunctionMap **error** state (AC-13). | §6.4 |
| **C-05** — AC-10/AC-15/AC-16 tests need the seeded scaffold as a precondition | §8 test rows now note `seed:saas-operator` step (a) (the six domains) is a fixture precondition for AC-10/AC-15/AC-16 — the domains, not slice content, are what those views render. | §8 |
| **N-01** — §4.3 `seedKey_marker` is a phantom property | Replaced with the real chosen mechanism (`operatorSeedKey` top-level marker). | §4.3 |
| **N-02** — §5 FR-01 row "via a storage call … or the route" is ambiguous | Narrowed to the single authoritative statement: `createModel` storage call from the seed script (§4.1). | §5 |
| **N-03** — ensure tasks/AC-19 assert as-built routes, not the requirements' stale strings | Re-affirmed in the Deviations Register handoff note; §8 AC-19 row targets `/api/v1/slas` and `/api/v1/compliance/rules` verbatim. Process-handoff nit for tasks. | §2.1, §8 |

## 3. Data model

This spec adds **no** compile-time or runtime schema. Every node/edge it writes
uses an existing label/edge. The zod validation used at the REST boundary is the
already-defined schema of each reused route; the only new zod this spec defines
is the loader/helper's small internal input shapes (§3.4).

### 3.1 SaaS-Operator root (`BusinessModel`, FR-01) — reuses `createModel`

Written via `createModel(driver, {name, description, attributes, isReference:false})`
(`api/src/storage/models.ts:55`). No new properties beyond the existing
`BusinessModel` envelope; the operator marker lives inside the open
`attributes_json` map:

| Field | Value | Notes |
|-------|-------|-------|
| `name` | `"SaaS Operator"` | the human name + half the idempotency key |
| `isReference` | `false` | non-reference; retail Model #1 stays the sole `isReference:true` |
| `ordinal` | server-assigned `max+1` | never author-fixed (createModel computes it) |
| `status` | `"active"` | createModel default |
| `attributes.saasOperatorRoot` | `true` | the stable idempotency marker (OQ-1 (a)) |
| `id` | server-generated UUIDv7 | discovered at seed/read time; **never hard-coded** — the operator-root handle every content spec + FunctionMap resolves by lookup |

### 3.2 Function `Domain` roots (FR-03) — reuses `attachDomain`

Six domains attached via `attachDomain(driver, operatorRootId, {name, description, attributes})`
(`api/src/storage/models.ts:256`), which creates the `Domain` + its `IN_MODEL`
edge in one tx. Each carries a stable `attributes.seedKey`:

| `name` | `attributes.seedKey` |
|--------|----------------------|
| `Marketing` | `marketing` |
| `Sales` | `sales` |
| `Finance & Accounting` | `finance_accounting` |
| `Customer Success` | `customer_success` |
| `Product & Delivery` | `product_delivery` |
| `Platform Ops` | `platform_ops` |

Domains are created **without** journeys/activities (content is wave 2). The
content specs' stable handle to a function domain is its `seedKey` (resolved by
lookup against the operator root), never a fixed id.

### 3.3 Shared catalog (`System` / `Persona` / `Role`, FR-04/FR-05)

**Systems** — seven `System` nodes, each carrying the standard node envelope +
`attributes.systemKind` (one of `functional | agentic | ai_predictive`,
`shared/src/schema/system-kind.ts:9`) + `attributes.seedKey` (the stable slug
content specs reference) + a **top-level `operatorSeedKey` property** (the
operator-owned idempotency marker — see B-01 below and §4.3). Because
`operatorSeedKey` lives on the node top-level (not inside the opaque
`attributes_json`), it is directly MERGE-able and guarantees the catalog node is
distinct from any retail/commercial `System` of the same `name` (the retail
`CRM`, `shared/seed/retail-mini.json:69`, carries **no** `operatorSeedKey`).

| `name` | `seedKey` | `systemKind` |
|--------|-----------|--------------|
| `MOMS` (medical-office SaaS product) | `moms` | `functional` |
| `Helm` (operator control-plane) | `helm` | `functional` |
| `Stripe` | `stripe` | `functional` |
| `CRM` | `crm` | `functional` |
| `Data Warehouse` | `data_warehouse` | `functional` |
| `Kubernetes` | `kubernetes` | `functional` |
| `PagerDuty` | `pagerduty` | `functional` |

**Personas** — operator function-owner **`:Persona`** nodes (e.g. `"Finance
Function Owner"`, `"Platform Ops Owner"`), one per function, each with an
`attributes.seedKey` **and** a top-level `operatorSeedKey` marker.

**Roles** — operator process **`:Role`** nodes (the core process label from
`shared/src/schema/nodes.ts`, distinct from `:RBACRole`) — e.g.
`"Revenue Operations"`, `"Site Reliability Engineer"` — the content-spec
activities point at via `EXECUTES` (`Role→Activity`). Each carries an
`attributes.seedKey` **and** a top-level `operatorSeedKey` marker. This spec
seeds **`:Role`**, not `:RBACRole`: `:RBACRole` (authorization roles) is owned by
the auth subsystem / `seed-rbac-roles.ts` and is never touched here (FR-12/AC-05,
no new permission).

The exact persona/role list is a content concern; this foundation seeds the
minimal operator catalog (one owner persona per function + the small shared role
set) and content specs add function-specific roles inside their own slice.

All catalog nodes are **model-independent reference nodes**
(`model-workspace-core` DEC-01 (a)): seeded once, shared across every function
domain, never duplicated per domain.

### 3.4 Loader + helper internal input shapes (zod)

The only new zod in this spec, in a new `api/src/seed/saas-operator-catalog.ts`
(the catalog data + shapes) — permissive, internal to the seed harness, never a
REST boundary:

```ts
// api/src/seed/saas-operator-catalog.ts
export const catalogSystemSchema = z.object({
  seedKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  systemKind: systemKindSchema,            // reused, never re-declared
});
export const catalogRoleSchema = z.object({
  seedKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
});
export const catalogPersonaSchema = z.object({
  seedKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
});
```

The loader validates each slice fixture only through the existing
`importPayloadSchema` at the `POST /api/v1/import` boundary (it never re-parses
the fixture itself).

The FR-06 helper's per-route bodies reuse each governed route's zod **only where
that zod is importable from the shared package**: `slaCreateRequestSchema`
(`@companygraph/shared/schema/kpi-sla`) and `complianceRuleSchema`
(`@companygraph/shared/schema/ontology`) are exported and imported to build a
valid sample row. The risk route's `createRiskSchema` is **module-private** in
`api/src/routes/risk-register.ts:7` (no `export`), and importing it would require
editing that file — forbidden by NFR-04. The risk helper therefore constructs a
plain object literal matching the route's request shape (`{name, owner, domain,
likelihood, impact, status, trend, description?}`); the loopback POST and the
route's own re-parse are the whole validation contract (§4.5). (Resolves C-01.)

## 4. Core logic

### 4.1 Operator-root ensure (FR-01, AC-01)

`api/src/seed/ensure-operator-root.ts` exports
`ensureOperatorRoot(driver): Promise<ModelRead>`:

1. **Lookup** — one read query for the marker key:
   ```cypher
   MATCH (m:BusinessModel {name: "SaaS Operator"})
   WHERE coalesce(apoc.convert.fromJsonMap(m.attributes_json).saasOperatorRoot, false) = true
   RETURN m LIMIT 1
   ```
   To avoid an APOC dependency in the read, the equivalent is done in two steps:
   `MATCH (m:BusinessModel {name:"SaaS Operator"}) RETURN m` then filter in
   TypeScript on `JSON.parse(m.attributes_json).saasOperatorRoot === true`
   (mirrors `deserializeModel`, `models.ts:33`). If a match exists → return it
   (idempotent path).
2. **Create** — else call
   `createModel(driver, {name:"SaaS Operator", description:"…", attributes:{saasOperatorRoot:true}, isReference:false})`.
   `createModel` server-assigns `ordinal = max+1` and generates the id; the
   returned `ModelRead` carries the handle used downstream.

Because the lookup precedes create, a second `seed:saas-operator` run finds the
existing root and creates nothing (AC-01). Retail Model #1 (`isReference:true`,
ordinal 1) is never matched by the name/marker key, so it is never mutated
(NFR-02).

### 4.2 Function-domain ensure (FR-03, AC-03) — lookup-before-attach

`ensureFunctionDomains(driver, operatorRootId): Promise<Map<seedKey, domainId>>`:

For each of the six `{name, seedKey}` pairs (§3.2):

1. **Lookup** — the operator root's `IN_MODEL` domains carrying this `seedKey`:
   ```cypher
   MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id:$operatorRootId})
   RETURN d
   ```
   filter in TS on `JSON.parse(d.attributes_json).seedKey === <key>`. If found →
   reuse (idempotent path).
2. **Attach** — else `attachDomain(driver, operatorRootId, {name, description, attributes:{seedKey}})`.

`attachDomain` (owned by `model-workspace-core`) does **no** MERGE and
server-generates the domain id; the lookup-before-attach in **this** seed script
supplies the idempotency without touching `models.ts` (Rule B). A re-run adds
zero domains and zero `IN_MODEL` edges (AC-03). The returned map lets the loader
resolve the six domain ids at seed time.

### 4.3 Shared-catalog ensure (FR-04, FR-05, AC-04, AC-05)

`api/src/seed/ensure-catalog.ts` — three idempotent seeders, each MERGE-on the
stable key so a re-run is net-zero:

**Idempotency key — top-level `operatorSeedKey` marker (resolves B-01, B-02,
N-01).** `seedKey` lives inside the opaque `attributes_json`, so it cannot be a
MERGE key. MERGE-on-bare-`name` is **rejected**: the retail/commercial seed
already contains a `System` named `CRM` (`shared/seed/retail-mini.json:69`) and
the operator catalog also seeds a `CRM`; a `MERGE (s:System {name:"CRM"})` would
**match the retail node**, either aliasing it (its `ON CREATE SET` skipped, so no
operator `systemKind`/`seedKey`) or — if switched to unconditional `SET` —
**mutating a retail-owned node**, violating NFR-02/XD-01/AC-04. Instead, every
catalog kind is MERGE'd on a **top-level, operator-owned marker property
`operatorSeedKey`** (the same slug as `seedKey`, e.g. `"crm"`). No retail node
carries `operatorSeedKey`, so the MERGE can never match one; operator catalog
nodes are guaranteed distinct from a retail/commercial node of the same `name`,
and from any `model-workspace-core`-seeded `Persona`/`RBACRole` of the same name.
`operatorSeedKey` is a plain node property (no compile-time/runtime schema entry,
no new constraint — NFR-01 holds); `seedKey` is **also** retained inside
`attributes_json` for the content-spec `name`/`seedKey` lookup contract.

- **Systems** (`ensureSystems`) — for each `catalogSystemSchema` row, MERGE a
  `System` node on the operator marker:
  ```cypher
  MERGE (s:System {operatorSeedKey: $seedKey})    // operator-owned; never matches retail CRM
  ON CREATE SET s.id = $id, s.name = $name, s.description = $desc,
                s.createdAt = $now, s.updatedAt = $now,
                s.attributes_json = $attrs         // {systemKind, seedKey}
  ON MATCH  SET s.name = $name, s.description = $desc, s.updatedAt = $now,
                s.attributes_json = $attrs         // re-seed converges own node only
  RETURN s
  ```
  Because the MERGE key is `operatorSeedKey` (which the retail `CRM` lacks), the
  operator `CRM` is always a **new, separate** node; the retail `CRM` (id,
  name, description, `attributes_json`) is never read, matched, or written. The
  `ON MATCH SET` block is safe precisely because it can only ever match the
  operator's own catalog node. `systemKind` is stored in `attributes_json` so
  the existing System registry attribute check passes (the import path injects
  the default otherwise — `import.ts:96`; here we set it explicitly).
- **Roles** (`ensureRoles`) — creates the operator core **`:Role`** process
  nodes (not `:RBACRole`) via the **established seed-script direct-driver MERGE
  pattern** that `seed-rbac-roles.ts` uses verbatim (`MERGE (…) ON CREATE SET`
  straight against the Neo4j driver, `seed-rbac-roles.ts:157` — a trusted
  operator-tooling write that bypasses the router gate by design, Rule A):
  ```cypher
  MERGE (r:Role {operatorSeedKey: $seedKey})
  ON CREATE SET r.id = $id, r.name = $name, r.description = $desc,
                r.createdAt = $now, r.updatedAt = $now,
                r.attributes_json = $attrs         // {seedKey}
  ON MATCH  SET r.name = $name, r.description = $desc, r.updatedAt = $now
  RETURN r
  ```
  This is the `:Role` seed path B-02 asked to be named: a direct MERGE against
  the `:Role` label (there is no `POST /api/v1/roles` route; core nodes are
  otherwise created via `POST /api/v1/nodes/:label`, but the seed harness uses
  the same trusted direct-driver path as the existing RBAC seeder). Keyed on
  `operatorSeedKey`, it cannot collide with any retail or
  `model-workspace-core`-seeded `:Role`/`:RBACRole` of the same name. This spec
  seeds **no `:RBACRole`** and adds no permission string.
- **Personas** (`ensurePersonas`) — POSTs each function-owner **`:Persona`**
  through the existing **`POST /api/v1/personas`** route (`handlePersonaPost`,
  `router.ts:890`, `persona:write`), idempotent by a name lookup
  (`GET /api/v1/personas` filter, then also checking `operatorSeedKey`) before
  create so a re-run adds none. Since the persona route server-generates the id
  and MERGE is not available through it, the pre-create lookup supplies the
  idempotency (Rule B), keyed on the operator name + `operatorSeedKey` so it
  never mistakes a `model-workspace-core`-seeded persona (e.g. `Business
  Architect`, `seed-rbac-roles.ts:177`) for an operator one.

No new RBAC **permission** string is added to `api/src/auth/rbac-permissions.ts`
(FR-12/AC-05); this seeds the shared *catalog* the content specs reference by
`name`/`seedKey`, not new permissions.

### 4.4 Directory-iterating loader (FR-07, FR-08, FR-09, AC-06, AC-07, AC-08)

`api/scripts/seed-saas-operator.ts` — the CLI entrypoint, wired
`bun run seed:saas-operator` (§9). Sequence:

1. **Step (a) — ensure scaffold** (always, regardless of directory contents):
   `ensureOperatorRoot` → `ensureFunctionDomains` → `ensureSystems` →
   `ensureRoles` → `ensurePersonas`. This is why an empty
   `shared/seed/saas-operator/` is a clean no-op, not an error — the scaffold is
   still ensured (AC-06, Risk 5).
2. **Step (b) — discover + load slices**:
   ```ts
   const dir = resolve(import.meta.dir, "../../shared/seed/saas-operator");
   const files = existsSync(dir)
     ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort()  // deterministic
     : [];
   for (const f of files) {
     const body = readFileSync(resolve(dir, f), "utf8");
     const res = await fetch(`${base}/api/v1/import`, {           // POST /api/v1/import (B-02)
       method: "POST",
       headers: { "content-type": "application/json" },
       body,
     });
     // 409 model_lifecycle_route_required → a malformed fixture; surface + fail (AC-08)
   }
   ```
   Adding `marketing.json` to the directory loads it on the next run with **no
   edit** to this file (AC-06). Load order is the sorted filename order (step (a)
   always precedes step (b), so a slice referencing a shared catalog id always
   runs after the catalog is ensured — FR-08).

   **Empty-directory guard (resolves C-02).** §7 creates
   `shared/seed/saas-operator/` with a committed `.gitkeep`, so the directory
   **always exists** — the `existsSync(dir) ? … : []` branch is
   belt-and-suspenders (it defends only against a manual delete). The
   `filter(f => f.endsWith(".json"))` skips `.gitkeep`, so a directory containing
   **only** `.gitkeep` yields zero `*.json` files and step (b) is a clean no-op
   (the scaffold from step (a) is still ensured). AC-06's "empty directory is a
   clean no-op" test uses exactly that fixture — a directory whose sole entry is
   `.gitkeep`.

**Idempotency + isolation (FR-08, AC-07).** `realImport` upserts every row
MERGE-on-id (`upsertNode`/`upsertEdge`), so a slice's stable ids make a re-run
net-zero. The loader never deletes and touches only the operator subgraph +
shared catalog; it never issues a write against retail Model #1's subgraph or
the retail/commercial seed files. AC-07's proof is a pre/post `/api/v1/stats`
diff attributable to a **re-run** being zero.

**Lifecycle-guard compatibility (FR-09, AC-08).** `realImport` pre-scans every
node + edge row and rejects any lifecycle-labeled row
(`BusinessModel`/`BusinessModule`/`BusinessModuleVersion`/`ModuleInstance` +
`IN_MODEL`/`HAS_VERSION`/`INSTANTIATES`/`INSTANCE_IN`/`FORKED_FROM`) with `409
model_lifecycle_route_required`, writing nothing (`import.ts:167-185`, verified).
Therefore fixtures under `shared/seed/saas-operator/` **must not** contain
lifecycle rows — the operator root is created via `createModel` (step (a)), and
`IN_MODEL` domain edges via `attachDomain` (step (a)), never via an import row.
`POST /api/v1/import` is reserved for **non-lifecycle** process content only.

### 4.5 Governed-API seed helper (FR-06, AC-19)

`api/src/seed/governed-seed-helper.ts` exports three thin POST helpers content
specs import — the helper **mechanism**; content specs supply the rows. This
foundation itself creates **no** risk/SLA/compliance rows (FR-06); AC-19 proves
the round-trip with a sample row per route, in a test, then leaves the store as
it found it (or cleans up).

| Helper | POSTs to | Permission | Body shape |
|--------|----------|------------|------------|
| `seedRisk(row)` | `POST /api/v1/risk-register` | `risk:write` | **hand-constructed object literal** matching the route's request shape — `{name, owner, domain, likelihood, impact, status, trend, description?}`. `createRiskSchema` (`risk-register.ts:7`) is **module-private (not exported)** and importing it would edit `risk-register.ts` (NFR-04-forbidden), so the risk body is not built from an imported schema; the route's own re-parse is the validation contract (C-01) |
| `seedSla(row)` | `POST /api/v1/slas` (D-1) | `sla:write` | built from `slaCreateRequestSchema` (exported, `@companygraph/shared/schema/kpi-sla`) |
| `seedComplianceRule(row)` | `POST /api/v1/compliance/rules` (D-2) | `compliance:write` | built from `complianceRuleSchema` (exported, `@companygraph/shared/schema/ontology`) |

Each helper `fetch`es the loopback API, checks the success envelope carries a
persisted id, and returns it. It edits **none** of the routes' storage code
(NFR-04) — the round-trip is the whole contract. If a governed route lacks a
field a content spec needs, that is a gap flagged to the owning spec (OQ-3), not
patched here.

## 5. HTTP API surface

This spec adds **no new REST route.** All server-side writes ride existing
routes:

| Method | Route | FR | Role in this spec |
|--------|-------|----|-------------------|
| POST | `/api/v1/models` (`createModel`) | FR-01 | operator root create via the `createModel` storage call from the seed script (§4.1) — never the route (N-02) |
| POST | `/api/v1/models/:id/domains` (`attachDomain`) | FR-03 | function-domain attach |
| POST | `/api/v1/import` (`realImport`) | FR-07/08/09 | slice-fixture process-content load (guarded, B-02) |
| POST | `/api/v1/personas` | FR-05 | shared persona seed |
| POST | `/api/v1/query/cypher` (`runPassthrough`, read-only) | FR-14 | FunctionMap per-domain descendant-count read (C-01) |
| POST | `/api/v1/risk-register` | FR-06 | governed helper (risk) |
| POST | `/api/v1/slas` | FR-06 | governed helper (SLA, D-1) |
| POST | `/api/v1/compliance/rules` | FR-06 | governed helper (compliance, D-2) |

No new entry is added to `ERROR_CODES` and no new `getRoutePermission` mapping is
needed — every route above is already mapped (`model:write` / `data:write` /
`persona:write` / `query:read` / `risk:write` / `sla:write` / `compliance:write`,
verified in `rbac-permissions.ts`). This satisfies FR-12 (no new permission
string; auth via the central gate only).

## 6. UI design

### 6.1 View-tree placement (FR-10, FR-11, UX-06)

New top-level **Business** surface, routes taken **verbatim** from the blueprint
View Tree. `saas-operator-foundation` is the sole editor of `route.ts` /
`SURFACES` / `views/index.tsx` (XD-05).

`SURFACES` (`pwa/src/route.ts`) gains one new surface object appended after
`model`, and one new tab on the existing `exec` surface:

```ts
// NEW surface (appended to SURFACES):
{ id: "business", label: "Business", kbd: "",   // no free Alt-digit slot — OQ-2 (a)
  tabs: [
    { id: "functions",  label: "Functions" },   // FunctionMap  (this spec, live)
    { id: "metrics",    label: "Metrics" },      // MetricLibrary  → saas-metric-library
    { id: "funnels",    label: "Funnels" },      // FunnelBoard    → funnel-pipeline-modeling
    { id: "benchmarks", label: "Benchmarks" },   // BenchmarkReport→ function-benchmark-scoring
  ],
}
// existing `exec` surface tabs[] gains one entry (FR-11):
{ id: "operator", label: "Operator" }            // OperatorCockpit → cross-function-exec-rollup
```

**OQ-2 (a) — no surf-jump accelerator.** All ten `Alt+[0-9]` slots are occupied
(`App.tsx` maps digits positionally into `SURFACES`; eleventh surface has no free
digit). The `business` surface ships `kbd: ""` and no `App.tsx` edit — it is
keyboard-*reachable* by Tab/focus + mouse, which is all AC-15 requires.
`#/exec/operator` introduces no accelerator (it reuses the `exec` surface).
`parseHash`/`toHash` handle both routes with no special-casing (they already
resolve `#/<surface>/<tab>` generically — `route.ts:154`); AC-09 asserts this.

### 6.2 View registration (FR-13, AC-17) — `pwa/src/views/index.tsx`

Add a `business` key to `VIEWS` and one `operator` entry to the `exec` map. The
sibling tabs render a shared **`BusinessTabPlaceholder`** (the
`ModelTabPlaceholder` precedent) that names the owning spec and consumes
`useActiveModel()` so the shell context is proven available — and never errors:

```tsx
business: {
  functions:  (r) => <FunctionMap route={r} />,                                  // live (this spec)
  metrics:    () => <BusinessTabPlaceholder tab="Metrics"    spec="saas-metric-library" />,
  funnels:    () => <BusinessTabPlaceholder tab="Funnels"    spec="funnel-pipeline-modeling" />,
  benchmarks: () => <BusinessTabPlaceholder tab="Benchmarks" spec="function-benchmark-scoring" />,
},
exec: {
  // …existing entries unchanged…
  operator: () => <BusinessTabPlaceholder tab="Operator" spec="cross-function-exec-rollup" />,
},
```

Each downstream spec later replaces **only its own one-line entry** here — never
`route.ts`/`SURFACES` (NFR-03). This is the sole route/view-registration diff in
the whole fan-out.

### 6.3 Component plan

| Component | Source | Use |
|-----------|--------|-----|
| `ViewHeader`, `ErrorState`, `Loading` | `pwa/src/views/_shared` (catalog) | header + error/loading states |
| `useActiveModel()` | `pwa/src/context/ActiveModelContext` (consumed) | active-model context — never re-implemented |
| `Button` | `pwa/src/components/Button` (catalog) | retry affordance, deep-link buttons |
| `BusinessTabPlaceholder` | **new**, `pwa/src/views/business/BusinessTabPlaceholder.tsx` | sibling-tab seam — justified: `ModelTabPlaceholder` lives in `views/model/` and names the model surface; a business-surface twin keeps the seam self-contained and avoids editing the model file |
| `FunctionMap` | **new**, `pwa/src/views/business/FunctionMap.tsx` | the live per-function landing map |

No new low-level primitive (button/card/list) is invented — FunctionMap composes
existing catalog components + a CSS module.

### 6.4 `FunctionMap` (FR-14, FR-15, AC-10..AC-13, AC-15)

Route `#/business/functions`. Consumes `useActiveModel()` and resolves the
SaaS-Operator root as its subject (defaulting to it via the OQ-1 name/marker key
if the active model is something else — FR-15). It reads the six function
domains + a per-domain journey/activity descendant count via **one
`POST /api/v1/query/cypher`** call (C-01, read-only, `query:read`):

```cypher
MATCH (m:BusinessModel {id:$operatorRootId})
MATCH (d:Domain)-[:IN_MODEL]->(m)
OPTIONAL MATCH (d)<-[:PART_OF*1..]-(desc)
WHERE desc:UserJourney OR desc:Activity              // C-03: count journeys/activities only
WITH d, count(DISTINCT desc) AS journeyActivityCount
RETURN d.id AS id, d.name AS name, d.description AS description,
       d.attributes_json AS attributes_json, journeyActivityCount
ORDER BY d.name
```

**Count semantics (resolves C-03).** The `WHERE desc:UserJourney OR
desc:Activity` label filter makes the surfaced number exactly the
journey/activity descendant count FR-14/AC-10 promise — never inflated by any
other node that a future `PART_OF` chain might attach under a domain. AC-10
asserts this filtered count.

**Passthrough caps (resolves C-04).** This read runs through
`POST /api/v1/query/cypher` → `runPassthrough` (read-only, driver AccessMode
read, `query.ts:142,157`), which carries `TX_TIMEOUT_MS` and the Cypher
passthrough row cap. The aggregate returns at most six rows (the six operator
domains) with a small per-domain traversal, so it is comfortably within those
limits in practice. Any `runPassthrough` failure — a timeout, a cap hit, or a
non-2xx envelope — maps to the FunctionMap **error** state (AC-13), which renders
`ErrorState` + a retry `Button`; it never silently renders empty.

**States (UX-01):**

- **loading** (AC-11) — a skeleton grid while the cypher read is in flight
  (`Loading` catalog component / skeleton rows).
- **empty** (AC-12) — the SaaS-Operator model resolves but returns zero function
  domains: a prompt to run `bun run seed:saas-operator`.
- **error** (AC-13) — the read failed (including a `runPassthrough` timeout/cap
  hit, C-04): `ErrorState` + a `Button` retry that refetches.
- **ready** (AC-10) — a keyboard-reachable grid of six function cards
  (name + description + `journeyActivityCount`, the C-03 filtered count), each a
  link that deep-links
  into the existing Explorer for that domain
  (`#/explorer/domain-detail/<domainId>` via `toHash`).

**Accessibility (AC-15, UX-05):** the view root is a `<section aria-label="…">`
landmark; the six function links are native anchors/buttons in DOM order so Tab
reaches each in sequence and Enter activates. No focus trap, no gesture handler.

### 6.5 Tokens + design conformance (NFR-06, AC-14, UX-02, UX-04)

`FunctionMap.tsx` styles via `FunctionMap.module.css` using **only**
`var(--…)` tokens from `pwa/src/styles/companygraph/tokens.css`; catalog
components are used before any new one. Desktop-first, no new breakpoints
(UX-04). AC-14 runs `bun run scripts/design-conformance.ts --view
pwa/src/views/business/FunctionMap.tsx` and the same for the `.module.css`,
both expected to exit 0 (the enforced two-invocation form, per
`model-workspace-core` precedent).

### 6.6 Input modes / Native Conflicts (UX-03)

FunctionMap ships **no** canvas/gesture/drag surface (the interactive
`FunnelBoard` is owned by `funnel-pipeline-modeling`). The only input handling is
standard link/list keyboard + pointer interaction. No new `Alt+<digit>`
accelerator is introduced (OQ-2 (a), §6.1), so the requirements' single Native
Conflicts row (browser/OS `Alt+<digit>`) needs **no** suppression here —
`App.tsx` is not edited. This matches the requirements' Platforms & Input Modes
and Native Conflicts tables exactly.

## 7. Wiring

- **`package.json`** — add `"seed:saas-operator": "bun --cwd api scripts/seed-saas-operator.ts"`
  (matches the existing `seed` script's `bun --cwd api scripts/…` form, D-3).
- **`shared/seed/saas-operator/`** — create the directory with a committed
  `.gitkeep` so it always exists in git (empty of slices at this foundation's
  completion). The loader's `filter(".json")` skips `.gitkeep`, so a
  `.gitkeep`-only directory is a zero-slice clean no-op (C-02, §4.4). Content
  specs add `<function>.json` here later.

## 8. Test strategy

| AC | Kind | Test file |
|----|------|-----------|
| AC-01 | integration (Neo4j) | `api/__tests__/saas-operator-root.integration.test.ts` — one root, second run no-op, retail #1 untouched |
| AC-02 | integration + CLI | `api/__tests__/saas-operator-no-txn-entities.integration.test.ts` + `git diff shared/src/schema/{nodes,edges}.ts` (manual) |
| AC-03 | integration (Neo4j) | `api/__tests__/saas-operator-domains.integration.test.ts` — six domains, `seedKey` resolvable, re-run no dup |
| AC-04, AC-05 | integration (Neo4j) | `api/__tests__/saas-operator-catalog.integration.test.ts` — systems/personas/roles seeded once via `operatorSeedKey` MERGE, no dup on re-run; **`:Role` (not `:RBACRole`) seeded** (B-02); **retail `CRM` node untouched** — assert its id + description unchanged and no `operatorSeedKey` after `seed:saas-operator` (B-01); operator `CRM` is a distinct node carrying `operatorSeedKey:"crm"` + `systemKind`; no new permission string |
| AC-06, AC-07 | integration (Neo4j) | `api/__tests__/saas-operator-seed-loader.integration.test.ts` — dir-iterate, new-file-no-edit, empty no-op, idempotent, retail isolation |
| AC-08 | integration (Neo4j) | `api/__tests__/saas-operator-seed-lifecycle-guard.integration.test.ts` — lifecycle row via `POST /api/v1/import` → 409, write-nothing |
| AC-09 | unit (PWA) | `pwa/src/__tests__/business-routes.test.ts` — surface + tabs, `parseHash` resolves both routes |
| AC-10 | unit (PWA) | `pwa/src/__tests__/function-map.test.tsx` — ready state, six domains, filtered `journeyActivityCount` (C-03), deep links; the six-card render is driven by a mocked query response, but the live-render prerequisite (AC-15/AC-16) is the seeded scaffold |
| AC-11, AC-12, AC-13 | unit (PWA) | `pwa/src/__tests__/function-map-states.test.tsx` — loading/empty/error (error covers a `runPassthrough` failure/cap hit, C-04) |
| AC-14 | manual (CLI) | `bun run scripts/design-conformance.ts --view …` ×2 → exit 0 |
| AC-15 | manual | keyboard walk of `#/business/functions` (repro in AC). **Precondition: `bun run seed:saas-operator` step (a)** — the six seeded domains are what the view renders (not slice content), C-05 |
| AC-16 | e2e (Playwright) | `pwa/playwright/business-functions-reload.spec.ts` — deep link survives reload. **Precondition: full stack up + `bun run seed:saas-operator` step (a)** (six domains) as a fixture, C-05 |
| AC-17 | unit (PWA) | `pwa/src/__tests__/business-placeholder.test.tsx` — sibling routes render placeholder + context |
| AC-18 | CLI | `bun run typecheck` exit 0 + `git diff --stat` boundary check (manual) |
| AC-19 | integration (Postgres/Neo4j) | `api/__tests__/saas-operator-seed-helper.integration.test.ts` — round-trip each governed route (targeting the **as-built** routes `/api/v1/risk-register`, `/api/v1/slas`, `/api/v1/compliance/rules` — not the requirements' stale `/sla-crud`/`/compliance-rules` strings, N-03/D-1/D-2), no storage-code diff |

## 9. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `api/scripts/seed-saas-operator.ts` | new | FR-07, FR-08, FR-09 | CLI loader entrypoint; step (a) scaffold + step (b) dir-iterate → `POST /api/v1/import` |
| `api/src/seed/ensure-operator-root.ts` | new | FR-01 | `ensureOperatorRoot` — lookup-before-`createModel` (OQ-1 a) |
| `api/src/seed/ensure-function-domains.ts` | new | FR-03 | `ensureFunctionDomains` — lookup-before-`attachDomain` on `seedKey` (OQ-4) |
| `api/src/seed/ensure-catalog.ts` | new | FR-04, FR-05 | `ensureSystems`/`ensureRoles`/`ensurePersonas`, idempotent MERGE on top-level `operatorSeedKey` marker (B-01/B-02); `ensureRoles` writes `:Role` (not `:RBACRole`) via the seed-script direct-driver MERGE pattern; `ensurePersonas` via `POST /api/v1/personas` |
| `api/src/seed/saas-operator-catalog.ts` | new | FR-04, FR-05 | catalog data + internal zod shapes (§3.4) |
| `api/src/seed/governed-seed-helper.ts` | new | FR-06 | `seedRisk`/`seedSla`/`seedComplianceRule` POST helpers (D-1/D-2 routes) |
| `shared/seed/saas-operator/.gitkeep` | new | FR-07 | empty slice directory (content specs add fixtures) |
| `package.json` | modify | FR-07 | add `seed:saas-operator` script (D-3 form) |
| `pwa/src/route.ts` | modify | FR-10, FR-11 | append `business` surface + `exec/operator` tab (SOLE route-file editor, XD-05) |
| `pwa/src/views/index.tsx` | modify | FR-13 | add `business` VIEWS map + `exec.operator` placeholder (SOLE view-registration editor, XD-05) |
| `pwa/src/views/business/FunctionMap.tsx` | new | FR-14, FR-15 | live per-function map, four states |
| `pwa/src/views/business/FunctionMap.module.css` | new | FR-14, NFR-06 | tokens-only styling |
| `pwa/src/views/business/BusinessTabPlaceholder.tsx` | new | FR-13 | sibling-tab seam (consumes `useActiveModel`) |
| `api/__tests__/saas-operator-root.integration.test.ts` | new | AC-01 | |
| `api/__tests__/saas-operator-no-txn-entities.integration.test.ts` | new | AC-02 | |
| `api/__tests__/saas-operator-domains.integration.test.ts` | new | AC-03 | |
| `api/__tests__/saas-operator-catalog.integration.test.ts` | new | AC-04, AC-05 | |
| `api/__tests__/saas-operator-seed-loader.integration.test.ts` | new | AC-06, AC-07 | |
| `api/__tests__/saas-operator-seed-lifecycle-guard.integration.test.ts` | new | AC-08 | |
| `api/__tests__/saas-operator-seed-helper.integration.test.ts` | new | AC-19 | |
| `pwa/src/__tests__/business-routes.test.ts` | new | AC-09 | |
| `pwa/src/__tests__/function-map.test.tsx` | new | AC-10 | |
| `pwa/src/__tests__/function-map-states.test.tsx` | new | AC-11, AC-12, AC-13 | |
| `pwa/src/__tests__/business-placeholder.test.tsx` | new | AC-17 | |
| `pwa/playwright/business-functions-reload.spec.ts` | new | AC-16 | |

**Explicitly NOT edited** (ownership boundaries — spec-guard must not allow):
`api/src/storage/models.ts`, `api/src/routes/models.ts` (model-workspace-core);
`api/src/routes/import.ts` (graph-core, reused as-is);
`api/src/routes/{risk-register,sla-crud,compliance-rules,change-requests,risk-compliance}.ts`
(risk-compliance-change / kpi-okr-governance);
`shared/src/schema/{nodes,edges}.ts` (no schema-array edit, NFR-01);
`api/src/auth/rbac-permissions.ts` (no new permission string, FR-12);
`pwa/src/App.tsx` (no accelerator edit, OQ-2 a).

## 10. Traceability

| FR | Design | ACs |
|----|--------|-----|
| FR-01 | §3.1, §4.1 | AC-01 |
| FR-02 | §3.3, §4.4 (non-lifecycle only) | AC-02 |
| FR-03 | §3.2, §4.2 | AC-03 |
| FR-04 | §3.3, §4.3 | AC-04 |
| FR-05 | §3.3, §4.3 | AC-05 |
| FR-06 | §4.5, §5 | AC-19 |
| FR-07 | §4.4, §7, §9 | AC-06 |
| FR-08 | §4.4 | AC-07 |
| FR-09 | §4.4 | AC-08 |
| FR-10 | §6.1 | AC-09 |
| FR-11 | §6.1 | AC-09 |
| FR-12 | §4.3, §5 | AC-05, AC-18 |
| FR-13 | §6.2 | AC-17 |
| FR-14 | §6.4 | AC-10, AC-11, AC-12, AC-13, AC-14, AC-15 |
| FR-15 | §4.1, §6.4 | AC-16 |
| NFR-01 | §3, §9 | AC-02, AC-18 |
| NFR-02 | §4.1, §4.4 | AC-01, AC-07 |
| NFR-03 | §6.1, §6.2, §9 | AC-09, AC-18 |
| NFR-04 | §4.5, §9 | AC-19 |
| NFR-05 | Rule A/D, §5 | AC-18 |
| NFR-06 | §6.5 | AC-14 |

## 11. Rejected alternatives

- **Fixed-constant operator-root UUID (OQ-1 b).** Would need a
  lifecycle-guard-exempt create path with a client-supplied id, conflicting with
  `createModel`'s server-generated id. Rejected → name/`saasOperatorRoot:true`
  lookup (§4.1).
- **Client-supplied fixed domain id (OQ-4 alt).** Would require extending
  `model-workspace-core`'s `attachDomain` to accept + MERGE an id — an
  ownership-boundary edit. Rejected → `seedKey` lookup-before-attach (§4.2).
- **New `models.ts` route for FunctionMap's per-domain count (C-01 alt).** That
  file is `model-workspace-core`-owned. Rejected → generic
  `POST /api/v1/query/cypher` (§6.4).
- **MERGE catalog Systems on bare `name` (B-01).** The retail seed already has a
  `System` named `CRM` (`retail-mini.json:69`) and the operator catalog also
  seeds `CRM`; a `MERGE (s:System {name:"CRM"})` would match and either alias or
  mutate the retail-owned node, violating NFR-02/XD-01/AC-04. Rejected → MERGE on
  a top-level operator-owned `operatorSeedKey` marker that no retail node carries
  (§4.3).
- **Seeding core roles as `:RBACRole` / via `seed-rbac-roles.ts` (B-02).**
  `EXECUTES` targets are the core process `:Role` label, distinct from the
  authorization `:RBACRole`; conflating them would seed the wrong label and could
  add a permission. Rejected → direct-driver `MERGE (:Role {operatorSeedKey})`,
  the same trusted seed-script pattern (§4.3, Rule A); `:RBACRole` untouched.
- **Hand-listed loader manifest.** Would force every content spec to edit the
  loader, reintroducing the file-collision the fan-out avoids. Rejected →
  `readdirSync` directory iteration (§4.4).
- **Seeding via `POST /api/v1/ontology/import`** (as `bun run seed` does).
  That route lacks the lifecycle guard and takes the registry payload, not
  `{nodes,edges}`. Rejected → `POST /api/v1/import`/`realImport` (B-02, §4.4).
- **A `business`-surface `Alt`-digit accelerator (OQ-2 b).** No free digit slot;
  assigning one is a larger `App.tsx` migration with no AC requiring it.
  Rejected → keyboard-reachable-only, no accelerator (§6.1).
- **New RBAC permission strings for the seed harness.** Reuses existing
  `model:write`/`data:write`/`query:read`/`risk:write`/`sla:write`/`compliance:write`
  mappings. Rejected → FR-12 (§5).
