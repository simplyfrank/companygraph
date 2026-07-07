// finance-accounting-process-model T-06 verification (AC-07). ≥1 story per
// journey under the RESOLVED operator root id returns 201 and carries ≥1
// structured Given/When/Then AC; a control story posted under a SECOND
// BusinessModel id is rejected 404 story_activity_not_in_model (proving the
// correct root is required, not model_not_found); a partial AC is rejected
// acceptance_criterion_clause_required.
//
// Requires the loopback API + Neo4j + Postgres up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { ensureMetricDefinitionLabel } from "../src/seed/ensure-metric-label";
import { ensureMeasuresEdgeType } from "../src/seed/ensure-measures-edge";
import { seedFinanceGraph } from "../scripts/seed-finance-graph";
import { FINANCE_JOURNEYS, FINANCE_ACTIVITIES } from "../scripts/finance-ids";

const BASE = "http://127.0.0.1:8787";

async function cypher(statement: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${BASE}/api/v1/query/cypher`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statement, params }),
  });
  return (await res.json()) as { rows: Array<Record<string, unknown>> };
}

async function importSlice() {
  const path = resolve(import.meta.dir, "../../shared/seed/saas-operator/finance-accounting.json");
  await fetch(`${BASE}/api/v1/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: readFileSync(path, "utf8"),
  });
}

interface StoryRow {
  id: string;
  activityId: string | null;
}

describe("integration: finance stories", () => {
  let rootId = "";
  const chargeComputed = FINANCE_ACTIVITIES.find((a) => a.seedKey === "fin-act-charge-computed")!;

  beforeAll(async () => {
    await ensureMetricDefinitionLabel(BASE);
    await ensureMeasuresEdgeType(BASE);
    await importSlice();
    const result = await seedFinanceGraph(BASE);
    rootId = result.rootId;
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-07: ≥1 story per journey under the resolved root, each with ≥1 Given/When/Then AC", async () => {
    const listRes = await fetch(`${BASE}/api/v1/models/${rootId}/stories`);
    expect(listRes.ok).toBe(true);
    const stories = (await listRes.json()) as StoryRow[];

    // Map every finance journey's activity ids so we can attribute each story
    // to a journey.
    const activityToJourney = new Map<string, string>();
    for (const a of FINANCE_ACTIVITIES) activityToJourney.set(a.id, a.journeySeedKey);

    const journeysCovered = new Set<string>();
    for (const s of stories) {
      const j = s.activityId ? activityToJourney.get(s.activityId) : undefined;
      if (j) journeysCovered.add(j);
    }
    for (const journey of FINANCE_JOURNEYS) {
      expect(journeysCovered.has(journey.seedKey)).toBe(true);
    }

    // Each finance story carries ≥1 structured AC.
    for (const s of stories) {
      if (!s.activityId || !activityToJourney.has(s.activityId)) continue;
      const acRes = await fetch(
        `${BASE}/api/v1/models/${rootId}/stories/${s.id}/acceptance-criteria`,
      );
      expect(acRes.ok).toBe(true);
      const acs = (await acRes.json()) as Array<{ given: string; when: string; then: string }>;
      expect(acs.length).toBeGreaterThanOrEqual(1);
      expect(acs[0]!.given.length).toBeGreaterThan(0);
      expect(acs[0]!.when.length).toBeGreaterThan(0);
      expect(acs[0]!.then.length).toBeGreaterThan(0);
    }
  });

  test("AC-07: a finance-activity story under a second control model is rejected 404 story_activity_not_in_model", async () => {
    // Create a throwaway control BusinessModel (scopes NO finance activity).
    const createRes = await fetch(`${BASE}/api/v1/models`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `finance-control-model-${Date.now()}` }),
    });
    expect(createRes.status).toBe(201);
    const control = (await createRes.json()) as { id: string };

    const res = await fetch(`${BASE}/api/v1/models/${control.id}/stories`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        persona: "Billing Ops",
        action: "control-scope-mismatch",
        benefit: "prove the correct root is required",
        activityId: chargeComputed.id,
      }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("story_activity_not_in_model");
  });

  test("AC-07: a partial AC (missing a clause) is rejected acceptance_criterion_clause_required", async () => {
    // Attach to an existing finance story under the root.
    const listRes = await fetch(`${BASE}/api/v1/models/${rootId}/stories`);
    const stories = (await listRes.json()) as StoryRow[];
    const activityIds = new Set(FINANCE_ACTIVITIES.map((a) => a.id));
    const story = stories.find((s) => s.activityId && activityIds.has(s.activityId));
    expect(story).toBeDefined();

    const res = await fetch(
      `${BASE}/api/v1/models/${rootId}/stories/${story!.id}/acceptance-criteria`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ given: "only a given clause" }), // missing when/then
      },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("acceptance_criterion_clause_required");
  });
});
