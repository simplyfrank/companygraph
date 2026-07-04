import { getDriver } from "../src/neo4j/driver";

const BC_RELATIONSHIPS = [
  // BC1 Product Catalogue
  { from: "BC1 Product Catalogue", to: "BC4 Pricing & Markdown", type: "UPSTREAM_OF" },
  { from: "BC1 Product Catalogue", to: "BC5 Promotion Management", type: "UPSTREAM_OF" },
  { from: "BC1 Product Catalogue", to: "BC6 Assortment & Range", type: "UPSTREAM_OF" },
  
  // BC2 Merchandise Hierarchy - reference data provider for all
  { from: "BC2 Merchandise Hierarchy", to: "BC1 Product Catalogue", type: "UPSTREAM_OF" },
  { from: "BC2 Merchandise Hierarchy", to: "BC3 Supplier & Procurement", type: "UPSTREAM_OF" },
  { from: "BC2 Merchandise Hierarchy", to: "BC4 Pricing & Markdown", type: "UPSTREAM_OF" },
  { from: "BC2 Merchandise Hierarchy", to: "BC5 Promotion Management", type: "UPSTREAM_OF" },
  { from: "BC2 Merchandise Hierarchy", to: "BC6 Assortment & Range", type: "UPSTREAM_OF" },
  { from: "BC2 Merchandise Hierarchy", to: "BC7 Allocation & Replenishment", type: "UPSTREAM_OF" },
  { from: "BC2 Merchandise Hierarchy", to: "BC8 Supplier Collaboration", type: "UPSTREAM_OF" },
  
  // BC3 Supplier & Procurement
  { from: "BC3 Supplier & Procurement", to: "BC1 Product Catalogue", type: "UPSTREAM_OF" },
  { from: "BC3 Supplier & Procurement", to: "BC4 Pricing & Markdown", type: "UPSTREAM_OF" },
  
  // BC4 Pricing & Markdown
  { from: "BC4 Pricing & Markdown", to: "BC5 Promotion Management", type: "UPSTREAM_OF" },
  { from: "BC4 Pricing & Markdown", to: "BC6 Assortment & Range", type: "UPSTREAM_OF" },
  
  // BC5 Promotion Management
  // No downstream within Commercial domain (goes to POS/E-Commerce)
  
  // BC6 Assortment & Range
  { from: "BC6 Assortment & Range", to: "BC7 Allocation & Replenishment", type: "UPSTREAM_OF" },
  
  // BC7 Allocation & Replenishment
  // No downstream within Commercial domain (goes to FD1 Supply Chain)
  
  // BC8 Supplier Collaboration
  // Cross-domain dependencies with FD1 Supply Chain and FD Finance (not in Commercial domain)
];

async function createBCRelationships() {
  const driver = getDriver();
  const session = driver.session();

  try {
    console.log(`Creating ${BC_RELATIONSHIPS.length} bounded context relationships...`);

    // First, delete existing relationships
    await session.run(`
      MATCH (bc:BoundedContext)-[r:UPSTREAM_OF|DOWNSTREAM_OF]->(other:BoundedContext)
      DELETE r
    `);
    console.log("✓ Deleted existing relationships");

    // Create new relationships
    for (const rel of BC_RELATIONSHIPS) {
      const result = await session.run(`
        MATCH (from:BoundedContext {name: $from})
        MATCH (to:BoundedContext {name: $to})
        CREATE (from)-[r:${rel.type}]->(to)
        RETURN from.name as from_name, type(r) as rel_type, to.name as to_name
      `, {
        from: rel.from,
        to: rel.to,
      });

      const record = result.records[0];
      if (record) {
        console.log(`✓ Created: ${record.get("from_name")} ${record.get("rel_type")} ${record.get("to_name")}`);
      } else {
        console.log(`✗ Failed: ${rel.from} ${rel.type} ${rel.to} (nodes not found)`);
      }
    }

    console.log("All bounded context relationships created successfully!");
  } catch (error) {
    console.error("Error creating bounded context relationships:", error);
    process.exit(1);
  } finally {
    await session.close();
  }
}

createBCRelationships();
