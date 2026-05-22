// T-20 / AC-19 integration test — daily audit-retention pass against
// a live Neo4j (design §10 / FR-13a).
//
// Coverage:
//   • Seed `_OntologyAudit` rows aged > 365 d → run pass → assert
//     (a) gzipped JSONL exists at `<archiveRoot>/YYYY-MM.jsonl.gz`,
//     (b) archived rows deleted from `_OntologyAudit`,
//     (c) idempotent re-run yields zero additional archived rows.
//   • `OPT_ONTOLOGY_AUDIT_RETENTION_DAYS=0` → audit-archive pass is
//     skipped (rows untouched) but the event-buffer purge STILL runs.
//   • Static grep (pass-1 C-01 / open-accepted #4): the source file
//     must NOT contain the deprecated `collect(e)` materialisation in
//     the event-purge query. `grep -F 'collect(e)' …` returns zero hits.
//
// The archive root is overridden to a temp dir per test so concurrent
// runs don't clobber each other's gzip files.

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createGunzip } from "node:zlib";
import { createReadStream } from "node:fs";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { applyMetaSchema } from "../src/ontology/meta-bootstrap";
import { runAuditRetention } from "../src/ontology/jobs/audit-retention";

const toN = (v: unknown): number =>
  typeof v === "number"
    ? v
    : v && typeof (v as { toNumber?: () => number }).toNumber === "function"
      ? (v as { toNumber: () => number }).toNumber()
      : Number(v);

async function clearAuditAndEventRows(): Promise<void> {
  const driver = getDriver();
  const session = driver.session();
  try {
    await session.run(`MATCH (a:_OntologyAudit) DETACH DELETE a`);
    await session.run(`MATCH (e:_OntologyEvent) DETACH DELETE e`);
  } finally {
    await session.close();
  }
}

async function seedAuditRow(ts: string, target: string): Promise<void> {
  const driver = getDriver();
  const session = driver.session();
  try {
    await session.run(
      `CREATE (a:_OntologyAudit {
         ts: $ts, actor: "test", action: "test_action", target: $target,
         before_json: null, after_json: $after, diff_jsonpatch: null,
         version_id: "00000000-0000-7000-8000-000000000001"
       })`,
      { ts, target, after: JSON.stringify({ name: target, seeded_at: ts }) },
    );
  } finally {
    await session.close();
  }
}

async function seedEventRow(ts: string): Promise<void> {
  const driver = getDriver();
  const session = driver.session();
  try {
    await session.run(
      `CREATE (e:_OntologyEvent {
         event_id: $id, version_id: "00000000-0000-7000-8000-000000000001",
         diff_jsonpatch: "[]", ts: $ts
       })`,
      { id: `00000000-0000-7000-8000-${ts.replace(/[-:.TZ]/g, "").slice(0, 12)}`, ts },
    );
  } finally {
    await session.close();
  }
}

async function countByLabel(label: string): Promise<number> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (n:\`${label}\`) RETURN count(n) AS c`,
    );
    return toN(r.records[0]?.get("c"));
  } finally {
    await session.close();
  }
}

async function readGzipJsonl(archivePath: string): Promise<Array<Record<string, unknown>>> {
  const lines: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(archivePath).pipe(createGunzip());
    let buf = "";
    stream.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
    });
    stream.on("end", () => {
      for (const line of buf.split("\n")) {
        if (line.trim() !== "") lines.push(line);
      }
      resolve();
    });
    stream.on("error", reject);
  });
  return lines.map((l) => JSON.parse(l));
}

