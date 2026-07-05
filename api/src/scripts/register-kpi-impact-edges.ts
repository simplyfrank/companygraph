// kpi-impact-mapping T-09 (design §4.9, DD-02, XD-01) — registers the
// IMPACTS_KPI runtime-registry edge type (UserStory → KPI).
//
// The compile-time EDGE_ENDPOINTS / NODE_LABELS consts are NEVER touched
// (NFR-02, AC-15) — the registry is the sanctioned extension path.
//
// Idempotent: the createEdgeType call swallows `name_conflict` — a re-run
// that hits the existing type is a no-op (run-once-per-boot-safe, matching
// story-spec-core's pattern).
//
// Invoked (a) from bootstrap so a fresh boot has the edge type, and
// (b) standalone via `bun run register:kpi-impact`.

import type { Driver } from "neo4j-driver";
import { createEdgeType } from "../ontology/storage/edge-types";
import { ValidationError } from "../errors";

const ACTOR = "system:kpi-impact";

export const KPI_IMPACT_EDGE_TYPES = [
  {
    name: "IMPACTS_KPI",
    description:
      "Links a UserStory to a KPI it impacts (directional: increases/decreases). Carries weight [0,1], direction, notes, created_at. MERGE-on-pair (idempotent write).",
    usage_example: "(s:UserStory)-[:IMPACTS_KPI {direction:'increases',weight:0.8}]->(k:KPI)",
    endpoints: [{ fromLabel: "UserStory", toLabel: "KPI" }],
  },
] as const;

function isNameConflict(e: unknown): boolean {
  return e instanceof ValidationError && (e.code as string) === "name_conflict";
}

export async function registerKpiImpactEdges(driver: Driver): Promise<void> {
  for (const edge of KPI_IMPACT_EDGE_TYPES) {
    try {
      await createEdgeType(
        driver,
        {
          name: edge.name,
          description: edge.description,
          usage_example: edge.usage_example,
          endpoints: [...edge.endpoints],
        },
        ACTOR,
      );
    } catch (e) {
      if (!isNameConflict(e)) throw e;
    }
  }
}

// Standalone: `bun run register:kpi-impact`
if (import.meta.main) {
  const { getDriver, closeDriver } = await import("../neo4j/driver");
  try {
    await registerKpiImpactEdges(getDriver());
    console.log("register-kpi-impact-edges: 1 edge type ensured (idempotent)");
  } finally {
    await closeDriver();
  }
}
