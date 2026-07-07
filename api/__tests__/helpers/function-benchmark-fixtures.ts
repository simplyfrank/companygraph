// function-benchmark-scoring T-08 — shared fixture helper. Seeds a
// self-contained SaaS-Operator subgraph directly via the driver (WRITE
// session, test-only) so the read + scorer can be exercised end-to-end
// against a deterministic graph. The feature code under test writes
// NOTHING; only these test fixtures write.
//
// The operator root is resolved by name:"SaaS Operator" +
// attributes.saasOperatorRoot:true. To keep the read deterministic, the
// fixture removes any pre-existing operator roots (e.g. from a prior
// `bun run seed:saas-operator`) before seeding its own, and removes its
// own subgraph on cleanup.

import type { Driver } from "neo4j-driver";

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `fbs-${prefix}-${Date.now()}-${counter}`;
}

export interface SeedActivity {
  key: string;
  roles?: number; // # EXECUTES roles
  systemKinds?: string[]; // one System per kind via USES_SYSTEM
  keyMarked?: boolean; // sets attributes.keyActivity
  alignedKpiKeys?: string[]; // KPI keys ALIGNED_TO this activity (coverage)
}

export interface SeedKpi {
  key: string;
  measures?: boolean; // create a MEASURES edge to a MetricDefinition
  benchmarkProse?: string;
  latestValue?: number | null;
  target_value?: number | null;
  target_direction?: string | null;
  warning_threshold?: number | null;
  critical_threshold?: number | null;
  domainScoped?: boolean; // set k.domain_id = function domain id (default true)
  alignedToDomain?: boolean; // ALIGNED_TO the domain instead of domain_id
}

export interface SeedFunction {
  seedKey: string;
  name: string;
  activities?: SeedActivity[];
  kpis?: SeedKpi[];
}

export interface SeedResult {
  rootId: string;
  domainIds: Record<string, string>; // seedKey → domain id
}

