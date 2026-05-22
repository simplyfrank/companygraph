import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
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

let cached: object | undefined;

export function getOpenApiDoc(): object {
  if (cached) return cached;
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
  registry.registerPath({
    method: "get", path: "/api/v1/query/listDomains",
    description: "List all domains (FR-07).",
    responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ rows: z.array(z.record(z.unknown())) }) } } } },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/query/cypher",
    description: "Read-only Cypher passthrough (FR-07 / NFR-06).",
    request: { body: { content: { "application/json": { schema: z.object({ statement: z.string(), params: z.record(z.unknown()).optional() }) } } } },
    responses: {
      200: { description: "ok" },
      400: { description: "write_statement_rejected | parse_error | result_truncated | query_timeout", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });

  const generator = new OpenApiGeneratorV31(registry.definitions);
  cached = generator.generateDocument({
    openapi: "3.1.0",
    info: { title: "companygraph", version: "0.1.0", description: "Foundation API for the companygraph retail-process-graph product." },
    servers: [{ url: "http://127.0.0.1:8787" }],
  });
  return cached;
}

export function handleOpenapi(): Response {
  return new Response(JSON.stringify(getOpenApiDoc()), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
