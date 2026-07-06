// SQLite persistence for the chat agent.
//
// Owns the 4-table schema described in design.md DD-08 + the
// helpers described in DD-22 (loadBoundContext, conversation
// history). The DB file path is `loadEnv().chatDbPath` resolved
// against `process.cwd()` if relative.
//
// Driver note: the spec calls for `better-sqlite3`, but its native
// N-API bindings are not yet supported under Bun's runtime (see
// https://github.com/oven-sh/bun/issues/4290 — Bun itself surfaces
// the error and points at `bun:sqlite`). We import `bun:sqlite`'s
// `Database` as the default export to preserve the `import Database
// from "..."` ergonomics declared in the task — the API surface used
// here (`prepare`/`run`/`get`/`all`/`exec`/`pragma`/`close`) is
// shared with `better-sqlite3`, so swapping back is a single-line
// change once Bun gains support.
//
// All public functions are typed against the shared chat types in
// `@companygraph/shared`. JSON columns are (de)serialised at the
// boundary so callers see strongly-typed structures.

import { Database } from "bun:sqlite";
type DatabaseInstance = Database;
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type {
  BoundContext,
  ChatRoleId,
  HighlightPayload,
  LatencyBreakdown,
  ToolCall,
} from "@companygraph/shared";
import { loadEnv } from "../env";
import { generateId } from "../ids";

// ────────────────────────────────────────────────────────────────────
// Module-scoped singleton.
// ────────────────────────────────────────────────────────────────────

let dbInstance: DatabaseInstance | null = null;
let resolvedDbPath: string | null = null;

function resolveDbPath(rawPath: string): string {
  // Preserve the SQLite in-memory sentinel (`:memory:`) verbatim —
  // resolving it against cwd would turn it into a literal file named
  // ":memory:" instead of an ephemeral in-process database.
  if (rawPath === ":memory:") return rawPath;
  return isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);
}

// ────────────────────────────────────────────────────────────────────
// DDL — DD-08 verbatim.
// ────────────────────────────────────────────────────────────────────

const DDL_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS chat_conversations (
     id TEXT PRIMARY KEY,
     created_at TEXT NOT NULL,
     last_message_at TEXT NOT NULL,
     title TEXT,
     role_id_pin TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
     id TEXT PRIMARY KEY,
     conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
     turn_index INTEGER NOT NULL,
     role TEXT NOT NULL CHECK (role IN ('user','assistant')),
     content_text TEXT NOT NULL,
     role_id_used TEXT,
     tool_calls TEXT,
     highlight TEXT,
     explorer_deep_link TEXT,
     latency_ms_breakdown TEXT,
     created_at TEXT NOT NULL,
     UNIQUE(conversation_id, turn_index)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id)`,
  `CREATE TABLE IF NOT EXISTS chat_llm_quota (
     scope_key TEXT PRIMARY KEY,
     window_start TEXT NOT NULL,
     count INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS chat_bookmarks (
     id TEXT PRIMARY KEY,
     conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
     question TEXT NOT NULL,
     role_id_pin TEXT,
     name TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
];

// ────────────────────────────────────────────────────────────────────
// Lifecycle.
// ────────────────────────────────────────────────────────────────────

export function initChatDb(): DatabaseInstance {
  if (dbInstance) return dbInstance;
  const env = loadEnv();
  const dbPath = resolveDbPath(env.chatDbPath);
  resolvedDbPath = dbPath;
  // Ensure the containing directory exists (mkdir -p semantics).
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  for (const stmt of DDL_STATEMENTS) {
    db.exec(stmt);
  }
  dbInstance = db;
  return db;
}

export function getDb(): DatabaseInstance {
  if (!dbInstance) {
    throw new Error("chat persistence not initialised — call initChatDb() first");
  }
  return dbInstance;
}

export function closeChatDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    resolvedDbPath = null;
  }
}

// Test-only helper: closes the singleton so a subsequent test can
// re-init against a different file path. Not exported to production
// call sites.
export function resetChatDbForTest(): void {
  closeChatDb();
}

export function getChatDbPath(): string | null {
  return resolvedDbPath;
}

// ────────────────────────────────────────────────────────────────────
// Conversations.
// ────────────────────────────────────────────────────────────────────

export interface ConversationRow {
  id: string;
  created_at: string;
  last_message_at: string;
  title: string | null;
  role_id_pin: string | null;
}

export interface CreateConversationInput {
  id?: string;
  title?: string;
  role_id_pin?: string;
}

