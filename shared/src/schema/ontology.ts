import { z } from "zod";
import { uuidv7 } from "./nodes";

// =============================================================================
// JSON Schema 2020-12 — supported subset (FR-01a, design §3.3 + §3.4).
//
// Strict-mode `.strict()` on every nested object level rejects any keyword
// NOT in this allow-list with a Zod error. The route handler maps that to
// `400 unsupported_jsonschema_keyword` with `details.keyword` + `details.path`.
//
// Supported keywords:
//   type, required, properties, additionalProperties, items, format,
//   pattern, minLength, maxLength, minimum, maximum, exclusiveMinimum,
//   exclusiveMaximum, multipleOf, enum, default
//
// Out of scope (rejected at register time):
//   oneOf, anyOf, allOf, not, if, then, else, $ref, const,
//   contentEncoding, contentMediaType, dependentSchemas, dependentRequired
// =============================================================================

export const SUPPORTED_JSON_SCHEMA_TYPES = [
  "string",
  "number",
  "integer",
  "boolean",
  "null",
  "array",
  "object",
] as const;
export type SupportedJsonSchemaType =
  (typeof SUPPORTED_JSON_SCHEMA_TYPES)[number];

// Max nesting depth + serialised size for the JSON Schema document.
// Enforced at register time to cap the `json-schema-to-zod` codegen surface
// (the `new Function` eval in attribute-zod.ts) against DoS via deep nesting.
export const MAX_JSON_SCHEMA_DEPTH = 8;
export const MAX_JSON_SCHEMA_BYTES = 32_768;

function jsonSchemaDepth(doc: unknown, depth = 0): number {
  if (depth > MAX_JSON_SCHEMA_DEPTH) return depth;
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return depth;
  const obj = doc as Record<string, unknown>;
  let max = depth;
  for (const key of ["properties", "additionalProperties", "items"] as const) {
    const v = obj[key];
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const item of v) max = Math.max(max, jsonSchemaDepth(item, depth + 1));
    } else {
      max = Math.max(max, jsonSchemaDepth(v, depth + 1));
    }
    if (typeof v === "object" && !Array.isArray(v)) {
      for (const child of Object.values(v as Record<string, unknown>)) {
        max = Math.max(max, jsonSchemaDepth(child, depth + 1));
      }
    }
  }
  return max;
}

// Recursive shape — `z.lazy` is required for self-reference.
const _jsonSchemaDocInner: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      type: z
        .union([
          z.enum(SUPPORTED_JSON_SCHEMA_TYPES),
          z.array(z.enum(SUPPORTED_JSON_SCHEMA_TYPES)),
        ])
        .optional(),
      required: z.array(z.string()).optional(),
      properties: z.record(_jsonSchemaDocInner).optional(),
      additionalProperties: z
        .union([z.boolean(), _jsonSchemaDocInner])
        .optional(),
      items: z
        .union([_jsonSchemaDocInner, z.array(_jsonSchemaDocInner)])
        .optional(),
      format: z.string().optional(),
      pattern: z.string().optional(),
      minLength: z.number().int().nonnegative().optional(),
      maxLength: z.number().int().nonnegative().optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      exclusiveMinimum: z.number().optional(),
      exclusiveMaximum: z.number().optional(),
      multipleOf: z.number().positive().optional(),
      enum: z.array(z.unknown()).optional(),
      default: z.unknown().optional(),
    })
    .strict(),
);

// zod-to-openapi cannot traverse ZodLazy self-references — without an
// explicit `type` it throws UnknownZodTypeError at generation time, which
// 500s GET /api/v1/openapi.json. Represent the document as a free-form
// object in the generated spec. Set on `_def` in place (not `.openapi()`,
// which clones) so the self-referencing instance itself carries it.
(_jsonSchemaDocInner as unknown as {
  _def: { openapi?: { metadata: { type: string } } };
})._def.openapi = { metadata: { type: "object" } };

