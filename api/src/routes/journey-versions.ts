// Journey versioning handlers for US-JM-06: Journey Versioning
// Provides version history, rollback capabilities, and change tracking for journeys

import type { Driver } from "neo4j-driver";
import { getDriver } from "../neo4j/driver";
import { ok, error, parseId } from "./_helpers";
import { generateId } from "../ids";

// GET /api/v1/journeys/:id/versions - list version history for a journey
export async function handleJourneyVersions(_req: Request, journeyId: string): Promise<Response> {
  const id = parseId(journeyId);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: journeyId });

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    // Check if journey exists
    const journeyCheck = await session.run(
      "MATCH (j:UserJourney {id: $id}) RETURN j.id AS id, j.version AS current_version",
      { id }
    );
    if (journeyCheck.records.length === 0) {
      return error(404, "not_found", "journey not found", { id });
    }

    const currentVersion = journeyCheck.records[0]?.get("current_version") ?? 1;

    // Current state as a synthetic version entry
    const currentResult = await session.run(
      `MATCH (j:UserJourney {id: $id})
       RETURN j.id AS journey_id, j.name AS journey_name, j.version AS version,
              j.created_at AS created_at, j.updated_at AS updated_at`,
      { id },
    );

    // Historical snapshots
    const snapshotResult = await session.run(
      `MATCH (j:UserJourney {id: $id})-[:HAS_SNAPSHOT]->(snap:JourneySnapshot)
       RETURN snap.id AS version_id, snap.journey_id AS journey_id, j.name AS journey_name,
              snap.version AS version, snap.name AS snap_name,
              snap.snapshotted_at AS snapshotted_at
       ORDER BY snap.version DESC`,
      { id },
    );

    const currentRow = currentResult.records[0];
    const rows = [
      ...(currentRow ? [{
        version_id: currentRow.get("journey_id"),
        journey_id: currentRow.get("journey_id"),
        journey_name: currentRow.get("journey_name"),
        version: currentRow.get("version"),
        summary: "current",
        created_at: currentRow.get("created_at"),
        updated_at: currentRow.get("updated_at"),
      }] : []),
      ...snapshotResult.records.map((r) => ({
        version_id: r.get("version_id"),
        journey_id: r.get("journey_id"),
        journey_name: r.get("journey_name"),
        version: r.get("version"),
        summary: `snapshot before v${(r.get("version") as number) + 1}`,
        snap_name: r.get("snap_name"),
        created_at: r.get("snapshotted_at"),
        updated_at: r.get("snapshotted_at"),
      })),
    ];

    return ok({ rows, current_version: currentVersion });
  } finally {
    await session.close();
  }
}

