// customer-success-process-model T-01 (design §3.4, §4.2–§4.7, §5.2 — FR-05,
// FR-08, FR-09, FR-11, FR-12). The feature-owned CS content catalog: pure row
// data + internal (non-REST) zod input shapes + the fixed `018f0400-…` seed-id
// constants the fixture (customer-success.json) and the seed step
// (seed-customer-success.ts) share.
//
// This module is pure data + shapes: no driver, no fetch, no side effects. It
// adds NO new route, NO schema-array entry, NO ontology label/edge (Rule A /
// NFR-01). House rules: zod is the only validation library; en-US identifiers
// throughout. The internal shapes below only guard THIS seed's own inputs — the
// authoritative validation is always each governed route's own re-parse at the
// REST boundary (§3.4). Every governed write is lookup-before-create by a stable
// natural key so a re-run is net-zero (Rule C / §5.1).

import { z } from "zod";

// ---------------------------------------------------------------------------
// Fixed seed-id block (§3.1, Rule D) — all CS process rows carry fixed UUIDv7
// ids in the reserved `018f0400-…` block, disjoint from the metric library's
// `018f0100` block. Slug ids (`cs-onboarding`) fail nodeCreateSchema /
// edgeCreateSchema validation, so these are real UUIDv7s. The fixture uses
// these ids directly; the seed step references them as known constants after
// the import (no lookup needed for in-slice nodes).
// ---------------------------------------------------------------------------

export const JOURNEY_IDS = {
  onboarding: "018f0400-0000-7000-8000-000000000001",
  healthScoring: "018f0400-0000-7000-8000-000000000002",
  renewals: "018f0400-0000-7000-8000-000000000003",
  churnSave: "018f0400-0000-7000-8000-000000000004",
  supportTicketing: "018f0400-0000-7000-8000-000000000005",
} as const;

// CS-specific Role reference nodes (fixed ids, `018f0400-…-02xx`,
// model-independent per model-workspace-core DEC-01).
export const CS_ROLE_IDS = {
  onboardingSpecialist: "018f0400-0000-7000-8000-000000000201",
  customerSuccessManager: "018f0400-0000-7000-8000-000000000202",
  renewalsManager: "018f0400-0000-7000-8000-000000000203",
  supportAgent: "018f0400-0000-7000-8000-000000000204",
} as const;

// CS-specific System reference nodes (fixed ids, `018f0400-…-03xx`), each
// carrying the REQUIRED attributes.systemKind (verified required,
// system-kind.ts:30).
export const CS_SYSTEM_IDS = {
  csPlatform: "018f0400-0000-7000-8000-000000000301",
  supportSystem: "018f0400-0000-7000-8000-000000000302",
} as const;

// Activity ids, journey-grouped (`018f0400-…-0101xx` onboarding, …0102xx health,
// …0103xx renewals, …0104xx churn-save, …0105xx support). Exposed so the seed
// step can target them for stories / NEEDS_CAPABILITY / EXECUTES / USES_SYSTEM.
export const ACTIVITY_IDS = {
  // Onboarding
  obKickoff: "018f0400-0000-7000-8000-000000010101",
  obProvisioning: "018f0400-0000-7000-8000-000000010102",
  obMigration: "018f0400-0000-7000-8000-000000010103",
  obTraining: "018f0400-0000-7000-8000-000000010104",
  obGoLive: "018f0400-0000-7000-8000-000000010105",
  // Health Scoring
  hsIngest: "018f0400-0000-7000-8000-000000010201",
  hsCompute: "018f0400-0000-7000-8000-000000010202",
  hsFlag: "018f0400-0000-7000-8000-000000010203",
  hsPlaybook: "018f0400-0000-7000-8000-000000010204",
  // Renewals
  rnForecast: "018f0400-0000-7000-8000-000000010301",
  rnOutreach: "018f0400-0000-7000-8000-000000010302",
  rnNegotiation: "018f0400-0000-7000-8000-000000010303",
  rnClose: "018f0400-0000-7000-8000-000000010304",
  // Churn-Save
  csDetect: "018f0400-0000-7000-8000-000000010401",
  csSavePlay: "018f0400-0000-7000-8000-000000010402",
  csEscalate: "018f0400-0000-7000-8000-000000010403",
  csWinBack: "018f0400-0000-7000-8000-000000010404",
  // Support Ticketing
  stTriage: "018f0400-0000-7000-8000-000000010501",
  stFirstResponse: "018f0400-0000-7000-8000-000000010502",
  stResolution: "018f0400-0000-7000-8000-000000010503",
  stEscalate: "018f0400-0000-7000-8000-000000010504",
  stCsat: "018f0400-0000-7000-8000-000000010505",
} as const;

