// saas-metric-library T-01 + T-04 (design §3.1, §3.4, §4, §5.5 — FR-04, FR-07,
// FR-08). Pure data + internal shapes for the canonical metric catalog: the
// frozen 20-metric roster, the internal (non-REST) zod input shape, the
// MetricDefinition registration payload (json_schema_doc with the two closed
// enums), and the catalog list cypher constant. No driver, no fetch.

import { z } from "zod";
import type { NodeLabelCreate } from "@companygraph/shared/schema/ontology";

// ---------------------------------------------------------------------------
// Closed enums (OQ-3) — the single source for both the zod input shape and the
// registered json_schema_doc.
// ---------------------------------------------------------------------------
export const METRIC_UNITS = [
  "currency",
  "ratio",
  "percent",
  "days",
  "months",
  "count",
] as const;

export const METRIC_CATEGORIES = [
  "acquisition",
  "revenue",
  "retention",
  "efficiency",
  "financial",
  "reliability",
] as const;

// ---------------------------------------------------------------------------
// Internal (non-REST) zod input shape (§3.4) — validates the seed-catalog rows
// inside the seed harness only. NEVER a REST boundary shape: registration +
// metric writes reuse the as-built nodeLabelCreateSchema / nodeCreateSchema and
// the registered json_schema_doc attribute-zod.
// ---------------------------------------------------------------------------
export const metricRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  formula: z.string().min(1),
  unit: z.enum(METRIC_UNITS),
  category: z.enum(METRIC_CATEGORIES),
  benchmark: z.string().min(1),
});
export type MetricRow = z.infer<typeof metricRowSchema>;

