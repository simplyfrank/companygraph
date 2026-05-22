import type { Route } from "../../route";
import { ViewHeader } from "../_shared";

// T-08 placeholder for Locations — entity-detail only (FR-07 — should-priority).
// Routed under `#/explorer/locations/:id` via route.entityId. Replaced
// by T-12 with the full per-location activity list + PART_OF hierarchy
// breadcrumb.

export function ExplorerLocations({ route }: { route: Route }) {
  return (
    <>
      <ViewHeader
        title="Location detail"
        lede={
          route.entityId
            ? `T-08 stub — full location-centric view lands in T-12 (FR-07). Entity: ${route.entityId}.`
            : "Open a location from an activity to see its bound activities."
        }
      />
    </>
  );
}
