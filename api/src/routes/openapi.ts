import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// One-time extension of the zod prototype with .openapi() so registry
// registration can attach $refIds to schemas. Safe to call multiple times.
extendZodWithOpenApi(z);
import {
  nodeCreateSchema,
  nodeUpdateSchema,
  nodeReadSchema,
  NODE_LABELS,
} from "@companygraph/shared/schema/nodes";
import {
  edgeCreateSchema,
  edgeReadSchema,
  EDGE_TYPES,
} from "@companygraph/shared/schema/edges";
import {
  importPayloadSchema,
  importResponseSchema,
} from "@companygraph/shared/types";
import {
  nodeLabelCreateSchema,
  nodeLabelPatchSchema,
  nodeLabelReadSchema,
  edgeTypeCreateSchema,
  edgeTypePatchSchema,
  edgeTypeReadSchema,
  schemaResponseSchema,
  ontologyImportSchema,
  ontologyImportResponseSchema,
  glossaryCollectionSchema,
  glossaryCollectionPatchSchema,
  glossaryCollectionReadSchema,
  glossaryTermSchema,
  glossaryTermPatchSchema,
  glossaryTermReadSchema,
  ontologyProposalSchema,
  ontologyProposalPatchSchema,
  ontologyProposalReadSchema,
  complianceRuleSchema,
  complianceRulePatchSchema,
  complianceRuleReadSchema,
} from "@companygraph/shared/schema/ontology";
import {
  modelCreateSchema,
  modelPatchSchema,
  modelReadSchema,
  domainAttachSchema,
  moduleCreateSchema,
  moduleReadSchema,
  versionPublishSchema,
  versionReadSchema,
  instanceCreateSchema,
  instanceUpgradeSchema,
  instanceReadSchema,
  instanceEdgeSchema,
} from "@companygraph/shared/schema/model-workspace";
import {
  storyCreateSchema,
  storyPatchSchema,
  storyReadSchema,
  acCreateSchema,
  acPatchSchema,
  acReadSchema,
  bootstrapRequestSchema,
  bootstrapResultSchema,
} from "@companygraph/shared/schema/story-spec";
import { ERROR_CODES } from "../errors";
import { registerKpiOkrPaths } from "./openapi-kpi-okr";

// Static Route[] declared right here (design-review B-02 — OpenAPI
// generator owns its own route table, no inter-task module dependency).
// Exported for openapi-kpi-okr.ts (kpi-okr-governance pinned C-01) — one
// envelope definition in one OpenAPI doc, no duplicate-schema drift.
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

const healthSchema = z.object({
  ok: z.boolean(),
  neo4j: z.object({
    connected: z.boolean(),
    version: z.string().optional(),
  }),
});

const statsSchema = z.object({
  nodes: z.record(z.enum(NODE_LABELS), z.number()),
  edges: z.record(z.enum(EDGE_TYPES), z.number()),
});

