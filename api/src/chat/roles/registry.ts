// Behavioral role registry (FR-R01, DD-05). 20 roles total:
//   - 1 default `graph_analyst` (only role with `cypher` access)
//   - 14 journey roles (`uj_*`) — strict tool subsets, no `cypher`
//   - 5 cross-section analytical roles — strict tool subsets, no `cypher`
//
// `allowed_tools` per role mirrors the FR-R01 catalog verbatim. The
// `system_prompt_overlay_path` is resolved by `prompt-loader.ts` at
// turn time (lazy async read + in-process cache). `suggested_prompts`
// support `{selected_*}` placeholders that the PWA substitutes from
// the current explorer selection (FR-C04).

import { CHAT_ROLE_IDS, type ChatRoleId, type ToolName } from "@companygraph/shared";

export interface RoleDef {
  id: ChatRoleId;
  label: string;
  description: string;
  allowed_tools: ToolName[];
  // Path is relative to `api/src/chat/roles/prompts/` — the loader
  // resolves the directory; consumers pass the bare filename.
  system_prompt_overlay_path: string;
  // Prompts may contain `{selected_activity}` / `{selected_edge}` /
  // `{selected_node}` placeholders. The PWA fills them in from the
  // currently-selected explorer element; otherwise the placeholder
  // is left intact (the LLM treats it as a literal token).
  suggested_prompts: string[];
}

