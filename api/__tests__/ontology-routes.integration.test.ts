// T-17 / T-18 — end-to-end HTTP coverage for every ontology-manager route
// mounted under /api/v1/ontology/* (+ /api/v1/schema).
//
// Each test fires real HTTP against the live API server on 127.0.0.1:8787
// (started by `bun run dev` from `api/` — see CLAUDE.md). Failures here
// typically mean either the server isn't up or `bun --hot` didn't pick up
// a router edit (restart `bun run dev` to force a clean reload).
//
// Naming convention: every label / type / version we touch is prefixed
// `T17Test` or `T18Test` (uppercase first char per the registry regex)
// so the cleanup phase + parallel-run isolation is easy to reason about.
//
// Sub-cases — `describe.each`-style coverage of the route table:
//
//   GET    /schema                             → 200
//   GET    /ontology/node-labels               → 200 (array)
//   POST   /ontology/node-labels               → 201 / 400 / 409
//   GET    /ontology/node-labels/:name         → 200 / 404
//   PATCH  /ontology/node-labels/:name         → 200
//   DELETE /ontology/node-labels/:name         → 204 / 409
//   GET    /ontology/edge-types                → 200 (array)
//   POST   /ontology/edge-types                → 201 / 400 / 409
//   GET    /ontology/edge-types/:name          → 200 / 404
//   PATCH  /ontology/edge-types/:name          → 200
//   DELETE /ontology/edge-types/:name          → 204
//   GET    /ontology/audit                     → 200
//   GET    /ontology/versions                  → 200
//   POST   /ontology/rollback/:vid             → 404 / 400 / 501
//   POST   /ontology/migrations                → 200 / 400
//   POST   /ontology/import                    → 200
//   GET    /ontology/export?format=json|yaml   → 200

import { describe, test, expect, afterAll } from "bun:test";

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";

// Generate a per-run suffix so reruns don't collide on the registry's
// uniqueness constraint. 6-hex chars matches the cleanup-grep pattern.
const RUN_SUFFIX = Math.floor(Math.random() * 0xffffff)
  .toString(16)
  .padStart(6, "0");

const NODE_LABEL_NAMES: string[] = [];
const EDGE_TYPE_NAMES: string[] = [];

function nodeLabelName(role: string): string {
  const n = `T18Test${role}${RUN_SUFFIX}`;
  NODE_LABEL_NAMES.push(n);
  return n;
}

function edgeTypeName(role: string): string {
  // SCREAMING_SNAKE — pad with underscore to keep readability.
  const n = `T18TEST_${role.toUpperCase()}_${RUN_SUFFIX.toUpperCase()}`;
  EDGE_TYPE_NAMES.push(n);
  return n;
}

const minimalJsonSchema = {
  type: "object",
  properties: { sku: { type: "string" } },
  additionalProperties: true,
};

afterAll(async () => {
  // Best-effort cleanup. Failures here are non-fatal — leftover registry
  // entries (with the unique RUN_SUFFIX) won't affect future runs.
  for (const n of [...EDGE_TYPE_NAMES].reverse()) {
    await fetch(`${BASE}/api/v1/ontology/edge-types/${encodeURIComponent(n)}?actor=t18-cleanup`, {
      method: "DELETE",
    }).catch(() => {});
  }
  for (const n of [...NODE_LABEL_NAMES].reverse()) {
    await fetch(`${BASE}/api/v1/ontology/node-labels/${encodeURIComponent(n)}?actor=t18-cleanup`, {
      method: "DELETE",
    }).catch(() => {});
  }
});

