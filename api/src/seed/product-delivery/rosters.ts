// product-delivery-process-model T-01 (design §3.1.1, §4.1–§4.8) — the frozen
// roster DATA + the seedKey↔UUIDv7 allocation map (`SEED_KEYS`) + the internal
// (non-REST) zod input shapes. This module is PURE data + shapes: no driver, no
// fetch, no side effects. The fixture (T-02) is byte-aligned with `SEED_KEYS`;
// the seed step (T-03..T-08) and the tests (T-12) resolve fixture nodes BY
// `seedKey` (never by the literal UUIDv7).
//
// House rules: zod is the only validation library; en-US identifiers; the §4
// rosters are frozen here (the ACs assert set-equality against them).
//
// Id allocation (§3.1.1) — this slice claims the `018f0200-000{1..5}-*` lanes
// (retail-mini uses `018f0000-*`, the metric library `018f0100-*`, and
// platform-ops the sibling `018f0200-0000-*` lane; no collision):
//   journeys           018f0200-0001-7000-8000-0000000000NN  (pd-journey-*)
//   activities         018f0200-0002-7000-8000-0000000000NN  (pd-act-*)
//   slice-local roles  018f0200-0003-7000-8000-0000000000NN  (pd-role-*)
//   slice-local systems 018f0200-0004-7000-8000-0000000000NN (pd-sys-*)
//   bounded context    018f0200-0005-7000-8000-000000000001  (pd-bc-product-delivery)

import { z } from "zod";
import { systemKindSchema } from "@companygraph/shared/schema/system-kind";

// ---------------------------------------------------------------------------
// SEED_KEYS (§3.1.1) — the single source of the fixture node ids. The JSON
// fixture (T-02) MUST mirror these exactly so the seed step's resolve-by-seedKey
// contract lines up with the persisted UUIDv7 ids.
// ---------------------------------------------------------------------------

export const SEED_KEYS = {
  // Journeys — 018f0200-0001-7000-8000-0000000000NN
  "pd-journey-roadmap": "018f0200-0001-7000-8000-000000000001",
  "pd-journey-delivery": "018f0200-0001-7000-8000-000000000002",
  "pd-journey-analytics": "018f0200-0001-7000-8000-000000000003",

  // Activities — 018f0200-0002-7000-8000-0000000000NN
  "pd-act-intake": "018f0200-0002-7000-8000-000000000001",
  "pd-act-prioritize": "018f0200-0002-7000-8000-000000000002",
  "pd-act-roadmap-commit": "018f0200-0002-7000-8000-000000000003",
  "pd-act-author-spec": "018f0200-0002-7000-8000-000000000004",
  "pd-act-design-review": "018f0200-0002-7000-8000-000000000005",
  "pd-act-build": "018f0200-0002-7000-8000-000000000006",
  "pd-act-cut-release": "018f0200-0002-7000-8000-000000000007",
  "pd-act-instrument": "018f0200-0002-7000-8000-000000000008",
  "pd-act-measure-adoption": "018f0200-0002-7000-8000-000000000009",
  "pd-act-synthesize-insight": "018f0200-0002-7000-8000-00000000000a",
  "pd-act-feedback-loop": "018f0200-0002-7000-8000-00000000000b",

  // Slice-local roles — 018f0200-0003-7000-8000-0000000000NN
  "pd-role-pm": "018f0200-0003-7000-8000-000000000001",
  "pd-role-release-eng": "018f0200-0003-7000-8000-000000000002",
  "pd-role-analyst": "018f0200-0003-7000-8000-000000000003",
  "pd-role-swe": "018f0200-0003-7000-8000-000000000004",

  // Slice-local systems — 018f0200-0004-7000-8000-0000000000NN
  "pd-sys-roadmap": "018f0200-0004-7000-8000-000000000001",
  "pd-sys-spec": "018f0200-0004-7000-8000-000000000002",
  "pd-sys-cicd": "018f0200-0004-7000-8000-000000000003",
  "pd-sys-analytics": "018f0200-0004-7000-8000-000000000004",

  // Bounded context — 018f0200-0005-7000-8000-000000000001
  "pd-bc-product-delivery": "018f0200-0005-7000-8000-000000000001",
} as const;

