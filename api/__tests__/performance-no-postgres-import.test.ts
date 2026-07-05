import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// kpi-okr-performance-dashboards T-07 (Resolves: B-01 (rev-3)) — static
// zero-Postgres import assertion. DEC-03 / design §7 pin that the
// performance aggregates read Neo4j ONLY: api/src/routes/performance.ts
// never imports the Postgres client. No import → no `pg` query call is
// possible, which discharges AC-14's zero-Postgres clause with a
// strictly stronger static guarantee than a cross-process spy (see
// STATUS.md verification note / tasks rev-4 N-03).
//
// Modeled on api/__tests__/analytics-no-write-imports.test.ts: the scan
// matches IMPORT STATEMENTS (and require calls), not bare text, so a
// prose mention of Postgres in a comment never trips it.

const PERFORMANCE_TS = resolve(import.meta.dir, "..", "src", "routes", "performance.ts");

// import … from "<spec>"  |  import("<spec>")  |  require("<spec>")
const IMPORT_SPECIFIER_RE =
  /(?:import\s+[^"']*?from\s*|import\s*\(\s*|require\s*\(\s*|export\s+[^"']*?from\s*)["']([^"']+)["']/g;

function importSpecifiers(src: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = IMPORT_SPECIFIER_RE.exec(src)) !== null) out.push(m[1]!);
  return out;
}

describe("performance.ts imports no Postgres client (DEC-03, design §7)", () => {
  const src = readFileSync(PERFORMANCE_TS, "utf8");
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

  test("only the sanctioned single-store surfaces are imported (Neo4j driver, shared schemas, helpers)", () => {
    // Every specifier must be shared-schema, relative Neo4j/helper, or a
    // type-only neo4j-driver import — the design §7 read surface.
    const allowed = specs.every(
      (s) =>
        s.startsWith("@companygraph/shared") ||
        s === "neo4j-driver" ||
        s.startsWith("../neo4j/") ||
        s.startsWith("./_helpers"),
    );
    expect(allowed).toBe(true);
  });
});