export function createConversation(input: CreateConversationInput = {}): ConversationRow {
  const db = getDb();
  const id = input.id ?? generateId();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO chat_conversations(id, created_at, last_message_at, title, role_id_pin)
     VALUES(?, ?, ?, ?, ?)`,
  ).run(id, now, now, input.title ?? null, input.role_id_pin ?? null);
  return {
    id,
    created_at: now,
    last_message_at: now,
    title: input.title ?? null,
    role_id_pin: input.role_id_pin ?? null,
  };
}

export function listConversations(): ConversationRow[] {
  const db = getDb();
  return db.prepare(
    `SELECT id, created_at, last_message_at, title, role_id_pin
     FROM chat_conversations
     ORDER BY last_message_at DESC`,
  ).all() as ConversationRow[];
}

export function getConversation(id: string): ConversationRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, created_at, last_message_at, title, role_id_pin
       FROM chat_conversations WHERE id = ?`,
    )
    .get(id) as ConversationRow | undefined;
  return row ?? null;
}

export function updateConversationTouch(
  conversation_id: string,
  opts: { title?: string; role_id_pin?: string } = {},
): void {
  const db = getDb();
  const now = new Date().toISOString();
  // Touch last_message_at and optionally fill in title / role_id_pin
  // only if not already set.
  db.prepare(
    `UPDATE chat_conversations
     SET last_message_at = ?,
         title = COALESCE(title, ?),
         role_id_pin = COALESCE(role_id_pin, ?)
     WHERE id = ?`,
  ).run(now, opts.title ?? null, opts.role_id_pin ?? null, conversation_id);
}

// ────────────────────────────────────────────────────────────────────
// Messages.
// ────────────────────────────────────────────────────────────────────

export interface AppendMessageInput {
  message_id?: string;
  conversation_id: string;
  turn_index: number;
  role: "user" | "assistant";
  content_text: string;
  role_id_used?: ChatRoleId | null;
  tool_calls?: ToolCall[] | null;
  highlight?: HighlightPayload | null;
  explorer_deep_link?: string | null;
  latency_ms_breakdown?: LatencyBreakdown | null;
}

export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  turn_index: number;
  role: "user" | "assistant";
  content_text: string;
  role_id_used: ChatRoleId | null;
  tool_calls: ToolCall[] | null;
  highlight: HighlightPayload | null;
  explorer_deep_link: string | null;
  latency_ms_breakdown: LatencyBreakdown | null;
  created_at: string;
}

interface RawMessageRow {
  id: string;
  conversation_id: string;
  turn_index: number;
  role: "user" | "assistant";
  content_text: string;
  role_id_used: string | null;
  tool_calls: string | null;
  highlight: string | null;
  explorer_deep_link: string | null;
  latency_ms_breakdown: string | null;
  created_at: string;
}

function parseJsonOrNull<T>(s: string | null): T | null {
  if (s === null || s === undefined) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function hydrateMessage(row: RawMessageRow): ChatMessageRow {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    turn_index: row.turn_index,
    role: row.role,
    content_text: row.content_text,
    role_id_used: (row.role_id_used as ChatRoleId | null) ?? null,
    tool_calls: parseJsonOrNull<ToolCall[]>(row.tool_calls),
    highlight: parseJsonOrNull<HighlightPayload>(row.highlight),
    explorer_deep_link: row.explorer_deep_link,
    latency_ms_breakdown: parseJsonOrNull<LatencyBreakdown>(row.latency_ms_breakdown),
    created_at: row.created_at,
  };
}

export function appendMessage(input: AppendMessageInput): ChatMessageRow {
  const db = getDb();
  const id = input.message_id ?? generateId();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO chat_messages(
       id, conversation_id, turn_index, role, content_text,
       role_id_used, tool_calls, highlight, explorer_deep_link,
       latency_ms_breakdown, created_at
     ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.conversation_id,
    input.turn_index,
    input.role,
    input.content_text,
    input.role_id_used ?? null,
    input.tool_calls ? JSON.stringify(input.tool_calls) : null,
    input.highlight ? JSON.stringify(input.highlight) : null,
    input.explorer_deep_link ?? null,
    input.latency_ms_breakdown ? JSON.stringify(input.latency_ms_breakdown) : null,
    now,
  );
  // Touch the conversation's last_message_at.
  db.prepare(
    `UPDATE chat_conversations SET last_message_at = ? WHERE id = ?`,
  ).run(now, input.conversation_id);
  return {
    id,
    conversation_id: input.conversation_id,
    turn_index: input.turn_index,
    role: input.role,
    content_text: input.content_text,
    role_id_used: input.role_id_used ?? null,
    tool_calls: input.tool_calls ?? null,
    highlight: input.highlight ?? null,
    explorer_deep_link: input.explorer_deep_link ?? null,
    latency_ms_breakdown: input.latency_ms_breakdown ?? null,
    created_at: now,
  };
}

// ────────────────────────────────────────────────────────────────────
// Bound context (DD-22).
// ────────────────────────────────────────────────────────────────────

