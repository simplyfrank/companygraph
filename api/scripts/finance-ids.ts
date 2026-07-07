// finance-accounting-process-model T-01 (design §4, §6.2, §6.3;
// review-design.md C-02, N-02) — the FROZEN single source of truth the import
// fixture (shared/seed/saas-operator/finance-accounting.json), the two governed
// seed scripts (seed-finance-graph.ts, seed-finance-risks.ts), and the five
// finance-*.integration.test.ts files are all built against.
//
// This file is PURE DATA — no driver, no fetch, no zod (pure literals). Slice-
// local ids are stable UUIDv7 literals in the reserved `018f0300-…` block (the
// platform-ops slice owns `018f0200-…`; retail owns none of this range), so a
// re-import MERGE-on-id is idempotent (NFR-02, AC-11). Foundation ids (the
// finance domain, the shared `stripe`/`data_warehouse` systems, the shared
// `revenue_operations` role) are server-generated and are NEVER literals here —
// they are resolved at seed time by the typed `ensure*` helpers (C-02).
//
// House rules: en-US identifiers throughout; zod not imported (pure literals).

// ---------------------------------------------------------------------------
// §4.1 Journeys — 6 UserJourney nodes, each PART_OF the finance domain (the
// PART_OF-to-domain edge is created by the graph script by RESOLVED domain id,
// NOT in the fixture — §6.2).
// ---------------------------------------------------------------------------

export interface FinanceJourney {
  seedKey: string;
  id: string;
  name: string;
  description: string;
}

export const FINANCE_JOURNEYS: readonly FinanceJourney[] = [
  {
    seedKey: "fin-jrny-subscription-billing",
    id: "018f0300-0000-7000-8000-000000000001",
    name: "Subscription Billing",
    description:
      "Plan selection, provisioning, usage metering, and charge computation for metered subscriptions.",
  },
  {
    seedKey: "fin-jrny-invoice-run",
    id: "018f0300-0000-7000-8000-000000000002",
    name: "Invoice Run",
    description:
      "Period-close aggregation of billable line items into generated and issued invoices.",
  },
  {
    seedKey: "fin-jrny-dunning",
    id: "018f0300-0000-7000-8000-000000000003",
    name: "Dunning",
    description:
      "Staged recovery of failed payments through retries, reminders, and escalation/suspension.",
  },
  {
    seedKey: "fin-jrny-rev-rec",
    id: "018f0300-0000-7000-8000-000000000004",
    name: "Revenue Recognition",
    description:
      "ASC-606 recognition of revenue against identified performance obligations over the contract term.",
  },
  {
    seedKey: "fin-jrny-tax",
    id: "018f0300-0000-7000-8000-000000000005",
    name: "Tax",
    description:
      "Jurisdiction resolution, tax computation, collection, and remittance/filing.",
  },
  {
    seedKey: "fin-jrny-finops",
    id: "018f0300-0000-7000-8000-000000000006",
    name: "FinOps / Cloud-Cost-per-Tenant",
    description:
      "Cloud-spend ingestion, per-tenant cost allocation, margin computation, and cost-anomaly flagging.",
  },
] as const;

// ---------------------------------------------------------------------------
// §4.2 Activities — 24 Activity nodes, 4 per journey, one linear acyclic
// PRECEDES chain per journey (24 PART_OF-to-journey edges + 18 PRECEDES). Each
// row's `precedesSeedKey` names the NEXT activity in its chain (null = chain
// tail). All ids/PART_OF/PRECEDES are slice-local (fixture, §6.3).
// ---------------------------------------------------------------------------

export interface FinanceActivity {
  seedKey: string;
  id: string;
  name: string;
  description: string;
  journeySeedKey: string;
  precedesSeedKey: string | null;
}

