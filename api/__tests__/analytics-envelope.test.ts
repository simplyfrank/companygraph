// T-19 (cto-analytics, AC-10 — RD-6 re-point) — envelope harness over the
// **shipped** FR-09 report GETs under `/api/v1/analytics/*`.
//
// AC-10 (requirements): every shipped `/api/v1/analytics/*` report GET returns
// the NFR-08 success envelope (`graph-core/NFR-05` — success returns the
// resource; errors return `{error:{code,message,details?}}`). RD-6 re-pointed
// AC-10 to close **here** over the 7 BUILD-set report GETs; the deferred
// `exec-summary.pdf` / `settings` / `snapshot` roll into `cto-analytics-reporting`.
//
// The dispatcher's six not-yet-built report branches and the `config` resource
// are driver-free, so this suite exercises a real 200 envelope for each. The
// `systems` branch reads Neo4j through the read-only module; its live 200 is an
// integration repro (recorded below) rather than a unit assertion, but its
// success SHAPE (the `SystemMap` returned by `computeSystemMap`) is asserted
// envelope-conformant here without a driver.

import { describe, test, expect } from "bun:test";
import {
  handleAnalyticsReport,
  handleAnalyticsConfig,
  ANALYTICS_REPORT_ROUTES,
} from "../src/analytics/routes";
import { computeSystemMap } from "../src/analytics/system-map";

// NFR-08 success envelope: a plain JSON resource (not wrapped in `{error}`)
// served with 200 + `content-type: application/json`.
function expectSuccessEnvelope(res: Response): void {
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/json");
}

async function expectSuccessBody(res: Response): Promise<unknown> {
  expectSuccessEnvelope(res);
  const body = await res.json();
  // Success bodies must NOT carry the NFR-08 error shape.
  expect((body as { error?: unknown }).error).toBeUndefined();
  return body;
}

describe("AC-10: shipped analytics report GETs conform to the NFR-08 envelope", () => {
  test("all 7 BUILD-set report route names are present (RD-3 verbatim)", () => {
    expect([...ANALYTICS_REPORT_ROUTES]).toEqual([
      "systems",
      "matrix",
      "consolidation",
      "complexity",
      "single-system-journeys",
      "critical-paths",
      "ai-candidates",
    ]);
  });

  test("each driver-free report GET returns a well-formed 200 success envelope", async () => {
    for (const report of ANALYTICS_REPORT_ROUTES) {
      // `systems` reads Neo4j (live path — integration repro below); every
      // other report resolves without a driver in the scaffold.
      if (report === "systems") continue;
      const res = await handleAnalyticsReport(report);
      const body = (await expectSuccessBody(res)) as { report?: string };
      // Scaffold-pending reports echo their own name so the harness can tie
      // the 200 to the requested route; once the owning task lands its module
      // the body changes but stays an NFR-08 success envelope (asserted above).
      if ((body as { scaffold_pending?: boolean }).scaffold_pending) {
        expect(body.report).toBe(report);
      }
    }
  });

  test("the `systems` success SHAPE is envelope-serializable JSON (driver-free)", () => {
    // Exercise the pure computation the `systems` GET serializes so the shape
    // is asserted without a live driver. The live GET is the integration repro.
    const map = computeSystemMap(
      [
        { id: "s1", label: "System", name: "POS" },
        { id: "s2", label: "System", name: "ERP" },
        { id: "a1", label: "Activity", name: "Checkout" },
      ],
      [{ id: "s1->s2:INTEGRATES_WITH", source: "s1", target: "s2", type: "INTEGRATES_WITH" }],
    );
    // Must round-trip through JSON (what `ok()` does before it leaves the boundary).
    const roundTripped = JSON.parse(JSON.stringify(map));
    expect(roundTripped).toEqual(map);
    expect(Array.isArray(roundTripped.systems)).toBe(true);
    expect(Array.isArray(roundTripped.integrations)).toBe(true);
    // Not an error envelope.
    expect(roundTripped.error).toBeUndefined();
  });

  test("the read-only config resource returns a 200 success envelope", async () => {
    const res = handleAnalyticsConfig();
    const body = (await expectSuccessBody(res)) as {
      complexity_weights?: unknown;
      ai_candidate_definition?: unknown;
    };
    expect(body.complexity_weights).toBeDefined();
    expect(body.ai_candidate_definition).toBeDefined();
  });

  test("an unknown report GET returns the NFR-08 ERROR envelope (404 not_found)", async () => {
    const res = await handleAnalyticsReport("no-such-report");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    // Error envelope: `{error:{code,message,details?}}`.
    expect(body.error).toBeDefined();
    expect(body.error?.code).toBe("not_found");
    expect(typeof body.error?.message).toBe("string");
  });

  test("the deferred report names are NOT dispatchable here (RD-6)", async () => {
    for (const deferred of ["exec-summary.pdf", "settings", "snapshot"]) {
      const res = await handleAnalyticsReport(deferred);
      expect(res.status).toBe(404);
    }
  });
});

// Integration repro (env-dependent, best-effort — needs a running + seeded stack):
//   with `bun run dev` + `bun run seed`, then
//   curl -s 127.0.0.1:8787/api/v1/analytics/systems
//   → expect a 200 JSON envelope of 6 systems (per `retail-mini` seed), each
//     carrying `degree` + `integrationCount`, and NO `error` key.
