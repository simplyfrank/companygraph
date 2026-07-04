// system-augmentation-model T-05 — standalone runner for the systemKind
// migration (FR-07 / AC-08b). Same house pattern as `schema-apply.ts`:
// Bun loads .env, `getDriver()` builds the driver from it.
//
//   bun run migrate:system-kind        (root package.json)
//   bun --cwd api run scripts/migrate-system-kind.ts

import { getDriver, closeDriver } from "../src/neo4j/driver";
import { runSystemKindMigration } from "../src/ontology/system-kind-migration";

async function main(): Promise<void> {
  const result = await runSystemKindMigration(getDriver());
  console.log(JSON.stringify(result));
  await closeDriver();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
