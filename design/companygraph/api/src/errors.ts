// Closed registry of error codes. envelope.test.ts asserts every code is
// reachable from at least one route.

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
