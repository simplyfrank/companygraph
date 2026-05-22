import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Resolve .claude/CLAUDE.md from repo root regardless of CWD.
// __tests__ → api/ → repo-root → .claude/CLAUDE.md
const CLAUDE_MD_PATH = join(import.meta.dir, "..", "..", ".claude", "CLAUDE.md");

describe("AC-17 — .claude/CLAUDE.md is companygraph-specific", () => {
  const content = readFileSync(CLAUDE_MD_PATH, "utf8");

  test("title contains 'companygraph'", () => {
    // H1 on the first non-blank line.
    const firstHeading = content
      .split("\n")
      .find((line) => line.startsWith("# "));
    expect(firstHeading?.toLowerCase()).toContain("companygraph");
  });

  describe("required H2 sections present", () => {
    const requiredSections = [
      "Architecture",
      "Schema",
      "Development",
      "Follow-up specs",
      "Versioning",
    ];
    for (const heading of requiredSections) {
      test(`'## ${heading}' is present`, () => {
        // Accept exact match OR a heading that starts with this name
        // (e.g. "## Follow-up specs (downstream)" still counts).
        const pattern = new RegExp(
          `^##\\s+${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`,
          "m",
        );
        expect(pattern.test(content)).toBe(true);
      });
    }
  });

  describe("four downstream specs each cited at least once", () => {
    const followUpSpecs = [
      "ontology-manager",
      "process-explorer-ui",
      "chat-interface",
      "cto-analytics",
    ];
    for (const spec of followUpSpecs) {
      test(`'${spec}' is named`, () => {
        expect(content).toContain(spec);
      });
    }
  });

  describe("inherited personal-assistant boilerplate absent", () => {
    // From AC-17: these strings prove the inherited content has been
    // replaced and not just diff-merged.
    const forbidden = [
      "Personal Productivity Assistant",
      "telegram/",
      "PWA Telegram bot",
      "EC2 t4g.small",
      "grammY",
      "osascript",
    ];
    for (const phrase of forbidden) {
      test(`'${phrase}' is absent`, () => {
        expect(content).not.toContain(phrase);
      });
    }
  });

  test("AC-28 — versioning paragraph mentions /api/v1/ and /api/v2/", () => {
    // NFR-11 requires the doc to describe the v1 → v2 parallel-support
    // policy. The test does not pin exact wording — just that BOTH
    // version prefixes appear under the Versioning section.
    const versioningMatch = content.match(/##\s+Versioning[\s\S]*?(?=^##\s|\Z)/m);
    expect(versioningMatch).not.toBeNull();
    const section = versioningMatch![0];
    expect(section).toContain("/api/v1/");
    expect(section).toContain("/api/v2/");
    // Parallel-support window stated.
    expect(section.toLowerCase()).toMatch(/parallel|deprecat|sunset/);
  });

  test("references the OpenAPI single-source-of-truth path", () => {
    // FR-16 — the schema is generated, not hand-maintained.
    expect(content).toContain("/api/v1/openapi.json");
  });
});
