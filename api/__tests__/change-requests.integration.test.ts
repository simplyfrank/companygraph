import { afterAll, describe, expect, test } from "bun:test";
import { query } from "../src/storage/postgres/client";
import { UUIDV7_REGEX } from "../src/ids";

// risk-compliance-change T-03 — pins the AS-BUILT change-requests
// contract (FR-04/05) against a live Postgres, plus the sanctioned
// fixes: the shared `parseWith` 400 channel (FR-09, AC-11), the UUIDv7
// id switch (FR-10, AC-12), and the FR-11 transition guard (AC-08).
// Verify-then-fix: as-built pins hold both before and after the fixes.
//
// Store of record: Postgres `change_requests` / `reviews` / `sign_offs`
// (migration 001). Cleanup deletes tracked CR ids — the FK ON DELETE
// CASCADE removes their reviews + sign-offs (order-independent — AC-15).

const API_BASE = "http://127.0.0.1:8787/api/v1";
const createdIds: string[] = [];
const RUN = Date.now().toString(36);
const SEED_AUTHOR = `author-${RUN}`;

async function createCr(overrides: Record<string, unknown> = {}): Promise<Response> {
  return fetch(`${API_BASE}/change-requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: `cr-${RUN}`,
      description: "desc",
      author: SEED_AUTHOR,
      draftSnapshot: { nodes: [{ id: "n1" }] },
      baseSnapshot: { nodes: [] },
      diff: { added: 1 },
      ...overrides,
    }),
  });
}

afterAll(async () => {
  if (createdIds.length > 0) {
    await query("DELETE FROM change_requests WHERE id = ANY($1)", [createdIds]);
  }
});

describe("integration: change-requests CRUD + JSONB round-trip (AC-05)", () => {
  test("create forces draft, defaults dependency_impacts to []; snapshots persist", async () => {
    const res = await createCr();
    expect(res.status).toBe(201);
    const cr = await res.json();
    createdIds.push(cr.id);
    expect(cr.status).toBe("draft");
    // dependencyImpacts omitted → column default []
    expect(Array.isArray(cr.dependency_impacts)).toBe(true);
    expect(cr.dependency_impacts.length).toBe(0);
    // JSONB round-trip
    expect(cr.draft_snapshot).toEqual({ nodes: [{ id: "n1" }] });
    expect(cr.base_snapshot).toEqual({ nodes: [] });
    expect(cr.diff).toEqual({ added: 1 });
  });

  test("get one → {...cr, reviews, signOffs}; unknown → 404; delete cascades", async () => {
    const cr = await (await createCr()).json();
    createdIds.push(cr.id);

    const g = await fetch(`${API_BASE}/change-requests/${cr.id}`);
    expect(g.status).toBe(200);
    const got = await g.json();
    expect(got.id).toBe(cr.id);
    expect(Array.isArray(got.reviews)).toBe(true);
    expect(Array.isArray(got.signOffs)).toBe(true);

    // add a review + sign-off, then delete and confirm cascade
    await fetch(`${API_BASE}/change-requests/${cr.id}/reviews`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ reviewer: "r", reviewerRole: "technical_lead", status: "approved", comment: "ok" }),
    });
    await fetch(`${API_BASE}/change-requests/${cr.id}/sign-offs`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ signer: "s", signerRole: "entity_manager", status: "signed" }),
    });

    const del = await fetch(`${API_BASE}/change-requests/${cr.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    createdIds.splice(createdIds.indexOf(cr.id), 1); // already gone

    const revs = await query("SELECT * FROM reviews WHERE change_request_id = $1", [cr.id]);
    const sos = await query("SELECT * FROM sign_offs WHERE change_request_id = $1", [cr.id]);
    expect(revs.length).toBe(0);
    expect(sos.length).toBe(0);

    const unknown = await fetch(`${API_BASE}/change-requests/00000000-0000-7000-8000-000000000000`);
    expect(unknown.status).toBe(404);
  });

  test("empty PATCH → 400 bad_request (as-built code, kept — AC-11 carve-out)", async () => {
    const cr = await (await createCr()).json();
    createdIds.push(cr.id);
    const p = await fetch(`${API_BASE}/change-requests/${cr.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
    });
    expect(p.status).toBe(400);
    const env = await p.json();
    expect(env.error.code).toBe("bad_request");
    expect(env.error.message).toContain("No valid fields to update");
  });
});

describe("integration: change-requests list (AC-06)", () => {
  test("{data,limit,offset}; status/author filters; nested arrays", async () => {
    const cr = await (await createCr()).json();
    createdIds.push(cr.id);

    const res = await fetch(`${API_BASE}/change-requests?author=${SEED_AUTHOR}&limit=10&offset=0`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(0);
    expect(body.data.every((c: any) => c.author === SEED_AUTHOR)).toBe(true);
    const row = body.data.find((c: any) => c.id === cr.id);
    expect(row).toBeDefined();
    expect(Array.isArray(row.reviews)).toBe(true);
    expect(Array.isArray(row.signOffs)).toBe(true);

    // status filter
    const draftList = await (
      await fetch(`${API_BASE}/change-requests?author=${SEED_AUTHOR}&status=draft`)
    ).json();
    expect(draftList.data.every((c: any) => c.status === "draft")).toBe(true);
  });
});

describe("integration: reviews + sign-offs (AC-07)", () => {
  test("review create 201; enums enforced; 404 on unknown parent", async () => {
    const cr = await (await createCr()).json();
    createdIds.push(cr.id);

    const good = await fetch(`${API_BASE}/change-requests/${cr.id}/reviews`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ reviewer: "r", reviewerRole: "domain_manager", status: "changes_requested", comment: "please fix" }),
    });
    expect(good.status).toBe(201);

    const badEnum = await fetch(`${API_BASE}/change-requests/${cr.id}/reviews`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ reviewer: "r", reviewerRole: "domain_manager", status: "pending", comment: "x" }),
    });
    expect(badEnum.status).toBe(400);
    expect((await badEnum.json()).error.code).toBe("invalid_payload");

    const orphan = await fetch(`${API_BASE}/change-requests/00000000-0000-7000-8000-000000000000/reviews`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ reviewer: "r", reviewerRole: "domain_manager", status: "approved", comment: "x" }),
    });
    expect(orphan.status).toBe(404);
  });

  test("sign-off: signed_at set iff status=signed; 404 on unknown parent", async () => {
    const cr = await (await createCr()).json();
    createdIds.push(cr.id);

    const signed = await (await fetch(`${API_BASE}/change-requests/${cr.id}/sign-offs`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ signer: "s", signerRole: "entity_manager", status: "signed" }),
    })).json();
    expect(signed.signed_at).not.toBeNull();

    const declined = await (await fetch(`${API_BASE}/change-requests/${cr.id}/sign-offs`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ signer: "s", signerRole: "domain_manager", status: "declined" }),
    })).json();
    expect(declined.signed_at).toBeNull();

    const orphan = await fetch(`${API_BASE}/change-requests/00000000-0000-7000-8000-000000000000/sign-offs`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ signer: "s", signerRole: "entity_manager", status: "signed" }),
    });
    expect(orphan.status).toBe(404);
  });
});

describe("integration: change-request transition guard (AC-08, FR-11)", () => {
  test("allowed draft→pending_review succeeds; draft→released → 400 invalid_transition", async () => {
    const cr = await (await createCr()).json();
    createdIds.push(cr.id);

    // disallowed jump
    const jump = await fetch(`${API_BASE}/change-requests/${cr.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "released" }),
    });
    expect(jump.status).toBe(400);
    const env = await jump.json();
    expect(env.error.code).toBe("invalid_transition");
    expect(env.error.details.from).toBe("draft");
    expect(env.error.details.to).toBe("released");

    // allowed transition
    const ok = await fetch(`${API_BASE}/change-requests/${cr.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "pending_review" }),
    });
    expect(ok.status).toBe(200);
    expect((await ok.json()).status).toBe("pending_review");
  });

  test("identity status patch + non-status patch always succeed", async () => {
    const cr = await (await createCr()).json();
    createdIds.push(cr.id);

    // identity (draft→draft)
    const ident = await fetch(`${API_BASE}/change-requests/${cr.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "draft" }),
    });
    expect(ident.status).toBe(200);

    // non-status patch
    const nonStatus = await fetch(`${API_BASE}/change-requests/${cr.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: `retitled-${RUN}` }),
    });
    expect(nonStatus.status).toBe(200);
    expect((await nonStatus.json()).title).toBe(`retitled-${RUN}`);
  });
});

describe("integration: change-requests zod → 400 issues[] (AC-11) + UUIDv7 (AC-12)", () => {
  test("malformed create/review/sign-off → 400 invalid_payload issues[]", async () => {
    const badCreate = await fetch(`${API_BASE}/change-requests`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "", description: "d", author: "a", draftSnapshot: {}, baseSnapshot: {}, diff: {} }),
    });
    expect(badCreate.status).toBe(400);
    const env = await badCreate.json();
    expect(env.error.code).toBe("invalid_payload");
    expect(Array.isArray(env.error.details.issues)).toBe(true);
  });

  test("created CR / review / sign-off ids are UUIDv7", async () => {
    const cr = await (await createCr()).json();
    createdIds.push(cr.id);
    expect(UUIDV7_REGEX.test(cr.id)).toBe(true);

    const rev = await (await fetch(`${API_BASE}/change-requests/${cr.id}/reviews`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ reviewer: "r", reviewerRole: "technical_lead", status: "approved", comment: "ok" }),
    })).json();
    expect(UUIDV7_REGEX.test(rev.id)).toBe(true);

    const so = await (await fetch(`${API_BASE}/change-requests/${cr.id}/sign-offs`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ signer: "s", signerRole: "entity_manager", status: "signed" }),
    })).json();
    expect(UUIDV7_REGEX.test(so.id)).toBe(true);
  });
});