export type SeedKey = keyof typeof SEED_KEYS;

// The shared-catalog System seedKeys (foundation FR-04, resolved by
// `operatorSeedKey` / attributes.seedKey at run time — never a fixed id).
export const SHARED_SYSTEM_KEYS = ["moms", "data_warehouse"] as const;
export type SharedSystemKey = (typeof SHARED_SYSTEM_KEYS)[number];

// ---------------------------------------------------------------------------
// Internal (non-REST) zod input shapes (§7) — permissive, seed-only. The
// authoritative validation is always each governed route's own re-parse at the
// REST boundary; these guard only this seed's own inputs.
// ---------------------------------------------------------------------------

export const journeyRow = z.object({
  seedKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
});
export type JourneyRow = z.infer<typeof journeyRow>;

export const activityRow = z.object({
  seedKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  journeySeedKey: z.string().min(1),
  precedesSeedKey: z.string().min(1).optional(), // the next activity in the chain
});
export type ActivityRow = z.infer<typeof activityRow>;

export const roleRow = z.object({
  seedKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  origin: z.enum(["slice-local", "resolve-or-create"]),
  executes: z.array(z.string().min(1)).min(1), // activity seedKeys
});
export type RoleRow = z.infer<typeof roleRow>;

export const systemRow = z.object({
  seedKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  origin: z.enum(["slice-local", "shared"]),
  systemKind: systemKindSchema.optional(), // slice-local systems only
  usedBy: z.array(z.string().min(1)).min(1), // activity seedKeys
});
export type SystemRow = z.infer<typeof systemRow>;

export const kpiRow = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.string().min(1),
  target_value: z.number(),
  target_direction: z.string().min(1), // N-05: `up`/`down`, NOT the SLA enum
  measurement_frequency: z.string().min(1),
  owner_role: z.string().optional(),
  description: z.string().optional(),
  // ALIGNED_TO targets — journey/activity by seedKey, or the domain.
  alignTargets: z
    .array(
      z.object({
        type: z.enum(["journey", "activity", "domain"]),
        key: z.string(), // a seedKey, or "domain"
      }),
    )
    .min(1),
});
export type KpiRow = z.infer<typeof kpiRow>;

export const acRow = z.object({
  given: z.string().min(1),
  when: z.string().min(1),
  then: z.string().min(1),
});
export const storyRow = z.object({
  storyKey: z.string().min(1),
  persona: z.string().min(1),
  action: z.string().min(1),
  benefit: z.string().min(1),
  activitySeedKey: z.string().min(1), // DESCRIBES_ACTIVITY
  roleName: z.string().min(1).optional(), // STORY_FOR_ROLE (where a role exists)
  acs: z.array(acRow).min(1),
});
export type StoryRow = z.infer<typeof storyRow>;

export const capabilityRow = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  neededByActivitySeedKey: z.string().min(1), // Activity -[:NEEDS_CAPABILITY]-> Capability
  supportedBySystemSeedKey: z.string().min(1), // Capability -[:SUPPORTED_BY]-> System
});
export type CapabilityRow = z.infer<typeof capabilityRow>;

export const riskRow = z.object({
  name: z.string().min(1),
  owner: z.string().min(1),
  domain: z.string().min(1),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  status: z.enum(["open", "mitigating", "accepted", "resolved"]),
  trend: z.enum(["up", "flat", "down"]),
  risk_type: z.enum(["strategic", "operational", "technical"]),
  description: z.string().optional(),
  mitigation_plan: z.string().optional(),
  // OQ-4: link to the graph entity the risk concerns.
  linked_entity_type: z.enum(["domain", "activity"]),
  linkedActivitySeedKey: z.string().min(1).optional(), // when linked_entity_type = "activity"
});
export type RiskRow = z.infer<typeof riskRow>;

// ---------------------------------------------------------------------------
// Frozen rosters (§4)
// ---------------------------------------------------------------------------

