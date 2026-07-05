// model-workspace-core T-06..T-09 + T-22 (design §3.3, §3.4, §4.4, §4.5)
// — BusinessModule catalog, immutable version snapshots (publish),
// per-model instantiation, lazy copy-on-write fork with the
// instance-qualified `forkLocalKey` anchor, explicit upgrade, and the
// (type, endpoints)-addressed instance edge writes.
//
// Version content is a serialized `snapshot_json` blob (design rule 3):
// there is NO version-owned live node the generic path could address,
// so version immutability is structural. Fork is the only thing that
// materializes live nodes, and it materializes them INTO THE MODEL
// (PART_OF the instance's targetDomainId), never into the version.

import { createHash } from "node:crypto";
import type { Driver, ManagedTransaction } from "neo4j-driver";
import type {
  Snapshot,
  VersionRead,
  InstanceRead,
  InstanceContent,
  InstanceEdgeInput,
  ModuleCreateInput,
  ModuleRead,
} from "@companygraph/shared/schema/model-workspace";
import { generateId } from "../ids";
import { ValidationError, isConstraintViolation } from "../errors";

// ---------------------------------------------------------------------------
// Canonical serialization + checksum (design §3.3, resolves C-04/N-05/N-08)
// ---------------------------------------------------------------------------

// Canonical JSON: object keys sorted lexicographically (US-ASCII
// code-point order) at every depth; no insignificant whitespace; arrays
// kept in their STORED order (never re-sorted by content hash); numbers
// in the ECMAScript `Number#toString` form — i.e. exactly what
// JSON.stringify produces (N-05: no custom number formatting); strings
// emitted verbatim as UTF-8.
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort(); // default sort = UTF-16 code-unit order ≡ US-ASCII code-point order for ASCII keys
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`)
    .join(",")}}`;
}