// Public export wraps the inner schema with depth + size guards so
// register-time validation rejects documents that would produce
// unbounded codegen strings in attribute-zod.ts's `new Function` path.
export const jsonSchemaDocSchema: z.ZodType<unknown> = _jsonSchemaDocInner.superRefine(
  (doc, ctx) => {
    const bytes = JSON.stringify(doc).length;
    if (bytes > MAX_JSON_SCHEMA_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `json_schema_doc exceeds ${MAX_JSON_SCHEMA_BYTES} bytes (got ${bytes})`,
      });
      return;
    }
    const depth = jsonSchemaDepth(doc);
    if (depth > MAX_JSON_SCHEMA_DEPTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `json_schema_doc exceeds maximum nesting depth of ${MAX_JSON_SCHEMA_DEPTH} (got ${depth})`,
      });
    }
  },
);

// =============================================================================
// External alignment — FR-09. Free-text source + id (no enumeration).
// =============================================================================

export const externalAlignmentEntrySchema = z.object({
  source: z.string().min(1).max(100),
  id: z.string().min(1).max(200),
});
export type ExternalAlignmentEntry = z.infer<
  typeof externalAlignmentEntrySchema
>;

export const externalAlignmentArraySchema = z.array(
  externalAlignmentEntrySchema,
);

// =============================================================================
// Node label — FR-02 + FR-10.
// =============================================================================

// Neo4j label naming: PascalCase starting with uppercase letter.
const NODE_LABEL_NAME_REGEX = /^[A-Z][A-Za-z0-9_]*$/;

/**
 * Sanitize a string to match the NODE_LABEL_NAME_REGEX pattern.
 * - Replaces spaces, hyphens, slashes, dots, parentheses with underscores
 * - Removes consecutive underscores
 * - Ensures the result starts with an uppercase letter
 * - Ensures the result contains only [A-Za-z0-9_]
 */
export function sanitizeLabelName(name: string): string {
  // Replace special characters with underscores
  let sanitized = name
    .replace(/[^A-Za-z0-9]/g, '_')
    // Remove consecutive underscores
    .replace(/_+/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, '');
  
  // Ensure it starts with an uppercase letter
  if (sanitized.length > 0) {
    sanitized = sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
  }
  
  // If empty after sanitization, use a fallback
  if (!sanitized) {
    sanitized = 'Entity';
  }
  
  return sanitized;
}

export const nodeLabelCreateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(NODE_LABEL_NAME_REGEX, {
      message:
        "must start with an uppercase letter and contain only [A-Za-z0-9_]",
    })
    .refine((s) => !s.startsWith("_"), {
      message: "the `_` prefix is reserved for the registry's meta-labels",
    }),
  description: z.string().min(1).max(2000),
  usage_example: z.string().min(1).max(200),
  json_schema_doc: jsonSchemaDocSchema,
  external_alignment: externalAlignmentArraySchema.optional(),
});
export type NodeLabelCreate = z.infer<typeof nodeLabelCreateSchema>;

// PATCH — name is immutable (path param is authoritative).
// .strict() rejects unknown keys.
export const nodeLabelPatchSchema = nodeLabelCreateSchema
  .pick({
    description: true,
    usage_example: true,
    json_schema_doc: true,
    external_alignment: true,
  })
  .partial()
  .strict();
export type NodeLabelPatch = z.infer<typeof nodeLabelPatchSchema>;

