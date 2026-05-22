import { getDriver, closeDriver } from "../src/neo4j/driver";
import { applySchema } from "../src/neo4j/bootstrap";

async function main(): Promise<void> {
  await applySchema(getDriver());
  console.log("schema applied");
  await closeDriver();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