export const FINANCE_ACTIVITIES: readonly FinanceActivity[] = [
  // Subscription Billing chain
  {
    seedKey: "fin-act-plan-selected",
    id: "018f0300-0000-7000-8000-000000010101",
    name: "Plan selected",
    description: "Customer selects a subscription plan.",
    journeySeedKey: "fin-jrny-subscription-billing",
    precedesSeedKey: "fin-act-subscription-provisioned",
  },
  {
    seedKey: "fin-act-subscription-provisioned",
    id: "018f0300-0000-7000-8000-000000010102",
    name: "Subscription provisioned",
    description: "The selected plan is provisioned for the tenant.",
    journeySeedKey: "fin-jrny-subscription-billing",
    precedesSeedKey: "fin-act-usage-metered",
  },
  {
    seedKey: "fin-act-usage-metered",
    id: "018f0300-0000-7000-8000-000000010103",
    name: "Usage metered",
    description: "Metered usage is recorded for the billing period.",
    journeySeedKey: "fin-jrny-subscription-billing",
    precedesSeedKey: "fin-act-charge-computed",
  },
  {
    seedKey: "fin-act-charge-computed",
    id: "018f0300-0000-7000-8000-000000010104",
    name: "Charge computed",
    description: "The charge is computed as rated usage x plan price.",
    journeySeedKey: "fin-jrny-subscription-billing",
    precedesSeedKey: null,
  },

  // Invoice Run chain
  {
    seedKey: "fin-act-billing-period-closed",
    id: "018f0300-0000-7000-8000-000000010201",
    name: "Billing period closed",
    description: "The billing period is closed for invoicing.",
    journeySeedKey: "fin-jrny-invoice-run",
    precedesSeedKey: "fin-act-line-items-aggregated",
  },
  {
    seedKey: "fin-act-line-items-aggregated",
    id: "018f0300-0000-7000-8000-000000010202",
    name: "Line items aggregated",
    description: "Billable line items are aggregated per subscription.",
    journeySeedKey: "fin-jrny-invoice-run",
    precedesSeedKey: "fin-act-invoice-generated",
  },
  {
    seedKey: "fin-act-invoice-generated",
    id: "018f0300-0000-7000-8000-000000010203",
    name: "Invoice generated",
    description: "An invoice document is generated from aggregated line items.",
    journeySeedKey: "fin-jrny-invoice-run",
    precedesSeedKey: "fin-act-invoice-issued",
  },
  {
    seedKey: "fin-act-invoice-issued",
    id: "018f0300-0000-7000-8000-000000010204",
    name: "Invoice issued",
    description: "The invoice is issued to the customer.",
    journeySeedKey: "fin-jrny-invoice-run",
    precedesSeedKey: null,
  },

  // Dunning chain
  {
    seedKey: "fin-act-payment-failed",
    id: "018f0300-0000-7000-8000-000000010301",
    name: "Payment failed",
    description: "A subscription payment fails.",
    journeySeedKey: "fin-jrny-dunning",
    precedesSeedKey: "fin-act-retry-scheduled",
  },
  {
    seedKey: "fin-act-retry-scheduled",
    id: "018f0300-0000-7000-8000-000000010302",
    name: "Retry scheduled",
    description: "A payment retry is scheduled per the dunning policy.",
    journeySeedKey: "fin-jrny-dunning",
    precedesSeedKey: "fin-act-reminder-sent",
  },
  {
    seedKey: "fin-act-reminder-sent",
    id: "018f0300-0000-7000-8000-000000010303",
    name: "Reminder sent",
    description: "A payment reminder is sent to the customer.",
    journeySeedKey: "fin-jrny-dunning",
    precedesSeedKey: "fin-act-escalated-suspended",
  },
  {
    seedKey: "fin-act-escalated-suspended",
    id: "018f0300-0000-7000-8000-000000010304",
    name: "Escalated / suspended",
    description: "The account is escalated and, on continued failure, suspended.",
    journeySeedKey: "fin-jrny-dunning",
    precedesSeedKey: null,
  },

  // Revenue Recognition chain
  {
    seedKey: "fin-act-contract-booked",
    id: "018f0300-0000-7000-8000-000000010401",
    name: "Contract booked",
    description: "A customer contract is booked.",
    journeySeedKey: "fin-jrny-rev-rec",
    precedesSeedKey: "fin-act-perf-obligations-identified",
  },
  {
    seedKey: "fin-act-perf-obligations-identified",
    id: "018f0300-0000-7000-8000-000000010402",
    name: "Performance obligations identified",
    description: "Performance obligations are identified per ASC-606.",
    journeySeedKey: "fin-jrny-rev-rec",
    precedesSeedKey: "fin-act-revenue-scheduled",
  },
  {
    seedKey: "fin-act-revenue-scheduled",
    id: "018f0300-0000-7000-8000-000000010403",
    name: "Revenue scheduled",
    description: "Revenue is scheduled against the identified obligations.",
    journeySeedKey: "fin-jrny-rev-rec",
    precedesSeedKey: "fin-act-revenue-recognized",
  },
  {
    seedKey: "fin-act-revenue-recognized",
    id: "018f0300-0000-7000-8000-000000010404",
    name: "Revenue recognized",
    description: "Revenue is recognized as obligations are satisfied.",
    journeySeedKey: "fin-jrny-rev-rec",
    precedesSeedKey: null,
  },

  // Tax chain
  {
    seedKey: "fin-act-tax-jurisdiction-resolved",
    id: "018f0300-0000-7000-8000-000000010501",
    name: "Tax jurisdiction resolved",
    description: "The applicable tax jurisdiction is resolved for the transaction.",
    journeySeedKey: "fin-jrny-tax",
    precedesSeedKey: "fin-act-tax-computed",
  },
  {
    seedKey: "fin-act-tax-computed",
    id: "018f0300-0000-7000-8000-000000010502",
    name: "Tax computed",
    description: "Tax is computed for the resolved jurisdiction.",
    journeySeedKey: "fin-jrny-tax",
    precedesSeedKey: "fin-act-tax-collected",
  },
  {
    seedKey: "fin-act-tax-collected",
    id: "018f0300-0000-7000-8000-000000010503",
    name: "Tax collected",
    description: "Tax is collected from the customer.",
    journeySeedKey: "fin-jrny-tax",
    precedesSeedKey: "fin-act-tax-remitted-filed",
  },
  {
    seedKey: "fin-act-tax-remitted-filed",
    id: "018f0300-0000-7000-8000-000000010504",
    name: "Tax remitted / filed",
    description: "Collected tax is remitted and filed with the authority on time.",
    journeySeedKey: "fin-jrny-tax",
    precedesSeedKey: null,
  },

  // FinOps chain
  {
    seedKey: "fin-act-cloud-spend-ingested",
    id: "018f0300-0000-7000-8000-000000010601",
    name: "Cloud spend ingested",
    description: "Cloud-provider spend data is ingested.",
    journeySeedKey: "fin-jrny-finops",
    precedesSeedKey: "fin-act-cost-allocated-per-tenant",
  },
  {
    seedKey: "fin-act-cost-allocated-per-tenant",
    id: "018f0300-0000-7000-8000-000000010602",
    name: "Cost allocated per tenant",
    description: "Ingested cloud cost is allocated per tenant.",
    journeySeedKey: "fin-jrny-finops",
    precedesSeedKey: "fin-act-margin-computed",
  },
  {
    seedKey: "fin-act-margin-computed",
    id: "018f0300-0000-7000-8000-000000010603",
    name: "Margin computed",
    description: "Gross margin is computed from allocated cost and revenue.",
    journeySeedKey: "fin-jrny-finops",
    precedesSeedKey: "fin-act-cost-anomaly-flagged",
  },
  {
    seedKey: "fin-act-cost-anomaly-flagged",
    id: "018f0300-0000-7000-8000-000000010604",
    name: "Cost anomaly flagged",
    description: "A per-tenant cost anomaly above threshold is flagged.",
    journeySeedKey: "fin-jrny-finops",
    precedesSeedKey: null,
  },
] as const;