// §4.1 — three Product journeys.
export const JOURNEY_ROWS: JourneyRow[] = [
  {
    seedKey: "pd-journey-roadmap",
    name: "Roadmap & Discovery",
    description: "Opportunity intake → prioritization → roadmap commit.",
  },
  {
    seedKey: "pd-journey-delivery",
    name: "Spec-Driven Delivery",
    description: "Spec authoring → design/tasks → build → release.",
  },
  {
    seedKey: "pd-journey-analytics",
    name: "Product Analytics",
    description: "Instrumentation → adoption measurement → insight → feedback loop.",
  },
];

// §4.2 — activities per journey, ordered by the PRECEDES chain.
export const ACTIVITY_ROWS: ActivityRow[] = [
  // Roadmap & Discovery
  {
    seedKey: "pd-act-intake",
    name: "Intake opportunity",
    description: "Capture and qualify a product opportunity.",
    journeySeedKey: "pd-journey-roadmap",
    precedesSeedKey: "pd-act-prioritize",
  },
  {
    seedKey: "pd-act-prioritize",
    name: "Prioritize backlog",
    description: "Rank the backlog against opportunity value.",
    journeySeedKey: "pd-journey-roadmap",
    precedesSeedKey: "pd-act-roadmap-commit",
  },
  {
    seedKey: "pd-act-roadmap-commit",
    name: "Commit roadmap",
    description: "Commit the prioritized roadmap for the delivery cycle.",
    journeySeedKey: "pd-journey-roadmap",
  },
  // Spec-Driven Delivery
  {
    seedKey: "pd-act-author-spec",
    name: "Author feature spec",
    description: "Author the approved feature spec that starts delivery.",
    journeySeedKey: "pd-journey-delivery",
    precedesSeedKey: "pd-act-design-review",
  },
  {
    seedKey: "pd-act-design-review",
    name: "Design & task review",
    description: "Review the design and task breakdown before build.",
    journeySeedKey: "pd-journey-delivery",
    precedesSeedKey: "pd-act-build",
  },
  {
    seedKey: "pd-act-build",
    name: "Build & integrate",
    description: "Implement and integrate the feature per the approved spec.",
    journeySeedKey: "pd-journey-delivery",
    precedesSeedKey: "pd-act-cut-release",
  },
  {
    seedKey: "pd-act-cut-release",
    name: "Cut release",
    description: "Cut and ship the release to production.",
    journeySeedKey: "pd-journey-delivery",
  },
  // Product Analytics
  {
    seedKey: "pd-act-instrument",
    name: "Instrument features",
    description: "Instrument the shipped features for adoption measurement.",
    journeySeedKey: "pd-journey-analytics",
    precedesSeedKey: "pd-act-measure-adoption",
  },
  {
    seedKey: "pd-act-measure-adoption",
    name: "Measure adoption",
    description: "Measure feature adoption after release.",
    journeySeedKey: "pd-journey-analytics",
    precedesSeedKey: "pd-act-synthesize-insight",
  },
  {
    seedKey: "pd-act-synthesize-insight",
    name: "Synthesize insight",
    description: "Synthesize product insight from adoption signals.",
    journeySeedKey: "pd-journey-analytics",
    precedesSeedKey: "pd-act-feedback-loop",
  },
  {
    seedKey: "pd-act-feedback-loop",
    name: "Feed back to roadmap",
    description: "Feed insight back into the roadmap.",
    journeySeedKey: "pd-journey-analytics",
  },
];

// §4.3 — roles + EXECUTES targets (by activity seedKey).
export const ROLE_ROWS: RoleRow[] = [
  {
    seedKey: "pd-role-pm",
    name: "Product Manager",
    description: "Owns roadmap, prioritization, and feature specs.",
    origin: "slice-local",
    executes: [
      "pd-act-intake",
      "pd-act-prioritize",
      "pd-act-roadmap-commit",
      "pd-act-author-spec",
      "pd-act-feedback-loop",
    ],
  },
  {
    seedKey: "pd-role-release-eng",
    name: "Release Engineer",
    description: "Owns build integration and cutting releases.",
    origin: "slice-local",
    executes: ["pd-act-build", "pd-act-cut-release"],
  },
  {
    seedKey: "pd-role-analyst",
    name: "Product Analyst",
    description: "Owns instrumentation, adoption measurement, and insight.",
    origin: "slice-local",
    executes: [
      "pd-act-instrument",
      "pd-act-measure-adoption",
      "pd-act-synthesize-insight",
    ],
  },
  {
    seedKey: "pd-role-swe",
    name: "Software Engineer",
    description: "Reviews designs/tasks and implements features.",
    origin: "resolve-or-create", // shared if the foundation catalog provides it, else slice-local
    executes: ["pd-act-design-review", "pd-act-build"],
  },
];