// Covers the snapshot object only — never the version node's own id or
// envelope fields (publishedAt/version). Shared reference UUIDs inside
// the *Refs rows are part of the snapshot content and ARE covered (N-08).
export function snapshotChecksum(snapshot: Snapshot): string {
  return createHash("sha256").update(canonicalStringify(snapshot), "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Snapshot serialization — deterministic localKey walk (design §3.3)
// ---------------------------------------------------------------------------

interface RawActivity {
  id: string;
  name: string;
  description: string;
  attributes_json: string;
  createdAt: string;
}

// Topological order of PRECEDES, ties broken by ascending createdAt
// then ascending id; keys a0, a1, … assigned in that walk. The journey
// is the reserved key `journey`. Pure function of the subtree, so
// re-publishing the same subtree yields byte-identical localKeys (and
// therefore an identical checksum).
export function assignLocalKeys(
  activities: RawActivity[],
  precedes: Array<{ from: string; to: string }>,
): Map<string, string> {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const indegree = new Map<string, number>(activities.map((a) => [a.id, 0]));
  const out = new Map<string, string[]>();
  for (const { from, to } of precedes) {
    if (!byId.has(from) || !byId.has(to)) continue;
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
    out.set(from, [...(out.get(from) ?? []), to]);
  }
  const cmp = (x: string, y: string): number => {
    const a = byId.get(x)!;
    const b = byId.get(y)!;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
  const ready = activities
    .filter((a) => (indegree.get(a.id) ?? 0) === 0)
    .map((a) => a.id)
    .sort(cmp);
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  while (ready.length > 0) {
    const id = ready.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
    for (const next of (out.get(id) ?? []).sort(cmp)) {
      indegree.set(next, (indegree.get(next) ?? 1) - 1);
      if ((indegree.get(next) ?? 0) === 0) {
        ready.push(next);
        ready.sort(cmp);
      }
    }
  }
  // Cycle fallback (deterministic): append any remaining by (createdAt, id).
  const remaining = activities
    .map((a) => a.id)
    .filter((id) => !seen.has(id))
    .sort(cmp);
  for (const id of remaining) orderedIds.push(id);

  const keys = new Map<string, string>();
  orderedIds.forEach((id, i) => keys.set(id, `a${i}`));
  return keys;
}

async function buildSnapshot(
  tx: ManagedTransaction,
  journeyId: string,
): Promise<Snapshot> {
  const jRes = await tx.run(
    `MATCH (j:UserJourney {id: $journeyId}) RETURN j`,
    { journeyId },
  );
  const jRec = jRes.records[0];
  if (!jRec) {
    throw new ValidationError("not_found", { kind: "UserJourney", id: journeyId }, 404);
  }
  const j = (jRec.get("j") as { properties: RawActivity }).properties;

  const aRes = await tx.run(
    `MATCH (a:Activity)-[:PART_OF]->(j:UserJourney {id: $journeyId})
     RETURN a ORDER BY a.createdAt, a.id`,
    { journeyId },
  );
  const activities = aRes.records.map(
    (r) => (r.get("a") as { properties: RawActivity }).properties,
  );
  const activityIds = activities.map((a) => a.id);

  const pRes = await tx.run(
    `MATCH (a:Activity)-[:PRECEDES]->(b:Activity)
     WHERE a.id IN $ids AND b.id IN $ids
     RETURN a.id AS fromId, b.id AS toId`,
    { ids: activityIds },
  );
  const precedesRaw = pRes.records.map((r) => ({
    from: r.get("fromId") as string,
    to: r.get("toId") as string,
  }));

  const refRes = await tx.run(
    `MATCH (a:Activity) WHERE a.id IN $ids
     OPTIONAL MATCH (role:Role)-[:EXECUTES]->(a)
     OPTIONAL MATCH (a)-[:USES_SYSTEM]->(sys:System)
     OPTIONAL MATCH (a)-[:AT_LOCATION]->(loc:Location)
     RETURN a.id AS activityId,
            collect(DISTINCT role.id) AS roleIds,
            collect(DISTINCT sys.id) AS systemIds,
            collect(DISTINCT loc.id) AS locationIds`,
    { ids: activityIds },
  );

  const keys = assignLocalKeys(activities, precedesRaw);
  const byKeyOrder = [...keys.entries()].sort((a, b) =>
    a[1].length === b[1].length ? (a[1] < b[1] ? -1 : 1) : a[1].length - b[1].length,
  );

  const refPairs = (field: "roleIds" | "systemIds" | "locationIds") => {
    const rows: Array<{ activityKey: string; refId: string }> = [];
    for (const rec of refRes.records) {
      const activityKey = keys.get(rec.get("activityId") as string)!;
      for (const refId of rec.get(field) as Array<string | null>) {
        if (typeof refId === "string") rows.push({ activityKey, refId });
      }
    }
    rows.sort((a, b) =>
      a.activityKey !== b.activityKey
        ? a.activityKey < b.activityKey ? -1 : 1
        : a.refId < b.refId ? -1 : a.refId > b.refId ? 1 : 0,
    );
    return rows;
  };

  const precedes = precedesRaw
    .map(({ from, to }) => ({ from: keys.get(from)!, to: keys.get(to)! }))
    .sort((a, b) =>
      a.from !== b.from ? (a.from < b.from ? -1 : 1) : a.to < b.to ? -1 : a.to > b.to ? 1 : 0,
    );

  return {
    journey: {
      name: j.name,
      description: j.description ?? "",
      attributes: JSON.parse(j.attributes_json ?? "{}"),
    },
    activities: byKeyOrder.map(([id, localKey]) => {
      const a = activities.find((x) => x.id === id)!;
      return {
        localKey,
        name: a.name,
        description: a.description ?? "",
        attributes: JSON.parse(a.attributes_json ?? "{}"),
      };
    }),
    precedes,
    roleRefs: refPairs("roleIds").map((r) => ({ activityKey: r.activityKey, roleId: r.refId })),
    systemRefs: refPairs("systemIds").map((r) => ({ activityKey: r.activityKey, systemId: r.refId })),
    locationRefs: refPairs("locationIds").map((r) => ({ activityKey: r.activityKey, locationId: r.refId })),
  };
}

// ---------------------------------------------------------------------------
// Module catalog (FR-06)
// ---------------------------------------------------------------------------

interface ModuleProps {
  id: string;
  name: string;
  sourceModelId: string;
  sourceJourneyId: string;
  createdAt: string;
  updatedAt: string;
}

function deserializeModule(props: ModuleProps): ModuleRead {
  return {
    id: props.id,
    name: props.name,
    sourceModelId: props.sourceModelId,
    sourceJourneyId: props.sourceJourneyId,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
  };
}

export async function createModule(
  driver: Driver,
  input: ModuleCreateInput,
): Promise<ModuleRead> {
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      const model = await tx.run(
        `MATCH (m:BusinessModel {id: $id}) RETURN m.id AS id`,
        { id: input.sourceModelId },
      );
      if (!model.records[0]) {
        throw new ValidationError("model_not_found", { id: input.sourceModelId }, 404);
      }
      const journey = await tx.run(
        `MATCH (j:UserJourney {id: $id}) RETURN j.id AS id`,
        { id: input.sourceJourneyId },
      );
      if (!journey.records[0]) {
        throw new ValidationError("not_found", { kind: "UserJourney", id: input.sourceJourneyId }, 404);
      }
      const now = new Date().toISOString();
      const result = await tx.run(
        `CREATE (mod:BusinessModule {
           id: $id, name: $name, description: "",
           sourceModelId: $sourceModelId, sourceJourneyId: $sourceJourneyId,
           createdAt: $now, updatedAt: $now, attributes_json: "{}"
         }) RETURN mod`,
        {
          id: generateId(),
          name: input.name,
          sourceModelId: input.sourceModelId,
          sourceJourneyId: input.sourceJourneyId,
          now,
        },
      );
      return deserializeModule(
        (result.records[0]!.get("mod") as { properties: ModuleProps }).properties,
      );
    });
  } finally {
    await session.close();
  }
}

