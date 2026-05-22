import { loadEnv } from "./env";
import { getDriver, closeDriver } from "./neo4j/driver";
import { applySchema } from "./neo4j/bootstrap";
import { route } from "./router";

async function main(): Promise<void> {
  const env = loadEnv();

  // Apply schema before serving (idempotent — design-review B-01 N/A here).
  try {
    await applySchema(getDriver());
    console.log("[bootstrap] schema applied");
  } catch (e) {
    console.warn("[bootstrap] schema apply failed — server starting anyway", e);
  }

  const server = Bun.serve({
    hostname: env.host,            // NFR-02: loopback by default
    port: env.apiPort,
    fetch: (req) => route(req),
    error: (err) => {
      console.error("[server] fetch error", err);
      return new Response(
        JSON.stringify({ error: { code: "neo4j_unreachable", message: String(err) } }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    },
  });

  console.log(`[server] listening on http://${env.host}:${env.apiPort}/api/v1/`);

  // Clean shutdown.
  const stop = async (): Promise<void> => {
    server.stop();
    await closeDriver();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error("[server] fatal", e);
  process.exit(1);
});
