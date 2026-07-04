// system-augmentation-model T-06 — migration integration suite
// (AC-08 + AC-08a/b/c/d, re-run quiet, Risk-5 report; FR-06, FR-07).
//
// Six legs against live Neo4j:
//   1. AC-08  — stale DB (permissive doc + Systems missing systemKind) →
//               `runSystemKindMigration` tightens the doc, backfills every
//               System to "functional", writes an `_OntologyEvent` row.
//   2. quiet  — second run mutates ZERO data rows and adds ZERO new
//               `_OntologyEvent` / `_OntologyVersion` rows (req-review N-01).
//   3. AC-08a — same stale setup, `applySchema(driver)` (the bootstrap
//               entry `server.ts` awaits) yields the migrated post-conditions.
//   4. AC-08b — stale setup, `Bun.spawn` of `scripts/migrate-system-kind.ts`
//               from `api/` exits 0 with the same post-conditions.
//   5. AC-08c — empty registry → `applySchema` seeds the tightened doc
//               DIRECTLY: exactly one new `_OntologyEvent` (the single
//               bootstrap-seed event), no patch/backfill event rows.
//   6. Risk-5 — a hand-planted `systemKind:"bogus"` System is counted in
//               `invalidValueCount` and NOT rewritten.
//   7. AC-08d — merge-preserve (DD-14): a System doc that is neither
//               permissive nor tightened (extra `properties.owner` +
//               `required:["owner"]`) keeps `owner` after migration.
//
// Requires Neo4j running. Test names prefixed `integration:`.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { v7 as uuidV7 } from "uuid";
import {
  SYSTEM_KINDS,
  SYSTEM_ATTRIBUTES_JSON_SCHEMA_DOC,
} from "@companygraph/shared/schema/system-kind";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { applySchema } from "../src/neo4j/bootstrap";
import { runSystemKindMigration } from "../src/ontology/system-kind-migration";
import { _clearAttributeZodCache } from "../src/ontology/cache/attribute-zod";

const API_DIR = join(import.meta.dir, "..");
const PERMISSIVE_DOC = { type: "object", additionalProperties: true };

const toN = (v: unknown): number =>
  typeof v === "number"
    ? v
    : v != null && typeof (v as { toNumber?: () => number }).toNumber === "function"
      ? (v as { toNumber: () => number }).toNumber()
      : Number(v);

