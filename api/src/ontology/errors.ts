// Closed registry of ontology-manager error codes (design §5.3).
//
// Symmetric with graph-core's `ERROR_CODES` enum (../errors.ts). The
// `ERROR_CODE_THROWERS` registry in ./error-throwers.ts must be exhaustive
// over this enum — the envelope test asserts that.

export const ONTOLOGY_ERROR_CODES = [
  "invalid_payload",
  "unsupported_jsonschema_keyword",
  "missing_documentation",
  "name_conflict",
  "not_found",
  "type_pair_violation",
  "schema_breaking",
  "deprecation_required",
  "would_invalidate",
  "rollback_orphans",
  "rollback_below_bootstrap", // pass-1 design-review C-03
  "attribute_violation",
  "migration_failed",
  "edge_endpoint_label_mismatch", // symmetric with graph-core (FR-04a)
  "validation_error", // for glossary validation errors
] as const;
export type OntologyErrorCode = (typeof ONTOLOGY_ERROR_CODES)[number];