// POST /api/v1/journeys/:id/rollback/:version - rollback journey to a specific version
export async function handleJourneyRollback(
  _req: Request,
  journeyId: string,
  version: string,
): Promise<Response> {
  const id = parseId(journeyId);
  if (!id) return error(400, "invalid_payload", "malformed journey id", { id: journeyId });

  const targetVersion = parseInt(version, 10);
  if (isNaN(targetVersion) || targetVersion < 1) {
    return error(400, "invalid_payload", "invalid version number", { version });
  }

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  let sessionClosed = false;

  try {
    // Check if journey exists
    const journeyCheck = await session.run(
      "MATCH (j:UserJourney {id: $id}) RETURN j.id AS id, j.version AS current_version",
      { id }
    );
    if (journeyCheck.records.length === 0) {
      return error(404, "not_found", "journey not found", { id });
    }

    const currentVersion = journeyCheck.records[0]?.get("current_version") ?? 1;

    // Guard: cannot rollback to current version
    if (targetVersion === currentVersion) {
      return error(400, "invalid_payload", "target version is the current version", {
        current_version: currentVersion,
        target_version: targetVersion,
      });
    }

    // Guard: cannot rollback to version 1 (initial version)
    if (targetVersion === 1) {
      return error(400, "invalid_payload", "cannot rollback to initial version", {
        target_version: targetVersion,
      });
    }

    // Guard: cannot rollback to a version greater than current
    if (targetVersion > currentVersion) {
      return error(400, "invalid_payload", "target version is greater than current version", {
        current_version: currentVersion,
        target_version: targetVersion,
      });
    }

    // Find the snapshot for the target version
    const snapshotResult = await session.run(
      `MATCH (j:UserJourney {id: $id})-[:HAS_SNAPSHOT]->(snap:JourneySnapshot {version: $targetVersion})
       RETURN snap`,
      { id, targetVersion },
    );

    if (snapshotResult.records.length === 0) {
      return error(404, "not_found", "no snapshot found for target version", {
        journey_id: id,
        target_version: targetVersion,
        hint: "snapshots are created automatically when a journey is updated via PATCH",
      });
    }

    const snap = snapshotResult.records[0]?.get("snap").properties;
    const now = new Date().toISOString();

    // Close the read session and open a write session for the rollback
    await session.close();
    sessionClosed = true;
    const writeSession = driver.session();
    try {
      // Snapshot current state before overwriting, then restore
      await writeSession.executeWrite(async (tx) => {
        const preRollbackSnapshotId = generateId();
        await tx.run(
          `MATCH (j:UserJourney {id: $id})
           CREATE (snap:JourneySnapshot {
             id: $snapshotId,
             journey_id: $id,
             version: j.version,
             name: j.name,
             description: j.description,
             accountable_role: j.accountable_role,
             team_assignments: j.team_assignments,
             compliance_tags: j.compliance_tags,
             sla_target_hours: j.sla_target_hours,
             kpi_target: j.kpi_target,
             snapshotted_at: $now
           })
           CREATE (j)-[:HAS_SNAPSHOT]->(snap)`,
          { id, snapshotId: preRollbackSnapshotId, now },
        );
        await tx.run(
          `MATCH (j:UserJourney {id: $id})
           SET j.name = $name,
               j.description = $description,
               j.accountable_role = $accountable_role,
               j.team_assignments = $team_assignments,
               j.compliance_tags = $compliance_tags,
               j.sla_target_hours = $sla_target_hours,
               j.kpi_target = $kpi_target,
               j.version = $targetVersion,
               j.updated_at = $now
           RETURN j`,
          {
            id,
            name: snap.name,
            description: snap.description ?? null,
            accountable_role: snap.accountable_role ?? null,
            team_assignments: snap.team_assignments ?? [],
            compliance_tags: snap.compliance_tags ?? [],
            sla_target_hours: snap.sla_target_hours ?? null,
            kpi_target: snap.kpi_target ?? null,
            targetVersion,
            now,
          },
        );
      });
    } finally {
      await writeSession.close();
    }

    return ok({
      journey_id: id,
      rolled_back_to_version: targetVersion,
      previous_version: currentVersion,
      restored_at: now,
    });
  } finally {
    if (!sessionClosed) await session.close();
  }
}

// GET /api/v1/journeys/:id/changes - list change history for a journey
export async function handleJourneyChanges(_req: Request, journeyId: string): Promise<Response> {
  const id = parseId(journeyId);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: journeyId });

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    // Check if journey exists
    const journeyCheck = await session.run(
      "MATCH (j:UserJourney {id: $id}) RETURN j.id AS id",
      { id }
    );
    if (journeyCheck.records.length === 0) {
      return error(404, "not_found", "journey not found", { id });
    }

    const result = await session.run(
      `MATCH (j:UserJourney {id: $id})-[:HAS_SNAPSHOT]->(snap:JourneySnapshot)
       RETURN snap.id AS snapshot_id, snap.journey_id AS journey_id,
              snap.version AS from_version,
              snap.name AS name,
              snap.snapshotted_at AS timestamp
       ORDER BY snap.version DESC`,
      { id },
    );

    const rows = result.records.map((r) => ({
      snapshot_id: r.get("snapshot_id"),
      journey_id: r.get("journey_id"),
      action: "update",
      from_version: r.get("from_version"),
      name: r.get("name"),
      timestamp: r.get("timestamp"),
    }));

    return ok({ rows });
  } finally {
    await session.close();
  }
}