// ---------------------------------------------------------------------------
// §4.3 Roles — 5 slice-added Role nodes (each EXECUTES its journey chain,
// slice-local edges in the fixture). The SHARED `revenue_operations` role is
// referenced by seedKey only (resolved to its id at seed time via ensureRoles;
// NO id literal, C-02) and its EXECUTES edges are created by the graph script.
// ---------------------------------------------------------------------------

export interface FinanceRole {
  seedKey: string;
  id: string;
  name: string;
  description: string;
  executesSeedKeys: readonly string[]; // activity seedKeys this role EXECUTES
}

export const FINANCE_ROLES: readonly FinanceRole[] = [
  {
    seedKey: "fin-role-billing-ops",
    id: "018f0300-0000-7000-8000-000000000301",
    name: "Billing Operations",
    description: "Owns subscription billing and invoice-run operations.",
    executesSeedKeys: [
      "fin-act-plan-selected",
      "fin-act-subscription-provisioned",
      "fin-act-usage-metered",
      "fin-act-charge-computed",
      "fin-act-billing-period-closed",
      "fin-act-line-items-aggregated",
      "fin-act-invoice-generated",
      "fin-act-invoice-issued",
    ],
  },
  {
    seedKey: "fin-role-ar-collections",
    id: "018f0300-0000-7000-8000-000000000302",
    name: "Accounts Receivable / Collections",
    description: "Owns dunning and collections on failed payments.",
    executesSeedKeys: [
      "fin-act-payment-failed",
      "fin-act-retry-scheduled",
      "fin-act-reminder-sent",
      "fin-act-escalated-suspended",
    ],
  },
  {
    seedKey: "fin-role-revenue-accountant",
    id: "018f0300-0000-7000-8000-000000000303",
    name: "Revenue Accountant / Controller",
    description: "Owns ASC-606 revenue recognition.",
    executesSeedKeys: [
      "fin-act-contract-booked",
      "fin-act-perf-obligations-identified",
      "fin-act-revenue-scheduled",
      "fin-act-revenue-recognized",
    ],
  },
  {
    seedKey: "fin-role-tax-analyst",
    id: "018f0300-0000-7000-8000-000000000304",
    name: "Tax Analyst",
    description: "Owns tax computation, collection, and remittance/filing.",
    executesSeedKeys: [
      "fin-act-tax-jurisdiction-resolved",
      "fin-act-tax-computed",
      "fin-act-tax-collected",
      "fin-act-tax-remitted-filed",
    ],
  },
  {
    seedKey: "fin-role-finops-engineer",
    id: "018f0300-0000-7000-8000-000000000305",
    name: "FinOps Engineer",
    description: "Owns cloud-cost allocation, margin, and anomaly detection.",
    executesSeedKeys: [
      "fin-act-cloud-spend-ingested",
      "fin-act-cost-allocated-per-tenant",
      "fin-act-margin-computed",
      "fin-act-cost-anomaly-flagged",
    ],
  },
] as const;

