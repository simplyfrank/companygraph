import cron from "node-cron";
import { loadEnv } from "./env";
import { getDriver, closeDriver } from "./neo4j/driver";
import { applySchema } from "./neo4j/bootstrap";
import { route } from "./router";
import { initChatDb, closeChatDb } from "./chat/persistence";
import { runAuditRetention } from "./ontology/jobs/audit-retention";
import { initAnalyticsDb, closeAnalyticsDb } from "./analytics/reporting/cache";
import { initAnalyticsSettings, getSettingsRow } from "./analytics/reporting/settings";
import { runPrecompute } from "./analytics/reporting/scheduler";
import { startKafkaConsumerIfConfigured, stopKafkaConsumer } from "./ingest/kafka-consumer";

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

  // Init analytics SQLite (cache + settings) — isolated DB file (NFR-R1).
  // Idempotent: CREATE TABLE IF NOT EXISTS + a one-time settings seed (DD-08).
  try {
    initAnalyticsDb();
    initAnalyticsSettings();
    console.log("[bootstrap] analytics SQLite initialised");
  } catch (e) {
    console.warn("[bootstrap] analytics SQLite init failed — reporting unavailable", e);
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

  // kpi-measurement-alignment FR-13 — opt-in Kafka consumer for KPI
  // measurement ingestion. Non-blocking: failure to connect logs a
  // warning and never crashes the server (NFR-03).
  startKafkaConsumerIfConfigured().catch((e) => {
    console.warn("[server] Kafka consumer start failed (non-fatal):", e);
  });

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

  // cto-analytics-reporting T-04 (FR-10) — nightly precompute cron. Uses the
  // operator-tunable `analytics_settings.scheduler_cron` (DD-08 seed default
  // `0 2 * * *`, in the operator's TZ). runPrecompute() captures a snapshot,
  // recomputes the analytics cache, and prunes snapshot blobs beyond N=7.
  let precomputeTask: ReturnType<typeof cron.schedule> | null = null;
  try {
    const precomputeCron = getSettingsRow().scheduler_cron;
    if (cron.validate(precomputeCron)) {
      precomputeTask = cron.schedule(precomputeCron, async () => {
        try {
          const result = await runPrecompute();
          console.log(
            `[precompute] last_run_at=${result.lastRunAt} status=${result.status}`,
          );
        } catch (e) {
          console.error("[precompute] run failed", e);
        }
      });
    } else {
      console.warn(`[precompute] invalid scheduler_cron "${precomputeCron}" — cron not registered`);
    }
  } catch (e) {
    console.warn("[precompute] cron registration failed", e);
  }

  // Clean shutdown.
  const stop = async (): Promise<void> => {
    retentionTask.stop();
    precomputeTask?.stop();
    server.stop();
    await stopKafkaConsumer();
    closeChatDb();
    closeAnalyticsDb();
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
