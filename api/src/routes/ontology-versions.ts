// T-18c — POST /api/v1/ontology/rollback/:version_id handler stub.
//
// This is a *route stub* for T-17 / T-18 scope. The full rollback executor
// (storage helper that restores a prior schema in a single Neo4j tx and
// writes a new version row pointing at the rolled-back-to schema as parent)
// lands in a follow-on commit.
//
// What this stub does today:
//
//   1. Validates `:version_id` is a UUIDv7 via `parseId`.
//   2. Looks up the version row in `_OntologyVersion` (READ tx).
//   3. Returns 404 not_found when the version_id is unknown.
//   4. Returns 400 rollback_below_bootstrap when the target row is the
//      first `_OntologyVersion` row by `ts ASC` OR carries
//      `summary === "system_bootstrap_seed"` (pass-1 design-review C-03).
//   5. Otherwise returns 501 not_implemented with a `details.hint`
//      pointing at the follow-on commit.
//
// Unblocks the route mount + the integration smoke test without forcing
// the rollback executor to ship in this batch.

import type { Driver } from "neo4j-driver";
import { getDriver } from "../neo4j/driver";
import { error, parseId } from "./_helpers";

// POST /api/v1/ontology/rollback/:version_id
export async function handleRollback(
  _req: Request,
  versionId: string,
): Promise<Response> {
  // Step 1 — UUIDv7 guard.
  const validId = parseId(versionId);
  if (!validId) {
    return error(404, "not_found", `version '${versionId}' not found`, {
      version_id: versionId,
    });
  }

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    // Step 2/3 — lookup; 404 on miss.
    const res = await session.run(
      `MATCH (v:_OntologyVersion {version_id: $vid})
       RETURN v.version_id AS version_id, v.summary AS summary, v.ts AS ts`,
      { vid: validId },
    );
    if (res.records.length === 0) {
      return error(404, "not_found", `version '${versionId}' not found`, {
        version_id: validId,
      });
    }
    const row = res.records[0]!;
    const summary = row.get("summary") as string;
    const ts = row.get("ts") as string;

    // Step 4 — seed-version guard. Two signals:
    //   (a) summary === "system_bootstrap_seed" (the seeder's known marker).
    //   (b) row is the oldest `_OntologyVersion` by `ts ASC` (defence in
    //       depth for hand-seeded fixtures).
    if (summary === "system_bootstrap_seed") {
      return error(
        400,
        "rollback_below_bootstrap",
        "rollback target is the bootstrap-seed version",
        { version_id: validId },
      );
    }
    const oldestRes = await session.run(
      `MATCH (v:_OntologyVersion)
       RETURN v.version_id AS version_id, v.ts AS ts
       ORDER BY v.ts ASC LIMIT 1`,
    );
    const oldestId = oldestRes.records[0]?.get("version_id") as string | undefined;
    const oldestTs = oldestRes.records[0]?.get("ts") as string | undefined;
    if (oldestId === validId || (oldestTs && ts === oldestTs)) {
      return error(
        400,
        "rollback_below_bootstrap",
        "rollback target is at or below the bootstrap-seed version",
        { version_id: validId },
      );
    }

    // Step 5 — stub. Full executor lands in a follow-on commit.
    return error(
      501,
      "not_implemented",
      "rollback executor not yet shipped",
      {
        version_id: validId,
        hint: "Full rollback executor lands in a follow-on commit",
      },
    );
  } finally {
    await session.close();
  }
}
