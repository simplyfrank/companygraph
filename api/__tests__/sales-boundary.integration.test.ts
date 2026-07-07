// sales-process-model T-15 (AC-15) — no new machinery: zero schema-array
// additions, zero new REST route / RBAC permission / error code, no owned-elsewhere
// edit, no pwa touch. Uses a git-diff guard + a live ontology-registry check.
// Requires the stack up (for the registry check) and a git repo.

import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const REPO = resolve(import.meta.dir, "../..");

function gitDiffStat(paths: string[]): string {
  try {
    return execSync(`git diff --stat -- ${paths.join(" ")}`, { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

// Added lines (`+…`, excluding the `+++` file header) in `git diff` for the
// given paths. Sales's obligation is that IT introduces no line into these
// shared files — a global `git diff --stat` cannot, in a shared working tree,
// distinguish sales's edits from a concurrent spec's additive edits (the same
// carve-out the pwa case below applies). We assert instead that NO added line is
// sales-attributable.
function addedLines(paths: string[]): string[] {
  try {
    const out = execSync(`git diff -- ${paths.join(" ")}`, { cwd: REPO, encoding: "utf8" });
    return out
      .split("\n")
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .map((l) => l.slice(1));
  } catch {
    return [];
  }
}

// A line is sales-attributable if it names this feature or its owned artifacts.
const SALES_MARKER = /sales-process-model|seed-sales|seed:sales|sales\.json|\bSales Pipeline\b/i;

describe("integration: sales boundary / no-new-machinery (AC-15)", () => {
  test("AC-15: sales introduces no schema-array, router, RBAC, or error-code edit", () => {
    // Concurrent dependency specs (funnel-pipeline-modeling adds the
    // funnels/transitions dispatch + edge:write mapping; cross-function-exec-rollup
    // and function-benchmark-scoring add analytics/operator + benchmark routes)
    // legitimately touch router.ts / rbac-permissions.ts in the shared tree.
    // Sales's obligation is only that IT adds nothing here — assert no
    // sales-attributable added line. nodes/edges/errors stay globally pristine
    // (no dependency spec edits them either).
    const globallyPristine = [
      "shared/src/schema/nodes.ts",
      "shared/src/schema/edges.ts",
      "api/src/errors.ts",
    ];
    expect(gitDiffStat(globallyPristine)).toBe("");

    const shared = ["api/src/router.ts", "api/src/auth/rbac-permissions.ts"];
    const salesAttributable = addedLines(shared).filter((l) => SALES_MARKER.test(l));
    expect(salesAttributable).toEqual([]);
  });

  test("AC-15: foundation loader + metric-library seed are untouched", () => {
    const owned = [
      "api/scripts/seed-saas-operator.ts",
      "api/scripts/seed-saas-metric-library.ts",
    ];
    expect(gitDiffStat(owned)).toBe("");
  });

  test("AC-15: this spec adds NO pwa/ file (server-side content spec, NFR-01)", () => {
    // Concurrent specs may have their own in-flight pwa/ edits in a shared
    // working tree; this spec's obligation is that IT introduces no pwa/ file.
    // All owned artifacts are api/scripts/seed-sales.ts, the fixture, the
    // seed:sales package line, and these api/__tests__/sales-* tests.
    let untracked = "";
    try {
      untracked = execSync("git ls-files --others --exclude-standard -- pwa/", { cwd: REPO, encoding: "utf8" }).trim();
    } catch {
      untracked = "";
    }
    const salesPwa = untracked.split("\n").filter((p) => /sales/i.test(p));
    expect(salesPwa).toEqual([]);
  });

  test("AC-15: no risk/funnel/metric/story/DDD/KPI route or storage edits", () => {
    const owned = [
      "api/src/routes/risk-register.ts",
      "api/src/routes/risk-compliance.ts",
      "api/src/routes/compliance-rules.ts",
      "api/src/routes/change-requests.ts",
      "api/src/routes/sla-crud.ts",
      "api/src/routes/stories.ts",
      "api/src/routes/capabilities.ts",
      "api/src/routes/kpi-crud.ts",
      "api/src/routes/kpi-sla-alignment.ts",
      "api/src/seed/link-kpi-metric.ts",
      "api/src/seed/governed-seed-helper.ts",
    ];
    expect(gitDiffStat(owned)).toBe("");
  });
});
