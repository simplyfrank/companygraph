// T-18c — POST /api/v1/ontology/rollback/:version_id handler (design §4.8, FR-18).
//
// Route guards (READ tx):
//   1. Validates `:version_id` is a UUIDv7 via `parseId`.
//   2. Looks up the version row in `_OntologyVersion` (READ tx).
//   3. Returns 404 not_found when the version_id is unknown.
//   4. Returns 400 rollback_below_bootstrap when the target row is the
//      first `_OntologyVersion` row by `ts ASC` OR carries
//      `summary === "system_bootstrap_seed"` (pass-1 design-review C-03).
//
// After guards pass, delegates to `executeRollback` (ontology/storage/rollback.ts)
// which runs the inverse audit replay in a single executeWrite transaction.
// Post-commit `ontologyEvents.emit("ontology.changed")` fires from here.

import type { Driver } from "neo4j-driver";
import { getDriver } from "../neo4j/driver";
import { executeRollback } from "../ontology/storage/rollback";
import { ontologyEvents } from "../ontology/events";
import { ok, error, parseId } from "./_helpers";

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

    // Step 5 — execute rollback.
    const actorParam = new URL(_req.url).searchParams.get("actor") ?? "api:rollback";
    // Close the read session before opening the write tx inside executeRollback.
    await session.close();
    const result = await executeRollback(driver, validId, actorParam);
    ontologyEvents.emit("ontology.changed", {
      event_id: result.version_id,
      version_id: result.version_id,
      ts: new Date().toISOString(),
      diff: [{ op: "test", path: "/rollback/target", value: validId }],
    });
    return ok(result);
  } finally {
    // session may already be closed above; close() on an already-closed
    // session is a no-op in the neo4j-driver v5 API.
    try { await session.close(); } catch { /* already closed */ }
  }
}
