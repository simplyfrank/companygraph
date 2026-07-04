// model-workspace-core — /api/v1/models* handlers (design §5).
//
// Built across three tasks on an add-only seam (tasks pass-1 C-03):
//   T-08 — handleInstanceNodePatch (the fork trigger for NODES) —
//          complete and final in that task.
//   T-22 — handleInstanceEdgePost / handleInstanceEdgeDelete (the fork
//          trigger for EDGES) — ADDED without modifying T-08's export.
//   T-11 — the remaining model CRUD / domains / instance handlers —
//          ADDED without modifying T-08's or T-22's exports.
//
// Auth is the central router gate (router.ts + ROUTE_PERMISSIONS) —
// never per-route (house rule). All bodies zod-validated (T-01
// schemas); errors ride the standard {error:{code,message,details?}}
// envelope via ValidationError → fromValidationError.

import {
  modelCreateSchema,
  modelPatchSchema,
  domainAttachSchema,
  instanceCreateSchema,
  instanceUpgradeSchema,
  instanceEdgeSchema,
} from "@companygraph/shared/schema/model-workspace";
import { nodeUpdateSchema } from "@companygraph/shared/schema/nodes";
import { getDriver } from "../neo4j/driver";
import { parseOrThrow } from "../validate";
import { ValidationError } from "../errors";
import {
  createModel,
  listModels,
  getModel,
  patchModel,
  archiveModel,
  deleteModel,
  attachDomain,
} from "../storage/models";
import {
  instantiate,
  listInstances,
  getInstance,
  forkInstance,
  upgradeInstance,
  createInstanceEdge,
  deleteInstanceEdge,
  resolveLiveMember,
  readInstanceRow,
  parseSyntheticHandle,
} from "../storage/modules";
import type { Snapshot } from "@companygraph/shared/schema/model-workspace";
import { patchNode } from "../storage/nodes";
import { error, noContent, ok, parseId, readJson } from "./_helpers";

// Asserts the instance exists AND belongs to the routed model — an
// instance addressed through the wrong model's path never resolves
// (NFR-03a; the :modelId path param is the scope, D-1).
async function assertInstanceInModel(modelId: string, instanceId: string) {
  const row = await readInstanceRow(getDriver(), instanceId);
  if (row.modelId !== modelId) {
    throw new ValidationError("not_found", { kind: "ModuleInstance", id: instanceId, modelId }, 404);
  }
  return row;
}

// ---------------------------------------------------------------------------
// T-08 — fork trigger (nodes). PATCH
// /api/v1/models/:modelId/module-instances/:instanceId/nodes/:nodeId
//
// `:nodeId` accepts either a live UUIDv7 or a synthetic
// `<instanceId>::<key>` content handle (design §3.4). The handle
// travels as the path segment VERBATIM — the router splits only on
// `/`; this handler splits on the literal `::` (N-06); clients must
// never percent-encode or otherwise URL-mangle the `::`.
//
// Resolution (design §4.4):
//  - non-forked instance: ONLY a synthetic member handle is accepted →
//    triggers forkInstance, maps the key to the fresh live id, applies
//    the edit. A raw UUID is never a member → 404.
//  - forked instance: live UUID (prefix membership) or synthetic handle
//    (exact forkLocalKey equality) → local edit, NO fork.
//  - anything else → 404 module_instance_node_not_member.
// This route NEVER writes version content (D-4:
// module_version_immutable is not reachable here).
// ---------------------------------------------------------------------------

