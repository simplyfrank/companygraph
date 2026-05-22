import type {
  ChatEnvelope,
  ProgressSnapshot,
  ProgressState,
  ToolCall,
  ToolError,
} from "@companygraph/shared";

const SNAPSHOTS = new Map<string, ProgressSnapshot>();
const TTL_MS = 60_000;

let sweeper: ReturnType<typeof setInterval> | null = null;
function startSweeper(): void {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const [id, snap] of SNAPSHOTS) {
      if ((snap.state === "done" || snap.state === "error") &&
          now - Date.parse(snap.updated_at) > TTL_MS) {
        SNAPSHOTS.delete(id);
      }
    }
  }, 30_000);
  sweeper.unref?.();
}

export function initProgress(message_id: string, conversation_id: string): void {
  startSweeper();
  SNAPSHOTS.set(message_id, {
    message_id,
    conversation_id,
    state: "classifying",
    tool_calls_so_far: [],
    updated_at: new Date().toISOString(),
  });
}

export function setProgress(
  message_id: string,
  state: ProgressState,
  partial?: { tool_calls_so_far?: ToolCall[]; result?: ChatEnvelope; error?: ToolError },
): void {
  const cur = SNAPSHOTS.get(message_id);
  if (!cur) return;
  const next: ProgressSnapshot = {
    ...cur,
    state,
    tool_calls_so_far: partial?.tool_calls_so_far ?? cur.tool_calls_so_far,
    result: partial?.result ?? cur.result,
    error: partial?.error ?? cur.error,
    updated_at: new Date().toISOString(),
  };
  SNAPSHOTS.set(message_id, next);
}

export function appendToolCallToProgress(message_id: string, tc: ToolCall): void {
  const cur = SNAPSHOTS.get(message_id);
  if (!cur) return;
  cur.tool_calls_so_far.push(tc);
  cur.updated_at = new Date().toISOString();
}

export function getProgress(message_id: string): ProgressSnapshot | null {
  return SNAPSHOTS.get(message_id) ?? null;
}

// Test helpers.
export function resetProgressForTest(): void {
  SNAPSHOTS.clear();
  if (sweeper) {
    clearInterval(sweeper);
    sweeper = null;
  }
}