async function runCypher(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<Array<Record<string, unknown>>> {
  const session = getDriver().session();
  try {
    const r = await session.run(cypher, params);
    return r.records.map((rec) =>
      Object.fromEntries(rec.keys.map((k) => [k, rec.get(k as string)])),
    );
  } finally {
    await session.close();
  }
}

async function readSystemDoc(): Promise<{
  required?: string[];
  properties?: Record<string, { type?: string; enum?: string[]; default?: unknown }>;
} | null> {
  const rows = await runCypher(
    `MATCH (s:_OntologyAttributeSchema {label_name: "System"}) RETURN s.json_schema_doc AS jsd`,
  );
  const jsd = rows[0]?.jsd as string | null | undefined;
  return jsd ? JSON.parse(jsd) : null;
}

// Direct-Cypher doc rewrite (test scaffolding only — bypasses audit on
// purpose so setup doesn't pollute the event/version counters under test).
async function setSystemDocRaw(doc: unknown): Promise<void> {
  await runCypher(
    `MATCH (s:_OntologyAttributeSchema {label_name: "System"})
     SET s.json_schema_doc = $jsd, s.updated_at = $now`,
    { jsd: JSON.stringify(doc), now: new Date().toISOString() },
  );
  _clearAttributeZodCache();
}

// Strip systemKind from every System's attributes map (stale-DB shape).
async function stripSystemKind(): Promise<void> {
  await runCypher(
    `MATCH (n:System)
     WITH n, apoc.convert.fromJsonMap(coalesce(n.attributes_json, "{}")) AS attrs
     WHERE attrs.systemKind IS NOT NULL
     SET n.attributes_json = apoc.convert.toJson(apoc.map.removeKey(attrs, "systemKind"))`,
  );
}

async function makeStale(): Promise<void> {
  await setSystemDocRaw(PERMISSIVE_DOC);
  await stripSystemKind();
}

async function plantSystem(id: string, attributesJson: string): Promise<void> {
  const now = new Date().toISOString();
  await runCypher(
    `MERGE (n:System {id: $id})
     SET n.name = $name, n.description = "T-06 plant", n.createdAt = $now,
         n.updatedAt = $now, n.attributes_json = $aj`,
    { id, name: `t06-${id.slice(-6)}`, now, aj: attributesJson },
  );
}

async function deleteSystem(id: string): Promise<void> {
  await runCypher(`MATCH (n:System {id: $id}) DETACH DELETE n`, { id });
}

async function countLabel(label: string): Promise<number> {
  const rows = await runCypher(`MATCH (n:\`${label}\`) RETURN count(n) AS c`);
  return toN(rows[0]?.c);
}

// The migration's registry patch is uniquely identified by its
// `_OntologyVersion` actor ("system:migration:system-kind") — counting
// those rows proves whether the migration wrote patch/backfill events,
// independent of what other bootstrap steps emit.
async function countMigrationVersions(): Promise<number> {
  const rows = await runCypher(
    `MATCH (v:_OntologyVersion {actor: "system:migration:system-kind"})
     RETURN count(v) AS c`,
  );
  return toN(rows[0]?.c);
}

async function systemKindDistribution(): Promise<{ total: number; functional: number; invalid: number }> {
  const rows = await runCypher(
    `MATCH (n:System)
     WITH apoc.convert.fromJsonMap(coalesce(n.attributes_json, "{}")) AS attrs
     RETURN count(*) AS total,
            count(CASE WHEN attrs.systemKind = "functional" THEN 1 END) AS functional,
            count(CASE WHEN attrs.systemKind IS NULL OR NOT attrs.systemKind IN $kinds THEN 1 END) AS invalid`,
    { kinds: [...SYSTEM_KINDS] },
  );
  return {
    total: toN(rows[0]?.total),
    functional: toN(rows[0]?.functional),
    invalid: toN(rows[0]?.invalid),
  };
}

function expectTightened(doc: Awaited<ReturnType<typeof readSystemDoc>>): void {
  expect(doc).toBeTruthy();
  expect(doc!.properties?.systemKind?.enum).toEqual([...SYSTEM_KINDS]);
  expect(doc!.required ?? []).toContain("systemKind");
  expect("default" in (doc!.properties?.systemKind ?? {})).toBe(false);
}

const PLANT_A = uuidV7();
const PLANT_B = uuidV7();

describe("integration: systemKind migration (AC-08 + a/b/c/d)", () => {
  beforeAll(async () => {
    // Guarantee the registry (and the System row) exists whatever state
    // the DB is in; idempotent.
    await applySchema(getDriver());
    // Plant two Systems the stale-DB legs can observe.
    await plantSystem(PLANT_A, "{}");
    await plantSystem(PLANT_B, JSON.stringify({ owner: "ops" }));
  });

  afterAll(async () => {
    await deleteSystem(PLANT_A);
    await deleteSystem(PLANT_B);
    // Leave the DB in the canonical migrated state.
    await runSystemKindMigration(getDriver());
    await closeDriver();
    _resetDriver();
  });

  test("integration: AC-08 — stale DB is tightened + backfilled with an event row", async () => {
    await makeStale();
    const eventsBefore = await countLabel("_OntologyEvent");

    const result = await runSystemKindMigration(getDriver());

    expect(result.registryPatched).toBe(true);
    expectTightened(await readSystemDoc());
    const dist = await systemKindDistribution();
    expect(dist.total).toBeGreaterThanOrEqual(2);
    expect(dist.functional).toBe(dist.total); // every System → "functional"
    expect(dist.invalid).toBe(0);
    // The patch tx wrote an _OntologyEvent row.
    expect(await countLabel("_OntologyEvent")).toBeGreaterThan(eventsBefore);
    // The open attributes map survives the backfill (merge, not replace).
    const rows = await runCypher(
      `MATCH (n:System {id: $id}) RETURN n.attributes_json AS aj`,
      { id: PLANT_B },
    );
    expect(JSON.parse(rows[0]!.aj as string)).toEqual({ owner: "ops", systemKind: "functional" });
  });

  test("integration: re-run is quiet — zero data mutations, zero new event/version rows", async () => {
    const eventsBefore = await countLabel("_OntologyEvent");
    const versionsBefore = await countLabel("_OntologyVersion");
    const snapshotBefore = await runCypher(
      `MATCH (n:System) RETURN n.id AS id, n.updatedAt AS u ORDER BY n.id`,
    );

    const result = await runSystemKindMigration(getDriver());

    expect(result.registryPatched).toBe(false);
    expect(result.backfilledCount).toBe(0);
    expect(await countLabel("_OntologyEvent")).toBe(eventsBefore);
    expect(await countLabel("_OntologyVersion")).toBe(versionsBefore);
    const snapshotAfter = await runCypher(
      `MATCH (n:System) RETURN n.id AS id, n.updatedAt AS u ORDER BY n.id`,
    );
    expect(snapshotAfter).toEqual(snapshotBefore);
  });

  test("integration: AC-08a — bootstrap mode: applySchema on a stale DB migrates", async () => {
    await makeStale();

    await applySchema(getDriver());

    expectTightened(await readSystemDoc());
    const dist = await systemKindDistribution();
    expect(dist.functional).toBe(dist.total);
  });

  test("integration: AC-08b — standalone mode: scripts/migrate-system-kind.ts exits 0 and migrates", async () => {
    await makeStale();

    const proc = Bun.spawn(["bun", "scripts/migrate-system-kind.ts"], {
      cwd: API_DIR,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);
    // The runner prints the result JSON.
    const lastLine = stdout.trim().split("\n").at(-1) ?? "";
    const printed = JSON.parse(lastLine) as { registryPatched: boolean };
    expect(printed.registryPatched).toBe(true);

    expectTightened(await readSystemDoc());
    const dist = await systemKindDistribution();
    expect(dist.functional).toBe(dist.total);
  });

  test("integration: AC-08c — fresh DB: the seed writes the tightened doc directly (no patch/backfill events)", async () => {
    // Empty the node-label registry (labels + attribute schemas — leaving
    // orphan schema rows would make the seed's MERGE keep stale docs).
    await runCypher(
      `MATCH (l:_OntologyNodeLabel)
       OPTIONAL MATCH (l)<-[:DESCRIBES]-(s:_OntologyAttributeSchema)
       OPTIONAL MATCH (l)<-[:ALIGNS]-(a:_OntologyAlignment)
       DETACH DELETE l, s, a`,
    );
    _clearAttributeZodCache();
    const eventsBefore = await countLabel("_OntologyEvent");
    const migrationVersionsBefore = await countMigrationVersions();

    await applySchema(getDriver());

    // Tightened directly by the seed — the migration found nothing to do,
    // so it contributed ZERO patch/backfill event rows. (Other bootstrap
    // steps — e.g. model-workspace-core's registerModelSchema — legally
    // re-register their own labels on an emptied registry and emit their
    // own events, so an exact total-count assertion is not robust; the
    // migration's signature is its `_OntologyVersion` actor.)
    expectTightened(await readSystemDoc());
    expect(await countLabel("_OntologyEvent")).toBeGreaterThan(eventsBefore); // the seed event fired
    expect(await countMigrationVersions()).toBe(migrationVersionsBefore); // migration wrote nothing
    // A follow-up run reports registryPatched=false (already tightened).
    const result = await runSystemKindMigration(getDriver());
    expect(result.registryPatched).toBe(false);
  });

  test("integration: Risk-5 — non-enum systemKind is reported, never rewritten", async () => {
    const bogusId = uuidV7();
    await plantSystem(bogusId, JSON.stringify({ systemKind: "bogus" }));
    try {
      const result = await runSystemKindMigration(getDriver());
      expect(result.invalidValueCount).toBeGreaterThanOrEqual(1);
      const rows = await runCypher(
        `MATCH (n:System {id: $id}) RETURN n.attributes_json AS aj`,
        { id: bogusId },
      );
      expect((JSON.parse(rows[0]!.aj as string) as { systemKind: string }).systemKind).toBe("bogus");
    } finally {
      await deleteSystem(bogusId);
    }
  });

  test("integration: AC-08d — merge-preserve (DD-14): operator additions to the System doc survive", async () => {
    // Neither permissive nor tightened: extra owner property + required.
    await setSystemDocRaw({
      type: "object",
      additionalProperties: true,
      required: ["owner"],
      properties: { owner: { type: "string" } },
    });
    try {
      const result = await runSystemKindMigration(getDriver());
      expect(result.registryPatched).toBe(true);

      const doc = await readSystemDoc();
      expectTightened(doc);
      // The untouched operator additions survive the read-merge-write.
      expect(doc!.properties?.owner).toEqual({ type: "string" });
      expect(doc!.required).toContain("owner");
    } finally {
      // Restore the canonical tightened doc (scaffolding cleanup).
      await setSystemDocRaw(SYSTEM_ATTRIBUTES_JSON_SCHEMA_DOC);
    }
  });
});
