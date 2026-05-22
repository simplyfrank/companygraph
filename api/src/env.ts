// Single source of truth for env vars. Bun auto-loads .env from cwd.

export interface Env {
  host: string;
  apiPort: number;
  neo4jUri: string;
  neo4jUser: string;
  neo4jPassword: string;
  // chat-interface (rev 3.1)
  anthropicApiKey: string | null; // null → MockLLMClient (FR-B06)
  chatDbPath: string;
}

export function loadEnv(): Env {
  const host = process.env.HOST ?? "127.0.0.1";
  const apiPort = Number(process.env.API_PORT ?? 8787);
  const neo4jUri = process.env.NEO4J_URI ?? "bolt://127.0.0.1:7687";
  const neo4jUser = process.env.NEO4J_USER ?? "neo4j";
  const neo4jPassword = process.env.NEO4J_PASSWORD ?? "";
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim() || null;
  const chatDbPath = process.env.CHAT_DB_PATH ?? "../data/chat.db";

  if (!neo4jPassword) {
    throw new Error(
      "Neo4j auth failed — check .env NEO4J_PASSWORD (literal 'neo4j' is refused by Neo4j; pick a different value)",
    );
  }

  return { host, apiPort, neo4jUri, neo4jUser, neo4jPassword, anthropicApiKey, chatDbPath };
}
