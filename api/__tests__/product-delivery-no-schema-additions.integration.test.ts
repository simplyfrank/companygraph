// product-delivery-process-model T-09 (AC-13, design §7/§8/§11) — every
// label/edge the Product slice writes already exists in the ontology registry;
// this spec registers NONE. Requires the loopback API + Neo4j up.

import { describe, expect, test } from "bun:test";

const BASE = "http://127.0.0.1:8787";

// Extract a name set from a registry list response (array of rows with `.name`,
// or a `{data:[...]}` envelope). Defensive across either shape.
function names(body: unknown): Set<string> {
  const arr = Array.isArray(body)
    ? body
    : ((body as { data?: unknown[] })?.data ?? []);
  const out = new Set<string>();
  for (const r of arr as Array<{ name?: unknown }>) {
    if (r && typeof r.name === "string") out.add(r.name);
  }
  return out;
}

const REQUIRED_LABELS = [
  "Domain",
  "UserJourney",
  "Activity",
  "Role",
  "System",
  "KPI",
  "UserStory",
  "AcceptanceCriterion",
  "Capability",
  "BoundedContext",
  "MetricDefinition",
];

const REQUIRED_EDGES = [
  "PART_OF",
  "EXECUTES",
  "USES_SYSTEM",
  "PRECEDES",
  "ALIGNED_TO",
  "MEASURES",
  "DESCRIBES_ACTIVITY",
  "STORY_FOR_ROLE",
  "ACCEPTANCE_OF",
  "NEEDS_CAPABILITY",
  "SUPPORTED_BY",
  "ASSIGNED_TO_CONTEXT",
  "CAPABILITY_IN_MODEL",
];

describe("integration: product-delivery no schema additions (AC-13)", () => {
  test("every label the slice writes is already registered", async () => {
    const res = await fetch(`${BASE}/api/v1/ontology/node-labels`);
    expect(res.ok).toBe(true);
    const registered = names(await res.json());
    for (const label of REQUIRED_LABELS) {
      expect(registered.has(label)).toBe(true);
    }
  });

  test("every edge type the slice writes is already registered", async () => {
    const res = await fetch(`${BASE}/api/v1/ontology/edge-types`);
    expect(res.ok).toBe(true);
    const registered = names(await res.json());
    for (const type of REQUIRED_EDGES) {
      expect(registered.has(type)).toBe(true);
    }
  });
});
