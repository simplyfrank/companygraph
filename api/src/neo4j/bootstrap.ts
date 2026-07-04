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
import { ontologyEvents } from "../ontology/events";
import { runSystemKindMigration } from "../ontology/system-kind-migration";
import { registerModelSchema } from "../scripts/register-model-labels";
import { registerStorySchema } from "../scripts/register-story-labels";

export async function applySchema(driver: Driver): Promise<void> {
  // Step 1: meta-schema for the registry itself.
  await applyMetaSchema(driver);

  // Step 2: seed the registry from the compile-time const tuples IF EMPTY.
  // Post-seed emit fires after the tx commits so caches warm from real data.
  if (await isRegistryEmpty(driver)) {
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
    // one side → bounded retry in storage/models.ts), plus the two
    // forkLocalKey lookup indexes backing the §3.4 B-02 instance anchor
    // (equality + STARTS WITH resolutions are index-backed). All
    // IF NOT EXISTS → re-run is a no-op.
    await session.run(
      `CREATE CONSTRAINT business_model_ordinal_unique IF NOT EXISTS
       FOR (m:BusinessModel) REQUIRE m.ordinal IS UNIQUE`,
    );
    await session.run(
      `CREATE INDEX user_journey_fork_local_key IF NOT EXISTS
       FOR (n:UserJourney) ON (n.forkLocalKey)`,
    );
    await session.run(
      `CREATE INDEX activity_fork_local_key IF NOT EXISTS
       FOR (n:Activity) ON (n.forkLocalKey)`,
    );
  } finally {
    await session.close();
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