export async function seedBenchmarkGraph(
  driver: Driver,
  functions: SeedFunction[],
): Promise<SeedResult> {
  const session = driver.session({ defaultAccessMode: "WRITE" });
  try {
    // Remove any pre-existing operator roots + their scoped subgraph so the
    // marker resolves to OUR root only (deterministic read).
    await session.run(
      `MATCH (m:BusinessModel {name:"SaaS Operator"})
       WHERE m.attributes_json CONTAINS 'saasOperatorRoot'
       OPTIONAL MATCH (d:Domain)-[:IN_MODEL]->(m)
       OPTIONAL MATCH (d)<-[:PART_OF*0..]-(desc)
       DETACH DELETE m, d, desc`,
    );

    const rootId = uid("root");
    await session.run(
      `CREATE (m:BusinessModel {id:$rootId, name:"SaaS Operator",
        attributes_json:'{"saasOperatorRoot":true}', createdAt:"2026-01-01", updatedAt:"2026-01-01"})`,
      { rootId },
    );

    const domainIds: Record<string, string> = {};

    for (const fn of functions) {
      const domainId = uid(`dom-${fn.seedKey}`);
      domainIds[fn.seedKey] = domainId;
      await session.run(
        `MATCH (m:BusinessModel {id:$rootId})
         CREATE (d:Domain {id:$domainId, name:$name,
           attributes_json:$attrs, createdAt:"2026-01-01", updatedAt:"2026-01-01"})
         CREATE (d)-[:IN_MODEL]->(m)`,
        {
          rootId,
          domainId,
          name: fn.name,
          attrs: JSON.stringify({ seedKey: fn.seedKey }),
        },
      );

      // One UserJourney per function so activities are PART_OF a journey
      // PART_OF the domain (matches the real seed structure).
      const journeyId = uid(`jny-${fn.seedKey}`);
      await session.run(
        `MATCH (d:Domain {id:$domainId})
         CREATE (j:UserJourney {id:$journeyId, name:$name,
           attributes_json:'{}', createdAt:"2026-01-01", updatedAt:"2026-01-01"})
         CREATE (j)-[:PART_OF]->(d)`,
        { domainId, journeyId, name: `${fn.name} Journey` },
      );

      // KPIs first (so activities can ALIGN_TO them).
      const kpiIds: Record<string, string> = {};
      for (const kpi of fn.kpis ?? []) {
        const kpiId = uid(`kpi-${fn.seedKey}`);
        kpiIds[kpi.key] = kpiId;
        const domainScoped = kpi.domainScoped ?? !kpi.alignedToDomain;
        await session.run(
          `CREATE (k:KPI {id:$kpiId, name:$name, archived_at:null,
             domain_id:$domainId,
             target_value:$tv, target_direction:$td,
             warning_threshold:$wt, critical_threshold:$ct,
             attributes_json:'{}', createdAt:"2026-01-01", updatedAt:"2026-01-01"})`,
          {
            kpiId,
            name: `KPI ${kpi.key}`,
            domainId: domainScoped ? domainId : null,
            tv: kpi.target_value ?? null,
            td: kpi.target_direction ?? null,
            wt: kpi.warning_threshold ?? null,
            ct: kpi.critical_threshold ?? null,
          },
        );
        if (kpi.alignedToDomain) {
          await session.run(
            `MATCH (k:KPI {id:$kpiId}), (d:Domain {id:$domainId})
             CREATE (k)-[:ALIGNED_TO]->(d)`,
            { kpiId, domainId },
          );
        }
        if (kpi.measures) {
          const metricId = uid(`metric-${fn.seedKey}`);
          await session.run(
            `MATCH (k:KPI {id:$kpiId})
             CREATE (md:MetricDefinition {id:$metricId, name:$mname,
               attributes_json:$attrs, createdAt:"2026-01-01", updatedAt:"2026-01-01"})
             CREATE (k)-[:MEASURES]->(md)`,
            {
              kpiId,
              metricId,
              mname: `Metric ${kpi.key}`,
              attrs: JSON.stringify({ benchmark: kpi.benchmarkProse ?? "prose" }),
            },
          );
        }
        // Latest measurement.
        if (kpi.latestValue !== null && kpi.latestValue !== undefined) {
          await session.run(
            `CREATE (:KPIMeasurement {id:$id, kpi_id:$kpiId, value:$value,
               measured_at:"2026-06-01T00:00:00Z"})`,
            { id: uid("meas"), kpiId, value: kpi.latestValue },
          );
        }
      }

      // Activities.
      for (const a of fn.activities ?? []) {
        const activityId = uid(`act-${fn.seedKey}`);
        const attrs: Record<string, unknown> = {};
        if (a.keyMarked) {
          attrs.keyActivity = {
            markedAt: "2026-01-01T00:00:00Z",
            markedBy: "test",
            composite: 0.5,
            rank: 1,
            scores: { centrality: 0.5, criticalPath: 0.5, handoff: 0.5 },
          };
        }
        await session.run(
          `MATCH (j:UserJourney {id:$journeyId})
           CREATE (a:Activity {id:$activityId, name:$name,
             attributes_json:$attrs, createdAt:"2026-01-01", updatedAt:"2026-01-01"})
           CREATE (a)-[:PART_OF]->(j)`,
          { journeyId, activityId, name: `Act ${a.key}`, attrs: JSON.stringify(attrs) },
        );
        for (let i = 0; i < (a.roles ?? 0); i++) {
          const roleId = uid(`role-${fn.seedKey}`);
          await session.run(
            `MATCH (a:Activity {id:$activityId})
             CREATE (r:Role {id:$roleId, name:$name, attributes_json:'{}',
               createdAt:"2026-01-01", updatedAt:"2026-01-01"})
             CREATE (r)-[:EXECUTES]->(a)`,
            { activityId, roleId, name: `Role ${a.key}-${i}` },
          );
        }
        for (const kind of a.systemKinds ?? []) {
          const systemId = uid(`sys-${fn.seedKey}`);
          await session.run(
            `MATCH (a:Activity {id:$activityId})
             CREATE (s:System {id:$systemId, name:$name, attributes_json:$attrs,
               createdAt:"2026-01-01", updatedAt:"2026-01-01"})
             CREATE (a)-[:USES_SYSTEM]->(s)`,
            {
              activityId,
              systemId,
              name: `Sys ${a.key}-${kind}`,
              attrs: JSON.stringify({ systemKind: kind }),
            },
          );
        }
        for (const kpiKey of a.alignedKpiKeys ?? []) {
          const kpiId = kpiIds[kpiKey];
          if (!kpiId) continue;
          await session.run(
            `MATCH (k:KPI {id:$kpiId}), (a:Activity {id:$activityId})
             CREATE (k)-[:ALIGNED_TO]->(a)`,
            { kpiId, activityId },
          );
        }
      }
    }

    return { rootId, domainIds };
  } finally {
    await session.close();
  }
}

export async function cleanupBenchmarkGraph(driver: Driver): Promise<void> {
  const session = driver.session({ defaultAccessMode: "WRITE" });
  try {
    await session.run(
      `MATCH (m:BusinessModel {name:"SaaS Operator"})
       WHERE m.attributes_json CONTAINS 'saasOperatorRoot'
       OPTIONAL MATCH (d:Domain)-[:IN_MODEL]->(m)
       OPTIONAL MATCH (d)<-[:PART_OF*0..]-(desc)
       DETACH DELETE m, d, desc`,
    );
    // Orphaned KPIs/metrics/measurements created by the fixture.
    await session.run(
      `MATCH (n) WHERE n.id STARTS WITH 'fbs-' DETACH DELETE n`,
    );
    await session.run(
      `MATCH (m:KPIMeasurement) WHERE m.id STARTS WITH 'fbs-' DETACH DELETE m`,
    );
  } finally {
    await session.close();
  }
}
