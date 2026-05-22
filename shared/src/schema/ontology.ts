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

// Recursive shape — `z.lazy` is required for self-reference.
export const jsonSchemaDocSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      type: z
        .union([
          z.enum(SUPPORTED_JSON_SCHEMA_TYPES),
          z.array(z.enum(SUPPORTED_JSON_SCHEMA_TYPES)),
        ])
        .optional(),
      required: z.array(z.string()).optional(),
      properties: z.record(jsonSchemaDocSchema).optional(),
      additionalProperties: z
        .union([z.boolean(), jsonSchemaDocSchema])
        .optional(),
      items: z
        .union([jsonSchemaDocSchema, z.array(jsonSchemaDocSchema)])
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

export const ontologyImportSchema = z.object({
  nodeLabels: z.array(nodeLabelCreateSchema).optional(),
  edgeTypes: z.array(edgeTypeCreateSchema).optional(),
});
export type OntologyImportPayload = z.infer<typeof ontologyImportSchema>;

// Import response — same shape as graph-core's two-phase import.
export const ontologyImportResponseSchema = z.object({
  accepted: z.object({
    nodeLabels: z.number().int().nonnegative(),
    edgeTypes: z.number().int().nonnegative(),
  }),
  errors: z
    .array(
      z.object({
        section: z.enum(["nodeLabels", "edgeTypes"]),
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
