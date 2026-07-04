/**
 * Target/Reference Layout
 * 
 * Manually optimized layout representing the ideal organization.
 * This serves as the gold standard for measuring algorithm performance.
 */

export interface TargetLayout {
  positions: Record<string, { x: number; y: number }>;
  boundedContexts: Array<{
    name: string;
    entities: string[];
    position: { x: number; y: number };
  }>;
}

/**
 * Manually optimized target layout
 * 
 * This represents the ideal organization based on:
 * - Logical grouping by bounded context
 * - Spatial separation between contexts
 * - Minimized cross-context edge lengths
 * - Clear visual hierarchy
 */
export const TARGET_LAYOUT: TargetLayout = {
  positions: {
    // BC1 Product Catalogue - Top Left
    "Item": { x: 40, y: 40 },
    "Barcode": { x: 220, y: 40 },
    "Pack_Item": { x: 40, y: 200 },
    "Differentiator": { x: 220, y: 200 },
    "Product_Attributes": { x: 40, y: 360 },
    "Product_Media": { x: 220, y: 360 },
    "Item_Supplier": { x: 40, y: 520 },
    "Related_Item": { x: 220, y: 520 },
    "Deposit_Item": { x: 40, y: 680 },
    "Transformable_Item": { x: 220, y: 680 },
    "Transformable_Component": { x: 40, y: 840 },
    "Item_Location_Ranging": { x: 220, y: 840 },
    "Virtual_Warehouse": { x: 40, y: 1000 },
    "Regular_Retail_Price": { x: 220, y: 1000 },

    // BC2 Merchandise Hierarchy - Top Center
    "Company": { x: 600, y: 40 },
    "Division": { x: 780, y: 40 },
    "Group": { x: 600, y: 200 },
    "Department": { x: 780, y: 200 },
    "Class": { x: 600, y: 360 },
    "Subclass": { x: 780, y: 360 },
    "Chain": { x: 600, y: 520 },
    "Area": { x: 780, y: 520 },
    "District": { x: 600, y: 680 },
    "Store": { x: 780, y: 680 },
    "Warehouse": { x: 600, y: 840 },
    "Location_List": { x: 780, y: 840 },
    "Location_Trait": { x: 600, y: 1000 },
    "Transfer_Entity": { x: 780, y: 1000 },
    "Fiscal_Calendar": { x: 600, y: 1160 },

    // BC3 Supplier & Procurement - Top Right
    "Supplier": { x: 1160, y: 40 },
    "Supplier_Site": { x: 1340, y: 40 },
    "Supplier_Parent": { x: 1160, y: 200 },
    "Expense_Profile": { x: 1340, y: 200 },
    "Partner": { x: 1160, y: 360 },
    "Cost_Zone_Group": { x: 1340, y: 360 },
    "Cost_Zone": { x: 1160, y: 520 },
    "Purchase_Order": { x: 1340, y: 520 },
    "PO_Detail": { x: 1160, y: 680 },
    "Contract": { x: 1340, y: 680 },
    "Deal": { x: 1160, y: 840 },
    "Deal_Component": { x: 1340, y: 840 },
    "Bracket_Cost": { x: 1160, y: 1000 },
    "Cost_Component": { x: 1340, y: 1000 },
    "Up_Charge": { x: 1160, y: 1160 },
    "ELC": { x: 1340, y: 1160 },
    "RTV": { x: 1160, y: 1320 },

    // BC4 Pricing & Markdown - Middle Left
    "Price_Zone_Group": { x: 40, y: 1320 },
    "Price_Zone": { x: 220, y: 1320 },
    "Price_Change": { x: 40, y: 1480 },
    "Clearance_Markdown": { x: 220, y: 1480 },
    "Future_Retail": { x: 40, y: 1640 },
    "Slab_Price": { x: 220, y: 1640 },
    "Competitive_Price": { x: 40, y: 1800 },
    "Margin_Target": { x: 220, y: 1800 },
    "Tax_Rule_VAT": { x: 40, y: 1960 },

    // BC5 Promotion Management - Middle Center
    "Promotion": { x: 600, y: 1320 },
    "Simple_Discount_Offer": { x: 780, y: 1320 },
    "Multi_Buy_Offer": { x: 600, y: 1480 },
    "Buy_Get_Free_Offer": { x: 780, y: 1480 },
    "Threshold_Offer": { x: 600, y: 1640 },
    "Coupon": { x: 780, y: 1640 },
    "Conflict_Rule": { x: 600, y: 1800 },
    "VFP": { x: 780, y: 1800 },
    "VFM": { x: 600, y: 1960 },

    // BC6 Assortment & Range - Middle Right
    "Assortment_Plan": { x: 1160, y: 1480 },
    "Listing_Delisting": { x: 1340, y: 1480 },
    "Planogram": { x: 1160, y: 1640 },
    "Location_Cluster": { x: 1340, y: 1640 },
    "Season_Phase": { x: 1160, y: 1800 },
    "Item_List": { x: 1340, y: 1800 },

    // BC7 Allocation & Replenishment - Bottom Left
    "Allocation": { x: 40, y: 2120 },
    "Allocation_Detail": { x: 220, y: 2120 },
    "Replenishment_Parameters": { x: 40, y: 2280 },
    "Recommended_Order_Qty_ROQ": { x: 220, y: 2280 },
    "Open_to_Buy_OTB": { x: 40, y: 2440 },

    // BC8 Supplier Collaboration - Bottom Center
    "Supplier_Communication_Log": { x: 600, y: 2120 },
    "Supplier_Performance_Scorecard": { x: 780, y: 2120 },
    "Supplier_Registration_Workflow": { x: 600, y: 2280 },
    "Consignment_Agreement": { x: 780, y: 2280 },
    "Consignment_Stock_Position": { x: 600, y: 2440 },
    "Consignment_Sales_Report": { x: 780, y: 2440 },
    "Commercial_Income_Accrual": { x: 600, y: 2600 },
    "Commercial_Income_Claim": { x: 780, y: 2600 },
    "Weighted_Average_Cost_Calculation": { x: 600, y: 2760 },
    "Shelf_Capacity_Profile": { x: 780, y: 2760 },
  },
  boundedContexts: [
    {
      name: "BC1 Product Catalogue",
      entities: ["Item", "Barcode", "Pack_Item", "Differentiator", "Product_Attributes", "Product_Media", "Item_Supplier", "Related_Item", "Deposit_Item", "Transformable_Item", "Transformable_Component", "Item_Location_Ranging", "Virtual_Warehouse", "Regular_Retail_Price"],
      position: { x: 40, y: 40 },
    },
    {
      name: "BC2 Merchandise Hierarchy",
      entities: ["Company", "Division", "Group", "Department", "Class", "Subclass", "Chain", "Area", "District", "Store", "Warehouse", "Location_List", "Location_Trait", "Transfer_Entity", "Fiscal_Calendar"],
      position: { x: 600, y: 40 },
    },
    {
      name: "BC3 Supplier & Procurement",
      entities: ["Supplier", "Supplier_Site", "Supplier_Parent", "Expense_Profile", "Partner", "Cost_Zone_Group", "Cost_Zone", "Purchase_Order", "PO_Detail", "Contract", "Deal", "Deal_Component", "Bracket_Cost", "Cost_Component", "Up_Charge", "ELC", "RTV"],
      position: { x: 1160, y: 40 },
    },
    {
      name: "BC4 Pricing & Markdown",
      entities: ["Price_Zone_Group", "Price_Zone", "Price_Change", "Clearance_Markdown", "Future_Retail", "Slab_Price", "Competitive_Price", "Margin_Target", "Tax_Rule_VAT"],
      position: { x: 40, y: 1320 },
    },
    {
      name: "BC5 Promotion Management",
      entities: ["Promotion", "Simple_Discount_Offer", "Multi_Buy_Offer", "Buy_Get_Free_Offer", "Threshold_Offer", "Coupon", "Conflict_Rule", "VFP", "VFM"],
      position: { x: 600, y: 1320 },
    },
    {
      name: "BC6 Assortment & Range",
      entities: ["Assortment_Plan", "Listing_Delisting", "Planogram", "Location_Cluster", "Season_Phase", "Item_List"],
      position: { x: 1160, y: 1480 },
    },
    {
      name: "BC7 Allocation & Replenishment",
      entities: ["Allocation", "Allocation_Detail", "Replenishment_Parameters", "Recommended_Order_Qty_ROQ", "Open_to_Buy_OTB"],
      position: { x: 40, y: 2120 },
    },
    {
      name: "BC8 Supplier Collaboration",
      entities: ["Supplier_Communication_Log", "Supplier_Performance_Scorecard", "Supplier_Registration_Workflow", "Consignment_Agreement", "Consignment_Stock_Position", "Consignment_Sales_Report", "Commercial_Income_Accrual", "Commercial_Income_Claim", "Weighted_Average_Cost_Calculation", "Shelf_Capacity_Profile"],
      position: { x: 600, y: 2120 },
    },
  ],
};
