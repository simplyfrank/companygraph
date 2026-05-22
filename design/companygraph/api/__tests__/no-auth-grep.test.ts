import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, test, expect } from "bun:test";

// AC-22 — scans the production sources for auth concepts.
//
// NFR-08 holds that no user/session/tenant model exists. A grep over
// identifier-style names catches accidental re-introductions. The
// pattern is tight enough to avoid known false-positives:
//
//   - `driver.session()` (no `req.` prefix) is fine.
//   - `Set-Cookie` (string literal in another context) is fine.
//   - Prose mentions in jsdoc / comments are filtered out.
//
// Resolves pass-2 C-01 of the requirements review and design pass-1 N-02.
describe("AC-22 no-auth-grep", () => {
  test("no auth code paths in production sources", () => {
    const root = resolve(import.meta.dir, "..", "..");
    const pattern =
      "\\b(" +
        "authorization\\s*[:=]|bearer\\s|" +
        "verify(Jwt|Token)\\b|" +
        "currentUser\\b|userId\\s*[:=]|tenantId\\s*[:=]|" +
        "(authenticate|authorize)\\(|" +
        "req\\.(user|auth|session)\\b" +
      ")";

    let raw = "";
    try {
      raw = execSync(
        `grep -rEn '${pattern}' api/src pwa/src --include='*.ts' --include='*.tsx' || true`,
        { cwd: root, encoding: "utf8" },
      );
    } catch {
      raw = "";
    }

    const offending = raw
      .split("\n")
      .filter(Boolean)
      // Strip comments tagged with the intentional-absence allowlist.
      .filter((l) => !/\/\/\s*(NFR-08|no[- ]auth|intentional:\s*no\s*auth)/i.test(l))
      // Strip jsdoc lines (block-comment continuation).
      .filter((l) => !/^[^:]+:\d+:\s*\*\s/.test(l));

    expect(offending).toEqual([]);
  });
});
