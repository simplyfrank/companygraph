import { getDriver } from "./neo4j/driver";

const ENTITY_LABELS = [
  "Allocation",
  "Allocation Detail",
  "Area",
  "Assortment Plan",
  "Barcode",
  "Bracket Cost",
  "Buy-Get-Free Offer",
  "Chain",
  "Class",
  "Clearance Markdown",
  "Commercial Income Accrual",
  "Commercial Income Claim",
  "Company",
  "Competitive Price",
  "Conflict Rule",
  "Consignment Agreement",
  "Consignment Sales Report",
  "Consignment Stock Position",
  "Contract",
  "Cost Component",
  "Cost Zone",
  "Cost Zone Group",
  "Coupon",
  "Deal",
  "Deal Component",
  "Department (Section)",
  "Deposit Item",
  "Differentiator",
  "District",
  "Division",
  "ELC (Estimated Landed Cost)",
  "Expense Profile",
  "Fiscal Calendar",
  "Future Retail",
  "Group (Department)",
  "Item",
  "Item List",
  "Item-Location (Ranging)",
  "Item-Supplier",
  "Listing/Delisting",
  "Location Cluster",
  "Location List",
  "Location Trait",
  "Margin Target",
  "Multi-Buy Offer",
  "Open-to-Buy (OTB)",
  "PO Detail",
  "Pack Item",
  "Partner",
  "Planogram",
  "Price Change",
  "Price Zone",
  "Price Zone Group",
  "Product Attributes",
  "Product Media",
  "Promotion",
  "Purchase Order",
  "RTV (Return to Vendor)",
  "Recommended Order Qty (ROQ)",
  "Regular Retail Price",
  "Related Item",
  "Replenishment Parameters",
  "Season/Phase",
  "Shelf Capacity Profile",
  "Simple Discount Offer",
  "Slab Price",
  "Store",
  "Subclass",
  "Supplier",
  "Supplier Communication Log",
  "Supplier Parent",
  "Supplier Performance Scorecard",
  "Supplier Registration Workflow",
  "Supplier Site",
  "Tax Rule / VAT",
  "Threshold Offer",
  "Transfer Entity",
  "Transformable Component",
  "Transformable Item",
  "Up-Charge",
  "VFM (Vendor-Funded Markdown)",
  "VFP (Vendor-Funded Promotion)",
  "Virtual Warehouse",
  "Warehouse",
  "Weighted Average Cost Calculation",
];

async function createEntityLabels() {
  const driver = getDriver();
  const session = driver.session();

  try {
    console.log(`Creating ${ENTITY_LABELS.length} entity labels...`);

    for (const label of ENTITY_LABELS) {
      const result = await session.run(`
        MERGE (l:OntologyLabel {name: $name})
        SET l.description = $description,
            l.usage_example = $usage_example,
            l.json_schema_doc = $json_schema_doc,
            l.external_alignment = $external_alignment,
            l.deprecated_at = null,
            l.updated_at = datetime()
        RETURN l
      `, {
        name: label,
        description: `Commercial domain entity: ${label}`,
        usage_example: `POST /api/v1/nodes/${encodeURIComponent(label)}`,
        json_schema_doc: JSON.stringify({
          type: "object",
          required: ["bounded_context", "entity_number", "status"],
          properties: {
            bounded_context: { type: "string" },
            entity_number: { type: "integer" },
            status: { type: "string" },
            subdomain: { type: "string" },
            oracle_table: { type: "string" },
            note: { type: "string" },
          },
        }),
        external_alignment: JSON.stringify([
          { source: "Confluence", id: "Domain Entity Model" },
        ]),
      });

      console.log(`✓ Created label: ${label}`);
    }

    console.log("All entity labels created successfully!");
  } catch (error) {
    console.error("Error creating entity labels:", error);
    process.exit(1);
  } finally {
    await session.close();
  }
}

createEntityLabels();
