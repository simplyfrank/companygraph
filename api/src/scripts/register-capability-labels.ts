// ddd-system-modeling T-02 (design §4.6, DD-01, DD-04, DD-14) —
// registers the Capability layer through the ontology-manager runtime
// registry.
//
// STRICT DD-14 order:
//   1. BoundedContext _OntologyNodeLabel row — exists NOWHERE today
//      (NODE_LABELS has no BoundedContext; seedBoundedContexts MERGEs
//      only DATA nodes). Without it the ASSIGNED_TO_CONTEXT
//      createEdgeType throws type_pair_violation at boot. Registry
//      metadata only — zero context data touched (NFR-04-compatible).
//   2. Capability label (permissive json_schema_doc, DD-03 — the
//      capability shape is the plain node envelope).
//   3. Four createEdgeType calls — NEEDS_CAPABILITY with TWO endpoint
//      pairs (DD-04: one type, Activity→Capability AND
//      UserStory→Capability), SUPPORTED_BY, ASSIGNED_TO_CONTEXT, and
//      CAPABILITY_IN_MODEL (this spec's OWN membership edge, DD-01 —
//      deliberately NOT in model-lifecycle-guard's LIFECYCLE_EDGES and
//      NOT an IN_MODEL endpoint-pair addition).
//
// The compile-time NODE_LABELS / EDGE_ENDPOINTS consts are NEVER
// touched (NFR-01, AC-21) — the registry is the sanctioned extension
// path.
//
// Idempotent: every call swallows the already-registered error BY CODE
// `name_conflict` — never by HTTP 409 alone (other 409s must
// propagate; mirrors register-story-labels.ts).
//
// Invoked (a) from `applySchema` (api/src/neo4j/bootstrap.ts, step 3d)
// AFTER registerModelSchema (BusinessModel row must pre-exist for
// CAPABILITY_IN_MODEL) and AFTER registerStorySchema (UserStory row
// must pre-exist for the second NEEDS_CAPABILITY pair) —
// createEdgeType runs assertEndpointLabelsExist; and (b) standalone
// via `bun run register:capability`.

import type { Driver } from "neo4j-driver";
import { createNodeLabel } from "../ontology/storage/node-labels";
import { createEdgeType } from "../ontology/storage/edge-types";
import { ValidationError } from "../errors";

const ACTOR = "system:ddd-system";

// Exported for the integration tests' fresh-registry recipe (design §9,
// DD-14) and any sibling self-heal helper.
export const CAPABILITY_NODE_LABELS = [
  {
    // DD-14 (B-01 of the rev-2 design review): the BoundedContext
    // registry row must precede the ASSIGNED_TO_CONTEXT edge type.
    name: "BoundedContext",
    description:
      "A DDD bounded context from the bounded-contexts ontology surface. Data nodes are seeded by api/src/ontology/seed.ts (seedBoundedContexts); this row registers the LABEL so capability edges can target it (ddd-system-modeling DD-14).",
    usage_example: "(c:Capability)-[:ASSIGNED_TO_CONTEXT]->(bc:BoundedContext)",
  },
  {
    name: "Capability",
    description:
      "A business capability — a cohesive ability the business must have (e.g. 'Price a product'). Plain node envelope (DD-03); model membership rides CAPABILITY_IN_MODEL, never scopedNodeIds.",
    usage_example: "(a:Activity)-[:NEEDS_CAPABILITY]->(c:Capability)-[:SUPPORTED_BY]->(s:System)",
  },
] as const;

export const CAPABILITY_EDGE_TYPES = [
  {
    // DD-04 — ONE type, TWO endpoint pairs (createEdgeType writes one
    // _OntologyEdgeEndpoint row per pair; graph-core PART_OF already
    // carries 3 pairs).
    name: "NEEDS_CAPABILITY",
    description:
      "The step (Activity) or story (UserStory) needs this Capability. One type, two endpoint pairs (ddd-system-modeling DD-04). Many-to-many (FR-03).",
    usage_example: "(a:Activity)-[:NEEDS_CAPABILITY]->(c:Capability)",
    endpoints: [
      { fromLabel: "Activity", toLabel: "Capability" },
      { fromLabel: "UserStory", toLabel: "Capability" },
    ],
  },
  {
    name: "SUPPORTED_BY",
    description:
      "The Capability is supported by this System (carries the system's systemKind into the augmentation mix). Many-to-many (FR-03).",
    usage_example: "(c:Capability)-[:SUPPORTED_BY]->(s:System)",
    endpoints: [{ fromLabel: "Capability", toLabel: "System" }],
  },
  {
    name: "ASSIGNED_TO_CONTEXT",
    description:
      "The Capability lives in this BoundedContext (at most one per capability, FR-03 — PUT …/context replaces).",
    usage_example: "(c:Capability)-[:ASSIGNED_TO_CONTEXT]->(bc:BoundedContext)",
    endpoints: [{ fromLabel: "Capability", toLabel: "BoundedContext" }],
  },
  {
    // DD-01 — this spec's OWN membership edge; NOT a lifecycle edge
    // (deliberately absent from model-lifecycle-guard's LIFECYCLE_EDGES)
    // and NOT an IN_MODEL endpoint-pair addition.
    name: "CAPABILITY_IN_MODEL",
    description:
      "The capability's authoritative BusinessModel membership (exactly one per capability, written in the create tx — ddd-system-modeling DD-01/DD-02). Independent of PART_OF reachability.",
    usage_example: "(c:Capability)-[:CAPABILITY_IN_MODEL]->(m:BusinessModel)",
    endpoints: [{ fromLabel: "Capability", toLabel: "BusinessModel" }],
  },
] as const;

// `name_conflict` is thrown by the registry as a graph-core
// ValidationError whose code is cast from the ontology enum — compare
// as a string. Matching by CODE, never by HTTP status: other 409s
// (id_conflict, would_invalidate) must propagate.
function isNameConflict(e: unknown): boolean {
  return e instanceof ValidationError && (e.code as string) === "name_conflict";
}

export async function registerCapabilitySchema(driver: Driver): Promise<void> {
  for (const label of CAPABILITY_NODE_LABELS) {
    try {
      await createNodeLabel(
        driver,
        {
          name: label.name,
          description: label.description,
          usage_example: label.usage_example,
          json_schema_doc: {}, // permissive (DD-03 / DD-14)
        },
        ACTOR,
      );
    } catch (e) {
      if (!isNameConflict(e)) throw e; // already registered → idempotent no-op
    }
  }

  for (const edge of CAPABILITY_EDGE_TYPES) {
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

// Standalone: `bun run register:capability`
if (import.meta.main) {
  const { getDriver, closeDriver } = await import("../neo4j/driver");
  try {
    await registerCapabilitySchema(getDriver());
    console.log(
      "register-capability-labels: 2 labels + 4 edge types ensured (idempotent)",
    );
  } finally {
    await closeDriver();
  }
}
