import { describe, test, expect } from "bun:test";
import { v7 as uuidV7 } from "uuid";
import { EDGE_TYPES, EDGE_ENDPOINTS } from "@companygraph/shared/schema/edges";

// AC-06 — Round-trip CRUD per edge type.
//
// For each of the 6 edge types, pick the first allowed (fromLabel,
// toLabel) pair from EDGE_ENDPOINTS, seed two nodes of those labels,
// then POST → assert response shape → DELETE → 204.
//
// Then a battery of negative cases:
//   - Unknown `type` value → 400 (invalid_payload because the schema
//     uses z.enum(EDGE_TYPES); the ERROR_CODES enum also contains
//     `unknown_type` for storage-layer use, so the assertion accepts
//     either code).
//   - Missing `fromId` → 400 invalid_payload (Zod).
//   - Dangling endpoint id → 400 edge_endpoint_missing.
//
// Then the C-10 cross-type id-collision fixture:
//   - POST EXECUTES with id=X → 201
//   - POST USES_SYSTEM with id=X → 409 id_conflict (rejected at create
//     time by the validator's EXISTS-across-all-types check).

const API_BASE = "http://127.0.0.1:8787/api/v1";

interface ErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

interface NodeResponse {
  id: string;
  label: string;
  name: string;
}

interface EdgeResponse {
  id: string;
  type: string;
  fromId: string;
  toId: string;
  createdAt: string;
  attributes: Record<string, unknown>;
}

async function postNode(label: string, body: Record<string, unknown>): Promise<NodeResponse> {
  const res = await fetch(`${API_BASE}/nodes/${label}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) {
    throw new Error(`seed POST ${label} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as NodeResponse;
}

async function deleteNode(label: string, id: string): Promise<void> {
  await fetch(`${API_BASE}/nodes/${label}/${id}?cascade=true`, { method: "DELETE" });
}

async function postEdge(
  body: Record<string, unknown>,
): Promise<{ status: number; body: EdgeResponse | ErrorEnvelope }> {
  const res = await fetch(`${API_BASE}/edges`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as EdgeResponse | ErrorEnvelope };
}

async function deleteEdge(id: string): Promise<number> {
  const res = await fetch(`${API_BASE}/edges/${id}`, { method: "DELETE" });
  return res.status;
}

const UUIDV7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("AC-06 — edges CRUD per type", () => {
  for (const type of EDGE_TYPES) {
    test(`${type} — POST + DELETE round-trip`, async () => {
      const pair = EDGE_ENDPOINTS[type][0]!;
      const [fromLabel, toLabel] = pair;

      const fromId = uuidV7();
      const toId = uuidV7();
      await postNode(fromLabel, { id: fromId, name: `from-${type}` });
      // For self-pair types (PRECEDES Activity→Activity, INTEGRATES_WITH
      // System→System, PART_OF Location→Location) the from/to labels
      // match but the ids differ, so we still create two distinct nodes.
      await postNode(toLabel, { id: toId, name: `to-${type}` });

      try {
        const created = await postEdge({
          type,
          fromId,
          toId,
          attributes: { weight: 1 },
        });
        expect(created.status).toBe(201);
        const edge = created.body as EdgeResponse;
        expect(edge.type).toBe(type);
        expect(edge.fromId).toBe(fromId);
        expect(edge.toId).toBe(toId);
        expect(UUIDV7_RE.test(edge.id)).toBe(true);
        expect(edge.attributes).toEqual({ weight: 1 });
        expect(typeof edge.createdAt).toBe("string");

        const delStatus = await deleteEdge(edge.id);
        expect(delStatus).toBe(204);

        // Second DELETE → 404.
        const delAgain = await deleteEdge(edge.id);
        expect(delAgain).toBe(404);
      } finally {
        await deleteNode(fromLabel, fromId);
        await deleteNode(toLabel, toId);
      }
    });
  }

  describe("reject cases", () => {
    test("unknown type value → 400 (invalid_payload or unknown_type)", async () => {
      // Seed two nodes that would form a legal Role→Activity EXECUTES
      // edge if the type were valid — that way only the type field is
      // wrong.
      const fromId = uuidV7();
      const toId = uuidV7();
      await postNode("Role", { id: fromId, name: "role-fixture" });
      await postNode("Activity", { id: toId, name: "act-fixture" });

      try {
        const res = await postEdge({ type: "NOT_A_TYPE", fromId, toId });
        expect(res.status).toBe(400);
        const code = (res.body as ErrorEnvelope).error.code;
        // The Zod enum rejects this with invalid_payload; the storage
        // layer never sees it. Either code is acceptable per the task
        // spec ("if that's the actual code; otherwise invalid_payload").
        expect(["invalid_payload", "unknown_type"]).toContain(code);
      } finally {
        await deleteNode("Role", fromId);
        await deleteNode("Activity", toId);
      }
    });

    test("missing fromId → 400 invalid_payload", async () => {
      const toId = uuidV7();
      await postNode("Activity", { id: toId, name: "act" });

      try {
        const res = await postEdge({ type: "EXECUTES", toId });
        expect(res.status).toBe(400);
        expect((res.body as ErrorEnvelope).error.code).toBe("invalid_payload");
      } finally {
        await deleteNode("Activity", toId);
      }
    });

    test("dangling endpoint id → 400 edge_endpoint_missing", async () => {
      const fromId = uuidV7();
      const ghostToId = uuidV7();
      await postNode("Role", { id: fromId, name: "role" });

      try {
        const res = await postEdge({ type: "EXECUTES", fromId, toId: ghostToId });
        expect(res.status).toBe(400);
        const env = res.body as ErrorEnvelope;
        expect(env.error.code).toBe("edge_endpoint_missing");
        expect(env.error.details?.side).toBe("toId");
      } finally {
        await deleteNode("Role", fromId);
      }
    });
  });

  describe("C-10 — cross-type edge id collision rejected at create time", () => {
    test("EXECUTES with id=X then USES_SYSTEM with id=X → 409 id_conflict", async () => {
      // For the EXECUTES edge: Role → Activity.
      // For the USES_SYSTEM edge: Activity → System.
      // Use a shared Activity so we exercise different from-labels.
      const roleId = uuidV7();
      const activityId = uuidV7();
      const systemId = uuidV7();
      const sharedEdgeId = uuidV7();

      await postNode("Role", { id: roleId, name: "c10-role" });
      await postNode("Activity", { id: activityId, name: "c10-activity" });
      await postNode("System", { id: systemId, name: "c10-system" });

      try {
        const first = await postEdge({
          id: sharedEdgeId,
          type: "EXECUTES",
          fromId: roleId,
          toId: activityId,
        });
        expect(first.status).toBe(201);
        expect((first.body as EdgeResponse).id).toBe(sharedEdgeId);

        const second = await postEdge({
          id: sharedEdgeId,
          type: "USES_SYSTEM",
          fromId: activityId,
          toId: systemId,
        });
        expect(second.status).toBe(409);
        const env = second.body as ErrorEnvelope;
        expect(env.error.code).toBe("id_conflict");
        expect(env.error.details?.id).toBe(sharedEdgeId);

        // Cleanup the surviving first edge.
        await deleteEdge(sharedEdgeId);
      } finally {
        await deleteNode("Role", roleId);
        await deleteNode("Activity", activityId);
        await deleteNode("System", systemId);
      }
    });
  });
});
