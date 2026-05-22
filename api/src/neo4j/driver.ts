import neo4j, { type Driver } from "neo4j-driver";
import { loadEnv } from "../env";

let cachedDriver: Driver | undefined;

export function getDriver(): Driver {
  if (cachedDriver) return cachedDriver;
  const env = loadEnv();
  cachedDriver = neo4j.driver(
    env.neo4jUri,
    neo4j.auth.basic(env.neo4jUser, env.neo4jPassword),
    {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 60_000,
      // Convert Neo4j Integer to plain JS number on read. Safe here:
      // companygraph ids are UUIDv7 strings (not Neo4j INTEGERS) and the
      // only numeric props we read are counts which fit comfortably in
      // Number.MAX_SAFE_INTEGER. Without this flag, every count cell
      // arrives as `{low, high}` and renders as "[object Object]" in the
      // PWA tables.
      disableLosslessIntegers: true,
      logging: { level: "warn", logger: (lvl, msg) => console.warn(`[neo4j ${lvl}] ${msg}`) },
    },
  );
  return cachedDriver;
}

export async function closeDriver(): Promise<void> {
  if (cachedDriver) {
    await cachedDriver.close();
    cachedDriver = undefined;
  }
}

// Test-only — reset the singleton between tests.
export function _resetDriver(): void {
  cachedDriver = undefined;
}
