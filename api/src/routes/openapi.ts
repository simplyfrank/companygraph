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
import { ERROR_CODES } from "../errors";

// Static Route[] declared right here (design-review B-02 — OpenAPI
// generator owns its own route table, no inter-task module dependency).
const errorEnvelopeSchema = z.object({
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

  registry.registerPath({
    method: "get", path: "/api/v1/openapi.json",
    description: "FR-16 — the v1 contract as a self-describing OpenAPI 3.1 document. Generated at server boot from the same zod definitions used at runtime; no hand-maintained copy.",
    responses: {
      200: { description: "OpenAPI 3.1 document for /api/v1" },
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
