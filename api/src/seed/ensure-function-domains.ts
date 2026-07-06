// saas-operator-foundation T-06 (design §3.2, §4.2 — FR-03, NFR-02, AC-03).
// Idempotent ensure of the six function Domain roots scoped IN_MODEL to the
// operator root.
//
// Rule A — the attach rides model-workspace-core's attachDomain (imported,
// NEVER edited). Rule B — attachDomain does no MERGE and server-generates the
// domain id, so a lookup-before-attach guard keyed on attributes.seedKey makes
// a re-run a net-zero no-op WITHOUT touching models.ts (OQ-4). The content
// specs' stable handle to a function domain is its seedKey, resolved by lookup
// — never a fixed id.

import type { Driver } from "neo4j-driver";
import { attachDomain } from "../storage/models";

interface FunctionDomain {
  name: string;
  seedKey: string;
  description: string;
}

export const FUNCTION_DOMAINS: FunctionDomain[] = [
  { name: "Marketing", seedKey: "marketing", description: "Marketing function." },
  { name: "Sales", seedKey: "sales", description: "Sales function." },
  { name: "Finance & Accounting", seedKey: "finance_accounting", description: "Finance & accounting function." },
  { name: "Customer Success", seedKey: "customer_success", description: "Customer-success function." },
  { name: "Product & Delivery", seedKey: "product_delivery", description: "Product & delivery function." },
  { name: "Platform Ops", seedKey: "platform_ops", description: "Platform-operations / SRE function." },
];

interface DomainProps {
  id: string;
  attributes_json: string;
}

// Returns seedKey → domainId so the loader can resolve the six ids at seed
// time (the ids are server-generated, discovered here — never hard-coded).
export async function ensureFunctionDomains(
  driver: Driver,
  operatorRootId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // 1. Read the operator root's existing IN_MODEL domains once; index by
  //    seedKey (filter in TS, mirroring deserializeModel; no APOC).
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id: $operatorRootId}) RETURN d`,
      { operatorRootId },
    );
    for (const rec of result.records) {
      const props = (rec.get("d") as { properties: DomainProps }).properties;
      let attrs: Record<string, unknown> = {};
      try {
        attrs = JSON.parse(props.attributes_json ?? "{}");
      } catch {
        attrs = {};
      }
      const key = attrs.seedKey;
      if (typeof key === "string") map.set(key, props.id);
    }
  } finally {
    await session.close();
  }

  // 2. Attach any missing function domain once (lookup-before-attach).
  for (const fn of FUNCTION_DOMAINS) {
    if (map.has(fn.seedKey)) continue; // idempotent path — reuse
    const domain = await attachDomain(driver, operatorRootId, {
      name: fn.name,
      description: fn.description,
      attributes: { seedKey: fn.seedKey },
    });
    map.set(fn.seedKey, domain.id);
  }

  return map;
}
