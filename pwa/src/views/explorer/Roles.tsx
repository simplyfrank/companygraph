import type { Route } from "../../route";
import { ViewHeader } from "../_shared";

// T-08 placeholder for Roles — entity-detail only (FR-06 — should-priority).
// Routed under `#/explorer/roles/:id` via route.entityId. Replaced by
// T-12 with the full per-role activity list grouped by parent journey.

export function ExplorerRoles({ route }: { route: Route }) {
  return (
    <>
      <ViewHeader
        title="Role detail"
        lede={
          route.entityId
            ? `T-08 stub — full role-centric activity list lands in T-12 (FR-06). Entity: ${route.entityId}.`
            : "Open a role from a journey or activity to see its bound activities."
        }
      />
    </>
  );
}
