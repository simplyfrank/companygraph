// ddd-system-modeling — shared self-heal + fixture helpers for the
// capability integration test files.
//
// Why the self-heal exists (mirrors helpers/story-fixtures.ts): the
// integration suite runs 100+ files against ONE shared Neo4j + API
// server, and sibling ontology tests legitimately wipe the `_Ontology*`
// meta-namespace and re-seed only the compile-time const tuples. That
// drops the runtime-registered capability rows (BoundedContext /
// Capability / the four edge types). `ensureCapabilitySchema()`
// re-registers THROUGH THE API so a successful re-create also emits
// `ontology.changed` in the SERVER process and clears its
// edge-endpoints/schema caches; a final no-op PATCH forces the cache
// clear even when everything already existed.

import {
  CAPABILITY_NODE_LABELS,
  CAPABILITY_EDGE_TYPES,
} from "../../src/scripts/register-capability-labels";
import { ensureStorySchema } from "./story-fixtures";
import { API_BASE, api } from "./model-fixtures";

async function post(path: string, body: unknown): Promise<number> {
  const res = await fetch(`${API_BASE}${path}?actor=ddd-system-test-heal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  await res.text(); // drain
  return res.status;
}

export async function ensureCapabilitySchema(): Promise<void> {
  // Heal model + story rows first (BusinessModel / UserStory endpoint
  // labels must exist before the capability edge types register) —
  // consumed helpers, never re-implemented.
  await ensureStorySchema();

  for (const label of CAPABILITY_NODE_LABELS) {
    const status = await post("/ontology/node-labels", {
      name: label.name,
      description: label.description,
      usage_example: label.usage_example,
      json_schema_doc: {},
    });
    if (status !== 201 && status !== 409) {
      throw new Error(`ensureCapabilitySchema: label ${label.name} → ${status}`);
    }
  }

  for (const edge of CAPABILITY_EDGE_TYPES) {
    const status = await post("/ontology/edge-types", {
      name: edge.name,
      description: edge.description,
      usage_example: edge.usage_example,
      endpoints: [...edge.endpoints],
    });
    if (status !== 201 && status !== 409) {
      throw new Error(`ensureCapabilitySchema: edge ${edge.name} → ${status}`);
    }
  }

  // Always force a server-side cache clear (no-op PATCH → emits
  // ontology.changed), covering the stale-empty cache window.
  const edge = CAPABILITY_EDGE_TYPES[1]!; // SUPPORTED_BY
  const res = await fetch(
    `${API_BASE}/ontology/edge-types/${edge.name}?actor=ddd-system-test-heal`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: edge.description }),
    },
  );
  await res.text();
  if (!res.ok) throw new Error(`ensureCapabilitySchema: cache-refresh PATCH → ${res.status}`);
}

// Create a capability through the real route (API-only fixtures).
export async function createCapabilityFixture(
  modelId: string,
  name: string,
): Promise<{ id: string }> {
  const r = await api<{ id: string }>("POST", `/models/${modelId}/capabilities`, { name });
  if (r.status !== 201) {
    throw new Error(`createCapabilityFixture ${name}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return { id: r.body.id };
}

// Create a UserStory describing an activity through story-spec-core's
// real route.
export async function createStoryFixture(
  modelId: string,
  activityId: string,
  persona: string,
): Promise<{ id: string; name: string }> {
  const r = await api<{ id: string; name: string }>("POST", `/models/${modelId}/stories`, {
    persona,
    action: "exercise the capability layer",
    benefit: "the gap analysis is grounded",
    activityId,
  });
  if (r.status !== 201) {
    throw new Error(`createStoryFixture: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return { id: r.body.id, name: r.body.name };
}
