// T-08 integration test — seedRegistryFromConstTuples.
//
// Verifies (against a live Neo4j instance):
//   • isRegistryEmpty → true on a clean meta-namespace, false after seed.
//   • First seed creates 6 _OntologyNodeLabel rows + 6 _OntologyEdgeType
//     rows + 9 _OntologyEdgeEndpoint rows (the sum of EDGE_ENDPOINTS[t].length
//     across all 6 types).
//   • Endpoint triples match EDGE_ENDPOINTS exactly.
//   • Second seed is idempotent — zero new label / type / endpoint rows,
//     but the version log advances by one (forward-only NFR-04) and there
//     are exactly 1 audit + 1 version + 1 event row per seed call
//     (pass-1 C-03 — single row per seed, not 12).
//   • Row-level idempotency (pass-1 C-12) — drop one label, re-seed, the
//     missing row is re-MERGEd.
//
// Requires Neo4j running (bun run dev OR CI's neo4j sidecar). Describe
// block prefixed `integration:` per the project's bun test:integration
// filter.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { applyMetaSchema } from "../src/ontology/meta-bootstrap";
import {
  isRegistryEmpty,
  seedRegistryFromConstTuples,
} from "../src/ontology/seed";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { EDGE_TYPES, EDGE_ENDPOINTS } from "@companygraph/shared/schema/edges";

// Same coercion helper used elsewhere in the suite — Neo4j counts can
// land as either a plain number (when `disableLosslessIntegers: true`)
// or as a `{low, high}` object.
const toN = (v: unknown): number =>
  typeof v === "number"
    ? v
    : v && typeof (v as { toNumber?: () => number }).toNumber === "function"
      ? (v as { toNumber: () => number }).toNumber()
      : Number(v);

// Expected endpoint-row count = Σ EDGE_ENDPOINTS[t].length.
const EXPECTED_ENDPOINT_COUNT = EDGE_TYPES.reduce(
  (acc, t) => acc + EDGE_ENDPOINTS[t].length,
  0,
);

