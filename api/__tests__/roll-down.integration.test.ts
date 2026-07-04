import { afterAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";

// kpi-okr-governance T-09 — P0-flow floor for the roll-down surface
// (FR-09, AC-11, Risk 3) plus the AC-12 zod-rejection table, including
// sanctioned contract change (iii): POST /roll-down/sla/domain's 400
// details are now the standardized issues[] shape ("invalid_payload"
// message), replacing the as-built e.flatten() mapper.
//
// Pinned as-built quirks (documented, NOT fixed — outside FR-10…FR-14):
//   - Creates return {id, status:"pending"} only; assignment ids are not
//     echoed. Assignments are looked up via the driver.
//   - The kpi/okr creates never link RollDown-[:HAS_ASSIGNMENT]->… — the
//     collection GETs join on that edge, so they return degenerate rows.
//     Tests assert 200 + array shape only.
//   - GET /roll-down/contributions runs invalid Cypher (RETURN…WITH…
//     RETURN) and 500s with the neo4j_unreachable envelope. Pinned
//     as-built; flagged for the consolidated report. The by-domain
//     variant works and is pinned at 200.
//   - POST /roll-down/commit matches RollDownAssignment {id:
//     $roll_down_id, domain_id} — i.e. "roll_down_id" is actually the
//     ASSIGNMENT id. Pinned.
//   - V-04 matcher shadow: GET /roll-down/kpi/product (no id) matches
//     the by-domain regex — tests always use id-suffixed forms.

const API_BASE = "http://127.0.0.1:8787/api/v1";

interface ErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

const rollDownIds: string[] = [];

async function post(path: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function assignmentsFor(rollDownId: string): Promise<Array<{ id: string; status: string; domain_id?: string }>> {
  const session = getDriver().session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (a:RollDownAssignment {roll_down_id: $id}) RETURN a.id AS id, a.status AS status, a.domain_id AS domain_id`,
      { id: rollDownId },
    );
    return r.records.map((rec) => ({
      id: rec.get("id"),
      status: rec.get("status"),
      domain_id: rec.get("domain_id"),
    }));
  } finally {
    await session.close();
  }
}

afterAll(async () => {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    if (rollDownIds.length > 0) {
      await session.run(
        `MATCH (r:RollDown) WHERE r.id IN $ids DETACH DELETE r`,
        { ids: rollDownIds },
      );
      await session.run(
        `MATCH (a:RollDownAssignment) WHERE a.roll_down_id IN $ids
         OPTIONAL MATCH (o:RollDownObjective {assignment_id: a.id})
         OPTIONAL MATCH (kr:RollDownKeyResult {objective_id: o.id})
         DETACH DELETE a, o, kr`,
        { ids: rollDownIds },
      );
    }
  } finally {
    await session.close();
    await closeDriver();
    _resetDriver();
  }
});

describe("integration: roll-down P0 flows (AC-11)", () => {
  test("KPI roll-down: create → get → commit (status committed) → approve (status approved)", async () => {
    const kpiId = generateId();
    const domainId = generateId();

    const created = await post("/roll-down/kpi", {
      kpi_id: kpiId,
      domain_assignments: [{ domain_id: domainId, weight: 60, target_value: 42 }],
    });
    expect(created.status).toBe(200);
    expect(created.body.status).toBe("pending");
    const rollDownId = created.body.id as string;
    expect(rollDownId.charAt(14)).toBe("7"); // UUIDv7 via generateId
    rollDownIds.push(rollDownId);

    // GET (collection + by-domain id-suffixed form) — 200 + array shape.
    const list = await fetch(`${API_BASE}/roll-down/kpi`);
    expect(list.status).toBe(200);
    expect(Array.isArray(await list.json())).toBe(true);
    const byDomain = await fetch(`${API_BASE}/roll-down/kpi/${domainId}`);
    expect(byDomain.status).toBe(200);
    expect(Array.isArray(await byDomain.json())).toBe(true);

    // The assignment node exists with status pending.
    const [assignment] = await assignmentsFor(rollDownId);
    expect(assignment).toBeDefined();
    expect(assignment.status).toBe("pending");

    // Commit — pinned: "roll_down_id" in the commit body is matched
    // against the ASSIGNMENT id (+ domain_id).
    const committed = await post("/roll-down/commit", {
      roll_down_id: assignment.id,
      domain_id: domainId,
      status: "committed",
      notes: "integration commit",
    });
    expect(committed.status).toBe(200);
    expect(committed.body).toEqual({ success: true });
    expect((await assignmentsFor(rollDownId))[0].status).toBe("committed");

    // Approve.
    const approved = await post("/roll-down/approve", {
      assignment_id: assignment.id,
      approver_id: "exec-1",
      notes: "looks good",
    });
    expect(approved.status).toBe(200);
    expect(approved.body).toEqual({ status: "approved" });
    expect((await assignmentsFor(rollDownId))[0].status).toBe("approved");
  });

  test("OKR roll-down: create → get → reject", async () => {
    const okrDirectiveId = generateId();
    const domainId = generateId();

    const created = await post("/roll-down/okr", {
      okr_directive_id: okrDirectiveId,
      domain_assignments: [
        {
          domain_id: domainId,
          objectives: [
            {
              name: "Objective A",
              description: "Fixture objective",
              key_results: [
                {
                  name: "KR 1",
                  description: "Fixture KR",
                  baseline_value: 0,
                  target_value: 10,
                  unit: "count",
                  direction: "higher_is_better",
                },
              ],
            },
          ],
        },
      ],
    });
    expect(created.status).toBe(200);
    expect(created.body.status).toBe("pending");
    const rollDownId = created.body.id as string;
    rollDownIds.push(rollDownId);

    const list = await fetch(`${API_BASE}/roll-down/okr`);
    expect(list.status).toBe(200);
    expect(Array.isArray(await list.json())).toBe(true);
    const byDomain = await fetch(`${API_BASE}/roll-down/okr/${domainId}`);
    expect(byDomain.status).toBe(200);

    const [assignment] = await assignmentsFor(rollDownId);
    expect(assignment.status).toBe("pending");

    const rejected = await post("/roll-down/reject", {
      assignment_id: assignment.id,
      rejecter_id: "exec-2",
      reason: "targets unrealistic",
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body).toEqual({ status: "rejected" });
    expect((await assignmentsFor(rollDownId))[0].status).toBe("rejected");
  });

  test("contributions reads — collection 500s on as-built invalid Cypher (pinned), by-domain works", async () => {
    // PINNED AS-BUILT DEFECT (flagged for the consolidated report): the
    // contributions collection query uses RETURN…WITH…RETURN, which
    // Neo4j rejects as a syntax error; the server-level catch maps it to
    // the 500 neo4j_unreachable envelope. Fixing it is outside this
    // spec's sanctioned changes (FR-10…FR-14).
    const collection = await fetch(`${API_BASE}/roll-down/contributions`);
    expect(collection.status).toBe(500);
    const env = (await collection.json()) as ErrorEnvelope;
    expect(env.error.code).toBe("neo4j_unreachable");

    const byDomain = await fetch(`${API_BASE}/roll-down/contributions/${generateId()}`);
    expect(byDomain.status).toBe(200);
    expect(Array.isArray(await byDomain.json())).toBe(true);
  });
});

describe("integration: roll-down zod rejections (AC-12)", () => {
  const kpiId = generateId();
  const domainId = generateId();
  const productId = generateId();
  const programId = generateId();

  // Table-driven rejections — every malformed POST body must return the
  // standardized 400 {error:{code:"invalid_payload",…,details.issues[]}}
  // envelope (as-built these were 500s: .parse() with no ZodError mapper).
  const cases: Array<{ name: string; path: string; body: unknown; expectPath?: string }> = [
    {
      name: "kpi roll-down weight -1",
      path: "/roll-down/kpi",
      body: { kpi_id: kpiId, domain_assignments: [{ domain_id: domainId, weight: -1, target_value: 1 }] },
      expectPath: "domain_assignments.0.weight",
    },
    {
      name: "kpi roll-down weight 101",
      path: "/roll-down/kpi",
      body: { kpi_id: kpiId, domain_assignments: [{ domain_id: domainId, weight: 101, target_value: 1 }] },
      expectPath: "domain_assignments.0.weight",
    },
    {
      name: "kpi roll-down missing domain_assignments",
      path: "/roll-down/kpi",
      body: { kpi_id: kpiId },
      expectPath: "domain_assignments",
    },
    {
      name: "okr roll-down missing domain_assignments",
      path: "/roll-down/okr",
      body: { okr_directive_id: kpiId },
      expectPath: "domain_assignments",
    },
    {
      name: "kpi product roll-down weight 101 (should-level variant)",
      path: "/roll-down/kpi/product",
      body: {
        kpi_id: kpiId,
        domain_id: domainId,
        product_assignments: [{ product_id: productId, weight: 101, target_value: 1 }],
      },
      expectPath: "product_assignments.0.weight",
    },
    {
      name: "kpi program roll-down weight -1 (should-level variant)",
      path: "/roll-down/kpi/program",
      body: {
        kpi_id: kpiId,
        program_id: programId,
        product_assignments: [{ product_id: productId, weight: -1, target_value: 1 }],
      },
      expectPath: "product_assignments.0.weight",
    },
    {
      name: "okr product roll-down missing product_assignments (should-level variant)",
      path: "/roll-down/okr/product",
      body: { okr_directive_id: kpiId, domain_id: domainId },
      expectPath: "product_assignments",
    },
    {
      name: "okr program roll-down missing product_assignments (should-level variant)",
      path: "/roll-down/okr/program",
      body: { okr_directive_id: kpiId, program_id: programId },
      expectPath: "product_assignments",
    },
    {
      name: "commit malformed roll_down_id",
      path: "/roll-down/commit",
      body: { roll_down_id: "not-a-uuid", domain_id: domainId, status: "committed" },
      expectPath: "roll_down_id",
    },
    {
      name: "approve malformed assignment_id",
      path: "/roll-down/approve",
      body: { assignment_id: "not-a-uuid", approver_id: "x" },
      expectPath: "assignment_id",
    },
    {
      name: "reject missing reason",
      path: "/roll-down/reject",
      body: { assignment_id: kpiId, rejecter_id: "x" },
      expectPath: "reason",
    },
    {
      name: "sla/domain malformed body — NEW issues[] shape (DD-01 iii pin)",
      path: "/roll-down/sla/domain",
      body: { domain_id: "not-a-uuid" },
    },
  ];

  for (const c of cases) {
    test(c.name, async () => {
      const { status, body } = await post(c.path, c.body);
      expect(status).toBe(400);
      const env = body as ErrorEnvelope;
      expect(env.error.code).toBe("invalid_payload");
      // Standardized message — notably NOT the retired "schema validation
      // failed" flatten-mapper message on /roll-down/sla/domain.
      expect(env.error.message).toBe("invalid_payload");
      const issues = env.error.details?.issues as Array<{ path: string; message: string; code: string }>;
      expect(Array.isArray(issues)).toBe(true);
      expect(issues.length).toBeGreaterThan(0);
      if (c.expectPath) {
        expect(issues.map((i) => i.path)).toContain(c.expectPath);
      }
      // flatten()'s {formErrors,fieldErrors} shape must be gone.
      expect(env.error.details?.fieldErrors).toBeUndefined();
      expect(env.error.details?.formErrors).toBeUndefined();
    });
  }
});
