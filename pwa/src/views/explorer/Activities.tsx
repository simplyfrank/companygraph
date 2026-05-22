import type { Route } from "../../route";
import { ViewHeader } from "../_shared";

// T-08 placeholder for Activities — entity-detail (FR-04) + multi-filter
// list (FR-09). Replaced by T-11 with the full implementation. The
// dispatcher routes `#/explorer/activities` here (list mode) and
// `#/explorer/activities/:id` (detail mode, via `route.entityId`).

export function ExplorerActivities({ route }: { route: Route }) {
  return (
    <>
      <ViewHeader
        title={route.entityId ? "Activity detail" : "Activities"}
        lede={
          route.entityId
            ? `T-08 stub — entity detail for ${route.entityId} lands in T-11 (FR-04).`
            : "T-08 stub — activity filter list lands in T-11 (FR-09)."
        }
      />
    </>
  );
}