// Shared-catalog seedKeys (foundation FR-04/FR-05), resolved by
// `operatorSeedKey` at seed time — never a fixed id. These are the shared
// systems/roles the fixture references via `operatorSeedKey` sentinels the seed
// step (T-03 step 2) rewrites to concrete ids before import.
export const SHARED_SYSTEM_KEYS = ["moms", "crm", "data_warehouse", "pagerduty"] as const;
// The foundation's shared :Role catalog carries ONE customer-success role,
// `customer_success_lead` (the function-owner role). "Customer Success Owner" is
// seeded as a :Persona, not a :Role (verified saas-operator-catalog.ts), so the
// only shared EXECUTES target is `customer_success_lead`.
export const SHARED_ROLE_KEYS = ["customer_success_lead"] as const;

// ---------------------------------------------------------------------------
// Internal (non-REST) zod input shapes (§3.4, §5.2) — permissive, seed-only.
// ---------------------------------------------------------------------------

// A CS KPI row. `metricSeedKey` names the MetricDefinition this KPI MEASURES,
// resolved to a fixed metric id at write time via linkKpiToMetric (§4.3).
export const csKpiRow = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.string().min(1),
  target_value: z.number(),
  target_direction: z.string().min(1),
  measurement_frequency: z.string().min(1),
  description: z.string().optional(),
  metricSeedKey: z.string().min(1),
});
export type CsKpiRow = z.infer<typeof csKpiRow>;

// A conditional (per-metric) CS KPI row (C-02): authored iff its
// `metricSeedKey` MetricDefinition exists in the library.
export const csConditionalKpiRow = csKpiRow;
export type CsConditionalKpiRow = z.infer<typeof csConditionalKpiRow>;

// SLA row — free-string domain-natural values per the shipped
// slaCreateRequestSchema (all `z.string().min(1)`).
export const csSlaRow = z.object({
  name: z.string().min(1),
  service_type: z.string().min(1),
  target_value: z.number(),
  target_unit: z.string().min(1),
  measurement_window: z.string().min(1),
  window_duration: z.string().min(1),
  compliance_threshold: z.number(),
  description: z.string().optional(),
});
export type CsSlaRow = z.infer<typeof csSlaRow>;

// Risk row — matches the exported RiskSeedRow interface from
// governed-seed-helper.ts. `domain:"Customer Success"` verbatim (§4.6, OQ-2).
// `linkedJourney` names a JOURNEY_IDS key → linked_entity_id at write time.
export const csRiskRow = z.object({
  name: z.string().min(1),
  owner: z.string().min(1),
  domain: z.string().min(1),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  status: z.enum(["open", "mitigating", "accepted", "resolved"]),
  trend: z.enum(["up", "flat", "down"]),
  risk_type: z.enum([
    "strategic",
    "operational",
    "financial",
    "compliance",
    "security",
    "technical",
  ]),
  description: z.string().optional(),
  mitigation_plan: z.string().optional(),
  linkedJourney: z.enum([
    "onboarding",
    "healthScoring",
    "renewals",
    "churnSave",
    "supportTicketing",
  ]),
});
export type CsRiskRow = z.infer<typeof csRiskRow>;

