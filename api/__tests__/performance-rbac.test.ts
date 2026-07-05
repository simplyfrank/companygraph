import { describe, expect, test } from "bun:test";
import { getRoutePermission } from "../src/auth/rbac-permissions";

// kpi-okr-performance-dashboards T-06 (design §4.7 RBAC rationale,
// NFR-02) — UNIT test of the ROUTE_PERMISSIONS entries for the three new
// performance aggregate routes. Mirrors kpi-okr-governance's
// rbac-route-permissions.test.ts: integration runs execute with
// ONELOGIN_ISSUER unset (dev-fallback session) and cannot observe a
// missing mapping — and the router gate SKIPS the permission check when
// getRoutePermission returns null, making an unlisted route an
// authorization hole in issuer-configured mode. This unit test is the
// guard (AC-06 companion).

describe("kpi-okr-performance-dashboards RBAC route permissions (NFR-02)", () => {
  test("GET analytics/performance/kpis maps to analytics:read (never null)", () => {
    expect(getRoutePermission("GET", "/api/v1/analytics/performance/kpis")).toBe("analytics:read");
  });

  test("GET analytics/performance/okr maps to analytics:read (never null)", () => {
    expect(getRoutePermission("GET", "/api/v1/analytics/performance/okr")).toBe("analytics:read");
  });

  test("GET analytics/performance/journeys maps to analytics:read (never null)", () => {
    expect(getRoutePermission("GET", "/api/v1/analytics/performance/journeys")).toBe(
      "analytics:read",
    );
  });

  test("the existing analytics/graph mapping is untouched (additive section only)", () => {
    expect(getRoutePermission("GET", "/api/v1/analytics/graph")).toBe("analytics:read");
  });
});
