// Pass-1 design-review C-02 absorbed in tasks revision 2 → registry-based
// exhaustiveness check (not the rejected `@uses-error-code` annotation).
//
// Every ontology-manager error code in `ONTOLOGY_ERROR_CODES` (./errors.ts)
// MUST have an entry in this registry. The envelope test
// (`api/__tests__/ontology-envelope.test.ts`) walks the enum + the registry
// and asserts they're the same set.
//
// Each value is a function that takes the appropriate `details` shape and
// `throw`s a graph-core `ValidationError`. Call sites import the named
// thrower and call it — no per-throw-site annotations needed.

import { ValidationError } from "../errors";
import type { OntologyErrorCode } from "./errors";

// Distinct thrower signatures per code keep typing tight at the call site.
// They all `throw new ValidationError(...)` with the right code + httpStatus.
// Note: graph-core's ValidationError accepts `ErrorCode` from `../errors.ts`;
// the ontology error codes overlap by intent (e.g. `invalid_payload`,
// `not_found`) and are stable, machine-readable strings, so the cast at the
// throw site is safe.

function asGcCode(code: OntologyErrorCode): string {
  // ValidationError's `code` field is typed `ErrorCode` (graph-core's enum),
  // but at runtime the route handlers only read `.code` as a string for the
  // response envelope. The runtime is permissive; TypeScript is the only
  // surface that complains. Cast through `unknown` to thread the assertion.
  return code as unknown as string;
}

export interface ThrowerRegistry {
  invalid_payload: (details: {
    fieldErrors?: Record<string, unknown>;
    keyword?: string;
  }) => never;
  unsupported_jsonschema_keyword: (details: {
    keyword: string;
    path?: string;
  }) => never;
  missing_documentation: (details: { field: "description" | "usage_example" }) => never;
  name_conflict: (details: { name: string }) => never;
  not_found: (details: { name?: string; id?: string; kind?: string }) => never;
  type_pair_violation: (details: {
    unknown_label?: string;
    pair?: { fromLabel: string; toLabel: string };
  }) => never;
  schema_breaking: (details: {
    affected_edge_count: number;
    sample_edge_ids: ReadonlyArray<string>;
    dropped_pair?: { fromLabel: string; toLabel: string };
    cause?: string;
  }) => never;
  deprecation_required: (details: {
    precondition_failed:
      | "node_instance_count"
      | "edge_instance_count"
      | "edge_endpoints_referencing"
      | "migration_step_required"
      | "migration_step_not_found";
    [k: string]: unknown;
  }) => never;
  would_invalidate: (details: {
    affected_count: number;
    sample_node_ids: ReadonlyArray<string>;
    newly_required: ReadonlyArray<string>;
    suggested_backfill: string;
  }) => never;
  rollback_orphans: (details: {
    affected_labels: ReadonlyArray<string>;
    count: number;
  }) => never;
  rollback_below_bootstrap: (details: { version_id: string }) => never;
  attribute_violation: (details: {
    missing?: ReadonlyArray<string>;
    type_mismatch?: ReadonlyArray<string>;
  }) => never;
  migration_failed: (details: {
    migration_id?: string;
    cypher_error?: string;
  }) => never;
  edge_endpoint_label_mismatch: (details: {
    type: string;
    fromLabel: string;
    toLabel: string;
    allowed: ReadonlyArray<{ from: string; to: string }>;
  }) => never;
  validation_error: (details: {
    message: string;
    details?: Record<string, unknown>;
  }) => never;
}

function throwAs<C extends OntologyErrorCode>(
  code: C,
  details: Record<string, unknown>,
  httpStatus: number,
): never {
  throw new ValidationError(asGcCode(code) as never, details, httpStatus);
}

export const ERROR_CODE_THROWERS: ThrowerRegistry = {
  invalid_payload: (details) => throwAs("invalid_payload", { ...details }, 400),
  unsupported_jsonschema_keyword: (details) =>
    throwAs("unsupported_jsonschema_keyword", { ...details }, 400),
  missing_documentation: (details) =>
    throwAs("missing_documentation", { ...details }, 400),
  name_conflict: (details) => throwAs("name_conflict", { ...details }, 409),
  not_found: (details) => throwAs("not_found", { ...details }, 404),
  type_pair_violation: (details) =>
    throwAs("type_pair_violation", { ...details }, 400),
  schema_breaking: (details) =>
    throwAs("schema_breaking", { ...details }, 400),
  deprecation_required: (details) =>
    throwAs("deprecation_required", { ...details }, 409),
  would_invalidate: (details) =>
    throwAs("would_invalidate", { ...details }, 409),
  rollback_orphans: (details) =>
    throwAs("rollback_orphans", { ...details }, 400),
  rollback_below_bootstrap: (details) =>
    throwAs("rollback_below_bootstrap", { ...details }, 400),
  attribute_violation: (details) =>
    throwAs("attribute_violation", { ...details }, 400),
  migration_failed: (details) =>
    throwAs("migration_failed", { ...details }, 400),
  edge_endpoint_label_mismatch: (details) =>
    throwAs("edge_endpoint_label_mismatch", { ...details }, 400),
  validation_error: (details) =>
    throwAs("validation_error", { ...details }, 400),
};
