// model-workspace-core T-03 (design §4.1) — registers the model-workspace
// lifecycle labels + edges through the ontology-manager runtime registry.
//
// FOUR node labels (authoritative enumeration per design-review N-10 —
// earlier "five" counts were wrong): BusinessModel, BusinessModule,
// BusinessModuleVersion, ModuleInstance. FIVE edge types: IN_MODEL,
// HAS_VERSION, INSTANTIATES, INSTANCE_IN, FORKED_FROM (§3.5).
//
// The compile-time NODE_LABELS / EDGE_ENDPOINTS consts are NEVER touched
// (NFR-01, XD-01/XD-02) — the registry is the sanctioned extension path.
// Registry attribute schemas are permissive (`json_schema_doc: {}`)
// because the queryable lifecycle shape is owned by the dedicated
// storage modules as top-level Neo4j properties (design rule 2).
//
// Idempotent: every createNodeLabel / createEdgeType call swallows
// `409 name_conflict` (already registered) so re-runs are no-ops.
//
// Invoked (a) from `applySchema` (api/src/neo4j/bootstrap.ts) so a fresh
// boot has the labels, and (b) standalone via `bun run register:model`.

import type { Driver } from "neo4j-driver";
import { createNodeLabel } from "../ontology/storage/node-labels";
import { createEdgeType } from "../ontology/storage/edge-types";
import { ValidationError } from "../errors";

const ACTOR = "model-workspace-core";

const MODEL_NODE_LABELS = [
  {
    name: "BusinessModel",
    description:
      "Root node of one business model workspace. A model's process structure (Domain → PART_OF → UserJourney → Activity) hangs off it through IN_MODEL edges on its Domain roots. Lifecycle props (ordinal/status/isReference) are top-level Neo4j properties owned by api/src/storage/models.ts.",
    usage_example: "(d:Domain)-[:IN_MODEL]->(m:BusinessModel {name:'Retail Reference'})",
  },
  {
    name: "BusinessModule",
    description:
      "Catalog entry for a reusable journey-level business module, authored around a source UserJourney in a source model. Versions are published as immutable BusinessModuleVersion snapshots via HAS_VERSION.",
    usage_example: "(mod:BusinessModule {name:'Checkout'})-[:HAS_VERSION]->(:BusinessModuleVersion)",
  },
  {
    name: "BusinessModuleVersion",
    description:
      "Immutable published snapshot of a module's journey subtree (snapshot_json blob + sha-256 checksum + monotonic version int). Never mutated in place; generic writes are rejected 409 model_lifecycle_route_required.",
    usage_example: "(mod:BusinessModule)-[:HAS_VERSION]->(v:BusinessModuleVersion {version:1})",
  },
  {
    name: "ModuleInstance",
    description:
      "Per-model pin of a BusinessModuleVersion (INSTANTIATES) inside a BusinessModel (INSTANCE_IN). Copy-on-writes a local journey subtree into the model on first edit (forked=true + FORKED_FROM).",
    usage_example: "(mi:ModuleInstance {forked:false})-[:INSTANTIATES]->(:BusinessModuleVersion)",
  },
] as const;

const MODEL_EDGE_TYPES = [
  {
    name: "IN_MODEL",
    description:
      "Scopes a Domain root (and thereby its PART_OF descendants) under a BusinessModel — the scoping root of a model's subgraph.",
    usage_example: "(d:Domain)-[:IN_MODEL]->(m:BusinessModel)",
    endpoints: [{ fromLabel: "Domain", toLabel: "BusinessModel" }],
  },
  {
    name: "HAS_VERSION",
    description: "Links a BusinessModule catalog entry to one of its published immutable versions.",
    usage_example: "(mod:BusinessModule)-[:HAS_VERSION]->(v:BusinessModuleVersion)",
    endpoints: [{ fromLabel: "BusinessModule", toLabel: "BusinessModuleVersion" }],
  },
  {
    name: "INSTANTIATES",
    description: "The pin: a ModuleInstance references the BusinessModuleVersion whose content it observes.",
    usage_example: "(mi:ModuleInstance)-[:INSTANTIATES]->(v:BusinessModuleVersion)",
    endpoints: [{ fromLabel: "ModuleInstance", toLabel: "BusinessModuleVersion" }],
  },
  {
    name: "INSTANCE_IN",
    description: "Links a ModuleInstance to the BusinessModel it lives in.",
    usage_example: "(mi:ModuleInstance)-[:INSTANCE_IN]->(m:BusinessModel)",
    endpoints: [{ fromLabel: "ModuleInstance", toLabel: "BusinessModel" }],
  },
  {
    name: "FORKED_FROM",
    description:
      "Set when a ModuleInstance copy-on-writes: records the source BusinessModuleVersion the materialized local subtree was forked from.",
    usage_example: "(mi:ModuleInstance {forked:true})-[:FORKED_FROM]->(v:BusinessModuleVersion)",
    endpoints: [{ fromLabel: "ModuleInstance", toLabel: "BusinessModuleVersion" }],
  },
] as const;

// `name_conflict` is thrown by the registry as a graph-core
// ValidationError whose code is cast from the ontology enum (see
// api/src/ontology/error-throwers.ts) — compare as a string.
function isNameConflict(e: unknown): boolean {
  return e instanceof ValidationError && (e.code as string) === "name_conflict";
}

export async function registerModelSchema(driver: Driver): Promise<void> {
  for (const label of MODEL_NODE_LABELS) {
    try {
      await createNodeLabel(
        driver,
        {
          name: label.name,
          description: label.description,
          usage_example: label.usage_example,
          json_schema_doc: {}, // permissive — lifecycle shape lives in storage modules
        },
        ACTOR,
      );
    } catch (e) {
      if (!isNameConflict(e)) throw e; // already registered → idempotent no-op
    }
  }

  for (const edge of MODEL_EDGE_TYPES) {
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

// Standalone: `bun run register:model`
if (import.meta.main) {
  const { getDriver, closeDriver } = await import("../neo4j/driver");
  try {
    await registerModelSchema(getDriver());
    console.log("register-model-labels: 4 labels + 5 edge types ensured (idempotent)");
  } finally {
    await closeDriver();
  }
}
