// Chat REST endpoints (FR-B01, FR-B07).
//
// POST /api/v1/chat/messages — runs the agent for one user turn.
// GET  /api/v1/chat/messages/:message_id/progress — short-poll snapshot.

import { ValidationError } from "../errors";
import { ok, error, fromValidationError, readJson } from "./_helpers";
import { parseOrThrow } from "../validate";
import { chatRequestSchema } from "../chat/schemas";
import { runAgentTurn } from "../chat/agent";
import { getProgress } from "../chat/progress";
import type { ChatRequest } from "@companygraph/shared";

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
