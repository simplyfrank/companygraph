// T-20 — Daily audit-retention cron job (design §10 / FR-13a).
//
// Two logically independent passes (pass-1 C-07):
//
//   Pass A: audit archive — gated by `OPT_ONTOLOGY_AUDIT_RETENTION_DAYS`.
//     • If 0 (or unset → defaults to 365), the pass writes
//       `_OntologyAudit` rows older than the cutoff to
//       `data/ontology-manager/audit-archive/YYYY-MM.jsonl.gz`, fsyncs
//       the archive file, THEN deletes the archived rows from Neo4j
//       (two-step delete-after-archive — pass-1 N-08). A crash between
//       archive-write and delete re-archives the same rows on the next
//       run; gzip-append safety + no dedup needed for downstream readers.
//     • If 0, the pass is skipped — operators that want "keep audit
//       forever" set the env var to 0.
//
//   Pass B: SSE event-buffer purge — ALWAYS runs (independent of the
//     retention env var). `_OntologyEvent` rows older than 5 minutes
//     are deleted in a single-statement DELETE returning count
//     (pass-1 N-10 + open-accepted #4 — no wasteful
//     `WITH e RETURN count(e), collect-then-delete`).
//
// Both passes are SIGTERM-aware via the caller's process-level signal
// handler in `api/src/server.ts`. This module itself does no signal
// handling — it exits cleanly if `executeRead` / `executeWrite` is
// interrupted mid-tx.

import { createGzip } from "node:zlib";
import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Driver } from "neo4j-driver";
import { getDriver } from "../../neo4j/driver";
import { deserializeAudit } from "../storage/audit";

export interface RetentionResult {
  archived: number;
  events_purged: number;
}

const ARCHIVE_BATCH_LIMIT = 10000;
const EVENT_RETENTION_MINUTES = 5;

const toN = (v: unknown): number =>
  typeof v === "number"
    ? v
    : v && typeof (v as { toNumber?: () => number }).toNumber === "function"
      ? (v as { toNumber: () => number }).toNumber()
      : Number(v);

// Drains a gzip stream piped to a file write stream; fsyncs the underlying
// fd on close so the archive is durable before we DELETE the source rows.
async function flushAndFsync(
  gzipStream: import("node:zlib").Gzip,
  archivePath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    gzipStream.end(async () => {
      try {
        const fd = await fs.open(archivePath, "r+");
        await fd.sync();
        await fd.close();
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Pass A: archive `_OntologyAudit` rows older than `retentionDays` to a
// monthly gzipped JSONL, fsync, then delete. Returns the count archived.
async function runAuditArchive(
  driver: Driver,
  now: Date,
  retentionDays: number,
  archiveRoot: string,
): Promise<number> {
  if (retentionDays <= 0) return 0;

  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000).toISOString();
  const monthKey = now.toISOString().slice(0, 7); // "YYYY-MM"
  const archivePath = path.join(archiveRoot, `${monthKey}.jsonl.gz`);

  await fs.mkdir(path.dirname(archivePath), { recursive: true });

  // Step 1 (transaction A): READ rows + WRITE to archive. No deletes yet.
  const archiveStream = createWriteStream(archivePath, { flags: "a" });
  const gzipStream = createGzip();
  gzipStream.pipe(archiveStream);

  let archived = 0;
  const session = driver.session();
  try {
    const result = await session.executeRead((tx) =>
      // `LIMIT` is a literal integer in Cypher — interpolated rather than
      // parameterised because `disableLosslessIntegers: true` on the
      // driver coerces JS numbers to floats, which Cypher rejects with
      // "Invalid input. '10000.0' is not a valid value. Must be a
      // non-negative integer." ARCHIVE_BATCH_LIMIT is a compile-time
      // constant so interpolation is safe.
      tx.run(
        `MATCH (a:_OntologyAudit) WHERE a.ts < $cutoff
         RETURN a.ts AS ts, a.actor AS actor, a.action AS action,
                a.target AS target, a.before_json AS before_json,
                a.after_json AS after_json, a.diff_jsonpatch AS diff_jsonpatch,
                a.version_id AS version_id
         ORDER BY a.ts ASC LIMIT ${ARCHIVE_BATCH_LIMIT}`,
        { cutoff },
      ),
    );
    for (const record of result.records) {
      const row = deserializeAudit(record);
      gzipStream.write(JSON.stringify(row) + "\n");
      archived++;
    }
  } finally {
    await session.close();
  }

  // Flush + fsync — durability gate. If this throws, the archive is
  // unreliable and we do NOT proceed to Step 2.
  await flushAndFsync(gzipStream, archivePath);

  // Step 2 (transaction B): DELETE only the archived rows. Re-matches on
  // the same `cutoff` + LIMIT — the universe is monotonic (no new rows
  // can land below the cutoff during this window), so the second match
  // hits exactly the rows we just archived.
  if (archived > 0) {
    const session2 = driver.session();
    try {
      await session2.executeWrite((tx) =>
        tx.run(
          `MATCH (a:_OntologyAudit) WHERE a.ts < $cutoff
           WITH a ORDER BY a.ts ASC LIMIT ${ARCHIVE_BATCH_LIMIT}
           DELETE a`,
          { cutoff },
        ),
      );
    } finally {
      await session2.close();
    }
  }

  return archived;
}

// Pass B: purge SSE `_OntologyEvent` rows older than 5 minutes. Always
// runs, regardless of `OPT_ONTOLOGY_AUDIT_RETENTION_DAYS` (pass-1 C-07).
// Single-statement DELETE returning count — no `WITH e ... collect-then-delete`
// materialisation (pass-1 N-10 + open-accepted #4).
async function runEventPurge(driver: Driver, now: Date): Promise<number> {
  const cutoff = new Date(
    now.getTime() - EVENT_RETENTION_MINUTES * 60_000,
  ).toISOString();
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      // Count first, then DELETE in the same tx so the returned number
      // matches what's actually removed. The two-statement form keeps
      // the query simple and AVOIDS the `WITH e RETURN count(e), collect-then-delete`
      // materialisation that pass-1 C-01 / open-accepted #4 explicitly
      // dropped — no `collect(...)` here at all.
      const countRes = await tx.run(
        `MATCH (e:_OntologyEvent) WHERE e.ts < $cutoff RETURN count(e) AS c`,
        { cutoff },
      );
      const count = toN(countRes.records[0]?.get("c") ?? 0);
      if (count > 0) {
        await tx.run(
          `MATCH (e:_OntologyEvent) WHERE e.ts < $cutoff DETACH DELETE e`,
          { cutoff },
        );
      }
      return count;
    });
  } finally {
    await session.close();
  }
}

// Public entry point. Pass `nowOverride` + `driverOverride` from tests
// to control the time anchor + the Neo4j connection (the production
// caller in server.ts uses the singletons).
export async function runAuditRetention(
  nowOverride?: Date,
  driverOverride?: Driver,
  archiveRootOverride?: string,
): Promise<RetentionResult> {
  const now = nowOverride ?? new Date();
  const driver = driverOverride ?? getDriver();
  const archiveRoot =
    archiveRootOverride ?? "data/ontology-manager/audit-archive";

  const retentionDays = Number(
    process.env.OPT_ONTOLOGY_AUDIT_RETENTION_DAYS ?? "365",
  );

  const archived = await runAuditArchive(driver, now, retentionDays, archiveRoot);
  const events_purged = await runEventPurge(driver, now);

  return { archived, events_purged };
}
