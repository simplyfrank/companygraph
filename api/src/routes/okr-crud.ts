import type { Driver } from "neo4j-driver";
import { z } from "zod";
import { uuidv7 } from "@companygraph/shared/schema/nodes";
import { ValidationError } from "../errors";
import { generateId } from "../ids";
import { getDriver } from "../neo4j/driver";
import { ok, error, parseWith, readJson } from "./_helpers";

// =============================================================================
// Schemas — exported so openapi-kpi-okr.ts can register them
// (kpi-okr-governance FR-12)
// =============================================================================

export const okrDirectiveCreateSchema = z.object({
  id: uuidv7.optional(),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  attributes: z.object({
    cycle_name: z.string(),
    cycle_start: z.string(),
    cycle_end: z.string(),
    domain_id: uuidv7.optional(),
    product_id: uuidv7.optional(),
    status: z.enum(["draft", "active", "review", "closed"]),
    review_cadence: z.enum(["weekly", "monthly", "quarterly"]),
  }),
});

export const objectiveCreateSchema = z.object({
  id: uuidv7.optional(),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  attributes: z.object({
    owner: z.string(),
    cycle_start: z.string(),
    cycle_end: z.string(),
    status: z.enum(["draft", "active", "closed"]),
    theme: z.string(),
  }),
});

export const keyResultCreateSchema = z.object({
  id: uuidv7.optional(),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  attributes: z.object({
    baseline_value: z.number(),
    target_value: z.number(),
    current_value: z.number(),
    unit: z.string(),
    direction: z.enum(["higher_is_better", "lower_is_better"]),
    progress: z.number().min(0).max(100),
    status: z.enum(["not_started", "in_progress", "achieved", "at_risk", "missed"]),
  }),
});

// =============================================================================
// OKR Directive CRUD
// =============================================================================

export async function handleOkrDirectivePost(req: Request): Promise<Response> {
  const input = parseWith(okrDirectiveCreateSchema, await readJson(req));
  const id = input.id || uuidv7.parse(generateId());
  const now = new Date().toISOString();
  const attrs = JSON.stringify(input.attributes);

  const driver: Driver = getDriver();
  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `CREATE (n:OKRDirective {id: $id, name: $name, description: $description, attributes_json: $attrs, createdAt: $now, updatedAt: $now})
         RETURN n`,
        { id, name: input.name, description: input.description, attrs, now },
      ),
    );
    const node = result.records[0]?.get("n");
    return ok(node);
  } finally {
    await session.close();
  }
}

export async function handleOkrDirectiveGet(req: Request, domainId: string): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (n:OKRDirective)
       WHERE n.attributes_json CONTAINS $domainId
       RETURN n
       ORDER BY n.createdAt DESC`,
      { domainId },
    );
    const nodes = result.records.map((r) => {
      const node = r.get("n");
      return {
        id: node.properties.id,
        name: node.properties.name,
        description: node.properties.description,
        attributes: JSON.parse(node.properties.attributes_json || "{}"),
        createdAt: node.properties.createdAt,
        updatedAt: node.properties.updatedAt,
      };
    });
    return ok(nodes);
  } finally {
    await session.close();
  }
}

// GET /api/v1/okr-directives (no filter params) — kpi-okr-governance
// FR-10c. Returns top-level directives (OKR cycles): the predicate is
// BYTE-FOR-BYTE the string-contains Cypher OkrManagement.tsx ran through
// the passthrough, kept bug-compatible on purpose (req-review pass-2
// C-02; parse-based filtering rejected in design §9). A directive whose
// attribute VALUE merely contains the string '"domain_id"' is excluded —
// pinned by an AC-21 decoy fixture. NOTE: :OKRDirective stores camelCase
// createdAt (graph-core convention) — there is no created_at here.
// Returns {rows:[mapped]} — the filtered GETs keep their bare-array
// shape (asymmetry pinned, NOT harmonized: harmonizing breaks OkrCrud.tsx).
export async function handleOkrDirectiveList(req: Request): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (n:OKRDirective) WHERE NOT n.attributes_json CONTAINS '"domain_id"' RETURN n ORDER BY n.createdAt DESC`,
    );
    const rows = result.records.map((r) => {
      const node = r.get("n");
      return {
        id: node.properties.id,
        name: node.properties.name,
        description: node.properties.description,
        attributes: JSON.parse(node.properties.attributes_json || "{}"),
        createdAt: node.properties.createdAt,
        updatedAt: node.properties.updatedAt,
      };
    });
    return ok({ rows });
  } finally {
    await session.close();
  }
}

