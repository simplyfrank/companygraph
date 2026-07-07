// marketing-process-model T-15 (AC-16) — no new compile-time label/edge, no
// new RBAC permission string, no route-dispatch edit. git diff guards over the
// owned-elsewhere schema/auth/router files. Requires the repo checkout (git).

import { describe, expect, test } from "bun:test";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { EDGE_TYPES } from "@companygraph/shared/schema/edges";

const REPO = new URL("../../", import.meta.url).pathname;

async function gitDiffStat(paths: string[]): Promise<string> {
  const proc = Bun.spawn(["git", "diff", "--stat", "--", ...paths], { cwd: REPO, stdout: "pipe", stderr: "pipe" });
  await proc.exited;
  return (await new Response(proc.stdout).text()).trim();
}

describe("boundary: no new schema / permission / route (AC-16)", () => {
  test("AC-16: this slice added no entries to shared schema nodes/edges (git diff clean)", async () => {
    const diff = await gitDiffStat(["shared/src/schema/nodes.ts", "shared/src/schema/edges.ts"]);
    expect(diff).toBe("");
  });

  test("AC-16: no RBAC permission or router dispatch edit (git diff clean)", async () => {
    const diff = await gitDiffStat([
      "api/src/auth/rbac-permissions.ts",
      "api/src/router.ts",
      "api/src/errors.ts",
    ]);
    expect(diff).toBe("");
  });

  test("AC-16: owned-elsewhere route files are unedited (git diff clean)", async () => {
    const diff = await gitDiffStat([
      "api/src/routes/kpi-crud.ts",
      "api/src/routes/kpi-sla-alignment.ts",
      "api/src/routes/stories.ts",
      "api/src/routes/capabilities.ts",
      "api/src/routes/risk-register.ts",
      "api/src/routes/edges.ts",
      "api/src/routes/import.ts",
      "api/scripts/seed-saas-operator.ts",
    ]);
    expect(diff).toBe("");
  });

  test("AC-16: the compile-time registries still lack the wave-1b runtime constructs (this slice registers none)", () => {
    // Funnel/Stage/MetricDefinition/UserStory/AcceptanceCriterion/Capability +
    // MEASURES/HAS_STAGE/CONVERTS_TO are runtime-registered by dependencies —
    // never a compile-time entry this slice added.
    expect((NODE_LABELS as readonly string[]).includes("Funnel")).toBe(false);
    expect((NODE_LABELS as readonly string[]).includes("Stage")).toBe(false);
    expect((EDGE_TYPES as readonly string[]).includes("MEASURES")).toBe(false);
    expect((EDGE_TYPES as readonly string[]).includes("HAS_STAGE")).toBe(false);
    expect((EDGE_TYPES as readonly string[]).includes("CONVERTS_TO")).toBe(false);
  });
});