// Read shape — what `GET /api/v1/ontology/node-labels/:name` returns.
export const nodeLabelReadSchema = z.object({
  name: z.string(),
  description: z.string(),
  usage_example: z.string(),
  json_schema_doc: z.unknown(), // free shape — recursive zod doesn't round-trip cleanly through `z.infer`
  external_alignment: externalAlignmentArraySchema,
  deprecated_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type NodeLabelRead = z.infer<typeof nodeLabelReadSchema>;

// =============================================================================
// Edge type — FR-03 + FR-10.
// =============================================================================

// Neo4j relationship-type naming: SCREAMING_SNAKE_CASE.
const EDGE_TYPE_NAME_REGEX = /^[A-Z][A-Z0-9_]*$/;

export const edgeEndpointPairSchema = z.object({
  fromLabel: z.string(),
  toLabel: z.string(),
});
export type EdgeEndpointPair = z.infer<typeof edgeEndpointPairSchema>;

export const edgeTypeCreateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(EDGE_TYPE_NAME_REGEX, {
      message:
        "must be SCREAMING_SNAKE_CASE: uppercase letters, digits, underscores",
    }),
  description: z.string().min(1).max(2000),
  usage_example: z.string().min(1).max(200),
  endpoints: z.array(edgeEndpointPairSchema).min(1),
  external_alignment: externalAlignmentArraySchema.optional(),
});
export type EdgeTypeCreate = z.infer<typeof edgeTypeCreateSchema>;

export const edgeTypePatchSchema = edgeTypeCreateSchema
  .pick({
    description: true,
    usage_example: true,
    endpoints: true,
    external_alignment: true,
  })
  .partial()
  .strict();
export type EdgeTypePatch = z.infer<typeof edgeTypePatchSchema>;

export const edgeTypeReadSchema = z.object({
  name: z.string(),
  description: z.string(),
  usage_example: z.string(),
  endpoints: z.array(edgeEndpointPairSchema),
  external_alignment: externalAlignmentArraySchema,
  deprecated_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type EdgeTypeRead = z.infer<typeof edgeTypeReadSchema>;

// =============================================================================
// Schema endpoint — FR-14 — `GET /api/v1/schema`.
// =============================================================================

export const schemaResponseSchema = z.object({
  nodeLabels: z.array(nodeLabelReadSchema),
  edgeTypes: z.array(edgeTypeReadSchema),
});
export type SchemaResponse = z.infer<typeof schemaResponseSchema>;

// =============================================================================
// Import / export — FR-08.
//
// `POST /api/v1/ontology/import` accepts both YAML and JSON; content-type
// sniffing + `?format=` override pick the parser. The payload shape is
// identical post-parse.
// =============================================================================

// Bounded context schema for import
export const boundedContextCreateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  domain: z.string().min(1).max(100),
  subdomain: z.string().min(1).max(100),
  type: z.enum(["Core", "Generic", "Supporting"]),
  oracle_system: z.string().max(200).optional(),
  jira_projects: z.array(z.string()).default([]),
});
export type BoundedContextCreate = z.infer<typeof boundedContextCreateSchema>;

// Entity schema for import
export const entityCreateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  subdomain: z.string().min(1).max(100),
  bounded_context: z.string().min(1).max(200),
  entity_number: z.number().int().nonnegative(),
  status: z.enum(["ACTIVE", "NOT MAINTAINED", "NOT IN USE", "PARTIAL", "UNDER REVIEW"]),
  oracle_table: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});
export type EntityCreate = z.infer<typeof entityCreateSchema>;

// Bounded context relationship schema for import
export const boundedContextRelationshipSchema = z.object({
  from: z.string().min(1), // Bounded context name
  to: z.string().min(1), // Bounded context name
  type: z.enum(["UPSTREAM_OF", "DOWNSTREAM_OF"]),
});
export type BoundedContextRelationship = z.infer<typeof boundedContextRelationshipSchema>;

// Domain schema for import - schema per domain
export const domainSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  accountable_role: z.string().max(200).optional(),
  compliance_tags: z.array(z.string()).default([]),
  // Schema per domain - node labels and edge types scoped to this domain
  nodeLabels: z.array(z.string()).default([]), // Names of node labels belonging to this domain
  edgeTypes: z.array(z.string()).default([]), // Names of edge types belonging to this domain
});
export type DomainCreate = z.infer<typeof domainSchema>;

