// `applySchema(driver)` ensures every Neo4j constraint + index the rest
// of the codebase relies on exists. Idempotent: each statement uses
// `IF NOT EXISTS`, so running it on a clean DB and on a populated one
// produces identical post-conditions (AC-04 / AC-14 + ontology-manager
// FR-15).
//
// Three-step bootstrap (post-T-09a refactor):
//   1. `applyMetaSchema(driver)` — creates the `_Ontology*` namespace's
//      own constraints + indexes (the registry's own meta-schema).
//   2. `seedRegistryFromConstTuples(driver)` — if `isRegistryEmpty` is
//      true, seed the registry from the compile-time `NODE_LABELS` /
//      `EDGE_TYPES` const tuples. `api/src/ontology/seed.ts` is the
//      SOLE legal importer of those const tuples per NFR-02 + AC-15.
//   3. Iterate the runtime registry and create per-label data
//      constraints (`node_id_unique_<label>`, `node_name_<label>`) +
//      per-type edge-id constraints. After ontology-manager lands, this
//      loop replaces the previous compile-time `for (const label of
//      NODE_LABELS)` iteration so labels registered at runtime via
//      `POST /api/v1/ontology/node-labels` get their constraints
//      automatically on next bootstrap.
//
// NFR-02 boundary: this file imports NO compile-time const tuples. Only
// `api/src/ontology/seed.ts` is allowed to (the seed loader's sole
// reason for being).

import type { Driver } from "neo4j-driver";
import { applyMetaSchema } from "../ontology/meta-bootstrap";
import {
  isRegistryEmpty,
  seedRegistryFromConstTuples,
  seedBoundedContexts,
} from "../ontology/seed";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { ontologyEvents } from "../ontology/events";
import { runSystemKindMigration } from "../ontology/system-kind-migration";
import { registerModelSchema } from "../scripts/register-model-labels";
import { registerStorySchema } from "../scripts/register-story-labels";
import { registerCapabilitySchema } from "../scripts/register-capability-labels";
import { registerKpiImpactEdges } from "../scripts/register-kpi-impact-edges";