// The SHARED function-owner role. Referenced by seedKey (operatorSeedKey),
// resolved via ensureRoles at seed time; the graph script creates its EXECUTES
// edges to one representative activity per journey it owns (§4.3).
export const SHARED_REVENUE_OPERATIONS_SEED_KEY = "revenue_operations";

// One representative activity per journey the function-owner role executes
// (the graph script creates a revenue_operations EXECUTES edge to each).
export const REVENUE_OPERATIONS_EXECUTES_ACTIVITY_SEED_KEYS: readonly string[] = [
  "fin-act-charge-computed",
  "fin-act-invoice-issued",
  "fin-act-escalated-suspended",
  "fin-act-revenue-recognized",
  "fin-act-tax-remitted-filed",
  "fin-act-cost-anomaly-flagged",
] as const;

// ---------------------------------------------------------------------------
// §4.4 Systems — 3 slice-added System nodes (systemKind:"functional" +
// boundedContext tag, DD-05). The SHARED `stripe`/`data_warehouse` systems are
// referenced by seedKey only (resolved via ensureSystems; NO id literal, and
// the boundedContext is documented but NOT applied to shared nodes, DD-05) and
// their USES_SYSTEM edges are created by the graph script.
// ---------------------------------------------------------------------------

export interface FinanceSystem {
  seedKey: string;
  id: string;
  name: string;
  description: string;
  systemKind: "functional";
  boundedContext: string;
  // slice activities that USES_SYSTEM this system (slice-local edges).
  usedBySeedKeys: readonly string[];
}