export async function handleInstanceNodePatch(
  req: Request,
  modelId: string,
  instanceId: string,
  nodeId: string,
): Promise<Response> {
  const driver = getDriver();
  const row = await assertInstanceInModel(modelId, instanceId);
  const body = await readJson(req);
  const input = parseOrThrow(nodeUpdateSchema, body);

  const notMember = () =>
    error(404, "module_instance_node_not_member", "node is not a member of this instance's subtree", {
      instanceId,
      nodeId,
    });

  if (!row.forked) {
    const synthetic = parseSyntheticHandle(nodeId);
    if (!synthetic || synthetic.instanceId !== instanceId) return notMember();
    const snapshot = JSON.parse(row.snapshotJson) as Snapshot;
    const isMember =
      synthetic.key === "journey" ||
      snapshot.activities.some((a) => a.localKey === synthetic.key);
    if (!isMember) return notMember();
    const fork = await forkInstance(driver, instanceId);
    const liveId = fork.map.get(synthetic.key)!;
    const label = synthetic.key === "journey" ? "UserJourney" : "Activity";
    const node = await patchNode(driver, label, liveId, input);
    return ok(node);
  }

  // Forked: resolve by forkLocalKey (synthetic → equality, raw UUID →
  // prefix membership). Deleted-anchor hardening (C-01): a handle whose
  // materialized node was generic-DELETEd resolves to nothing → 404.
  const member = await resolveLiveMember(driver, instanceId, nodeId);
  const node = await patchNode(driver, member.label, member.id, input);
  return ok(node);
}

// ---------------------------------------------------------------------------
// T-22 — fork trigger (edges). POST/DELETE
// /api/v1/models/:modelId/module-instances/:instanceId/edges
//
// Instance edges are addressed by (type, endpoints) — never by edge id
// (snapshot precedes/*Refs rows carry no edge ids). DELETE carries a
// JSON body: RFC 9110 gives DELETE bodies no defined semantics, which
// is acceptable on this loopback + Vite-proxy stack (design N-11,
// carried per review C-03 — fall back to query params only if a client
// ever misbehaves; do not relitigate).
// ---------------------------------------------------------------------------

export async function handleInstanceEdgePost(
  req: Request,
  modelId: string,
  instanceId: string,
): Promise<Response> {
  await assertInstanceInModel(modelId, instanceId);
  const body = await readJson(req);
  const input = parseOrThrow(instanceEdgeSchema, body);
  const result = await createInstanceEdge(getDriver(), instanceId, input);
  // Idempotent MERGE semantics: 201 created, 200 already present.
  return ok(result, result.created ? 201 : 200);
}

export async function handleInstanceEdgeDelete(
  req: Request,
  modelId: string,
  instanceId: string,
): Promise<Response> {
  await assertInstanceInModel(modelId, instanceId);
  const body = await readJson(req);
  const input = parseOrThrow(instanceEdgeSchema, body);
  await deleteInstanceEdge(getDriver(), instanceId, input);
  return noContent();
}

// ---------------------------------------------------------------------------
// T-11 — model CRUD + domains + instance collection/fork/upgrade.
// ---------------------------------------------------------------------------

export async function handleModelPost(req: Request): Promise<Response> {
  const body = await readJson(req);
  const input = parseOrThrow(modelCreateSchema, body);
  const model = await createModel(getDriver(), input);
  return ok(model, 201);
}

export async function handleModelList(_req: Request): Promise<Response> {
  return ok(await listModels(getDriver()));
}

export async function handleModelGet(_req: Request, id: string): Promise<Response> {
  return ok(await getModel(getDriver(), id));
}

export async function handleModelPatch(req: Request, id: string): Promise<Response> {
  const body = await readJson(req);
  const input = parseOrThrow(modelPatchSchema, body);
  return ok(await patchModel(getDriver(), id, input));
}

export async function handleModelArchive(_req: Request, id: string): Promise<Response> {
  return ok(await archiveModel(getDriver(), id));
}

export async function handleModelDelete(_req: Request, id: string): Promise<Response> {
  await deleteModel(getDriver(), id);
  return noContent();
}

// POST /api/v1/models/:id/domains (design §4.3, review B-02) — the
// minimal sanctioned path that populates a user-created model.
export async function handleModelDomainPost(req: Request, id: string): Promise<Response> {
  const body = await readJson(req);
  const input = parseOrThrow(domainAttachSchema, body);
  const domain = await attachDomain(getDriver(), id, input);
  return ok(domain, 201);
}

export async function handleInstancePost(req: Request, modelId: string): Promise<Response> {
  const body = await readJson(req);
  const input = parseOrThrow(instanceCreateSchema, body);
  const instance = await instantiate(getDriver(), { modelId, ...input });
  return ok(instance, 201);
}