// Story row + its Given/When/Then ACs. `activityId` is a fixed CS activity id
// (in scopedNodeIds by construction, B-02). There is NO `title` field on
// storyCreateSchema (N-03) — the name derives server-side from
// persona/action/benefit.
export const csAcRow = z.object({
  given: z.string().min(1),
  when: z.string().min(1),
  then: z.string().min(1),
});
export const csStoryRow = z.object({
  persona: z.string().min(1),
  action: z.string().min(1),
  benefit: z.string().min(1),
  activityId: z.string().min(1),
  roleId: z.string().min(1).optional(),
  acs: z.array(csAcRow).min(1),
});
export type CsStoryRow = z.infer<typeof csStoryRow>;

// DDD capability row. `supportedBy` entries are a CS_SYSTEM_IDS key or a
// SHARED_SYSTEM_KEYS entry, resolved to a real System id at write time.
export const csCapabilityRow = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  neededByActivityId: z.string().min(1),
  supportedBy: z.array(z.string().min(1)).min(1),
});
export type CsCapabilityRow = z.infer<typeof csCapabilityRow>;

// ---------------------------------------------------------------------------
// Frozen four-metric retention KPI roster (§4.3) — the unconditional `must`
// KPIs, each MEASURES exactly one existing retention metric by seedKey (the
// four metrics live at fixed ids 018f0100-…-000000000006..9).
// ---------------------------------------------------------------------------

export const CS_KPIS: CsKpiRow[] = [
  {
    name: "Net Revenue Retention",
    category: "retention",
    unit: "percent",
    target_value: 110,
    target_direction: "up",
    measurement_frequency: "monthly",
    description: "Recurring revenue retained + expanded across existing accounts.",
    metricSeedKey: "metric-nrr",
  },
  {
    name: "Gross Revenue Retention",
    category: "retention",
    unit: "percent",
    target_value: 92,
    target_direction: "up",
    measurement_frequency: "monthly",
    description: "Recurring revenue retained excluding expansion.",
    metricSeedKey: "metric-grr",
  },
  {
    name: "Logo Churn",
    category: "retention",
    unit: "percent",
    target_value: 1,
    target_direction: "down",
    measurement_frequency: "monthly",
    description: "Share of customer accounts (logos) lost in the period.",
    metricSeedKey: "metric-logo-churn",
  },
  {
    name: "Revenue Churn",
    category: "retention",
    unit: "percent",
    target_value: 1,
    target_direction: "down",
    measurement_frequency: "monthly",
    description: "Share of recurring revenue lost to churn and contraction.",
    metricSeedKey: "metric-revenue-churn",
  },
];

// ---------------------------------------------------------------------------
// Conditional CS-specific KPI roster (§4.3, C-02) — Health Score / CSAT /
// Ticket SLA Compliance, keyed by metric seedKey. Each is authored PER-METRIC
// only if its MetricDefinition exists (T-06); XD-06 forbids inventing them here.
// ---------------------------------------------------------------------------

export const CS_CONDITIONAL_KPIS: CsConditionalKpiRow[] = [
  {
    name: "Health Score",
    category: "engagement",
    unit: "score",
    target_value: 80,
    target_direction: "up",
    measurement_frequency: "weekly",
    description: "Composite account-health score from usage/adoption signals.",
    metricSeedKey: "metric-health-score",
  },
  {
    name: "CSAT",
    category: "service",
    unit: "score",
    target_value: 90,
    target_direction: "up",
    measurement_frequency: "monthly",
    description: "Customer satisfaction score from post-resolution surveys.",
    metricSeedKey: "metric-csat",
  },
  {
    name: "Ticket SLA Compliance",
    category: "service",
    unit: "percent",
    target_value: 95,
    target_direction: "up",
    measurement_frequency: "monthly",
    description: "Share of support tickets meeting their response/resolution SLA.",
    metricSeedKey: "metric-ticket-sla-compliance",
  },
];

// ---------------------------------------------------------------------------
// SLA roster (§4.4a) — two support-ticket SLA definitions.
// ---------------------------------------------------------------------------

