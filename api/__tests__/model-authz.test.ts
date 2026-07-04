import { describe, expect, test } from "bun:test";
import { getRoutePermission, isPublicRoute } from "../src/auth/rbac-permissions";
import { hasPermissionByRbac } from "../src/auth/oauth";

// model-workspace-core T-13 / AC-10 (authz half) — every new route has
// a ROUTE_PERMISSIONS row; none is public. An unmapped route returns
// null from getRoutePermission and the router then SKIPS the RBAC
// check entirely (silent open write) — so the security-critical
// assertion is non-null coverage of EVERY new route.
//
// The 403/201 gate composition is asserted at the unit level
// (getRoutePermission → hasPermissionByRbac → allow/deny): with no
// ONELOGIN_ISSUER the local server admits a dev session with `*`
// permissions, so a full-HTTP 403 is not reproducible locally; the
// router branch under test is the same one exercised in production.

const V = "/api/v1";
const EXPECTED: Array<[method: string, path: string, permission: string]> = [
  ["POST", `${V}/models`, "model:write"],
  ["GET", `${V}/models`, "model:read"],
  ["GET", `${V}/models/:id`, "model:read"],
  ["PATCH", `${V}/models/:id`, "model:write"],
  ["DELETE", `${V}/models/:id`, "model:write"],
  ["POST", `${V}/models/:id/archive`, "model:write"],
  ["POST", `${V}/models/:id/domains`, "model:write"], // B-02
  ["POST", `${V}/models/:modelId/module-instances`, "module:write"],
  ["GET", `${V}/models/:modelId/module-instances`, "module:read"],
  ["PATCH", `${V}/models/:modelId/module-instances/:instanceId/nodes/:nodeId`, "module:write"],
  ["POST", `${V}/models/:modelId/module-instances/:instanceId/edges`, "module:write"], // B-01
  ["DELETE", `${V}/models/:modelId/module-instances/:instanceId/edges`, "module:write"], // B-01
  ["POST", `${V}/models/:modelId/module-instances/:instanceId/fork`, "module:write"],
  ["POST", `${V}/models/:modelId/module-instances/:instanceId/upgrade`, "module:write"],
  ["POST", `${V}/modules`, "module:write"],
  ["GET", `${V}/modules`, "module:read"],
  ["POST", `${V}/modules/:id/versions`, "module:write"],
  ["GET", `${V}/modules/:id/versions`, "module:read"],
];

describe("model-workspace-core AC-10 route-permission mapping", () => {
  test("every new route resolves to its exact permission — never null, never public", () => {
    for (const [method, path, permission] of EXPECTED) {
      const resolved = getRoutePermission(method, path);
      expect(resolved).toBe(permission);
      expect(isPublicRoute(method, path)).toBe(false);
    }
  });

  test("explicit shadowing assertion (pass-1 C-02): the deep instance-node PATCH row is not shadowed", () => {
    // matchSegments rejects on segment count first, so only a
    // same-length looser row could shadow this. Assert the exact
    // permission comes back — not null, not an inherited one.
    expect(
      getRoutePermission(
        "PATCH",
        "/api/v1/models/:modelId/module-instances/:instanceId/nodes/:nodeId",
      ),
    ).toBe("module:write");
  });

  test("synthetic ::-handles travel as one path segment and still match the row (N-06)", () => {
    expect(
      getRoutePermission(
        "PATCH",
        "/api/v1/models/01900000-0000-7000-8000-000000000001/module-instances/01900000-0000-7000-8000-000000000002/nodes/01900000-0000-7000-8000-000000000002::a0",
      ),
    ).toBe("module:write");
  });

  test("gate composition: a session without model:write is denied; with it (or wildcard) allowed", () => {
    const required = getRoutePermission("POST", "/api/v1/models")!;
    expect(required).toBe("model:write");
    // Without → the router's dispatch() returns 403 on this branch.
    expect(hasPermissionByRbac(["model:read", "module:read"], required)).toBe(false);
    // With the exact permission, the namespace wildcard, or admin `*` → allowed.
    expect(hasPermissionByRbac(["model:write"], required)).toBe(true);
    expect(hasPermissionByRbac(["model:*"], required)).toBe(true);
    expect(hasPermissionByRbac(["*"], required)).toBe(true);
  });

  test("business_architect permission set covers the model/module surface without generic node/edge writes", () => {
    const ba = [
      "model:read", "model:write", "module:read", "module:write",
      "domain:read", "domain:write", "journey:read", "journey:write",
      "query:read", "analytics:read",
    ];
    for (const [method, path, permission] of EXPECTED) {
      expect(hasPermissionByRbac(ba, permission)).toBe(true);
      void method; void path;
    }
    expect(hasPermissionByRbac(ba, "node:write")).toBe(false);
    expect(hasPermissionByRbac(ba, "edge:write")).toBe(false);
  });
});
