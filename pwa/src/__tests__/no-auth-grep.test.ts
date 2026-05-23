// T-20: No-auth grep test (NFR-08 / AC-27)
//
// Asserts that no authentication-related code paths exist in the PWA.
// The single-tenant, loopback-only design per NFR-08 means no auth code
// should be present in the client.

import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC_DIR = join(__dirname, "..");
const EXCLUDED_DIRS = ["node_modules", ".git", "__tests__", "dist"];

// Auth-related patterns that should NOT appear in production code.
const AUTH_PATTERNS = [
  /\bauthorization\s*:/i,
  /\bAuthentication\s*:/i,
  /\bBearer\s+/,
  /\bsessionStorage\b.*token/i,
  /\blocalStorage\b.*token/i,
  /\bJWT\b/,
  /\bjsonwebtoken\b/,
  /\bpassword\b/i,
  /\blogin\b.*endpoint/i,
  /\b(req|request)\.user\b/,
  /\bsession\.userId\b/,
];

function collectFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.includes(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, files);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

describe("No-auth grep (NFR-08 / AC-27)", () => {
  const files = collectFiles(SRC_DIR);

  test("no authentication patterns found in PWA source", () => {
    const violations: Array<{ file: string; line: number; pattern: string; text: string }> = [];

    for (const filePath of files) {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        for (const pattern of AUTH_PATTERNS) {
          if (pattern.test(lines[i])) {
            violations.push({
              file: relative(SRC_DIR, filePath),
              line: i + 1,
              pattern: pattern.source,
              text: lines[i].trim().slice(0, 80),
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} [${v.pattern}]: ${v.text}`)
        .join("\n");
      expect.fail(
        `Found ${violations.length} auth-related pattern(s) in PWA source:\n${report}`,
      );
    }
  });
});