// §4.4 — systems + USES_SYSTEM targets. Shared systems resolve from the
// foundation catalog by seedKey (never re-created); slice-local systems carry a
// valid systemKind.
export const SYSTEM_ROWS: SystemRow[] = [
  {
    seedKey: "moms",
    name: "MOMS",
    description: "Medical-office SaaS product — instrumented for product analytics.",
    origin: "shared",
    usedBy: ["pd-act-instrument", "pd-act-measure-adoption"],
  },
  {
    seedKey: "data_warehouse",
    name: "Data Warehouse",
    description: "Analytics/reporting data warehouse for adoption measurement.",
    origin: "shared",
    usedBy: ["pd-act-measure-adoption", "pd-act-synthesize-insight"],
  },
  {
    seedKey: "pd-sys-roadmap",
    name: "Roadmap Tool",
    description: "Opportunity intake, prioritization, and roadmap commit.",
    origin: "slice-local",
    systemKind: "functional",
    usedBy: ["pd-act-intake", "pd-act-prioritize", "pd-act-roadmap-commit"],
  },
  {
    seedKey: "pd-sys-spec",
    name: "Spec/Docs System",
    description: "Feature spec authoring and design/task review.",
    origin: "slice-local",
    systemKind: "functional",
    usedBy: ["pd-act-author-spec", "pd-act-design-review"],
  },
  {
    seedKey: "pd-sys-cicd",
    name: "CI/CD Pipeline",
    description: "Build integration and cutting releases to production.",
    origin: "slice-local",
    systemKind: "functional",
    usedBy: ["pd-act-build", "pd-act-cut-release"],
  },
  {
    seedKey: "pd-sys-analytics",
    name: "Product Analytics",
    description: "Feature instrumentation, adoption measurement, and insight.",
    origin: "slice-local",
    systemKind: "ai_predictive",
    usedBy: [
      "pd-act-instrument",
      "pd-act-measure-adoption",
      "pd-act-synthesize-insight",
    ],
  },
];

// §4.5 — four Product KPIs. `category`/`target_direction` use the lenient
// as-built kpiCreateRequestSchema (N-05: `up`/`down`, free-string category).
export const KPI_ROWS: KpiRow[] = [
  {
    name: "Release Frequency",
    category: "efficiency",
    unit: "count",
    target_value: 20,
    target_direction: "up",
    measurement_frequency: "weekly",
    owner_role: "Release Engineer",
    description: "Production release cadence for the Product function.",
    alignTargets: [
      { type: "journey", key: "pd-journey-delivery" },
      { type: "activity", key: "pd-act-cut-release" },
    ],
  },
  {
    name: "Cycle Time",
    category: "efficiency",
    unit: "days",
    target_value: 5,
    target_direction: "down",
    measurement_frequency: "weekly",
    owner_role: "Product Manager",
    description: "Time from spec approval to release.",
    alignTargets: [{ type: "journey", key: "pd-journey-delivery" }],
  },
  {
    name: "Feature Adoption",
    category: "retention",
    unit: "percent",
    target_value: 40,
    target_direction: "up",
    measurement_frequency: "monthly",
    owner_role: "Product Analyst",
    description: "Share of active users adopting a shipped feature.",
    alignTargets: [
      { type: "journey", key: "pd-journey-analytics" },
      { type: "activity", key: "pd-act-measure-adoption" },
    ],
  },
  {
    name: "Spec Throughput",
    category: "efficiency",
    unit: "count",
    target_value: 8,
    target_direction: "up",
    measurement_frequency: "monthly",
    owner_role: "Product Manager",
    description: "Approved feature specs committed per cycle.",
    alignTargets: [{ type: "journey", key: "pd-journey-roadmap" }],
  },
];

