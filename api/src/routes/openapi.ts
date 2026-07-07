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
import {
  subScoresSchema,
  keyActivityMarkSchema,
  activityScoreRowSchema,
  keyActivityScoresSchema,
} from "@companygraph/shared/schema/key-activity";
import {
  capabilityCreateSchema,
  capabilityPatchSchema,
  capabilityReadSchema,
  neededBySchema,
  supportedBySchema,
  contextAssignSchema,
  gapsResultSchema,
  contextMapResultSchema,
} from "@companygraph/shared/schema/ddd-system";
import {
  specExportQuerySchema,
  specDocumentSchema,
} from "@companygraph/shared/schema/spec-export";
import {
  authoringApplySchema,
  authoringApplyResultSchema,
  authoringGraphSchema,
  domainPatchSchema,
} from "@companygraph/shared/schema/authoring";
import {
  activityLinkCreateSchema,
  storyLinkCreateSchema,
  impactLinkRowSchema,
  kpiImpactMatrixSchema,
  kpiImpactRollupSchema,
} from "@companygraph/shared/schema/kpi-impact";
import { ERROR_CODES } from "../errors";
import { registerKpiOkrPaths } from "./openapi-kpi-okr";
import { registerPerformancePaths } from "./openapi-performance";
import { registerOperatorPaths } from "./openapi-operator";
import { registerBenchmarkPaths } from "./openapi-benchmarks";

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

  // ── key-activity-optimizer T-10 (design §4.9, FR-10) — key-activity
  // surface. Generated from the same T-01 zod definitions used at
  // runtime (no hand-maintained copy); the new `activity_not_found`
  // code surfaces through the shared errorEnvelopeSchema enum. The
  // mark/unmark 404s follow the story routes' combined-404 convention
  // (model_not_found | activity_not_found — cold-pass B-01 sequencing).
  registry.register("KeyActivitySubScores", subScoresSchema);
  registry.register("KeyActivityMark", keyActivityMarkSchema);
  registry.register("KeyActivityScoreRow", activityScoreRowSchema);
  registry.register("KeyActivityScores", keyActivityScoresSchema);

  registry.registerPath({
    method: "get", path: "/api/v1/models/{modelId}/key-activities",
    description: "Live descriptive graph scores + ranking over the model's scoped Activity set (FR-06; centrality, critical-path position, handoff density — XD-11, no recommendations). Unknown model → 404 model_not_found; an existing model with zero scoped activities → 200 rows:[] / meta.activityCount:0, never a 404.",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: keyActivityScoresSchema } } },
      404: err("model_not_found"),
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/models/{modelId}/key-activities/{activityId}/mark",
    description: "Mark a model-scoped Activity as key (FR-07, XD-03): snapshots the SERVER-computed live scores into attributes.keyActivity (attribute-preserving lock-first write; no request body — a client can never supply a snapshot). Returns the updated rank row.",
    responses: {
      200: { description: "marked", content: { "application/json": { schema: activityScoreRowSchema } } },
      404: err("model_not_found | activity_not_found"),
    },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/models/{modelId}/key-activities/{activityId}/mark",
    description: "Unmark a key activity (FR-08): deletes the attributes.keyActivity key, restoring attributes byte-equal to pre-mark (NFR-03). Idempotent — unmarking an unmarked activity is a true no-op 204, never a 404.",
    responses: {
      204: { description: "unmarked" },
      404: err("model_not_found | activity_not_found"),
    },
  });

  // ── ddd-system-modeling T-11 (design §4.9, FR-10) — capability +
  // system-model surface. Generated from the same T-01 zod definitions
  // used at runtime (no hand-maintained copy); the three new
  // ERROR_CODES members (capability_not_found,
  // bounded_context_not_found, system_not_found) surface through the
  // shared errorEnvelopeSchema enum. The three PUT registrations are
  // the document's FIRST `put` operations (DD-11 — the generator's
  // RouteConfig Method union includes 'put').
  registry.register("CapabilityCreate", capabilityCreateSchema);
  registry.register("CapabilityPatch", capabilityPatchSchema);
  registry.register("Capability", capabilityReadSchema);
  registry.register("CapabilityNeededBy", neededBySchema);
  registry.register("CapabilitySupportedBy", supportedBySchema);
  registry.register("CapabilityContextAssign", contextAssignSchema);
  registry.register("SystemModelGaps", gapsResultSchema);
  registry.register("SystemModelContextMap", contextMapResultSchema);

  registry.registerPath({
    method: "get", path: "/api/v1/models/{modelId}/system-model/gaps",
    description: "Support-gap analysis (FR-07/FR-08): unsupportedSteps + capabilityGaps (step items carry describingStories — DD-15), capabilitiesWithoutSystem, per-model orphanSystems (DD-18), and the augmentation mix per capability + model roll-up (the `unknown` bucket is defensive). Read-only, bounded, deterministic.",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: gapsResultSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/models/{modelId}/system-model/context-map",
    description: "Context map (FR-09): contexts holding ≥1 model-scoped capability, each with its capabilities + inter-context relationships resolved to targetId (DD-07), plus the unassigned bucket. Read-only — no BoundedContext/relationship is created or mutated (NFR-04).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: contextMapResultSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/models/{modelId}/capabilities",
    description: "List the model's capabilities (FR-04) — membership rides CAPABILITY_IN_MODEL (DD-02); rows carry neededByCount/supportingSystemCount + assigned context. Unknown model → 200 [] (the pinned list-[]-vs-create-404 asymmetry).",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: z.array(capabilityReadSchema) } } },
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/models/{modelId}/capabilities",
    description: "Create a capability (FR-04): 201 + server UUIDv7 + the CAPABILITY_IN_MODEL membership edge written atomically in the create tx. Unknown model → 404 model_not_found.",
    request: { body: { content: { "application/json": { schema: capabilityCreateSchema } } } },
    responses: {
      201: { description: "created", content: { "application/json": { schema: capabilityReadSchema } } },
      400: err("invalid_payload"),
      404: err("model_not_found"),
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/models/{modelId}/capabilities/{capabilityId}",
    description: "Capability detail (FR-04): embeds neededBy (activity|story), supportedBy (each with systemKind), assignedContext, and the detached[] indicator field (DD-13). Cross-model → 404 capability_not_found.",
    responses: {
      200: { description: "ok", content: { "application/json": { schema: capabilityReadSchema } } },
      404: err("capability_not_found"),
    },
  });
  registry.registerPath({
    method: "patch", path: "/api/v1/models/{modelId}/capabilities/{capabilityId}",
    description: "Patch a capability — omitted fields are never clobbered (FR-04).",
    request: { body: { content: { "application/json": { schema: capabilityPatchSchema } } } },
    responses: {
      200: { description: "ok", content: { "application/json": { schema: capabilityReadSchema } } },
      400: err("invalid_payload"),
      404: err("capability_not_found"),
    },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/models/{modelId}/capabilities/{capabilityId}",
    description: "Delete a capability + all four edge types in one DETACH DELETE tx (FR-06, AC-05); the far-end Activity/UserStory/System/BoundedContext/BusinessModel nodes survive.",
    responses: {
      204: { description: "deleted" },
      404: err("capability_not_found"),
    },
  });
  registry.registerPath({
    method: "put", path: "/api/v1/models/{modelId}/capabilities/{capabilityId}/needed-by",
    description: "Map an Activity or UserStory need onto the capability (FR-05) — exactly one of {activityId,storyId}; idempotent MERGE (DD-06); the target is validated in-model (strict scopedNodeIds arm, DD-16 — an orphan target → 404 not_found with details.field).",
    request: { body: { content: { "application/json": { schema: neededBySchema } } } },
    responses: {
      200: { description: "mapped", content: { "application/json": { schema: capabilityReadSchema } } },
      400: err("invalid_payload | edge_endpoint_label_mismatch"),
      404: err("capability_not_found | not_found"),
    },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/models/{modelId}/capabilities/{capabilityId}/needed-by",
    description: "Remove a needed-by mapping (FR-05). Body-carrying DELETE — the source is a two-field union that does not path-encode cleanly (precedent: module-instances edges DELETE).",
    request: { body: { content: { "application/json": { schema: neededBySchema } } } },
    responses: {
      204: { description: "removed" },
      404: err("capability_not_found"),
    },
  });
  registry.registerPath({
    method: "put", path: "/api/v1/models/{modelId}/capabilities/{capabilityId}/supported-by",
    description: "Map a supporting System onto the capability (FR-05) — idempotent MERGE (DD-06); unknown system → 404 system_not_found.",
    request: { body: { content: { "application/json": { schema: supportedBySchema } } } },
    responses: {
      200: { description: "mapped", content: { "application/json": { schema: capabilityReadSchema } } },
      400: err("invalid_payload | edge_endpoint_label_mismatch"),
      404: err("capability_not_found | system_not_found"),
    },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/models/{modelId}/capabilities/{capabilityId}/supported-by/{systemId}",
    description: "Remove a supporting-system mapping (FR-05).",
    responses: {
      204: { description: "removed" },
      404: err("capability_not_found"),
    },
  });
  registry.registerPath({
    method: "put", path: "/api/v1/models/{modelId}/capabilities/{capabilityId}/context",
    description: "Assign the capability's bounded context (FR-05) — REPLACES any prior assignment in one tx (at-most-one, FR-03); unknown context → 404 bounded_context_not_found.",
    request: { body: { content: { "application/json": { schema: contextAssignSchema } } } },
    responses: {
      200: { description: "assigned", content: { "application/json": { schema: capabilityReadSchema } } },
      400: err("invalid_payload | edge_endpoint_label_mismatch"),
      404: err("capability_not_found | bounded_context_not_found"),
    },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/models/{modelId}/capabilities/{capabilityId}/context",
    description: "Unassign the capability's bounded context (FR-05).",
    responses: {
      204: { description: "unassigned" },
      404: err("capability_not_found"),
    },
  });

  registry.registerPath({
    method: "get", path: "/api/v1/openapi.json",
    description: "FR-16 — the v1 contract as a self-describing OpenAPI 3.1 document. Generated at server boot from the same zod definitions used at runtime; no hand-maintained copy.",
    responses: {
      200: { description: "OpenAPI 3.1 document for /api/v1" },
    },
  });

  // requirements-export T-06 (FR-06) — spec-export route + schemas.
  registry.register("SpecDocument", specDocumentSchema);
  registry.registerPath({
    method: "get", path: "/api/v1/models/{modelId}/spec-export",
    description: "Assembled business specification document (FR-01). ?format=json (default) → application/json; ?format=markdown → text/markdown. Section failures degrade to empty shapes with meta.degraded (FR-03).",
    request: { params: z.object({ modelId: z.string() }), query: specExportQuerySchema },
    responses: {
      200: {
        description: "assembled spec document",
        content: {
          "application/json": { schema: specDocumentSchema },
          "text/markdown": { schema: z.string() },
        },
      },
      400: err("unsupported_export_format"),
      404: err("model_not_found"),
    },
  });

  registerKpiOkrPaths(registry); // kpi-okr-governance FR-12 (design §4.7)
  registerPerformancePaths(registry); // kpi-okr-performance-dashboards FR-09 (design §4.6)
  registerOperatorPaths(registry); // cross-function-exec-rollup FR-09 (design §6, C-07 anchor)
  registerBenchmarkPaths(registry); // function-benchmark-scoring FR-08 (design §4.6)

  // business-model-authoring T-13 (FR-13, DD-06) — three route paths.
  registry.register("AuthoringApply", authoringApplySchema);
  registry.register("AuthoringApplyResult", authoringApplyResultSchema);
  registry.register("AuthoringGraph", authoringGraphSchema);
  registry.register("DomainPatch", domainPatchSchema);
  registry.registerPath({
    method: "post", path: "/api/v1/models/{modelId}/authoring/apply",
    description: "Batched authoring write: mint ids, scope-validate, land via realImport (FR-07). 200 even when all rows fail; 400 reserved for envelope parse failure.",
    request: {
      params: z.object({ modelId: z.string() }),
      body: { content: { "application/json": { schema: authoringApplySchema } } },
    },
    responses: {
      200: { description: "imported (partial successes carry errors[])", content: { "application/json": { schema: authoringApplyResultSchema } } },
      400: { description: "envelope-level validation failure", content: { "application/json": { schema: errorEnvelopeSchema } } },
      404: { description: "model not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/models/{modelId}/authoring/graph",
    description: "Model-scoped id-based graph projection (FR-09). Journeys with topologically ordered activities + shared roles/systems/locations by id.",
    request: { params: z.object({ modelId: z.string() }) },
    responses: {
      200: { description: "ok", content: { "application/json": { schema: authoringGraphSchema } } },
      404: { description: "model not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "patch", path: "/api/v1/models/{modelId}/domains/{domainId}",
    description: "Edit-in-place for a model-scoped domain (FR-03, DD-08). name and/or description; omitted fields untouched.",
    request: {
      params: z.object({ modelId: z.string(), domainId: z.string() }),
      body: { content: { "application/json": { schema: domainPatchSchema } } },
    },
    responses: {
      200: { description: "ok", content: { "application/json": { schema: nodeReadSchema } } },
      400: { description: "validation error (empty body)", content: { "application/json": { schema: errorEnvelopeSchema } } },
      404: { description: "model or domain not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });

  // ── kpi-impact-mapping T-10 (design §7, §5, FR-10, AC-17) — 8 routes
  // generated from the same T-01 zod definitions. The new error codes
  // (kpi_not_found, impact_link_not_found) surface through the shared
  // errorEnvelopeSchema enum.
  registry.register("ActivityLinkCreate", activityLinkCreateSchema);
  registry.register("StoryLinkCreate", storyLinkCreateSchema);
  registry.register("ImpactLinkRow", impactLinkRowSchema);
  registry.register("KpiImpactMatrix", kpiImpactMatrixSchema);
  registry.register("KpiImpactRollup", kpiImpactRollupSchema);

  registry.registerPath({
    method: "get", path: "/api/v1/models/{modelId}/kpi-impact/matrix",
    description: "Activity × KPI coverage matrix with gap detection (FR-05/FR-06). Read-only, model-scoped.",
    request: { params: z.object({ modelId: z.string() }) },
    responses: {
      200: { description: "ok", content: { "application/json": { schema: kpiImpactMatrixSchema } } },
      404: { description: "model not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/models/{modelId}/kpi-impact/rollup",
    description: "Per-KPI roll-up with measured status + aggregate impact weight (FR-08/FR-09). Degrades to no_data, never 500.",
    request: { params: z.object({ modelId: z.string() }) },
    responses: {
      200: { description: "ok", content: { "application/json": { schema: kpiImpactRollupSchema } } },
      404: { description: "model not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/models/{modelId}/kpi-impact/activity-links",
    description: "List activity→KPI impact links (FR-03). Optional ?activityId= / ?kpiId= filters.",
    request: { params: z.object({ modelId: z.string() }) },
    responses: {
      200: { description: "ok", content: { "application/json": { schema: z.object({ rows: z.array(impactLinkRowSchema) }) } } },
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/models/{modelId}/kpi-impact/activity-links",
    description: "Create/update an activity→KPI impact link (FR-01). MERGE-on-pair — no duplicate edge.",
    request: {
      params: z.object({ modelId: z.string() }),
      body: { content: { "application/json": { schema: activityLinkCreateSchema } } },
    },
    responses: {
      201: { description: "created/updated", content: { "application/json": { schema: impactLinkRowSchema } } },
      400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
      404: { description: "activity_not_found / kpi_not_found", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/models/{modelId}/kpi-impact/activity-links/{linkId}",
    description: "Delete an activity→KPI impact link (FR-03). 204 on success, 404 if not found.",
    request: { params: z.object({ modelId: z.string(), linkId: z.string() }) },
    responses: {
      204: { description: "deleted" },
      404: { description: "impact_link_not_found", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/models/{modelId}/kpi-impact/story-links",
    description: "List story→KPI impact links (FR-03). Optional ?storyId= / ?kpiId= filters.",
    request: { params: z.object({ modelId: z.string() }) },
    responses: {
      200: { description: "ok", content: { "application/json": { schema: z.object({ rows: z.array(impactLinkRowSchema) }) } } },
    },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/models/{modelId}/kpi-impact/story-links",
    description: "Create/update a story→KPI impact link (FR-02). MERGE-on-pair — no duplicate edge.",
    request: {
      params: z.object({ modelId: z.string() }),
      body: { content: { "application/json": { schema: storyLinkCreateSchema } } },
    },
    responses: {
      201: { description: "created/updated", content: { "application/json": { schema: impactLinkRowSchema } } },
      400: { description: "validation error", content: { "application/json": { schema: errorEnvelopeSchema } } },
      404: { description: "story_not_found / kpi_not_found", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/models/{modelId}/kpi-impact/story-links/{linkId}",
    description: "Delete a story→KPI impact link (FR-03). 204 on success, 404 if not found.",
    request: { params: z.object({ modelId: z.string(), linkId: z.string() }) },
    responses: {
      204: { description: "deleted" },
      404: { description: "impact_link_not_found", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });

  // chat-interface — conversation list + message history (FR-06/FR-07).
  registry.registerPath({
    method: "get", path: "/api/v1/chat/conversations",
    description: "List chat conversations newest-first (FR-06).",
    responses: {
      200: {
        description: "ok",
        content: { "application/json": { schema: z.object({ rows: z.array(z.object({
          id: z.string(),
          created_at: z.string(),
          last_message_at: z.string(),
          title: z.string().nullable(),
          role_id_pin: z.string().nullable(),
        })) }) } },
      },
      401: { description: "unauthorized", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/chat/conversations/{id}/messages",
    description: "Message history for a conversation, ordered by turn_index asc (FR-07).",
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        description: "ok",
        content: { "application/json": { schema: z.object({ rows: z.array(z.object({
          id: z.string(),
          conversation_id: z.string(),
          turn_index: z.number(),
          role: z.enum(["user", "assistant"]),
          content_text: z.string(),
          created_at: z.string(),
        })) }) } },
      },
      401: { description: "unauthorized", content: { "application/json": { schema: errorEnvelopeSchema } } },
      404: { description: "conversation not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });

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