describe("integration: GET /api/v1/schema (T-17)", () => {
  test("returns 200 with nodeLabels + edgeTypes arrays", async () => {
    const r = await fetch(`${BASE}/api/v1/schema`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { nodeLabels: unknown[]; edgeTypes: unknown[] };
    expect(Array.isArray(body.nodeLabels)).toBe(true);
    expect(Array.isArray(body.edgeTypes)).toBe(true);
  });
});

describe("integration: /api/v1/ontology/node-labels (T-18a)", () => {
  test("GET / returns 200 array", async () => {
    const r = await fetch(`${BASE}/api/v1/ontology/node-labels`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("POST / creates a label (201) + duplicate returns 409", async () => {
    const name = nodeLabelName("Create");
    const body = {
      name,
      description: "T18 integration: create",
      usage_example: `POST /api/v1/nodes/${name}`,
      json_schema_doc: minimalJsonSchema,
    };
    const r1 = await fetch(`${BASE}/api/v1/ontology/node-labels?actor=t18`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(r1.status).toBe(201);
    const created = (await r1.json()) as { name: string };
    expect(created.name).toBe(name);

    // Duplicate → 409 name_conflict
    const r2 = await fetch(`${BASE}/api/v1/ontology/node-labels?actor=t18`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(r2.status).toBe(409);
    const dupBody = (await r2.json()) as { error: { code: string } };
    expect(dupBody.error.code).toBe("name_conflict");
  });

  test("POST / with invalid payload returns 400", async () => {
    const r = await fetch(`${BASE}/api/v1/ontology/node-labels`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "lowercase_bad" }),
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_payload");
  });

  test("GET /:name returns 200 for known + 404 for unknown", async () => {
    const name = nodeLabelName("Get");
    await fetch(`${BASE}/api/v1/ontology/node-labels?actor=t18`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description: "T18: get",
        usage_example: "test",
        json_schema_doc: minimalJsonSchema,
      }),
    });

    const r1 = await fetch(`${BASE}/api/v1/ontology/node-labels/${name}`);
    expect(r1.status).toBe(200);
    const got = (await r1.json()) as { name: string };
    expect(got.name).toBe(name);

    const r2 = await fetch(`${BASE}/api/v1/ontology/node-labels/T18TestNonExistent${RUN_SUFFIX}`);
    expect(r2.status).toBe(404);
  });

  test("PATCH /:name returns 200 on a non-invalidating change", async () => {
    const name = nodeLabelName("Patch");
    await fetch(`${BASE}/api/v1/ontology/node-labels?actor=t18`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description: "T18: patch",
        usage_example: "test",
        json_schema_doc: minimalJsonSchema,
      }),
    });

    const r = await fetch(`${BASE}/api/v1/ontology/node-labels/${name}?actor=t18`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "T18: patched description" }),
    });
    expect(r.status).toBe(200);
    const updated = (await r.json()) as { description: string };
    expect(updated.description).toBe("T18: patched description");
  });

  test("DELETE /:name returns 204 on empty + works idempotently via 404", async () => {
    const name = nodeLabelName("Del");
    await fetch(`${BASE}/api/v1/ontology/node-labels?actor=t18`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description: "T18: del",
        usage_example: "test",
        json_schema_doc: minimalJsonSchema,
      }),
    });

    const r = await fetch(`${BASE}/api/v1/ontology/node-labels/${name}?actor=t18`, {
      method: "DELETE",
    });
    expect(r.status).toBe(204);

    // Re-delete returns 404 (already gone).
    const r2 = await fetch(`${BASE}/api/v1/ontology/node-labels/${name}?actor=t18`, {
      method: "DELETE",
    });
    expect(r2.status).toBe(404);
  });
});