// Cross-domain entity relationship schema
export const crossDomainEntityRelationshipSchema = z.object({
  from_entity_id: z.string().uuid(), // Entity ID
  to_entity_id: z.string().uuid(), // Entity ID
  from_domain: z.string().min(1).max(100), // Source domain
  to_domain: z.string().min(1).max(100), // Target domain
  relationship_type: z.string().min(1).max(100), // Edge type name
  description: z.string().max(500).optional(),
});
export type CrossDomainEntityRelationship = z.infer<typeof crossDomainEntityRelationshipSchema>;

// Shared domain schema — reusable workflow components not scoped to a
// single BusinessModel.  Bounded contexts can reference shared domains
// via BELONGS_TO_SHARED_DOMAIN; models can use them via USES_SHARED_DOMAIN.
export const sharedDomainSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  // Bounded context names that belong to this shared domain
  bounded_contexts: z.array(z.string()).default([]),
  // Tags for categorising the shared domain (e.g. "workflow", "reference-data")
  tags: z.array(z.string()).default([]),
});
export type SharedDomainCreate = z.infer<typeof sharedDomainSchema>;

// Namespace schema — business model specific work separation.
// Namespaces partition work within a single BusinessModel so different
// teams or individuals can work independently without naming conflicts.
export const namespaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  model_id: z.string().uuid(), // BusinessModel this namespace belongs to
  // Bounded context names scoped to this namespace
  bounded_contexts: z.array(z.string()).default([]),
});
export type NamespaceCreate = z.infer<typeof namespaceSchema>;

export const ontologyImportSchema = z.object({
  nodeLabels: z.array(nodeLabelCreateSchema).optional(),
  edgeTypes: z.array(edgeTypeCreateSchema).optional(),
  boundedContexts: z.array(boundedContextCreateSchema).optional(),
  entities: z.array(entityCreateSchema).optional(),
  boundedContextRelationships: z.array(boundedContextRelationshipSchema).optional(),
  domains: z.array(domainSchema).optional(),
  crossDomainEntityRelationships: z.array(crossDomainEntityRelationshipSchema).optional(),
  sharedDomains: z.array(sharedDomainSchema).optional(),
  namespaces: z.array(namespaceSchema).optional(),
});
export type OntologyImportPayload = z.infer<typeof ontologyImportSchema>;

// Import response — same shape as graph-core's two-phase import.
export const ontologyImportResponseSchema = z.object({
  accepted: z.object({
    nodeLabels: z.number().int().nonnegative(),
    edgeTypes: z.number().int().nonnegative(),
    boundedContexts: z.number().int().nonnegative(),
    entities: z.number().int().nonnegative(),
    boundedContextRelationships: z.number().int().nonnegative(),
    domains: z.number().int().nonnegative(),
    crossDomainEntityRelationships: z.number().int().nonnegative(),
    sharedDomains: z.number().int().nonnegative(),
    namespaces: z.number().int().nonnegative(),
  }),
  errors: z
    .array(
      z.object({
        section: z.enum(["nodeLabels", "edgeTypes", "boundedContexts", "entities", "boundedContextRelationships", "domains", "crossDomainEntityRelationships", "sharedDomains", "namespaces"]),
        index: z.number().int().nonnegative(),
        code: z.string(),
        message: z.string(),
        details: z.record(z.unknown()).optional(),
      }),
    )
    .optional(),
});
export type OntologyImportResponse = z.infer<
  typeof ontologyImportResponseSchema
>;

// =============================================================================
// Migrations — FR-16 (pass-1 design-review C-09 — discriminated union, NO
// operator-supplied Cypher reaches `executeWrite`).
// =============================================================================