export async function listModules(driver: Driver): Promise<ModuleRead[]> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (mod:BusinessModule) RETURN mod ORDER BY mod.createdAt, mod.id`,
    );
    return result.records.map((r) =>
      deserializeModule((r.get("mod") as { properties: ModuleProps }).properties),
    );
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Publish (FR-06, NFR-04; pins D-3/D-4 + §3.3 canonical checksum)
// ---------------------------------------------------------------------------

interface VersionProps {
  id: string;
  version: number;
  publishedAt: string;
  checksum: string;
  snapshot_json: string;
}

function deserializeVersion(moduleId: string, props: VersionProps): VersionRead {
  return {
    id: props.id,
    moduleId,
    version: props.version,
    publishedAt: props.publishedAt,
    checksum: props.checksum,
    snapshot: JSON.parse(props.snapshot_json) as Snapshot,
  };
}

export async function publishVersion(
  driver: Driver,
  moduleId: string,
  opts: { version?: number } = {},
): Promise<VersionRead> {
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      const modRes = await tx.run(
        `MATCH (mod:BusinessModule {id: $moduleId})
         OPTIONAL MATCH (mod)-[:HAS_VERSION]->(v:BusinessModuleVersion)
         RETURN mod.sourceJourneyId AS journeyId,
                collect(v.version) AS versions`,
        { moduleId },
      );
      const rec = modRes.records[0];
      if (!rec || rec.get("journeyId") === null) {
        throw new ValidationError("module_not_found", { id: moduleId }, 404);
      }
      const existing = (rec.get("versions") as number[]).filter((v) => typeof v === "number");

      let version: number;
      if (opts.version !== undefined) {
        // Explicit-version mode (D-3) — the SINGLE genuine reachability
        // site for module_version_immutable (D-4).
        if (existing.includes(opts.version)) {
          throw new ValidationError(
            "module_version_immutable",
            { moduleId, version: opts.version },
            409,
          );
        }
        version = opts.version;
      } else {
        version = existing.length === 0 ? 1 : Math.max(...existing) + 1;
      }

      const snapshot = await buildSnapshot(tx, rec.get("journeyId") as string);
      const checksum = snapshotChecksum(snapshot);
      const now = new Date().toISOString();
      const created = await tx.run(
        `MATCH (mod:BusinessModule {id: $moduleId})
         CREATE (v:BusinessModuleVersion {
           id: $id, name: $name, description: "",
           version: $version, publishedAt: $now, checksum: $checksum,
           snapshot_json: $snapshotJson,
           createdAt: $now, updatedAt: $now, attributes_json: "{}"
         })
         CREATE (mod)-[:HAS_VERSION {id: $edgeId, createdAt: $now, attributes_json: "{}"}]->(v)
         RETURN v`,
        {
          moduleId,
          id: generateId(),
          edgeId: generateId(),
          name: `${snapshot.journey.name} v${version}`,
          version,
          now,
          checksum,
          snapshotJson: JSON.stringify(snapshot),
        },
      );
      return deserializeVersion(
        moduleId,
        (created.records[0]!.get("v") as { properties: VersionProps }).properties,
      );
    });
  } finally {
    await session.close();
  }
}

// Version DESC (FR-06 list contract).
export async function listVersions(
  driver: Driver,
  moduleId: string,
): Promise<VersionRead[]> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const modRes = await session.run(
      `MATCH (mod:BusinessModule {id: $moduleId}) RETURN mod.id AS id`,
      { moduleId },
    );
    if (!modRes.records[0]) {
      throw new ValidationError("module_not_found", { id: moduleId }, 404);
    }
    const result = await session.run(
      `MATCH (mod:BusinessModule {id: $moduleId})-[:HAS_VERSION]->(v:BusinessModuleVersion)
       RETURN v ORDER BY v.version DESC`,
      { moduleId },
    );
    return result.records.map((r) =>
      deserializeVersion(moduleId, (r.get("v") as { properties: VersionProps }).properties),
    );
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Instantiate + instance read (FR-07; design §4.4/§4.5, pins D-2)
// ---------------------------------------------------------------------------

interface InstanceRow {
  id: string;
  forked: boolean;
  pinnedVersion: number;
  targetDomainId: string;
  createdAt: string;
  updatedAt: string;
  moduleId: string;
  moduleName: string;
  snapshotJson: string;
  modelId: string;
}

async function readInstanceRow(
  driver: Driver,
  instanceId: string,
): Promise<InstanceRow> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (mi:ModuleInstance {id: $instanceId})-[:INSTANTIATES]->(v:BusinessModuleVersion)<-[:HAS_VERSION]-(mod:BusinessModule)
       MATCH (mi)-[:INSTANCE_IN]->(m:BusinessModel)
       RETURN mi, v.snapshot_json AS snapshotJson, mod.id AS moduleId, mod.name AS moduleName, m.id AS modelId`,
      { instanceId },
    );
    const rec = result.records[0];
    if (!rec) throw new ValidationError("not_found", { kind: "ModuleInstance", id: instanceId }, 404);
    const props = (rec.get("mi") as { properties: Record<string, unknown> }).properties;
    return {
      id: props.id as string,
      forked: (props.forked as boolean) ?? false,
      pinnedVersion: props.pinnedVersion as number,
      targetDomainId: props.targetDomainId as string,
      createdAt: props.createdAt as string,
      updatedAt: props.updatedAt as string,
      moduleId: rec.get("moduleId") as string,
      moduleName: rec.get("moduleName") as string,
      snapshotJson: rec.get("snapshotJson") as string,
      modelId: rec.get("modelId") as string,
    };
  } finally {
    await session.close();
  }
}

