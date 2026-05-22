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
  parseLabel,
  readJson,
} from "./_helpers";

export async function handleNodePost(req: Request, labelParam: string): Promise<Response> {
  const label = parseLabel(labelParam);
  if (!label) return error(400, "unknown_label", "unknown node label", { label: labelParam });
  const body = await readJson(req);
  const input = parseOrThrow(nodeCreateSchema, body);
  const node = await createNode(getDriver(), label, input);
  return ok(node, 201);
}

export async function handleNodeGet(_req: Request, labelParam: string, idParam: string): Promise<Response> {
  const label = parseLabel(labelParam);
  if (!label) return error(400, "unknown_label", "unknown node label", { label: labelParam });
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });
  const node = await getNode(getDriver(), label, id);
  return ok(node);
}

export async function handleNodePatch(req: Request, labelParam: string, idParam: string): Promise<Response> {
  const label = parseLabel(labelParam);
  if (!label) return error(400, "unknown_label", "unknown node label", { label: labelParam });
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });
  const body = await readJson(req);
  const input = parseOrThrow(nodeUpdateSchema, body);
  const node = await patchNode(getDriver(), label, id, input);
  return ok(node);
}

export async function handleNodeDelete(req: Request, labelParam: string, idParam: string): Promise<Response> {
  const label = parseLabel(labelParam);
  if (!label) return error(400, "unknown_label", "unknown node label", { label: labelParam });
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });
  const cascade = new URL(req.url).searchParams.get("cascade") === "true";
  await deleteNode(getDriver(), label, id, cascade);
  return noContent();
}
