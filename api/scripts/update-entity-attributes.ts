import { getDriver } from "../src/neo4j/driver";

const ENTITIES = [
  // 3.A - BC1 Product Catalogue
  { name: "Item", subdomain: "3.A", bounded_context: "BC1", entity_number: 1, status: "ACTIVE", oracle_table: "ITEM_MASTER" },
  { name: "Barcode", subdomain: "3.A", bounded_context: "BC1", entity_number: 2, status: "ACTIVE", oracle_table: "BARCODE" },
  { name: "Pack Item", subdomain: "3.A", bounded_context: "BC1", entity_number: 3, status: "ACTIVE", oracle_table: "PACK" },
  { name: "Differentiator", subdomain: "3.A", bounded_context: "BC1", entity_number: 4, status: "ACTIVE", oracle_table: "DIFFERENTIATOR" },
  { name: "Product Attributes", subdomain: "3.A", bounded_context: "BC1", entity_number: 5, status: "ACTIVE", oracle_table: "ITEM_ATTRIBUTE" },
  { name: "Product Media", subdomain: "3.A", bounded_context: "BC1", entity_number: 6, status: "ACTIVE", oracle_table: "ITEM_MEDIA" },
  { name: "Item-Supplier", subdomain: "3.A", bounded_context: "BC1", entity_number: 7, status: "ACTIVE", oracle_table: "ITEM_SUPPLIER" },
  { name: "Related Item", subdomain: "3.A", bounded_context: "BC1", entity_number: 8, status: "ACTIVE", oracle_table: "RELATED_ITEM" },
  { name: "Deposit Item", subdomain: "3.A", bounded_context: "BC1", entity_number: 9, status: "ACTIVE", oracle_table: "DEPOSIT_ITEM" },
  { name: "Transformable Item", subdomain: "3.A", bounded_context: "BC1", entity_number: 10, status: "ACTIVE", oracle_table: "TRANSFORMABLE_ITEM" },
  { name: "Transformable Component", subdomain: "3.A", bounded_context: "BC1", entity_number: 11, status: "ACTIVE", oracle_table: "TRANSFORMABLE_COMPONENT" },
  { name: "Item-Location (Ranging)", subdomain: "3.A", bounded_context: "BC1", entity_number: 12, status: "ACTIVE", oracle_table: "ITEM_LOC" },
  { name: "Virtual Warehouse", subdomain: "3.A", bounded_context: "BC1", entity_number: 13, status: "ACTIVE", oracle_table: "VIRTUAL_WAREHOUSE" },
  { name: "Regular Retail Price", subdomain: "3.A", bounded_context: "BC1", entity_number: 14, status: "ACTIVE", oracle_table: "ITEM_PRICE" },

  // 3.B - BC2 Merchandise Hierarchy
  { name: "Company", subdomain: "3.B", bounded_context: "BC2", entity_number: 15, status: "ACTIVE", oracle_table: "COMPANY" },
  { name: "Division", subdomain: "3.B", bounded_context: "BC2", entity_number: 16, status: "ACTIVE", oracle_table: "DIVISION" },
  { name: "Group (Department)", subdomain: "3.B", bounded_context: "BC2", entity_number: 17, status: "ACTIVE", oracle_table: "GROUP", note: "NOT USED by Lotus's" },
  { name: "Department (Section)", subdomain: "3.B", bounded_context: "BC2", entity_number: 18, status: "ACTIVE", oracle_table: "DEPARTMENT" },
  { name: "Class", subdomain: "3.B", bounded_context: "BC2", entity_number: 19, status: "ACTIVE", oracle_table: "CLASS" },
  { name: "Subclass", subdomain: "3.B", bounded_context: "BC2", entity_number: 20, status: "ACTIVE", oracle_table: "SUBCLASS" },
  { name: "Chain", subdomain: "3.B", bounded_context: "BC2", entity_number: 21, status: "ACTIVE", oracle_table: "CHAIN" },
  { name: "Area", subdomain: "3.B", bounded_context: "BC2", entity_number: 22, status: "ACTIVE", oracle_table: "AREA" },
  { name: "District", subdomain: "3.B", bounded_context: "BC2", entity_number: 23, status: "ACTIVE", oracle_table: "DISTRICT" },
  { name: "Store", subdomain: "3.B", bounded_context: "BC2", entity_number: 24, status: "ACTIVE", oracle_table: "STORE" },
  { name: "Warehouse", subdomain: "3.B", bounded_context: "BC2", entity_number: 25, status: "ACTIVE", oracle_table: "WAREHOUSE" },
  { name: "Location List", subdomain: "3.B", bounded_context: "BC2", entity_number: 26, status: "ACTIVE", oracle_table: "LOCATION_LIST" },
  { name: "Location Trait", subdomain: "3.B", bounded_context: "BC2", entity_number: 27, status: "ACTIVE", oracle_table: "LOCATION_TRAIT" },
  { name: "Transfer Entity", subdomain: "3.B", bounded_context: "BC2", entity_number: 28, status: "ACTIVE", oracle_table: "TRANSFER_ENTITY" },
  { name: "Fiscal Calendar", subdomain: "3.B", bounded_context: "BC2", entity_number: 30, status: "ACTIVE", oracle_table: "FISCAL_CALENDAR" },

  // 3.C - BC3 Supplier & Procurement (Supplier side)
  { name: "Supplier", subdomain: "3.C", bounded_context: "BC3", entity_number: 31, status: "ACTIVE", oracle_table: "SUPPLIER", note: "GLN field removed" },
  { name: "Supplier Site", subdomain: "3.C", bounded_context: "BC3", entity_number: 32, status: "ACTIVE", oracle_table: "SUPPLIER_SITE" },
  { name: "Supplier Parent", subdomain: "3.C", bounded_context: "BC3", entity_number: 33, status: "ACTIVE", oracle_table: "SUPPLIER_PARENT" },
  { name: "Expense Profile", subdomain: "3.C", bounded_context: "BC3", entity_number: 33, status: "ACTIVE", oracle_table: "EXPENSE_PROFILE", note: "SIMPLIFIED ONLY" },
  { name: "Partner", subdomain: "3.C", bounded_context: "BC3", entity_number: 36, status: "NOT MAINTAINED", oracle_table: "PARTNER", note: "CP Axtra operates all formats directly" },
  { name: "Cost Zone Group", subdomain: "3.C", bounded_context: "BC3", entity_number: 37, status: "NOT IN USE", oracle_table: "COST_ZONE_GROUP", note: "Single cost structure per supplier-item used instead" },
  { name: "Cost Zone", subdomain: "3.C", bounded_context: "BC3", entity_number: 38, status: "NOT IN USE", oracle_table: "COST_ZONE", note: "Single cost structure per supplier-item used instead" },

  // 3.D - BC3 Supplier & Procurement (Procurement side)
  { name: "Purchase Order", subdomain: "3.D", bounded_context: "BC3", entity_number: 39, status: "ACTIVE", oracle_table: "PO_HEADER" },
  { name: "PO Detail", subdomain: "3.D", bounded_context: "BC3", entity_number: 40, status: "ACTIVE", oracle_table: "PO_DETAIL" },
  { name: "Contract", subdomain: "3.D", bounded_context: "BC3", entity_number: 41, status: "ACTIVE", oracle_table: "CONTRACT" },
  { name: "Deal", subdomain: "3.D", bounded_context: "BC3", entity_number: 42, status: "PARTIAL", oracle_table: "DEAL", note: "VFP/VFM via Blue Yonder instead of RMS Deal module" },
  { name: "Deal Component", subdomain: "3.D", bounded_context: "BC3", entity_number: 43, status: "PARTIAL", oracle_table: "DEAL_COMPONENT", note: "VFP/VFM via Blue Yonder instead of RMS Deal module" },
  { name: "Bracket Cost", subdomain: "3.D", bounded_context: "BC3", entity_number: 44, status: "UNDER REVIEW", oracle_table: "BRACKET_COST", note: "As I know, it is not use. Please reconfirm with Fulfillment domain" },
  { name: "Cost Component", subdomain: "3.D", bounded_context: "BC3", entity_number: 45, status: "ACTIVE", oracle_table: "COST_COMPONENT" },
  { name: "Up-Charge", subdomain: "3.D", bounded_context: "BC3", entity_number: 46, status: "ACTIVE", oracle_table: "UP_CHARGE" },
  { name: "ELC (Estimated Landed Cost)", subdomain: "3.D", bounded_context: "BC3", entity_number: 47, status: "ACTIVE", oracle_table: "ELC" },
  { name: "RTV (Return to Vendor)", subdomain: "3.D", bounded_context: "BC3", entity_number: 48, status: "ACTIVE", oracle_table: "RTV" },

  // 3.E - BC4 Pricing & Markdown
  { name: "Regular Retail Price", subdomain: "3.E", bounded_context: "BC4", entity_number: 49, status: "ACTIVE", oracle_table: "ITEM_PRICE" },
  { name: "Price Zone Group", subdomain: "3.E", bounded_context: "BC4", entity_number: 50, status: "NOT IN USE", oracle_table: "PRICE_ZONE_GROUP", note: "Single-zone pricing model" },
  { name: "Price Zone", subdomain: "3.E", bounded_context: "BC4", entity_number: 51, status: "NOT IN USE", oracle_table: "PRICE_ZONE", note: "Single-zone pricing model" },
  { name: "Price Change", subdomain: "3.E", bounded_context: "BC4", entity_number: 52, status: "ACTIVE", oracle_table: "PRICE_CHANGE" },
  { name: "Clearance Markdown", subdomain: "3.E", bounded_context: "BC4", entity_number: 53, status: "ACTIVE", oracle_table: "CLEARANCE" },
  { name: "Future Retail", subdomain: "3.E", bounded_context: "BC4", entity_number: 54, status: "ACTIVE", oracle_table: "FUTURE_RETAIL" },
  { name: "Slab Price", subdomain: "3.E", bounded_context: "BC4", entity_number: 55, status: "ACTIVE", oracle_table: "SLAB_PRICE", note: "Multi-tier threshold = SLAB promotion" },
  { name: "Competitive Price", subdomain: "3.E", bounded_context: "BC4", entity_number: 56, status: "NOT IN USE", oracle_table: "COMPETITIVE_PRICE", note: "Separate analytics tool used" },
  { name: "Margin Target", subdomain: "3.E", bounded_context: "BC4", entity_number: 57, status: "UNDER REVIEW", oracle_table: "MARGIN_TARGET" },
  { name: "Tax Rule / VAT", subdomain: "3.E", bounded_context: "BC4", entity_number: 58, status: "ACTIVE", oracle_table: "TAX_RULE" },

  // 3.F - BC5 Promotion Management
  { name: "Promotion", subdomain: "3.F", bounded_context: "BC5", entity_number: 59, status: "ACTIVE", oracle_table: "PROMOTION" },
  { name: "Simple Discount Offer", subdomain: "3.F", bounded_context: "BC5", entity_number: 60, status: "ACTIVE", oracle_table: "PROMOTION_ITEM", note: "Lotus's: Percentage-off and amount-off NOT used, only fixed price" },
  { name: "Multi-Buy Offer", subdomain: "3.F", bounded_context: "BC5", entity_number: 61, status: "ACTIVE", oracle_table: "MULTI_BUY_OFFER" },
  { name: "Buy-Get-Free Offer", subdomain: "3.F", bounded_context: "BC5", entity_number: 62, status: "ACTIVE", oracle_table: "BUY_GET_FREE_OFFER" },
  { name: "Threshold Offer", subdomain: "3.F", bounded_context: "BC5", entity_number: 63, status: "ACTIVE", oracle_table: "THRESHOLD_OFFER" },
  { name: "Coupon", subdomain: "3.F", bounded_context: "BC5", entity_number: 64, status: "ACTIVE", oracle_table: "COUPON", note: "RPM coupon only; digital coupons = Customer domain" },
  { name: "Conflict Rule", subdomain: "3.F", bounded_context: "BC5", entity_number: 65, status: "ACTIVE", oracle_table: "CONFLICT_RULE", note: "Lotus's: Best Deal logic at POS, not in RPM" },
  { name: "VFP (Vendor-Funded Promotion)", subdomain: "3.F", bounded_context: "BC5", entity_number: 66, status: "ACTIVE", oracle_table: "VFP", note: "Makro only; Lotus's uses different mechanism" },
  { name: "VFM (Vendor-Funded Markdown)", subdomain: "3.F", bounded_context: "BC5", entity_number: 67, status: "ACTIVE", oracle_table: "VFM", note: "Makro only; Lotus's uses different mechanism" },

  // 3.G - BC6 Assortment & Range
  { name: "Assortment Plan", subdomain: "3.G", bounded_context: "BC6", entity_number: 68, status: "ACTIVE", oracle_table: "ASSORTMENT_PLAN" },
  { name: "Item-Location (Ranging)", subdomain: "3.G", bounded_context: "BC6", entity_number: 69, status: "ACTIVE", oracle_table: "ITEM_LOC" },
  { name: "Listing/Delisting", subdomain: "3.G", bounded_context: "BC6", entity_number: 70, status: "ACTIVE", oracle_table: "LISTING_DELISTING" },
  { name: "Planogram", subdomain: "3.G", bounded_context: "BC6", entity_number: 71, status: "ACTIVE", oracle_table: "PLANOGRAM", note: "Blue Yonder for VFP/VFM/Planogram" },
  { name: "Location Cluster", subdomain: "3.G", bounded_context: "BC6", entity_number: 72, status: "ACTIVE", oracle_table: "LOCATION_CLUSTER" },
  { name: "Season/Phase", subdomain: "3.G", bounded_context: "BC6", entity_number: 73, status: "ACTIVE", oracle_table: "SEASON_PHASE" },
  { name: "Item List", subdomain: "3.G", bounded_context: "BC6", entity_number: 74, status: "ACTIVE", oracle_table: "ITEM_LIST" },

  // 3.H - BC7 Allocation & Replenishment
  { name: "Allocation", subdomain: "3.H", bounded_context: "BC7", entity_number: 77, status: "ACTIVE", oracle_table: "ALLOCATION" },
  { name: "Allocation Detail", subdomain: "3.H", bounded_context: "BC7", entity_number: 78, status: "ACTIVE", oracle_table: "ALLOCATION_DETAIL" },
  { name: "Replenishment Parameters", subdomain: "3.H", bounded_context: "BC7", entity_number: 80, status: "ACTIVE", oracle_table: "REPLENISHMENT_PARAMS" },
  { name: "Recommended Order Qty (ROQ)", subdomain: "3.H", bounded_context: "BC7", entity_number: 81, status: "ACTIVE", oracle_table: "ROQ" },
  { name: "Open-to-Buy (OTB)", subdomain: "3.H", bounded_context: "BC7", entity_number: 85, status: "ACTIVE", oracle_table: "OTB" },

  // 3.J - BC8 Supplier Collaboration
  { name: "Supplier Communication Log", subdomain: "3.J", bounded_context: "BC8", entity_number: 91, status: "ACTIVE", oracle_table: "SUPPLIER_COMM_LOG" },
  { name: "Supplier Performance Scorecard", subdomain: "3.J", bounded_context: "BC8", entity_number: 92, status: "ACTIVE", oracle_table: "SUPPLIER_SCORECARD" },
  { name: "Supplier Registration Workflow", subdomain: "3.J", bounded_context: "BC8", entity_number: 93, status: "ACTIVE", oracle_table: "SUPPLIER_REGISTRATION" },
  { name: "Consignment Agreement", subdomain: "3.J", bounded_context: "BC8", entity_number: 94, status: "ACTIVE", oracle_table: "CONSIGNMENT_AGREEMENT" },
  { name: "Consignment Stock Position", subdomain: "3.J", bounded_context: "BC8", entity_number: 95, status: "ACTIVE", oracle_table: "CONSIGNMENT_STOCK" },
  { name: "Consignment Sales Report", subdomain: "3.J", bounded_context: "BC8", entity_number: 96, status: "ACTIVE", oracle_table: "CONSIGNMENT_SALES_REPORT" },
  { name: "Commercial Income Accrual", subdomain: "3.J", bounded_context: "BC8", entity_number: 97, status: "ACTIVE", oracle_table: "COMMERCIAL_INCOME_ACCRUAL" },
  { name: "Commercial Income Claim", subdomain: "3.J", bounded_context: "BC8", entity_number: 98, status: "ACTIVE", oracle_table: "COMMERCIAL_INCOME_CLAIM" },
  { name: "Weighted Average Cost Calculation", subdomain: "3.J", bounded_context: "BC8", entity_number: 99, status: "ACTIVE", oracle_table: "WAC_CALCULATION" },
  { name: "Shelf Capacity Profile", subdomain: "3.J", bounded_context: "BC8", entity_number: 100, status: "ACTIVE", oracle_table: "SHELF_CAPACITY_PROFILE" },
];