// Generated per-request — cheap (ms-scale) and lets `bun --hot`
// surface route-registry edits without a process restart. If
// generation cost ever becomes hot-path-relevant the cache can return,
// but until then "always fresh" wins.
export function getOpenApiDoc(): object {
  const registry = new OpenAPIRegistry();
  registry.register("NodeCreate", nodeCreateSchema);
  registry.register("NodeUpdate", nodeUpdateSchema);
  registry.register("Node", nodeReadSchema);
  registry.register("EdgeCreate", edgeCreateSchema);
  registry.register("Edge", edgeReadSchema);
  registry.register("ImportPayload", importPayloadSchema);
  registry.register("ImportResponse", importResponseSchema);
  registry.register("ErrorEnvelope", errorEnvelopeSchema);
  registry.register("Health", healthSchema);
  registry.register("Stats", statsSchema);

  // Ontology schemas
  registry.register("NodeLabelCreate", nodeLabelCreateSchema);
  registry.register("NodeLabelPatch", nodeLabelPatchSchema);
  registry.register("NodeLabel", nodeLabelReadSchema);
  registry.register("EdgeTypeCreate", edgeTypeCreateSchema);
  registry.register("EdgeTypePatch", edgeTypePatchSchema);
  registry.register("EdgeType", edgeTypeReadSchema);
  registry.register("SchemaResponse", schemaResponseSchema);
  registry.register("OntologyImportPayload", ontologyImportSchema);
  registry.register("OntologyImportResponse", ontologyImportResponseSchema);
  registry.register("GlossaryCollectionCreate", glossaryCollectionSchema);
  registry.register("GlossaryCollectionPatch", glossaryCollectionPatchSchema);
  registry.register("GlossaryCollection", glossaryCollectionReadSchema);
  registry.register("GlossaryTermCreate", glossaryTermSchema);
  registry.register("GlossaryTermPatch", glossaryTermPatchSchema);
  registry.register("GlossaryTerm", glossaryTermReadSchema);
  registry.register("OntologyProposalCreate", ontologyProposalSchema);
  registry.register("OntologyProposalPatch", ontologyProposalPatchSchema);
  registry.register("OntologyProposal", ontologyProposalReadSchema);
  registry.register("ComplianceRuleCreate", complianceRuleSchema);
  registry.register("ComplianceRulePatch", complianceRulePatchSchema);
  registry.register("ComplianceRule", complianceRuleReadSchema);

  registry.registerPath({
    method: "get", path: "/api/v1/healthz",
    description: "Server + Neo4j liveness probe (FR-11).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: healthSchema } } },
      503: { description: "neo4j unreachable", content: { "application/json": { schema: healthSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/stats",
    description: "Node + edge counts by registry key (FR-11). All keys present even when value is 0.",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: statsSchema } } },
    },
  });
  for (const method of ["post", "get", "patch", "delete"] as const) {
    registry.registerPath({
      method, path: `/api/v1/nodes/{label}${method === "post" ? "" : "/{id}"}`,
      description: `Node ${method.toUpperCase()} (FR-06).`,
      responses: {
        200: { description: "ok", content: { "application/json": { schema: nodeReadSchema } } },
        ...(method === "post" ? { 201: { description: "created", content: { "application/json": { schema: nodeReadSchema } } } } : {}),
        ...(method === "delete" ? { 204: { description: "deleted" } } : {}),
        400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
        404: { description: "not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
        409: { description: "conflict", content: { "application/json": { schema: errorEnvelopeSchema } } },
      },
    });
  }
  for (const method of ["post", "delete"] as const) {
    registry.registerPath({
      method, path: `/api/v1/edges${method === "delete" ? "/{id}" : ""}`,
      description: `Edge ${method.toUpperCase()} (FR-06).`,
      responses: {
        ...(method === "post" ? { 201: { description: "created", content: { "application/json": { schema: edgeReadSchema } } } } : {}),
        ...(method === "delete" ? { 204: { description: "deleted" } } : {}),
        400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
        404: { description: "not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
        409: { description: "conflict", content: { "application/json": { schema: errorEnvelopeSchema } } },
      },
    });
  }
  registry.registerPath({
    method: "post", path: "/api/v1/import",
    description: "Bulk import (FR-06). ?dryRun=true wraps in a rollback tx (FR-20).",
    request: { body: { content: { "application/json": { schema: importPayloadSchema } } } },
    responses: {
      200: { description: "imported (partial successes carry errors[])", content: { "application/json": { schema: importResponseSchema } } },
      400: { description: "envelope-level validation failure", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/export",
    description: "Bulk JSON export ordered by id ASC (FR-17).",
    responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ nodes: z.array(nodeReadSchema), edges: z.array(edgeReadSchema) }) } } } },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/export.ndjson",
    description: "Streaming NDJSON export (FR-18).",
    responses: { 200: { description: "ok", content: { "application/x-ndjson": { schema: z.string() } } } },
  });
  // Typed query helpers (FR-07). All return a `{rows: T[]}` envelope.
  // The exact row shape varies per helper but is permissive at the
  // OpenAPI layer because the runtime shape is computed by the Cypher
  // helper, not by zod (the helper's response is built from the driver
  // Record). Test packs verify the actual response shapes (AC-09);
  // OpenAPI just guarantees the envelope shape is present.
  const queryRowsEnvelope = z.object({ rows: z.array(z.record(z.unknown())) });
  registry.registerPath({
    method: "get", path: "/api/v1/query/listDomains",
    description: "List all domains (FR-07).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: queryRowsEnvelope } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/query/getDomain/{id}",
    description: "Domain + member journeys (FR-07).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: queryRowsEnvelope } } },
      404: { description: "not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/query/getJourney/{id}",
    description: "Journey + ordered activities + bound roles, systems, locations (FR-07).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: queryRowsEnvelope } } },
      404: { description: "not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/query/getActivity/{id}",
    description: "Single activity by id (FR-07).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: queryRowsEnvelope } } },
      404: { description: "not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/query/findPath",
    description: "Shortest path between two node ids; ?maxDepth (1..8) (FR-07 / NFR-09). Returns zero or one row.",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: queryRowsEnvelope } } },
      400: { description: "depth_exceeded | invalid_payload | query_timeout", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/query/neighbors/{id}",
    description: "Variable-length neighbour expansion within ?depth (FR-07 / NFR-09).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: queryRowsEnvelope } } },
      400: { description: "depth_exceeded | result_truncated", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/query/cypher",
    description: "Read-only Cypher passthrough (FR-07 / NFR-06). Per-tx 5s timeout; row cap 1000.",
    request: { body: { content: { "application/json": { schema: z.object({ statement: z.string(), params: z.record(z.unknown()).optional() }) } } } },
    responses: {
      200: { description: "ok", content: { "application/json": { schema: queryRowsEnvelope } } },
      400: { description: "write_statement_rejected | parse_error | result_truncated | query_timeout", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  // Substring search helper — added by T-31 (post-completion amendment
  // from process-explorer-ui). Backed by per-label fulltext indexes
  // created in api/src/neo4j/bootstrap.ts.
  const searchRowSchema = z.object({
    rows: z.array(z.object({
      id: z.string(),
      name: z.string(),
      label: z.enum(NODE_LABELS),
    })),
  });
  registry.registerPath({
    method: "get", path: "/api/v1/query/search",
    description: "Substring search across node names. Backed by per-label fulltext indexes. Params: label (NodeLabel), q (1..200 chars), limit (1..100, default 20). (T-31 amendment from process-explorer-ui/FR-17.)",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: searchRowSchema } } },
      400: { description: "invalid_payload | unknown_label | query_timeout", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  // Ontology routes
  registry.registerPath({
    method: "get", path: "/api/v1/schema",
    description: "GET cached ontology schema (node labels + edge types).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: schemaResponseSchema } } },
    },
  });
  for (const method of ["post", "get"] as const) {
    registry.registerPath({
      method, path: "/api/v1/ontology/node-labels",
      description: `Ontology node-labels ${method.toUpperCase()}.`,
      ...(method === "post" ? { request: { body: { content: { "application/json": { schema: nodeLabelCreateSchema } } } } } : {}),
      responses: {
        200: { description: "ok", content: { "application/json": { schema: method === "get" ? z.array(nodeLabelReadSchema) : nodeLabelReadSchema } } },
        ...(method === "post" ? { 201: { description: "created", content: { "application/json": { schema: nodeLabelReadSchema } } } } : {}),
        400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
        409: { description: "conflict", content: { "application/json": { schema: errorEnvelopeSchema } } },
      },
    });
  }
  for (const method of ["get", "patch", "delete"] as const) {
    registry.registerPath({
      method, path: "/api/v1/ontology/node-labels/{name}",
      description: `Ontology node-label ${method.toUpperCase()}.`,
      ...(method === "patch" ? { request: { body: { content: { "application/json": { schema: nodeLabelPatchSchema } } } } } : {}),
      responses: {
        200: { description: "ok", content: { "application/json": { schema: nodeLabelReadSchema } } },
        ...(method === "delete" ? { 204: { description: "deleted" } } : {}),
        400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
        404: { description: "not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
        409: { description: "conflict", content: { "application/json": { schema: errorEnvelopeSchema } } },
      },
    });
  }
  for (const method of ["post", "get"] as const) {
    registry.registerPath({
      method, path: "/api/v1/ontology/edge-types",
      description: `Ontology edge-types ${method.toUpperCase()}.`,
      ...(method === "post" ? { request: { body: { content: { "application/json": { schema: edgeTypeCreateSchema } } } } } : {}),
      responses: {
        200: { description: "ok", content: { "application/json": { schema: method === "get" ? z.array(edgeTypeReadSchema) : edgeTypeReadSchema } } },
        ...(method === "post" ? { 201: { description: "created", content: { "application/json": { schema: edgeTypeReadSchema } } } } : {}),
        400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
        409: { description: "conflict", content: { "application/json": { schema: errorEnvelopeSchema } } },
      },
    });
  }
  for (const method of ["get", "patch", "delete"] as const) {
    registry.registerPath({
      method, path: "/api/v1/ontology/edge-types/{name}",
      description: `Ontology edge-type ${method.toUpperCase()}.`,
      ...(method === "patch" ? { request: { body: { content: { "application/json": { schema: edgeTypePatchSchema } } } } } : {}),
      responses: {
        200: { description: "ok", content: { "application/json": { schema: edgeTypeReadSchema } } },
        ...(method === "delete" ? { 204: { description: "deleted" } } : {}),
        400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
        404: { description: "not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
        409: { description: "conflict", content: { "application/json": { schema: errorEnvelopeSchema } } },
      },
    });
  }
  registry.registerPath({
    method: "post", path: "/api/v1/ontology/import",
    description: "Bulk ontology import (JSON payload).",
    request: { body: { content: { "application/json": { schema: ontologyImportSchema } } } },
    responses: {
      200: { description: "imported", content: { "application/json": { schema: ontologyImportResponseSchema } } },
      400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/ontology/export",
    description: "Ontology export (JSON/YAML).",
    responses: { 200: { description: "ok" } },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/ontology/events",
    description: "SSE stream of ontology change events.",
    responses: { 200: { description: "event stream" } },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/ontology/migrations",
    description: "Execute an ontology migration.",
    responses: {
      200: { description: "ok" },
      400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/ontology/rollback/{version_id}",
    description: "Rollback ontology to a previous version.",
    responses: {
      200: { description: "ok" },
      400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
      409: { description: "conflict", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/ontology/bounded-contexts",
    description: "List all bounded contexts with entities and relationships.",
    responses: { 200: { description: "ok", content: { "application/json": { schema: z.array(z.record(z.unknown())) } } } },
  });

  // Glossary routes
  for (const method of ["post", "get"] as const) {
    registry.registerPath({
      method, path: "/api/v1/glossary/collections",
      description: `Glossary collections ${method.toUpperCase()}.`,
      ...(method === "post" ? { request: { body: { content: { "application/json": { schema: glossaryCollectionSchema } } } } } : {}),
      responses: {
        200: { description: "ok", content: { "application/json": { schema: method === "get" ? z.array(glossaryCollectionReadSchema) : glossaryCollectionReadSchema } } },
        400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
      },
    });
  }
  for (const method of ["get", "patch", "delete"] as const) {
    registry.registerPath({
      method, path: "/api/v1/glossary/collections/{iri}",
      description: `Glossary collection ${method.toUpperCase()}.`,
      ...(method === "patch" ? { request: { body: { content: { "application/json": { schema: glossaryCollectionPatchSchema } } } } } : {}),
      responses: {
        200: { description: "ok", content: { "application/json": { schema: glossaryCollectionReadSchema } } },
        ...(method === "delete" ? { 204: { description: "deleted" } } : {}),
        400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
        404: { description: "not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
      },
    });
  }
  for (const method of ["post", "get"] as const) {
    registry.registerPath({
      method, path: "/api/v1/glossary/terms",
      description: `Glossary terms ${method.toUpperCase()}.`,
      ...(method === "post" ? { request: { body: { content: { "application/json": { schema: glossaryTermSchema } } } } } : {}),
      responses: {
        200: { description: "ok", content: { "application/json": { schema: method === "get" ? z.array(glossaryTermReadSchema) : glossaryTermReadSchema } } },
        400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
      },
    });
  }
  for (const method of ["get", "patch", "delete"] as const) {
    registry.registerPath({
      method, path: "/api/v1/glossary/terms/{id}",
      description: `Glossary term ${method.toUpperCase()}.`,
      ...(method === "patch" ? { request: { body: { content: { "application/json": { schema: glossaryTermPatchSchema } } } } } : {}),
      responses: {
        200: { description: "ok", content: { "application/json": { schema: glossaryTermReadSchema } } },
        ...(method === "delete" ? { 204: { description: "deleted" } } : {}),
        400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
        404: { description: "not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
      },
    });
  }

  // Ontology proposals
  for (const method of ["post", "get"] as const) {
    registry.registerPath({
      method, path: "/api/v1/ontology/proposals",
      description: `Ontology proposals ${method.toUpperCase()}.`,
      ...(method === "post" ? { request: { body: { content: { "application/json": { schema: ontologyProposalSchema } } } } } : {}),
      responses: {
        200: { description: "ok", content: { "application/json": { schema: method === "get" ? z.array(ontologyProposalReadSchema) : ontologyProposalReadSchema } } },
        400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
      },
    });
  }
  for (const method of ["get", "patch", "delete"] as const) {
    registry.registerPath({
      method, path: "/api/v1/ontology/proposals/{id}",
      description: `Ontology proposal ${method.toUpperCase()}.`,
      ...(method === "patch" ? { request: { body: { content: { "application/json": { schema: ontologyProposalPatchSchema } } } } } : {}),
      responses: {
        200: { description: "ok", content: { "application/json": { schema: ontologyProposalReadSchema } } },
        ...(method === "delete" ? { 204: { description: "deleted" } } : {}),
        400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
        404: { description: "not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
      },
    });
  }

  // Compliance rules
  for (const method of ["post", "get"] as const) {
    registry.registerPath({
      method, path: "/api/v1/compliance/rules",
      description: `Compliance rules ${method.toUpperCase()}.`,
      ...(method === "post" ? { request: { body: { content: { "application/json": { schema: complianceRuleSchema } } } } } : {}),
      responses: {
        200: { description: "ok", content: { "application/json": { schema: method === "get" ? z.array(complianceRuleReadSchema) : complianceRuleReadSchema } } },
        400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
      },
    });
  }
  for (const method of ["get", "patch", "delete"] as const) {
    registry.registerPath({
      method, path: "/api/v1/compliance/rules/{id}",
      description: `Compliance rule ${method.toUpperCase()}.`,
      ...(method === "patch" ? { request: { body: { content: { "application/json": { schema: complianceRulePatchSchema } } } } } : {}),
      responses: {
        200: { description: "ok", content: { "application/json": { schema: complianceRuleReadSchema } } },
        ...(method === "delete" ? { 204: { description: "deleted" } } : {}),
        400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
        404: { description: "not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
      },
    });
  }
  registry.registerPath({
    method: "post", path: "/api/v1/compliance/rules/evaluate",
    description: "Evaluate a compliance rule.",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: z.record(z.unknown()) } } },
      400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
      404: { description: "not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });

  // RDF routes
  registry.registerPath({
    method: "post", path: "/api/v1/ontology/rdf/import",
    description: "Import ontology from RDF (JSON-LD, Turtle, N-Triples).",
    responses: {
      200: { description: "imported", content: { "application/json": { schema: z.record(z.unknown()) } } },
      400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/ontology/rdf/export",
    description: "Export ontology to RDF (JSON-LD, Turtle, N-Triples).",
    responses: {
      200: { description: "exported" },
      400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });

  // Query route
  registry.registerPath({
    method: "post", path: "/api/v1/ontology/query",
    description: "Execute Cypher or SPARQL query against the ontology graph.",
    request: { body: { content: { "application/json": { schema: z.object({ query: z.string(), params: z.record(z.unknown()).optional(), write: z.boolean().optional(), type: z.enum(["cypher", "sparql"]).optional() }) } } } },
    responses: {
      200: { description: "ok", content: { "application/json": { schema: z.record(z.unknown()) } } },
      400: { description: "invalid_payload | write_statement_rejected", content: { "application/json": { schema: errorEnvelopeSchema } } },
      501: { description: "not_implemented (SPARQL)", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });

  // ── model-workspace-core T-14 (design §5, FR-13) ─────────────────────
  // Generated from the SAME shared zod definitions the handlers parse
  // with (no hand-maintained copy).
  registry.register("ModelCreate", modelCreateSchema);
  registry.register("ModelPatch", modelPatchSchema);
  registry.register("Model", modelReadSchema);
  registry.register("DomainAttach", domainAttachSchema);
  registry.register("ModuleCreate", moduleCreateSchema);
  registry.register("Module", moduleReadSchema);
  registry.register("VersionPublish", versionPublishSchema);
  registry.register("ModuleVersion", versionReadSchema);
  registry.register("InstanceCreate", instanceCreateSchema);
  registry.register("InstanceUpgrade", instanceUpgradeSchema);
  registry.register("ModuleInstance", instanceReadSchema);
  registry.register("InstanceEdge", instanceEdgeSchema);

  const err = (description: string) => ({
    description,
    content: { "application/json": { schema: errorEnvelopeSchema } },
  });

  registry.registerPath({
    method: "post", path: "/api/v1/models",
    description: "Create a business model (FR-05). Server assigns UUIDv7 id + unique ordinal (max+1).",
    request: { body: { content: { "application/json": { schema: modelCreateSchema } } } },
    responses: {
      201: { description: "created", content: { "application/json": { schema: modelReadSchema } } },
      400: err("validation error"),
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/models",
    description: "List business models ordered by ordinal ASC with moduleInstanceCount (FR-05). Global catalog — no ?model= param (D-1).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: z.array(modelReadSchema) } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/models/{id}",
    description: "Get one business model (FR-05).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: modelReadSchema } } },
      404: err("model_not_found"),
    },
  });
  registry.registerPath({
    method: "patch", path: "/api/v1/models/{id}",
    description: "Patch a business model — omitted fields kept (FR-05).",
    request: { body: { content: { "application/json": { schema: modelPatchSchema } } } },
    responses: {
      200: { description: "ok", content: { "application/json": { schema: modelReadSchema } } },
      400: err("validation error"),
      404: err("model_not_found"),
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/models/{id}/archive",
    description: "Archive a business model — non-destructive, subgraph retained (FR-05).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: modelReadSchema } } },
      404: err("model_not_found"),
    },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/models/{id}",
    description: "Delete a non-reference model + cascade its scoped subgraph; catalog modules/versions survive (FR-05).",
    responses: {
      204: { description: "deleted" },
      404: err("model_not_found"),
      409: err("model_reference_immutable"),
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/models/{id}/domains",
    description: "Create a Domain + its IN_MODEL edge in one tx — the minimal sanctioned path that populates a user-created model (design §4.3, B-02).",
    request: { body: { content: { "application/json": { schema: domainAttachSchema } } } },
    responses: {
      201: { description: "created", content: { "application/json": { schema: nodeReadSchema } } },
      400: err("validation error"),
      404: err("model_not_found"),
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/models/{modelId}/module-instances",
    description: "Instantiate a module version into a model (FR-07). Body requires targetDomainId (D-2) — a Domain linked IN_MODEL to the model.",
    request: { body: { content: { "application/json": { schema: instanceCreateSchema } } } },
    responses: {
      201: { description: "created", content: { "application/json": { schema: instanceReadSchema } } },
      400: err("invalid_payload (bad/foreign targetDomainId)"),
      404: err("model_not_found | module_not_found | module_version_not_found"),
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/models/{modelId}/module-instances",
    description: "List a model's module instances with pinned version, forked flag and resolved content (FR-07). Scoped by the :modelId path param — never a ?model= query param (D-1/AC-21).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: z.array(instanceReadSchema) } } },
      404: err("model_not_found"),
    },
  });
  registry.registerPath({
    method: "patch", path: "/api/v1/models/{modelId}/module-instances/{instanceId}/nodes/{nodeId}",
    description: "Model-scoped instance node write — THE fork trigger for nodes (FR-08). :nodeId accepts a live UUIDv7 or a synthetic <instanceId>::<key> handle sent VERBATIM (never URL-mangle the ::, design N-06). First edit on a non-forked instance forks it into the model.",
    request: { body: { content: { "application/json": { schema: nodeUpdateSchema } } } },
    responses: {
      200: { description: "ok", content: { "application/json": { schema: nodeReadSchema } } },
      400: err("validation error"),
      404: err("module_instance_node_not_member"),
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/models/{modelId}/module-instances/{instanceId}/edges",
    description: "Add an instance edge addressed by (type, from, to) — the fork trigger for edges (FR-08, B-03). Idempotent MERGE: 201 created, 200 already present.",
    request: { body: { content: { "application/json": { schema: instanceEdgeSchema } } } },
    responses: {
      200: { description: "already present (idempotent MERGE)" },
      201: { description: "created" },
      400: err("invalid_payload | edge_endpoint_label_mismatch"),
      404: err("module_instance_node_not_member | not_found"),
    },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/models/{modelId}/module-instances/{instanceId}/edges",
    description: "Remove an instance edge addressed by (type, from, to) (FR-08, B-03). Carries a JSON body (design N-11 — acceptable on this loopback stack).",
    request: { body: { content: { "application/json": { schema: instanceEdgeSchema } } } },
    responses: {
      204: { description: "deleted" },
      400: err("invalid_payload | edge_endpoint_label_mismatch"),
      404: err("not_found | module_instance_node_not_member"),
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/models/{modelId}/module-instances/{instanceId}/fork",
    description: "Explicitly fork an instance — idempotent; already-forked is a no-op 200 (FR-08).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: instanceReadSchema } } },
      404: err("not_found"),
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/models/{modelId}/module-instances/{instanceId}/upgrade",
    description: "Re-pin an instance to another published version (FR-09). Forked → 409 module_instance_forked; downgrade needs allowDowngrade. Synthetic handles are pinned-version-relative — re-read after upgrade (N-09).",
    request: { body: { content: { "application/json": { schema: instanceUpgradeSchema } } } },
    responses: {
      200: { description: "ok", content: { "application/json": { schema: instanceReadSchema } } },
      400: err("module_downgrade_not_allowed"),
      404: err("module_version_not_found"),
      409: err("module_instance_forked"),
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/modules",
    description: "Register a BusinessModule around a source journey subtree (FR-06).",
    request: { body: { content: { "application/json": { schema: moduleCreateSchema } } } },
    responses: {
      201: { description: "created", content: { "application/json": { schema: moduleReadSchema } } },
      400: err("validation error"),
      404: err("model_not_found | not_found"),
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/modules",
    description: "List the module catalog (FR-06).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: z.array(moduleReadSchema) } } },
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/modules/{id}/versions",
    description: "Publish an immutable module version (FR-06). Optional {version?} explicit-version mode (D-3); collision → 409 module_version_immutable (the single reachable site, D-4).",
    request: { body: { content: { "application/json": { schema: versionPublishSchema } } } },
    responses: {
      201: { description: "created", content: { "application/json": { schema: versionReadSchema } } },
      404: err("module_not_found"),
      409: err("module_version_immutable"),
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/modules/{id}/versions",
    description: "List a module's published versions, version DESC (FR-06).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: z.array(versionReadSchema) } } },
      404: err("module_not_found"),
    },
  });

  // ── story-spec-core T-12 (design §4.9, FR-10) — story/AC surface.
  // Generated from the same T-01 zod definitions used at runtime; the
  // five new ERROR_CODES members (incl. story_activity_not_in_model)
  // surface through the shared errorEnvelopeSchema enum.
  registry.register("StoryCreate", storyCreateSchema);
  registry.register("StoryPatch", storyPatchSchema);
  registry.register("Story", storyReadSchema);
  registry.register("AcceptanceCriterionCreate", acCreateSchema);
  registry.register("AcceptanceCriterionPatch", acPatchSchema);
  registry.register("AcceptanceCriterion", acReadSchema);
  registry.register("StoryBootstrapRequest", bootstrapRequestSchema);
  registry.register("StoryBootstrapResult", bootstrapResultSchema);

  registry.registerPath({
    method: "get", path: "/api/v1/models/{modelId}/stories",
    description: "List the model's user stories (FR-05) — scoped through each story's DESCRIBES_ACTIVITY activity's membership in scopedNodeIds(:modelId); detached stories included with detached:true (DD-11).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: z.array(storyReadSchema) } } },
      404: err("model_not_found"),
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/models/{modelId}/stories",
    description: "Create a user story for a scoped Activity (FR-05). narrative is server-assembled; missing activityId → 400 story_activity_required; out-of-scope activityId → 404 story_activity_not_in_model (DD-08); bad roleId → 404 not_found (DD-07).",
    request: { body: { content: { "application/json": { schema: storyCreateSchema } } } },
    responses: {
      201: { description: "created", content: { "application/json": { schema: storyReadSchema } } },
      400: err("story_activity_required | invalid_payload"),
      404: err("model_not_found | story_activity_not_in_model | not_found"),
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/models/{modelId}/stories/bootstrap",
    description: "Generate-then-edit bootstrap (FR-09, XD-09): derives one editable derived:true story + starter Given/When/Then AC per scoped activity without a story; idempotent per activity → {created, skipped}. Optional {activityIds} narrowing — out-of-scope id → 404 story_activity_not_in_model.",
    request: { body: { content: { "application/json": { schema: bootstrapRequestSchema } } } },
    responses: {
      200: { description: "ok", content: { "application/json": { schema: bootstrapResultSchema } } },
      404: err("model_not_found | story_activity_not_in_model"),
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/models/{modelId}/stories/{storyId}",
    description: "Story detail with embedded acceptance criteria ordered by ordinal ASC (FR-05). Cross-model → 404 story_not_found; detached → 200 with detached:true (DD-11).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: storyReadSchema } } },
      404: err("model_not_found | story_not_found"),
    },
  });
  registry.registerPath({
    method: "patch", path: "/api/v1/models/{modelId}/stories/{storyId}",
    description: "Patch a story — omitted fields kept; narrative re-assembled when persona/action/benefit change; activityId/roleId re-point their edges (sourceActivityId tracks the edge, C-03); always clears derived (DD-05).",
    request: { body: { content: { "application/json": { schema: storyPatchSchema } } } },
    responses: {
      200: { description: "ok", content: { "application/json": { schema: storyReadSchema } } },
      400: err("invalid_payload"),
      404: err("model_not_found | story_not_found | story_activity_not_in_model | not_found"),
    },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/models/{modelId}/stories/{storyId}",
    description: "Delete a story + its ACs + all three edge types in one DETACH DELETE tx; the story's Activity/Role survive (FR-05, FR-07).",
    responses: {
      204: { description: "deleted" },
      404: err("model_not_found | story_not_found"),
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/models/{modelId}/stories/{storyId}/acceptance-criteria",
    description: "List a story's acceptance criteria ordered by ordinal ASC (FR-06).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: z.array(acReadSchema) } } },
      404: err("model_not_found | story_not_found"),
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/models/{modelId}/stories/{storyId}/acceptance-criteria",
    description: "Create a structured Given/When/Then AC (FR-06, XD-10). Missing/empty clause → 400 acceptance_criterion_clause_required (NFR-03); ordinal defaults to max+1.",
    request: { body: { content: { "application/json": { schema: acCreateSchema } } } },
    responses: {
      201: { description: "created", content: { "application/json": { schema: acReadSchema } } },
      400: err("acceptance_criterion_clause_required | invalid_payload"),
      404: err("model_not_found | story_not_found"),
    },
  });
  registry.registerPath({
    method: "patch", path: "/api/v1/models/{modelId}/stories/{storyId}/acceptance-criteria/{acId}",
    description: "Patch an AC clause or ordinal (reorder — FR-13); always clears derived (DD-05). Empty clause → 400 acceptance_criterion_clause_required.",
    request: { body: { content: { "application/json": { schema: acPatchSchema } } } },
    responses: {
      200: { description: "ok", content: { "application/json": { schema: acReadSchema } } },
      400: err("acceptance_criterion_clause_required | invalid_payload"),
      404: err("model_not_found | story_not_found | acceptance_criterion_not_found"),
    },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/models/{modelId}/stories/{storyId}/acceptance-criteria/{acId}",
    description: "Delete an AC (FR-06).",
    responses: {
      204: { description: "deleted" },
      404: err("model_not_found | story_not_found | acceptance_criterion_not_found"),
    },
  });

  registry.registerPath({
    method: "get", path: "/api/v1/openapi.json",
    description: "FR-16 — the v1 contract as a self-describing OpenAPI 3.1 document. Generated at server boot from the same zod definitions used at runtime; no hand-maintained copy.",
    responses: {
      200: { description: "OpenAPI 3.1 document for /api/v1" },
    },
  });

  registerKpiOkrPaths(registry); // kpi-okr-governance FR-12 (design §4.7)

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: { title: "companygraph", version: "0.1.0", description: "Foundation API for the companygraph retail-process-graph product." },
    servers: [{ url: "http://127.0.0.1:8787" }],
  });
}

export function handleOpenapi(): Response {
  return new Response(JSON.stringify(getOpenApiDoc()), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
