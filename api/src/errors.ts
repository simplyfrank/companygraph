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
  // key-activity-optimizer T-07 (design §3.4) — ONE additive code.
  // 404, thrown from POST/DELETE …/key-activities/:activityId/mark
  // when — after the getModel gate has confirmed the model exists —
  // :activityId is not a model-scoped Activity (cross-model or
  // non-existent; no cross-model mark). `model_not_found` is NOT added
  // here — it already exists above (model-workspace-core) and the
  // key-activity handlers consume it via the getModel gate.
  "activity_not_found",
  // ddd-system-modeling T-03 (design §3.5) — three additive codes for
  // the Capability / system-model surface. Additive-only per NFR-11.
  // Each is reachable from ≥1 route (api/src/routes/capabilities.ts).
  // Deliberately REUSED, not re-added: `model_not_found` (create with
  // unknown :modelId), `not_found` (bad needed-by activityId/storyId,
  // details.field), `edge_endpoint_label_mismatch` (wrong endpoint
  // pair via the getEdgeEndpoints check, DD-12), `invalid_payload`.
  "capability_not_found",
  "bounded_context_not_found",
  "system_not_found",
  // requirements-export T-05a (FR-06) — one additive code for the
  // spec-export format negotiation. 400, thrown from the T-04 route
  // when ?format is not json/markdown (incl. pdf). model_not_found is
  // NOT added here — it already exists above (model-workspace-core).
  "unsupported_export_format",
  // kpi-impact-mapping T-02 (DD-05) — two additive codes.
  // 404 — link POSTs when kpiId is unknown/archived.
  "kpi_not_found",
  // 404 — link DELETEs when :linkId matches no edge of that type
  // (incl. a mis-routed cross-type id, AC-03).
  "impact_link_not_found",
  // risk-compliance-change T-05 (design §3.6, §4.4) — two additive codes,
  // additive-only per NFR-03 (no reorder, no removal).
  // `invalid_transition` (400): thrown from the change-request PATCH guard
  //   (change-requests.ts handleChangeRequestPatch, FR-11 / DEC-01) when a
  //   `status` patch requests an out-of-lifecycle transition.
  // `bad_request` (400): the confirmed C-02 latent-type-gap fix — already
  //   emitted at change-requests.ts (empty-patch guard) but absent from the
  //   tuple; adding it makes that as-built call type-correct WITHOUT changing
  //   the emitted code (AC-11 carve-out). Reused nowhere else.
  "invalid_transition",
  "bad_request",
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
