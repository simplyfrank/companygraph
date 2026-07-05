// ddd-system-modeling T-04 (design §4.1–§4.3, §4.6, DD-01, DD-02,
// DD-03, DD-06, DD-12, DD-13, DD-16, DD-17) — dedicated storage for the
// Capability surface: CRUD + the mapping edges.
//
// Rules (design §1):
//  - A Capability carries ONLY the standard node envelope (DD-03); it
//    is written by this module's own parameterized Cypher — the generic
//    `createNode`/`patchNode` primitives stay byte-for-byte unchanged
//    (they cannot write CAPABILITY_IN_MODEL atomically).
//  - Model membership rides `(cap)-[:CAPABILITY_IN_MODEL]->(:BusinessModel)`
//    — the AUTHORITATIVE key (DD-02), never `scopedNodeIds` (a
//    Capability id is never in that set; an orphan-sourced capability
//    stays visible — AC-06b).
//  - `scopedNodeIds` (consumed from model-scope.ts, never
//    re-implemented) is used ONLY to validate a `needed-by` mapping
//    target belongs to the model (FR-05) — the STRICT arm only (DD-16):
//    an orphan activity (or a story describing one) is `404 not_found`
//    at PUT time.
//  - Mapping writes use `MERGE` (idempotent, DD-06) AFTER the explicit
//    endpoint-label check via the exported `getEdgeEndpoints` (DD-12 —
//    `validateEdge` stays private; `edges.ts` is not edited).
//  - `setContext` REPLACES in one tx, deleting ALL prior
//    ASSIGNED_TO_CONTEXT edges (at-most-one, FR-03; DD-17(iii)
//    self-heal).
//  - "Detached" (DD-13) = a mapping edge whose far-end node's expected
//    label no longer matches (id reuse, partial import) — computed per
//    read, `[]` on the normal path.

import type { Driver } from "neo4j-driver";
import type {
  CapabilityCreateInput,
  CapabilityPatchInput,
  CapabilityRead,
  NeededByInput,
  NeededByItem,
  SupportedByItem,
  DetachedItem,
} from "@companygraph/shared/schema/ddd-system";
import {
  systemKindSchema,
  DEFAULT_SYSTEM_KIND,
  type SystemKind,
} from "@companygraph/shared/schema/system-kind";
import { generateId } from "../ids";
import { ValidationError } from "../errors";
import { scopedNodeIds } from "./model-scope";
import { getEdgeEndpoints } from "../ontology/cache/edge-endpoints";

interface CapProps {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  attributes_json?: string | null;
}

function envelope(props: CapProps): Pick<
  CapabilityRead,
  "id" | "name" | "description" | "createdAt" | "updatedAt" | "attributes"
> {
  return {
    id: props.id,
    name: props.name ?? "",
    description: props.description ?? "",
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
    attributes: JSON.parse(props.attributes_json ?? "{}") as Record<string, unknown>,
  };
}

// Parse a System's kind off its attributes_json at the read boundary
// (design §4.2, NFR-03 — via systemKindSchema, never a re-declared
// literal). A missing/invalid kind (pre-migration edge case) falls back
// to the default so the detail read never 500s; the gap analysis's
// `unknown` bucket (system-model.ts) is the honest reporting channel.
function parseSystemKind(attributesJson: string | null | undefined): SystemKind {
  try {
    const attrs = JSON.parse(attributesJson ?? "{}") as Record<string, unknown>;
    const r = systemKindSchema.safeParse(attrs["systemKind"]);
    return r.success ? r.data : DEFAULT_SYSTEM_KIND;
  } catch {
    return DEFAULT_SYSTEM_KIND;
  }
}

// DD-12 — MERGE-path endpoint validation via the exported
// getEdgeEndpoints (the same primitive the private validateEdge uses).
async function assertEndpointPair(
  driver: Driver,
  type: string,
  fromLabel: string,
  toLabel: string,
): Promise<void> {
  const allowed = await getEdgeEndpoints(type, driver);
  if (!allowed.some(([f, t]) => f === fromLabel && t === toLabel)) {
    throw new ValidationError(
      "edge_endpoint_label_mismatch",
      { type, fromLabel, toLabel, allowed: allowed.map(([f, t]) => `${f}->${t}`) },
      400,
    );
  }
}

