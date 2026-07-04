#!/bin/bash

API_URL="http://127.0.0.1:8787/api/v1/ontology/node-labels"

ENTITY_LABELS=(
  "Allocation"
  "Allocation Detail"
  "Area"
  "Assortment Plan"
  "Barcode"
  "Bracket Cost"
  "Buy-Get-Free Offer"
  "Chain"
  "Class"
  "Clearance Markdown"
  "Commercial Income Accrual"
  "Commercial Income Claim"
  "Company"
  "Competitive Price"
  "Conflict Rule"
  "Consignment Agreement"
  "Consignment Sales Report"
  "Consignment Stock Position"
  "Contract"
  "Cost Component"
  "Cost Zone"
  "Cost Zone Group"
  "Coupon"
  "Deal"
  "Deal Component"
  "Department (Section)"
  "Deposit Item"
  "Differentiator"
  "District"
  "Division"
  "ELC (Estimated Landed Cost)"
  "Expense Profile"
  "Fiscal Calendar"
  "Future Retail"
  "Group (Department)"
  "Item"
  "Item List"
  "Item-Location (Ranging)"
  "Item-Supplier"
  "Listing/Delisting"
  "Location Cluster"
  "Location List"
  "Location Trait"
  "Margin Target"
  "Multi-Buy Offer"
  "Open-to-Buy (OTB)"
  "PO Detail"
  "Pack Item"
  "Partner"
  "Planogram"
  "Price Change"
  "Price Zone"
  "Price Zone Group"
  "Product Attributes"
  "Product Media"
  "Promotion"
  "Purchase Order"
  "RTV (Return to Vendor)"
  "Recommended Order Qty (ROQ)"
  "Regular Retail Price"
  "Related Item"
  "Replenishment Parameters"
  "Season/Phase"
  "Shelf Capacity Profile"
  "Simple Discount Offer"
  "Slab Price"
  "Store"
  "Subclass"
  "Supplier"
  "Supplier Communication Log"
  "Supplier Parent"
  "Supplier Performance Scorecard"
  "Supplier Registration Workflow"
  "Supplier Site"
  "Tax Rule / VAT"
  "Threshold Offer"
  "Transfer Entity"
  "Transformable Component"
  "Transformable Item"
  "Up-Charge"
  "VFM (Vendor-Funded Markdown)"
  "VFP (Vendor-Funded Promotion)"
  "Virtual Warehouse"
  "Warehouse"
  "Weighted Average Cost Calculation"
)

for label in "${ENTITY_LABELS[@]}"; do
  # Sanitize label name: replace spaces with underscores, remove special chars
  sanitized=$(echo "$label" | sed 's/[^A-Za-z0-9_]/_/g' | sed 's/__/_/g')
  echo "Creating label: $sanitized (from: $label)"
  curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"$sanitized\",
      \"description\": \"Commercial domain entity: $label\",
      \"usage_example\": \"POST /api/v1/nodes/$(echo "$sanitized" | jq -sRr @uri)\",
      \"json_schema_doc\": {
        \"type\": \"object\",
        \"required\": [\"bounded_context\", \"entity_number\", \"status\"],
        \"properties\": {
          \"bounded_context\": {\"type\": \"string\"},
          \"entity_number\": {\"type\": \"integer\"},
          \"status\": {\"type\": \"string\"},
          \"subdomain\": {\"type\": \"string\"},
          \"oracle_table\": {\"type\": \"string\"},
          \"note\": {\"type\": \"string\"}
        }
      }
    }" > /dev/null
  if [ $? -eq 0 ]; then
    echo "✓ Created: $sanitized"
  else
    echo "✗ Failed: $sanitized"
  fi
done

echo "All entity labels created!"
