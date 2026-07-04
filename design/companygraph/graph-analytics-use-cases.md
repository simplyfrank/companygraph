# Graph Analytics Use Cases — Process Optimisation

This document defines analytics queries and algorithms that run against the companygraph ontology to detect suboptimal business processes and recommend improvements. Each use case includes:

- **Detection query** — Cypher or graph algorithm that surfaces the problem
- **Business meaning** — why the pattern is costly
- **Remediation** — concrete action the ontology manager can take
- **Priority signals** — when to surface the alert (thresholds)

---

## UC-01  Journey Bottleneck Detection

**Problem** — Activities that every user must pass through, but that have high latency or error rates, create throughput ceilings for entire journeys.

**Detection**

```cypher
MATCH (j:UserJourney)-[:CONTAINS]->(a:Activity)
WITH a, count(DISTINCT j) AS journeyCount
MATCH (a)-[:REQUIRES]->(s:System)
OPTIONAL MATCH (a)-[:OWNED_BY]->(r:Role)
WHERE journeyCount > 5   // threshold: appears in >5 journeys
RETURN a.name AS activity,
       journeyCount,
       s.name AS system,
       collect(DISTINCT r.name) AS owners
ORDER BY journeyCount DESC
```

**Remediation**
- Cache results at the Activity node if output is deterministic
- Split the Activity into parallel sub-activities if steps are independent
- Add a `:CAN_SKIP` edge type for power users (requires SLA review)

**Alert Priority**
- 🔴 Critical if `journeyCount > 20` and no `:HAS_BACKUP` edge exists
- 🟡 Warning if `journeyCount > 5` and system has `scale_mode = 'manual'`

---

## UC-02  Circular Dependency Detection

**Problem** — Cycles in the journey graph (UserJourney → Activity → … → UserJourney) trap users in loops or cause infinite retry storms in downstream systems.

**Detection**

```cypher
MATCH path = (a:Activity)-[:FLOWS_TO*3..10]->(a)
WHERE ALL(i IN range(0, length(path)-1)
      WHERE (nodes(path)[i])-[:FLOWS_TO]->(nodes(path)[i+1]))
RETURN [n IN nodes(path) | n.name] AS cycle,
       length(path) AS cycleLength
```

**Remediation**
- Introduce a `:BREAKS_CYCLE` edge from the highest-latency step to a terminal node
- Merge circular activities into a single composite Activity with internal state machine
- Add a `:TIMEOUT` property on FLOWS_TO edges to prevent infinite loops

**Alert Priority**
- 🔴 Critical if cycle includes a payment or compliance Activity
- 🟡 Warning if cycleLength > 5 (long loops are harder for users to escape)

---

## UC-03  Orphaned Activity / System Detection

**Problem** — Entities with no inbound or outbound relationships are dead code: they consume maintenance, schema, and cognitive overhead but deliver zero business value.

**Detection**

```cypher
MATCH (a:Activity)
WHERE NOT (a)-[:FLOWS_TO|CONTAINS|REQUIRES|OWNED_BY]-()
RETURN labels(a)[0] AS entityType, a.name AS entity
UNION
MATCH (s:System)
WHERE NOT (s)-[:REQUIRED_BY|DEPENDS_ON]-()
RETURN labels(s)[0] AS entityType, s.name AS entity
```

**Remediation**
- Delete if entity was never deployed (no `:HAS_DEPLOYMENT` edge)
- Archive with `:IS_DEPRECATED` edge if legacy but still referenced in audit logs
- Connect to a real journey if the entity was created but never wired

**Alert Priority**
- 🔴 Critical if orphaned entity has `created_at > 90 days`
- 🟡 Warning if entity has `created_at > 30 days` and no `:HAS_VERSION` history

---

## UC-04  Cross-Context Coupling Analysis

**Problem** — Excessive API calls or `:FLOWS_TO` edges between bounded contexts create tight coupling, slowing independent deployment and increasing blast radius.

**Detection**

Use the existing `contextApi()` helper in `Erd.tsx` and aggregate:

```typescript
// For each pair of contexts (A, B)
const coupling = edges.filter(e =>
  contextOf(e.fromLabel) === A && contextOf(e.toLabel) === B
).length;

// Coupling ratio = cross-context edges / total edges in context
const ratio = coupling / edgesInA.length;
```

**Remediation**
- Introduce a `:PUBLISHES_EVENT` edge so A emits async events instead of synchronous calls
- Move shared entity into a third `:SHARED_CONTEXT` if both A and B mutate it
- Create a `:FACADE` node in A that batches calls to B