export async function instantiate(
  driver: Driver,
  args: {
    modelId: string;
    moduleId: string;
    version?: number;
    targetDomainId: string;
  },
): Promise<InstanceRead> {
  const session = driver.session();
  let instanceId: string;
  try {
    instanceId = await session.executeWrite(async (tx) => {
      const model = await tx.run(
        `MATCH (m:BusinessModel {id: $id}) RETURN m.id AS id`,
        { id: args.modelId },
      );
      if (!model.records[0]) {
        throw new ValidationError("model_not_found", { id: args.modelId }, 404);
      }
      const mod = await tx.run(
        `MATCH (mod:BusinessModule {id: $id})
         OPTIONAL MATCH (mod)-[:HAS_VERSION]->(v:BusinessModuleVersion)
         RETURN mod.id AS id, mod.name AS name, collect(v {.id, .version}) AS versions`,
        { id: args.moduleId },
      );
      const modRec = mod.records[0];
      if (!modRec || modRec.get("id") === null) {
        throw new ValidationError("module_not_found", { id: args.moduleId }, 404);
      }
      const versions = (modRec.get("versions") as Array<{ id: string; version: number }>)
        .filter((v) => v && typeof v.version === "number");
      let pinned: { id: string; version: number } | undefined;
      if (args.version !== undefined) {
        pinned = versions.find((v) => v.version === args.version);
      } else {
        pinned = versions.sort((a, b) => b.version - a.version)[0];
      }
      if (!pinned) {
        throw new ValidationError(
          "module_version_not_found",
          { moduleId: args.moduleId, version: args.version ?? "latest" },
          404,
        );
      }
      // D-2: targetDomainId must be a Domain linked IN_MODEL to :modelId.
      const dom = await tx.run(
        `MATCH (d:Domain {id: $domainId})-[:IN_MODEL]->(m:BusinessModel {id: $modelId})
         RETURN d.id AS id`,
        { domainId: args.targetDomainId, modelId: args.modelId },
      );
      if (!dom.records[0]) {
        throw new ValidationError("invalid_payload", {
          cause: "targetDomainId must be a Domain linked IN_MODEL to the model",
          targetDomainId: args.targetDomainId,
          modelId: args.modelId,
        });
      }
      const now = new Date().toISOString();
      const id = generateId();
      await tx.run(
        `MATCH (m:BusinessModel {id: $modelId}),
               (v:BusinessModuleVersion {id: $versionId})
         CREATE (mi:ModuleInstance {
           id: $id, name: $name, description: "",
           forked: false, pinnedVersion: $pinnedVersion, targetDomainId: $targetDomainId,
           createdAt: $now, updatedAt: $now, attributes_json: "{}"
         })
         CREATE (mi)-[:INSTANTIATES {id: $e1, createdAt: $now, attributes_json: "{}"}]->(v)
         CREATE (mi)-[:INSTANCE_IN {id: $e2, createdAt: $now, attributes_json: "{}"}]->(m)`,
        {
          modelId: args.modelId,
          versionId: pinned.id,
          id,
          e1: generateId(),
          e2: generateId(),
          name: `${modRec.get("name") as string} instance`,
          pinnedVersion: pinned.version,
          targetDomainId: args.targetDomainId,
          now,
        },
      );
      return id;
    });
  } finally {
    await session.close();
  }
  return getInstance(driver, instanceId);
}

// Synthetic content-id projection for a NON-forked instance (design
// §3.4/§4.5): a pure function of the instance id + snapshot — mints no
// nodes. The projected `id`s are EXACTLY the handles the fork-trigger
// routes accept, so read + write agree on one addressing scheme (B-01).
function projectSnapshotContent(instanceId: string, snapshot: Snapshot): InstanceContent {
  const handle = (key: string) => `${instanceId}::${key}`;
  return {
    journey: {
      id: handle("journey"),
      label: "UserJourney",
      name: snapshot.journey.name,
      description: snapshot.journey.description,
      attributes: snapshot.journey.attributes,
    },
    activities: snapshot.activities.map((a) => ({
      id: handle(a.localKey),
      label: "Activity" as const,
      name: a.name,
      description: a.description,
      attributes: a.attributes,
    })),
    precedes: snapshot.precedes.map((p) => ({ from: handle(p.from), to: handle(p.to) })),
    roleRefs: snapshot.roleRefs.map((r) => ({ activityKey: handle(r.activityKey), roleId: r.roleId })),
    systemRefs: snapshot.systemRefs.map((r) => ({ activityKey: handle(r.activityKey), systemId: r.systemId })),
    locationRefs: snapshot.locationRefs.map((r) => ({ activityKey: handle(r.activityKey), locationId: r.locationId })),
  };
}

const EMPTY_CONTENT: InstanceContent = {
  journey: null,
  activities: [],
  precedes: [],
  roleRefs: [],
  systemRefs: [],
  locationRefs: [],
};

// Forked read — anchored on the journey `{forkLocalKey:
// "<instanceId>::journey"}` + its incoming PART_OF activities (§4.5,
// B-02). Deleted-anchor hardening (design-review C-09 / tasks C-01):
// when the anchor matches nothing, returns EMPTY content — never a 500.
async function readForkedContent(
  driver: Driver,
  instanceId: string,
): Promise<InstanceContent> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const anchor = `${instanceId}::journey`;
    const jRes = await session.run(
      `MATCH (j:UserJourney {forkLocalKey: $anchor}) RETURN j`,
      { anchor },
    );
    const jRec = jRes.records[0];
    if (!jRec) return EMPTY_CONTENT;
    const j = (jRec.get("j") as {
      properties: RawActivity & { forkLocalKey: string };
    }).properties;

    const aRes = await session.run(
      `MATCH (a:Activity)-[:PART_OF]->(j:UserJourney {forkLocalKey: $anchor})
       WHERE a.forkLocalKey STARTS WITH $prefix
       RETURN a ORDER BY a.forkLocalKey`,
      { anchor, prefix: `${instanceId}::` },
    );
    const activities = aRes.records.map(
      (r) => (r.get("a") as { properties: RawActivity & { forkLocalKey: string } }).properties,
    );
    const ids = activities.map((a) => a.id);

    const pRes = await session.run(
      `MATCH (a:Activity)-[:PRECEDES]->(b:Activity)
       WHERE a.id IN $ids AND b.id IN $ids
       RETURN a.id AS fromId, b.id AS toId ORDER BY fromId, toId`,
      { ids },
    );
    const refRes = await session.run(
      `MATCH (a:Activity) WHERE a.id IN $ids
       OPTIONAL MATCH (role:Role)-[:EXECUTES]->(a)
       OPTIONAL MATCH (a)-[:USES_SYSTEM]->(sys:System)
       OPTIONAL MATCH (a)-[:AT_LOCATION]->(loc:Location)
       RETURN a.id AS activityId,
              collect(DISTINCT role.id) AS roleIds,
              collect(DISTINCT sys.id) AS systemIds,
              collect(DISTINCT loc.id) AS locationIds
       ORDER BY activityId`,
      { ids },
    );
    const collectRefs = (field: "roleIds" | "systemIds" | "locationIds") => {
      const rows: Array<{ activityKey: string; refId: string }> = [];
      for (const rec of refRes.records) {
        for (const refId of rec.get(field) as Array<string | null>) {
          if (typeof refId === "string") {
            rows.push({ activityKey: rec.get("activityId") as string, refId });
          }
        }
      }
      return rows;
    };

    const toNode = (p: RawActivity & { forkLocalKey: string }, label: "UserJourney" | "Activity") => ({
      id: p.id,
      label,
      name: p.name,
      description: p.description ?? "",
      attributes: JSON.parse(p.attributes_json ?? "{}") as Record<string, unknown>,
      forkLocalKey: p.forkLocalKey,
    });

    return {
      journey: toNode(j, "UserJourney"),
      activities: activities.map((a) => toNode(a, "Activity")),
      precedes: pRes.records.map((r) => ({
        from: r.get("fromId") as string,
        to: r.get("toId") as string,
      })),
      roleRefs: collectRefs("roleIds").map((r) => ({ activityKey: r.activityKey, roleId: r.refId })),
      systemRefs: collectRefs("systemIds").map((r) => ({ activityKey: r.activityKey, systemId: r.refId })),
      locationRefs: collectRefs("locationIds").map((r) => ({ activityKey: r.activityKey, locationId: r.refId })),
    };
  } finally {
    await session.close();
  }
}