export const CS_SLAS: CsSlaRow[] = [
  {
    name: "CS Ticket First-Response SLA",
    service_type: "support",
    target_value: 1,
    target_unit: "hours",
    measurement_window: "rolling",
    window_duration: "30d",
    compliance_threshold: 0.95,
    description: "First response to a support ticket within 1 hour.",
  },
  {
    name: "CS Ticket Resolution SLA",
    service_type: "support",
    target_value: 24,
    target_unit: "hours",
    measurement_window: "rolling",
    window_duration: "30d",
    compliance_threshold: 0.9,
    description: "Support ticket resolved within 24 hours.",
  },
];

// ---------------------------------------------------------------------------
// Risk roster (§4.6) — three CS risks, each domain:"Customer Success" verbatim.
// ---------------------------------------------------------------------------

export const CS_RISKS: CsRiskRow[] = [
  {
    name: "Net Churn / Retention Risk",
    owner: "Customer Success Owner",
    domain: "Customer Success",
    likelihood: 3,
    impact: 5,
    status: "mitigating",
    trend: "flat",
    risk_type: "strategic",
    description: "Net revenue retention falls below target as churn outpaces expansion.",
    mitigation_plan: "Health-score-driven save-plays and proactive renewal outreach.",
    linkedJourney: "renewals",
  },
  {
    name: "Support SLA Breach Risk",
    owner: "Customer Success Owner",
    domain: "Customer Success",
    likelihood: 3,
    impact: 4,
    status: "open",
    trend: "up",
    risk_type: "operational",
    description: "Support ticket volume outpaces capacity and breaches response/resolution SLAs.",
    mitigation_plan: "Tiered triage, capacity planning, and escalation runbooks.",
    linkedJourney: "supportTicketing",
  },
  {
    name: "Onboarding Failure Risk",
    owner: "Customer Success Owner",
    domain: "Customer Success",
    likelihood: 2,
    impact: 4,
    status: "mitigating",
    trend: "down",
    risk_type: "operational",
    description: "New accounts stall in onboarding and never reach go-live, driving early churn.",
    mitigation_plan: "Structured onboarding checklist with go-live sign-off gate.",
    linkedJourney: "onboarding",
  },
];

// ---------------------------------------------------------------------------
// Story roster (§4.5) — hand-authored curated stories, each ≥1 Given/When/Then.
// ---------------------------------------------------------------------------

