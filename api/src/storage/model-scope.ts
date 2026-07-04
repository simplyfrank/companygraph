// model-workspace-core T-04 (design §4.2) — server-side model-scope
// resolution (FR-18, NFR-03a, AC-21 part 1).
//
// A model's STRUCTURAL node set is: the Domains linked IN_MODEL to the
// model, plus their transitive PART_OF descendants (journeys,
// activities — forked module subtrees included, because a fork attaches
// its journey PART_OF the instance's targetDomainId), plus the model's
// ModuleInstance pins. Shared reference nodes (System/Role/Location)
// are NOT model-scoped (DEC-01 option (a)) and are excluded from the
// set but reachable by any model's reads.
//
// N-04: for a NON-forked instance the pinned journey content is not a
// set of live nodes — content readers resolve it from the version's
// snapshot_json (storage/modules.ts listInstances), never expecting
// Activity nodes here.
//
// D-1 (pinned): NO `?model=<id>` query parameter exists anywhere in
// this spec — scope always resolves from a `:modelId` PATH param.

import type { Driver } from "neo4j-driver";

export async function scopedNodeIds(
  driver: Driver,
  modelId: string,
): Promise<Set<string>> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (m:BusinessModel {id: $modelId})
       OPTIONAL MATCH (d:Domain)-[:IN_MODEL]->(m)
       OPTIONAL MATCH (d)<-[:PART_OF*0..]-(desc)
       OPTIONAL MATCH (mi:ModuleInstance)-[:INSTANCE_IN]->(m)
       RETURN collect(DISTINCT d.id) + collect(DISTINCT desc.id) + collect(DISTINCT mi.id) AS ids`,
      { modelId },
    );
    const ids = new Set<string>();
    const rec = result.records[0];
    if (rec) {
      for (const id of rec.get("ids") as Array<string | null>) {
        if (typeof id === "string") ids.add(id);
      }
    }
    return ids;
  } finally {
    await session.close();
  }
}

// WHERE-fragment builder for handlers that filter a larger query with a
// pre-resolved scope set. Usage:
//   const scope = await scopedNodeIds(driver, modelId);
//   const { fragment, params } = scopedWhereFragment("n", scope);
//   tx.run(`MATCH (n) WHERE ${fragment} ...`, { ...params });
export function scopedWhereFragment(
  alias: string,
  scope: ReadonlySet<string>,
): { fragment: string; params: Record<string, unknown> } {
  return {
    fragment: `(${alias}.id IN $__scopeIds)`,
    params: { __scopeIds: Array.from(scope) },
  };
}