async function clearMetaNamespace(): Promise<void> {
  // Delete every node whose label namespace starts with `_Ontology`. The
  // graph-core data labels (Domain, UserJourney, …) don't carry the
  // `_Ontology` prefix, so real data survives.
  const driver = getDriver();
  const session = driver.session();
  try {
    await session.run(
      `MATCH (n) WHERE any(l IN labels(n) WHERE l STARTS WITH '_Ontology')
       DETACH DELETE n`,
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

describe("integration: seedRegistryFromConstTuples (T-08 / AC-15)", () => {
  beforeAll(async () => {
    const driver = getDriver();
    // Constraints must exist before the seed runs — the seed relies on
    // them for row uniqueness on retry (`_OntologyNodeLabel.name UNIQUE`
    // etc.). meta-bootstrap is idempotent (AC-14).
    await applyMetaSchema(driver);
    await clearMetaNamespace();
  });

  afterAll(async () => {
    // Leave the meta-namespace clean for the next test run.
    await clearMetaNamespace();
    await closeDriver();
    _resetDriver();
  });

  test("isRegistryEmpty=true on a clean namespace, false after seed", async () => {
    const driver = getDriver();
    expect(await isRegistryEmpty(driver)).toBe(true);

    const result = await seedRegistryFromConstTuples(driver);
    expect(typeof result.version_id).toBe("string");
    expect(typeof result.event_id).toBe("string");
    expect(result.seeded.nodeLabels).toEqual([...NODE_LABELS]);
    expect(result.seeded.edgeTypes).toEqual([...EDGE_TYPES]);

    expect(await isRegistryEmpty(driver)).toBe(false);

    // 6 node labels + 6 edge types + 9 endpoint rows.
    const driverHandle = driver;
    const session = driverHandle.session({ defaultAccessMode: "READ" });
    try {
      const labels = await session
        .run(
          `MATCH (l:_OntologyNodeLabel) RETURN l.name AS name ORDER BY l.name`,
        )
        .then((r) => r.records.map((rec) => rec.get("name") as string));
      expect(labels).toEqual([...NODE_LABELS].sort());

      const types = await session
        .run(
          `MATCH (e:_OntologyEdgeType) RETURN e.name AS name ORDER BY e.name`,
        )
        .then((r) => r.records.map((rec) => rec.get("name") as string));
      expect(types).toEqual([...EDGE_TYPES].sort());

      // Every node label has its matching attribute schema (DESCRIBES edge).
      const schemas = await session
        .run(
          `MATCH (s:_OntologyAttributeSchema)-[:DESCRIBES]->(l:_OntologyNodeLabel)
           RETURN l.name AS name ORDER BY l.name`,
        )
        .then((r) => r.records.map((rec) => rec.get("name") as string));
      expect(schemas).toEqual([...NODE_LABELS].sort());
    } finally {
      await session.close();
    }
  });

  test("_OntologyEdgeEndpoint rows match EDGE_ENDPOINTS exactly", async () => {
    const driver = getDriver();
    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run(
        `MATCH (ep:_OntologyEdgeEndpoint)
         RETURN ep.edge_type_name AS t, ep.from_label AS f, ep.to_label AS to_label
         ORDER BY t, f, to_label`,
      );
      const got = r.records.map((rec) => ({
        t: rec.get("t") as string,
        f: rec.get("f") as string,
        to: rec.get("to_label") as string,
      }));
      expect(got).toHaveLength(EXPECTED_ENDPOINT_COUNT);

      // Cross-check every expected triple is present.
      for (const type of EDGE_TYPES) {
        for (const [from, to] of EDGE_ENDPOINTS[type]) {
          expect(
            got.some((g) => g.t === type && g.f === from && g.to === to),
          ).toBe(true);
        }
      }

      // Every endpoint must point at its parent _OntologyEdgeType via OF_TYPE.
      const ofType = await session.run(
        `MATCH (ep:_OntologyEdgeEndpoint)-[:OF_TYPE]->(e:_OntologyEdgeType)
         RETURN count(ep) AS c`,
      );
      expect(toN(ofType.records[0]?.get("c"))).toBe(EXPECTED_ENDPOINT_COUNT);
    } finally {
      await session.close();
    }
  });

  test("single audit + version + event row per seed (pass-1 C-03)", async () => {
    // After the first seed (run in the prior test in this describe block),
    // there should be exactly 1 audit, 1 version, and 1 event row.
    expect(await countByLabel("_OntologyAudit")).toBe(1);
    expect(await countByLabel("_OntologyVersion")).toBe(1);
    expect(await countByLabel("_OntologyEvent")).toBe(1);
  });

  test("idempotent re-run — no new label/type/endpoint rows; +1 audit/version/event", async () => {
    const driver = getDriver();

    const beforeLabels = await countByLabel("_OntologyNodeLabel");
    const beforeTypes = await countByLabel("_OntologyEdgeType");
    const beforeEndpoints = await countByLabel("_OntologyEdgeEndpoint");
    const beforeAttrSchemas = await countByLabel("_OntologyAttributeSchema");
    const beforeAudits = await countByLabel("_OntologyAudit");
    const beforeVersions = await countByLabel("_OntologyVersion");
    const beforeEvents = await countByLabel("_OntologyEvent");

    const second = await seedRegistryFromConstTuples(driver);
    expect(typeof second.version_id).toBe("string");

    expect(await countByLabel("_OntologyNodeLabel")).toBe(beforeLabels);
    expect(await countByLabel("_OntologyEdgeType")).toBe(beforeTypes);
    expect(await countByLabel("_OntologyEdgeEndpoint")).toBe(beforeEndpoints);
    expect(await countByLabel("_OntologyAttributeSchema")).toBe(beforeAttrSchemas);

    // Version log is forward-only (NFR-04). Each seed call writes
    // exactly one row across each of audit/version/event.
    expect(await countByLabel("_OntologyAudit")).toBe(beforeAudits + 1);
    expect(await countByLabel("_OntologyVersion")).toBe(beforeVersions + 1);
    expect(await countByLabel("_OntologyEvent")).toBe(beforeEvents + 1);

    // Total after two seeds: exactly 2 of each (sanity).
    expect(await countByLabel("_OntologyAudit")).toBe(2);
    expect(await countByLabel("_OntologyVersion")).toBe(2);
    expect(await countByLabel("_OntologyEvent")).toBe(2);
  });

  test("row-level idempotency (pass-1 C-12) — missing label is re-MERGEd", async () => {
    const driver = getDriver();

    // Pick the first label and drop its _OntologyNodeLabel row (plus its
    // DESCRIBES partner) to simulate a mid-loop crash. The retry must
    // re-MERGE the missing row.
    const victim = NODE_LABELS[0];
    const session = driver.session();
    try {
      await session.run(
        `MATCH (l:_OntologyNodeLabel {name: $name}) DETACH DELETE l`,
        { name: victim },
      );
      // Also remove the orphan attribute schema row — its label_name is
      // UNIQUE so otherwise the MERGE on (label_name=$name) would re-bind
      // to it without going through the re-MERGE-on-name path.
      await session.run(
        `MATCH (s:_OntologyAttributeSchema {label_name: $name}) DETACH DELETE s`,
        { name: victim },
      );
    } finally {
      await session.close();
    }

    // Confirm the row is gone.
    const session2 = driver.session({ defaultAccessMode: "READ" });
    try {
      const r = await session2.run(
        `MATCH (l:_OntologyNodeLabel {name: $name}) RETURN count(l) AS c`,
        { name: victim },
      );
      expect(toN(r.records[0]?.get("c"))).toBe(0);
    } finally {
      await session2.close();
    }

    // Re-seed — the missing row must be re-created.
    await seedRegistryFromConstTuples(driver);

    const session3 = driver.session({ defaultAccessMode: "READ" });
    try {
      const r = await session3.run(
        `MATCH (l:_OntologyNodeLabel {name: $name}) RETURN count(l) AS c`,
        { name: victim },
      );
      expect(toN(r.records[0]?.get("c"))).toBe(1);

      // Total label count is back to NODE_LABELS.length.
      const total = await session3.run(
        `MATCH (l:_OntologyNodeLabel) RETURN count(l) AS c`,
      );
      expect(toN(total.records[0]?.get("c"))).toBe(NODE_LABELS.length);
    } finally {
      await session3.close();
    }
  });
});