const BOUND_CONTEXT_CAP = 50;

export function loadBoundContext(conversation_id: string): BoundContext {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT highlight FROM chat_messages
       WHERE conversation_id = ? AND role = 'assistant'
       ORDER BY turn_index DESC LIMIT 1`,
    )
    .get(conversation_id) as { highlight: string | null } | undefined;
  if (!row || !row.highlight) {
    return { node_ids: [], edge_ids: [] };
  }
  const parsed = parseJsonOrNull<HighlightPayload>(row.highlight);
  if (!parsed) return { node_ids: [], edge_ids: [] };
  return {
    node_ids: (parsed.nodes ?? []).slice(0, BOUND_CONTEXT_CAP),
    edge_ids: (parsed.edges ?? []).slice(0, BOUND_CONTEXT_CAP),
  };
}

// ────────────────────────────────────────────────────────────────────
// History (DD-22).
// ────────────────────────────────────────────────────────────────────

export interface LoadHistoryOptions {
  maxMessages: number;
  maxTokensEstimate: number;
}

// Estimator: word count × 1.3 ≈ token count.
function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

export function loadConversationHistory(
  conversation_id: string,
  opts: LoadHistoryOptions,
): ChatMessageRow[] {
  const db = getDb();
  // Pull up to `maxMessages` most-recent rows (DESC) then return
  // them in chronological order. Token cap drops oldest first when
  // the budget is exceeded.
  const raw = db
    .prepare(
      `SELECT id, conversation_id, turn_index, role, content_text,
              role_id_used, tool_calls, highlight, explorer_deep_link,
              latency_ms_breakdown, created_at
       FROM chat_messages
       WHERE conversation_id = ?
       ORDER BY turn_index DESC
       LIMIT ?`,
    )
    .all(conversation_id, opts.maxMessages) as RawMessageRow[];
  // Chronological order (asc).
  const asc = raw.slice().reverse().map(hydrateMessage);
  // Trim by token budget from the FRONT (oldest first) until under
  // the cap.
  let total = asc.reduce((acc, m) => acc + estimateTokens(m.content_text), 0);
  let i = 0;
  while (i < asc.length && total > opts.maxTokensEstimate) {
    total -= estimateTokens(asc[i]!.content_text);
    i += 1;
  }
  return asc.slice(i);
}

// ────────────────────────────────────────────────────────────────────
// Bookmarks.
// ────────────────────────────────────────────────────────────────────

export interface BookmarkRow {
  id: string;
  conversation_id: string;
  question: string;
  role_id_pin: string | null;
  name: string;
  created_at: string;
}

export interface CreateBookmarkInput {
  id?: string;
  conversation_id: string;
  question: string;
  role_id_pin?: string | null;
  name: string;
}

export function createBookmark(input: CreateBookmarkInput): BookmarkRow {
  const db = getDb();
  const id = input.id ?? generateId();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO chat_bookmarks(id, conversation_id, question, role_id_pin, name, created_at)
     VALUES(?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.conversation_id,
    input.question,
    input.role_id_pin ?? null,
    input.name,
    now,
  );
  return {
    id,
    conversation_id: input.conversation_id,
    question: input.question,
    role_id_pin: input.role_id_pin ?? null,
    name: input.name,
    created_at: now,
  };
}

export function listBookmarks(conversation_id?: string): BookmarkRow[] {
  const db = getDb();
  if (conversation_id) {
    return db
      .prepare(
        `SELECT id, conversation_id, question, role_id_pin, name, created_at
         FROM chat_bookmarks WHERE conversation_id = ?
         ORDER BY created_at DESC`,
      )
      .all(conversation_id) as BookmarkRow[];
  }
  return db
    .prepare(
      `SELECT id, conversation_id, question, role_id_pin, name, created_at
       FROM chat_bookmarks ORDER BY created_at DESC`,
    )
    .all() as BookmarkRow[];
}

export function deleteBookmark(id: string): boolean {
  const db = getDb();
  const result = db
    .prepare(`DELETE FROM chat_bookmarks WHERE id = ?`)
    .run(id);
  return result.changes > 0;
}

// ────────────────────────────────────────────────────────────────────
// Message history (FR-07, design §3.5).
// ────────────────────────────────────────────────────────────────────

export function listMessages(conversationId: string): ChatMessageRow[] {
  const db = getDb();
  const raw = db
    .prepare(
      `SELECT id, conversation_id, turn_index, role, content_text,
              role_id_used, tool_calls, highlight, explorer_deep_link,
              latency_ms_breakdown, created_at
       FROM chat_messages
       WHERE conversation_id = ?
       ORDER BY turn_index ASC`,
    )
    .all(conversationId) as RawMessageRow[];
  return raw.map(hydrateMessage);
}