export async function handleOkrDirectiveGetByProduct(req: Request, productId: string): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (n:OKRDirective)
       WHERE n.attributes_json CONTAINS $productId
       RETURN n
       ORDER BY n.createdAt DESC`,
      { productId },
    );
    const nodes = result.records.map((r) => {
      const node = r.get("n");
      return {
        id: node.properties.id,
        name: node.properties.name,
        description: node.properties.description,
        attributes: JSON.parse(node.properties.attributes_json || "{}"),
        createdAt: node.properties.createdAt,
        updatedAt: node.properties.updatedAt,
      };
    });
    return ok(nodes);
  } finally {
    await session.close();
  }
}

export async function handleOkrDirectivePatch(req: Request, id: string): Promise<Response> {
  const input = parseWith(okrDirectiveCreateSchema.partial(), await readJson(req));
  const now = new Date().toISOString();
  const attrs = input.attributes ? JSON.stringify(input.attributes) : undefined;

  const driver: Driver = getDriver();
  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) => {
      const query = `MATCH (n:OKRDirective {id: $id}) SET n.updatedAt = $now`;
      const params: Record<string, unknown> = { id, now };

      if (input.name) {
        tx.run(query + `, n.name = $name`, { ...params, name: input.name });
      }
      if (input.description) {
        tx.run(query + `, n.description = $description`, { ...params, description: input.description });
      }
      if (attrs) {
        tx.run(query + `, n.attributes_json = $attrs`, { ...params, attrs });
      }

      return tx.run(`MATCH (n:OKRDirective {id: $id}) RETURN n`, params);
    });
    const node = result.records[0]?.get("n");
    return ok(node);
  } finally {
    await session.close();
  }
}

export async function handleOkrDirectiveDelete(req: Request, id: string): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();
  try {
    await session.executeWrite((tx) =>
      tx.run(`MATCH (n:OKRDirective {id: $id}) DETACH DELETE n`, { id }),
    );
    return ok({ success: true });
  } finally {
    await session.close();
  }
}

// =============================================================================
// Key Result CRUD
// =============================================================================

export async function handleKeyResultPost(req: Request): Promise<Response> {
  const input = parseWith(keyResultCreateSchema, await readJson(req));
  const id = input.id || uuidv7.parse(generateId());
  const now = new Date().toISOString();
  const attrs = JSON.stringify(input.attributes);

  const driver: Driver = getDriver();
  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `CREATE (n:KeyResult {id: $id, name: $name, description: $description, attributes_json: $attrs, createdAt: $now, updatedAt: $now})
         RETURN n`,
        { id, name: input.name, description: input.description, attrs, now },
      ),
    );
    const node = result.records[0]?.get("n");
    return ok(node);
  } finally {
    await session.close();
  }
}

export async function handleKeyResultGet(req: Request, directiveId: string): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (d:OKRDirective {id: $directiveId})-[:HAS_KEY_RESULT]->(kr:KeyResult)
       RETURN kr
       ORDER BY kr.createdAt`,
      { directiveId },
    );
    const nodes = result.records.map((r) => {
      const node = r.get("kr");
      return {
        ...node,
        attributes: JSON.parse(node.attributes_json || "{}"),
      };
    });
    return ok(nodes);
  } finally {
    await session.close();
  }
}

export async function handleKeyResultPatch(req: Request, id: string): Promise<Response> {
  const input = parseWith(keyResultCreateSchema.partial(), await readJson(req));
  const now = new Date().toISOString();
  const attrs = input.attributes ? JSON.stringify(input.attributes) : undefined;

  const driver: Driver = getDriver();
  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) => {
      const query = `MATCH (n:KeyResult {id: $id}) SET n.updatedAt = $now`;
      const params: Record<string, unknown> = { id, now };

      if (input.name) {
        tx.run(query + `, n.name = $name`, { ...params, name: input.name });
      }
      if (input.description) {
        tx.run(query + `, n.description = $description`, { ...params, description: input.description });
      }
      if (attrs) {
        tx.run(query + `, n.attributes_json = $attrs`, { ...params, attrs });
      }

      return tx.run(`MATCH (n:KeyResult {id: $id}) RETURN n`, params);
    });
    const node = result.records[0]?.get("n");
    return ok(node);
  } finally {
    await session.close();
  }
}

export async function handleKeyResultDelete(req: Request, id: string): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();
  try {
    await session.executeWrite((tx) =>
      tx.run(`MATCH (n:KeyResult {id: $id}) DETACH DELETE n`, { id }),
    );
    return ok({ success: true });
  } finally {
    await session.close();
  }
}

// =============================================================================
// OKR Performance Summary
// =============================================================================

export async function handleOkrPerformanceGet(req: Request, domainId: string): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (d:OKRDirective)
       WHERE d.attributes_json CONTAINS $domainId
       OPTIONAL MATCH (d)-[:HAS_KEY_RESULT]->(kr:KeyResult)
       OPTIONAL MATCH (kr)-[:DRIVES_KPI]->(k:KPI)
       RETURN d.name AS directive,
              kr.name AS key_result,
              kr.attributes_json AS kr_attrs,
              k.name AS kpi,
              k.attributes_json AS kpi_attrs
       ORDER BY d.name, kr.name`,
      { domainId },
    );

    const rows = result.records.map((r) => ({
      directive: r.get("directive"),
      keyResult: r.get("key_result"),
      keyResultAttrs: JSON.parse(r.get("kr_attrs") || "{}"),
      kpi: r.get("kpi"),
      kpiAttrs: JSON.parse(r.get("kpi_attrs") || "{}"),
    }));
    return ok(rows);
  } finally {
    await session.close();
  }
}
