// business-model-authoring — the three model-scoped authoring routes
// (design §4.3 / §4.4 / §4.9, route set per DD-06 §5.0):
//
//   POST  /api/v1/models/:modelId/authoring/apply     (model:write)
//   GET   /api/v1/models/:modelId/authoring/graph     (model:read)
//   PATCH /api/v1/models/:modelId/domains/:domainId   (model:write)
//
// Auth is the central router gate (router.ts + ROUTE_PERMISSIONS) —
// never per-route (house rule, NFR-04). All bodies zod-validated
// against shared/src/schema/authoring.ts (T-01); errors ride the
// standard {error:{code,message,details?}} envelope via
// ValidationError → fromValidationError.
//
// The apply handler REUSES graph-core's proven two-phase writer: it
// mints server-side UUIDv7s, validates label + model scope of every
// referenced pre-existing id (step 5 — DD-07 as refined by DD-09,
// DR3-N-01), assembles an import-shaped payload and lands it through
// the exported `realImport` (§4.7, OQ-1 (a)) — no re-implementation,
// no HTTP loopback. It writes NO Domain row and NO IN_MODEL edge
// (C-02) and introduces no new label/edge type (NFR-01).

import {
  authoringApplySchema,
  domainPatchSchema,
  type AuthoringApply,
  type AuthoringApplyResult,
  type AuthoringGraph,
} from "@companygraph/shared/schema/authoring";
import { getDriver } from "../neo4j/driver";
import { generateId, isUuidV7 } from "../ids";
import { ValidationError } from "../errors";
import { parseOrThrow } from "../validate";
import { ok, readJson } from "./_helpers";
import { realImport } from "./import";
import { getModel } from "../storage/models";
import { scopedNodeIds } from "../storage/model-scope";
import { patchNode } from "../storage/nodes";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