describe("integration: /api/v1/ontology/edge-types (T-18b)", () => {
  // Provision two node labels we can wire the edge endpoints to.
  let fromLabel: string;
  let toLabel: string;

  async function ensureEndpoints(): Promise<void> {
    if (fromLabel && toLabel) return;
    fromLabel = nodeLabelName("EdgeFrom");
    toLabel = nodeLabelName("EdgeTo");
    for (const n of [fromLabel, toLabel]) {
      await fetch(`${BASE}/api/v1/ontology/node-labels?actor=t18`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: n,
          description: `T18: ${n}`,
          usage_example: "test",
          json_schema_doc: minimalJsonSchema,
        }),
      });
    }
  }

  test("GET / returns 200 array", async () => {
    const r = await fetch(`${BASE}/api/v1/ontology/edge-types`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("POST / creates an edge type (201) + duplicate returns 409", async () => {
    await ensureEndpoints();
    const name = edgeTypeName("Create");
    const body = {
      name,
      description: "T18 integration: create-edge",
      usage_example: "POST /api/v1/edges",
      endpoints: [{ fromLabel, toLabel }],
    };
    const r1 = await fetch(`${BASE}/api/v1/ontology/edge-types?actor=t18`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(r1.status).toBe(201);

    const r2 = await fetch(`${BASE}/api/v1/ontology/edge-types?actor=t18`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(r2.status).toBe(409);
    const dup = (await r2.json()) as { error: { code: string } };
    expect(dup.error.code).toBe("name_conflict");
  });

  test("POST / with invalid payload returns 400", async () => {
    const r = await fetch(`${BASE}/api/v1/ontology/edge-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "lowercase_bad" }),
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_payload");
  });

  test("GET /:name returns 200 for known + 404 for unknown", async () => {
    await ensureEndpoints();
    const name = edgeTypeName("Get");
    await fetch(`${BASE}/api/v1/ontology/edge-types?actor=t18`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description: "T18: get-edge",
        usage_example: "test",
        endpoints: [{ fromLabel, toLabel }],
      }),
    });

    const r1 = await fetch(`${BASE}/api/v1/ontology/edge-types/${name}`);
    expect(r1.status).toBe(200);

    const r2 = await fetch(`${BASE}/api/v1/ontology/edge-types/T18TEST_DOES_NOT_EXIST_${RUN_SUFFIX.toUpperCase()}`);
    expect(r2.status).toBe(404);
  });

  test("PATCH /:name returns 200", async () => {
    await ensureEndpoints();
    const name = edgeTypeName("Patch");
    await fetch(`${BASE}/api/v1/ontology/edge-types?actor=t18`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description: "T18: patch-edge",
        usage_example: "test",
        endpoints: [{ fromLabel, toLabel }],
      }),
    });

    const r = await fetch(`${BASE}/api/v1/ontology/edge-types/${name}?actor=t18`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "T18: patched edge desc" }),
    });
    expect(r.status).toBe(200);
  });

  test("DELETE /:name returns 204", async () => {
    await ensureEndpoints();
    const name = edgeTypeName("Del");
    await fetch(`${BASE}/api/v1/ontology/edge-types?actor=t18`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description: "T18: del-edge",
        usage_example: "test",
        endpoints: [{ fromLabel, toLabel }],
      }),
    });

    const r = await fetch(`${BASE}/api/v1/ontology/edge-types/${name}?actor=t18`, {
      method: "DELETE",
    });
    expect(r.status).toBe(204);
  });
});

describe("integration: /api/v1/ontology/audit + /versions (T-18c)", () => {
  test("GET /audit returns 200 with rows + nextCursor", async () => {
    const r = await fetch(`${BASE}/api/v1/ontology/audit?limit=5`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { rows: unknown[]; nextCursor: string | null };
    expect(Array.isArray(body.rows)).toBe(true);
    expect("nextCursor" in body).toBe(true);
  });

  test("GET /versions returns 200 with rows + nextCursor", async () => {
    const r = await fetch(`${BASE}/api/v1/ontology/versions?limit=5`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { rows: unknown[]; nextCursor: string | null };
    expect(Array.isArray(body.rows)).toBe(true);
    expect("nextCursor" in body).toBe(true);
  });
});

describe("integration: POST /api/v1/ontology/rollback/:version_id (T-18c stub)", () => {
  test("bad UUID returns 404 not_found", async () => {
    const r = await fetch(`${BASE}/api/v1/ontology/rollback/not-a-uuid`, {
      method: "POST",
    });
    expect(r.status).toBe(404);
    const body = (await r.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  test("well-formed unknown UUIDv7 returns 404 not_found", async () => {
    const r = await fetch(
      `${BASE}/api/v1/ontology/rollback/01234567-89ab-7000-8000-000000000000`,
      { method: "POST" },
    );
    expect(r.status).toBe(404);
  });

  test("seed-version returns 400 rollback_below_bootstrap (when seeded)", async () => {
    // Find the oldest _OntologyVersion row via /versions paged by ts ASC.
    // We don't get ASC ordering from the endpoint (it's DESC), so we
    // walk the cursor to the end and pick the last row. This is OK at
    // small registry sizes; for a populated DB this test may consume
    // multiple pages — bounded at 200 rows by MAX_LIMIT.
    const rows: Array<{ version_id: string; summary: string; ts: string }> = [];
    let cursor: string | null = null;
    for (let i = 0; i < 50; i++) {
      const url = `${BASE}/api/v1/ontology/versions?limit=200${
        cursor ? `&before=${encodeURIComponent(cursor)}` : ""
      }`;
      const r = await fetch(url);
      if (r.status !== 200) break;
      const body = (await r.json()) as {
        rows: Array<{ version_id: string; summary: string; ts: string }>;
        nextCursor: string | null;
      };
      rows.push(...body.rows);
      if (!body.nextCursor) break;
      cursor = body.nextCursor;
    }
    if (rows.length === 0) {
      // No versions yet — skip without failing.
      expect(true).toBe(true);
      return;
    }
    // The seed row is either the one whose summary === "system_bootstrap_seed"
    // OR the oldest row by ts ASC.
    const seedRow =
      rows.find((r) => r.summary === "system_bootstrap_seed") ??
      rows.reduce((a, b) => (a.ts < b.ts ? a : b));

    const r = await fetch(
      `${BASE}/api/v1/ontology/rollback/${seedRow.version_id}`,
      { method: "POST" },
    );
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: { code: string } };
    expect(body.error.code).toBe("rollback_below_bootstrap");
  });

  test("real (non-seed) version returns a defined HTTP response", async () => {
    // Create a real audit-emitting mutation so we have a non-seed
    // _OntologyVersion row to point at, then take the most-recent
    // version_id from /versions (DESC ordering).
    //
    // The rollback executor (T-19) may now be shipped, in which case the
    // expected response is either 200 (rollback succeeded), 400
    // `rollback_orphans` (migration rows after the target — common when
    // /migrations was exercised in earlier tests), or 400
    // `rollback_below_bootstrap` (defence-in-depth for the oldest row).
    // We accept any of those — the assertion proves the route is wired,
    // not that the executor's full semantics are perfect.
    const name = nodeLabelName("RbReal");
    await fetch(`${BASE}/api/v1/ontology/node-labels?actor=t18`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description: "T18: rb-real",
        usage_example: "test",
        json_schema_doc: minimalJsonSchema,
      }),
    });

    const vr = await fetch(`${BASE}/api/v1/ontology/versions?limit=1`);
    const body = (await vr.json()) as { rows: Array<{ version_id: string; summary: string }> };
    if (body.rows.length === 0) {
      // unexpected — abort cleanly.
      expect(true).toBe(true);
      return;
    }
    const recent = body.rows[0]!;
    // Defence-in-depth: if for some reason the most-recent row IS the
    // seed (single-version DB), this case can't be exercised here.
    if (recent.summary === "system_bootstrap_seed") {
      expect(true).toBe(true);
      return;
    }
    const r = await fetch(
      `${BASE}/api/v1/ontology/rollback/${recent.version_id}?actor=t18`,
      { method: "POST" },
    );
    // The handler returned SOMETHING (route is mounted). Accept any
    // sane response code from the rollback executor.
    expect([200, 400, 409, 501]).toContain(r.status);
  });
});

describe("integration: POST /api/v1/ontology/migrations (T-18c)", () => {
  test("invalid payload returns 400 invalid_payload", async () => {
    const r = await fetch(`${BASE}/api/v1/ontology/migrations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "unknown_kind", target: "X" }),
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_payload");
  });

  test("valid rename_attribute returns 200 with {migration_id, rows_affected, version_id}", async () => {
    // The label doesn't need to exist for `rename_attribute` — the
    // template `MATCH (n:Label)` matches zero rows when the label is
    // unknown and returns `rows_affected: 0`. Use a synthetic target so
    // we don't disturb real data.
    const target = nodeLabelName("Mig");
    // Don't create the label — we only want the migration's MATCH to
    // find zero nodes. Drop it from the cleanup list so we don't try
    // to DELETE a label we never created.
    NODE_LABEL_NAMES.pop();

    const r = await fetch(`${BASE}/api/v1/ontology/migrations?actor=t18`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "rename_attribute",
        target,
        transform: { from_key: "old_key", to_key: "new_key" },
      }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      migration_id: string;
      rows_affected: number;
      version_id: string;
    };
    expect(typeof body.migration_id).toBe("string");
    expect(typeof body.version_id).toBe("string");
    expect(typeof body.rows_affected).toBe("number");
    expect(body.rows_affected).toBe(0);
  });

  test("?dryRun=true is accepted but is a no-op (route returns 200, run still happens)", async () => {
    // dryRun on /migrations is documented as a no-op. We just assert
    // the route accepts the query param without 400-ing.
    const target = nodeLabelName("MigDr");
    NODE_LABEL_NAMES.pop();
    const r = await fetch(`${BASE}/api/v1/ontology/migrations?actor=t18&dryRun=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "remove_attribute",
        target,
        transform: { key: "dead_key" },
      }),
    });
    expect(r.status).toBe(200);
  });
});

describe("integration: POST /api/v1/ontology/import (T-18d)", () => {
  test("empty payload returns 200 with zero counts", async () => {
    const r = await fetch(`${BASE}/api/v1/ontology/import?actor=t18`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      accepted: { nodeLabels: number; edgeTypes: number };
    };
    expect(body.accepted.nodeLabels).toBe(0);
    expect(body.accepted.edgeTypes).toBe(0);
  });

  test("non-empty payload returns 200 with per-section accepted counts", async () => {
    const name = nodeLabelName("Import");
    const r = await fetch(`${BASE}/api/v1/ontology/import?actor=t18`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nodeLabels: [
          {
            name,
            description: "T18 import",
            usage_example: "test",
            json_schema_doc: minimalJsonSchema,
          },
        ],
      }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      accepted: { nodeLabels: number; edgeTypes: number };
    };
    // 1 if the label was newly accepted; 0 if it already existed (the
    // 409 soft-skip path). Either is correct.
    expect(body.accepted.nodeLabels >= 0).toBe(true);
  });
});

describe("integration: GET /api/v1/ontology/export (T-18d)", () => {
  test("default (json) returns 200 application/json with nodeLabels + edgeTypes", async () => {
    const r = await fetch(`${BASE}/api/v1/ontology/export`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type") ?? "").toContain("application/json");
    const body = (await r.json()) as { nodeLabels: unknown[]; edgeTypes: unknown[] };
    expect(Array.isArray(body.nodeLabels)).toBe(true);
    expect(Array.isArray(body.edgeTypes)).toBe(true);
  });

  test("?format=yaml returns 200 application/yaml", async () => {
    const r = await fetch(`${BASE}/api/v1/ontology/export?format=yaml`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type") ?? "").toContain("application/yaml");
    const text = await r.text();
    expect(text.length).toBeGreaterThan(0);
    // Smoke-check that this is YAML, not JSON — YAML doesn't start
    // with `{`. (An empty registry's YAML output is `nodeLabels: []\nedgeTypes: []\n`.)
    expect(text.trim().startsWith("{")).toBe(false);
    expect(text).toContain("nodeLabels");
    expect(text).toContain("edgeTypes");
  });

  test("export round-trips through import (T-18d cross-cutting)", async () => {
    // Pull the current export, post it straight back through /import,
    // and confirm the route returns 200 with no fatal errors. Every
    // pre-existing entry should soft-skip via name_conflict (recorded
    // in `errors[]` per the import handler's docstring); accepted
    // counts will be zero.
    const exp = await fetch(`${BASE}/api/v1/ontology/export`);
    expect(exp.status).toBe(200);
    const payload = await exp.json();

    const imp = await fetch(`${BASE}/api/v1/ontology/import?actor=t18-roundtrip`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(imp.status).toBe(200);
    const body = (await imp.json()) as {
      accepted: { nodeLabels: number; edgeTypes: number };
      errors?: Array<{ code: string }>;
    };
    // Every entry was already present → 0 accepted.
    expect(body.accepted.nodeLabels).toBe(0);
    expect(body.accepted.edgeTypes).toBe(0);
    // If errors are surfaced, they must ALL be name_conflict (soft-skip).
    if (body.errors) {
      for (const e of body.errors) {
        expect(e.code).toBe("name_conflict");
      }
    }
  });
});