export const migrationCreateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("rename_attribute"),
    target: z.string(),
    transform: z.object({
      from_key: z.string().min(1),
      to_key: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("remap_value"),
    target: z.string(),
    transform: z.object({
      key: z.string().min(1),
      from_value: z.unknown(),
      to_value: z.unknown(),
    }),
  }),
  z.object({
    type: z.literal("remove_attribute"),
    target: z.string(),
    transform: z.object({
      key: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("merge_labels"),
    target: z.string(),
    transform: z.object({
      source_labels: z.array(z.string()).min(1),
    }),
  }),
  z.object({
    type: z.literal("split_label"),
    target: z.string(),
    transform: z.object({
      predicate_key: z.string().min(1),
      mapping: z.record(z.string(), z.string()),
    }),
  }),
]);
export type MigrationCreate = z.infer<typeof migrationCreateSchema>;
export type MigrationType = MigrationCreate["type"];

// =============================================================================
// Version + audit + event shapes — design §3.1, §4.4–§4.5.
// =============================================================================

export const ontologyVersionSchema = z.object({
  version_id: uuidv7,
  parent_version_id: uuidv7.nullable(),
  diff_jsonpatch: z.array(z.record(z.unknown())).nullable(),
  actor: z.string(),
  ts: z.string().datetime(),
  summary: z.string(),
});
export type OntologyVersion = z.infer<typeof ontologyVersionSchema>;

export const ontologyAuditRowSchema = z.object({
  ts: z.string().datetime(),
  actor: z.string(),
  action: z.string(),
  target: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  diff_jsonpatch: z.array(z.record(z.unknown())).nullable(),
  version_id: uuidv7,
});
export type OntologyAuditRow = z.infer<typeof ontologyAuditRowSchema>;

// The post-commit broadcast event shape (FR-17 — both in-process EventEmitter
// and SSE serialise this).
export interface OntologyChangedEvent {
  event_id: string; // UUIDv7
  version_id: string; // UUIDv7
  ts: string; // ISO datetime
  diff: ReadonlyArray<Record<string, unknown>>;
}

// =============================================================================
// Business Glossaries — Ontos integration for process terminology.
// =============================================================================

export const COLLECTION_TYPE_ENUM = ["GLOSSARY", "TAXONOMY", "ONTOLOGY"] as const;
export type CollectionType = (typeof COLLECTION_TYPE_ENUM)[number];

export const SCOPE_LEVEL_ENUM = ["ENTERPRISE", "DOMAIN", "DEPARTMENT", "TEAM", "PROJECT", "EXTERNAL"] as const;
export type ScopeLevel = (typeof SCOPE_LEVEL_ENUM)[number];

export const SOURCE_TYPE_ENUM = ["CUSTOM", "IMPORTED"] as const;
export type SourceType = (typeof SOURCE_TYPE_ENUM)[number];

export const CONCEPT_STATUS_ENUM = ["DRAFT", "UNDER_REVIEW", "APPROVED", "ACTIVE", "DEPRECATED", "RETIRED"] as const;
export type ConceptStatus = (typeof CONCEPT_STATUS_ENUM)[number];

export const glossaryCollectionSchema = z.object({
  iri: z.string().min(1).max(500),
  label: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  collection_type: z.enum(COLLECTION_TYPE_ENUM).default("GLOSSARY"),
  scope_level: z.enum(SCOPE_LEVEL_ENUM).default("ENTERPRISE"),
  source_type: z.enum(SOURCE_TYPE_ENUM).default("CUSTOM"),
  source_url: z.string().url().optional(),
  parent_collection_iri: z.string().max(500).optional(),
  is_editable: z.boolean().default(true),
  status: z.enum(["active", "archived"]).default("active"),
});
export type GlossaryCollectionCreate = z.infer<typeof glossaryCollectionSchema>;

export const glossaryCollectionPatchSchema = glossaryCollectionSchema
  .pick({
    label: true,
    description: true,
    is_editable: true,
    status: true,
  })
  .partial()
  .strict();
export type GlossaryCollectionPatch = z.infer<typeof glossaryCollectionPatchSchema>;