// §4.6 — one story per journey, each with ≥1 Given/When/Then AC.
export const STORY_ROWS: StoryRow[] = [
  {
    storyKey: "pd-story-roadmap",
    persona: "Product Manager",
    action: "prioritize the backlog against opportunity value",
    benefit: "engineering builds the highest-impact features first",
    activitySeedKey: "pd-act-prioritize",
    roleName: "Product Manager",
    acs: [
      {
        given: "a backlog of scored opportunities",
        when: "the Product Manager prioritizes the backlog",
        then: "the top opportunities are ranked for the roadmap",
      },
    ],
  },
  {
    storyKey: "pd-story-delivery",
    persona: "Product Manager",
    action: "start every feature from an approved spec",
    benefit: "delivery is traceable and review-gated",
    activitySeedKey: "pd-act-author-spec",
    roleName: "Product Manager",
    acs: [
      {
        given: "a committed roadmap item",
        when: "the Product Manager authors its feature spec",
        then: "the spec is approved before build begins",
      },
    ],
  },
  {
    storyKey: "pd-story-analytics",
    persona: "Product Analyst",
    action: "measure feature adoption after release",
    benefit: "the roadmap is informed by real usage",
    activitySeedKey: "pd-act-measure-adoption",
    roleName: "Product Analyst",
    acs: [
      {
        given: "a released, instrumented feature",
        when: "the Product Analyst measures its adoption",
        then: "an adoption signal is available to the roadmap",
      },
    ],
  },
];

// §4.7 — DDD capabilities (each NEEDS_CAPABILITY ← Activity, SUPPORTED_BY →
// System, ASSIGNED_TO_CONTEXT → the Product Delivery Context).
export const BOUNDED_CONTEXT = {
  seedKey: "pd-bc-product-delivery",
  name: "Product Delivery Context",
  description: "Bounded context for the Product & Delivery function.",
  domain: "Product & Delivery",
  subdomain: "delivery",
  type: "Core" as const,
};

export const CAPABILITY_ROWS: CapabilityRow[] = [
  {
    name: "Roadmap Prioritization",
    description: "Rank opportunities and commit the roadmap.",
    neededByActivitySeedKey: "pd-act-prioritize",
    supportedBySystemSeedKey: "pd-sys-roadmap",
  },
  {
    name: "Continuous Delivery",
    description: "Build, integrate, and cut releases continuously.",
    neededByActivitySeedKey: "pd-act-cut-release",
    supportedBySystemSeedKey: "pd-sys-cicd",
  },
  {
    name: "Product Instrumentation",
    description: "Instrument features and measure adoption.",
    neededByActivitySeedKey: "pd-act-instrument",
    supportedBySystemSeedKey: "pd-sys-analytics",
  },
];

// §4.8 — Product/delivery risks (OQ-4: each linked to a graph entity).
export const RISK_ROWS: RiskRow[] = [
  {
    name: "Roadmap thrash / shifting priorities",
    owner: "Product Lead",
    domain: "Product & Delivery",
    likelihood: 3,
    impact: 3,
    status: "mitigating",
    trend: "flat",
    risk_type: "strategic",
    description: "Frequently shifting priorities churn the roadmap and starve delivery focus.",
    mitigation_plan: "Time-boxed roadmap commits with an explicit change-control gate.",
    linked_entity_type: "domain",
  },
  {
    name: "Release regression escaping to production",
    owner: "Product Lead",
    domain: "Product & Delivery",
    likelihood: 2,
    impact: 4,
    status: "open",
    trend: "up",
    risk_type: "technical",
    description: "A regression escapes the release cut and reaches production.",
    mitigation_plan: "Gated release checks and progressive rollout with rollback.",
    linked_entity_type: "activity",
    linkedActivitySeedKey: "pd-act-cut-release",
  },
  {
    name: "Spec-throughput bottleneck starving delivery",
    owner: "Product Lead",
    domain: "Product & Delivery",
    likelihood: 3,
    impact: 3,
    status: "mitigating",
    trend: "flat",
    risk_type: "operational",
    description: "Slow spec authoring bottlenecks the delivery pipeline.",
    mitigation_plan: "Spec templates and a parallel authoring cadence.",
    linked_entity_type: "activity",
    linkedActivitySeedKey: "pd-act-author-spec",
  },
];