interface RowError {
  section: "nodes" | "edges";
  index: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Model-scoped structural labels (mwc DEC-01) — shared Role/System/
// Location are global and EXEMPT from the step-5 scope check.
const MODEL_SCOPED_LABELS = new Set(["Domain", "UserJourney", "Activity"]);

// Canonical edge-id key: "<type>:<from>-><to>" with the request tokens
// VERBATIM (DR-N-02) — reconstructed identically by the client for
// idempotent re-submit.
function edgeKey(e: { type: string; from: string; to: string }): string {
  return `${e.type}:${e.from}->${e.to}`;
}

// ---------------------------------------------------------------------------
// POST /api/v1/models/:modelId/authoring/apply — design §4.3, seven steps
// ---------------------------------------------------------------------------

export async function handleAuthoringApply(
  req: Request,
  modelId: string,
): Promise<Response> {
  const driver = getDriver();

  // Step 2 — model existence (envelope-level 404 model_not_found).
  await getModel(driver, modelId);

  // Step 3 — envelope parse. A row with both existingId+id fails the
  // superRefine here (DR-N-03) → 400 invalid_payload.
  const body = await readJson(req);
  const payload: AuthoringApply = parseOrThrow(authoringApplySchema, body);

  // Step 4 — mint ids + assemble the canonical import payload. The
  // request row order IS the canonical index space every errors[].index
  // refers to (existingId rows hold their slot but emit no import row).
  const errors: RowError[] = [];
  const keyMap = new Map<string, string>(); // clientKey -> uuid
  const idsNodes: Record<string, string> = {};
  const idsEdges: Record<string, string> = {};

  interface NodeSlot {
    canonicalIndex: number;
    importRow: Record<string, unknown> | null; // null = existingId row (no emit)
    excluded: boolean;
    claimedLabel: string;
    preExistingId: string | null; // existingId or re-run id (step-5 subject)
    isExistingRef: boolean;
  }
  const nodeSlots: NodeSlot[] = [];

  payload.nodes.forEach((row, i) => {
    let uuid: string;
    let importRow: Record<string, unknown> | null = null;
    let preExistingId: string | null = null;
    let isExistingRef = false;
    if (row.existingId !== undefined) {
      uuid = row.existingId;
      preExistingId = row.existingId;
      isExistingRef = true;
      // pick-existing global node → NO import row (FR-05).
    } else {
      uuid = row.id ?? generateId();
      if (row.id !== undefined) preExistingId = row.id; // re-run upsert (C-04)
      importRow = {
        id: uuid,
        label: row.label,
        name: row.name,
        ...(row.description !== undefined ? { description: row.description } : {}),
        ...(row.attributes !== undefined ? { attributes: row.attributes } : {}),
      };
    }
    keyMap.set(row.clientKey, uuid);
    idsNodes[row.clientKey] = uuid;
    nodeSlots.push({
      canonicalIndex: i,
      importRow,
      excluded: false,
      claimedLabel: row.label,
      preExistingId,
      isExistingRef,
    });
  });

  interface EdgeSlot {
    canonicalIndex: number;
    importRow: { id: string; type: string; fromId: string; toId: string } | null;
    excluded: boolean;
    rawEndpointIds: string[]; // endpoints supplied as raw pre-existing UUIDs
  }
  const edgeSlots: EdgeSlot[] = [];

  payload.edges.forEach((row, i) => {
    const resolve = (token: string): { id: string; raw: boolean } | null => {
      const mapped = keyMap.get(token);
      if (mapped !== undefined) return { id: mapped, raw: false };
      if (isUuidV7(token)) return { id: token, raw: true };
      return null;
    };
    const from = resolve(row.from);
    const to = resolve(row.to);
    const id = row.id ?? generateId();
    idsEdges[edgeKey(row)] = id; // echoed for ALL rows incl. failed (DR2-C-03)
    if (from === null || to === null) {
      errors.push({
        section: "edges",
        index: i,
        code: "invalid_payload",
        message: "edge endpoint token is neither a clientKey in this batch nor a UUID",
        details: {
          unresolvedTokens: [
            ...(from === null ? [row.from] : []),
            ...(to === null ? [row.to] : []),
          ],
        },
      });
      edgeSlots.push({ canonicalIndex: i, importRow: null, excluded: true, rawEndpointIds: [] });
      return;
    }
    edgeSlots.push({
      canonicalIndex: i,
      importRow: { id, type: row.type, fromId: from.id, toId: to.id },
      excluded: false,
      rawEndpointIds: [
        ...(from.raw ? [from.id] : []),
        ...(to.raw ? [to.id] : []),
      ],
    });
  });

  // Step 5 — label + model-scope validation of every referenced
  // pre-existing id (DD-07 as refined by DD-09; DR2-B-02, DR3-C-02,
  // DR3-N-01). One resolution query walks the same anchor chain
  // scopedNodeIds walks and yields each id's labels + owning model(s).
  const referenced = new Set<string>();
  for (const s of nodeSlots) if (s.preExistingId !== null) referenced.add(s.preExistingId);
  for (const s of edgeSlots) for (const id of s.rawEndpointIds) referenced.add(id);

  const resolved = new Map<string, { labels: string[]; modelIds: string[] }>();
  if (referenced.size > 0) {
    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      const result = await session.run(
        `MATCH (n) WHERE n.id IN $ids
         OPTIONAL MATCH (n)-[:PART_OF*0..]->(d:Domain)-[:IN_MODEL]->(m:BusinessModel)
         RETURN n.id AS id, labels(n) AS labels, collect(DISTINCT m.id) AS modelIds`,
        { ids: Array.from(referenced) },
      );
      for (const rec of result.records) {
        resolved.set(rec.get("id") as string, {
          labels: rec.get("labels") as string[],
          modelIds: rec.get("modelIds") as string[],
        });
      }
    } finally {
      await session.close();
    }
  }

  // A referenced id is PROVABLY FOREIGN when it exists, carries a
  // model-scoped label, and its anchor chain reaches only OTHER
  // models (DD-09). A no-model orphan (modelIds empty) is re-anchorable
  // and passes — this keeps the echoed-id retry contract honest
  // (DR2-C-03). An id that does not exist at all passes (MERGE on an
  // absent id is a create).
  const isForeign = (id: string): boolean => {
    const r = resolved.get(id);
    if (r === undefined) return false;
    if (!r.labels.some((l) => MODEL_SCOPED_LABELS.has(l))) return false;
    return r.modelIds.length > 0 && !r.modelIds.includes(modelId);
  };

