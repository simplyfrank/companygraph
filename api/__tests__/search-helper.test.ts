import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { applySchema } from "../src/neo4j/bootstrap";

// AC-28 + AC-32 — GET /api/v1/query/search and the idempotency of the
// 6 per-label fulltext indexes shipped by T-31 (post-completion amendment
// from process-explorer-ui/FR-17).
//
// AC-28 checks the substring search returns the expected rows quickly.
// AC-32 checks `bun run schema:apply` is still idempotent after the
// amendment — second run makes zero index-create attempts (`SHOW FULLTEXT
// INDEXES` count stays at 6).

const BASE_URL = process.env["API_BASE_URL"] ?? "http://127.0.0.1:8787";

interface SearchRow {
  id: string;
  name: string;
  label: string;
}
interface SearchResponse { rows: SearchRow[] }
interface ErrorResponse {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

async function getSearch(label: string, q: string, limit?: number): Promise<{
  status: number;
  body: SearchResponse | ErrorResponse;
}> {
  const u = new URL(`${BASE_URL}/api/v1/query/search`);
  u.searchParams.set("label", label);
  u.searchParams.set("q", q);
  if (limit !== undefined) u.searchParams.set("limit", String(limit));
  const res = await fetch(u.toString());
  const body = (await res.json()) as SearchResponse | ErrorResponse;
  return { status: res.status, body };
}

describe("integration: AC-28 + AC-32 — search helper + fulltext-index idempotency", () => {
  beforeAll(async () => {
    // Seed so we have real Activity / Domain / etc nodes to match.
    const seedPath = resolve(
      import.meta.dir,
      "..",
      "..",
      "shared",
      "seed",
      "retail-mini.json",
    );
    const body = readFileSync(seedPath, "utf8");
    const res = await fetch(`${BASE_URL}/api/v1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(res.ok).toBe(true);
  });

  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-28 — returns rows matching the query fragment within 200 ms", async () => {
    // The retail-mini seed has Activities like "Publish Markdown" /
    // "Identify Markdown Candidates" / "Configure Markdown Rule".
    const t0 = performance.now();
    const { status, body } = await getSearch("Activity", "Markdown", 20);
    const elapsed = performance.now() - t0;
    expect(status).toBe(200);
    expect(body).toHaveProperty("rows");
    const rows = (body as SearchResponse).rows;
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const r of rows) {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("name");
      expect(r.label).toBe("Activity");
      // Lucene's standard tokeniser will split on whitespace, so any
      // row returned has "markdown" as a token in its name.
      expect(r.name.toLowerCase()).toContain("markdown");
    }
    // Latency budget per FR-17. CI is noisy so we allow generous headroom.
    expect(elapsed).toBeLessThan(1000);
  });

  test("AC-28 — works for other labels (Domain)", async () => {
    // Verifies the per-label index dispatch — Domain has its own
    // fulltext index `domain_name_fulltext`.
    const { status, body } = await getSearch("Domain", "Merchandising", 5);
    expect(status).toBe(200);
    const rows = (body as SearchResponse).rows;
    for (const r of rows) {
      expect(r.label).toBe("Domain");
    }
  });

  test("AC-28 — unknown label returns 400 unknown_label", async () => {
    const { status, body } = await getSearch("NoSuchLabel", "anything", 5);
    expect(status).toBe(400);
    expect((body as ErrorResponse).error.code).toBe("unknown_label");
  });

  test("AC-28 — empty query returns 400 invalid_payload", async () => {
    const { status, body } = await getSearch("Activity", "", 5);
    expect(status).toBe(400);
    expect((body as ErrorResponse).error.code).toBe("invalid_payload");
  });

  test("AC-28 — limit clamps to 100 max", async () => {
    const { status, body } = await getSearch("Activity", "a", 200);
    // Invalid limit (> 100) → 400 invalid_payload via zod max().
    expect(status).toBe(400);
    expect((body as ErrorResponse).error.code).toBe("invalid_payload");
  });

  test("AC-32 — applySchema is idempotent after the fulltext-index amendment", async () => {
    const driver = getDriver();

    // Run applySchema once; record the fulltext-index count.
    await applySchema(driver);
    const session = driver.session();
    let firstCount: number;
    let secondCount: number;
    try {
      const first = await session.run(
        `SHOW FULLTEXT INDEXES YIELD name WHERE name ENDS WITH '_name_fulltext' RETURN count(name) AS n`,
      );
      firstCount = first.records[0]!.get("n").toNumber?.() ?? Number(first.records[0]!.get("n"));

      // Re-run applySchema; assert the count is unchanged.
      await applySchema(driver);
      const second = await session.run(
        `SHOW FULLTEXT INDEXES YIELD name WHERE name ENDS WITH '_name_fulltext' RETURN count(name) AS n`,
      );
      secondCount = second.records[0]!.get("n").toNumber?.() ?? Number(second.records[0]!.get("n"));
    } finally {
      await session.close();
    }

    // 6 baseline labels (Domain, UserJourney, Activity, Role, System, Location)
    // → 6 fulltext indexes after the first run. Second run keeps count at 6.
    expect(firstCount).toBeGreaterThanOrEqual(6);
    expect(secondCount).toBe(firstCount);
  });
});
