import { afterAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";

// kpi-okr-governance T-13 — pins the AS-BUILT okr-crud contract (FR-08,
// AC-10, AC-12 okr rows) plus the FR-10c unfiltered directive list
// (AC-21, okr half).
//
// Pinned as-built quirks (documented, NOT fixed):
//   - Creates/patches return the RAW neo4j Node serialization
//     ({identity, labels, properties, elementId, …}) — assert
//     properties.id etc., never the wrapper shape.
//   - Filtered GETs (?domain_id= / ?product_id=) match on
//     attributes_json CONTAINS $id (substring semantics) and return a
//     BARE ARRAY; the new unfiltered list returns {rows:[…]} — the
//     asymmetry is pinned, not harmonized (harmonizing breaks OkrCrud.tsx).
//   - The unfiltered list predicate is the bug-compatible string-contains
//     form: NOT attributes_json CONTAINS '"domain_id"'. A decoy directive
//     whose attribute VALUE is exactly the string "domain_id" is
//     WRONGLY excluded — that exclusion is the pin (req-review pass-2 C-02).
//   - Key-result list spreads the raw Node object, so `attributes` is
//     always {} (reads node.attributes_json off the Node, not
//     node.properties) — as-built defect pinned with this caveat.
//   - DELETE returns {success:true} even for unknown ids.
//   - :OKRDirective stores camelCase createdAt (graph-core convention);
//     there is no created_at on this label.

const API_BASE = "http://127.0.0.1:8787/api/v1";

interface ErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

const cleanupIds: string[] = [];

function directiveBody(overrides: { cycle_name?: string; domain_id?: string; product_id?: string } = {}) {
  const attributes: Record<string, unknown> = {
    cycle_name: overrides.cycle_name ?? `FY26-${generateId().slice(0, 8)}`,
    cycle_start: "2026-01-01",
    cycle_end: "2026-03-31",
    status: "active",
    review_cadence: "monthly",
  };
  if (overrides.domain_id) attributes.domain_id = overrides.domain_id;
  if (overrides.product_id) attributes.product_id = overrides.product_id;
  return {
    name: `okr-directive-${generateId().slice(0, 8)}`,
    description: "integration fixture directive",
    attributes,
  };
}

async function post(path: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function createDirective(overrides: Parameters<typeof directiveBody>[0] = {}): Promise<any> {
  const { status, body } = await post("/okr-directives", directiveBody(overrides));
  expect(status).toBe(200);
  // Raw Node serialization — pinned.
  expect(body.properties).toBeDefined();
  cleanupIds.push(body.properties.id);
  return body.properties;
}

afterAll(async () => {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    if (cleanupIds.length > 0) {
      await session.run(`MATCH (n) WHERE n.id IN $ids DETACH DELETE n`, { ids: cleanupIds });
    }
  } finally {
    await session.close();
    await closeDriver();
    _resetDriver();
  }
});

describe("integration: okr-directives CRUD (AC-10, AC-12)", () => {
  test("create returns raw Node with UUIDv7 id; PATCH updates; DELETE returns success even unknown", async () => {
    const props = await createDirective();
    expect(props.id.charAt(14)).toBe("7"); // v7 via generateId (as-built here)
    expect(typeof props.attributes_json).toBe("string");
    expect(props.createdAt).toBeDefined(); // camelCase, graph-core convention

    const patch = await fetch(`${API_BASE}/okr-directives/${props.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "renamed directive" }),
    });
    expect(patch.status).toBe(200);
    const patched = await patch.json();
    expect(patched.properties.name).toBe("renamed directive");

    const del = await fetch(`${API_BASE}/okr-directives/${props.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ success: true });

    // Pinned: DELETE of an unknown id also reports success.
    const delUnknown = await fetch(`${API_BASE}/okr-directives/${generateId()}`, { method: "DELETE" });
    expect(delUnknown.status).toBe(200);
    expect(await delUnknown.json()).toEqual({ success: true });
  });

  test("malformed directive body → 400 issues[] (was 500 — AC-12)", async () => {
    const { status, body } = await post("/okr-directives", { name: "x" });
    expect(status).toBe(400);
    const env = body as ErrorEnvelope;
    expect(env.error.code).toBe("invalid_payload");
    const issues = env.error.details?.issues as Array<{ path: string }>;
    expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(["description", "attributes"]));

    const badEnum = await post("/okr-directives", directiveBody() as any);
    expect(badEnum.status).toBe(200); // sanity: valid body still accepted
    cleanupIds.push(badEnum.body.properties.id);
  });

  test("filtered GETs keep as-built behavior: bare array, substring match (AC-21)", async () => {
    const domainId = generateId();
    const scoped = await createDirective({ domain_id: domainId });

    const res = await fetch(`${API_BASE}/okr-directives?domain_id=${domainId}`);
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true); // bare array — pinned asymmetry
    const mine = rows.find((r: any) => r.id === scoped.id);
    expect(mine).toBeDefined();
    expect(mine.attributes.domain_id).toBe(domainId);
    expect(mine.createdAt).toBeDefined();
  });
});

