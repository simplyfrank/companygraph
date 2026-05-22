// Per-conversation + per-day LLM-call quota (NFR-09, AC-29).
// Transactional increment via bun:sqlite's `transaction()` ensures atomicity
// against concurrent requests in the same process.

import { getDb } from "./persistence";

const CONV_CAP = 50;
const DAY_CAP = 500;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}
function nowIso(): string {
  return new Date().toISOString();
}

interface CountRow { count: number }

export function getQuotaCounts(conversation_id: string): {
  conv: number;
  day: number;
  conv_cap: number;
  day_cap: number;
} {
  const db = getDb();
  const conv = db.prepare<{ count: number }, [string]>(
    "SELECT count FROM chat_llm_quota WHERE scope_key = ?",
  ).get(`conv:${conversation_id}`) as CountRow | null;
  const day = db.prepare<{ count: number }, [string]>(
    "SELECT count FROM chat_llm_quota WHERE scope_key = ?",
  ).get(`day:${todayUTC()}`) as CountRow | null;
  return { conv: conv?.count ?? 0, day: day?.count ?? 0, conv_cap: CONV_CAP, day_cap: DAY_CAP };
}

export function isQuotaExhausted(conversation_id: string): boolean {
  const { conv, day } = getQuotaCounts(conversation_id);
  return conv >= CONV_CAP || day >= DAY_CAP;
}

// Atomically check + increment. Returns true if exhausted (in which case the
// caller MUST NOT make the LLM call); false if increment succeeded.
export function incrementQuotaOrFail(conversation_id: string): boolean {
  const db = getDb();
  const convKey = `conv:${conversation_id}`;
  const dayKey = `day:${todayUTC()}`;
  const upsert = db.prepare(
    `INSERT INTO chat_llm_quota(scope_key, window_start, count)
     VALUES(?, ?, 1)
     ON CONFLICT(scope_key) DO UPDATE SET count = count + 1`,
  );
  const select = db.prepare<{ count: number }, [string]>(
    "SELECT count FROM chat_llm_quota WHERE scope_key = ?",
  );

  const tx = db.transaction(() => {
    const convCount = (select.get(convKey) as CountRow | null)?.count ?? 0;
    const dayCount = (select.get(dayKey) as CountRow | null)?.count ?? 0;
    if (convCount >= CONV_CAP || dayCount >= DAY_CAP) return true;
    upsert.run(convKey, nowIso());
    upsert.run(dayKey, todayUTC());
    return false;
  });
  return tx() as boolean;
}

// Test helper: clear the entire quota table.
export function resetQuotaForTest(): void {
  const db = getDb();
  db.exec("DELETE FROM chat_llm_quota");
}