async function toInstanceRead(driver: Driver, row: InstanceRow): Promise<InstanceRead> {
  const content = row.forked
    ? await readForkedContent(driver, row.id)
    : projectSnapshotContent(row.id, JSON.parse(row.snapshotJson) as Snapshot);
  return {
    id: row.id,
    moduleId: row.moduleId,
    moduleName: row.moduleName,
    pinnedVersion: row.pinnedVersion,
    forked: row.forked,
    targetDomainId: row.targetDomainId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    content,
  };
}

export async function getInstance(driver: Driver, instanceId: string): Promise<InstanceRead> {
  const row = await readInstanceRow(driver, instanceId);
  return toInstanceRead(driver, row);
}

// T-07 (resolves review C-03 — this function owns the §4.5 content
// resolution for the instance list).
export async function listInstances(driver: Driver, modelId: string): Promise<InstanceRead[]> {
  const session = driver.session({ defaultAccessMode: "READ" });
  let rows: InstanceRow[];
  try {
    const result = await session.run(
      `MATCH (mi:ModuleInstance)-[:INSTANCE_IN]->(m:BusinessModel {id: $modelId})
       MATCH (mi)-[:INSTANTIATES]->(v:BusinessModuleVersion)<-[:HAS_VERSION]-(mod:BusinessModule)
       RETURN mi, v.snapshot_json AS snapshotJson, mod.id AS moduleId, mod.name AS moduleName
       ORDER BY mi.createdAt, mi.id`,
      { modelId },
    );
    rows = result.records.map((rec) => {
      const props = (rec.get("mi") as { properties: Record<string, unknown> }).properties;
      return {
        id: props.id as string,
        forked: (props.forked as boolean) ?? false,
        pinnedVersion: props.pinnedVersion as number,
        targetDomainId: props.targetDomainId as string,
        createdAt: props.createdAt as string,
        updatedAt: props.updatedAt as string,
        moduleId: rec.get("moduleId") as string,
        moduleName: rec.get("moduleName") as string,
        snapshotJson: rec.get("snapshotJson") as string,
        modelId,
      };
    });
  } finally {
    await session.close();
  }
  const out: InstanceRead[] = [];
  for (const row of rows) out.push(await toInstanceRead(driver, row));
  return out;
}

// ---------------------------------------------------------------------------
// Fork (FR-08, NFR-03b/NFR-04; design §3.4/§4.4 — the B-02 anchor)
// ---------------------------------------------------------------------------

export interface ForkResult {
  alreadyForked: boolean;
  // localKey ("journey" | "a0" | …) → live UUIDv7
  map: Map<string, string>;
}

