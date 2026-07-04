// story-spec-core T-02 (design §4.6) — registers the story-spec labels
// + edges through the ontology-manager runtime registry.
//
// TWO node labels: UserStory, AcceptanceCriterion. THREE edge types:
// DESCRIBES_ACTIVITY (UserStory → Activity), STORY_FOR_ROLE
// (UserStory → Role), ACCEPTANCE_OF (AcceptanceCriterion → UserStory)
// (design §3.3).
//
// The compile-time NODE_LABELS / EDGE_ENDPOINTS consts are NEVER
// touched (NFR-01, XD-01) — the registry is the sanctioned extension
// path. Registry attribute schemas are permissive (`json_schema_doc:
// {}`) because the queryable story/AC shape is owned by
// api/src/storage/stories.ts as top-level Neo4j properties (DD-03).
//
// Idempotent: every createNodeLabel / createEdgeType call swallows the
// already-registered error BY CODE `name_conflict` — never by HTTP 409
// alone (other 409s such as id_conflict must propagate; design §4.6).
//
// Ordering: nodes BEFORE edges — createEdgeType runs
// assertEndpointLabelsExist, so UserStory/AcceptanceCriterion must be
// registered before the edge step; Activity/Role are core labels
// already registered at boot.
//
// Invoked (a) from `applySchema` (api/src/neo4j/bootstrap.ts, step 3c)
// so a fresh boot has the labels AND the step-4 registry iteration
// creates their per-label id constraints on the same boot, and
// (b) standalone via `bun run register:story`.

import type { Driver } from "neo4j-driver";
import { createNodeLabel } from "../ontology/storage/node-labels";
import { createEdgeType } from "../ontology/storage/edge-types";
import { ValidationError } from "../errors";

const ACTOR = "system:story-spec";

const STORY_NODE_LABELS = [
  {
    name: "UserStory",
    description:
      "A user story describing one model-scoped Activity as a persona narrative ('As a <persona>, I want to <action>, so that <benefit>.'). Domain fields (persona/action/benefit/narrative/derived/sourceActivityId) are top-level Neo4j properties owned by api/src/storage/stories.ts.",
    usage_example: "(s:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity)",
  },
  {
    name: "AcceptanceCriterion",
    description:
      "A structured Given/When/Then acceptance criterion of a UserStory (XD-10). Clause fields (given/when/then/ordinal/derived) are top-level Neo4j properties owned by api/src/storage/stories.ts.",
    usage_example: "(ac:AcceptanceCriterion {ordinal:1})-[:ACCEPTANCE_OF]->(s:UserStory)",
  },
] as const;

const STORY_EDGE_TYPES = [
  {
    name: "DESCRIBES_ACTIVITY",
    description:
      "Links a UserStory to the Activity it describes — the story's model-scoping anchor (a story is in model M iff this target Activity is in scopedNodeIds(M)).",
    usage_example: "(s:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity)",
    endpoints: [{ fromLabel: "UserStory", toLabel: "Activity" }],
  },
  {
    name: "STORY_FOR_ROLE",
    description:
      "Links a UserStory to the executing Role persona (0..1 per story; Role is a global reference node, not model-scoped).",
    usage_example: "(s:UserStory)-[:STORY_FOR_ROLE]->(r:Role)",
    endpoints: [{ fromLabel: "UserStory", toLabel: "Role" }],
  },
  {
    name: "ACCEPTANCE_OF",
    description: "Links an AcceptanceCriterion to its parent UserStory (exactly one per AC).",
    usage_example: "(ac:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(s:UserStory)",
    endpoints: [{ fromLabel: "AcceptanceCriterion", toLabel: "UserStory" }],
  },
] as const;

// `name_conflict` is thrown by the registry as a graph-core
// ValidationError whose code is cast from the ontology enum (see
// api/src/ontology/error-throwers.ts) — compare as a string. Matching
// by CODE, never by HTTP status: other 409s (id_conflict,
// would_invalidate) must propagate (design §4.6).
function isNameConflict(e: unknown): boolean {
  return e instanceof ValidationError && (e.code as string) === "name_conflict";
}

export async function registerStorySchema(driver: Driver): Promise<void> {
  for (const label of STORY_NODE_LABELS) {
    try {
      await createNodeLabel(
        driver,
        {
          name: label.name,
          description: label.description,
          usage_example: label.usage_example,
          json_schema_doc: {}, // permissive — story/AC shape lives in storage/stories.ts (DD-03)
        },
        ACTOR,
      );
    } catch (e) {
      if (!isNameConflict(e)) throw e; // already registered → idempotent no-op
    }
  }

  for (const edge of STORY_EDGE_TYPES) {
    try {
      await createEdgeType(
        driver,
        {
          name: edge.name,
          description: edge.description,
          usage_example: edge.usage_example,
          endpoints: [...edge.endpoints],
        },
        ACTOR,
      );
    } catch (e) {
      if (!isNameConflict(e)) throw e;
    }
  }
}

// Standalone: `bun run register:story`
if (import.meta.main) {
  const { getDriver, closeDriver } = await import("../neo4j/driver");
  try {
    await registerStorySchema(getDriver());
    console.log("register-story-labels: 2 labels + 3 edge types ensured (idempotent)");
  } finally {
    await closeDriver();
  }
}
