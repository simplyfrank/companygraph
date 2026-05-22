import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const TEST_DB = "../data/chat-cost-cap-test.db";
process.env.CHAT_DB_PATH = TEST_DB;
process.env.NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? "test";

import { initChatDb, closeChatDb } from "../../src/chat/persistence";
import {
  incrementQuotaOrFail,
  isQuotaExhausted,
  getQuotaCounts,
  resetQuotaForTest,
} from "../../src/chat/quota";

const ABS_DB = resolve(process.cwd(), TEST_DB);

function rmDb(): void {
  for (const suffix of ["", "-shm", "-wal"]) {
    const p = ABS_DB + suffix;
    if (existsSync(p)) try { unlinkSync(p); } catch { /* */ }
  }
}

beforeAll(() => {
  rmDb();
  initChatDb();
});
afterAll(() => {
  closeChatDb();
  rmDb();
});
beforeEach(() => {
  resetQuotaForTest();
});

describe("T-04 cost-cap counter (NFR-09, AC-29)", () => {
  test("per-conversation cap fires on call 51", () => {
    const conv = "conv-A";
    for (let i = 0; i < 50; i++) {
      const exhausted = incrementQuotaOrFail(conv);
      expect(exhausted).toBe(false);
    }
    expect(isQuotaExhausted(conv)).toBe(true);
    expect(incrementQuotaOrFail(conv)).toBe(true);
    expect(getQuotaCounts(conv).conv).toBe(50);
  });

  test("per-day cap fires on call 501 across many conversations", () => {
    // We need 500 increments distributed across multiple conversations to avoid the
    // per-conv cap. 50 conversations × 10 each = 500 day-bucket increments.
    for (let c = 0; c < 50; c++) {
      const conv = `conv-day-${c}`;
      for (let i = 0; i < 10; i++) {
        expect(incrementQuotaOrFail(conv)).toBe(false);
      }
    }
    // Day count is 500 now.
    const fresh = "conv-day-fresh";
    expect(getQuotaCounts(fresh).day).toBe(500);
    // Per-conv on a fresh conv is 0 → not blocked by conv cap; blocked by day cap.
    expect(incrementQuotaOrFail(fresh)).toBe(true);
  });

  test("independent conversations have independent conv counters", () => {
    const a = "indep-A";
    const b = "indep-B";
    for (let i = 0; i < 10; i++) incrementQuotaOrFail(a);
    expect(getQuotaCounts(a).conv).toBe(10);
    expect(getQuotaCounts(b).conv).toBe(0);
  });
});