export const FINANCE_SYSTEMS: readonly FinanceSystem[] = [
  {
    seedKey: "fin-sys-ledger",
    id: "018f0300-0000-7000-8000-000000000401",
    name: "General Ledger / Accounting",
    description: "General-ledger and accounting system of record for revenue recognition.",
    systemKind: "functional",
    boundedContext: "General Ledger / RevRec",
    usedBySeedKeys: [
      "fin-act-revenue-scheduled",
      "fin-act-revenue-recognized",
      "fin-act-invoice-generated",
    ],
  },
  {
    seedKey: "fin-sys-tax-engine",
    id: "018f0300-0000-7000-8000-000000000402",
    name: "Tax Engine",
    description: "Tax-jurisdiction resolution and tax-computation engine.",
    systemKind: "functional",
    boundedContext: "Tax",
    usedBySeedKeys: [
      "fin-act-tax-jurisdiction-resolved",
      "fin-act-tax-computed",
      "fin-act-tax-remitted-filed",
    ],
  },
  {
    seedKey: "fin-sys-finops",
    id: "018f0300-0000-7000-8000-000000000403",
    name: "FinOps / Cloud-Cost platform",
    description: "Cloud-cost ingestion, per-tenant allocation, and anomaly-detection platform.",
    systemKind: "functional",
    boundedContext: "FinOps / Cost",
    usedBySeedKeys: [
      "fin-act-cloud-spend-ingested",
      "fin-act-cost-allocated-per-tenant",
      "fin-act-cost-anomaly-flagged",
    ],
  },
] as const;

// Shared systems (referenced by seedKey; resolved via ensureSystems). The
// graph script creates their USES_SYSTEM edges FROM the named slice activities.
// boundedContext values are documented (§4.4) but NOT applied to shared nodes.
export interface SharedSystemRef {
  seedKey: string; // operatorSeedKey resolved via ensureSystems
  boundedContext: string; // documented only (DD-05); NOT written to the shared node
  usedBySeedKeys: readonly string[]; // slice activities that USES_SYSTEM this shared system
}

export const FINANCE_SHARED_SYSTEMS: readonly SharedSystemRef[] = [
  {
    seedKey: "stripe",
    boundedContext: "Billing & Payments",
    usedBySeedKeys: [
      "fin-act-charge-computed",
      "fin-act-invoice-issued",
      "fin-act-payment-failed",
      "fin-act-reminder-sent",
      "fin-act-tax-collected",
    ],
  },
  {
    seedKey: "data_warehouse",
    boundedContext: "FinOps / Cost",
    usedBySeedKeys: ["fin-act-cloud-spend-ingested", "fin-act-margin-computed"],
  },
] as const;

// ---------------------------------------------------------------------------
// §4.5 KPIs — 7 KPIs created via POST /api/v1/kpis, each grounded to a metric
// via MEASURES. `groundedNow:false` (Cloud Cost per Tenant → the OQ-1-absent
// metric-cloud-cost-per-tenant) is created UNGROUNDED (C-04); grounding lands
// via AC-15 once saas-metric-library ships the metric.
// ---------------------------------------------------------------------------

export interface FinanceKpi {
  name: string;
  unit: string;
  target_value: number;
  target_direction: "up" | "down";
  measurement_frequency: string;
  metricSeedKey: string;
  groundedNow: boolean;
}