// Idempotent. On a non-forked instance: materialize the pinned snapshot
// into the model (PART_OF the instance's targetDomainId), writing on
// every materialized node `forkLocalKey = "<instanceId>::<localKey>"` —
// the FULL instance-qualified synthetic id, never the bare snapshot key
// (§3.4, B-02) — so synthetic handles keep resolving after the fork and
// the subtree is anchored to THIS instance. Already-forked → no-op,
// map read back via the `STARTS WITH "<instanceId>::"` prefix.
//
// T-24 (design-review C-13; rewritten per tasks-review B-01): the fork
// check-and-materialize runs as lock-first-then-recheck inside a single
// write transaction. The first statement acquires the ModuleInstance
// node's write lock via a dummy `SET i._forkLock = timestamp()` BEFORE
// reading `i.forked` — under read-committed isolation, the losing racer
// blocks on the lock, then re-reads the committed `forked = true`, is
// filtered out, and returns `won = 0` → takes the already-forked
// read-back path. `_forkLock` is a lock-acquisition dummy write, never
// projected at the REST boundary; it is removed as the transaction's
// final statement so no scratch property persists.
//
// Belt-and-suspenders: the `forkLocalKey` uniqueness constraints (T-24
// part 2, bootstrap.ts) make a duplicate materialization fail
// deterministically with `ConstraintValidationFailed` even if a future
// edit reintroduces a gate bug — caught and routed to the read-back path.
export async function forkInstance(driver: Driver, instanceId: string): Promise<ForkResult> {
  const row = await readInstanceRow(driver, instanceId);
  const prefix = `${instanceId}::`;

  // Helper: read back the fork map via STARTS WITH prefix.
  async function readBackForkMap(): Promise<Map<string, string>> {
    const rSession = driver.session({ defaultAccessMode: "READ" });
    try {
      const result = await rSession.run(
        `MATCH (n) WHERE n.forkLocalKey STARTS WITH $prefix
         RETURN n.forkLocalKey AS flk, n.id AS id`,
        { prefix },
      );
      const map = new Map<string, string>();
      for (const rec of result.records) {
        map.set((rec.get("flk") as string).slice(prefix.length), rec.get("id") as string);
      }
      return map;
    } finally {
      await rSession.close();
    }
  }

  // Optimization: if already forked on the initial read, skip the write
  // transaction entirely. The race only happens when two concurrent
  // calls both see forked = false — the lock-first-then-recheck gate
  // below handles that.
  if (row.forked) {
    return { alreadyForked: true, map: await readBackForkMap() };
  }

  const snapshot = JSON.parse(row.snapshotJson) as Snapshot;

  const session = driver.session();
  try {
    try {
      const result = await session.executeWrite(async (tx) => {
        const now = new Date().toISOString();

        // T-24: Lock-first-then-recheck gate. The dummy SET acquires the
        // write lock before the forked read; the losing racer blocks
        // here, then re-reads committed forked = true → filtered out.
        const gate = await tx.run(
          `MATCH (i:ModuleInstance {id: $instanceId})
           SET i._forkLock = timestamp()
           WITH i
           WHERE i.forked = false
           SET i.forked = true, i.updatedAt = $now
           RETURN count(i) AS won`,
          { instanceId, now },
        );
        const won = (gate.records[0]?.get("won") as number) ?? 0;

        if (won === 0) {
          // Lost the race — read back the winner's fork map.
          const forkNodes = await tx.run(
            `MATCH (n) WHERE n.forkLocalKey STARTS WITH $prefix
             RETURN n.forkLocalKey AS flk, n.id AS id`,
            { prefix },
          );
          const map = new Map<string, string>();
          for (const rec of forkNodes.records) {
            map.set((rec.get("flk") as string).slice(prefix.length), rec.get("id") as string);
          }
          // Clean up the lock scratch property.
          await tx.run(
            `MATCH (i:ModuleInstance {id: $instanceId}) REMOVE i._forkLock`,
            { instanceId },
          );
          return { alreadyForked: true, map };
        }

        // Won the race — materialize the subtree.
        const map = new Map<string, string>();
        map.set("journey", generateId());
        for (const a of snapshot.activities) map.set(a.localKey, generateId());

        // Journey → PART_OF → targetDomain.
        await tx.run(
          `MATCH (d:Domain {id: $domainId})
           CREATE (j:UserJourney {
             id: $id, name: $name, description: $description,
             createdAt: $now, updatedAt: $now, attributes_json: $attrs,
             forkLocalKey: $flk
           })
           CREATE (j)-[:PART_OF {id: $edgeId, createdAt: $now, attributes_json: "{}"}]->(d)`,
          {
            domainId: row.targetDomainId,
            id: map.get("journey")!,
            name: snapshot.journey.name,
            description: snapshot.journey.description,
            attrs: JSON.stringify(snapshot.journey.attributes ?? {}),
            flk: `${prefix}journey`,
            now,
            edgeId: generateId(),
          },
        );
        // Activities → PART_OF → journey.
        for (const a of snapshot.activities) {
          await tx.run(
            `MATCH (j:UserJourney {id: $journeyId})
             CREATE (n:Activity {
               id: $id, name: $name, description: $description,
               createdAt: $now, updatedAt: $now, attributes_json: $attrs,
               forkLocalKey: $flk
             })
             CREATE (n)-[:PART_OF {id: $edgeId, createdAt: $now, attributes_json: "{}"}]->(j)`,
            {
              journeyId: map.get("journey")!,
              id: map.get(a.localKey)!,
              name: a.name,
              description: a.description,
              attrs: JSON.stringify(a.attributes ?? {}),
              flk: `${prefix}${a.localKey}`,
              now,
              edgeId: generateId(),
            },
          );
        }
        // Intra-subtree PRECEDES.
        for (const p of snapshot.precedes) {
          await tx.run(
            `MATCH (a:Activity {id: $fromId}), (b:Activity {id: $toId})
             CREATE (a)-[:PRECEDES {id: $edgeId, createdAt: $now, attributes_json: "{}"}]->(b)`,
            { fromId: map.get(p.from)!, toId: map.get(p.to)!, edgeId: generateId(), now },
          );
        }
        // Re-link to SHARED Role/System/Location ids (DEC-01 (a) — no
        // copy). A missing shared node simply matches nothing.
        for (const r of snapshot.roleRefs) {
          await tx.run(
            `MATCH (role:Role {id: $roleId}), (a:Activity {id: $activityId})
             CREATE (role)-[:EXECUTES {id: $edgeId, createdAt: $now, attributes_json: "{}"}]->(a)`,
            { roleId: r.roleId, activityId: map.get(r.activityKey)!, edgeId: generateId(), now },
          );
        }
        for (const r of snapshot.systemRefs) {
          await tx.run(
            `MATCH (a:Activity {id: $activityId}), (sys:System {id: $systemId})
             CREATE (a)-[:USES_SYSTEM {id: $edgeId, createdAt: $now, attributes_json: "{}"}]->(sys)`,
            { systemId: r.systemId, activityId: map.get(r.activityKey)!, edgeId: generateId(), now },
          );
        }
        for (const r of snapshot.locationRefs) {
          await tx.run(
            `MATCH (a:Activity {id: $activityId}), (loc:Location {id: $locationId})
             CREATE (a)-[:AT_LOCATION {id: $edgeId, createdAt: $now, attributes_json: "{}"}]->(loc)`,
            { locationId: r.locationId, activityId: map.get(r.activityKey)!, edgeId: generateId(), now },
          );
        }
        // FORKED_FROM → the pinned version (forked was already set by
        // the gate statement above).
        await tx.run(
          `MATCH (mi:ModuleInstance {id: $instanceId})-[:INSTANTIATES]->(v:BusinessModuleVersion)
           CREATE (mi)-[:FORKED_FROM {id: $edgeId, createdAt: $now, attributes_json: "{}"}]->(v)`,
          { instanceId, now, edgeId: generateId() },
        );

        // Clean up the lock scratch property.
        await tx.run(
          `MATCH (i:ModuleInstance {id: $instanceId}) REMOVE i._forkLock`,
          { instanceId },
        );

        return { alreadyForked: false, map };
      });
      return result;
    } catch (e) {
      // T-24 belt-and-suspenders: if the uniqueness constraint on
      // forkLocalKey catches a duplicate (gate bug or otherwise),
      // route to the already-forked read-back path.
      if (isConstraintViolation(e)) {
        return { alreadyForked: true, map: await readBackForkMap() };
      }
      throw e;
    }
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Handle resolution (design §3.4/§4.4 — membership rules)
// ---------------------------------------------------------------------------

export interface ResolvedMember {
  id: string;
  label: string;
}

// Splits `:nodeId` on the LITERAL `::` (N-06 — the handle travels as a
// path segment verbatim; clients must not URL-mangle the `::`).
export function parseSyntheticHandle(
  raw: string,
): { instanceId: string; key: string } | null {
  const idx = raw.indexOf("::");
  if (idx === -1) return null;
  return { instanceId: raw.slice(0, idx), key: raw.slice(idx + 2) };
}

function notMember(instanceId: string, handle: string): never {
  throw new ValidationError(
    "module_instance_node_not_member",
    { instanceId, nodeId: handle },
    404,
  );
}

// Resolves a subtree-side handle against a FORKED instance's live
// subtree. Synthetic handle → exact forkLocalKey equality; raw UUID →
// `forkLocalKey STARTS WITH "<instanceId>::"` membership. Anything
// else → 404 module_instance_node_not_member (includes the
// deleted-anchor case: a handle whose node was generic-DELETEd).
export async function resolveLiveMember(
  driver: Driver,
  instanceId: string,
  handle: string,
): Promise<ResolvedMember> {
  const synthetic = parseSyntheticHandle(handle);
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    if (synthetic) {
      if (synthetic.instanceId !== instanceId) notMember(instanceId, handle);
      const result = await session.run(
        `MATCH (n {forkLocalKey: $flk}) RETURN n.id AS id, labels(n)[0] AS label`,
        { flk: handle },
      );
      const rec = result.records[0];
      if (!rec) notMember(instanceId, handle);
      return { id: rec.get("id") as string, label: rec.get("label") as string };
    }
    const result = await session.run(
      `MATCH (n {id: $id}) WHERE n.forkLocalKey STARTS WITH $prefix
       RETURN n.id AS id, labels(n)[0] AS label`,
      { id: handle, prefix: `${instanceId}::` },
    );
    const rec = result.records[0];
    if (!rec) notMember(instanceId, handle);
    return { id: rec.get("id") as string, label: rec.get("label") as string };
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Instance edge writes (T-22, review B-01; design §4.4 sibling edge route)
// ---------------------------------------------------------------------------

const SHARED_LABEL_BY_TYPE: Record<string, "Role" | "System" | "Location" | null> = {
  PRECEDES: null,
  EXECUTES: "Role", // from-side is the shared Role
  USES_SYSTEM: "System", // to-side is the shared System
  AT_LOCATION: "Location", // to-side is the shared Location
};

interface ResolvedEdge {
  fromId: string;
  toId: string;
}

// Shared endpoint check: node must exist (else 404 not_found) and carry
// the expected label for the type (else 400 edge_endpoint_label_mismatch
// — same semantics as the registry matrix).
async function resolveSharedEndpoint(
  driver: Driver,
  id: string,
  expectedLabel: string,
): Promise<string> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (n {id: $id}) RETURN labels(n)[0] AS label`,
      { id },
    );
    const rec = result.records[0];
    if (!rec) throw new ValidationError("not_found", { id }, 404);
    const label = rec.get("label") as string;
    if (label !== expectedLabel) {
      throw new ValidationError("edge_endpoint_label_mismatch", {
        id,
        expected: expectedLabel,
        actual: label,
      });
    }
    return id;
  } finally {
    await session.close();
  }
}

// Resolves both endpoints of an instance edge AFTER the instance is
// live (fork-then-apply already ran for a non-forked instance).
// Membership (design §4.4): PRECEDES → both endpoints members;
// reference types → the subtree-side endpoint (`to` for EXECUTES,
// `from` for the other two) is a member, the other endpoint an
// existing shared Role/System/Location.
async function resolveInstanceEdge(
  driver: Driver,
  instanceId: string,
  input: InstanceEdgeInput,
): Promise<ResolvedEdge> {
  if (input.type === "PRECEDES") {
    const from = await resolveLiveMember(driver, instanceId, input.from);
    const to = await resolveLiveMember(driver, instanceId, input.to);
    if (from.label !== "Activity" || to.label !== "Activity") {
      throw new ValidationError("edge_endpoint_label_mismatch", {
        type: input.type,
        fromLabel: from.label,
        toLabel: to.label,
        allowed: [{ from: "Activity", to: "Activity" }],
      });
    }
    return { fromId: from.id, toId: to.id };
  }
  if (input.type === "EXECUTES") {
    const member = await resolveLiveMember(driver, instanceId, input.to);
    if (member.label !== "Activity") {
      throw new ValidationError("edge_endpoint_label_mismatch", {
        type: input.type,
        toLabel: member.label,
        allowed: [{ from: "Role", to: "Activity" }],
      });
    }
    const roleId = await resolveSharedEndpoint(driver, input.from, "Role");
    return { fromId: roleId, toId: member.id };
  }
  // USES_SYSTEM / AT_LOCATION — subtree side is `from`.
  const member = await resolveLiveMember(driver, instanceId, input.from);
  if (member.label !== "Activity") {
    throw new ValidationError("edge_endpoint_label_mismatch", {
      type: input.type,
      fromLabel: member.label,
      allowed: [{ from: "Activity", to: SHARED_LABEL_BY_TYPE[input.type] }],
    });
  }
  const sharedId = await resolveSharedEndpoint(
    driver,
    input.to,
    SHARED_LABEL_BY_TYPE[input.type]!,
  );
  return { fromId: member.id, toId: sharedId };
}

// POST …/edges — MERGE on (type, from, to) → idempotent: `created:
// true` → 201, already present → 200. Fork-then-apply on a non-forked
// instance (closes the FR-08 path where the FIRST edit is an edge
// edit). Never writes version content (NFR-04 — structural).
export async function createInstanceEdge(
  driver: Driver,
  instanceId: string,
  input: InstanceEdgeInput,
): Promise<{ created: boolean; type: string; fromId: string; toId: string }> {
  const row = await readInstanceRow(driver, instanceId);
  if (!row.forked) await forkInstance(driver, instanceId);
  const { fromId, toId } = await resolveInstanceEdge(driver, instanceId, input);
  const session = driver.session();
  try {
    const existing = await session.run(
      `MATCH (a {id: $fromId})-[r:\`${input.type}\`]->(b {id: $toId}) RETURN r.id AS id LIMIT 1`,
      { fromId, toId },
    );
    if (existing.records[0]) {
      return { created: false, type: input.type, fromId, toId };
    }
    await session.executeWrite((tx) =>
      tx.run(
        `MATCH (a {id: $fromId}), (b {id: $toId})
         MERGE (a)-[r:\`${input.type}\`]->(b)
         ON CREATE SET r.id = $edgeId, r.createdAt = $now, r.attributes_json = "{}"`,
        { fromId, toId, edgeId: generateId(), now: new Date().toISOString() },
      ),
    );
    return { created: true, type: input.type, fromId, toId };
  } finally {
    await session.close();
  }
}

// DELETE …/edges — removes the (type, from, to)-matched edge → 204;
// absent → 404 not_found. Also fork-then-apply on a non-forked
// instance (removing a snapshot edge IS the first edit).
export async function deleteInstanceEdge(
  driver: Driver,
  instanceId: string,
  input: InstanceEdgeInput,
): Promise<void> {
  const row = await readInstanceRow(driver, instanceId);
  if (!row.forked) await forkInstance(driver, instanceId);
  const { fromId, toId } = await resolveInstanceEdge(driver, instanceId, input);
  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `MATCH (a {id: $fromId})-[r:\`${input.type}\`]->(b {id: $toId})
         DELETE r RETURN count(r) AS n`,
        { fromId, toId },
      ),
    );
    const n = (result.records[0]?.get("n") as number | undefined) ?? 0;
    if (n === 0) {
      throw new ValidationError("not_found", { type: input.type, from: input.from, to: input.to }, 404);
    }
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Upgrade (T-09 / FR-09, design §4.5)
// ---------------------------------------------------------------------------

// Publishing a new version never auto-upgrades (no write here touches
// other instances). Handle-stability warning (N-09): synthetic content
// ids are pinned-version-relative — clients must re-read the instance
// after an upgrade.
export async function upgradeInstance(
  driver: Driver,
  instanceId: string,
  toVersion: number,
  allowDowngrade = false,
): Promise<InstanceRead> {
  const row = await readInstanceRow(driver, instanceId);
  if (row.forked) {
    // Three-way reconciliation deferred (Risk 3 — future module-reconcile spec).
    throw new ValidationError("module_instance_forked", { instanceId }, 409);
  }
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      const target = await tx.run(
        `MATCH (mod:BusinessModule {id: $moduleId})-[:HAS_VERSION]->(v:BusinessModuleVersion {version: $toVersion})
         RETURN v.id AS id`,
        { moduleId: row.moduleId, toVersion },
      );
      const rec = target.records[0];
      if (!rec) {
        throw new ValidationError(
          "module_version_not_found",
          { moduleId: row.moduleId, version: toVersion },
          404,
        );
      }
      if (toVersion < row.pinnedVersion && !allowDowngrade) {
        throw new ValidationError(
          "module_downgrade_not_allowed",
          { instanceId, pinnedVersion: row.pinnedVersion, toVersion },
        );
      }
      await tx.run(
        `MATCH (mi:ModuleInstance {id: $instanceId})-[old:INSTANTIATES]->(:BusinessModuleVersion)
         MATCH (v:BusinessModuleVersion {id: $versionId})
         DELETE old
         CREATE (mi)-[:INSTANTIATES {id: $edgeId, createdAt: $now, attributes_json: "{}"}]->(v)
         SET mi.pinnedVersion = $toVersion, mi.updatedAt = $now`,
        {
          instanceId,
          versionId: rec.get("id") as string,
          edgeId: generateId(),
          now: new Date().toISOString(),
          toVersion,
        },
      );
    });
  } finally {
    await session.close();
  }
  return getInstance(driver, instanceId);
}

export { readInstanceRow };
