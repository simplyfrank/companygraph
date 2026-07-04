// model-workspace-core T-10 (design §4.6) — generic-route lifecycle guard.
//
// Lifecycle state (BusinessModel.ordinal/status/isReference,
// BusinessModuleVersion snapshots, ModuleInstance pins) lives on
// dedicated routes; the generic /api/v1/nodes/:label and /api/v1/edges
// routes REJECT any write targeting a lifecycle label or edge type with
// `409 model_lifecycle_route_required`. This is an ADDITIVE
// route-boundary rejection only — the graph-core storage primitives
// (createNode/patchNode/createEdge/…) are byte-for-byte unchanged (no
// `_baseline` contract change).
//
// Consequences: `DELETE /api/v1/nodes/BusinessModel/:id` can never
// bypass FR-05's reference protection (AC-03), and no `node:write`
// session can corrupt lifecycle state (FR-11 rationale).

import { ValidationError } from "../errors";

export const LIFECYCLE_LABELS: ReadonlySet<string> = new Set([
  "BusinessModel",
  "BusinessModule",
  "BusinessModuleVersion",
  "ModuleInstance",
]);

export const LIFECYCLE_EDGES: ReadonlySet<string> = new Set([
  "IN_MODEL",
  "HAS_VERSION",
  "INSTANTIATES",
  "INSTANCE_IN",
  "FORKED_FROM",
]);

export function assertNotLifecycleLabel(label: string): void {
  if (LIFECYCLE_LABELS.has(label)) {
    throw new ValidationError(
      "model_lifecycle_route_required",
      {
        label,
        hint: "lifecycle labels are written only by their dedicated /api/v1/models* and /api/v1/modules* routes",
      },
      409,
    );
  }
}

export function assertNotLifecycleEdge(type: string): void {
  if (LIFECYCLE_EDGES.has(type)) {
    throw new ValidationError(
      "model_lifecycle_route_required",
      {
        type,
        hint: "lifecycle edges are written only by their dedicated /api/v1/models* and /api/v1/modules* routes",
      },
      409,
    );
  }
}