export const FINANCE_KPIS: readonly FinanceKpi[] = [
  {
    name: "MRR",
    unit: "usd",
    target_value: 1_000_000,
    target_direction: "up",
    measurement_frequency: "monthly",
    metricSeedKey: "metric-mrr",
    groundedNow: true,
  },
  {
    name: "ARR",
    unit: "usd",
    target_value: 12_000_000,
    target_direction: "up",
    measurement_frequency: "monthly",
    metricSeedKey: "metric-arr",
    groundedNow: true,
  },
  {
    name: "DSO",
    unit: "days",
    target_value: 30,
    target_direction: "down",
    measurement_frequency: "monthly",
    metricSeedKey: "metric-dso",
    groundedNow: true,
  },
  {
    name: "Gross Margin",
    unit: "percent",
    target_value: 80,
    target_direction: "up",
    measurement_frequency: "monthly",
    metricSeedKey: "metric-gross-margin",
    groundedNow: true,
  },
  {
    name: "Burn",
    unit: "usd",
    target_value: 250_000,
    target_direction: "down",
    measurement_frequency: "monthly",
    metricSeedKey: "metric-burn",
    groundedNow: true,
  },
  {
    name: "Runway",
    unit: "months",
    target_value: 18,
    target_direction: "up",
    measurement_frequency: "monthly",
    metricSeedKey: "metric-runway",
    groundedNow: true,
  },
  {
    // OQ-1 / C-04: the metric is ABSENT from saas-metric-library → created
    // ungrounded now; grounded via AC-15 once metric-cloud-cost-per-tenant ships.
    name: "Cloud Cost per Tenant",
    unit: "usd",
    target_value: 50,
    target_direction: "down",
    measurement_frequency: "monthly",
    metricSeedKey: "metric-cloud-cost-per-tenant",
    groundedNow: false,
  },
] as const;

// The DSO -> Dunning optional FR-07 ALIGNED_TO enrichment (verified edge path;
// review C-05). Names the KPI + the journey the alignment points to.
export const DSO_ALIGNED_TO_JOURNEY_SEED_KEY = "fin-jrny-dunning";
export const DSO_KPI_NAME = "DSO";

// ---------------------------------------------------------------------------
// §4.6 / §7.3 Stories — one UserStory per journey (6), each attached to a
// journey activity (resolved to its id via FINANCE_ACTIVITIES at seed time,
// N-02) + a finance persona/role, each with a Given/When/Then AC.
// ---------------------------------------------------------------------------

export interface FinanceStory {
  journeySeedKey: string;
  persona: string;
  action: string;
  benefit: string;
  activitySeedKey: string; // resolved to activity id at seed time (N-02)
  roleSeedKey: string; // resolved to slice role id at seed time (optional roleId)
  ac: { given: string; when: string; then: string };
}

export const FINANCE_STORIES: readonly FinanceStory[] = [
  {
    journeySeedKey: "fin-jrny-subscription-billing",
    persona: "Billing Ops",
    action: "compute the correct charge for a metered subscription",
    benefit: "no revenue is leaked",
    activitySeedKey: "fin-act-charge-computed",
    roleSeedKey: "fin-role-billing-ops",
    ac: {
      given: "a provisioned subscription with metered usage",
      when: "the charge is computed",
      then: "the charge equals rated usage x plan price",
    },
  },
  {
    journeySeedKey: "fin-jrny-invoice-run",
    persona: "Billing Ops",
    action: "issue an accurate invoice at period close",
    benefit: "customers are billed on time",
    activitySeedKey: "fin-act-invoice-issued",
    roleSeedKey: "fin-role-billing-ops",
    ac: {
      given: "a closed billing period",
      when: "the invoice run completes",
      then: "every active subscription has exactly one issued invoice",
    },
  },
  {
    journeySeedKey: "fin-jrny-dunning",
    persona: "AR / Collections",
    action: "recover a failed payment through staged retries",
    benefit: "bad debt is minimized",
    activitySeedKey: "fin-act-reminder-sent",
    roleSeedKey: "fin-role-ar-collections",
    ac: {
      given: "a failed payment",
      when: "the dunning schedule runs",
      then: "a reminder is sent before escalation",
    },
  },
  {
    journeySeedKey: "fin-jrny-rev-rec",
    persona: "Revenue Accountant",
    action: "recognize revenue against performance obligations",
    benefit: "revenue is recognized in accordance with ASC-606",
    activitySeedKey: "fin-act-revenue-recognized",
    roleSeedKey: "fin-role-revenue-accountant",
    ac: {
      given: "a booked contract with identified obligations",
      when: "the period closes",
      then: "revenue is recognized per the schedule",
    },
  },
  {
    journeySeedKey: "fin-jrny-tax",
    persona: "Tax Analyst",
    action: "remit tax to the correct jurisdiction",
    benefit: "tax is filed on time and mis-filing is avoided",
    activitySeedKey: "fin-act-tax-remitted-filed",
    roleSeedKey: "fin-role-tax-analyst",
    ac: {
      given: "collected tax for a period",
      when: "the filing deadline arrives",
      then: "tax is remitted and filed on time",
    },
  },
  {
    journeySeedKey: "fin-jrny-finops",
    persona: "FinOps Engineer",
    action: "allocate cloud cost per tenant and flag anomalies",
    benefit: "margin erosion is detected early",
    activitySeedKey: "fin-act-cost-anomaly-flagged",
    roleSeedKey: "fin-role-finops-engineer",
    ac: {
      given: "ingested cloud spend",
      when: "cost is allocated per tenant",
      then: "a cost anomaly above threshold is flagged",
    },
  },
] as const;

