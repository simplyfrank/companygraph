// platform-ops-process-model — shared precondition-seed helper for the
// integration test files.
//
// Why the resilience exists (mirrors helpers/capability-fixtures.ts +
// story-fixtures.ts): the integration suite runs 100+ files against ONE shared
// Neo4j + API server. The foundation `seedSaasOperator` includes a persona
// idempotency guard that THROWS if a sibling spec's test left a same-named
// Persona without the operator marker in the shared graph (cross-spec test
// pollution). That precondition failure is NOT a defect in this spec's content
// seed — `seedPlatformOps` does its own handle resolution and fails loudly if a
// genuinely-required precondition (operator root / platform_ops domain / metric
// roster) is absent. So the two precondition seeds are best-effort here: run
// them to cold-start a fresh DB, tolerate a throw when the environment is
// already seeded, then always run this spec's own content seed.

import { seedSaasOperator } from "../../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../../scripts/seed-saas-metric-library";
import { seedPlatformOps } from "../../scripts/seed-platform-ops-content";

// Re-exported so idempotency/risks/slas tests can trigger a second content-seed
// run in-test (the "re-run is net-zero" assertions) without re-importing the
// foundation scaffold seeds.
export { seedPlatformOps };

export async function seedPlatformOpsPreconditions(base: string): Promise<void> {
  // Best-effort scaffold + metric roster (a shared, already-seeded stack may
  // throw on the foundation persona guard — see the header note).
  try {
    await seedSaasOperator(base);
  } catch {
    // tolerated — the operator root/domain/systems are already present; the
    // content seed's resolveHandles fails loudly if they are genuinely absent.
  }
  try {
    await seedSaasMetricLibrary(base);
  } catch {
    // tolerated — the metric roster is already present (idempotent).
  }
  // This spec's own content seed — NOT tolerated: a failure here is a real
  // defect in this spec's deliverable.
  await seedPlatformOps(base);
}