// FR-R01 catalog — verbatim from requirements.md.
export const ROLES: Record<ChatRoleId, RoleDef> = {
  graph_analyst: {
    id: "graph_analyst",
    label: "Default graph analyst",
    description:
      "Pick the right tool. If none fits, use cypher as an escape hatch.",
    allowed_tools: [
      "list_domains",
      "get_domain",
      "get_journey",
      "get_activity",
      "list_nodes_by_label",
      "neighbors",
      "find_path",
      "aggregate",
      "sla_hotspots",
      "handoff_matrix",
      "sod_register",
      "ai_candidates",
      "initiative_impact",
      "cypher",
      "describe_schema",
    ],
    system_prompt_overlay_path: "graph_analyst.md",
    suggested_prompts: [
      "What domains exist?",
      "Which systems does Order Fulfillment use?",
      "Show me critical paths.",
      "Describe the schema.",
    ],
  },
  uj_web_browse_buy: {
    id: "uj_web_browse_buy",
    label: "Web browse→buy",
    description:
      "Self-serve digital funnel. Bias toward SLA + conversion drop-offs.",
    allowed_tools: [
      "get_journey",
      "get_activity",
      "neighbors",
      "sla_hotspots",
      "describe_schema",
    ],
    system_prompt_overlay_path: "uj_web_browse_buy.md",
    suggested_prompts: [
      "Which activities have SLA breaches?",
      "Who executes {selected_activity}?",
      "Show neighbors of {selected_node}.",
    ],
  },
  uj_in_store_buy: {
    id: "uj_in_store_buy",
    label: "In-store buy",
    description:
      "Single-team CS journey. Bias toward role+system bindings.",
    allowed_tools: [
      "get_journey",
      "get_activity",
      "neighbors",
      "describe_schema",
    ],
    system_prompt_overlay_path: "uj_in_store_buy.md",
    suggested_prompts: [
      "Which systems does this journey use?",
      "Who executes {selected_activity}?",
      "Show role bindings.",
    ],
  },
  uj_loyalty_signup: {
    id: "uj_loyalty_signup",
    label: "Loyalty signup",
    description:
      "Cross-team handoff; SoD-sensitive (capture<->verify same-actor risk).",
    allowed_tools: [
      "get_journey",
      "get_activity",
      "neighbors",
      "sod_register",
      "describe_schema",
    ],
    system_prompt_overlay_path: "uj_loyalty_signup.md",
    suggested_prompts: [
      "Show SoD conflicts on this journey.",
      "Who executes {selected_activity}?",
      "Explain the capture-verify handoff.",
    ],
  },
  uj_order_fulfillment: {
    id: "uj_order_fulfillment",
    label: "Order fulfillment",
    description:
      "Critical-path heavy; expect 'show handoffs / breaches' questions.",
    allowed_tools: [
      "get_journey",
      "get_activity",
      "neighbors",
      "find_path",
      "sla_hotspots",
      "handoff_matrix",
      "sod_register",
      "describe_schema",
    ],
    system_prompt_overlay_path: "uj_order_fulfillment.md",
    suggested_prompts: [
      "Show me hand-offs on this journey.",
      "Which activities have SLA breaches?",
      "Who executes {selected_activity}?",
      "Explain {selected_edge}.",
    ],
  },
  uj_click_collect: {
    id: "uj_click_collect",
    label: "Click & collect",
    description:
      "Single-team ops; bias toward SMS / SLA / store-pickup edges.",
    allowed_tools: [
      "get_journey",
      "get_activity",
      "neighbors",
      "sla_hotspots",
      "describe_schema",
    ],
    system_prompt_overlay_path: "uj_click_collect.md",
    suggested_prompts: [
      "Which pickup edges breach SLA?",
      "Show neighbors of {selected_activity}.",
      "Who executes order-ready notification?",
    ],
  },
  uj_returns_intake: {
    id: "uj_returns_intake",
    label: "Returns intake",
    description: "SoD high (approve<->refund); bias toward conflicts.",
    allowed_tools: [
      "get_journey",
      "get_activity",
      "neighbors",
      "sla_hotspots",
      "sod_register",
      "describe_schema",
    ],
    system_prompt_overlay_path: "uj_returns_intake.md",
    suggested_prompts: [
      "Show SoD conflicts.",
      "Which return-intake edges breach SLA?",
      "Who executes refund authorisation?",
    ],
  },
  uj_same_day: {
    id: "uj_same_day",
    label: "Same-day delivery",
    description:
      "Tight 90-min SLA; bias toward path latency + courier breaches.",
    allowed_tools: [
      "get_journey",
      "get_activity",
      "find_path",
      "sla_hotspots",
      "describe_schema",
    ],
    system_prompt_overlay_path: "uj_same_day.md",
    suggested_prompts: [
      "What's the critical path?",
      "Which edges breach the 90-min SLA?",
      "Show same-day courier latency.",
    ],
  },
  uj_inbound_receiving: {
    id: "uj_inbound_receiving",
    label: "Inbound receiving",
    description: "DC + WH co-located; ERP-edge SLA focus.",
    allowed_tools: [
      "get_journey",
      "get_activity",
      "neighbors",
      "sla_hotspots",
      "describe_schema",
    ],
    system_prompt_overlay_path: "uj_inbound_receiving.md",
    suggested_prompts: [
      "Which ERP edges breach SLA?",
      "Show neighbors of {selected_activity}.",
      "Who executes dock-to-bin?",
    ],
  },
  uj_replenishment: {
    id: "uj_replenishment",
    label: "Replenishment",
    description: "WH->HQ handoff; PO-cycle path.",
    allowed_tools: [
      "get_journey",
      "get_activity",
      "neighbors",
      "find_path",
      "describe_schema",
    ],
    system_prompt_overlay_path: "uj_replenishment.md",
    suggested_prompts: [
      "Show the PO-cycle path.",
      "Who executes {selected_activity}?",
      "Show neighbors of replenishment trigger.",
    ],
  },
  uj_promo_planning: {
    id: "uj_promo_planning",
    label: "Promo planning",
    description:
      "Marketing<->HQ handoff; SoD-flagged (SKUs<->Approve).",
    allowed_tools: [
      "get_journey",
      "get_activity",
      "neighbors",
      "handoff_matrix",
      "sod_register",
      "describe_schema",
    ],
    system_prompt_overlay_path: "uj_promo_planning.md",
    suggested_prompts: [
      "Show Marketing<->HQ hand-offs.",
      "Show SoD conflicts.",
      "Who executes promo approval?",
    ],
  },
  uj_refund_flow: {
    id: "uj_refund_flow",
    label: "Refund flow",
    description:
      "Same-actor SoD (validate<->authorise); Payment-gw breach.",
    allowed_tools: [
      "get_journey",
      "get_activity",
      "neighbors",
      "sla_hotspots",
      "sod_register",
      "describe_schema",
    ],
    system_prompt_overlay_path: "uj_refund_flow.md",
    suggested_prompts: [
      "Show validate<->authorise SoD conflict.",
      "Which refund edges breach SLA?",
      "Who executes refund authorisation?",
    ],
  },
  uj_email_triage: {
    id: "uj_email_triage",
    label: "Email triage",
    description: "AI candidate (leverage 0.78); ML-inference SLA.",
    allowed_tools: [
      "get_journey",
      "get_activity",
      "neighbors",
      "sla_hotspots",
      "ai_candidates",
      "describe_schema",
    ],
    system_prompt_overlay_path: "uj_email_triage.md",
    suggested_prompts: [
      "Show AI automation candidates.",
      "Which inference edges breach SLA?",
      "What's the leverage score for triage?",
    ],
  },
  uj_phone_support: {
    id: "uj_phone_support",
    label: "Phone support",
    description: "IVR SLA warn; single-team.",
    allowed_tools: [
      "get_journey",
      "get_activity",
      "neighbors",
      "sla_hotspots",
      "describe_schema",
    ],
    system_prompt_overlay_path: "uj_phone_support.md",
    suggested_prompts: [
      "Which IVR edges are SLA-warn?",
      "Show neighbors of {selected_activity}.",
      "Who executes call routing?",
    ],
  },
  uj_instore_complaint: {
    id: "uj_instore_complaint",
    label: "In-store complaint",
    description: "SoD medium (resolve<->document).",
    allowed_tools: [
      "get_journey",
      "get_activity",
      "neighbors",
      "sod_register",
      "describe_schema",
    ],
    system_prompt_overlay_path: "uj_instore_complaint.md",
    suggested_prompts: [
      "Show resolve<->document SoD conflict.",
      "Who executes complaint logging?",
      "Show neighbors of {selected_activity}.",
    ],
  },
  sla_hotspots: {
    id: "sla_hotspots",
    label: "SLA hotspots analyst",
    description: "Cross-journey ranked SLA-breach view.",
    allowed_tools: [
      "get_journey",
      "aggregate",
      "sla_hotspots",
      "describe_schema",
    ],
    system_prompt_overlay_path: "sla_hotspots.md",
    suggested_prompts: [
      "Show the worst breaches across all journeys.",
      "Which journey has the most breaches?",
      "Rank edges by delta_pct.",
    ],
  },
  handoff_matrix: {
    id: "handoff_matrix",
    label: "Hand-off matrix",
    description: "Team x team cell counts; navigate by cell.",
    allowed_tools: ["aggregate", "handoff_matrix", "describe_schema"],
    system_prompt_overlay_path: "handoff_matrix.md",
    suggested_prompts: [
      "Show the team<->team handoff matrix.",
      "Which team pair has the most handoffs?",
      "Aggregate handoffs by team pair.",
    ],
  },
  sod_register: {
    id: "sod_register",
    label: "SoD register",
    description: "Severity-ranked compliance view; explain control id.",
    allowed_tools: ["aggregate", "sod_register", "describe_schema"],
    system_prompt_overlay_path: "sod_register.md",
    suggested_prompts: [
      "Show the SoD register sorted by severity.",
      "Which controls are violated?",
      "Aggregate SoD entries by regulation.",
    ],
  },
  ai_candidates: {
    id: "ai_candidates",
    label: "AI candidates",
    description: "Automation ROI ranking; explain leverage score.",
    allowed_tools: ["aggregate", "ai_candidates", "describe_schema"],
    system_prompt_overlay_path: "ai_candidates.md",
    suggested_prompts: [
      "Show top AI automation candidates.",
      "What's the leverage score formula?",
      "Aggregate candidates by journey.",
    ],
  },
  initiative_impact: {
    id: "initiative_impact",
    label: "Initiative impact",
    description:
      "Initiative->delta(cycle_time, cost, domains) explainer.",
    allowed_tools: ["aggregate", "initiative_impact", "describe_schema"],
    system_prompt_overlay_path: "initiative_impact.md",
    suggested_prompts: [
      "What does this initiative change?",
      "Show delta cycle time.",
      "Which domains are touched?",
    ],
  },
};

// Frozen snapshot of every registered role id — useful for tests and
// callers that need to iterate the catalog without depending on
// `Object.keys` typing.
const ROLE_IDS_FROZEN: readonly ChatRoleId[] = Object.freeze([
  ...CHAT_ROLE_IDS,
]);

export function getRole(id: ChatRoleId): RoleDef {
  const role = ROLES[id];
  if (!role) {
    // Defensive: `ChatRoleId` is a literal union so this branch should
    // only ever fire if the caller bypassed the type system.
    throw new Error(`unknown role id: ${id}`);
  }
  return role;
}

export function getDefaultRole(): RoleDef {
  return ROLES.graph_analyst;
}

export function listAllRoleIds(): readonly ChatRoleId[] {
  return ROLE_IDS_FROZEN;
}
