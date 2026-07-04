import { getDriver } from "../src/neo4j/driver";
import { BOUNDED_CONTEXTS_SPEC } from "../src/ontology/bounded-contexts-spec";

async function updateBoundedContexts() {
  const driver = getDriver();
  const session = driver.session();

  try {
    const boundedContexts = BOUNDED_CONTEXTS_SPEC.boundedContexts;
    console.log(`Updating ${boundedContexts.length} bounded contexts...`);

    for (const bc of boundedContexts) {
      const result = await session.run(`
        MATCH (bc:BoundedContext {name: $name})
        SET bc.domain = $domain,
            bc.subdomain = $subdomain,
            bc.type = $type,
            bc.oracle_system = $oracle_system,
            bc.jira_projects = $jira_projects,
            bc.description = $description
        RETURN bc.name as name, bc.domain as domain, bc.subdomain as subdomain, bc.type as type
      `, {
        name: bc.name,
        domain: bc.domain,
        subdomain: bc.subdomain,
        type: bc.type,
        oracle_system: bc.oracle_system,
        jira_projects: bc.jira_projects,
        description: bc.description,
      });

      const record = result.records[0];
      if (record) {
        console.log(`✓ Updated: ${record.get("name")} (${record.get("domain")} / ${record.get("subdomain")} / ${record.get("type")})`);
      } else {
        console.log(`✗ Not found: ${bc.name}`);
      }
    }

    console.log("All bounded contexts updated successfully!");
  } catch (error) {
    console.error("Error updating bounded contexts:", error);
    process.exit(1);
  } finally {
    await session.close();
  }
}

updateBoundedContexts();
