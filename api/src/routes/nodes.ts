import {
  nodeCreateSchema,
  nodeUpdateSchema,
} from "@companygraph/shared/schema/nodes";
import { getDriver } from "../neo4j/driver";
import { parseOrThrow } from "../validate";
import {
  createNode,
  getNode,
  patchNode,
  deleteNode,
} from "../storage/nodes";
import {
  error,
  noContent,
  ok,
  parseId,
  parseRegistryLabel,
  readJson,
} from "./_helpers";
import { assertNotLifecycleLabel } from "../storage/model-lifecycle-guard";

// graph-core's contract (per its FR-06 / AC-05) is `400 unknown_label`
// when the URL `:label` segment doesn't resolve to a registered node
// label — NOT `404 not_found`. The distinction matters because /nodes/:label
// is a class endpoint (the label is a request validation concern), not
// a resource endpoint (where 404 would be right). The ontology-manager
// routes use 404 for their `:name` segments because there the segment
// IS the resource identifier. Two valid REST conventions; we keep the
// historical graph-core contract here.

export async function handleNodePost(req: Request, labelParam: string): Promise<Response> {
  const label = await parseRegistryLabel(labelParam);
  if (!label) return error(400, "unknown_label", "unknown node label", { label: labelParam });
  // model-workspace-core T-10 (design §4.6): lifecycle labels are
  // written only by their dedicated routes → 409.
  assertNotLifecycleLabel(label);
  const body = await readJson(req);
  const input = parseOrThrow(nodeCreateSchema, body);
  const node = await createNode(getDriver(), label, input);
  return ok(node, 201);
}

export async function handleNodeGet(_req: Request, labelParam: string, idParam: string): Promise<Response> {
  const label = await parseRegistryLabel(labelParam);
  if (!label) return error(400, "unknown_label", "unknown node label", { label: labelParam });
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });
  const node = await getNode(getDriver(), label, id);
  return ok(node);
}

export async function handleNodePatch(req: Request, labelParam: string, idParam: string): Promise<Response> {
  const label = await parseRegistryLabel(labelParam);
  if (!label) return error(400, "unknown_label", "unknown node label", { label: labelParam });
  assertNotLifecycleLabel(label); // T-10 — see handleNodePost
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });
  const body = await readJson(req);
  const input = parseOrThrow(nodeUpdateSchema, body);
  const node = await patchNode(getDriver(), label, id, input);
  return ok(node);
}

export async function handleNodeDelete(req: Request, labelParam: string, idParam: string): Promise<Response> {
  const label = await parseRegistryLabel(labelParam);
  if (!label) return error(400, "unknown_label", "unknown node label", { label: labelParam });
  assertNotLifecycleLabel(label); // T-10 — see handleNodePost
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });
  const cascade = new URL(req.url).searchParams.get("cascade") === "true";
  await deleteNode(getDriver(), label, id, cascade);
  return noContent();
}
