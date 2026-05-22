import { edgeCreateSchema } from "@companygraph/shared/schema/edges";
import { getDriver } from "../neo4j/driver";
import { parseOrThrow } from "../validate";
import { createEdge, deleteEdge } from "../storage/edges";
import { error, noContent, ok, parseId, readJson } from "./_helpers";

export async function handleEdgePost(req: Request): Promise<Response> {
  const body = await readJson(req);
  const input = parseOrThrow(edgeCreateSchema, body);
  const edge = await createEdge(getDriver(), input);
  return ok(edge, 201);
}

export async function handleEdgeDelete(_req: Request, idParam: string): Promise<Response> {
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });
  await deleteEdge(getDriver(), id);
  return noContent();
}
