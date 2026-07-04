// system-augmentation-model T-01 — the ONE augmentation vocabulary
// (XD-15). Every consumer (registry seed, migration, import injection,
// PWA badges/filter) imports these symbols; the literal strings appear
// nowhere else in production source (AC-01, guarded by
// api/__tests__/system-kind-vocabulary.test.ts).

import { z } from "zod";

export const SYSTEM_KINDS = ["functional", "agentic", "ai_predictive"] as const;
export type SystemKind = (typeof SYSTEM_KINDS)[number];
export const systemKindSchema = z.enum(SYSTEM_KINDS);
export const DEFAULT_SYSTEM_KIND: SystemKind = "functional";

// Human labels — one rendering vocabulary for pwa/ + downstream dashboards.
export const SYSTEM_KIND_LABELS: Record<SystemKind, string> = {
  functional: "Functional",
  agentic: "Agentic",
  ai_predictive: "AI predictive",
};

// FR-02 tightened doc for the System registry row. Deliberately NO
// `default` keyword under systemKind: api/src/storage/nodes.ts persists
// INPUT attributes, not zod's parsed output, so `default` would
// validate-pass while storing nothing (requirements Risk 2). All
// keywords stay inside `jsonSchemaDocSchema`'s allow-list
// (shared/src/schema/ontology.ts).
export const SYSTEM_ATTRIBUTES_JSON_SCHEMA_DOC = {
  type: "object",
  additionalProperties: true, // open attributes map stays open
  required: ["systemKind"],
  properties: {
    systemKind: { type: "string", enum: [...SYSTEM_KINDS] },
  },
} as const;
