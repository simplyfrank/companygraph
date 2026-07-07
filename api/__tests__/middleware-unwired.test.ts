// auth-hardening T-07 (NFR-06 / DEC-07) — pins that the correlation-id and
// rate-limit middleware are NOT wired into request handling as-built. Neither
// router.ts nor server.ts imports them. This spec does NOT wire them (that is
// a new feature, DEC-07); the guard makes any future wiring a visible change
// and stops the docs from silently claiming rate-limiting is enforced.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = join(import.meta.dir, "..", "src");

function read(rel: string): string {
  return readFileSync(join(SRC, rel), "utf8");
}

describe("auth-hardening middleware are unwired (NFR-06 / DEC-07)", () => {
  const router = read("router.ts");
  const server = read("server.ts");

  test("router.ts does not import correlation-id / rate-limit middleware", () => {
    expect(router.includes("middleware/correlation-id")).toBe(false);
    expect(router.includes("middleware/rate-limit")).toBe(false);
    expect(router.includes("withCorrelationId")).toBe(false);
    expect(router.includes("checkRateLimit")).toBe(false);
    expect(router.includes("cleanupExpiredEntries")).toBe(false);
  });

  test("server.ts does not import correlation-id / rate-limit middleware", () => {
    expect(server.includes("middleware/correlation-id")).toBe(false);
    expect(server.includes("middleware/rate-limit")).toBe(false);
    expect(server.includes("withCorrelationId")).toBe(false);
    expect(server.includes("checkRateLimit")).toBe(false);
    expect(server.includes("cleanupExpiredEntries")).toBe(false);
  });
});
