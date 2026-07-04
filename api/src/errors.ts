// Closed registry of error codes (NFR-11). Per-surface OpenAPI
// integration tests assert their codes appear in the ErrorEnvelope
// enum; nothing asserts route-reachability of every code.

export const ERROR_CODES = [
  "invalid_payload",
  "unknown_label",
  "unknown_type",
  "edge_endpoint_missing",
  "edge_endpoint_label_mismatch",
  "id_conflict",
  "not_found",
  "has_edges",
  "depth_exceeded",
  "result_truncated",
  "query_timeout",
  "write_statement_rejected",
  "parse_error",
  "neo4j_unreachable",
  // T-15 / FR-04 — per-label attribute schema enforcement (ontology-manager).
  // Thrown from `createNode` / `patchNode` / `upsertNode` when the input
  // `attributes` map fails the registered JSON Schema compiled via the
  // attribute-zod cache (api/src/ontology/cache/attribute-zod.ts).
  "attribute_violation",
  // T-18c — ontology-manager error codes surfaced through this enum so
  // graph-core's `error(...)` helper accepts them. These mirror the
  // closed ontology error set in `ontology/errors.ts` and are reachable
  // from the ontology routes (rollback, migrations, etc.).
  "rollback_below_bootstrap",
  "migration_failed",
  // T-18c — used by /api/v1/ontology/rollback/:version_id stub until the
  // full rollback executor lands in a follow-on commit.
  "not_implemented",
  // model-workspace-core T-02 (design §3.6) — nine additive codes for the
  // multi-model workspace + versioned-modules surface. Additive-only per
  // NFR-11: no existing code removed or reordered.
  "model_not_found",
  "model_reference_immutable",
  "module_not_found",
  "module_version_not_found",
  "module_instance_forked",
  "module_version_immutable",
  "module_downgrade_not_allowed",
  "model_lifecycle_route_required",
  "module_instance_node_not_member",
  // story-spec-core T-03 (design §3.5, DD-08) — five additive codes for
  // the user-story / acceptance-criterion surface. Additive-only per
  // NFR-11. Deliberately NOT added: `story_duplicate_for_activity`
  // (DD-04 — dead code under the 1..* default). A bad `roleId` reuses
  // the generic `not_found` (DD-07); an unknown `:modelId` reuses
  // `model_not_found` (tasks C-06 pin).
  "story_not_found",
  "acceptance_criterion_not_found",
  "story_activity_required",
  "story_activity_not_in_model",
  "acceptance_criterion_clause_required",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export class ValidationError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly details: Record<string, unknown> = {},
    public readonly httpStatus = 400,
  ) {
    super(code);
  }
}

// Detects a Neo4j uniqueness-constraint violation (used by createNode /
// createEdge to surface 409 id_conflict). Driver error shape per
// neo4j-driver v5.
export function isConstraintViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const code = (e as { code?: unknown }).code;
  return code === "Neo.ClientError.Schema.ConstraintValidationFailed";
}

// Detects driver's read-mode rejection of write statements.
export function isAccessModeViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const code = (e as { code?: unknown }).code;
  return code === "Neo.ClientError.Statement.AccessMode";
}

// Detects driver's Cypher syntax errors.
export function isSyntaxError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const code = (e as { code?: unknown }).code;
  return code === "Neo.ClientError.Statement.SyntaxError";
}

// Detects driver's per-tx timeout error.
export function isTransactionTimeout(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const code = (e as { code?: unknown }).code;
  return (
    code === "Neo.ClientError.Transaction.TransactionTimedOut" ||
    code === "Neo.TransientError.Transaction.LockClientStopped"
  );
}