describe("integration: runAuditRetention (T-20 / FR-13a / AC-19)", () => {
  let archiveRoot: string;

  beforeAll(async () => {
    await applyMetaSchema(getDriver());
  });

  beforeEach(async () => {
    await clearAuditAndEventRows();
    // Per-test temp archive dir under the OS temp area.
    archiveRoot = await fs.mkdtemp(
      path.join(
        process.env.TMPDIR ?? "/tmp",
        "companygraph-retention-",
      ),
    );
  });

  afterAll(async () => {
    await clearAuditAndEventRows();
    await closeDriver();
    _resetDriver();
  });

  test("archive pass: aged rows are written to gzip JSONL + deleted from _OntologyAudit", async () => {
    // Seed three rows aged > 400 d (default retention is 365 d).
    const oldTs = new Date(Date.now() - 400 * 86_400_000).toISOString();
    await seedAuditRow(oldTs, "ArchiveProbe1");
    await seedAuditRow(oldTs, "ArchiveProbe2");
    await seedAuditRow(oldTs, "ArchiveProbe3");

    // Plus one fresh row that should survive.
    const freshTs = new Date().toISOString();
    await seedAuditRow(freshTs, "FreshProbe");

    const before = await countByLabel("_OntologyAudit");
    expect(before).toBe(4);

    const result = await runAuditRetention(undefined, getDriver(), archiveRoot);
    expect(result.archived).toBe(3);

    // The 3 aged rows are gone; the fresh row remains.
    const after = await countByLabel("_OntologyAudit");
    expect(after).toBe(1);

    // Archive file exists at `<root>/YYYY-MM.jsonl.gz` for the *current*
    // month (the pass timestamps the archive by `now`, not by row ts).
    const monthKey = new Date().toISOString().slice(0, 7);
    const archivePath = path.join(archiveRoot, `${monthKey}.jsonl.gz`);
    const stat = await fs.stat(archivePath);
    expect(stat.size).toBeGreaterThan(0);

    // And the file contains exactly 3 deserialisable JSONL records.
    const records = await readGzipJsonl(archivePath);
    expect(records).toHaveLength(3);
    for (const r of records) {
      expect(r.actor).toBe("test");
      expect(r.action).toBe("test_action");
    }
  });

  test("idempotent re-run: second pass archives zero rows (nothing left to archive)", async () => {
    const oldTs = new Date(Date.now() - 400 * 86_400_000).toISOString();
    await seedAuditRow(oldTs, "IdemProbe");

    const first = await runAuditRetention(undefined, getDriver(), archiveRoot);
    expect(first.archived).toBe(1);

    const second = await runAuditRetention(undefined, getDriver(), archiveRoot);
    expect(second.archived).toBe(0);
  });

  test("event-buffer purge: rows older than 5 min are deleted", async () => {
    // Seed 4 event rows: 3 aged (>5 min old) + 1 fresh.
    const old1 = new Date(Date.now() - 10 * 60_000).toISOString();
    const old2 = new Date(Date.now() - 7 * 60_000).toISOString();
    const old3 = new Date(Date.now() - 6 * 60_000).toISOString();
    const fresh = new Date(Date.now() - 60_000).toISOString();
    await seedEventRow(old1);
    await seedEventRow(old2);
    await seedEventRow(old3);
    await seedEventRow(fresh);

    expect(await countByLabel("_OntologyEvent")).toBe(4);

    const result = await runAuditRetention(undefined, getDriver(), archiveRoot);
    expect(result.events_purged).toBe(3);
    expect(await countByLabel("_OntologyEvent")).toBe(1);
  });

  test("OPT_ONTOLOGY_AUDIT_RETENTION_DAYS=0 skips archive but still purges events", async () => {
    // Seed aged audit + aged event rows.
    const oldTs = new Date(Date.now() - 400 * 86_400_000).toISOString();
    await seedAuditRow(oldTs, "RetainedProbe");
    const oldEvtTs = new Date(Date.now() - 10 * 60_000).toISOString();
    await seedEventRow(oldEvtTs);

    const prior = process.env.OPT_ONTOLOGY_AUDIT_RETENTION_DAYS;
    process.env.OPT_ONTOLOGY_AUDIT_RETENTION_DAYS = "0";
    try {
      const result = await runAuditRetention(undefined, getDriver(), archiveRoot);
      // Archive pass skipped — 0 archived; aged audit row still present.
      expect(result.archived).toBe(0);
      expect(await countByLabel("_OntologyAudit")).toBe(1);
      // Event purge still ran.
      expect(result.events_purged).toBe(1);
      expect(await countByLabel("_OntologyEvent")).toBe(0);
    } finally {
      if (prior === undefined) {
        delete process.env.OPT_ONTOLOGY_AUDIT_RETENTION_DAYS;
      } else {
        process.env.OPT_ONTOLOGY_AUDIT_RETENTION_DAYS = prior;
      }
    }
  });

  test("pass-1 C-01 / open-accepted #4 grep: source must NOT contain `collect(e)`", () => {
    // The deprecated event-purge shape uses `WITH e RETURN count(e), collect(e)`.
    // Our impl uses a single-statement DELETE returning count, so this grep
    // returns zero hits. Counterexample would mean a regression.
    // `cwd` is the workspace root (one level above api/__tests__).
    const repoRoot = path.resolve(import.meta.dir, "..", "..");
    const output = execSync(
      `grep -F 'collect(e)' api/src/ontology/jobs/audit-retention.ts || true`,
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(output.trim()).toBe("");
  });
});
