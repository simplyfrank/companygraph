import { afterAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { scopedNodeIds } from "../src/storage/model-scope";

// model-workspace-core T-05 + T-10 / AC-03 — Model CRUD round-trip,
// ordinal allocation, archive, cascade delete, reference protection,
// domain attach (B-02), and the generic-route lifecycle guard.

const API_BASE = "http://127.0.0.1:8787/api/v1";
const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface ModelRes {
  id: string;
  name: string;
  description: string;
  ordinal: number;
  status: string;
  isReference: boolean;
  moduleInstanceCount: number;
  attributes: Record<string, unknown>;
}
interface ErrRes {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

const createdModelIds: string[] = [];

async function post<T>(path: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

async function createModel(name: string): Promise<ModelRes> {
  const { status, body } = await post<ModelRes>("/models", { name });
  expect(status).toBe(201);
  createdModelIds.push(body.id);
  return body;
}

describe("integration: model-workspace-core AC-03 model CRUD", () => {
  afterAll(async () => {
    for (const id of createdModelIds) {
      await fetch(`${API_BASE}/models/${id}`, { method: "DELETE" });
    }
    await closeDriver();
    _resetDriver();
  });

  test("create → 201 with server UUIDv7 id + unique max+1 ordinal + defaults", async () => {
    const a = await createModel("crud-model-a");
    const b = await createModel("crud-model-b");
    expect(a.id).toMatch(UUIDV7);
    expect(a.status).toBe("active");
    expect(a.isReference).toBe(false);
    expect(a.moduleInstanceCount).toBe(0);
    expect(b.ordinal).toBe(a.ordinal + 1);
  });

  test("list is ordered by ordinal ASC and carries moduleInstanceCount", async () => {
    const res = await fetch(`${API_BASE}/models`);
    expect(res.status).toBe(200);
    const models = (await res.json()) as ModelRes[];
    expect(models.length).toBeGreaterThanOrEqual(2);
    const ordinals = models.map((m) => m.ordinal);
    expect([...ordinals].sort((x, y) => x - y)).toEqual(ordinals);
    for (const m of models) expect(typeof m.moduleInstanceCount).toBe("number");
  });

  test("PATCH preserves omitted fields", async () => {
    const m = await createModel("crud-model-patch");
    const res = await fetch(`${API_BASE}/models/${m.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "patched" }),
    });
    expect(res.status).toBe(200);
    const patched = (await res.json()) as ModelRes;
    expect(patched.description).toBe("patched");
    expect(patched.name).toBe("crud-model-patch"); // omitted → untouched
    expect(patched.ordinal).toBe(m.ordinal);
  });

  test("archive sets status archived and retains the subgraph", async () => {
    const m = await createModel("crud-model-archive");
    const dom = await post<{ id: string }>(`/models/${m.id}/domains`, { name: "archive-dom" });
    expect(dom.status).toBe(201);
    const res = await fetch(`${API_BASE}/models/${m.id}/archive`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as ModelRes).status).toBe("archived");
    // Subgraph retained: the domain still exists.
    const domRes = await fetch(`${API_BASE}/nodes/Domain/${dom.body.id}`);
    expect(domRes.status).toBe(200);
  });

  test("attachDomain creates Domain + IN_MODEL in one tx; domain appears in scopedNodeIds (B-02)", async () => {
    const m = await createModel("crud-model-domains");
    const { status, body } = await post<{ id: string; label: string }>(
      `/models/${m.id}/domains`,
      { name: "attached-dom", description: "d" },
    );
    expect(status).toBe(201);
    expect(body.id).toMatch(UUIDV7);
    const scope = await scopedNodeIds(getDriver(), m.id);
    expect(scope.has(body.id)).toBe(true);
  });

  test("attachDomain on an absent model → 404 model_not_found (B-02)", async () => {
    const { status, body } = await post<ErrRes>(
      `/models/01900000-0000-7000-8000-00000000dead/domains`,
      { name: "orphan-dom" },
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("model_not_found");
  });

  test("DELETE non-reference → 204; scoped subgraph gone", async () => {
    const m = await createModel("crud-model-delete");
    const dom = await post<{ id: string }>(`/models/${m.id}/domains`, { name: "doomed-dom" });
    const del = await fetch(`${API_BASE}/models/${m.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    const gone = await fetch(`${API_BASE}/models/${m.id}`);
    expect(gone.status).toBe(404);
    const domGone = await fetch(`${API_BASE}/nodes/Domain/${dom.body.id}`);
    expect(domGone.status).toBe(404);
  });

  test("DELETE the reference model → 409 model_reference_immutable", async () => {
    const list = await fetch(`${API_BASE}/models`);
    const models = (await list.json()) as ModelRes[];
    const ref = models.find((m) => m.isReference);
    expect(ref).toBeDefined(); // migrate:model has run
    const del = await fetch(`${API_BASE}/models/${ref!.id}`, { method: "DELETE" });
    expect(del.status).toBe(409);
    expect(((await del.json()) as ErrRes).error.code).toBe("model_reference_immutable");
  });

  test("generic DELETE /nodes/BusinessModel/:id → 409 model_lifecycle_route_required (T-10 / AC-03)", async () => {
    const m = await createModel("crud-model-guard");
    const del = await fetch(`${API_BASE}/nodes/BusinessModel/${m.id}`, { method: "DELETE" });
    expect(del.status).toBe(409);
    expect(((await del.json()) as ErrRes).error.code).toBe("model_lifecycle_route_required");
    // Generic POST + PATCH are guarded too.
    const postRes = await post<ErrRes>("/nodes/BusinessModel", { name: "smuggled" });
    expect(postRes.status).toBe(409);
    expect(postRes.body.error.code).toBe("model_lifecycle_route_required");
  });
});