export const glossaryCollectionReadSchema = glossaryCollectionSchema.extend({
  concept_count: z.number().int().nonnegative().default(0),
  created_at: z.string().datetime(),
  created_by: z.string().optional(),
  updated_at: z.string().datetime(),
  updated_by: z.string().optional(),
});
export type GlossaryCollectionRead = z.infer<typeof glossaryCollectionReadSchema> & {
  child_collections: GlossaryCollectionRead[];
};

export const glossaryTermSchema = z.object({
  id: z.string().uuid(),
  iri: z.string().min(1).max(500),
  local_name: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  status: z.enum(CONCEPT_STATUS_ENUM).default("DRAFT"),
  collection_iri: z.string().min(1).max(500),
  synonyms: z.array(z.string().max(200)).max(50).default([]),
  tags: z.array(z.string().max(100)).max(20).default([]),
});
export type GlossaryTermCreate = z.infer<typeof glossaryTermSchema>;

export const glossaryTermPatchSchema = glossaryTermSchema
  .pick({
    label: true,
    description: true,
    status: true,
    synonyms: true,
    tags: true,
  })
  .partial()
  .strict();
export type GlossaryTermPatch = z.infer<typeof glossaryTermPatchSchema>;

export const glossaryTermReadSchema = glossaryTermSchema.extend({
  created_at: z.string().datetime(),
  created_by: z.string().optional(),
  updated_at: z.string().datetime(),
  updated_by: z.string().optional(),
});
export type GlossaryTermRead = z.infer<typeof glossaryTermReadSchema>;

// Ontology Proposal schemas for LLM-based ontology generation
export const PROPOSAL_SOURCE_SCOPE_ENUM = ["DOMAIN", "SUBDOMAIN", "JOURNEY"] as const;
export const PROPOSAL_STATUS_ENUM = ["DRAFT", "UNDER_REVIEW", "APPROVED", "REJECTED", "INTEGRATED"] as const;

export const ontologyProposalSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  source_scope: z.enum(PROPOSAL_SOURCE_SCOPE_ENUM),
  source_id: z.string().max(100),
  status: z.enum(PROPOSAL_STATUS_ENUM).default("DRAFT"),
  owl_content: z.string().max(10_000_000),  // 10MB max for Turtle content
  classes: z.string(),  // JSON array of class definitions
  properties: z.string(),  // JSON array of property definitions
  agent_steps: z.string(),  // JSON array of agent execution steps
  llm_model: z.string().max(100).default("gpt-4"),
  llm_usage: z.string(),  // JSON of token usage
  created_at: z.string().datetime(),
  created_by: z.string().optional(),
  reviewed_at: z.string().datetime().optional(),
  reviewed_by: z.string().optional(),
  integrated_at: z.string().datetime().optional(),
});
export type OntologyProposal = z.infer<typeof ontologyProposalSchema>;
export type OntologyProposalCreate = Omit<OntologyProposal, "id" | "created_at" | "created_by" | "reviewed_at" | "reviewed_by" | "integrated_at">;

export const ontologyProposalPatchSchema = ontologyProposalSchema
  .pick({
    name: true,
    description: true,
    status: true,
    owl_content: true,
    classes: true,
    properties: true,
  })
  .partial()
  .strict();
export type OntologyProposalPatch = z.infer<typeof ontologyProposalPatchSchema>;

export const ontologyProposalReadSchema = ontologyProposalSchema.extend({
  created_at: z.string().datetime(),
  created_by: z.string().optional(),
  reviewed_at: z.string().datetime().optional(),
  reviewed_by: z.string().optional(),
  integrated_at: z.string().datetime().optional(),
});
export type OntologyProposalRead = z.infer<typeof ontologyProposalReadSchema>;

// Agent step schema for tracking LLM execution
export const agentStepSchema = z.object({
  step_number: z.number().int().positive(),
  tool_name: z.string(),
  tool_input: z.record(z.unknown()),
  tool_output: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  duration_ms: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
});
export type AgentStep = z.infer<typeof agentStepSchema>;

