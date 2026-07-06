// Chat REST endpoints (FR-B01, FR-B07, FR-M03).
//
// POST   /api/v1/chat/messages — runs the agent for one user turn.
// GET    /api/v1/chat/messages/:message_id/progress — short-poll snapshot.
// POST   /api/v1/chat/bookmarks — create a bookmark (FR-M03).
// GET    /api/v1/chat/bookmarks — list bookmarks, optional ?conversation_id= filter.
// DELETE /api/v1/chat/bookmarks/:id — delete a bookmark.

import { z } from "zod";
import { ValidationError } from "../errors";
import { ok, error, fromValidationError, readJson, parseWith } from "./_helpers";
import { parseOrThrow } from "../validate";
import { chatRequestSchema } from "../chat/schemas";
import { runAgentTurn } from "../chat/agent";
import { getProgress } from "../chat/progress";
import { createBookmark, listBookmarks, deleteBookmark, listConversations, listMessages, getConversation } from "../chat/persistence";
import type { ChatRequest } from "@companygraph/shared";

const bookmarkCreateSchema = z.object({
  conversation_id: z.string().min(1),
  question: z.string().min(1),
  role_id_pin: z.string().nullable().optional(),
  name: z.string().min(1).max(200),
});

export async function handleChatMessage(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await readJson(req);
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    return error(400, "invalid_payload", "invalid JSON body");
  }
  const parsed = parseOrThrow(chatRequestSchema, body) as ChatRequest;
  const env = await runAgentTurn(parsed);
  return ok(env);
}

export function handleChatProgress(messageId: string): Response {
  const snap = getProgress(messageId);
  if (!snap) {
    return error(404, "not_found", `no progress snapshot for message_id ${messageId}`);
  }
  return ok(snap);
}

// POST /api/v1/chat/bookmarks — create a bookmark (FR-M03).
export async function handleBookmarkCreate(req: Request): Promise<Response> {
  const body = parseWith(bookmarkCreateSchema, await readJson(req));
  const row = createBookmark({
    conversation_id: body.conversation_id,
    question: body.question,
    role_id_pin: body.role_id_pin ?? null,
    name: body.name,
  });
  return ok(row, 201);
}

// GET /api/v1/chat/bookmarks — list bookmarks, optional ?conversation_id= filter.
export function handleBookmarkList(req: Request): Response {
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversation_id") ?? undefined;
  const rows = listBookmarks(conversationId);
  return ok({ rows });
}

// DELETE /api/v1/chat/bookmarks/:id — delete a bookmark.
export function handleBookmarkDelete(req: Request, id: string): Response {
  const deleted = deleteBookmark(id);
  if (!deleted) {
    return error(404, "not_found", "bookmark not found", { id });
  }
  return ok({ deleted: true });
}

// GET /api/v1/chat/conversations — list conversations newest-first (FR-06).
export function handleConversationList(): Response {
  const rows = listConversations();
  return ok({ rows });
}

// GET /api/v1/chat/conversations/:id/messages — message history (FR-07).
export function handleConversationMessages(_req: Request, conversationId: string): Response {
  if (!getConversation(conversationId)) {
    return error(404, "not_found", "conversation not found", { id: conversationId });
  }
  const rows = listMessages(conversationId);
  return ok({ rows });
}
