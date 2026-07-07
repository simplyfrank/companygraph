import { describe, expect, test } from "bun:test";
import { getRoutePermission } from "../src/auth/rbac-permissions";

// cross-function-exec-rollup T-09 (design §5, DD-15/2) — UNIT guard for the
// P0 null-skip exposure (AC-09a). The router gate SKIPS the RBAC check when
// getRoutePermission returns null (router.ts:386-395), so a dispatched
// operator route with no ROUTE_PERMISSIONS entry would be reachable with NO
// analytics:read check. Integration runs execute with ONELOGIN_ISSUER unset
// (dev-fallback session) and cannot observe a missing mapping — this unit
// test is the guard. Mirrors performance-rbac.test.ts.

const OPERATOR_ROUTES = [
  "overview",
  "kpis",
  "risks",
  "funnels",
  "slas",
] as const;

describe("cross-function-exec-rollup RBAC route permissions (DD-15/2, AC-09a)", () => {
  for (const route of OPERATOR_ROUTES) {
    test(`GET analytics/operator/${route} maps to analytics:read (never null)`, () => {
      expect(getRoutePermission("GET", `/api/v1/analytics/operator/${route}`)).toBe(
        "analytics:read",
      );
    });
  }

  test("no new permission string was introduced (analytics:read reused)", () => {
    // All five map to the SAME existing permission analytics/graph uses.
    const perms = OPERATOR_ROUTES.map((r) =>
      getRoutePermission("GET", `/api/v1/analytics/operator/${r}`),
    );
    expect(new Set(perms)).toEqual(new Set(["analytics:read"]));
    expect(getRoutePermission("GET", "/api/v1/analytics/graph")).toBe("analytics:read");
  });
});
