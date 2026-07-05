// ddd-system-modeling T-08 / AC-09 (authz half) — every capability /
// system-model route has a ROUTE_PERMISSIONS row; none is public.
//
// TABLE-DRIVEN over T-09's exact 13 method+route literal list
// (CAPABILITY_ROUTE_LITERALS, tasks-review C-03) — NEVER a
// hand-enumerated subset. The SECURITY-CRITICAL property (DD-10): an
// unmapped route returns null from getRoutePermission and the router
// then SKIPS the RBAC check entirely (silent open write), so the
// load-bearing assertion is non-null coverage of EVERY pair.
//
// The 403/200 gate composition is asserted at the unit level
// (getRoutePermission → hasPermissionByRbac → allow/deny): with no
// ONELOGIN_ISSUER the local server admits a dev session with `*`
// permissions, so a full-HTTP 403 is not reproducible locally; the
// router branch under test is the same one exercised in production.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { getRoutePermission, isPublicRoute } from "../src/auth/rbac-permissions";
import { hasPermissionByRbac } from "../src/auth/oauth";
import { CAPABILITY_ROUTE_LITERALS } from "../src/routes/capabilities";

const V = "/api/v1";

const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

describe("ddd-system-modeling AC-09 route-permission mapping", () => {
  test("all 13 dispatch pairs resolve a non-null capability:* permission — no silent-open route, none public", () => {
    expect(CAPABILITY_ROUTE_LITERALS.length).toBe(13);
    for (const [method, sub] of CAPABILITY_ROUTE_LITERALS) {
      const resolved = getRoutePermission(method, `${V}/${sub}`);
      expect(resolved).not.toBeNull();
      expect(resolved!.startsWith("capability:")).toBe(true);
      // GETs → read; POST/PUT/PATCH/DELETE → write (design §4.8).
      expect(resolved).toBe(WRITES.has(method) ? "capability:write" : "capability:read");
      expect(isPublicRoute(method, `${V}/${sub}`)).toBe(false);
    }
  });

  test("the three PUT rows resolve (DD-11 — first PUT entries; rp.method is a plain string compare)", () => {
    for (const sub of [
      "models/m1/capabilities/c1/needed-by",
      "models/m1/capabilities/c1/supported-by",
      "models/m1/capabilities/c1/context",
    ]) {
      expect(getRoutePermission("PUT", `${V}/${sub}`)).toBe("capability:write");
    }
  });

  test("gate composition: without capability:write every write route is denied; reads pass with capability:read", () => {
    const readOnly = ["capability:read"];
    const none = ["story:read", "model:read"];
    for (const [method, sub] of CAPABILITY_ROUTE_LITERALS) {
      const required = getRoutePermission(method, `${V}/${sub}`)!;
      if (WRITES.has(method)) {
        // 403 branch: POST /capabilities, the three PUTs, both the
        // body DELETE and the param DELETE, PATCH, DELETE.
        expect(hasPermissionByRbac(readOnly, required)).toBe(false);
        expect(hasPermissionByRbac(none, required)).toBe(false);
        expect(hasPermissionByRbac(["capability:write"], required)).toBe(true);
      } else {
        // 200 branch: the list GET, the two system-model GETs, the
        // :capabilityId GET.
        expect(hasPermissionByRbac(readOnly, required)).toBe(true);
        expect(hasPermissionByRbac(none, required)).toBe(false);
      }
    }
    // Wildcards still work through the same resolver.
    expect(hasPermissionByRbac(["capability:*"], "capability:write")).toBe(true);
    expect(hasPermissionByRbac(["*"], "capability:write")).toBe(true);
  });

  test("the :capabilityId GET/PATCH/DELETE resolves to the RIGHT permission (not shadowed)", () => {
    // matchSegments rejects on segment count first (DD-10) — the
    // 4-segment parameterized row can never swallow the 5/6-segment
    // sub-routes; assert the exact resolutions anyway.
    expect(getRoutePermission("GET", `${V}/models/m1/capabilities/c1`)).toBe("capability:read");
    expect(getRoutePermission("PATCH", `${V}/models/m1/capabilities/c1`)).toBe("capability:write");
    expect(getRoutePermission("DELETE", `${V}/models/m1/capabilities/c1`)).toBe("capability:write");
    // The 4-segment system-model literals are not shadowed either
    // (3rd segment differs from "capabilities").
    expect(getRoutePermission("GET", `${V}/models/m1/system-model/gaps`)).toBe("capability:read");
    expect(getRoutePermission("GET", `${V}/models/m1/system-model/context-map`)).toBe(
      "capability:read",
    );
    // 6-segment param DELETE.
    expect(
      getRoutePermission("DELETE", `${V}/models/m1/capabilities/c1/supported-by/s1`),
    ).toBe("capability:write");
  });

  test("seeded business_architect permission array contains capability:read + capability:write", () => {
    // The RBAC_ROLES const is module-private in seed-rbac-roles.ts —
    // assert against the source block (grep-test house style, same as
    // story-authz.test.ts).
    const src = readFileSync(join(import.meta.dir, "../src/scripts/seed-rbac-roles.ts"), "utf8");
    const start = src.indexOf('name: "business_architect"');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf("];", start));
    expect(block).toContain('"capability:read"');
    expect(block).toContain('"capability:write"');
    // Both resolve through the RBAC resolver.
    const ba = ["capability:read", "capability:write"];
    expect(hasPermissionByRbac(ba, "capability:read")).toBe(true);
    expect(hasPermissionByRbac(ba, "capability:write")).toBe(true);
  });
});