async function updateEntityAttributes() {
  const driver = getDriver();
  const session = driver.session();

  try {
    console.log(`Updating ${ENTITIES.length} entity attributes...`);

    for (const entity of ENTITIES) {
      const result = await session.run(`
        MATCH (e:Entity {name: $name})
        SET e.subdomain = $subdomain,
            e.bounded_context = $bounded_context,
            e.entity_number = $entity_number,
            e.status = $status,
            e.oracle_table = $oracle_table
        ${entity.note ? ', e.note = $note' : ''}
        RETURN e.name as name, e.subdomain as subdomain, e.bounded_context as bounded_context
      `, {
        name: entity.name,
        subdomain: entity.subdomain,
        bounded_context: entity.bounded_context,
        entity_number: entity.entity_number,
        status: entity.status,
        oracle_table: entity.oracle_table,
        ...(entity.note ? { note: entity.note } : {}),
      });

      const record = result.records[0];
      if (record) {
        console.log(`✓ Updated: ${record.get("name")} (${record.get("bounded_context")} / ${record.get("subdomain")})`);
      } else {
        console.log(`✗ Not found: ${entity.name}`);
      }
    }

    console.log("All entity attributes updated successfully!");
  } catch (error) {
    console.error("Error updating entity attributes:", error);
    process.exit(1);
  } finally {
    await session.close();
  }
}

updateEntityAttributes();