  for (const s of nodeSlots) {
    if (s.preExistingId === null) continue;
    const r = resolved.get(s.preExistingId);
    if (r === undefined) continue; // absent id → allowed (create)
    // Label check (DR3-N-01), all labels: resolved labels must include
    // the claimed label — otherwise MERGE would mint a duplicate-id
    // node under the claimed label.
    if (!r.labels.includes(s.claimedLabel)) {
      errors.push({
        section: "nodes",
        index: s.canonicalIndex,
        code: "invalid_payload",
        message: "referenced id exists under a different label",
        details: { labelMismatch: [s.preExistingId] },
      });
      s.excluded = true;
      continue;
    }
    // Scope check (DD-09) — model-scoped labels only.
    if (isForeign(s.preExistingId)) {
      errors.push({
        section: "nodes",
        index: s.canonicalIndex,
        code: "invalid_payload",
        message: "referenced id belongs to a different model",
        details: { outOfModel: [s.preExistingId] },
      });
      s.excluded = true;
    }
  }

  for (const s of edgeSlots) {
    if (s.excluded || s.importRow === null) continue;
    const foreign = s.rawEndpointIds.filter(isForeign);
    if (foreign.length > 0) {
      errors.push({
        section: "edges",
        index: s.canonicalIndex,
        code: "invalid_payload",
        message: "edge references node(s) belonging to a different model",
        details: { outOfModel: foreign },
      });
      s.excluded = true;
    }
  }

  // Step 6 — land the filtered payload via the exported realImport
  // (§4.7). Keep the filtered→canonical index maps for the remap.
  const filteredNodes: Record<string, unknown>[] = [];
  const nodeIndexMap: number[] = [];
  for (const s of nodeSlots) {
    if (s.importRow !== null && !s.excluded) {
      filteredNodes.push(s.importRow);
      nodeIndexMap.push(s.canonicalIndex);
    }
  }
  const filteredEdges: Record<string, unknown>[] = [];
  const edgeIndexMap: number[] = [];
  for (const s of edgeSlots) {
    if (s.importRow !== null && !s.excluded) {
      filteredEdges.push(s.importRow as unknown as Record<string, unknown>);
      edgeIndexMap.push(s.canonicalIndex);
    }
  }

  const result = await realImport(driver, { nodes: filteredNodes, edges: filteredEdges });

  // Remap realImport's (filtered-payload) indexes back to canonical
  // order and merge with the step-4/5 rejections.
  const remapped: RowError[] = (result.errors ?? []).map((e) => ({
    ...e,
    index: e.section === "nodes" ? nodeIndexMap[e.index]! : edgeIndexMap[e.index]!,
  }));
  const merged = [...errors, ...remapped].sort((a, b) =>
    a.section === b.section ? a.index - b.index : a.section === "nodes" ? -1 : 1,
  );

  // Step 7 — 200 even when 100% of rows fail (import's pinned C-09);
  // 400 is reserved for the step-3 envelope parse.
  const response: AuthoringApplyResult = {
    imported: result.imported,
    ...(merged.length > 0 ? { errors: merged } : {}),
    ids: { nodes: idsNodes, edges: idsEdges },
  };
  return ok(response);
}

// ---------------------------------------------------------------------------
// GET /api/v1/models/:modelId/authoring/graph — design §4.4 (DD-01)
// ---------------------------------------------------------------------------