async function hasMissingCoreLabels(driver: Driver): Promise<boolean> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (l:_OntologyNodeLabel)
       WHERE l.name IN $coreLabels
       RETURN count(l) AS n`,
      { coreLabels: NODE_LABELS },
    );
    const found = (r.records[0]?.get("n") as number) ?? 0;
    return found < NODE_LABELS.length;
  } finally {
    await session.close();
  }
}

export async function applySchema(driver: Driver): Promise<void> {
  // Step 1: meta-schema for the registry itself.
  await applyMetaSchema(driver);

  // Step 2: seed the registry from the compile-time const tuples IF EMPTY
  // OR IF core labels are missing (a partial registry can happen when a
  // test clears the meta namespace and then registers model-workspace
  // labels without re-seeding the core labels).
  const registryEmpty = await isRegistryEmpty(driver);
  const coreLabelsMissing = await hasMissingCoreLabels(driver);
  if (registryEmpty || coreLabelsMissing) {
    const result = await seedRegistryFromConstTuples(driver);
    ontologyEvents.emit("ontology.changed", {
      event_id: result.event_id,
      version_id: result.version_id,
      ts: new Date().toISOString(),
      diff: [],
    });
  }

  // Step 3: seed bounded contexts from specification file.
  // This runs every bootstrap but is idempotent (checks if already seeded).
  await seedBoundedContexts(driver);

  // Step 3a (ddd-system-modeling DD-14): register the BoundedContext
  // _OntologyNodeLabel row BEFORE registerModelSchema. The model-workspace
  // edges BELONGS_TO_SHARED_DOMAIN and IN_NAMESPACE both reference
  // BoundedContext as an endpoint, and createEdgeType's
  // assertEndpointLabelsExist will throw type_pair_violation if the label
  // isn't in the registry yet. seedBoundedContexts only creates DATA nodes
  // (BoundedContext label instances), not the registry row. The registry
  // row was previously created in step 3d (registerCapabilitySchema),
  // which runs AFTER registerModelSchema — too late. Idempotent.
  const { createNodeLabel } = await import("../ontology/storage/node-labels");
  const { ValidationError } = await import("../errors");
  try {
    await createNodeLabel(
      driver,
      {
        name: "BoundedContext",
        description:
          "A DDD bounded context from the bounded-contexts ontology surface. Data nodes are seeded by api/src/ontology/seed.ts (seedBoundedContexts); this row registers the LABEL so model-workspace + capability edges can target it.",
        usage_example:
          "(bc:BoundedContext)-[:BELONGS_TO_SHARED_DOMAIN]->(sd:SharedDomain)",
        json_schema_doc: {},
      },
      "system:ddd-system",
    );
  } catch (e) {
    // name_conflict = already registered (idempotent). Any other error
    // propagates.
    if (!(e instanceof ValidationError && (e.code as string) === "name_conflict")) {
      throw e;
    }
  }

  // Step 3b (model-workspace-core T-03 / FR-01–04, NFR-01): register the
  // four model-workspace lifecycle labels + five edges through the runtime
  // registry (never the compile-time consts). Idempotent — name_conflict
  // is swallowed inside registerModelSchema. Runs BEFORE step 4 so the
  // registry iteration below creates the per-label id constraints for the
  // new labels on the same boot.
  await registerModelSchema(driver);

  // Step 3c (story-spec-core T-02 / FR-01–04, NFR-01): register the two
  // story-spec labels (UserStory, AcceptanceCriterion) + three edges
  // (DESCRIBES_ACTIVITY, STORY_FOR_ROLE, ACCEPTANCE_OF) through the
  // runtime registry (never the compile-time consts). Idempotent —
  // name_conflict is swallowed inside registerStorySchema. Runs BEFORE
  // step 4 so the registry iteration below creates the per-label id
  // constraints for the new labels on the same boot, and AFTER the
  // core-label seed + step 3b so Activity/Role exist when the edge
  // endpoints are checked (assertEndpointLabelsExist).
  await registerStorySchema(driver);

  // Step 3d (ddd-system-modeling T-02 / FR-01–02, NFR-01): register the
  // BoundedContext registry row (DD-14 — the row exists nowhere else;
  // seedBoundedContexts writes only data nodes), the Capability label,
  // and the four capability edges (NEEDS_CAPABILITY ×2 pairs,
  // SUPPORTED_BY, ASSIGNED_TO_CONTEXT, CAPABILITY_IN_MODEL) through the
  // runtime registry (never the compile-time consts). Idempotent —
  // name_conflict is swallowed inside registerCapabilitySchema. Runs
  // AFTER step 3b (BusinessModel row must pre-exist for
  // CAPABILITY_IN_MODEL) and AFTER step 3c (UserStory row must
  // pre-exist for the second NEEDS_CAPABILITY pair) — createEdgeType
  // runs assertEndpointLabelsExist — and BEFORE step 4 so the registry
  // iteration below creates the per-label id constraints on the same
  // boot.
  await registerCapabilitySchema(driver);

  // Step 3e (kpi-impact-mapping T-09 / DD-02, XD-01): register the
  // IMPACTS_KPI edge type (UserStory → KPI) through the runtime registry.
  // Idempotent — name_conflict is swallowed inside registerKpiImpactEdges.
  // Runs AFTER step 3c (UserStory) and the core-label seed (KPI) so the
  // edge endpoints exist for assertEndpointLabelsExist — and BEFORE step 4.
  await registerKpiImpactEdges(driver);

  // Step 4: iterate the registry and ensure per-label / per-type data
  // constraints exist. All statements use `IF NOT EXISTS` so re-running
  // is a no-op (AC-04 / AC-14).
  const session = driver.session();
  try {
    const labelsRes = await session.run(
      `MATCH (l:_OntologyNodeLabel) RETURN l.name AS name ORDER BY l.name`,
    );
    const labels = labelsRes.records.map((r) => r.get("name") as string);
    for (const label of labels) {
      await session.run(
        `CREATE CONSTRAINT node_id_unique_${label} IF NOT EXISTS
         FOR (n:\`${label}\`) REQUIRE n.id IS UNIQUE`,
      );
      await session.run(
        `CREATE INDEX node_name_${label} IF NOT EXISTS
         FOR (n:\`${label}\`) ON (n.name)`,
      );
    }

    const typesRes = await session.run(
      `MATCH (t:_OntologyEdgeType) RETURN t.name AS name ORDER BY t.name`,
    );
    const types = typesRes.records.map((r) => r.get("name") as string);
    for (const type of types) {
      await session.run(
        `CREATE CONSTRAINT edge_id_unique_${type} IF NOT EXISTS
         FOR ()-[r:\`${type}\`]-() REQUIRE r.id IS UNIQUE`,
      );
    }

    // model-workspace-core T-03 (design §4.3): BusinessModel.ordinal
    // uniqueness (server-assigned max+1; concurrent double-create loses
    // one side → bounded retry in storage/models.ts). T-24 supersedes the
    // two forkLocalKey lookup indexes with uniqueness constraints — the
    // constraint's backing RANGE index serves the same equality + STARTS
    // WITH lookups while also preventing duplicate forkLocalKey values
    // under concurrent fork races (B-01). Neo4j exempts nodes missing the
    // property, so the core graph is unaffected. All IF NOT EXISTS →
    // re-run is a no-op.
    await session.run(
      `CREATE CONSTRAINT business_model_ordinal_unique IF NOT EXISTS
       FOR (m:BusinessModel) REQUIRE m.ordinal IS UNIQUE`,
    );
    // T-24: drop the superseded lookup indexes, then create uniqueness
    // constraints (idempotent — DROP IF EXISTS + CREATE IF NOT EXISTS).
    await session.run(
      `DROP INDEX user_journey_fork_local_key IF EXISTS`,
    );
    await session.run(
      `DROP INDEX activity_fork_local_key IF EXISTS`,
    );
    await session.run(
      `CREATE CONSTRAINT user_journey_fork_local_key_unique IF NOT EXISTS
       FOR (n:UserJourney) REQUIRE n.forkLocalKey IS UNIQUE`,
    );
    await session.run(
      `CREATE CONSTRAINT activity_fork_local_key_unique IF NOT EXISTS
       FOR (n:Activity) REQUIRE n.forkLocalKey IS UNIQUE`,
    );
  } finally {
    await session.close();
  }

  // Step 4b (process-explorer-ui T-31 / FR-17): per-label fulltext indexes
  // for substring search (GET /api/v1/query/search). Named
  // `<label_lower>_name_fulltext`, created IF NOT EXISTS so re-runs are
  // no-ops. Only created for labels that have a `name` property (all
  // registry labels do per the node envelope schema).
  const ftSession = driver.session();
  try {
    const labelsRes2 = await ftSession.run(
      `MATCH (l:_OntologyNodeLabel) RETURN l.name AS name ORDER BY l.name`,
    );
    const allLabels = labelsRes2.records.map((r) => r.get("name") as string);
    for (const label of allLabels) {
      const idxName = `${label.toLowerCase()}_name_fulltext`;
      await ftSession.run(
        `CREATE FULLTEXT INDEX ${idxName} IF NOT EXISTS
         FOR (n:\`${label}\`) ON EACH [n.name]`,
      );
    }
  } finally {
    await ftSession.close();
  }

  // Step 5 (system-augmentation-model T-05 / FR-07): tighten the System
  // attribute doc + backfill legacy Systems to systemKind:"functional".
  // Idempotent + event-quiet on re-run. Own try/catch (DD-15) so a
  // transient failure logs a distinct, actionable line before rethrowing
  // into server.ts's existing warn-and-start catch — the every-boot
  // re-run is the self-healing mitigation, and the migration's drift
  // backfill repairs Systems written during a failure window.
  try {
    await runSystemKindMigration(driver);
  } catch (e) {
    console.error(
      "[system-kind-migration] FAILED — System writes are UNVALIDATED until 'bun run migrate:system-kind' succeeds (or restart the server; the migration re-runs on every boot)",
      e,
    );
    throw e;
  }
}
