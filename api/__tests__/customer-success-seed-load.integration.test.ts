// customer-success-process-model T-03 + T-12 (AC-12) — the CS fixture loads via
// POST /api/v1/import (no loader edit) writing only non-lifecycle process rows;
// a hand-built variant carrying a lifecycle row → 409
// model_lifecycle_route_required with nothing written (payload-atomic pre-scan).
// Requires the loopback stack + the two upstream seeds.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedCustomerSuccessPreconditions } from "./helpers/customer-success-fixtures";
import { readCustomerSuccessFixture } from "../scripts/seed-customer-success";
import { JOURNEY_IDS } from "../src/seed/customer-success-catalog";

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

const LIFECYCLE_LABELS = ["BusinessModel", "BusinessModule", "BusinessModuleVersion", "ModuleInstance"];
const LIFECYCLE_EDGES = ["IN_MODEL", "HAS_VERSION", "INSTANTIATES", "INSTANCE_IN", "FORKED_FROM"];
const GOVERNED_LABELS = ["KPI", "SLA", "MetricDefinition", "UserStory", "AcceptanceCriterion", "Capability"];

describe("integration: customer-success seed load + lifecycle guard (AC-12)", () => {
  beforeAll(async () => {
    await seedCustomerSuccessPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-12: the fixture carries only non-lifecycle, non-governed process rows", () => {
    const fx = readCustomerSuccessFixture();
    for (const n of fx.nodes as Array<{ label: string }>) {
      expect(LIFECYCLE_LABELS).not.toContain(n.label);
      expect(GOVERNED_LABELS).not.toContain(n.label);
    }
    for (const e of fx.edges as Array<{ type: string }>) {
      expect(LIFECYCLE_EDGES).not.toContain(e.type);
      expect(e.type).not.toBe("MEASURES");
    }
    // The Domain node is NOT created here (foundation owns it) — only referenced.
    expect((fx.nodes as Array<{ label: string }>).some((n) => n.label === "Domain")).toBe(false);
  });

  test("AC-12: the real fixture imports cleanly (no row errors, no loader edit)", async () => {
    const fx = readCustomerSuccessFixture();
    const res = await fetch(`${BASE}/api/v1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fx),
    });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { errors?: unknown[] };
    expect(Array.isArray(body.errors) ? body.errors.length : 0).toBe(0);
  });

  test("AC-12 (negative): a variant with a lifecycle IN_MODEL edge → 409, nothing written", async () => {
    const marker = "018f0400-0000-7000-8000-0000ac12dead";
    const variant = {
      nodes: [
        { label: "UserJourney", id: marker, name: "CS AC-12 guard probe", description: "", attributes: {} },
      ],
      edges: [
        { type: "IN_MODEL", fromId: marker, toId: JOURNEY_IDS.onboarding },
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

    const check = await cypher(`MATCH (n {id:$id}) RETURN count(n) AS n`, { id: marker });
    expect(num(check.rows[0]!.n)).toBe(0);
  });
});
