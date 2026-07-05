import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { okrPerformanceResponseSchema } from "@companygraph/shared/schema/performance";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";
import { handlePerformanceOkr } from "../src/routes/performance";

// kpi-okr-performance-dashboards T-09 — closes AC-04 (design §4.5).
//
// Fixtures replay the REAL as-built topology (verified against
// roll-down.ts / okr-crud.ts):
//   (:RollDown {type:'okr'})-[:FOR_OKR]->(:OKRDirective)
//   (:RollDown)-[:HAS_ASSIGNMENT]->(:RollDownAssignment)-[:FOR_DOMAIN]->(:Domain)
//   (:OKRDirective)-[:HAS_KEY_RESULT]->(:KeyResult)  (progress INSIDE attributes_json)
// The edges are created via the direct driver — the governed
// POST /roll-down/okr write never links them (pinned as-built quirk,
// documented in roll-down.integration.test.ts) — while the STATUS
// TRANSITIONS run through the governed routes (commit / approve /
// reject / request-adjustment), so the four as-built literals are read
// back from real writes, never re-invented (FR-03).
//
// R-2: the directive predicate's substring-match false-positive envelope
// is inherited from the governed handlers and NOT asserted as a defect.

const API_BASE = "http://127.0.0.1:8787/api/v1";

const cleanupNodeIds: string[] = [];

async function runWrite(cypher: string, params: Record<string, unknown>): Promise<void> {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    await session.run(cypher, params);
  } finally {
    await session.close();
  }
}

