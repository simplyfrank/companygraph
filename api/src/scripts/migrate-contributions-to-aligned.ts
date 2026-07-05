// kpi-measurement-alignment FR-05 — one-time migration script.
// Converts existing KPI CONTRIBUTES_TO edges to ALIGNED_TO, preserving
// weight and adding attribution_type if missing. Idempotent (MERGE).
//
// Usage: bun run api/src/scripts/migrate-contributions-to-aligned.ts

import { getDriver } from "../neo4j/driver";

async function migrate() {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    // Convert CONTRIBUTES_TO → ALIGNED_TO with MERGE (idempotent)
    const result = await session.run(
      `MATCH (k:KPI)-[old:CONTRIBUTES_TO]->(t)
       WHERE k.archived_at IS NULL
       MERGE (k)-[new:ALIGNED_TO]->(t)
       SET new.weight = old.weight,
           new.attribution_type = coalesce(old.attribution_type, 'direct'),
           new.alignment_notes = old.alignment_notes,
           new.created_at = old.created_at,
           new.migrated_from = 'CONTRIBUTES_TO'
       DELETE old
       RETURN count(old) AS converted`,
    );

    const converted = result.records[0]?.get("converted")?.toNumber() ?? 0;
    console.log(`[migration] Converted ${converted} CONTRIBUTES_TO → ALIGNED_TO edges (idempotent).`);

    // Verify no KPI CONTRIBUTES_TO edges remain
    const verify = await session.run(
      `MATCH (k:KPI)-[r:CONTRIBUTES_TO]->() RETURN count(r) AS remaining`,
    );
    const remaining = verify.records[0]?.get("remaining")?.toNumber() ?? 0;
    if (remaining > 0) {
      console.warn(`[migration] WARNING: ${remaining} KPI CONTRIBUTES_TO edges still remain (archived KPIs skipped).`);
    } else {
      console.log("[migration] All KPI CONTRIBUTES_TO edges converted successfully.");
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

migrate().catch((err) => {
  console.error("[migration] FAILED:", err);
  process.exit(1);
});