// GET …/module-instances — scoped by the :modelId PATH param (D-1: no
// ?model= query param anywhere in this spec). listInstances matches
// only (mi)-[:INSTANCE_IN]->(m {id:$modelId}), so model A never leaks
// model B's instances (AC-21 part 2).
export async function handleInstanceList(_req: Request, modelId: string): Promise<Response> {
  const model = await getModel(getDriver(), modelId); // 404 model_not_found on absent model
  return ok(await listInstances(getDriver(), model.id));
}

export async function handleInstanceFork(
  _req: Request,
  modelId: string,
  instanceId: string,
): Promise<Response> {
  await assertInstanceInModel(modelId, instanceId);
  await forkInstance(getDriver(), instanceId); // idempotent — already-forked is a no-op
  return ok(await getInstance(getDriver(), instanceId));
}

export async function handleInstanceUpgrade(
  req: Request,
  modelId: string,
  instanceId: string,
): Promise<Response> {
  await assertInstanceInModel(modelId, instanceId);
  const body = await readJson(req);
  const input = parseOrThrow(instanceUpgradeSchema, body);
  const instance = await upgradeInstance(
    getDriver(),
    instanceId,
    input.toVersion,
    input.allowDowngrade ?? false,
  );
  return ok(instance);
}

// ---------------------------------------------------------------------------
// Dispatch — one entry point the router delegates to for every
// /api/v1/models* sub-path (mirrors the existing per-resource blocks).
// Returns null when no models route matches (router falls through).
// ---------------------------------------------------------------------------

export async function registerModelRoutes(
  method: string,
  sub: string,
  req: Request,
): Promise<Response | null> {
  if (sub === "models") {
    if (method === "POST") return handleModelPost(req);
    if (method === "GET") return handleModelList(req);
  }

  // Specific instance sub-routes BEFORE the parameterized :id matches.
  const instNode = sub.match(/^models\/([^/]+)\/module-instances\/([^/]+)\/nodes\/([^/]+)$/);
  if (instNode && method === "PATCH") {
    const [, modelId, instanceId, nodeId] = instNode;
    if (!parseId(modelId!) || !parseId(instanceId!)) {
      return error(400, "invalid_payload", "malformed id", { modelId, instanceId });
    }
    return handleInstanceNodePatch(req, modelId!, instanceId!, nodeId!);
  }
  const instEdges = sub.match(/^models\/([^/]+)\/module-instances\/([^/]+)\/edges$/);
  if (instEdges) {
    const [, modelId, instanceId] = instEdges;
    if (!parseId(modelId!) || !parseId(instanceId!)) {
      return error(400, "invalid_payload", "malformed id", { modelId, instanceId });
    }
    if (method === "POST") return handleInstanceEdgePost(req, modelId!, instanceId!);
    if (method === "DELETE") return handleInstanceEdgeDelete(req, modelId!, instanceId!);
  }
  const instFork = sub.match(/^models\/([^/]+)\/module-instances\/([^/]+)\/fork$/);
  if (instFork && method === "POST") {
    return handleInstanceFork(req, instFork[1]!, instFork[2]!);
  }
  const instUpgrade = sub.match(/^models\/([^/]+)\/module-instances\/([^/]+)\/upgrade$/);
  if (instUpgrade && method === "POST") {
    return handleInstanceUpgrade(req, instUpgrade[1]!, instUpgrade[2]!);
  }
  const instances = sub.match(/^models\/([^/]+)\/module-instances$/);
  if (instances) {
    if (method === "POST") return handleInstancePost(req, instances[1]!);
    if (method === "GET") return handleInstanceList(req, instances[1]!);
  }
  const domains = sub.match(/^models\/([^/]+)\/domains$/);
  if (domains && method === "POST") return handleModelDomainPost(req, domains[1]!);
  const archive = sub.match(/^models\/([^/]+)\/archive$/);
  if (archive && method === "POST") return handleModelArchive(req, archive[1]!);
  const one = sub.match(/^models\/([^/]+)$/);
  if (one) {
    const id = one[1]!;
    if (method === "GET") return handleModelGet(req, id);
    if (method === "PATCH") return handleModelPatch(req, id);
    if (method === "DELETE") return handleModelDelete(req, id);
  }
  return null;
}
