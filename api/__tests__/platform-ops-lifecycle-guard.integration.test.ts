// platform-ops-process-model T-11 (AC-05) — the real (non-lifecycle) fixture
// imports and writes; a hand-constructed variant carrying a lifecycle row (an
// IN_MODEL edge) is rejected 409 model_lifecycle_route_required with nothing
// written (payload-atomic pre-scan). Requires the loopback stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedPlatformOpsPreconditions } from "./helpers/platform-ops-fixtures";
import { readPlatformOpsFixture, JOURNEY_IDS } from "../src/seed/platform-ops-content";

const BASE = "http://127.0.0.1:8787";

async function cypher(statement: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${BASE}/api/v1/query/cypher`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statement, params }),
  });
  return (await res.json()) as { rows: Array<Record<string, unknown>> };
}

function num(v: unknown): number {
  if (v && typeof v === "object" && "low" in (v as Record<string, unknown>)) {
    return Number((v as { low: number }).low);
  }
  return Number(v ?? 0);
}

describe("integration: platform-ops lifecycle guard (AC-05)", () => {
  beforeAll(async () => {
    await seedPlatformOpsPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-05: the real fixture is non-lifecycle-only (no lifecycle labels/edges)", () => {
    const fx = readPlatformOpsFixture();
    const LIFECYCLE_LABELS = ["BusinessModel", "BusinessModule", "BusinessModuleVersion", "ModuleInstance"];
    const LIFECYCLE_EDGES = ["IN_MODEL", "HAS_VERSION", "INSTANTIATES", "INSTANCE_IN", "FORKED_FROM"];
    for (const n of fx.nodes as Array<{ label: string }>) {
      expect(LIFECYCLE_LABELS).not.toContain(n.label);
    }
    for (const e of fx.edges as Array<{ type: string }>) {
      expect(LIFECYCLE_EDGES).not.toContain(e.type);
    }
    // The fixture carries no Domain node row (created cross-boundary — §4.2).
    expect((fx.nodes as Array<{ label: string }>).some((n) => n.label === "Domain")).toBe(false);
  });

  test("AC-05: a variant with a lifecycle IN_MODEL edge → 409, nothing written", async () => {
    const marker = "018f0200-0000-7000-8000-0000ac05dead";
    const variant = {
      nodes: [
        { label: "UserJourney", id: marker, name: "AC-05 guard probe", description: "", attributes: {} },
      ],
      edges: [
        // A lifecycle IN_MODEL edge — must be rejected payload-atomically.
        { type: "IN_MODEL", fromId: marker, toId: JOURNEY_IDS.observability },
      ],
    };
    const res = await fetch(`${BASE}/api/v1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(variant),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("model_lifecycle_route_required");

    // Nothing written — the probe node must not exist.
    const check = await cypher(`MATCH (n {id:$id}) RETURN count(n) AS n`, { id: marker });
    expect(num(check.rows[0]!.n)).toBe(0);
  });
});