export const CS_STORIES: CsStoryRow[] = [
  {
    persona: "Customer Success Manager",
    action: "see an account's health score",
    benefit: "trigger a save-play before renewal",
    activityId: ACTIVITY_IDS.hsCompute,
    roleId: CS_ROLE_IDS.customerSuccessManager,
    acs: [
      {
        given: "an account has recent usage and adoption signals",
        when: "the CSM opens the account's health view",
        then: "a current composite health score is shown",
      },
      {
        given: "an account's health score drops below the at-risk threshold",
        when: "the CSM reviews the account",
        then: "a save-play can be triggered before renewal",
      },
    ],
  },
  {
    persona: "Onboarding Specialist",
    action: "confirm go-live sign-off",
    benefit: "close out onboarding cleanly",
    activityId: ACTIVITY_IDS.obGoLive,
    roleId: CS_ROLE_IDS.onboardingSpecialist,
    acs: [
      {
        given: "all onboarding steps are complete",
        when: "the onboarding specialist records go-live sign-off",
        then: "the account is marked live and handed to ongoing success",
      },
    ],
  },
  {
    persona: "Renewals Manager",
    action: "forecast upcoming renewals",
    benefit: "prioritize outreach",
    activityId: ACTIVITY_IDS.rnForecast,
    roleId: CS_ROLE_IDS.renewalsManager,
    acs: [
      {
        given: "accounts have upcoming contract end dates",
        when: "the renewals manager runs the renewal forecast",
        then: "at-risk and expansion-ready renewals are ranked for outreach",
      },
    ],
  },
  {
    persona: "Support Agent",
    action: "send a CSAT survey after resolution",
    benefit: "measure service quality",
    activityId: ACTIVITY_IDS.stCsat,
    roleId: CS_ROLE_IDS.supportAgent,
    acs: [
      {
        given: "a support ticket is resolved",
        when: "the support agent closes the ticket",
        then: "a CSAT survey is sent to the customer",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// DDD capability roster (§4.7) — four representative CS capabilities.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Cross-boundary edges (§4.2 note) — the fixture (customer-success.json) carries
// only concrete-id IN-SLICE edges (so the foundation loader can import it with
// no error and no sentinel resolution). The edges that point at SHARED-catalog
// nodes (the CS Domain, shared systems, shared roles) — whose ids are
// server-generated, not fixed — are authored by the seed step (T-03 §4.2a) via
// lookup-before-create `ensureEdge`, after the shared ids are resolved. This is
// the platform-ops-proven encoding (keeps both run modes working, NFR-02).

// journey → CS Domain PART_OF (the domain id is resolved at seed time).
export const JOURNEY_TO_DOMAIN_KEYS = [
  "onboarding",
  "healthScoring",
  "renewals",
  "churnSave",
  "supportTicketing",
] as const;

// shared-Role → CS-Activity EXECUTES (shared role referenced, not duplicated —
// AC-03). `roleKey` is a SHARED_ROLE_KEYS entry, `activityId` a fixed CS id. The
// shared `customer_success_lead` owns the function-level sign-off/close/escalate
// activities alongside the CS-specific roles already assigned in the fixture.
export const SHARED_ROLE_EXECUTES: Array<{ roleKey: string; activityId: string }> = [
  { roleKey: "customer_success_lead", activityId: ACTIVITY_IDS.obGoLive },
  { roleKey: "customer_success_lead", activityId: ACTIVITY_IDS.rnClose },
  { roleKey: "customer_success_lead", activityId: ACTIVITY_IDS.csEscalate },
];

// CS-Activity → shared-System USES_SYSTEM (shared system referenced, not
// re-created — AC-04). `systemKey` is a SHARED_SYSTEM_KEYS entry.
export const SHARED_SYSTEM_USES: Array<{ activityId: string; systemKey: string }> = [
  { activityId: ACTIVITY_IDS.obProvisioning, systemKey: "moms" },
  { activityId: ACTIVITY_IDS.hsIngest, systemKey: "data_warehouse" },
  { activityId: ACTIVITY_IDS.rnForecast, systemKey: "crm" },
  { activityId: ACTIVITY_IDS.rnOutreach, systemKey: "crm" },
  { activityId: ACTIVITY_IDS.rnClose, systemKey: "crm" },
  { activityId: ACTIVITY_IDS.csSavePlay, systemKey: "crm" },
  { activityId: ACTIVITY_IDS.stEscalate, systemKey: "pagerduty" },
];

// ---------------------------------------------------------------------------
// DDD capability roster (§4.7) — four representative CS capabilities.
// ---------------------------------------------------------------------------

export const CS_CAPABILITIES: CsCapabilityRow[] = [
  {
    name: "Health-signal ingestion",
    description: "Ingest usage and adoption signals for account-health scoring.",
    neededByActivityId: ACTIVITY_IDS.hsIngest,
    supportedBy: ["csPlatform", "data_warehouse"],
  },
  {
    name: "Health-score computation",
    description: "Compute a composite account-health score from ingested signals.",
    neededByActivityId: ACTIVITY_IDS.hsCompute,
    supportedBy: ["csPlatform"],
  },
  {
    name: "Ticket routing",
    description: "Intake, triage, and route support tickets to the right queue.",
    neededByActivityId: ACTIVITY_IDS.stTriage,
    supportedBy: ["supportSystem"],
  },
  {
    name: "Renewal forecasting",
    description: "Forecast upcoming renewals and rank accounts for outreach.",
    neededByActivityId: ACTIVITY_IDS.rnForecast,
    supportedBy: ["crm"],
  },
];