**Alert Priority**
- 🔴 Critical if ratio > 0.5 (more than half of A's edges leave A)
- 🟡 Warning if any single target context receives >80% of A's outbound edges

---

## UC-05  Hot Path Analysis

**Problem** — The most frequently traversed journey paths monopolise infrastructure. Without insight, teams over-optimise cold paths and under-optimise hot ones.

**Detection**

```cypher
MATCH path = (j:UserJourney)-[:CONTAINS]->(a1:Activity)-[:FLOWS_TO]->(a2:Activity)-[:FLOWS_TO]->(a3:Activity)
WITH [a1, a2, a3] AS segment, count(*) AS traversalCount
RETURN [n IN segment | n.name] AS hotPath,
       traversalCount
ORDER BY traversalCount DESC
LIMIT 10
```

**Remediation**
- Pre-materialise the Activity sequence as a single `:COMPOSITE_ACTIVITY`
- Add `:CACHED_RESULT` edges to hot intermediate nodes
- Move the entire path onto a dedicated `scale_group` in the System node

**Alert Priority**
- 🔴 Critical if top-3 paths represent >70% of all traversals (concentration risk)
- 🟡 Warning if any hot path includes a System with `availability_sla < 99.9%`

---

## UC-06  Single Point of Failure (SPOF) Detection

**Problem** — A System or Role that many journeys depend on becomes a systemic risk. One outage cascades across the entire graph.

**Detection**

```cypher
MATCH (s:System)
OPTIONAL MATCH (s)<-[:REQUIRES]-(a:Activity)<-[:CONTAINS]-(j:UserJourney)
WITH s, count(DISTINCT j) AS dependentJourneys
OPTIONAL MATCH (s)<-[:USES]-(r:Role)
WITH s, dependentJourneys, count(DISTINCT r) AS dependentRoles
WHERE dependentJourneys > 0
RETURN s.name AS system,
       dependentJourneys,
       dependentRoles,
       (dependentJourneys * 1.0 / totalJourneyCount) AS journeyShare
ORDER BY dependentJourneys DESC
```

**Remediation**
- Add `:HAS_BACKUP` edge to a redundant System node
- Split the System into read and write replicas with `:READ_REPLICA` / `:WRITE_REPLICA`
- Introduce a `:CIRCUIT_BREAKER` Activity that degrades gracefully

**Alert Priority**
- 🔴 Critical if `journeyShare > 0.4` (touches >40% of journeys) and no backup exists
- 🟡 Warning if `dependentRoles === 1` (bus-factor = 1 on the ops side)

---

## UC-07  Process Fragmentation Index

**Problem** — Journeys that hop between too many bounded contexts incur context-switching overhead: different teams, different deploy cadences, different SLAs.

**Detection**

For each `UserJourney`, count context switches:

```typescript
function contextSwitches(journeyEdges: ErdEdge[]): number {
  let switches = 0;
  for (let i = 1; i < journeyEdges.length; i++) {
    const prev = contextOf(journeyEdges[i-1].toLabel);
    const curr = contextOf(journeyEdges[i].fromLabel);
    if (prev && curr && prev !== curr) switches++;
  }
  return switches;
}
```

**Remediation**
- Reassign Activities to the context that owns the majority of the journey
- Merge adjacent contexts if their `:FLOWS_TO` density is high
- Create a `:JOURNEY_COORDINATOR` Role that owns end-to-end SLA

**Alert Priority**
- 🔴 Critical if a single journey has `switches > 5`
- 🟡 Warning if average switches per journey > 2 across the portfolio

---

## UC-08  N+1 API Anti-pattern Detection

**Problem** — An endpoint that returns a list of entities, then triggers individual queries for each item, causes quadratic load on downstream systems.

**Detection**

Analyse the OpenAPI spec and runtime telemetry:

```typescript
// Static detection: endpoint returns array but child paths are per-item
const listEndpoint = openApiPaths.find(p =>
  p.path.endsWith('/list') || p.responses['200']?.schema?.type === 'array'
);
const detailEndpoint = openApiPaths.find(p =>
  p.path.includes('/:id') || p.path.includes('/{id}')
);

// Runtime detection: API gateway logs show burst of child calls
if (listCall.count === 1 && detailCall.count > listResponse.length * 0.8) {
  // N+1 suspected: one list call followed by N detail calls
}
```

**Remediation**
- Expand the list endpoint with `?expand=children` query parameter
- Add a `:BATCH_RESOLVER` Activity that uses a batched API
- Denormalise the graph: create `:HAS_SUMMARY` edges that pre-join data

**Alert Priority**
- 🔴 Critical if `detailCall.count / listResponse.length > 1.2` (more detail calls than items)
- 🟡 Warning if the list endpoint has no `expand` or `fields` query parameter

---

## UC-09  Schema Drift / Unused Attribute Detection

**Problem** — Entity schemas accumulate fields that no API consumer reads, increasing payload size, storage cost, and cognitive load.

**Detection**

Compare `json_schema_doc` properties against OpenAPI request/response fields:

```typescript
const schemaProps = Object.keys(nodeLabel.json_schema_doc.properties ?? {});
const usedProps = new Set<string>();

// Scan all OpenAPI operation request/response schemas
for (const op of openApiPaths) {
  extractSchemaRefs(op.requestBody, usedProps);
  extractSchemaRefs(op.responses, usedProps);
}

const unusedProps = schemaProps.filter(p => !usedProps.has(p));
```

**Remediation**
- Deprecate unused properties with `@deprecated` in the schema
- Move cold properties to a `:HAS_EXTENSION` edge (extension table pattern)
- Audit property creation: require a consuming API path in the PR

**Alert Priority**
- 🔴 Critical if `unusedProps.length / schemaProps.length > 0.5`
- 🟡 Warning if any property has been unused for >90 days

---

## UC-10  Dead-Code Node Detection

**Problem** — Nodes that exist in the ontology but have zero instance data in Neo4j are schema debt: they slow down schema validation and confuse new developers.

**Detection**

```cypher
MATCH (n)
WITH labels(n)[0] AS label, count(*) AS instanceCount
MATCH (nl:NodeLabel {name: label})
WHERE instanceCount = 0
RETURN nl.name AS deadLabel, nl.created_at AS createdAt
```

**Remediation**
- Delete the `NodeLabel` and its `EdgeType` constraints if it was experimental
- Convert to a `:WISHLIST` annotation if the business still plans to use it
- Seed test data to validate the schema before declaring it live

**Alert Priority**
- 🔴 Critical if `createdAt > 180 days` and `instanceCount === 0`
- 🟡 Warning if `instanceCount === 0` and the label has `json_schema_doc` defined

---

## Implementation Roadmap

### Server-side (graphology on API) — NEW STANDARD

| Algorithm | API Endpoint | Package | Time |
|---|---|---|---|
| Betweenness Centrality | `GET /api/v1/analytics/graph` | `graphology-metrics` | O(n·e) |
| PageRank | `GET /api/v1/analytics/graph` | `graphology-metrics` | O(k·e) |
| Louvain Communities | `GET /api/v1/analytics/graph` | `graphology-communities-louvain` | O(e log n) |
| SCC (Tarjan) | `GET /api/v1/analytics/graph` | `graphology-components` | O(n+e) |
| Cycle Detection | `GET /api/v1/analytics/graph` | Custom DFS on graphology | O((n+e)(c+1)) |

### Client-side fallback (`graphLib.ts`) — OFFLINE / TEST ONLY

The PWA retains a zero-dependency CSR implementation for offline use and unit tests.
**Production analytics should always call `api.analytics()`.**

| Use case | Query complexity | Needs telemetry | UI surface |
|---|---|---|---|
| UC-01 Bottleneck | Low | Yes (latency) | ERD tooltip + panel |
| UC-02 Circular | Medium | No | ERD cycle highlight (red dashed) |
| UC-03 Orphaned | Low | No | ERD greyed-out nodes + panel |
| UC-04 Coupling | Low | No | Context panel coupling ratio |
| UC-05 Hot Path | Medium | Yes (traversal counts) | Journey detail heatmap |
| UC-06 SPOF | Low | No | System node risk badge |
| UC-07 Fragmentation | Medium | No | Journey panel context-switch count |
| UC-08 N+1 | Medium | Yes (API gateway logs) | API docs panel anti-pattern badge |
| UC-09 Schema Drift | Medium | No | Schema panel unused-property list |
| UC-10 Dead Code | Low | No | Ontology manager prune list |

---

## Notes

- All Cypher queries assume the current ontology labels (`UserJourney`, `Activity`, `System`, `Role`, `Domain`, `Location`) and the edge types registered in `api/src/routes/ontology-edge-types.ts`.
- Telemetry-dependent use cases (UC-01, UC-05, UC-08) require a future `metrics` bounded context that ingests API gateway and APM data.
- The `Erd.tsx` `contextApi()` helper already computes cross-context edges; extend it to return coupling ratios for UC-04.