// Membership gate — a capability of another model is NOT FOUND under
// this model path (no cross-model read/write, AC-09).
async function assertMembership(
  driver: Driver,
  modelId: string,
  capabilityId: string,
): Promise<void> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (cap:Capability {id: $capabilityId})-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id: $modelId})
       RETURN cap.id AS id`,
      { modelId, capabilityId },
    );
    if (r.records.length === 0) {
      throw new ValidationError("capability_not_found", { capabilityId, modelId }, 404);
    }
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// List (FR-04, §4.1)
// ---------------------------------------------------------------------------

export async function listCapabilities(
  driver: Driver,
  modelId: string,
): Promise<CapabilityRead[]> {
  // The membership MATCH is the SOLE model filter (DD-02) — an unknown
  // :modelId returns [] (the pinned list-[]-vs-create-404 asymmetry,
  // design §4.1 / N-02 — the create path 404s explicitly).
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (cap:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id: $modelId})
       OPTIONAL MATCH (src)-[:NEEDS_CAPABILITY]->(cap)
       OPTIONAL MATCH (cap)-[:SUPPORTED_BY]->(sys:System)
       OPTIONAL MATCH (cap)-[:ASSIGNED_TO_CONTEXT]->(bc:BoundedContext)
       RETURN cap,
              count(DISTINCT src)  AS neededByCount,
              count(DISTINCT sys)  AS supportingSystemCount,
              collect(DISTINCT {id: bc.id, name: bc.name}) AS contexts
       ORDER BY cap.createdAt ASC`,
      { modelId },
    );
    return r.records.map((rec) => {
      const props = (rec.get("cap") as { properties: CapProps }).properties;
      // Filter the {id:null} miss row; sort-by-name-take-first so the
      // row is deterministic even under a DD-17 cardinality violation.
      const contexts = (rec.get("contexts") as Array<{ id: string | null; name: string | null }>)
        .filter((c): c is { id: string; name: string } => c.id !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
      const first = contexts[0];
      return {
        ...envelope(props),
        neededByCount: rec.get("neededByCount") as number,
        supportingSystemCount: rec.get("supportingSystemCount") as number,
        assignedContextId: first?.id ?? null,
        assignedContextName: first?.name ?? null,
      };
    });
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Detail (FR-04, §4.2, DD-13)
// ---------------------------------------------------------------------------

export async function getCapability(
  driver: Driver,
  modelId: string,
  capabilityId: string,
): Promise<CapabilityRead> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (cap:Capability {id: $capabilityId})-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id: $modelId})
       // needed-by sources (labeled arms — Activity | UserStory)
       OPTIONAL MATCH (a:Activity)-[:NEEDS_CAPABILITY]->(cap)
       OPTIONAL MATCH (s:UserStory)-[:NEEDS_CAPABILITY]->(cap)
       OPTIONAL MATCH (cap)-[:SUPPORTED_BY]->(sys:System)
       OPTIONAL MATCH (cap)-[:ASSIGNED_TO_CONTEXT]->(bc:BoundedContext)
       // DD-13 — mapping edges WITHOUT the expected far-end label
       OPTIONAL MATCH (nx)-[:NEEDS_CAPABILITY]->(cap)
         WHERE NOT (nx:Activity OR nx:UserStory)
       OPTIONAL MATCH (cap)-[:SUPPORTED_BY]->(sx) WHERE NOT sx:System
       OPTIONAL MATCH (cap)-[:ASSIGNED_TO_CONTEXT]->(cx) WHERE NOT cx:BoundedContext
       RETURN cap,
              collect(DISTINCT {id: a.id, name: a.name})   AS activities,
              collect(DISTINCT {id: s.id, name: s.name})   AS stories,
              collect(DISTINCT {id: sys.id, name: sys.name, attrs: sys.attributes_json}) AS systems,
              collect(DISTINCT {id: bc.id, name: bc.name, domain: bc.domain, subdomain: bc.subdomain}) AS contexts,
              collect(DISTINCT nx.id) AS detachedNeededBy,
              collect(DISTINCT sx.id) AS detachedSupportedBy,
              collect(DISTINCT cx.id) AS detachedContexts`,
      { modelId, capabilityId },
    );
    const rec = r.records[0];
    if (!rec) {
      throw new ValidationError("capability_not_found", { capabilityId, modelId }, 404);
    }
    const props = (rec.get("cap") as { properties: CapProps }).properties;

    const notNull = <T extends { id: string | null }>(rows: T[]) =>
      rows.filter((x): x is T & { id: string } => x.id !== null);

    const neededBy: NeededByItem[] = [
      ...notNull(rec.get("activities") as Array<{ id: string | null; name: string | null }>).map(
        (a) => ({ kind: "activity" as const, id: a.id, name: a.name ?? "" }),
      ),
      ...notNull(rec.get("stories") as Array<{ id: string | null; name: string | null }>).map(
        (s) => ({ kind: "story" as const, id: s.id, name: s.name ?? "" }),
      ),
    ];

    const supportedBy: SupportedByItem[] = notNull(
      rec.get("systems") as Array<{ id: string | null; name: string | null; attrs: string | null }>,
    ).map((s) => ({
      id: s.id,
      name: s.name ?? "",
      systemKind: parseSystemKind(s.attrs),
    }));

    const contexts = notNull(
      rec.get("contexts") as Array<{
        id: string | null;
        name: string | null;
        domain: string | null;
        subdomain: string | null;
      }>,
    ).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    const firstContext = contexts[0] ?? null;

    const detached: DetachedItem[] = [
      ...(rec.get("detachedNeededBy") as Array<string | null>)
        .filter((id): id is string => id !== null)
        .map((targetId) => ({ kind: "needed-by" as const, targetId })),
      ...(rec.get("detachedSupportedBy") as Array<string | null>)
        .filter((id): id is string => id !== null)
        .map((targetId) => ({ kind: "supported-by" as const, targetId })),
      ...(rec.get("detachedContexts") as Array<string | null>)
        .filter((id): id is string => id !== null)
        .map((targetId) => ({ kind: "context" as const, targetId })),
    ];

    return {
      ...envelope(props),
      neededByCount: neededBy.length,
      supportingSystemCount: supportedBy.length,
      assignedContextId: firstContext?.id ?? null,
      assignedContextName: firstContext?.name ?? null,
      neededBy,
      supportedBy,
      assignedContext: firstContext
        ? {
            id: firstContext.id,
            name: firstContext.name ?? "",
            domain: firstContext.domain ?? null,
            subdomain: firstContext.subdomain ?? null,
          }
        : null,
      detached,
    };
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Create / Patch / Delete (FR-04, FR-06)
// ---------------------------------------------------------------------------

export async function createCapability(
  driver: Driver,
  modelId: string,
  input: CapabilityCreateInput,
): Promise<CapabilityRead> {
  const session = driver.session();
  try {
    // (1) Model check — the create side of the pinned asymmetry.
    const m = await session.run(
      `MATCH (m:BusinessModel {id: $modelId}) RETURN m.id AS id`,
      { modelId },
    );
    if (m.records.length === 0) {
      throw new ValidationError("model_not_found", { modelId }, 404);
    }

    // (2) Atomic create + membership in ONE write tx (DD-03; the MERGE
    // is over a fresh node so it always creates; the endpoint pair is
    // registered so no mismatch is possible here).
    const id = generateId();
    const now = new Date().toISOString();
    await session.executeWrite(async (tx) => {
      await tx.run(
        `CREATE (cap:Capability {
           id: $id, name: $name, description: $description,
           createdAt: $now, updatedAt: $now, attributes_json: $attrs
         })
         WITH cap
         MATCH (m:BusinessModel {id: $modelId})
         MERGE (cap)-[:CAPABILITY_IN_MODEL]->(m)`,
        {
          id,
          name: input.name,
          description: input.description ?? "",
          now,
          attrs: JSON.stringify(input.attributes ?? {}),
          modelId,
        },
      );
    });
    return await getCapability(driver, modelId, id);
  } finally {
    await session.close();
  }
}

export async function patchCapability(
  driver: Driver,
  modelId: string,
  capabilityId: string,
  patch: CapabilityPatchInput,
): Promise<CapabilityRead> {
  await assertMembership(driver, modelId, capabilityId);
  // Dynamic SET of the supplied fields only — omitted fields are never
  // clobbered (mirrors patchNode).
  const sets: string[] = ["cap.updatedAt = $now"];
  const params: Record<string, unknown> = {
    capabilityId,
    now: new Date().toISOString(),
  };
  if (patch.name !== undefined) {
    sets.push("cap.name = $name");
    params["name"] = patch.name;
  }
  if (patch.description !== undefined) {
    sets.push("cap.description = $description");
    params["description"] = patch.description;
  }
  if (patch.attributes !== undefined) {
    sets.push("cap.attributes_json = $attrs");
    params["attrs"] = JSON.stringify(patch.attributes);
  }
  const session = driver.session();
  try {
    await session.run(
      `MATCH (cap:Capability {id: $capabilityId}) SET ${sets.join(", ")}`,
      params,
    );
  } finally {
    await session.close();
  }
  return getCapability(driver, modelId, capabilityId);
}

export async function deleteCapability(
  driver: Driver,
  modelId: string,
  capabilityId: string,
): Promise<void> {
  await assertMembership(driver, modelId, capabilityId);
  // Single-tx cascade (FR-06, §4.4): DETACH DELETE drops every edge
  // across all four participating types; the far-end nodes are never
  // in the delete set (AC-05).
  const session = driver.session();
  try {
    await session.run(
      `MATCH (cap:Capability {id: $capabilityId})-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id: $modelId})
       DETACH DELETE cap`,
      { modelId, capabilityId },
    );
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Mapping edges (FR-05, FR-03, DD-06, DD-12, DD-16)
// ---------------------------------------------------------------------------

export async function addNeededBy(
  driver: Driver,
  modelId: string,
  capabilityId: string,
  input: NeededByInput,
): Promise<CapabilityRead> {
  await assertMembership(driver, modelId, capabilityId);
  const scoped = await scopedNodeIds(driver, modelId);
  const session = driver.session();
  try {
    if (input.activityId !== undefined) {
      // STRICT arm only (DD-16): the Activity must exist AND be in
      // scopedNodeIds(modelId) — an orphan activity is 404 not_found.
      const a = await session.run(
        `MATCH (a:Activity {id: $id}) RETURN a.id AS id`,
        { id: input.activityId },
      );
      if (a.records.length === 0 || !scoped.has(input.activityId)) {
        throw new ValidationError("not_found", { field: "activityId", id: input.activityId }, 404);
      }
      await assertEndpointPair(driver, "NEEDS_CAPABILITY", "Activity", "Capability");
      await session.run(
        `MATCH (a:Activity {id: $id}), (cap:Capability {id: $capabilityId})
         MERGE (a)-[:NEEDS_CAPABILITY]->(cap)`,
        { id: input.activityId, capabilityId },
      );
    } else {
      // A UserStory belongs to the model iff its DESCRIBES_ACTIVITY
      // activity is in scopedNodeIds (consumes story-spec-core's join;
      // a story describing an orphan activity is 404 — DD-16).
      const s = await session.run(
        `MATCH (s:UserStory {id: $id})-[:DESCRIBES_ACTIVITY]->(a:Activity)
         RETURN a.id AS activityId`,
        { id: input.storyId },
      );
      const activityId = s.records[0]?.get("activityId") as string | undefined;
      if (activityId === undefined || !scoped.has(activityId)) {
        throw new ValidationError("not_found", { field: "storyId", id: input.storyId }, 404);
      }
      await assertEndpointPair(driver, "NEEDS_CAPABILITY", "UserStory", "Capability");
      await session.run(
        `MATCH (s:UserStory {id: $id}), (cap:Capability {id: $capabilityId})
         MERGE (s)-[:NEEDS_CAPABILITY]->(cap)`,
        { id: input.storyId, capabilityId },
      );
    }
  } finally {
    await session.close();
  }
  return getCapability(driver, modelId, capabilityId);
}

export async function removeNeededBy(
  driver: Driver,
  modelId: string,
  capabilityId: string,
  input: NeededByInput,
): Promise<void> {
  await assertMembership(driver, modelId, capabilityId);
  const srcId = input.activityId ?? input.storyId!;
  const session = driver.session();
  try {
    await session.run(
      `MATCH (src {id: $srcId})-[r:NEEDS_CAPABILITY]->(:Capability {id: $capabilityId})
       DELETE r`,
      { srcId, capabilityId },
    );
  } finally {
    await session.close();
  }
}

export async function addSupportedBy(
  driver: Driver,
  modelId: string,
  capabilityId: string,
  systemId: string,
): Promise<CapabilityRead> {
  await assertMembership(driver, modelId, capabilityId);
  const session = driver.session();
  try {
    const s = await session.run(`MATCH (s:System {id: $systemId}) RETURN s.id AS id`, {
      systemId,
    });
    if (s.records.length === 0) {
      throw new ValidationError("system_not_found", { systemId }, 404);
    }
    await assertEndpointPair(driver, "SUPPORTED_BY", "Capability", "System");
    await session.run(
      `MATCH (cap:Capability {id: $capabilityId}), (s:System {id: $systemId})
       MERGE (cap)-[:SUPPORTED_BY]->(s)`,
      { capabilityId, systemId },
    );
  } finally {
    await session.close();
  }
  return getCapability(driver, modelId, capabilityId);
}

export async function removeSupportedBy(
  driver: Driver,
  modelId: string,
  capabilityId: string,
  systemId: string,
): Promise<void> {
  await assertMembership(driver, modelId, capabilityId);
  const session = driver.session();
  try {
    await session.run(
      `MATCH (:Capability {id: $capabilityId})-[r:SUPPORTED_BY]->(:System {id: $systemId})
       DELETE r`,
      { capabilityId, systemId },
    );
  } finally {
    await session.close();
  }
}

export async function setContext(
  driver: Driver,
  modelId: string,
  capabilityId: string,
  boundedContextId: string,
): Promise<CapabilityRead> {
  await assertMembership(driver, modelId, capabilityId);
  const session = driver.session();
  try {
    // N-05 — no single-context lookup route exists; a direct READ is
    // permitted under NFR-04 (zero context data written).
    const bc = await session.run(
      `MATCH (bc:BoundedContext {id: $boundedContextId}) RETURN bc.id AS id`,
      { boundedContextId },
    );
    if (bc.records.length === 0) {
      throw new ValidationError("bounded_context_not_found", { boundedContextId }, 404);
    }
    await assertEndpointPair(driver, "ASSIGNED_TO_CONTEXT", "Capability", "BoundedContext");
    // REPLACE in one tx (at-most-one, FR-03) — deletes ALL prior edges
    // (DD-17(iii) self-heal under a rogue multi-assign).
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MATCH (cap:Capability {id: $capabilityId})
         OPTIONAL MATCH (cap)-[old:ASSIGNED_TO_CONTEXT]->()
         DELETE old
         WITH DISTINCT cap
         MATCH (bc:BoundedContext {id: $boundedContextId})
         MERGE (cap)-[:ASSIGNED_TO_CONTEXT]->(bc)`,
        { capabilityId, boundedContextId },
      );
    });
  } finally {
    await session.close();
  }
  return getCapability(driver, modelId, capabilityId);
}

export async function clearContext(
  driver: Driver,
  modelId: string,
  capabilityId: string,
): Promise<void> {
  await assertMembership(driver, modelId, capabilityId);
  const session = driver.session();
  try {
    await session.run(
      `MATCH (:Capability {id: $capabilityId})-[r:ASSIGNED_TO_CONTEXT]->()
       DELETE r`,
      { capabilityId },
    );
  } finally {
    await session.close();
  }
}
