// Kafka consumer for real-time KPI measurement ingestion.
// kpi-measurement-alignment FR-12, FR-13, FR-14.
//
// Opt-in: starts only when KAFKA_BROKERS env var is set. Without it,
// the server boots normally (no Kafka dependency for local dev, FR-13).
// Uses kafkajs (pure JS, no native deps) loaded via dynamic import so
// it stays out of the bundle when unused.

import { generateId } from "../ids";
import { query } from "../storage/postgres/client";
import { getDriver } from "../neo4j/driver";
import { metrics } from "../metrics";
import { createKpiMeasurementSchema } from "../routes/kpi-measurements";

let consumerInstance: { disconnect: () => Promise<void> } | null = null;

// Dual-write a KPI measurement to both Postgres and Neo4j (same as the
// REST handler, but with source defaulting to 'kafka').
async function dualWriteMeasurement(
  kpiId: string,
  measuredAt: string,
  value: number,
  context: Record<string, unknown> | null,
  source: string,
): Promise<void> {
  const id = generateId();
  const now = new Date().toISOString();

  // Postgres write
  await query(
    `INSERT INTO kpi_measurements (id, kpi_id, measured_at, value, context, source, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, kpiId, measuredAt, value, context ? JSON.stringify(context) : null, source || "kafka", now],
  );

  // Neo4j dual-write (FR-01 parity)
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });
  try {
    await session.run(
      `CREATE (m:KPIMeasurement {
        id: $id,
        kpi_id: $kpiId,
        measured_at: $measuredAt,
        value: $value,
        context: $context,
        source: $source,
        created_at: $createdAt
      })`,
      {
        id,
        kpiId,
        measuredAt,
        value,
        context: context ? JSON.stringify(context) : null,
        source: source || "kafka",
        createdAt: now,
      },
    );
  } catch (err) {
    console.error("[kafka-consumer] Neo4j write failed (non-fatal):", err);
  } finally {
    await session.close();
  }

  metrics.increment("kpi_measurements_ingested_total", { source: "kafka" });
}

// FR-13 — opt-in: only starts when KAFKA_BROKERS is set.
export async function startKafkaConsumerIfConfigured(): Promise<void> {
  const brokers = process.env.KAFKA_BROKERS;
  if (!brokers) {
    return; // opt-in — no Kafka in local dev
  }

  try {
    const { Kafka } = await import("kafkajs");
    const kafka = new Kafka({
      brokers: brokers.split(",").map((b) => b.trim()),
      clientId: "companygraph-kpi-consumer",
    });

    const consumer = kafka.consumer({ groupId: "companygraph-kpi-measurements" });
    await consumer.connect();
    await consumer.subscribe({ topic: "kpi-measurements", fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const payload = JSON.parse(message.value.toString());
          // Validate with the same schema as the REST handler (FR-14)
          const validated = createKpiMeasurementSchema.parse(payload);

          await dualWriteMeasurement(
            validated.kpi_id,
            validated.measured_at,
            validated.value,
            validated.context ?? null,
            validated.source ?? "kafka",
          );
        } catch (err) {
          // FR-14 — invalid messages are logged and skipped (not retried indefinitely)
          console.error("[kafka-consumer] invalid message skipped:", err);
        }
      },
    });

    consumerInstance = consumer;
    console.log(`[kafka-consumer] connected to ${brokers}, subscribed to kpi-measurements`);
  } catch (err) {
    // NFR-03 — never crash the API server on Kafka failure
    console.warn("[kafka-consumer] failed to start (non-fatal, server continues):", err);
  }
}

export async function stopKafkaConsumer(): Promise<void> {
  if (consumerInstance) {
    try {
      await consumerInstance.disconnect();
      console.log("[kafka-consumer] disconnected");
    } catch (err) {
      console.error("[kafka-consumer] disconnect error:", err);
    }
    consumerInstance = null;
  }
}
