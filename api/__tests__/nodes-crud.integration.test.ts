import { describe, test, expect } from "bun:test";
import { v7 as uuidV7 } from "uuid";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";

// AC-05 — Round-trip CRUD per node label.
//
// Talks to the running API server at http://127.0.0.1:8787. Each test
// generates fresh UUIDv7s so reruns never collide with leftover data;
// every successful POST is paired with a best-effort DELETE so the
// graph is left clean between cases.
//
// Sub-cases (per row of NODE_LABELS):
//   1. POST → GET → assert echo
//   2. PATCH description-only — name + attributes untouched (pass-1 B-01)
//   3. PATCH attributes-only — name + description untouched (pass-1 B-01)
//   4. PATCH empty body {} — 200 + updatedAt bumps only (C-08 pin)
//   5. DELETE → GET-404
//   6. POST duplicate id → 409 id_conflict
//   7. DELETE non-existent → 404 not_found
//
// Separate cases (route-level guards):
//   - Unknown label in URL → 400 unknown_label
//   - Malformed UUIDv7 in URL → 400 invalid_payload

const API_BASE = "http://127.0.0.1:8787/api/v1";

interface ErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

interface NodeResponse {
  id: string;
  label: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
}

async function postNode(
  label: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: NodeResponse | ErrorEnvelope }> {
  const res = await fetch(`${API_BASE}/nodes/${label}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as NodeResponse | ErrorEnvelope };
}

async function getNode(
  label: string,
  id: string,
): Promise<{ status: number; body: NodeResponse | ErrorEnvelope }> {
  const res = await fetch(`${API_BASE}/nodes/${label}/${id}`);
  return { status: res.status, body: (await res.json()) as NodeResponse | ErrorEnvelope };
}

async function patchNode(
  label: string,
  id: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: NodeResponse | ErrorEnvelope }> {
  const res = await fetch(`${API_BASE}/nodes/${label}/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as NodeResponse | ErrorEnvelope };
}

async function deleteNode(
  label: string,
  id: string,
): Promise<{ status: number; body: ErrorEnvelope | null }> {
  const res = await fetch(`${API_BASE}/nodes/${label}/${id}`, { method: "DELETE" });
  const text = await res.text();
  return {
    status: res.status,
    body: text ? (JSON.parse(text) as ErrorEnvelope) : null,
  };
}

describe("AC-05 — nodes CRUD per label", () => {
  for (const label of NODE_LABELS) {
    describe(label, () => {
      test("POST + GET round-trips the payload", async () => {
        const id = uuidV7();
        const created = await postNode(label, {
          id,
          name: `${label}-fixture`,
          description: "round-trip",
          attributes: { tag: "create" },
        });
        expect(created.status).toBe(201);
        expect((created.body as NodeResponse).id).toBe(id);
        expect((created.body as NodeResponse).label).toBe(label);
        expect((created.body as NodeResponse).name).toBe(`${label}-fixture`);

        const fetched = await getNode(label, id);
        expect(fetched.status).toBe(200);
        expect((fetched.body as NodeResponse).id).toBe(id);
        expect((fetched.body as NodeResponse).attributes).toEqual({ tag: "create" });

        await deleteNode(label, id); // cleanup
      });

      test("PATCH description-only does not clobber name or attributes (B-01)", async () => {
        const id = uuidV7();
        await postNode(label, {
          id,
          name: "original-name",
          description: "original-desc",
          attributes: { keep: "me" },
        });

        const patched = await patchNode(label, id, { description: "updated-desc" });
        expect(patched.status).toBe(200);
        const body = patched.body as NodeResponse;
        expect(body.name).toBe("original-name");
        expect(body.description).toBe("updated-desc");
        expect(body.attributes).toEqual({ keep: "me" });

        await deleteNode(label, id);
      });

      test("PATCH attributes-only does not clobber name or description (B-01)", async () => {
        const id = uuidV7();
        await postNode(label, {
          id,
          name: "stable-name",
          description: "stable-desc",
          attributes: { v: 1 },
        });

        const patched = await patchNode(label, id, { attributes: { v: 2, extra: true } });
        expect(patched.status).toBe(200);
        const body = patched.body as NodeResponse;
        expect(body.name).toBe("stable-name");
        expect(body.description).toBe("stable-desc");
        expect(body.attributes).toEqual({ v: 2, extra: true });

        await deleteNode(label, id);
      });

      test("PATCH empty body {} returns 200 and only bumps updatedAt (C-08 pin)", async () => {
        const id = uuidV7();
        const created = await postNode(label, {
          id,
          name: "c08-name",
          description: "c08-desc",
          attributes: { c08: true },
        });
        const before = created.body as NodeResponse;

        // Sleep 5ms so the ISO timestamp can actually differ.
        await new Promise((r) => setTimeout(r, 5));

        const patched = await patchNode(label, id, {});
        expect(patched.status).toBe(200);
        const after = patched.body as NodeResponse;

        // Fields unchanged.
        expect(after.name).toBe(before.name);
        expect(after.description).toBe(before.description);
        expect(after.attributes).toEqual(before.attributes);
        expect(after.createdAt).toBe(before.createdAt);
        // updatedAt was touched.
        expect(after.updatedAt >= before.updatedAt).toBe(true);

        await deleteNode(label, id);
      });

      test("DELETE then GET → 404 not_found", async () => {
        const id = uuidV7();
        await postNode(label, { id, name: "to-delete" });

        const del = await deleteNode(label, id);
        expect(del.status).toBe(204);

        const fetched = await getNode(label, id);
        expect(fetched.status).toBe(404);
        expect((fetched.body as ErrorEnvelope).error.code).toBe("not_found");
      });

      test("POST duplicate client-supplied id → 409 id_conflict", async () => {
        const id = uuidV7();
        const first = await postNode(label, { id, name: "first" });
        expect(first.status).toBe(201);

        const second = await postNode(label, { id, name: "second" });
        expect(second.status).toBe(409);
        expect((second.body as ErrorEnvelope).error.code).toBe("id_conflict");

        await deleteNode(label, id);
      });

      test("DELETE non-existent id → 404 not_found", async () => {
        const ghost = uuidV7();
        const del = await deleteNode(label, ghost);
        expect(del.status).toBe(404);
        expect((del.body as ErrorEnvelope).error.code).toBe("not_found");
      });
    });
  }

  describe("route-level guards", () => {
    test("unknown label in URL → 400 unknown_label", async () => {
      const id = uuidV7();
      const res = await fetch(`${API_BASE}/nodes/NotALabel/${id}`);
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.error.code).toBe("unknown_label");
    });

    test("POST to unknown label → 400 unknown_label", async () => {
      const res = await fetch(`${API_BASE}/nodes/Hacker`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.error.code).toBe("unknown_label");
    });

    test("malformed (non-UUIDv7) id in URL → 400 invalid_payload", async () => {
      const res = await fetch(`${API_BASE}/nodes/Domain/not-a-uuid`);
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.error.code).toBe("invalid_payload");
    });

    test("PATCH with malformed id in URL → 400 invalid_payload", async () => {
      const res = await fetch(`${API_BASE}/nodes/Domain/12345`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.error.code).toBe("invalid_payload");
    });
  });
});
