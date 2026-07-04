import { edgeCreateSchema } from "@companygraph/shared/schema/edges";
import { getDriver } from "../neo4j/driver";
import { parseOrThrow } from "../validate";
import { createEdge, deleteEdge } from "../storage/edges";
import { assertNotLifecycleEdge } from "../storage/model-lifecycle-guard";
import { error, noContent, ok, parseId, readJson } from "./_helpers";

export async function handleEdgePost(req: Request): Promise<Response> {
  const body = await readJson(req);
  const input = parseOrThrow(edgeCreateSchema, body);
  // model-workspace-core T-10 (design §4.6): lifecycle edges
  // (IN_MODEL/HAS_VERSION/INSTANTIATES/INSTANCE_IN/FORKED_FROM) are
  // written only by their dedicated routes → 409.
  assertNotLifecycleEdge(input.type);
  const edge = await createEdge(getDriver(), input);
  return ok(edge, 201);
}

export async function handleEdgeDelete(_req: Request, idParam: string): Promise<Response> {
  const id = parseId(idParam);
  if (!id) return error(400, "invalid_payload", "malformed id", { id: idParam });
  // T-10 — edge DELETE is addressed by id only, so the type must be
  // looked up before the guard can run. One cheap indexed read; absent
  // edge falls through to deleteEdge's own 404.
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH ()-[r {id: $id}]-() RETURN type(r) AS type LIMIT 1`,
      { id },
    );
    const type = result.records[0]?.get("type") as string | undefined;
    if (type) assertNotLifecycleEdge(type);
  } finally {
    await session.close();
  }
  await deleteEdge(driver, id);
  return noContent();
}
