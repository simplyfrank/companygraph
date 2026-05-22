import cron from "node-cron";
import { loadEnv } from "./env";
import { getDriver, closeDriver } from "./neo4j/driver";
import { applySchema } from "./neo4j/bootstrap";
import { route } from "./router";
import { initChatDb, closeChatDb } from "./chat/persistence";
import { runAuditRetention } from "./ontology/jobs/audit-retention";

async function main(): Promise<void> {
  const env = loadEnv();

  // Apply schema before serving (idempotent — design-review B-01 N/A here).
  try {
    await applySchema(getDriver());
    console.log("[bootstrap] schema applied");
  } catch (e) {
    console.warn("[bootstrap] schema apply failed — server starting anyway", e);
  }

  // Init chat SQLite (idempotent; CREATE TABLE IF NOT EXISTS).
  try {
    initChatDb();
    console.log("[bootstrap] chat SQLite initialised");
  } catch (e) {
    console.warn("[bootstrap] chat SQLite init failed — chat will be unavailable", e);
  }

  const server = Bun.serve({
    hostname: env.host,            // NFR-02: loopback by default
    port: env.apiPort,
    // SSE endpoint (T-19 — `/api/v1/ontology/events`) holds the response
    // open between 30 s heartbeats; Bun's 10 s default idleTimeout would
    // reap those connections mid-stream. 255 s (Bun's max) is plenty of
    // headroom for the documented 30 s NFR-09 heartbeat.
    idleTimeout: 255,
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

  // T-20 — Daily audit-retention cron (design §10 / FR-13a). Default
  // `0 3 * * *` runs at 03:00 in the operator's TZ. `OPT_ONTOLOGY_AUDIT_CRON`
  // overrides the schedule; `OPT_ONTOLOGY_AUDIT_RETENTION_DAYS=0` disables
  // the archive pass (event-buffer purge still runs unconditionally).
  const cronExpr = process.env.OPT_ONTOLOGY_AUDIT_CRON ?? "0 3 * * *";
  const retentionTask = cron.schedule(cronExpr, async () => {
    try {
      const result = await runAuditRetention();
      console.log(
        `[retention] archived=${result.archived} events_purged=${result.events_purged}`,
      );
    } catch (e) {
      console.error("[retention] pass failed", e);
    }
  });

  // Clean shutdown.
  const stop = async (): Promise<void> => {
    retentionTask.stop();
    server.stop();
    closeChatDb();
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
