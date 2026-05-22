import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { v7 as uuidV7 } from "uuid";
import { NODE_LABELS, type NodeLabel } from "@companygraph/shared/schema/nodes";
import { EDGE_TYPES, EDGE_ENDPOINTS } from "@companygraph/shared/schema/edges";

// AC-13 — The 216-combination edge-validation iterator.
//
// Math:
//   6 edge types × 6 fromLabels × 6 toLabels = 216 combinations.
//   EDGE_ENDPOINTS lists 9 allowed (type, fromLabel, toLabel) triples.
//   216 − 9 = 207 negative cases (must return 400
//   edge_endpoint_label_mismatch with details.allowed populated).
//
// Strategy: seed one node per label ONCE in beforeAll, then reuse
// those 6 ids for all 216 POSTs. This drops the HTTP cost from
// 216 × (2 seed POSTs + 1 edge POST + cleanup) to 6 + 216 + cleanup.
//
// For each positive (legal) triple we DELETE the edge before the next
// triple touches the same node-pair so future positive cases on the
// same `(fromId, toId)` aren't blocked by a residual edge of the same
// type (multi-edges between the same pair are allowed in Neo4j, but
// the C-10 cross-type id check is per-id, not per-type — so duplicate
// edges with different server-generated ids are fine, we just clean
// up to keep the database tidy and keep failures readable).
//
// We use a flat loop with `test(...)` calls rather than `test.each(...)`
// because the per-case test name is more informative when one of 216
// fails: "PART_OF Domain→Domain — rejected" reads better in the
// reporter than `test.each` row indices.

const API_BASE = "http://127.0.0.1:8787/api/v1";

interface ErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

interface EdgeResponse {
  id: string;
  type: string;
  fromId: string;
  toId: string;
}

const seededNodeIds: Record<NodeLabel, string> = {} as Record<NodeLabel, string>;

const UUIDV7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isAllowedTriple(type: string, fromLabel: NodeLabel, toLabel: NodeLabel): boolean {
  const allowed = EDGE_ENDPOINTS[type as keyof typeof EDGE_ENDPOINTS];
  return allowed.some(([f, t]) => f === fromLabel && t === toLabel);
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

async function deleteEdge(id: string): Promise<void> {
  await fetch(`${API_BASE}/edges/${id}`, { method: "DELETE" });
}

beforeAll(async () => {
  for (const label of NODE_LABELS) {
    const id = uuidV7();
    const res = await fetch(`${API_BASE}/nodes/${label}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, name: `ac13-${label}` }),
    });
    if (res.status !== 201) {
      throw new Error(
        `AC-13 setup failed for label ${label}: ${res.status} ${await res.text()}`,
      );
    }
    seededNodeIds[label] = id;
  }
});

afterAll(async () => {
  // Cascade-delete each seed node, taking any orphan edges with it.
  for (const label of NODE_LABELS) {
    const id = seededNodeIds[label];
    if (id) {
      await fetch(`${API_BASE}/nodes/${label}/${id}?cascade=true`, { method: "DELETE" });
    }
  }
});

describe("AC-13 — 216-combination edge-validation iterator", () => {
  let positiveCount = 0;
  let negativeCount = 0;

  for (const type of EDGE_TYPES) {
    for (const fromLabel of NODE_LABELS) {
      for (const toLabel of NODE_LABELS) {
        const allowed = isAllowedTriple(type, fromLabel, toLabel);
        if (allowed) positiveCount += 1;
        else negativeCount += 1;

        const verdict = allowed ? "accepted" : "rejected";
        test(`${type} ${fromLabel}->${toLabel} — ${verdict}`, async () => {
          const fromId = seededNodeIds[fromLabel];
          const toId = seededNodeIds[toLabel];
          const res = await postEdge({ type, fromId, toId });

          if (allowed) {
            expect(res.status).toBe(201);
            const edge = res.body as EdgeResponse;
            expect(edge.type).toBe(type);
            expect(edge.fromId).toBe(fromId);
            expect(edge.toId).toBe(toId);
            expect(UUIDV7_RE.test(edge.id)).toBe(true);
            // Cleanup so the next legal POST onto the same pair stays
            // isolated. Cascade on node afterAll catches anything missed.
            await deleteEdge(edge.id);
          } else {
            expect(res.status).toBe(400);
            const env = res.body as ErrorEnvelope;
            expect(env.error.code).toBe("edge_endpoint_label_mismatch");
            // details.allowed must be populated and non-empty.
            const allowedDetail = env.error.details?.allowed as
              | Array<{ from: string; to: string }>
              | undefined;
            expect(Array.isArray(allowedDetail)).toBe(true);
            expect(allowedDetail!.length).toBeGreaterThan(0);
            // Every entry in details.allowed must agree with EDGE_ENDPOINTS.
            const canon = EDGE_ENDPOINTS[type].map(([f, t]) => `${f}->${t}`).sort();
            const got = allowedDetail!.map((e) => `${e.from}->${e.to}`).sort();
            expect(got).toEqual(canon);
          }
        });
      }
    }
  }

  // Belt-and-braces — the math better add up.
  test("iterator covers 9 positive + 207 negative = 216 combinations", () => {
    expect(positiveCount).toBe(9);
    expect(negativeCount).toBe(207);
    expect(positiveCount + negativeCount).toBe(216);
  });
});
