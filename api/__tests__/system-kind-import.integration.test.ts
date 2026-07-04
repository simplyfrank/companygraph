// system-augmentation-model T-10 — import injection + dry-run parity
// (AC-07; FR-05 — DD-03, DD-04).
//
// Real HTTP against the live API server (tightened System doc guaranteed
// by applySchema in beforeAll; dev-fallback session):
//   • legacy payload — System rows WITHOUT systemKind import cleanly and
//     read back `systemKind: "functional"` (injection);
//   • present-but-invalid (`systemKind: 42`) lands in `errors[]` with
//     code `attribute_violation` while valid rows import
//     (collect-and-continue);
//   • ?dryRun=true returns the SAME per-row verdicts with ZERO writes —
//     DB row-count unchanged after the dry-run call (DD-04 parity).
//
// Requires Neo4j + API server running. Names prefixed `integration:`.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { v7 as uuidV7 } from "uuid";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { applySchema } from "../src/neo4j/bootstrap";

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";

interface ImportResult {
  imported: { nodes: number; edges: number };
  errors?: Array<{
    section: string;
    index: number;
    code: string;
    details?: { missing?: string[]; type_mismatch?: string[] };
  }>;
}

const ids = {
  legacy: uuidV7(),
  invalid: uuidV7(),
  valid: uuidV7(),
};

async function postImport(payload: unknown, dryRun = false): Promise<ImportResult> {
  const r = await fetch(`${BASE}/api/v1/import${dryRun ? "?dryRun=true" : ""}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  expect(r.status).toBe(200); // C-09: row failures live in errors[], not HTTP
  return (await r.json()) as ImportResult;
}

async function countSystems(): Promise<number> {
  const session = getDriver().session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(`MATCH (n:System) RETURN count(n) AS c`);
    const c = r.records[0]?.get("c") as number | { toNumber(): number };
    return typeof c === "number" ? c : c.toNumber();
  } finally {
    await session.close();
  }
}

const mixedPayload = {
  nodes: [
    // Legacy row — no systemKind key at all → injection target.
    { label: "System", id: ids.legacy, name: "t10-legacy", description: "" },
    // Present-but-invalid → attribute_violation in errors[].
    {
      label: "System",
      id: ids.invalid,
      name: "t10-invalid",
      description: "",
      attributes: { systemKind: 42 },
    },
    // Explicit valid value → imports untouched.
    {
      label: "System",
      id: ids.valid,
      name: "t10-valid",
      description: "",
      attributes: { systemKind: "agentic" },
    },
  ],
  edges: [],
};

describe("integration: import systemKind injection + dry-run parity (AC-07)", () => {
  beforeAll(async () => {
    await applySchema(getDriver());
  });

  afterAll(async () => {
    const session = getDriver().session();
    try {
      for (const id of Object.values(ids)) {
        await session.run(`MATCH (n:System {id: $id}) DETACH DELETE n`, { id });
      }
    } finally {
      await session.close();
    }
    await closeDriver();
    _resetDriver();
  });

  test("integration: dry-run returns the same per-row verdicts with zero writes", async () => {
    const before = await countSystems();

    const dry = await postImport(mixedPayload, true);

    expect(dry.imported.nodes).toBe(2); // legacy (injected) + valid
    expect(dry.errors).toHaveLength(1);
    expect(dry.errors![0]).toMatchObject({
      section: "nodes",
      index: 1,
      code: "attribute_violation",
    });
    expect(dry.errors![0]!.details?.type_mismatch).toContain("systemKind");

    // DD-04 parity contract: zero writes — row count unchanged.
    expect(await countSystems()).toBe(before);
  });

  test("integration: real import — injection defaults the legacy row, invalid row collected, valid rows land", async () => {
    const real = await postImport(mixedPayload);

    // Same verdicts as the dry-run above.
    expect(real.imported.nodes).toBe(2);
    expect(real.errors).toHaveLength(1);
    expect(real.errors![0]).toMatchObject({
      section: "nodes",
      index: 1,
      code: "attribute_violation",
    });

    // Legacy row reads back the injected default.
    const legacy = (await (await fetch(`${BASE}/api/v1/nodes/System/${ids.legacy}`)).json()) as {
      attributes: { systemKind: string };
    };
    expect(legacy.attributes.systemKind).toBe("functional");

    // Valid row kept its explicit value.
    const valid = (await (await fetch(`${BASE}/api/v1/nodes/System/${ids.valid}`)).json()) as {
      attributes: { systemKind: string };
    };
    expect(valid.attributes.systemKind).toBe("agentic");

    // Invalid row never landed.
    const invalid = await fetch(`${BASE}/api/v1/nodes/System/${ids.invalid}`);
    expect(invalid.status).toBe(404);
  });
});
