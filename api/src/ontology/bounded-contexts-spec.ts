/**
 * Bounded contexts specification for retail domain.
 * This file defines the bounded contexts, entities, and their relationships
 * for the retail product catalogue system.
 */

export const BOUNDED_CONTEXTS_SPEC = {
  boundedContexts: [
    {
      id: "01912345-6789-abcd-ef01-234567890abc",
      name: "BC1 Product Catalogue",
      description: "Core product catalogue management including items, barcodes, product attributes, and media",
      domain: "Product",
      subdomain: "Catalogue",
      type: "Core",
      oracle_system: "EBS",
      jira_projects: ["PROD"]
    },
    {
      id: "01912345-6789-abcd-ef01-234567890abd",
      name: "BC2 Merchandise Hierarchy",
      description: "Organizational hierarchy for merchandise including company, division, group, department, class, subclass, and physical locations",
      domain: "Merchandise",
      subdomain: "Hierarchy",
      type: "Core",
      oracle_system: "EBS",
      jira_projects: ["MERCH"]
    },
    {
      id: "01912345-6789-abcd-ef01-234567890abe",
      name: "BC3 Supplier & Procurement",
      description: "Supplier management, procurement, purchase orders, contracts, and cost management",
      domain: "Procurement",
      subdomain: "Supplier",
      type: "Core",
      oracle_system: "EBS",
      jira_projects: ["PROC"]
    },
    {
      id: "01912345-6789-abcd-ef01-234567890abf",
      name: "BC4 Pricing & Markdown",
      description: "Pricing strategy, price zones, price changes, clearance markdowns, and tax rules",
      domain: "Pricing",
      subdomain: "Pricing",
      type: "Core",
      oracle_system: "EBS",
      jira_projects: ["PRICE"]
    },
    {
      id: "01912345-6789-abcd-ef01-234567890ac0",
      name: "BC5 Promotion Management",
      description: "Promotion types including discounts, multi-buy, buy-get-free, threshold offers, coupons, and vendor-funded promotions",
      domain: "Marketing",
      subdomain: "Promotion",
      type: "Core",
      oracle_system: "EBS",
      jira_projects: ["PROMO"]
    },
    {
      id: "01912345-6789-abcd-ef01-234567890ac1",
      name: "BC6 Assortment & Range",
      description: "Assortment planning, item-location ranging, listing/delisting, planograms, and seasonal planning",
      domain: "Merchandising",
      subdomain: "Assortment",
      type: "Core",
      oracle_system: "EBS",
      jira_projects: ["ASSORT"]
    },
    {
      id: "01912345-6789-abcd-ef01-234567890ac2",
      name: "BC7 Allocation & Replenishment",
      description: "Allocation planning, replenishment parameters, recommended order quantities, and open-to-buy management",
      domain: "Supply Chain",
      subdomain: "Allocation",
      type: "Core",
      oracle_system: "EBS",
      jira_projects: ["ALLOC"]
    },
    {
      id: "01912345-6789-abcd-ef01-234567890ac3",
      name: "BC8 Supplier Collaboration",
      description: "Supplier communication, performance scorecards, registration workflows, consignment agreements, and commercial income",
      domain: "Procurement",
      subdomain: "Collaboration",
      type: "Supporting",
      oracle_system: "EBS",
      jira_projects: ["SUPP"]
    }
  ],
  entities: [
    {
      id: "01923456-7890-abcd-ef01-234567890abc",
      name: "Item",
      description: "Core product item entity representing sellable products",
      subdomain: "Catalogue",
      bounded_context: "BC1 Product Catalogue",
      entity_number: 1,
      status: "ACTIVE",
      oracle_table: "ITEMS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890abd",
      name: "Barcode",
      description: "Barcode associations for items",
      subdomain: "Catalogue",
      bounded_context: "BC1 Product Catalogue",
      entity_number: 2,
      status: "ACTIVE",
      oracle_table: "BARCODES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890abe",
      name: "Pack Item",
      description: "Packaged item configurations",
      subdomain: "Catalogue",
      bounded_context: "BC1 Product Catalogue",
      entity_number: 3,
      status: "ACTIVE",
      oracle_table: "PACK_ITEMS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890abf",
      name: "Differentiator",
      description: "Product differentiators and variants",
      subdomain: "Catalogue",
      bounded_context: "BC1 Product Catalogue",
      entity_number: 4,
      status: "ACTIVE",
      oracle_table: "DIFFERENTIATORS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ac0",
      name: "Product Attributes",
      description: "Product attribute definitions and values",
      subdomain: "Catalogue",
      bounded_context: "BC1 Product Catalogue",
      entity_number: 5,
      status: "ACTIVE",
      oracle_table: "PRODUCT_ATTRIBUTES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ac1",
      name: "Product Media",
      description: "Product images and media assets",
      subdomain: "Catalogue",
      bounded_context: "BC1 Product Catalogue",
      entity_number: 6,
      status: "ACTIVE",
      oracle_table: "PRODUCT_MEDIA"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ac2",
      name: "Item-Supplier",
      description: "Item to supplier relationships",
      subdomain: "Catalogue",
      bounded_context: "BC1 Product Catalogue",
      entity_number: 7,
      status: "ACTIVE",
      oracle_table: "ITEM_SUPPLIERS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ac3",
      name: "Related Item",
      description: "Related item associations and cross-sells",
      subdomain: "Catalogue",
      bounded_context: "BC1 Product Catalogue",
      entity_number: 8,
      status: "ACTIVE",
      oracle_table: "RELATED_ITEMS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ac4",
      name: "Deposit Item",
      description: "Deposit item configurations",
      subdomain: "Catalogue",
      bounded_context: "BC1 Product Catalogue",
      entity_number: 9,
      status: "ACTIVE",
      oracle_table: "DEPOSIT_ITEMS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ac5",
      name: "Transformable Item",
      description: "Transformable item definitions",
      subdomain: "Catalogue",
      bounded_context: "BC1 Product Catalogue",
      entity_number: 10,
      status: "ACTIVE",
      oracle_table: "TRANSFORMABLE_ITEMS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ac6",
      name: "Transformable Component",
      description: "Components for transformable items",
      subdomain: "Catalogue",
      bounded_context: "BC1 Product Catalogue",
      entity_number: 11,
      status: "ACTIVE",
      oracle_table: "TRANSFORMABLE_COMPONENTS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ac7",
      name: "Item-Location (Ranging)",
      description: "Item to location ranging relationships",
      subdomain: "Catalogue",
      bounded_context: "BC1 Product Catalogue",
      entity_number: 12,
      status: "ACTIVE",
      oracle_table: "ITEM_LOCATIONS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ac8",
      name: "Virtual Warehouse",
      description: "Virtual warehouse definitions",
      subdomain: "Catalogue",
      bounded_context: "BC1 Product Catalogue",
      entity_number: 13,
      status: "ACTIVE",
      oracle_table: "VIRTUAL_WAREHOUSES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ac9",
      name: "Regular Retail Price",
      description: "Regular retail pricing",
      subdomain: "Catalogue",
      bounded_context: "BC1 Product Catalogue",
      entity_number: 14,
      status: "ACTIVE",
      oracle_table: "REGULAR_RETAIL_PRICES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890aca",
      name: "Company",
      description: "Company entity in merchandise hierarchy",
      subdomain: "Hierarchy",
      bounded_context: "BC2 Merchandise Hierarchy",
      entity_number: 15,
      status: "ACTIVE",
      oracle_table: "COMPANIES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890acb",
      name: "Division",
      description: "Division in merchandise hierarchy",
      subdomain: "Hierarchy",
      bounded_context: "BC2 Merchandise Hierarchy",
      entity_number: 16,
      status: "ACTIVE",
      oracle_table: "DIVISIONS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890acc",
      name: "Group (Department)",
      description: "Group level in merchandise hierarchy",
      subdomain: "Hierarchy",
      bounded_context: "BC2 Merchandise Hierarchy",
      entity_number: 17,
      status: "ACTIVE",
      oracle_table: "GROUPS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890acd",
      name: "Department (Section)",
      description: "Department level in merchandise hierarchy",
      subdomain: "Hierarchy",
      bounded_context: "BC2 Merchandise Hierarchy",
      entity_number: 18,
      status: "ACTIVE",
      oracle_table: "DEPARTMENTS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ace",
      name: "Class",
      description: "Class level in merchandise hierarchy",
      subdomain: "Hierarchy",
      bounded_context: "BC2 Merchandise Hierarchy",
      entity_number: 19,
      status: "ACTIVE",
      oracle_table: "CLASSES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890acf",
      name: "Subclass",
      description: "Subclass level in merchandise hierarchy",
      subdomain: "Hierarchy",
      bounded_context: "BC2 Merchandise Hierarchy",
      entity_number: 20,
      status: "ACTIVE",
      oracle_table: "SUBCLASSES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ad0",
      name: "Chain",
      description: "Chain entity in merchandise hierarchy",
      subdomain: "Hierarchy",
      bounded_context: "BC2 Merchandise Hierarchy",
      entity_number: 21,
      status: "ACTIVE",
      oracle_table: "CHAINS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ad1",
      name: "Area",
      description: "Area in merchandise hierarchy",
      subdomain: "Hierarchy",
      bounded_context: "BC2 Merchandise Hierarchy",
      entity_number: 22,
      status: "ACTIVE",
      oracle_table: "AREAS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ad2",
      name: "District",
      description: "District in merchandise hierarchy",
      subdomain: "Hierarchy",
      bounded_context: "BC2 Merchandise Hierarchy",
      entity_number: 23,
      status: "ACTIVE",
      oracle_table: "DISTRICTS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ad3",
      name: "Store",
      description: "Store entity in merchandise hierarchy",
      subdomain: "Hierarchy",
      bounded_context: "BC2 Merchandise Hierarchy",
      entity_number: 24,
      status: "ACTIVE",
      oracle_table: "STORES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ad4",
      name: "Warehouse",
      description: "Warehouse entity in merchandise hierarchy",
      subdomain: "Hierarchy",
      bounded_context: "BC2 Merchandise Hierarchy",
      entity_number: 25,
      status: "ACTIVE",
      oracle_table: "WAREHOUSES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ad5",
      name: "Location List",
      description: "Location list definitions",
      subdomain: "Hierarchy",
      bounded_context: "BC2 Merchandise Hierarchy",
      entity_number: 26,
      status: "ACTIVE",
      oracle_table: "LOCATION_LISTS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ad6",
      name: "Location Trait",
      description: "Location traits and attributes",
      subdomain: "Hierarchy",
      bounded_context: "BC2 Merchandise Hierarchy",
      entity_number: 27,
      status: "ACTIVE",
      oracle_table: "LOCATION_TRAITS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ad7",
      name: "Transfer Entity",
      description: "Transfer entity definitions",
      subdomain: "Hierarchy",
      bounded_context: "BC2 Merchandise Hierarchy",
      entity_number: 28,
      status: "ACTIVE",
      oracle_table: "TRANSFER_ENTITIES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ad8",
      name: "Fiscal Calendar",
      description: "Fiscal calendar definitions",
      subdomain: "Hierarchy",
      bounded_context: "BC2 Merchandise Hierarchy",
      entity_number: 29,
      status: "ACTIVE",
      oracle_table: "FISCAL_CALENDARS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ad9",
      name: "Supplier",
      description: "Supplier entity",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 30,
      status: "ACTIVE",
      oracle_table: "SUPPLIERS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ada",
      name: "Supplier Site",
      description: "Supplier site locations",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 31,
      status: "ACTIVE",
      oracle_table: "SUPPLIER_SITES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890adb",
      name: "Supplier Parent",
      description: "Supplier parent relationships",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 32,
      status: "ACTIVE",
      oracle_table: "SUPPLIER_PARENTS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890adc",
      name: "Expense Profile",
      description: "Expense profile definitions",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 33,
      status: "ACTIVE",
      oracle_table: "EXPENSE_PROFILES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890add",
      name: "Partner",
      description: "Partner entity",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 34,
      status: "ACTIVE",
      oracle_table: "PARTNERS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ade",
      name: "Cost Zone Group",
      description: "Cost zone group definitions",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 35,
      status: "ACTIVE",
      oracle_table: "COST_ZONE_GROUPS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890adf",
      name: "Cost Zone",
      description: "Cost zone definitions",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 36,
      status: "ACTIVE",
      oracle_table: "COST_ZONES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ae0",
      name: "Purchase Order",
      description: "Purchase order entity",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 37,
      status: "ACTIVE",
      oracle_table: "PURCHASE_ORDERS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ae1",
      name: "PO Detail",
      description: "Purchase order detail lines",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 38,
      status: "ACTIVE",
      oracle_table: "PO_DETAILS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ae2",
      name: "Contract",
      description: "Contract entity",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 39,
      status: "ACTIVE",
      oracle_table: "CONTRACTS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ae3",
      name: "Deal",
      description: "Deal entity",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 40,
      status: "ACTIVE",
      oracle_table: "DEALS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ae4",
      name: "Deal Component",
      description: "Deal component definitions",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 41,
      status: "ACTIVE",
      oracle_table: "DEAL_COMPONENTS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ae5",
      name: "Bracket Cost",
      description: "Bracket cost definitions",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 42,
      status: "ACTIVE",
      oracle_table: "BRACKET_COSTS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ae6",
      name: "Cost Component",
      description: "Cost component definitions",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 43,
      status: "ACTIVE",
      oracle_table: "COST_COMPONENTS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ae7",
      name: "Up-Charge",
      description: "Up-charge definitions",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 44,
      status: "ACTIVE",
      oracle_table: "UP_CHARGES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ae8",
      name: "ELC (Estimated Landed Cost)",
      description: "Estimated landed cost calculations",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 45,
      status: "ACTIVE",
      oracle_table: "ELC"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890ae9",
      name: "RTV (Return to Vendor)",
      description: "Return to vendor process",
      subdomain: "Supplier",
      bounded_context: "BC3 Supplier & Procurement",
      entity_number: 46,
      status: "ACTIVE",
      oracle_table: "RTV"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890aea",
      name: "Price Zone Group",
      description: "Price zone group definitions",
      subdomain: "Pricing",
      bounded_context: "BC4 Pricing & Markdown",
      entity_number: 47,
      status: "ACTIVE",
      oracle_table: "PRICE_ZONE_GROUPS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890aeb",
      name: "Price Zone",
      description: "Price zone definitions",
      subdomain: "Pricing",
      bounded_context: "BC4 Pricing & Markdown",
      entity_number: 48,
      status: "ACTIVE",
      oracle_table: "PRICE_ZONES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890aec",
      name: "Price Change",
      description: "Price change events",
      subdomain: "Pricing",
      bounded_context: "BC4 Pricing & Markdown",
      entity_number: 49,
      status: "ACTIVE",
      oracle_table: "PRICE_CHANGES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890aed",
      name: "Clearance Markdown",
      description: "Clearance markdown events",
      subdomain: "Pricing",
      bounded_context: "BC4 Pricing & Markdown",
      entity_number: 50,
      status: "ACTIVE",
      oracle_table: "CLEARANCE_MARKDOWNS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890aee",
      name: "Future Retail",
      description: "Future retail pricing",
      subdomain: "Pricing",
      bounded_context: "BC4 Pricing & Markdown",
      entity_number: 51,
      status: "ACTIVE",
      oracle_table: "FUTURE_RETAIL"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890aef",
      name: "Slab Price",
      description: "Slab pricing definitions",
      subdomain: "Pricing",
      bounded_context: "BC4 Pricing & Markdown",
      entity_number: 52,
      status: "ACTIVE",
      oracle_table: "SLAB_PRICES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890af0",
      name: "Competitive Price",
      description: "Competitive price tracking",
      subdomain: "Pricing",
      bounded_context: "BC4 Pricing & Markdown",
      entity_number: 53,
      status: "ACTIVE",
      oracle_table: "COMPETITIVE_PRICES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890af1",
      name: "Margin Target",
      description: "Margin target definitions",
      subdomain: "Pricing",
      bounded_context: "BC4 Pricing & Markdown",
      entity_number: 54,
      status: "ACTIVE",
      oracle_table: "MARGIN_TARGETS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890af2",
      name: "Tax Rule / VAT",
      description: "Tax rule and VAT definitions",
      subdomain: "Pricing",
      bounded_context: "BC4 Pricing & Markdown",
      entity_number: 55,
      status: "ACTIVE",
      oracle_table: "TAX_RULES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890af3",
      name: "Promotion",
      description: "Promotion entity",
      subdomain: "Promotion",
      bounded_context: "BC5 Promotion Management",
      entity_number: 56,
      status: "ACTIVE",
      oracle_table: "PROMOTIONS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890af4",
      name: "Simple Discount Offer",
      description: "Simple discount offer type",
      subdomain: "Promotion",
      bounded_context: "BC5 Promotion Management",
      entity_number: 57,
      status: "ACTIVE",
      oracle_table: "SIMPLE_DISCOUNT_OFFERS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890af5",
      name: "Multi-Buy Offer",
      description: "Multi-buy offer type",
      subdomain: "Promotion",
      bounded_context: "BC5 Promotion Management",
      entity_number: 58,
      status: "ACTIVE",
      oracle_table: "MULTI_BUY_OFFERS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890af6",
      name: "Buy-Get-Free Offer",
      description: "Buy-get-free offer type",
      subdomain: "Promotion",
      bounded_context: "BC5 Promotion Management",
      entity_number: 59,
      status: "ACTIVE",
      oracle_table: "BUY_GET_FREE_OFFERS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890af7",
      name: "Threshold Offer",
      description: "Threshold offer type",
      subdomain: "Promotion",
      bounded_context: "BC5 Promotion Management",
      entity_number: 60,
      status: "ACTIVE",
      oracle_table: "THRESHOLD_OFFERS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890af8",
      name: "Coupon",
      description: "Coupon entity",
      subdomain: "Promotion",
      bounded_context: "BC5 Promotion Management",
      entity_number: 61,
      status: "ACTIVE",
      oracle_table: "COUPONS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890af9",
      name: "Conflict Rule",
      description: "Promotion conflict rules",
      subdomain: "Promotion",
      bounded_context: "BC5 Promotion Management",
      entity_number: 62,
      status: "ACTIVE",
      oracle_table: "CONFLICT_RULES"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890afa",
      name: "VFP (Vendor-Funded Promotion)",
      description: "Vendor-funded promotion",
      subdomain: "Promotion",
      bounded_context: "BC5 Promotion Management",
      entity_number: 63,
      status: "ACTIVE",
      oracle_table: "VFP"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890afb",
      name: "VFM (Vendor-Funded Markdown)",
      description: "Vendor-funded markdown",
      subdomain: "Promotion",
      bounded_context: "BC5 Promotion Management",
      entity_number: 64,
      status: "ACTIVE",
      oracle_table: "VFM"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890afc",
      name: "Assortment Plan",
      description: "Assortment plan entity",
      subdomain: "Assortment",
      bounded_context: "BC6 Assortment & Range",
      entity_number: 65,
      status: "ACTIVE",
      oracle_table: "ASSORTMENT_PLANS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890afd",
      name: "Listing/Delisting",
      description: "Listing and delisting processes",
      subdomain: "Assortment",
      bounded_context: "BC6 Assortment & Range",
      entity_number: 66,
      status: "ACTIVE",
      oracle_table: "LISTING_DELISTING"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890afe",
      name: "Planogram",
      description: "Planogram definitions",
      subdomain: "Assortment",
      bounded_context: "BC6 Assortment & Range",
      entity_number: 67,
      status: "ACTIVE",
      oracle_table: "PLANOGRAMS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890aff",
      name: "Location Cluster",
      description: "Location cluster definitions",
      subdomain: "Assortment",
      bounded_context: "BC6 Assortment & Range",
      entity_number: 68,
      status: "ACTIVE",
      oracle_table: "LOCATION_CLUSTERS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b00",
      name: "Season/Phase",
      description: "Season and phase definitions",
      subdomain: "Assortment",
      bounded_context: "BC6 Assortment & Range",
      entity_number: 69,
      status: "ACTIVE",
      oracle_table: "SEASONS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b01",
      name: "Item List",
      description: "Item list definitions",
      subdomain: "Assortment",
      bounded_context: "BC6 Assortment & Range",
      entity_number: 70,
      status: "ACTIVE",
      oracle_table: "ITEM_LISTS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b02",
      name: "Allocation",
      description: "Allocation entity",
      subdomain: "Allocation",
      bounded_context: "BC7 Allocation & Replenishment",
      entity_number: 71,
      status: "ACTIVE",
      oracle_table: "ALLOCATIONS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b03",
      name: "Allocation Detail",
      description: "Allocation detail lines",
      subdomain: "Allocation",
      bounded_context: "BC7 Allocation & Replenishment",
      entity_number: 72,
      status: "ACTIVE",
      oracle_table: "ALLOCATION_DETAILS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b04",
      name: "Replenishment Parameters",
      description: "Replenishment parameter definitions",
      subdomain: "Allocation",
      bounded_context: "BC7 Allocation & Replenishment",
      entity_number: 73,
      status: "ACTIVE",
      oracle_table: "REPLENISHMENT_PARAMETERS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b05",
      name: "Recommended Order Qty (ROQ)",
      description: "Recommended order quantity calculations",
      subdomain: "Allocation",
      bounded_context: "BC7 Allocation & Replenishment",
      entity_number: 74,
      status: "ACTIVE",
      oracle_table: "ROQ"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b06",
      name: "Open-to-Buy (OTB)",
      description: "Open-to-buy management",
      subdomain: "Allocation",
      bounded_context: "BC7 Allocation & Replenishment",
      entity_number: 75,
      status: "ACTIVE",
      oracle_table: "OTB"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b07",
      name: "Supplier Communication Log",
      description: "Supplier communication logs",
      subdomain: "Collaboration",
      bounded_context: "BC8 Supplier Collaboration",
      entity_number: 76,
      status: "ACTIVE",
      oracle_table: "SUPPLIER_COMMUNICATION_LOGS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b08",
      name: "Supplier Performance Scorecard",
      description: "Supplier performance scorecards",
      subdomain: "Collaboration",
      bounded_context: "BC8 Supplier Collaboration",
      entity_number: 77,
      status: "ACTIVE",
      oracle_table: "SUPPLIER_SCORECARDS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b09",
      name: "Supplier Registration Workflow",
      description: "Supplier registration workflows",
      subdomain: "Collaboration",
      bounded_context: "BC8 Supplier Collaboration",
      entity_number: 78,
      status: "ACTIVE",
      oracle_table: "SUPPLIER_REGISTRATION_WORKFLOWS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b0a",
      name: "Consignment Agreement",
      description: "Consignment agreements",
      subdomain: "Collaboration",
      bounded_context: "BC8 Supplier Collaboration",
      entity_number: 79,
      status: "ACTIVE",
      oracle_table: "CONSIGNMENT_AGREEMENTS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b0b",
      name: "Consignment Stock Position",
      description: "Consignment stock positions",
      subdomain: "Collaboration",
      bounded_context: "BC8 Supplier Collaboration",
      entity_number: 80,
      status: "ACTIVE",
      oracle_table: "CONSIGNMENT_STOCK_POSITIONS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b0c",
      name: "Consignment Sales Report",
      description: "Consignment sales reports",
      subdomain: "Collaboration",
      bounded_context: "BC8 Supplier Collaboration",
      entity_number: 81,
      status: "ACTIVE",
      oracle_table: "CONSIGNMENT_SALES_REPORTS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b0d",
      name: "Commercial Income Accrual",
      description: "Commercial income accruals",
      subdomain: "Collaboration",
      bounded_context: "BC8 Supplier Collaboration",
      entity_number: 82,
      status: "ACTIVE",
      oracle_table: "COMMERCIAL_INCOME_ACCRUALS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b0e",
      name: "Commercial Income Claim",
      description: "Commercial income claims",
      subdomain: "Collaboration",
      bounded_context: "BC8 Supplier Collaboration",
      entity_number: 83,
      status: "ACTIVE",
      oracle_table: "COMMERCIAL_INCOME_CLAIMS"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b0f",
      name: "Weighted Average Cost Calculation",
      description: "Weighted average cost calculations",
      subdomain: "Collaboration",
      bounded_context: "BC8 Supplier Collaboration",
      entity_number: 84,
      status: "ACTIVE",
      oracle_table: "WAC"
    },
    {
      id: "01923456-7890-abcd-ef01-234567890b10",
      name: "Shelf Capacity Profile",
      description: "Shelf capacity profiles",
      subdomain: "Collaboration",
      bounded_context: "BC8 Supplier Collaboration",
      entity_number: 85,
      status: "ACTIVE",
      oracle_table: "SHELF_CAPACITY_PROFILES"
    }
  ],
  boundedContextRelationships: [
    {
      from: "BC1 Product Catalogue",
      to: "BC3 Supplier & Procurement",
      type: "UPSTREAM_OF"
    },
    {
      from: "BC1 Product Catalogue",
      to: "BC4 Pricing & Markdown",
      type: "UPSTREAM_OF"
    },
    {
      from: "BC3 Supplier & Procurement",
      to: "BC1 Product Catalogue",
      type: "DOWNSTREAM_OF"
    },
    {
      from: "BC4 Pricing & Markdown",
      to: "BC1 Product Catalogue",
      type: "DOWNSTREAM_OF"
    },
    {
      from: "BC5 Promotion Management",
      to: "BC4 Pricing & Markdown",
      type: "UPSTREAM_OF"
    },
    {
      from: "BC6 Assortment & Range",
      to: "BC1 Product Catalogue",
      type: "UPSTREAM_OF"
    },
    {
      from: "BC7 Allocation & Replenishment",
      to: "BC3 Supplier & Procurement",
      type: "UPSTREAM_OF"
    },
    {
      from: "BC8 Supplier Collaboration",
      to: "BC3 Supplier & Procurement",
      type: "UPSTREAM_OF"
    }
  ],
  sharedDomains: [
    {
      id: "01934567-7890-abcd-ef01-234567890a01",
      name: "Shared Reference Data",
      description: "Reusable reference data components shared across all business models — common master data patterns, taxonomy, and base entities",
      bounded_contexts: ["BC2 Merchandise Hierarchy"],
      tags: ["reference-data", "master-data", "shared"]
    },
    {
      id: "01934567-7890-abcd-ef01-234567890a02",
      name: "Shared Workflow Components",
      description: "Reusable workflow components for procurement, allocation, and collaboration processes that can be instantiated across business models",
      bounded_contexts: ["BC3 Supplier & Procurement", "BC7 Allocation & Replenishment", "BC8 Supplier Collaboration"],
      tags: ["workflow", "process", "shared"]
    },
    {
      id: "01934567-7890-abcd-ef01-234567890a03",
      name: "Shared Pricing Engine",
      description: "Pricing and promotion components shared across business models — price zones, markdown rules, and promotion types",
      bounded_contexts: ["BC4 Pricing & Markdown", "BC5 Promotion Management"],
      tags: ["pricing", "promotion", "shared"]
    }
  ],
  namespaces: [
    {
      id: "01945678-7890-abcd-ef01-234567890b01",
      name: "Retail Operations",
      description: "Namespace for retail operations team — product catalogue, merchandise hierarchy, and assortment work",
      model_id: "01912345-6789-abcd-ef01-234567890abc",
      bounded_contexts: ["BC1 Product Catalogue", "BC2 Merchandise Hierarchy", "BC6 Assortment & Range"]
    },
    {
      id: "01945678-7890-abcd-ef01-234567890b02",
      name: "Procurement & Supply Chain",
      description: "Namespace for procurement and supply chain team — supplier management, allocation, and collaboration work",
      model_id: "01912345-6789-abcd-ef01-234567890abc",
      bounded_contexts: ["BC3 Supplier & Procurement", "BC7 Allocation & Replenishment", "BC8 Supplier Collaboration"]
    },
    {
      id: "01945678-7890-abcd-ef01-234567890b03",
      name: "Pricing & Promotions",
      description: "Namespace for pricing and promotions team — pricing strategy, markdown, and promotion management work",
      model_id: "01912345-6789-abcd-ef01-234567890abc",
      bounded_contexts: ["BC4 Pricing & Markdown", "BC5 Promotion Management"]
    }
  ]
} as const;
