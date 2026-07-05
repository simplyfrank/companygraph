import { describe, expect, test } from "bun:test";
import { getRoutePermission } from "../src/auth/rbac-permissions";

// kpi-okr-governance T-14 (design §4.10 / DD-12) — UNIT test of the
// ROUTE_PERMISSIONS table for every route this spec added, reshaped, or
// retired. This must be a unit test: CI and local integration runs
// execute with ONELOGIN_ISSUER unset (dev-fallback session), so no
// integration test can observe a missing permission mapping — and the
// router gate SKIPS the permission check when getRoutePermission
// returns null, making an unlisted route an authorization hole in
// issuer-configured mode, not a safe default.

describe("kpi-okr-governance RBAC route permissions (NFR-05, DD-12)", () => {
  test("new/changed KPI routes map to their §4.10 permissions (never null)", () => {
    expect(getRoutePermission("GET", "/api/v1/kpis")).toBe("kpi:read");
    expect(getRoutePermission("POST", "/api/v1/kpis")).toBe("kpi:write");
    expect(getRoutePermission("POST", "/api/v1/kpis/some-id/archive")).toBe("kpi:write");
    expect(getRoutePermission("GET", "/api/v1/kpis/some-id/audit")).toBe("kpi:read");
    expect(getRoutePermission("GET", "/api/v1/kpis/some-id")).toBe("kpi:read"); // repointed detail GET
    expect(getRoutePermission("PATCH", "/api/v1/kpis/some-id")).toBe("kpi:write");
  });

  test("new/changed SLA routes mirror the KPI section", () => {
    expect(getRoutePermission("GET", "/api/v1/slas")).toBe("sla:read");
    expect(getRoutePermission("POST", "/api/v1/slas")).toBe("sla:write");
    expect(getRoutePermission("POST", "/api/v1/slas/some-id/archive")).toBe("sla:write");
    expect(getRoutePermission("GET", "/api/v1/slas/some-id/audit")).toBe("sla:read");
    expect(getRoutePermission("GET", "/api/v1/slas/some-id")).toBe("sla:read");
    expect(getRoutePermission("PATCH", "/api/v1/slas/some-id")).toBe("sla:write");
  });

  test("FR-10d domains list is guarded by domain:read", () => {
    expect(getRoutePermission("GET", "/api/v1/domains")).toBe("domain:read");
  });

  test("FR-10c unfiltered okr-directives list rides the existing okr:read row", () => {
    // No RBAC edit was needed — the existing 1-segment pattern covers
    // filtered and unfiltered forms alike (query params are invisible
    // to matchSegments).
    expect(getRoutePermission("GET", "/api/v1/okr-directives")).toBe("okr:read");
  });

  test("DEC-01 retired overload patterns resolve per the live table (POST :id → null)", () => {
    // The stale P("POST","kpis/:id") / P("POST","slas/:id") rows were
    // removed with the retirement — a permission mapping must never
    // point at a 404 route (it would mask future dispatch mistakes).
    expect(getRoutePermission("POST", "/api/v1/kpis/some-id")).toBeNull();
    expect(getRoutePermission("POST", "/api/v1/slas/some-id")).toBeNull();
  });

  test("3-segment archive/audit patterns cannot shadow 2-segment :id patterns", () => {
    // matchSegments requires equal segment counts — ordering inside the
    // section is safe either way (design §4.10); pin both directions.
    expect(getRoutePermission("GET", "/api/v1/kpis/audit")).toBe("kpi:read"); // matches kpis/:id
    expect(getRoutePermission("POST", "/api/v1/kpis/archive")).toBeNull(); // POST kpis/:id removed
  });

  // kpi-measurement-alignment FR-18 / AC-13 — param-binding + reconcile routes
  test("param-binding routes map to kpi:read / kpi:write (never null)", () => {
    expect(getRoutePermission("POST", "/api/v1/kpis/some-id/param-bindings")).toBe("kpi:write");
    expect(getRoutePermission("GET", "/api/v1/kpis/some-id/param-bindings")).toBe("kpi:read");
    expect(getRoutePermission("DELETE", "/api/v1/param-bindings/some-id")).toBe("kpi:write");
  });

  test("reconcile routes map to kpi:write (never null)", () => {
    expect(getRoutePermission("POST", "/api/v1/kpis/some-id/reconcile")).toBe("kpi:write");
    expect(getRoutePermission("POST", "/api/v1/kpis/reconcile-all")).toBe("kpi:write");
  });
});
