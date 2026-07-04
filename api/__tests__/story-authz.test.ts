import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { getRoutePermission, isPublicRoute } from "../src/auth/rbac-permissions";
import { hasPermissionByRbac } from "../src/auth/oauth";

// story-spec-core T-11 / AC-09 (authz half) — every one of the ten new
// routes has a ROUTE_PERMISSIONS row; none is public. An unmapped route
// returns null from getRoutePermission and the router then SKIPS the
// RBAC check entirely (silent open write) — so the security-critical
// assertion is non-null coverage of EVERY new route.
//
// The 403/200 gate composition is asserted at the unit level per the
// model-authz.test.ts house pattern: under the local dev-fallback gate
// (ONELOGIN_ISSUER unset) the server admits a synthetic `*`-permission
// session, so a full-HTTP 403 is not reproducible here. The TRUE
// end-to-end 403/200 through the real gate lives in
// story-xd18-role-path.integration.test.ts step 6 (in-process route()
// dispatch — tasks D-6/D-7).

const V = "/api/v1";
const READS: Array<[string, string]> = [
  ["GET", `${V}/models/:modelId/stories`],
  ["GET", `${V}/models/:modelId/stories/:storyId/acceptance-criteria`],
  ["GET", `${V}/models/:modelId/stories/:storyId`],
];
const WRITES: Array<[string, string]> = [
  ["POST", `${V}/models/:modelId/stories`],
  ["POST", `${V}/models/:modelId/stories/bootstrap`],
  ["POST", `${V}/models/:modelId/stories/:storyId/acceptance-criteria`],
  ["PATCH", `${V}/models/:modelId/stories/:storyId/acceptance-criteria/:acId`],
  ["DELETE", `${V}/models/:modelId/stories/:storyId/acceptance-criteria/:acId`],
  ["PATCH", `${V}/models/:modelId/stories/:storyId`],
  ["DELETE", `${V}/models/:modelId/stories/:storyId`],
];

describe("story-spec-core AC-09 route-permission mapping", () => {
  test("every one of the ten new routes resolves non-null to its exact permission; none is public", () => {
    for (const [method, path] of READS) {
      expect(getRoutePermission(method, path)).toBe("story:read");
      expect(isPublicRoute(method, path)).toBe(false);
    }
    for (const [method, path] of WRITES) {
      expect(getRoutePermission(method, path)).toBe("story:write");
      expect(isPublicRoute(method, path)).toBe(false);
    }
  });

  test("gate composition: story:write allows the writes; a set without it is denied; story:read-only allows GETs and denies writes", () => {
    const withWrite = ["story:read", "story:write"];
    const readOnly = ["story:read"];
    const none = ["model:read", "module:read"];
    for (const [, path] of WRITES) {
      const required = getRoutePermission("POST", `${V}/models/:modelId/stories`)!;
      expect(required).toBe("story:write");
      void path;
    }
    for (const [method, path] of WRITES) {
      const required = getRoutePermission(method, path)!;
      expect(hasPermissionByRbac(withWrite, required)).toBe(true);
      expect(hasPermissionByRbac(readOnly, required)).toBe(false);
      expect(hasPermissionByRbac(none, required)).toBe(false);
    }
    for (const [method, path] of READS) {
      const required = getRoutePermission(method, path)!;
      expect(hasPermissionByRbac(withWrite, required)).toBe(true);
      expect(hasPermissionByRbac(readOnly, required)).toBe(true);
      expect(hasPermissionByRbac(none, required)).toBe(false);
    }
    // Wildcards still work through the same resolver.
    expect(hasPermissionByRbac(["story:*"], "story:write")).toBe(true);
    expect(hasPermissionByRbac(["*"], "story:write")).toBe(true);
  });

  test("seeded business_architect permission array contains story:read + story:write", () => {
    // The RBAC_ROLES const is module-private in seed-rbac-roles.ts —
    // assert against the source block (grep-test house style).
    const src = readFileSync(
      join(import.meta.dir, "../src/scripts/seed-rbac-roles.ts"),
      "utf8",
    );
    const start = src.indexOf('name: "business_architect"');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf("];", start));
    expect(block).toContain('"story:read"');
    expect(block).toContain('"story:write"');
  });

  test("no shadowing: the bootstrap + AC literals resolve before the parameterized :storyId rows", () => {
    // Same-length rows are the only shadowing candidates
    // (matchSegments rejects on segment count first). The 5-segment
    // bootstrap literal must not be swallowed by the 5-segment
    // GET/PATCH/DELETE :storyId row.
    expect(getRoutePermission("POST", `${V}/models/m1/stories/bootstrap`)).toBe("story:write");
    expect(getRoutePermission("GET", `${V}/models/m1/stories/bootstrap`)).toBe("story:read");
    expect(
      getRoutePermission("PATCH", `${V}/models/m1/stories/s1/acceptance-criteria/a1`),
    ).toBe("story:write");
  });
});
