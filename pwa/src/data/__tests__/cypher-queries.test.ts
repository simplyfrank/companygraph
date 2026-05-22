import { describe, test, expect } from "vitest";
import * as queries from "../cypher-queries";

// T-09c — smoke tests asserting every named query exports a non-empty
// read-only Cypher string. The C-06 fix is greppability + naming; the
// actual semantics are exercised by the consumer-view integration tests
// (FR-09 filter, FR-19 review queue, etc.) that ship in T-11..T-22.

const WRITE_KEYWORDS = /\b(CREATE|MERGE|DELETE|SET|REMOVE|DETACH|FOREACH|LOAD CSV)\b/i;

describe("cypher-queries module exports (T-09c)", () => {
  const expected = [
    "activityFilterAnd",
    "reviewQueueForDomain",
    "verifyingRoleName",
    "homeDomainResolution",
    "quarterlyHomeJourneys",
    "hydrateNodesByIds",
    "hydrateEdgesByIds",
  ] as const;

  test.each(expected)("%s is a non-empty string", (name) => {
    const q = (queries as Record<string, unknown>)[name];
    expect(typeof q).toBe("string");
    expect((q as string).trim().length).toBeGreaterThan(0);
  });

  test.each(expected)("%s contains no write keywords (read-only contract)", (name) => {
    const q = (queries as Record<string, unknown>)[name] as string;
    expect(q).not.toMatch(WRITE_KEYWORDS);
  });

  test("activityFilterAnd parameterises all three filter slots", () => {
    expect(queries.activityFilterAnd).toContain("$systemId");
    expect(queries.activityFilterAnd).toContain("$roleId");
    expect(queries.activityFilterAnd).toContain("$locId");
  });

  test("reviewQueueForDomain uses PART_OF*1..8 (C-09 fix)", () => {
    expect(queries.reviewQueueForDomain).toContain("PART_OF*1..8");
  });

  test("homeDomainResolution uses PART_OF*1..8 (C-09 fix)", () => {
    expect(queries.homeDomainResolution).toContain("PART_OF*1..8");
  });

  test("quarterlyHomeJourneys filters to a single domain", () => {
    expect(queries.quarterlyHomeJourneys).toContain("$homeDomainId");
  });
});
