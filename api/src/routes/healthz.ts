import { getDriver } from "../neo4j/driver";
import type { Health } from "@companygraph/shared/types";

export async function handleHealthz(): Promise<Response> {
  try {
    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      const result = await session.run(
        `CALL dbms.components() YIELD versions RETURN versions[0] AS version`,
      );
      const version = result.records[0]?.get("version") as string | undefined;
      const body: Health = { ok: true, neo4j: { connected: true, ...(version ? { version } : {}) } };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } finally {
      await session.close();
    }
  } catch {
    const body: Health = { ok: false, neo4j: { connected: false } };
    return new Response(JSON.stringify(body), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
}
