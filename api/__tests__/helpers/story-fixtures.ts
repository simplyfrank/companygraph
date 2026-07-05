// story-spec-core — shared self-heal helper for the story integration
// test files.
//
// Why this exists: the integration suite runs 100+ files against ONE
// shared Neo4j + API server, and sibling ontology tests legitimately
// wipe the `_Ontology*` meta-namespace and re-seed only the
// compile-time const tuples (ontology-seed afterAll,
// ontology-bootstrap-reconcile). That drops the runtime-registered
// story rows (UserStory / AcceptanceCriterion / DESCRIBES_ACTIVITY /
// STORY_FOR_ROLE / ACCEPTANCE_OF), and — unlike model-workspace-core,
// whose lifecycle edges ride bespoke Cypher — every story edge goes
// through the registry-validated `createEdge` primitive (DD-10), so a
// wiped registry turns story writes into 400s.
//
// `ensureStorySchema()` re-registers the story schema THROUGH THE API
// (not the direct driver) so a successful re-create also emits
// `ontology.changed` in the SERVER process and clears its
// edge-endpoints/schema caches. When everything already exists (all
// 409 name_conflict — no event emitted), a no-op PATCH on one story
// edge type forces the cache clear anyway, covering the stale-empty
// cache window (LRU TTL 60 s) left by a wipe-then-direct-driver-restore
// sequence.

import {
  STORY_NODE_LABELS,
  STORY_EDGE_TYPES,
} from "../../src/scripts/register-story-labels";
import { registerModelSchema } from "../../src/scripts/register-model-labels";
import { getDriver } from "../../src/neo4j/driver";
import { API_BASE } from "./model-fixtures";

async function post(path: string, body: unknown): Promise<number> {
  const res = await fetch(`${API_BASE}${path}?actor=story-spec-test-heal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  await res.text(); // drain
  return res.status;
}

export async function ensureStorySchema(): Promise<void> {
  // Heal the WHOLE runtime registry, not just the story rows: the
  // cache-refresh PATCH below forces the server to re-read the
  // registry, and a fresh read taken while the (equally wiped)
  // model-workspace rows were still missing would strand
  // model-labels.integration.test.ts's GET /schema assertion inside
  // the schema-cache TTL. registerModelSchema is idempotent
  // (name_conflict swallowed) — consumed, never re-implemented.
  await registerModelSchema(getDriver());

  let createdAny = false;

  for (const label of STORY_NODE_LABELS) {
    const status = await post("/ontology/node-labels", {
      name: label.name,
      description: label.description,
      usage_example: label.usage_example,
      json_schema_doc: {},
    });
    if (status === 201) createdAny = true;
    else if (status !== 409) throw new Error(`ensureStorySchema: label ${label.name} → ${status}`);
  }

  for (const edge of STORY_EDGE_TYPES) {
    const status = await post("/ontology/edge-types", {
      name: edge.name,
      description: edge.description,
      usage_example: edge.usage_example,
      endpoints: [...edge.endpoints],
    });
    if (status === 201) createdAny = true;
    else if (status !== 409) throw new Error(`ensureStorySchema: edge ${edge.name} → ${status}`);
  }

  if (!createdAny) {
    // Everything already registered → no ontology.changed was emitted →
    // the server's caches may still hold stale-empty endpoint lists.
    // A no-op PATCH (same description) emits the event and clears them.
    const edge = STORY_EDGE_TYPES[0]!;
    const res = await fetch(
      `${API_BASE}/ontology/edge-types/${edge.name}?actor=story-spec-test-heal`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: edge.description }),
      },
    );
    await res.text();
    if (!res.ok) throw new Error(`ensureStorySchema: cache-refresh PATCH → ${res.status}`);
  }
}
