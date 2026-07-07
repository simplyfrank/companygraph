import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// cross-function-exec-rollup T-07 — static zero-Postgres-import guard for the
// KPI-measurement path (design §4.2/DD-05). The operator KPI-health read
// sources measurements from Neo4j :KPIMeasurement ONLY:
// api/src/routes/analytics-operator.ts never imports the Postgres client. No
// import → no `pg` query call is possible, a strictly stronger static
// guarantee than a cross-process spy (Bun ESM namespace exports are
// read-only bindings — a spyOn is brittle).
//
// Modeled on api/__tests__/performance-no-postgres-import.test.ts: the scan
// matches IMPORT STATEMENTS (and require/export-from), not bare text, so a
// prose mention of Postgres in a comment never trips it. Risk data reaches
// Postgres only by invoking the governed risk-register ROUTE handler
// (DD-06) — that is a route invocation, not a pg-client import here.

const OPERATOR_TS = resolve(import.meta.dir, "..", "src", "routes", "analytics-operator.ts");

const IMPORT_SPECIFIER_RE =
  /(?:import\s+[^"']*?from\s*|import\s*\(\s*|require\s*\(\s*|export\s+[^"']*?from\s*)["']([^"']+)["']/g;

function importSpecifiers(src: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = IMPORT_SPECIFIER_RE.exec(src)) !== null) out.push(m[1]!);
  return out;
}

describe("analytics-operator.ts imports no Postgres client (DD-05, AC-04)", () => {
  const src = readFileSync(OPERATOR_TS, "utf8");
  const specs = importSpecifiers(src);

  test("the module has at least one import (scanner sanity)", () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  test("no import specifier reaches storage/postgres (or the pg package)", () => {
    const offenders = specs.filter(
      (s) => s.includes("storage/postgres") || s === "pg" || s.startsWith("pg/"),
    );
    expect(offenders).toEqual([]);
  });
});