// ---------------------------------------------------------------------------
// §4.7 Risks + compliance — 5 risk-register rows (3 financial, 2 compliance) +
// 1 compliance/rules row. The `name` marker is the dedup key (DD-06). Created
// via the governed APIs by seed-finance-risks.ts.
// ---------------------------------------------------------------------------

export interface FinanceRisk {
  name: string; // dedup marker
  description: string;
  likelihood: number; // 1..5
  impact: number; // 1..5
  risk_type: "financial" | "compliance";
  mitigation_plan: string;
}

export const FINANCE_RISK_DOMAIN = "Finance & Accounting";
export const FINANCE_RISK_OWNER = "Revenue Operations";

export const FINANCE_RISKS: readonly FinanceRisk[] = [
  {
    name: "Finance: Revenue leakage / billing error",
    description:
      "Metered usage is mis-rated or under-charged, leaking recognizable revenue.",
    likelihood: 3,
    impact: 4,
    risk_type: "financial",
    mitigation_plan: "Automated rating reconciliation and charge-computation validation.",
  },
  {
    name: "Finance: Dunning failure / bad debt",
    description:
      "Failed payments are not recovered through dunning, resulting in bad debt.",
    likelihood: 3,
    impact: 3,
    risk_type: "financial",
    mitigation_plan: "Staged retry schedule with escalation and suspension controls.",
  },
  {
    name: "Finance: Revenue-recognition (ASC-606) error",
    description:
      "Revenue is recognized outside ASC-606 performance-obligation schedules.",
    likelihood: 2,
    impact: 5,
    risk_type: "compliance",
    mitigation_plan: "Obligation-based recognition schedules and period-close review.",
  },
  {
    name: "Finance: Tax mis-filing exposure",
    description:
      "Tax is computed or filed against the wrong jurisdiction, creating exposure.",
    likelihood: 2,
    impact: 5,
    risk_type: "compliance",
    mitigation_plan: "Jurisdiction resolution engine and deadline-controlled filing.",
  },
  {
    name: "Finance: Cloud-cost / margin overrun",
    description:
      "Cloud cost per tenant overruns budget, eroding gross margin undetected.",
    likelihood: 3,
    impact: 4,
    risk_type: "financial",
    mitigation_plan: "Per-tenant cost allocation with anomaly thresholds and alerts.",
  },
] as const;

export interface FinanceComplianceRule {
  name: string; // dedup marker
  description: string;
  rule_dsl: string;
  rule_type: "PERFORMANCE" | "COMPLIANCE" | "QUALITY";
  category: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  enabled: boolean;
  actions: { type: "TAG" | "NOTIFY" | "BLOCK" | "ALERT"; config: Record<string, unknown> }[];
}

export const FINANCE_COMPLIANCE: readonly FinanceComplianceRule[] = [
  {
    name: "Finance: Tax-filing deadline control",
    description:
      "Evaluable control that tax remittance/filing occurs before the jurisdiction deadline.",
    rule_dsl: "tax.filing.days_until_deadline <= 0 AND tax.filing.status != 'filed'",
    rule_type: "COMPLIANCE",
    category: "Finance & Accounting",
    severity: "HIGH",
    enabled: true,
    actions: [
      { type: "ALERT", config: { channel: "finance-compliance", message: "Tax filing deadline breached" } },
    ],
  },
] as const;
