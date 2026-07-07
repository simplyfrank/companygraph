import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { closeDriver } from "../src/neo4j/driver";
import { handleOperatorSlas } from "../src/routes/analytics-operator";
import {
  seedOperatorRoot,
  resolveRootViaSeedTruth,
  createSla,
  createBreach,
  cleanupNeo4j,
  cleanupBreaches,
} from "./helpers/operator-fixtures";

// cross-function-exec-rollup T-06 — closes AC-08 (SLA health/breachCount/
// latestBreachAt; domain_id primary; unattributed; C-05 window semantics).
// The governed sla-compliance/all default window is 90 days (kpi-sla.ts:217),
// so a breach older than 90d is out-of-window for breachCount/health but
// still surfaces in the all-time Read-2 latestBreachAt (C-05 option b).

const BASE = "http://127.0.0.1:8787";
const nodeIds: string[] = [];
const breachSlaIds: string[] = [];

beforeAll(async () => {
  await seedOperatorRoot(BASE);
});
afterEach(async () => {
  await cleanupBreaches(breachSlaIds.splice(0));
  await cleanupNeo4j(nodeIds.splice(0));
});
afterAll(async () => {
  await closeDriver();
});

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

describe("integration: operator slas", () => {
  test("AC-08 primary path: SLA with valid domain_id but no ALIGNED_TO edge → attributed to its function (NOT unattributed)", async () => {
    const { functions } = await resolveRootViaSeedTruth();
    const cs = functions.find((f) => f.seedKey === "customer_success")!;

    nodeIds.push("op-sla-cs");
    await createSla("op-sla-cs", "Op CS SLA (domain_id only)", cs.domainId);

    const res = await handleOperatorSlas(
      new Request(`${BASE}/api/v1/analytics/operator/slas?function=customer_success`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      functions: Array<{ function: string; slas: Array<{ sla_id: string; health: string; breachCount: number }> }>;
      unattributed: Array<{ sla_id: string }>;
    };
    const csFn = body.functions.find((f) => f.function === "customer_success")!;
    expect(csFn.slas.map((s) => s.sla_id)).toContain("op-sla-cs");
    // it must NOT be in unattributed
    expect(body.unattributed.map((s) => s.sla_id)).not.toContain("op-sla-cs");
    const row = csFn.slas.find((s) => s.sla_id === "op-sla-cs")!;
    expect(["within_target", "at_risk", "breached"]).toContain(row.health);
  });

  test("AC-08: an SLA resolvable by neither domain_id nor alignment → unattributed (surfaced, not dropped)", async () => {
    // no domain_id, no ALIGNED_TO → tier 3
    nodeIds.push("op-sla-orphan");
    await createSla("op-sla-orphan", "Op Orphan SLA", null);

    const res = await handleOperatorSlas(
      new Request(`${BASE}/api/v1/analytics/operator/slas`),
    );
    const body = (await res.json()) as { unattributed: Array<{ sla_id: string }> };
    expect(body.unattributed.map((s) => s.sla_id)).toContain("op-sla-orphan");
  });

  test("AC-08 / C-05: health=breached when an open breach exists in-window; breachCount reflects window", async () => {
    const { functions } = await resolveRootViaSeedTruth();
    const cs = functions.find((f) => f.seedKey === "customer_success")!;
    nodeIds.push("op-sla-breached");
    breachSlaIds.push("op-sla-breached");
    await createSla("op-sla-breached", "Op Breached SLA", cs.domainId);
    // one OPEN breach 5 days ago (in-window)
    await createBreach("op-brk-1", "op-sla-breached", isoDaysAgo(5), "open");

    const res = await handleOperatorSlas(
      new Request(`${BASE}/api/v1/analytics/operator/slas?function=customer_success`),
    );
    const body = (await res.json()) as {
      functions: Array<{ slas: Array<{ sla_id: string; health: string; breachCount: number; latestBreachAt: string | null }> }>;
    };
    const row = body.functions[0]!.slas.find((s) => s.sla_id === "op-sla-breached")!;
    expect(row.health).toBe("breached");
    expect(row.breachCount).toBeGreaterThanOrEqual(1);
    expect(row.latestBreachAt).not.toBeNull();
  });

  test("C-05 window/all-time split: an out-of-window breach → breachCount 0 + within_target, but non-null latestBreachAt", async () => {
    const { functions } = await resolveRootViaSeedTruth();
    const cs = functions.find((f) => f.seedKey === "customer_success")!;
    nodeIds.push("op-sla-oldbreach");
    breachSlaIds.push("op-sla-oldbreach");
    await createSla("op-sla-oldbreach", "Op Old-Breach SLA", cs.domainId);
    // one CLOSED breach 200 days ago — OUTSIDE the 90-day compliance window.
    await createBreach("op-brk-old", "op-sla-oldbreach", isoDaysAgo(200), "resolved");

    const res = await handleOperatorSlas(
      new Request(`${BASE}/api/v1/analytics/operator/slas?function=customer_success`),
    );
    const body = (await res.json()) as {
      functions: Array<{ slas: Array<{ sla_id: string; health: string; breachCount: number; latestBreachAt: string | null }> }>;
    };
    const row = body.functions[0]!.slas.find((s) => s.sla_id === "op-sla-oldbreach")!;
    // window-scoped: 0 breaches in window, health within_target
    expect(row.breachCount).toBe(0);
    expect(row.health).toBe("within_target");
    // all-time: latestBreachAt is still surfaced (option b — deliberate split)
    expect(row.latestBreachAt).not.toBeNull();
  });
});
