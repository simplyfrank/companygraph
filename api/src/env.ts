// Single source of truth for env vars. Bun auto-loads .env from cwd.

export interface Env {
  host: string;
  apiPort: number;
  neo4jUri: string;
  neo4jUser: string;
  neo4jPassword: string;
  postgresUri: string;
  // chat-interface (rev 3.1)
  anthropicApiKey: string | null; // null → MockLLMClient (FR-B06)
  chatDbPath: string;
  // cto-analytics-reporting (FR-10, DD-06/NFR-R1) — isolated analytics cache DB
  analyticsDbPath: string;
  // auth-hardening (FR-09 / DEC-01) — explicit, default-off opt-in that gates
  // the DEV-ONLY full-permission auth fallback. Safe (closed) state is false.
  authDevFallback: boolean;
}

export function loadEnv(): Env {
  const host = process.env.HOST ?? "127.0.0.1";
  const apiPort = Number(process.env.API_PORT ?? 8787);
  const neo4jUri = process.env.NEO4J_URI ?? "bolt://127.0.0.1:7687";
  const neo4jUser = process.env.NEO4J_USER ?? "neo4j";
  const neo4jPassword = process.env.NEO4J_PASSWORD ?? "";
  const postgresUri = process.env.POSTGRES_URI ?? "postgresql://companygraph:companygraph_dev@127.0.0.1:5432/companygraph";
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim() || null;
  const chatDbPath = process.env.CHAT_DB_PATH ?? "../data/chat.db";
  const analyticsDbPath = process.env.ANALYTICS_DB_PATH ?? "./data/analytics.sqlite";
  // auth-hardening (FR-09 / DEC-01) — truthy "1"/"true" opts into the
  // DEV-ONLY fallback; anything else (incl. unset) is the safe closed state.
  const authDevFallback =
    process.env.AUTH_DEV_FALLBACK === "1" ||
    process.env.AUTH_DEV_FALLBACK?.toLowerCase() === "true";

  if (!neo4jPassword) {
    throw new Error(
      "Neo4j auth failed — check .env NEO4J_PASSWORD (literal 'neo4j' is refused by Neo4j; pick a different value)",
    );
  }

  return { host, apiPort, neo4jUri, neo4jUser, neo4jPassword, postgresUri, anthropicApiKey, chatDbPath, analyticsDbPath, authDevFallback };
}