describe("integration: unfiltered okr-directives list (AC-21, FR-10c)", () => {
  test("top-level only, {rows} shape, createdAt DESC, decoy excluded by string-contains", async () => {
    const domainId = generateId();
    const topLevel = await createDirective();
    await new Promise((r) => setTimeout(r, 5));
    const scoped = await createDirective({ domain_id: domainId });
    await new Promise((r) => setTimeout(r, 5));
    // DECOY: attribute VALUE is exactly the string "domain_id" — its
    // serialized attributes_json contains '"domain_id"', so the
    // bug-compatible predicate WRONGLY excludes it. That exclusion is
    // the pin (string-contains semantics, req-review pass-2 C-02).
    const decoy = await createDirective({ cycle_name: "domain_id" });
    await new Promise((r) => setTimeout(r, 5));
    const topLevel2 = await createDirective();

    const res = await fetch(`${API_BASE}/okr-directives`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ id: string; createdAt: string }> };
    expect(Array.isArray(body.rows)).toBe(true); // {rows} envelope — new list only

    const ids = body.rows.map((r) => r.id);
    expect(ids).toContain(topLevel.id);
    expect(ids).toContain(topLevel2.id);
    expect(ids).not.toContain(scoped.id); // domain-scoped excluded
    expect(ids).not.toContain(decoy.id); // decoy excluded — the semantics pin

    // Ordered createdAt DESC.
    const sorted = [...body.rows].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
    expect(body.rows.map((r) => r.id)).toEqual(sorted.map((r) => r.id));
    expect(ids.indexOf(topLevel2.id)).toBeLessThan(ids.indexOf(topLevel.id));
  });
});

describe("integration: key-results CRUD (AC-10)", () => {
  function krBody() {
    return {
      name: `kr-${generateId().slice(0, 8)}`,
      description: "integration fixture KR",
      attributes: {
        baseline_value: 0,
        target_value: 100,
        current_value: 25,
        unit: "%",
        direction: "higher_is_better",
        progress: 25,
        status: "in_progress",
      },
    };
  }

  test("create, list via directive_id (HAS_KEY_RESULT join), patch, delete", async () => {
    const directive = await createDirective();
    const kr = await post("/key-results", krBody());
    expect(kr.status).toBe(200);
    const krProps = kr.body.properties;
    cleanupIds.push(krProps.id);
    expect(krProps.id.charAt(14)).toBe("7");

    // The API creates no HAS_KEY_RESULT edge — link via driver (as-built,
    // the edge comes from elsewhere; the list joins on it).
    const session = getDriver().session({ defaultAccessMode: "WRITE" });
    try {
      await session.run(
        `MATCH (d:OKRDirective {id: $did}), (kr:KeyResult {id: $kid})
         CREATE (d)-[:HAS_KEY_RESULT]->(kr)`,
        { did: directive.id, kid: krProps.id },
      );
    } finally {
      await session.close();
    }

    const list = await fetch(`${API_BASE}/key-results?directive_id=${directive.id}`);
    expect(list.status).toBe(200);
    const rows = await list.json();
    expect(Array.isArray(rows)).toBe(true); // bare array
    expect(rows).toHaveLength(1);
    // PINNED DEFECT: the mapper spreads the raw Node object and reads
    // node.attributes_json (undefined — it lives under .properties), so
    // attributes is ALWAYS {}. Do not "fix" without a spec.
    expect(rows[0].attributes).toEqual({});
    expect(rows[0].properties.id).toBe(krProps.id);

    const patch = await fetch(`${API_BASE}/key-results/${krProps.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "kr renamed" }),
    });
    expect(patch.status).toBe(200);
    expect((await patch.json()).properties.name).toBe("kr renamed");

    const del = await fetch(`${API_BASE}/key-results/${krProps.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ success: true });
  });

  test("malformed key-result body → 400 issues[] (AC-12)", async () => {
    const bad = krBody() as any;
    bad.attributes.progress = 150; // outside 0..100
    const { status, body } = await post("/key-results", bad);
    expect(status).toBe(400);
    const env = body as ErrorEnvelope;
    expect(env.error.code).toBe("invalid_payload");
    const issues = env.error.details?.issues as Array<{ path: string }>;
    expect(issues.map((i) => i.path)).toContain("attributes.progress");
  });
});

describe("integration: okr-performance (AC-10)", () => {
  test("aggregates directives + key results for a seeded domain", async () => {
    const domainId = generateId();
    const directive = await createDirective({ domain_id: domainId });
    const kr = await post("/key-results", {
      name: `perf-kr-${generateId().slice(0, 8)}`,
      description: "perf fixture",
      attributes: {
        baseline_value: 0,
        target_value: 10,
        current_value: 5,
        unit: "count",
        direction: "higher_is_better",
        progress: 50,
        status: "in_progress",
      },
    });
    const krProps = kr.body.properties;
    cleanupIds.push(krProps.id);

    const session = getDriver().session({ defaultAccessMode: "WRITE" });
    try {
      await session.run(
        `MATCH (d:OKRDirective {id: $did}), (kr:KeyResult {id: $kid})
         CREATE (d)-[:HAS_KEY_RESULT]->(kr)`,
        { did: directive.id, kid: krProps.id },
      );
    } finally {
      await session.close();
    }

    const res = await fetch(`${API_BASE}/okr-performance?domain_id=${domainId}`);
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
    const mine = rows.find((r: any) => r.directive === directive.name);
    expect(mine).toBeDefined();
    expect(mine.keyResult).toBe(krProps.name);
    expect(mine.keyResultAttrs.progress).toBe(50);
  });
});