// ---------------------------------------------------------------------------
// The frozen 20-metric roster (§4) — copied verbatim from the design table.
// If this roster changes, design §4 + AC-06's expected set change together.
// ---------------------------------------------------------------------------
export const METRIC_CATALOG: MetricRow[] = [
  {
    id: "metric-cac",
    name: "CAC",
    description: "Customer Acquisition Cost.",
    formula: "Total sales & marketing spend ÷ new customers acquired (period)",
    unit: "currency",
    category: "acquisition",
    benchmark: "Lower is better; varies by ACV — track CAC-payback alongside",
  },
  {
    id: "metric-ltv",
    name: "LTV",
    description: "Customer Lifetime Value.",
    formula: "ARPA × gross margin % ÷ customer churn rate",
    unit: "currency",
    category: "revenue",
    benchmark: "LTV:CAC ≥ 3 healthy",
  },
  {
    id: "metric-ltv-cac-ratio",
    name: "LTV:CAC Ratio",
    description: "Ratio of lifetime value to acquisition cost.",
    formula: "LTV ÷ CAC",
    unit: "ratio",
    category: "efficiency",
    benchmark: "≥ 3 healthy; < 1 unsustainable",
  },
  {
    id: "metric-mrr",
    name: "MRR",
    description: "Monthly Recurring Revenue.",
    formula: "Σ monthly recurring revenue across active subscriptions",
    unit: "currency",
    category: "revenue",
    benchmark: "Growth trend > level; track net-new MRR",
  },
  {
    id: "metric-arr",
    name: "ARR",
    description: "Annual Recurring Revenue.",
    formula: "MRR × 12",
    unit: "currency",
    category: "revenue",
    benchmark: "Growth rate the headline; > 100% YoY early-stage",
  },
  {
    id: "metric-nrr",
    name: "NRR",
    description: "Net Revenue Retention.",
    formula:
      "(Starting MRR + expansion − contraction − churn) ÷ starting MRR",
    unit: "percent",
    category: "retention",
    benchmark: "> 100% healthy; > 120% best-in-class",
  },
  {
    id: "metric-grr",
    name: "GRR",
    description: "Gross Revenue Retention.",
    formula: "(Starting MRR − contraction − churn) ÷ starting MRR",
    unit: "percent",
    category: "retention",
    benchmark: "> 90% healthy (SMB), > 95% (enterprise)",
  },
  {
    id: "metric-logo-churn",
    name: "Logo Churn",
    description: "Customer (logo) churn rate.",
    formula: "Customers lost in period ÷ customers at period start",
    unit: "percent",
    category: "retention",
    benchmark: "< 1%/mo SMB; lower enterprise",
  },
  {
    id: "metric-revenue-churn",
    name: "Revenue Churn",
    description: "Revenue churn rate.",
    formula: "MRR lost to churn+contraction ÷ starting MRR",
    unit: "percent",
    category: "retention",
    benchmark: "< 1%/mo; negative net-churn ideal",
  },
  {
    id: "metric-cac-payback",
    name: "CAC Payback",
    description: "Months to recover customer acquisition cost.",
    formula: "CAC ÷ (new MRR × gross margin %)",
    unit: "months",
    category: "efficiency",
    benchmark: "< 12 mo healthy; < 18 mo acceptable",
  },
  {
    id: "metric-dso",
    name: "DSO",
    description: "Days Sales Outstanding.",
    formula: "(Accounts receivable ÷ revenue) × days in period",
    unit: "days",
    category: "financial",
    benchmark: "< 45 days healthy for SaaS billing",
  },
  {
    id: "metric-gross-margin",
    name: "Gross Margin",
    description: "Gross margin percentage.",
    formula: "(Revenue − COGS) ÷ revenue",
    unit: "percent",
    category: "financial",
    benchmark: "> 75% for SaaS; > 80% best-in-class",
  },
  {
    id: "metric-burn",
    name: "Burn",
    description: "Cash burn per month.",
    formula: "Net cash outflow per month (gross or net burn)",
    unit: "currency",
    category: "financial",
    benchmark: "Trend vs. plan; net burn < gross burn",
  },
  {
    id: "metric-runway",
    name: "Runway",
    description: "Months of cash remaining.",
    formula: "Cash on hand ÷ net monthly burn",
    unit: "months",
    category: "financial",
    benchmark: "> 18 mo healthy; < 6 mo critical",
  },
  {
    id: "metric-rule-of-40",
    name: "Rule of 40",
    description: "Growth-plus-profitability health check.",
    formula: "Revenue growth rate % + profit (or FCF) margin %",
    unit: "percent",
    category: "financial",
    benchmark: "≥ 40% healthy",
  },
  {
    id: "metric-pipeline-conversion",
    name: "Pipeline Conversion",
    description: "Qualified-pipeline conversion rate.",
    formula: "Deals won ÷ qualified opportunities entering pipeline",
    unit: "percent",
    category: "acquisition",
    benchmark: "Varies by motion; track per-stage drop-off",
  },
  {
    id: "metric-win-rate",
    name: "Win Rate",
    description: "Deal win rate.",
    formula: "Deals won ÷ (deals won + deals lost)",
    unit: "percent",
    category: "acquisition",
    benchmark: "20–30% typical mid-market",
  },
  {
    id: "metric-mttr",
    name: "MTTR",
    description: "Mean Time To Resolution.",
    formula: "Σ incident resolution time ÷ incidents (period)",
    unit: "days",
    category: "reliability",
    benchmark: "Lower is better; hours not days for SEV1",
  },
  {
    id: "metric-uptime",
    name: "Uptime",
    description: "Service availability.",
    formula: "Available minutes ÷ total minutes (period)",
    unit: "percent",
    category: "reliability",
    benchmark: "≥ 99.9% (three nines) SLA-typical",
  },
  {
    id: "metric-deploy-frequency",
    name: "Deploy Frequency",
    description: "Production deployment cadence.",
    formula: "Production deployments per period",
    unit: "count",
    category: "efficiency",
    benchmark: "Elite: on-demand / multiple per day",
  },
];

// ---------------------------------------------------------------------------
// MetricDefinition registration payload (§3.1) — the single source of the
// json_schema_doc consumed by the ensure-label step (T-02) and the T-08
// attribute-enforcement test. Conforms to nodeLabelCreateSchema.
// ---------------------------------------------------------------------------
export const METRIC_DEFINITION_LABEL: NodeLabelCreate = {
  name: "MetricDefinition",
  description:
    "A canonical SaaS/finance metric definition (formula, unit, category, benchmark) that operator KPIs measure via the MEASURES edge.",
  usage_example: "NRR — Net Revenue Retention; unit=percent; category=retention",
  json_schema_doc: {
    type: "object",
    properties: {
      formula: { type: "string", minLength: 1 },
      unit: { type: "string", enum: [...METRIC_UNITS] },
      category: { type: "string", enum: [...METRIC_CATEGORIES] },
      benchmark: { type: "string", minLength: 1 },
    },
    required: ["formula", "unit", "category", "benchmark"],
    additionalProperties: true,
  },
};

// ---------------------------------------------------------------------------
// Catalog list read (§5.5, OQ-5) — the single-source cypher statement the
// seed/test layer and the PWA view use for the catalog list read via
// POST /api/v1/query/cypher. No new REST route is added.
// ---------------------------------------------------------------------------
export const METRIC_CATALOG_LIST_QUERY = `MATCH (m:MetricDefinition)
RETURN m.id AS id, m.name AS name, m.description AS description,
       m.attributes_json AS attributes_json
ORDER BY m.name`;