// OWL class definition schema
export const owlClassSchema = z.object({
  iri: z.string().max(500),
  label: z.string().max(200),
  description: z.string().max(2000).optional(),
  super_classes: z.array(z.string().max(500)).max(20).default([]),
  equivalent_classes: z.array(z.string().max(500)).max(10).default([]),
  disjoint_with: z.array(z.string().max(500)).max(10).default([]),
  annotations: z.record(z.string()).optional(),
});
export type OwlClass = z.infer<typeof owlClassSchema>;

// OWL property definition schema
export const owlPropertySchema = z.object({
  iri: z.string().max(500),
  label: z.string().max(200),
  description: z.string().max(2000).optional(),
  property_type: z.enum(["object", "data", "annotation"]),
  domain: z.string().max(500).optional(),
  range: z.string().max(500).optional(),
  sub_properties: z.array(z.string().max(500)).max(10).default([]),
  super_properties: z.array(z.string().max(500)).max(10).default([]),
  annotations: z.record(z.string()).optional(),
});
export type OwlProperty = z.infer<typeof owlPropertySchema>;

// Compliance rule schemas for declarative SLA/KPI rule enforcement
export const COMPLIANCE_RULE_TYPE_ENUM = ["PERFORMANCE", "COMPLIANCE", "QUALITY"] as const;
export const COMPLIANCE_SEVERITY_ENUM = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const COMPLIANCE_ACTION_TYPE_ENUM = ["TAG", "NOTIFY", "BLOCK", "ALERT"] as const;

export const complianceActionSchema = z.object({
  type: z.enum(COMPLIANCE_ACTION_TYPE_ENUM),
  config: z.record(z.unknown()),
});

export const complianceRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  rule_dsl: z.string().min(1).max(10000),
  rule_type: z.enum(COMPLIANCE_RULE_TYPE_ENUM),
  category: z.string().max(100),
  severity: z.enum(COMPLIANCE_SEVERITY_ENUM),
  enabled: z.boolean().default(true),
  actions: z.string().describe("JSON-stringified array of {type, config} action objects"),
  schedule: z.string().max(100).optional(),
  last_evaluated_at: z.string().datetime().optional(),
  last_evaluation_result: z.string().optional(),
  created_at: z.string().datetime(),
  created_by: z.string().optional(),
  updated_at: z.string().datetime(),
  updated_by: z.string().optional(),
});
export type ComplianceRule = z.infer<typeof complianceRuleSchema>;
export type ComplianceRuleCreate = Omit<ComplianceRule, "id" | "created_at" | "created_by" | "updated_at" | "updated_by" | "last_evaluated_at" | "last_evaluation_result">;

export const complianceRulePatchSchema = complianceRuleSchema
  .pick({
    name: true,
    description: true,
    rule_dsl: true,
    enabled: true,
    actions: true,
    schedule: true,
  })
  .partial()
  .strict();
export type ComplianceRulePatch = z.infer<typeof complianceRulePatchSchema>;

export const complianceRuleReadSchema = complianceRuleSchema.extend({
  created_at: z.string().datetime(),
  created_by: z.string().optional(),
  updated_at: z.string().datetime(),
  updated_by: z.string().optional(),
  last_evaluated_at: z.string().datetime().optional(),
  last_evaluation_result: z.string().optional(),
});
export type ComplianceRuleRead = z.infer<typeof complianceRuleReadSchema>;

// Compliance evaluation schema
export const complianceEvaluationSchema = z.object({
  id: z.string().uuid(),
  rule_id: z.string().uuid(),
  evaluated_at: z.string().datetime(),
  passed: z.boolean(),
  score: z.number(),
  violations: z.string(),  // JSON array
  affected_entities: z.string(),  // JSON array
  actions_taken: z.string(),  // JSON array
  duration_ms: z.number().int().nonnegative(),
});
export type ComplianceEvaluation = z.infer<typeof complianceEvaluationSchema>;
export type ComplianceEvaluationRead = z.infer<typeof complianceEvaluationSchema>;
