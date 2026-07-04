// system-augmentation-model T-03 — registry doc shape (AC-02 / FR-02, FR-07).
//
// Asserts the System row's `json_schema_doc`, as served by
// `GET /api/v1/ontology/node-labels` and the `/api/v1/schema` aggregate,
// is the tightened FR-02 doc:
//   • `properties.systemKind.enum` deep-equal SYSTEM_KINDS,
//   • `required` contains "systemKind",
//   • NO `default` keyword under `properties.systemKind` (Risk 2 —
//     `storage/nodes.ts` persists input attributes, not zod output, so a
//     JSON-Schema default would validate-pass while storing nothing).
//
// `applySchema` runs in beforeAll so the assertion holds on any DB state:
// a fresh DB gets the tightened doc directly from the seed (§4.2); a
// stale DB is tightened by the bootstrap migration (§4.3). Both HTTP
// reads go against the live API server on 127.0.0.1:8787 (dev-fallback
// session — ONELOGIN_ISSUER unset admits a synthetic admin session, the
// pattern every route-level integration suite uses).
//
// Requires Neo4j + the API server running (`bun run dev`). Test names
// prefixed `integration:` so `bun test:integration` picks them up.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { SYSTEM_KINDS } from "@companygraph/shared/schema/system-kind";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { applySchema } from "../src/neo4j/bootstrap";

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";

interface SystemDoc {
  type?: string;
  additionalProperties?: unknown;
  required?: string[];
  properties?: Record<string, { type?: string; enum?: string[]; default?: unknown }>;
}

function assertTightened(doc: SystemDoc): void {
  expect(doc).toBeTruthy();
  expect(doc.properties?.systemKind?.enum).toEqual([...SYSTEM_KINDS]);
  expect(doc.required ?? []).toContain("systemKind");
  // Risk 2 — no `default` keyword under properties.systemKind.
  expect("default" in (doc.properties?.systemKind ?? {})).toBe(false);
}

describe("integration: System registry doc is tightened (AC-02)", () => {
  beforeAll(async () => {
    // Idempotent — seeds a fresh registry with the tightened doc, or
    // migrates a stale one (bootstrap step 5).
    await applySchema(getDriver());
  });

  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("integration: GET /api/v1/ontology/node-labels serves the tightened System doc", async () => {
    const r = await fetch(`${BASE}/api/v1/ontology/node-labels`);
    expect(r.status).toBe(200);
    const rows = (await r.json()) as Array<{ name: string; json_schema_doc: SystemDoc }>;
    const system = rows.find((row) => row.name === "System");
    expect(system).toBeTruthy();
    assertTightened(system!.json_schema_doc);
  });

  test("integration: /api/v1/schema aggregate reflects the same tightened row", async () => {
    const r = await fetch(`${BASE}/api/v1/schema`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      nodeLabels: Array<{ name: string; json_schema_doc: SystemDoc }>;
    };
    const system = body.nodeLabels.find((row) => row.name === "System");
    expect(system).toBeTruthy();
    assertTightened(system!.json_schema_doc);
  });
});