export async function handleAuthoringGraph(
  _req: Request,
  modelId: string,
): Promise<Response> {
  const driver = getDriver();
  await getModel(driver, modelId); // 404 model_not_found

  // mwc's structural member set — on disk it ALSO holds ModuleInstance
  // pin ids (INSTANCE_IN, model-scope.ts — DR3-N-02), so every query
  // below filters by label and never trusts the set's composition.
  const scope = await scopedNodeIds(driver, modelId);
  const ids = Array.from(scope);

  const session = driver.session({ defaultAccessMode: "READ" });
  interface JourneyRec { id: string; name: string; domainId: string }
  interface ActivityRec { journeyId: string; id: string; name: string; createdAt: string }
  interface LayerRec { id: string; name: string; activityIds: string[] }
  let journeyRecs: JourneyRec[] = [];
  let activityRecs: ActivityRec[] = [];
  let precedesRecs: Array<{ fromActivityId: string; toActivityId: string }> = [];
  let roleRecs: LayerRec[] = [];
  let systemRecs: LayerRec[] = [];
  let locationRecs: LayerRec[] = [];
  try {
    const journeys = await session.run(
      `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)-[:IN_MODEL]->(:BusinessModel {id: $modelId})
       WHERE j.id IN $ids
       RETURN j.id AS id, j.name AS name, d.id AS domainId
       ORDER BY j.createdAt ASC`,
      { modelId, ids },
    );
    journeyRecs = journeys.records.map((r) => ({
      id: r.get("id") as string,
      name: r.get("name") as string,
      domainId: r.get("domainId") as string,
    }));

    const activities = await session.run(
      `MATCH (a:Activity)-[:PART_OF]->(j:UserJourney)
       WHERE a.id IN $ids AND j.id IN $ids
       RETURN j.id AS journeyId, a.id AS id, a.name AS name, a.createdAt AS createdAt`,
      { ids },
    );
    activityRecs = activities.records.map((r) => ({
      journeyId: r.get("journeyId") as string,
      id: r.get("id") as string,
      name: r.get("name") as string,
      createdAt: (r.get("createdAt") as string) ?? "",
    }));

    const precedes = await session.run(
      `MATCH (a1:Activity)-[:PRECEDES]->(a2:Activity)
       WHERE a1.id IN $ids AND a2.id IN $ids
       RETURN a1.id AS fromActivityId, a2.id AS toActivityId`,
      { ids },
    );
    precedesRecs = precedes.records.map((r) => ({
      fromActivityId: r.get("fromActivityId") as string,
      toActivityId: r.get("toActivityId") as string,
    }));

    const layer = async (cypher: string): Promise<LayerRec[]> => {
      const res = await session.run(cypher, { ids });
      return res.records.map((r) => ({
        id: r.get("id") as string,
        name: r.get("name") as string,
        activityIds: r.get("activityIds") as string[],
      }));
    };
    // Shared reference layers — read via the edges FROM the in-scope
    // activities (DEC-01 (a): global, never scoped, never leaked as
    // "membership", legitimately visible to every model).
    roleRecs = await layer(
      `MATCH (r:Role)-[:EXECUTES]->(a:Activity) WHERE a.id IN $ids
       RETURN r.id AS id, r.name AS name, collect(DISTINCT a.id) AS activityIds`,
    );
    systemRecs = await layer(
      `MATCH (a:Activity)-[:USES_SYSTEM]->(s:System) WHERE a.id IN $ids
       RETURN s.id AS id, s.name AS name, collect(DISTINCT a.id) AS activityIds`,
    );
    locationRecs = await layer(
      `MATCH (a:Activity)-[:AT_LOCATION]->(l:Location) WHERE a.id IN $ids
       RETURN l.id AS id, l.name AS name, collect(DISTINCT a.id) AS activityIds`,
    );
  } finally {
    await session.close();
  }

  // Per-journey `order`: topological over the journey's INTRA-journey
  // PRECEDES chain; createdAt ascending for unordered ties (§4.4). No
  // column math on the server — columns are the client mapper's job.
  const graph: AuthoringGraph = {
    journeys: journeyRecs.map((j) => {
      const acts = activityRecs.filter((a) => a.journeyId === j.id);
      const actIds = new Set(acts.map((a) => a.id));
      const intra = precedesRecs.filter(
        (p) => actIds.has(p.fromActivityId) && actIds.has(p.toActivityId),
      );
      const indegree = new Map<string, number>(acts.map((a) => [a.id, 0]));
      const out = new Map<string, string[]>();
      for (const p of intra) {
        indegree.set(p.toActivityId, (indegree.get(p.toActivityId) ?? 0) + 1);
        out.set(p.fromActivityId, [...(out.get(p.fromActivityId) ?? []), p.toActivityId]);
      }
      const byTie = (x: string, y: string): number => {
        const ax = acts.find((a) => a.id === x)!;
        const ay = acts.find((a) => a.id === y)!;
        return ax.createdAt < ay.createdAt ? -1 : ax.createdAt > ay.createdAt ? 1 : x < y ? -1 : 1;
      };
      const ready = acts.map((a) => a.id).filter((id) => (indegree.get(id) ?? 0) === 0).sort(byTie);
      const ordered: string[] = [];
      while (ready.length > 0) {
        const id = ready.shift()!;
        ordered.push(id);
        for (const next of out.get(id) ?? []) {
          const deg = (indegree.get(next) ?? 0) - 1;
          indegree.set(next, deg);
          if (deg === 0) {
            ready.push(next);
            ready.sort(byTie);
          }
        }
      }
      // Cycle fallback: any activity not emitted (cyclic PRECEDES) is
      // appended in createdAt order — the projection never drops rows.
      for (const a of [...acts].sort((x, y) => byTie(x.id, y.id))) {
        if (!ordered.includes(a.id)) ordered.push(a.id);
      }
      return {
        id: j.id,
        name: j.name,
        domainId: j.domainId,
        activities: ordered.map((id, order) => {
          const a = acts.find((x) => x.id === id)!;
          return { id: a.id, name: a.name, order };
        }),
      };
    }),
    roles: roleRecs.map((r) => ({ id: r.id, name: r.name, executesActivityIds: r.activityIds })),
    systems: systemRecs.map((s) => ({ id: s.id, name: s.name, usedByActivityIds: s.activityIds })),
    locations: locationRecs.map((l) => ({ id: l.id, name: l.name, activityIds: l.activityIds })),
    precedes: precedesRecs,
  };
  return ok(graph);
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/models/:modelId/domains/:domainId — design §4.9 (DD-08)
// ---------------------------------------------------------------------------

export async function handleModelDomainPatch(
  req: Request,
  modelId: string,
  domainId: string,
): Promise<Response> {
  const driver = getDriver();

  // Absent model first — same check order as the other two handlers.
  await getModel(driver, modelId); // 404 model_not_found

  const body = await readJson(req);
  const input = parseOrThrow(domainPatchSchema, body); // {} fails the refine

  // Scope check (D-2 regime): a domain that is absent and a domain
  // scoped to a DIFFERENT model are deliberately indistinguishable
  // (path-addressed resource; no cross-model existence leak, NFR-03).
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (d:Domain {id: $domainId})-[:IN_MODEL]->(m:BusinessModel {id: $modelId})
       RETURN d.id AS id`,
      { domainId, modelId },
    );
    if (result.records.length === 0) {
      throw new ValidationError("not_found", { kind: "Domain", id: domainId, modelId }, 404);
    }
  } finally {
    await session.close();
  }

  // Delegate the write to graph-core's storage primitive — partial
  // dynamic SET; omitted fields never clobbered; `attributes` is never
  // passed so the attributes map stays untouched; updatedAt handled by
  // patchNode.
  const node = await patchNode(driver, "Domain", domainId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
  });
  return ok(node);
}

// ---------------------------------------------------------------------------
// Router delegate (design §5.1, TR-C-01/TR-C-02) — a SIBLING of mwc's
// registerModelRoutes and story-spec-core's registerStoryRoutes.
// `api/src/routes/models.ts` is NOT edited. Exactly three arms; null on
// no-match. No ordering constraint vs. the mwc/stories blocks: all
// three paths are 4-segment with literal `authoring`/`domains` segments
// no other arm matches at that shape.
// ---------------------------------------------------------------------------

export async function registerAuthoringRoutes(
  method: string,
  sub: string,
  req: Request,
): Promise<Response | null> {
  const apply = sub.match(/^models\/([^/]+)\/authoring\/apply$/);
  if (apply && method === "POST") return handleAuthoringApply(req, apply[1]!);

  const graph = sub.match(/^models\/([^/]+)\/authoring\/graph$/);
  if (graph && method === "GET") return handleAuthoringGraph(req, graph[1]!);

  const domainPatch = sub.match(/^models\/([^/]+)\/domains\/([^/]+)$/);
  if (domainPatch && method === "PATCH") {
    return handleModelDomainPatch(req, domainPatch[1]!, domainPatch[2]!);
  }

  return null;
}
