import { describe, expect, test } from "bun:test";
import { ERROR_CODES } from "../src/errors";

// AC-24 — GET /api/v1/openapi.json returns a valid OpenAPI 3.1 document
// covering every route declared by FR-06 / FR-07 / FR-11 / FR-17 / FR-18.
//
// Strategy:
//   1. Hit the running API server (same convention as
//      healthz.integration.test.ts / stats.integration.test.ts —
//      BASE_URL defaults to http://127.0.0.1:8787 and is overridable
//      via API_BASE_URL).
//   2. Parse the body as `unknown` and narrow with explicit checks. No
//      `as any` anywhere.
//   3. The schema-name assertions are intentionally LOOSE: we check that
//      the registered Zod shapes appear as named entries under
//      components.schemas (e.g. "Node", "Edge", "ErrorEnvelope"). We do
//      NOT assert deep-equality against the Zod source, because the
//      zod-to-openapi generator may rename or inline anonymous shapes.
//   4. The error-code assertion verifies every ERROR_CODES member is
//      present in the ErrorEnvelope's `code` enum (single-source-of-
//      truth check per AC-24).
const BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";

describe("integration: AC-24 openapi", () => {
  test("GET /api/v1/openapi.json returns 200 application/json", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/openapi.json`);
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") ?? "";
    expect(ct).toContain("application/json");
  });

  test("document is OpenAPI 3.1 with info.title", async () => {
    const doc = await getDoc();
    expect(typeof doc.openapi).toBe("string");
    expect(doc.openapi.startsWith("3.1")).toBe(true);
    expect(typeof doc.info).toBe("object");
    expect(doc.info).not.toBeNull();
    expect(typeof doc.info.title).toBe("string");
    expect(doc.info.title.length).toBeGreaterThan(0);
  });

  test("paths cover every route in FR-06 / FR-07 / FR-11 / FR-17 / FR-18", async () => {
    const doc = await getDoc();
    expect(typeof doc.paths).toBe("object");
    expect(doc.paths).not.toBeNull();
    const paths = Object.keys(doc.paths);

    const required = [
      // FR-11: ops + introspection
      "/api/v1/healthz",
      "/api/v1/stats",
      // FR-16: the openapi document itself
      "/api/v1/openapi.json",
      // FR-06: node + edge CRUD
      "/api/v1/nodes/{label}",
      "/api/v1/nodes/{label}/{id}",
      "/api/v1/edges",
      "/api/v1/edges/{id}",
      // FR-06 import + FR-17 + FR-18
      "/api/v1/import",
      "/api/v1/export",
      "/api/v1/export.ndjson",
      // FR-07: query surface
      "/api/v1/query/listDomains",
      "/api/v1/query/getDomain/{id}",
      "/api/v1/query/getJourney/{id}",
      "/api/v1/query/getActivity/{id}",
      "/api/v1/query/findPath",
      "/api/v1/query/neighbors/{id}",
      "/api/v1/query/cypher",
    ];

    const missing = required.filter((p) => !paths.includes(p));
    expect(missing).toEqual([]);
  });

  test("components.schemas exposes the Zod-derived node + edge shapes", async () => {
    const doc = await getDoc();
    const schemas = getSchemas(doc);
    // The names below are exactly the strings registry.register(...) uses
    // in api/src/routes/openapi.ts. If that file renames them, this list
    // must be updated in lockstep — the test deliberately couples to the
    // public schema names rather than to anonymous Zod fingerprints.
    const expected = [
      "Node",
      "NodeCreate",
      "NodeUpdate",
      "Edge",
      "EdgeCreate",
      "ImportPayload",
      "ImportResponse",
      "ErrorEnvelope",
      "Health",
      "Stats",
    ];
    const present = Object.keys(schemas);
    const missing = expected.filter((n) => !present.includes(n));
    expect(missing).toEqual([]);
  });

  test("ErrorEnvelope.code enum contains every ERROR_CODES member", async () => {
    const doc = await getDoc();
    const schemas = getSchemas(doc);
    const envelope = schemas.ErrorEnvelope;
    expect(typeof envelope).toBe("object");
    expect(envelope).not.toBeNull();

    // Walk envelope → properties.error → properties.code.enum. We accept
    // either the inline shape or one ref-hop down to a nested schema.
    const codeEnum = resolveErrorCodeEnum(envelope, schemas);
    expect(Array.isArray(codeEnum)).toBe(true);

    const missing = ERROR_CODES.filter((c) => !codeEnum.includes(c));
    expect(missing).toEqual([]);
  });

  test("request + response bodies are declared for the canonical routes", async () => {
    const doc = await getDoc();
    // Spot-check three routes: POST /import has a request body, GET
    // /export returns a body, POST /query/cypher has a request body.
    // We only assert presence of the requestBody / responses sub-trees,
    // not the exact $ref target — tightening this further is fragile
    // against generator output churn.
    const importPost = getOperation(doc, "/api/v1/import", "post");
    expect(typeof importPost.requestBody).toBe("object");
    expect(importPost.requestBody).not.toBeNull();

    const exportGet = getOperation(doc, "/api/v1/export", "get");
    expect(typeof exportGet.responses).toBe("object");
    expect(Object.keys(exportGet.responses ?? {})).toContain("200");

    const cypherPost = getOperation(doc, "/api/v1/query/cypher", "post");
    expect(typeof cypherPost.requestBody).toBe("object");
    expect(cypherPost.requestBody).not.toBeNull();
  });
});

// ---- helpers (typed, no `as any`) ----

interface OpenApiDoc {
  openapi: string;
  info: { title: string; version?: string; description?: string };
  paths: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, unknown> };
}

async function getDoc(): Promise<OpenApiDoc> {
  const res = await fetch(`${BASE_URL}/api/v1/openapi.json`);
  const text = await res.text();
  const parsed: unknown = JSON.parse(text);
  if (!isOpenApiDoc(parsed)) {
    throw new Error("response body is not a recognisable OpenAPI document");
  }
  return parsed;
}

function isOpenApiDoc(x: unknown): x is OpenApiDoc {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  if (typeof r.openapi !== "string") return false;
  if (typeof r.info !== "object" || r.info === null) return false;
  if (typeof (r.info as Record<string, unknown>).title !== "string") return false;
  if (typeof r.paths !== "object" || r.paths === null) return false;
  return true;
}

function getSchemas(doc: OpenApiDoc): Record<string, unknown> {
  const components = doc.components;
  if (!components || typeof components !== "object") return {};
  const schemas = components.schemas;
  if (!schemas || typeof schemas !== "object") return {};
  return schemas;
}

function getOperation(
  doc: OpenApiDoc,
  path: string,
  method: string,
): { requestBody?: unknown; responses?: Record<string, unknown> } {
  const pathItem = doc.paths[path];
  if (!pathItem || typeof pathItem !== "object") {
    throw new Error(`no path item for ${path}`);
  }
  const op = (pathItem as Record<string, unknown>)[method];
  if (!op || typeof op !== "object") {
    throw new Error(`no ${method.toUpperCase()} operation on ${path}`);
  }
  const o = op as Record<string, unknown>;
  return {
    requestBody: o.requestBody,
    responses: o.responses as Record<string, unknown> | undefined,
  };
}

// Walks ErrorEnvelope → properties.error → properties.code.enum.
// Falls back to one $ref-hop if `error` is a $ref instead of an inline
// object. Returns the enum as string[], or throws if it can't be found.
function resolveErrorCodeEnum(
  envelope: unknown,
  schemas: Record<string, unknown>,
): string[] {
  if (typeof envelope !== "object" || envelope === null) {
    throw new Error("ErrorEnvelope is not an object");
  }
  const env = envelope as Record<string, unknown>;
  const props = env.properties as Record<string, unknown> | undefined;
  if (!props || typeof props !== "object") {
    throw new Error("ErrorEnvelope has no .properties");
  }

  let errorShape = props.error;
  // One ref-hop if needed.
  if (
    typeof errorShape === "object" &&
    errorShape !== null &&
    typeof (errorShape as Record<string, unknown>).$ref === "string"
  ) {
    const ref = (errorShape as { $ref: string }).$ref;
    const name = ref.split("/").pop();
    if (name && schemas[name]) errorShape = schemas[name];
  }

  if (typeof errorShape !== "object" || errorShape === null) {
    throw new Error("ErrorEnvelope.error is not an object schema");
  }
  const errorProps = (errorShape as Record<string, unknown>).properties;
  if (typeof errorProps !== "object" || errorProps === null) {
    throw new Error("ErrorEnvelope.error has no .properties");
  }
  const codeShape = (errorProps as Record<string, unknown>).code;
  if (typeof codeShape !== "object" || codeShape === null) {
    throw new Error("ErrorEnvelope.error.code is not present");
  }
  const codeEnum = (codeShape as Record<string, unknown>).enum;
  if (!Array.isArray(codeEnum)) {
    throw new Error("ErrorEnvelope.error.code has no enum");
  }
  return codeEnum.filter((v): v is string => typeof v === "string");
}
