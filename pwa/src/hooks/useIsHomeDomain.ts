// T-15: useIsHomeDomain hook (FR-21 / AC-17)
//
// Returns true if the given entity is within the operator's home domain.
// Uses PART_OF*1..8 to walk up the hierarchy to find the Domain ancestor.
// Returns true if no home domain is set (default: all writes enabled).

import type { NodeLabel } from "@companygraph/shared/schema/nodes";
import { usePrefStore } from "../store/prefStore";
import { useFetch } from "../useFetch";
import { cypherDedup } from "../data/reads";
import { homeDomainResolution } from "../data/cypher-queries";

interface DomainRow { domainId: string }

export function useIsHomeDomain(entity: { id: string; label: NodeLabel }): boolean {
  const home = usePrefStore().homeDomainId;

  // When home is null, return a no-op promise that resolves immediately
  // so we don't fire a network request. useFetch must be called
  // unconditionally (rules of hooks).
  const data = useFetch(
    () => home
      ? cypherDedup<DomainRow>(homeDomainResolution, { id: entity.id }, { ttlMs: 30 * 60 * 1000 })
      : Promise.resolve({ rows: [] as DomainRow[] }),
    [home, entity.id],
  );

  if (!home) return true; // no home set → allow everything (default)
  if (data.status !== "ok") return true; // still loading → default allow
  const rows = data.data.rows;
  if (!rows || rows.length === 0) return true;
  return rows[0].domainId === home;
}