async function post(path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function createRawNode(label: string, props: Record<string, unknown>): Promise<string> {
  const id = generateId();
  cleanupNodeIds.push(id);
  await runWrite(`CREATE (n:\`${label}\`) SET n = $props, n.id = $id`, {
    id,
    props: { createdAt: new Date().toISOString(), ...props },
  });
  return id;
}

async function createEdge(fromId: string, type: string, toId: string): Promise<void> {
  await runWrite(
    `MATCH (a {id: $fromId}), (b {id: $toId}) CREATE (a)-[:\`${type}\` {id: $edgeId}]->(b)`,
    { fromId, toId, edgeId: generateId() },
  );
}

interface OkrRow {
  directive_id: string;
  directive_name: string;
  key_results: Array<{ id: string; name: string; progress: number | null }>;
  domains: Array<{
    domain_id: string;
    domain_name: string | null;
    status: string;
    weight: number | null;
    adjustment_requested: boolean;
  }>;
}

async function getOkrRows(): Promise<OkrRow[]> {
  const res = await fetch(`${API_BASE}/analytics/performance/okr`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { rows: OkrRow[] };
  // The response validates against the shared contract (C-06 assertion).
  expect(okrPerformanceResponseSchema.safeParse(body).success).toBe(true);
  return body.rows;
}

function rowFor(rows: OkrRow[], directiveId: string): OkrRow | undefined {
  return rows.find((r) => r.directive_id === directiveId);
}

// Fixture graph (all directives TOP-LEVEL: attributes_json carries no
// "domain_id" key, so the unsliced /okr Read A predicate matches them):
//   dirFull — kr (progress 40), rollDown → two assignments:
//     assignmentA → domainA (transitions pending→committed→approved)
//     assignmentB → domainB (transitions pending→rejected; gets adjustment)
//   dirNoAssignments — rollDown with NO assignments → domains: []  (C-06)
//   dirNoRollDown — no :RollDown anchor at all → domains: []
let domainA: string;
let domainB: string;
let dirFull: string;
let dirNoAssignments: string;
let dirNoRollDown: string;
let keyResultId: string;
let rollDownId: string;
let assignmentA: string;
let assignmentB: string;

async function createAssignment(rdId: string, domainId: string, weight: number): Promise<string> {
  const id = await createRawNode("RollDownAssignment", {
    roll_down_id: rdId,
    domain_id: domainId,
    status: "pending",
    weight,
  });
  await createEdge(rdId, "HAS_ASSIGNMENT", id);
  await createEdge(id, "FOR_DOMAIN", domainId);
  return id;
}

beforeAll(async () => {
  const stamp = generateId().slice(0, 8);
  domainA = await createRawNode("Domain", { name: `perf-okr-domA-${stamp}` });
  domainB = await createRawNode("Domain", { name: `perf-okr-domB-${stamp}` });

  dirFull = await createRawNode("OKRDirective", {
    name: `perf-okr-dir-full-${stamp}`,
    attributes_json: "{}",
  });
  keyResultId = await createRawNode("KeyResult", {
    name: `perf-okr-kr-${stamp}`,
    // C-01: progress lives INSIDE attributes_json, not a top-level prop.
    attributes_json: JSON.stringify({ progress: 40 }),
  });
  await createEdge(dirFull, "HAS_KEY_RESULT", keyResultId);

  rollDownId = await createRawNode("RollDown", { type: "okr", status: "pending" });
  await createEdge(rollDownId, "FOR_OKR", dirFull);
  assignmentA = await createAssignment(rollDownId, domainA, 0.7);
  assignmentB = await createAssignment(rollDownId, domainB, 0.3);

  dirNoAssignments = await createRawNode("OKRDirective", {
    name: `perf-okr-dir-noassign-${stamp}`,
    attributes_json: "{}",
  });
  const emptyRollDown = await createRawNode("RollDown", { type: "okr", status: "pending" });
  await createEdge(emptyRollDown, "FOR_OKR", dirNoAssignments);

  dirNoRollDown = await createRawNode("OKRDirective", {
    name: `perf-okr-dir-norolldown-${stamp}`,
    attributes_json: "{}",
  });
});

afterAll(async () => {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    if (cleanupNodeIds.length > 0) {
      await session.run(`MATCH (n) WHERE n.id IN $ids DETACH DELETE n`, { ids: cleanupNodeIds });
    }
    // :RollDownAdjustment nodes created via the governed route carry
    // server-generated ids — sweep by roll_down_id.
    await session.run(`MATCH (adj:RollDownAdjustment {roll_down_id: $id}) DETACH DELETE adj`, {
      id: rollDownId,
    });
  } finally {
    await session.close();
    await closeDriver();
    _resetDriver();
  }
});

describe("integration: performance okr (AC-04)", () => {
  test("fresh assignments read back status:'pending'; weight from a.weight; progress from attributes_json; no adjustment flag", async () => {
    const rows = await getOkrRows();
    const row = rowFor(rows, dirFull);
    expect(row).toBeDefined();
    expect(row!.directive_name).toContain("perf-okr-dir-full");

    // C-01: key-result progress surfaces from inside attributes_json.
    expect(row!.key_results).toEqual([
      { id: keyResultId, name: expect.stringContaining("perf-okr-kr"), progress: 40 },
    ]);

    const domA = row!.domains.find((d) => d.domain_id === domainA);
    const domB = row!.domains.find((d) => d.domain_id === domainB);
    expect(domA?.status).toBe("pending");
    expect(domB?.status).toBe("pending");
    // B-02: weight (NOT contribution) surfaces from a.weight.
    expect(domA?.weight).toBe(0.7);
    expect(domB?.weight).toBe(0.3);
    expect(domA?.domain_name).toContain("perf-okr-domA");
    // FR-03: no pending :RollDownAdjustment yet → false everywhere.
    expect(domA?.adjustment_requested).toBe(false);
    expect(domB?.adjustment_requested).toBe(false);
  });

  test("governed transitions read back committed → approved; rejected — never a re-invented literal", async () => {
    // Pinned as-built quirk: POST /roll-down/commit matches
    // RollDownAssignment {id: $roll_down_id, …} — the "roll_down_id" is
    // actually the ASSIGNMENT id.
    const commit = await post("/roll-down/commit", {
      roll_down_id: assignmentA,
      domain_id: domainA,
      status: "committed",
      // As-built quirk: the handler passes `notes` into tx.run unguarded —
      // omitting it yields "Expected parameter(s): notes" (500).
      notes: "perf-test commit",
    });
    expect(commit.status).toBe(200);
    let row = rowFor(await getOkrRows(), dirFull)!;
    expect(row.domains.find((d) => d.domain_id === domainA)?.status).toBe("committed");

    const approve = await post("/roll-down/approve", {
      assignment_id: assignmentA,
      approver_id: "perf-test",
    });
    expect(approve.status).toBe(200);
    row = rowFor(await getOkrRows(), dirFull)!;
    expect(row.domains.find((d) => d.domain_id === domainA)?.status).toBe("approved");

    const reject = await post("/roll-down/reject", {
      assignment_id: assignmentB,
      rejecter_id: "perf-test",
      reason: "budget reallocation",
    });
    expect(reject.status).toBe(200);
    row = rowFor(await getOkrRows(), dirFull)!;
    expect(row.domains.find((d) => d.domain_id === domainB)?.status).toBe("rejected");
  });

  test("adjustment_requested flips true ONLY after POST /roll-down/adjustment creates a pending :RollDownAdjustment (FR-03, never derived from status)", async () => {
    const adj = await post("/roll-down/adjustment", {
      roll_down_id: rollDownId,
      domain_id: domainB,
      requested_adjustments: [
        {
          type: "okr",
          item_id: keyResultId,
          current_target: 100,
          proposed_target: 80,
          reason: "capacity constraint",
        },
      ],
    });
    expect(adj.status).toBe(200);

    const row = rowFor(await getOkrRows(), dirFull)!;
    const domB = row.domains.find((d) => d.domain_id === domainB);
    const domA = row.domains.find((d) => d.domain_id === domainA);
    expect(domB?.adjustment_requested).toBe(true); // pending adjustment node exists
    expect(domA?.adjustment_requested).toBe(false); // per-(directive, domain) grouping (C-06)
    // Not derived from status: domB is 'rejected', domA 'approved' —
    // neither literal encodes the adjustment signal.
    expect(domB?.status).toBe("rejected");
  });

  test("C-06: a roll-down with no assignments and a directive with no roll-down both yield domains: [] (null-`a` rows dropped)", async () => {
    const rows = await getOkrRows();
    expect(rowFor(rows, dirNoAssignments)?.domains).toEqual([]);
    expect(rowFor(rows, dirNoRollDown)?.domains).toEqual([]);
  });
});

// ── Two-read budget (query-count leg — IN-PROCESS, B-01 (rev-3)) ────────
// The behavior assertions above stay HTTP end-to-end; this leg cannot —
// an out-of-process spy observes none of the server's sessions and
// passes vacuously. Same mechanics as T-07: invoke the handler in the
// test process where the module-singleton getDriver() is shared, wrap
// the singleton's `session` factory, and sum captured sessions' `run`
// calls. Edge-case pin (N-02, 2026-07-05 cycle): the exactly-two shape
// is asserted on fixtures with ≥ 1 directive (this file always seeds
// them); an empty Read A may legitimately short-circuit Read B.

type SessionFactory = (...args: unknown[]) => { run: (...a: unknown[]) => unknown };

function installSessionSpy(): { runCount: () => number; restore: () => void } {
  const driver = getDriver();
  const proto = driver as unknown as Record<string, unknown>;
  const original = driver.session.bind(driver) as SessionFactory;
  let count = 0;
  proto.session = (...args: unknown[]) => {
    const session = original(...args);
    const originalRun = session.run.bind(session);
    (session as Record<string, unknown>).run = (...runArgs: unknown[]) => {
      count += 1;
      return originalRun(...runArgs);
    };
    return session;
  };
  return {
    runCount: () => count,
    restore: () => {
      delete proto.session;
    },
  };
}

describe("integration: performance okr (two-read budget, in-process)", () => {
  let spy: ReturnType<typeof installSessionSpy> | null = null;

  afterEach(() => {
    spy?.restore();
    spy = null;
  });

  test("exactly two Neo4j reads per invocation regardless of directive/assignment count (no per-directive N+1)", async () => {
    spy = installSessionSpy(); // installed AFTER fixture seeding (beforeAll)
    const before = spy.runCount();
    const res = await handlePerformanceOkr(
      new Request("http://127.0.0.1:8787/api/v1/analytics/performance/okr"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ directive_id: string }> };
    // ≥ 1 directive in scope (this file's fixtures are top-level).
    expect(body.rows.length).toBeGreaterThan(0);
    expect(spy.runCount() - before).toBe(2); // Read A + Read B, both batched
  });
});
