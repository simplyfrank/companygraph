import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { getRoutePermission, isPublicRoute } from "../src/auth/rbac-permissions";
import { hasPermissionByRbac } from "../src/auth/oauth";
import { api, createEdge, newCleanup, runCleanup } from "./helpers/model-fixtures";
import {
  buildScoringModel,
  getScores,
  rowFor,
  type ScoringFixture,
} from "./helpers/key-activity-fixtures";

// key-activity-optimizer T-12 / AC-08 (scope + authz half of the
// two-file split — the openapi half is
// key-activity-openapi.integration.test.ts; both must exist, design §8
// N-03; NFR-01, FR-11):
//  - two-model isolation: GET /models/:A/key-activities scores ONLY
//    model-A activities; a cross-scope PRECEDES edge (A-activity →
//    B-activity) contributes NOTHING to A's centrality / critical path
//    / handoff;
//  - marking a model-B activity under model A's path → 404
//    activity_not_found (A exists, so the 404 is the ACTIVITY code —
//    cold-pass B-01 sequencing);
//  - authz: every new route resolves a non-null ROUTE_PERMISSIONS row,
//    none is public, and the RBAC gate composition denies a session
//    without key_activity:write on the writes / admits key_activity:read
//    on the GET. (Under the local dev-fallback gate — ONELOGIN_ISSUER
//    unset — the running server admits a synthetic `*`-permission
//    session, so the 403 is asserted at the gate-composition level per
//    the story-authz.test.ts house precedent.)

const V = "/api/v1";
const cleanup = newCleanup();
let a: ScoringFixture;
let b: ScoringFixture;

describe("integration: key-activity-optimizer AC-08 model isolation + authz", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    a = await buildScoringModel(
      cleanup,
      "ka-iso-a",
      [
        { key: "a1", roles: ["ra"], systems: ["sa"] },
        { key: "a2", roles: ["ra2"], systems: ["sa2"] },
      ],
      [["a1", "a2"]],
    );
    b = await buildScoringModel(
      cleanup,
      "ka-iso-b",
      [
        { key: "b1", roles: ["rb"], systems: ["sb"] },
        { key: "b2", roles: ["rb2"], systems: ["sb2"] },
      ],
      [["b1", "b2"]],
    );
    // Cross-scope PRECEDES: model-A activity → model-B activity. Legal
    // edge; must contribute NOTHING to either model's scoring (NFR-01).
    await createEdge("PRECEDES", a.activityIds.a2!, b.activityIds.b1!);
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("GET /models/:A/key-activities scores ONLY model-A activities; cross-scope PRECEDES excluded (NFR-01)", async () => {
    const scores = await getScores(a.modelId);
    const ids = scores.rows.map((r) => r.id).sort();
    expect(ids).toEqual([a.activityIds.a1!, a.activityIds.a2!].sort());
    expect(ids).not.toContain(b.activityIds.b1!);
    expect(ids).not.toContain(b.activityIds.b2!);

    // The a2 → b1 cross-scope edge contributes nothing: a2's out-degree
    // stays 0 in A's graph, its critical-path length stays the in-scope
    // 2-node chain, and b1 never appears as a handoff neighbour.
    const a2 = rowFor(scores, a.activityIds.a2!);
    expect(a2.evidence.centrality.outDegree).toBe(0);
    expect(a2.evidence.criticalPath.criticalPathLength).toBe(2);
    expect(a2.evidence.handoff.handoffCount).toBeLessThanOrEqual(2); // only a1 can be a neighbour

    // Symmetric: B's scoring is untouched by the inbound cross edge.
    const scoresB = await getScores(b.modelId);
    const b1 = rowFor(scoresB, b.activityIds.b1!);
    expect(b1.evidence.centrality.inDegree).toBe(0);
  });

  test("marking a model-B activity under model A's path → 404 activity_not_found (cold-pass B-01)", async () => {
    const { status, body } = await api<{ error: { code: string } }>(
      "POST",
      `/models/${a.modelId}/key-activities/${b.activityIds.b1!}/mark`,
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("activity_not_found");
    // And no mark landed on the B activity.
    const scoresB = await getScores(b.modelId);
    expect(rowFor(scoresB, b.activityIds.b1!).key).toBeNull();
  });

  test("every new route resolves a non-null ROUTE_PERMISSIONS row; none is public (FR-11)", () => {
    expect(getRoutePermission("GET", `${V}/models/:modelId/key-activities`)).toBe(
      "key_activity:read",
    );
    expect(
      getRoutePermission("POST", `${V}/models/:modelId/key-activities/:activityId/mark`),
    ).toBe("key_activity:write");
    expect(
      getRoutePermission("DELETE", `${V}/models/:modelId/key-activities/:activityId/mark`),
    ).toBe("key_activity:write");
    expect(isPublicRoute("GET", `${V}/models/:modelId/key-activities`)).toBe(false);
    expect(isPublicRoute("POST", `${V}/models/:modelId/key-activities/:activityId/mark`)).toBe(
      false,
    );
    expect(isPublicRoute("DELETE", `${V}/models/:modelId/key-activities/:activityId/mark`)).toBe(
      false,
    );
  });

  test("gate composition: no key_activity:write → denied on POST/DELETE; key_activity:read → admitted on GET (403/200 composition)", () => {
    const readOnly = ["key_activity:read"];
    const withWrite = ["key_activity:read", "key_activity:write"];
    const none = ["model:read", "story:read"];

    const writePerm = getRoutePermission(
      "POST",
      `${V}/models/:modelId/key-activities/:activityId/mark`,
    )!;
    expect(hasPermissionByRbac(none, writePerm)).toBe(false); // → 403
    expect(hasPermissionByRbac(readOnly, writePerm)).toBe(false); // → 403
    expect(hasPermissionByRbac(withWrite, writePerm)).toBe(true); // → 200/204

    const readPerm = getRoutePermission("GET", `${V}/models/:modelId/key-activities`)!;
    expect(hasPermissionByRbac(readOnly, readPerm)).toBe(true); // → 200
    expect(hasPermissionByRbac(none, readPerm)).toBe(false); // → 403
    expect(hasPermissionByRbac(["key_activity:*"], writePerm)).toBe(true);
  });

  test("seeded business_architect role resolves both key_activity permissions", () => {
    const src = readFileSync(join(import.meta.dir, "../src/scripts/seed-rbac-roles.ts"), "utf8");
    const start = src.indexOf('name: "business_architect"');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf("];", start));
    expect(block).toContain('"key_activity:read"');
    expect(block).toContain('"key_activity:write"');
  });
});
