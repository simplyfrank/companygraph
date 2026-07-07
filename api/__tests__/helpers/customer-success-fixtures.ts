// customer-success-process-model — shared precondition-seed helper for the
// integration test files (mirrors helpers/platform-ops-fixtures.ts).
//
// The integration suite runs 100+ files against ONE shared Neo4j + API server.
// The foundation `seedSaasOperator` persona idempotency guard THROWS if a
// sibling spec's test left a same-named Persona without the operator marker —
// cross-spec test pollution, NOT a defect in this spec's content seed. So the
// two precondition seeds are best-effort; this spec's own content seed
// (`seedCustomerSuccess`, which does its own handle resolution and fails loudly
// on a genuinely-absent precondition) is always run and never tolerated.

import { seedSaasOperator } from "../../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../../scripts/seed-saas-metric-library";
import { seedCustomerSuccess } from "../../scripts/seed-customer-success";

// Re-exported so the idempotency test can trigger a second content-seed run
// in-test without re-importing the foundation scaffold seeds.
export { seedCustomerSuccess };

export async function seedCustomerSuccessPreconditions(base: string): Promise<void> {
  try {
    await seedSaasOperator(base);
  } catch {
    // tolerated — operator root/domain/systems already present; the content
    // seed's resolveHandles fails loudly if they are genuinely absent.
  }
  try {
    await seedSaasMetricLibrary(base);
  } catch {
    // tolerated — the metric roster is already present (idempotent).
  }
  // This spec's own content seed — a failure here is a real defect.
  await seedCustomerSuccess(base);
}
