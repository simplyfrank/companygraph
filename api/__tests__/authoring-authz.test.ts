import { describe, expect, test } from "bun:test";
import { getRoutePermission, isPublicRoute } from "../src/auth/rbac-permissions";
import { hasPermissionByRbac } from "../src/auth/oauth";

// business-model-authoring T-12 / AC-10 (authz half, unit tier) — the
// three DD-06 routes resolve to their exact permissions, never null
// (silent open write), never public. The 403/200 gate composition is
// asserted at the unit level (getRoutePermission → hasPermissionByRbac):
// with no ONELOGIN_ISSUER the local server admits a dev session with
// synthetic permissions, so a full-HTTP 403 is not reproducible locally.

const V = "/api/v1";

const AUTHORING_ROUTES: Array<[method: string, path: string, permission: string]> = [
  ["POST", `${V}/models/:modelId/authoring/apply`, "model:write"],
  ["GET", `${V}/models/:modelId/authoring/graph`, "model:read"],
  ["PATCH", `${V}/models/:id/domains/:domainId`, "model:write"],
];

describe("business-model-authoring AC-10 route-permission mapping", () => {
  test("(a) all three authoring routes resolve to their exact permission — never null, never public", () => {
    for (const [method, path, permission] of AUTHORING_ROUTES) {
      const resolved = getRoutePermission(method, path);
      expect(resolved).toBe(permission);
      expect(isPublicRoute(method, path)).toBe(false);
    }
  });

  test("(b) composition: without model:write the apply + domain-PATCH routes are denied; with model:write/model:*/* allowed", () => {
    const applyPerm = getRoutePermission("POST", `${V}/models/:modelId/authoring/apply`)!;
    expect(applyPerm).toBe("model:write");
    expect(hasPermissionByRbac(["model:read"], applyPerm)).toBe(false);
    expect(hasPermissionByRbac(["model:write"], applyPerm)).toBe(true);
    expect(hasPermissionByRbac(["model:*"], applyPerm)).toBe(true);
    expect(hasPermissionByRbac(["*"], applyPerm)).toBe(true);

    const patchPerm = getRoutePermission("PATCH", `${V}/models/:id/domains/:domainId`)!;
    expect(patchPerm).toBe("model:write");
    expect(hasPermissionByRbac(["model:read"], patchPerm)).toBe(false);
    expect(hasPermissionByRbac(["model:write"], patchPerm)).toBe(true);
  });

  test("(c) upstream families the wizard exercises are still mapped (not added here, asserted in force)", () => {
    expect(getRoutePermission("POST", `${V}/models/:modelId/module-instances`)).toBe("module:write");
    expect(getRoutePermission("POST", `${V}/models/:modelId/stories/bootstrap`)).toBe("story:write");
  });

  test("(d) none of the three routes is public", () => {
    for (const [method, path] of AUTHORING_ROUTES) {
      expect(isPublicRoute(method, path)).toBe(false);
    }
  });

  test("(e) business_architect permission set covers all four exercised families", () => {
    const ba = [
      "model:read", "model:write",
      "module:read", "module:write",
      "story:read", "story:write",
      "query:read",
    ];
    for (const [, , permission] of AUTHORING_ROUTES) {
      expect(hasPermissionByRbac(ba, permission)).toBe(true);
    }
    expect(hasPermissionByRbac(ba, "module:write")).toBe(true);
    expect(hasPermissionByRbac(ba, "story:write")).toBe(true);
    expect(hasPermissionByRbac(ba, "query:read")).toBe(true);
  });
});
