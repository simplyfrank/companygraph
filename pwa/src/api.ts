import type {
  Health,
  Stats,
  ChatEnvelope,
  ChatRequest,
  ProgressSnapshot,
} from "@companygraph/shared/types";
import type { GlossaryCollectionRead, GlossaryTermRead, OntologyProposalRead, ComplianceRuleRead, ComplianceRuleCreate, ComplianceRulePatch } from "@companygraph/shared/schema/ontology";

// Re-export domain modules
export { rdf, queryOntology, ontology, ontologyProposals } from "./api/ontology";
export { complianceRules } from "./api/compliance";
export { glossary } from "./api/glossary";
export { personas, rbacRoles, userPersonas } from "./api/rbac";

// Architecture: signal is optional so health-polling callers that manage
// their own AbortController can still call without one, while useFetch
// callers always provide the signal to enable true HTTP cancellation.
//
// exactOptionalPropertyTypes: RequestInit.signal is AbortSignal | null, not
// AbortSignal | undefined. We spread the signal into init only when defined
// so the property is absent (not undefined) when no signal is provided.
function withSignal(signal: AbortSignal | undefined): RequestInit {
  return signal ? { signal } : {};
}

// GET request deduplication cache to prevent duplicate in-flight requests
const pendingRequests = new Map<string, Promise<any>>();

// Runtime guard to ensure API responses are arrays when expected
// This prevents crashes when backend contract drifts (e.g., { rows: T[] } vs T[])
function guardArray<T>(value: unknown, context: string): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  console.error(`API contract violation: expected array for ${context}, got`, value);
  return [];
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  // Only deduplicate GET requests (no method or method is GET)
  const isGet = !init || !init.method || init.method.toUpperCase() === "GET";
  
  if (isGet) {
    const cacheKey = path;
    if (pendingRequests.has(cacheKey)) {
      return pendingRequests.get(cacheKey) as Promise<T>;
    }
    
    const promise = (async () => {
      try {
        const res = await fetch(path, init);
        if (!res.ok) {
          let detail = "";
          try { detail = JSON.stringify(await res.json()); } catch { /* */ }
          throw new Error(`${res.status} ${res.statusText} ${path} ${detail}`);
        }
        return res.json() as Promise<T>;
      } finally {
        pendingRequests.delete(cacheKey);
      }
    })();
    
    pendingRequests.set(cacheKey, promise);
    return promise;
  }
  
  // For non-GET requests, proceed normally
  const res = await fetch(path, init);
  if (!res.ok) {
    let detail = "";
    try { detail = JSON.stringify(await res.json()); } catch { /* */ }
    throw new Error(`${res.status} ${res.statusText} ${path} ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // GET endpoints accept an optional AbortSignal forwarded from useFetch.
  healthz: (signal?: AbortSignal) => json<Health>("/api/v1/healthz", withSignal(signal)),
  stats: (signal?: AbortSignal) => json<Stats>("/api/v1/stats", withSignal(signal)),

  listDomains: (signal?: AbortSignal) => json<{ rows: DomainRow[] }>("/api/v1/query/listDomains", withSignal(signal)),
  getDomain: (id: string, signal?: AbortSignal) => json<{ rows: DomainDetailRow[] }>(`/api/v1/query/getDomain/${encodeURIComponent(id)}`, withSignal(signal)),
  getJourney: (id: string, signal?: AbortSignal) => json<{ rows: JourneyDetailRow[] }>(`/api/v1/query/getJourney/${encodeURIComponent(id)}`, withSignal(signal)),
  getActivity: (id: string, signal?: AbortSignal) => json<{ rows: ActivityRow[] }>(`/api/v1/query/getActivity/${encodeURIComponent(id)}`, withSignal(signal)),
  neighbors: (id: string, depth = 1, signal?: AbortSignal) => json<{ rows: NeighborRow[] }>(`/api/v1/query/neighbors/${encodeURIComponent(id)}?depth=${depth}`, withSignal(signal)),
  findPath: (fromId: string, toId: string, maxDepth = 4, signal?: AbortSignal) =>
    json<{ rows: PathRow[] }>(`/api/v1/query/findPath?fromId=${encodeURIComponent(fromId)}&toId=${encodeURIComponent(toId)}&maxDepth=${maxDepth}`, withSignal(signal)),

  // T-31 (graph-core amendment from process-explorer-ui/FR-17 + AC-28):
  // per-label fulltext substring search backing FR-08 (palette) and
  // FR-17 (typeahead binding). The handler clamps `limit` to 1..100.
  search: (
    label: string,
    q: string,
    limit = 20,
    signal?: AbortSignal,
  ) =>
    json<{ rows: SearchHit[] }>(
      `/api/v1/query/search?label=${encodeURIComponent(label)}&q=${encodeURIComponent(q)}&limit=${limit}`,
      withSignal(signal),
    ),

  // POST mutations do not accept a signal — they are user-initiated writes
  // that must not be silently cancelled mid-flight.
  cypher: (statement: string, params: Record<string, unknown> = {}) =>
    json<{ rows: Record<string, unknown>[] }>("/api/v1/query/cypher", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ statement, params }),
    }),

  exportJson: (signal?: AbortSignal) => json<{ nodes: ExportNode[]; edges: ExportEdge[] }>("/api/v1/export", withSignal(signal)),
  openapi: (signal?: AbortSignal) => json<Record<string, unknown>>("/api/v1/openapi.json", withSignal(signal)),
  analytics: (signal?: AbortSignal) => json<{
    nodeCount: number;
    edgeCount: number;
    density: number;
    cycles: string[][];
    sccs: string[][];
    communities: { id: string; members: string[] }[];
    betweenness: { node: string; score: number }[];
    pagerank: { node: string; score: number }[];
    degree: { node: string; in: number; out: number }[];
    orphans: string[];
    bottlenecks: { node: string; score: number }[];
  }>("/api/v1/analytics/graph", withSignal(signal)),

  // chat-interface (rev 3.1) — agentic chat surface.
  chat: {
    send: (req: ChatRequest): Promise<ChatEnvelope> =>
      json<ChatEnvelope>("/api/v1/chat/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      }),
    progress: (messageId: string, signal?: AbortSignal): Promise<ProgressSnapshot> =>
      json<ProgressSnapshot>(
        `/api/v1/chat/messages/${encodeURIComponent(messageId)}/progress`,
        withSignal(signal),
      ),
  },

  // ontology-manager — runtime-mutable label / edge-type registry
  ontology: {
    listLabels: async (signal?: AbortSignal) => {
      const data = await json<unknown>("/api/v1/ontology/node-labels", withSignal(signal));
      return guardArray<OntologyLabelRow>(data, "listLabels");
    },
    createLabel: (data: OntologyLabelCreate) =>
      json<OntologyLabelRow>("/api/v1/ontology/node-labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    updateLabel: (name: string, data: OntologyLabelUpdate) =>
      json<OntologyLabelRow>(`/api/v1/ontology/node-labels/${encodeURIComponent(name)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    deleteLabel: (name: string) =>
      json<void>(`/api/v1/ontology/node-labels/${encodeURIComponent(name)}`, {
        method: "DELETE",
      }),
    listEdgeTypes: async (signal?: AbortSignal) => {
      const data = await json<unknown>("/api/v1/ontology/edge-types", withSignal(signal));
      return guardArray<OntologyEdgeTypeRow>(data, "listEdgeTypes");
    },
    createEdgeType: (data: OntologyEdgeTypeCreate) =>
      json<OntologyEdgeTypeRow>("/api/v1/ontology/edge-types", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    updateEdgeType: (name: string, data: OntologyEdgeTypeUpdate) =>
      json<OntologyEdgeTypeRow>(`/api/v1/ontology/edge-types/${encodeURIComponent(name)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    deleteEdgeType: (name: string) =>
      json<void>(`/api/v1/ontology/edge-types/${encodeURIComponent(name)}`, {
        method: "DELETE",
      }),
    getBoundedContexts: async (signal?: AbortSignal) => {
      const data = await json<unknown>("/api/v1/ontology/bounded-contexts", withSignal(signal));
      return guardArray<BoundedContextRow>(data, "getBoundedContexts");
    },
    getBoundedContextNodes: async (signal?: AbortSignal) => {
      const data = await json<unknown>("/api/v1/nodes/BoundedContext", withSignal(signal));
      return guardArray<unknown>(data, "getBoundedContextNodes");
    },
  },

  // kpi-okr-governance FR-10d/FR-15 — resource-shaped domain list for
  // the exec views (name-ordered; replaces the KpiManagement cypher call).
  domains: {
    list: (signal?: AbortSignal) =>
      json<{ rows: DomainRow[] }>("/api/v1/domains", withSignal(signal)),
  },

  // KPI/SLA management (KPI-SLA-01 through KPI-SLA-12)
  kpi: {
    // kpi-okr-governance FR-10a/FR-15 — REST list (rows carry snake_case
    // created_at; ?include_archived=true|1 adds archived KPIs).
    list: (signal?: AbortSignal) =>
      json<{ rows: KPI[] }>("/api/v1/kpis", withSignal(signal)),
    create: (data: KPICreate) =>
      json<KPI>("/api/v1/kpis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    update: (id: string, data: KPIUpdate) =>
      json<KPI>(`/api/v1/kpis/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    archive: (id: string) =>
      json<KPI>(`/api/v1/kpis/${encodeURIComponent(id)}/archive`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    getAuditLog: (id: string, signal?: AbortSignal) =>
      json<{ rows: KPIAuditRow[] }>(`/api/v1/kpis/${encodeURIComponent(id)}/audit`, withSignal(signal)),
    createAlignment: (data: KPIAlignmentCreate) =>
      json<KPIAlignment>("/api/v1/kpi-alignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    deleteAlignment: (id: string) =>
      json<{ deleted: true }>(`/api/v1/kpi-alignments/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    getAlignments: (targetType: string, targetId: string, signal?: AbortSignal) =>
      json<{ rows: KPIAlignmentRow[] }>(`/api/v1/kpi-alignments?target_type=${encodeURIComponent(targetType)}&target_id=${encodeURIComponent(targetId)}`, withSignal(signal)),
    createMeasurement: (data: KPIMeasurementCreate) =>
      json<KPIMeasurement>("/api/v1/kpi-measurements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    getMeasurements: (kpiId: string, limit = 100, offset = 0, signal?: AbortSignal) =>
      json<{ rows: KPIMeasurement[] }>(`/api/v1/kpi-measurements?kpi_id=${encodeURIComponent(kpiId)}&limit=${limit}&offset=${offset}`, withSignal(signal)),
    getMeasurement: (id: string, signal?: AbortSignal) =>
      json<KPIMeasurement>(`/api/v1/kpi-measurements/${encodeURIComponent(id)}`, withSignal(signal)),
    deleteMeasurement: (id: string) =>
      json<{ deleted: true }>(`/api/v1/kpi-measurements/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
  },

  sla: {
    create: (data: SLACreate) =>
      json<SLA>("/api/v1/slas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    update: (id: string, data: SLAUpdate) =>
      json<SLA>(`/api/v1/slas/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    archive: (id: string) =>
      json<SLA>(`/api/v1/slas/${encodeURIComponent(id)}/archive`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    getAuditLog: (id: string, signal?: AbortSignal) =>
      json<{ rows: SLAAuditRow[] }>(`/api/v1/slas/${encodeURIComponent(id)}/audit`, withSignal(signal)),
    createAlignment: (data: SLAAlignmentCreate) =>
      json<SLAAlignment>("/api/v1/sla-alignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    deleteAlignment: (id: string) =>
      json<{ deleted: true }>(`/api/v1/sla-alignments/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    getAlignments: (targetType: string, targetId: string, signal?: AbortSignal) =>
      json<{ rows: SLAAlignmentRow[] }>(`/api/v1/sla-alignments?target_type=${encodeURIComponent(targetType)}&target_id=${encodeURIComponent(targetId)}`, withSignal(signal)),
    createBreach: (data: SLABreachCreate) =>
      json<SLABreach>("/api/v1/sla-breaches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    getBreaches: (slaId: string, resolutionStatus: string | null = null, limit = 100, offset = 0, signal?: AbortSignal) => {
      const params = new URLSearchParams({ sla_id: slaId, limit: limit.toString(), offset: offset.toString() });
      if (resolutionStatus) params.set("resolution_status", resolutionStatus);
      return json<{ rows: SLABreach[] }>(`/api/v1/sla-breaches?${params.toString()}`, withSignal(signal));
    },
    getBreach: (id: string, signal?: AbortSignal) =>
      json<SLABreach>(`/api/v1/sla-breaches/${encodeURIComponent(id)}`, withSignal(signal)),
    updateBreach: (id: string, data: SLABreachUpdate) =>
      json<SLABreach>(`/api/v1/sla-breaches/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    deleteBreach: (id: string) =>
      json<{ deleted: true }>(`/api/v1/sla-breaches/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
  },

  // Persona management (US-PER-01 through US-PER-13)
  persona: {
    create: (data: PersonaCreate) =>
      json<{ persona: Persona }>("/api/v1/personas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    list: (domainId?: string, roleType?: string, isTemplate?: boolean, signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (domainId) params.set("domain_id", domainId);
      if (roleType) params.set("role_type", roleType);
      if (isTemplate !== undefined) params.set("is_template", isTemplate.toString());
      const queryString = params.toString();
      return json<{ personas: Persona[] }>(`/api/v1/personas${queryString ? `?${queryString}` : ""}`, withSignal(signal));
    },
    get: (id: string, signal?: AbortSignal) =>
      json<{ persona: Persona; domains: PersonaDomain[] }>(`/api/v1/personas/${encodeURIComponent(id)}`, withSignal(signal)),
    update: (id: string, data: PersonaUpdate) =>
      json<{ persona: Persona }>(`/api/v1/personas/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    delete: (id: string, force = false) =>
      json<{ success: true }>(`/api/v1/personas/${encodeURIComponent(id)}?force=${force}`, {
        method: "DELETE",
      }),
    createAssignment: (data: PersonaAssignmentCreate) =>
      json<{ assignment: PersonaAssignment }>("/api/v1/persona-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    getAssignments: (domainId: string, signal?: AbortSignal) =>
      json<{ assignments: PersonaAssignmentRow[] }>(`/api/v1/persona-assignments?domain_id=${encodeURIComponent(domainId)}`, withSignal(signal)),
    deleteAssignment: (id: string) =>
      json<{ success: true }>(`/api/v1/persona-assignments/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
  },

  // journey-management enhancements (US-JM-01 through US-JM-10)
  journey: {
    getHealth: (id: string, signal?: AbortSignal) =>
      json<{ rows: JourneyHealthRow[] }>(`/api/v1/query/journeyHealth/${encodeURIComponent(id)}`, withSignal(signal)),
    getOwnership: (id: string, signal?: AbortSignal) =>
      json<{ rows: JourneyOwnershipRow[] }>(`/api/v1/query/journeyOwnership/${encodeURIComponent(id)}`, withSignal(signal)),
    getActivities: (id: string, signal?: AbortSignal) =>
      json<{ rows: JourneyActivityRow[] }>(`/api/v1/query/journeyActivities/${encodeURIComponent(id)}`, withSignal(signal)),
    getRoles: (id: string, signal?: AbortSignal) =>
      json<{ rows: JourneyRoleRow[] }>(`/api/v1/query/journeyRoles/${encodeURIComponent(id)}`, withSignal(signal)),
    getSystems: (id: string, signal?: AbortSignal) =>
      json<{ rows: JourneySystemRow[] }>(`/api/v1/query/journeySystems/${encodeURIComponent(id)}`, withSignal(signal)),
    getHandoffs: (id: string, signal?: AbortSignal) =>
      json<{ rows: JourneyHandoffRow[] }>(`/api/v1/query/journeyHandoffs/${encodeURIComponent(id)}`, withSignal(signal)),
    getTouchpoints: (id: string, signal?: AbortSignal) =>
      json<{ rows: JourneyTouchpointRow[] }>(`/api/v1/query/journeyTouchpoints/${encodeURIComponent(id)}`, withSignal(signal)),
  },
};

export interface DomainRow { id: string; name: string; description: string }
export interface DomainDetailRow {
  id: string;
  name: string;
  description: string;
  journeys: Array<{ id: string; name: string }>;
}
export interface JourneyDetailRow {
  id: string;
  name: string;
  description: string;
  activities: Array<{
    id: string;
    name: string;
    sla_target_hours?: number | null;
    p95_hours?: number | null;
    kpi_score?: number | null;
  }>;
  sla_target_hours?: number | null;
  p95_hours?: number | null;
  kpi_score?: number | null;
  owner_team?: string | null;
  verification?: { by?: string; at?: string } | null;
}

// journey-management enhancements (US-JM-01 through US-JM-10)
export interface JourneyHealthRow {
  id: string;
  name: string;
  health_score: number;
  health_tier: string;
  activity_count: number;
  role_count: number;
  system_count: number;
  handoff_count: number;
  touchpoint_count: number;
  avg_cycle_time_p50: number;
  avg_cycle_time_p99: number;
  sla_breach_rate: number;
  sod_conflicts: number;
  handoff_complexity: number;
}

export interface JourneyOwnershipRow {
  id: string;
  name: string;
  accountable_role: string | null;
  verification_status: string;
  verified_date: string | null;
  verified_by: string | null;
  team_assignments: Array<{ team: string; count: number }>;
  compliance_tags: string[];
  owner_team: string | null;
}

export interface JourneyActivityRow {
  id: string;
  name: string;
  description: string | null;
  order_index: number;
  subprocess_count: number;
  avg_cycle_time_p50: number;
  avg_cycle_time_p99: number;
  sla_target_hours: number | null;
  p95_hours: number | null;
  kpi_score: number | null;
  system_count: number;
  handoff_outgoing: number;
}

export interface JourneyRoleRow {
  id: string;
  name: string;
  team: string | null;
  activity_count: number;
  handoff_count: number;
  sod_conflicts: number;
  handoff_incoming: number;
  handoff_outgoing: number;
}

export interface JourneySystemRow {
  id: string;
  name: string;
  type: string | null;
  activity_count: number;
  read_ops: number;
  write_ops: number;
  async_ops: number;
  sla_breaches: number;
  avg_sla_p99_ms: number;
  usage_count: number;
  touchpoint_count: number;
}

export interface JourneyHandoffRow {
  id: string;
  from_activity: string;
  to_activity: string;
  from_role: string;
  to_role: string;
  from_system: string | null;
  to_system: string | null;
  avg_cycle_time_p50: number;
  avg_cycle_time_p99: number;
  sod_conflict: boolean;
  from_team: string | null;
  to_team: string | null;
  count: number;
  sla_breaches: number;
  sod_risk: string;
}

export interface JourneyTouchpointRow {
  id: string;
  name: string;
  activity: string;
  role: string;
  system: string | null;
  touchpoint_type: string;
  type: string;
  customer_impact: string;
  frequency: string;
  activity_count: number;
  role_count: number;
  critical_path: boolean;
  sla_breaches: number;
}
export interface ActivityRow { id: string; name: string; description: string }
export interface NeighborRow { node: { id: string; name: string }; label: string }
export interface PathRow { length: number; nodes: string[]; edges: string[] }
export interface SearchHit { id: string; name: string; label: string }
export interface ExportNode {
  id: string;
  label: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
}
export interface ExportEdge {
  id: string;
  type: string;
  fromId: string;
  toId: string;
  createdAt: string;
  attributes: Record<string, unknown>;
}

// ontology-manager — node label registry rows
export interface OntologyLabelRow {
  name: string;
  description: string;
  usage_example: string;
  json_schema_doc: Record<string, unknown>;
  external_alignment: Array<{ source: string; id: string }>;
  deprecated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OntologyLabelCreate {
  name: string;
  description: string;
  usage_example: string;
  json_schema_doc: Record<string, unknown>;
  external_alignment?: Array<{ source: string; id: string }>;
}

export interface OntologyLabelUpdate {
  description?: string;
  usage_example?: string;
  json_schema_doc?: Record<string, unknown>;
  external_alignment?: Array<{ source: string; id: string }>;
  deprecated_at?: string | null;
}

export interface OntologyEdgeTypeRow {
  name: string;
  description: string;
  usage_example: string;
  endpoints: Array<{ fromLabel: string; toLabel: string }>;
  external_alignment?: Array<{ source: string; id: string }>;
  deprecated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoundedContextRow {
  id: string;
  name: string;
  description: string;
  domain: string;
  subdomain: string;
  type: string;
  oracle_system?: string;
  jira_projects: string[];
  entity_count: number;
  entities: string[];
  relationships: Array<{ type: string; target: string }>;
}

export interface OntologyEdgeTypeCreate {
  name: string;
  description: string;
  usage_example: string;
  endpoints: Array<{ fromLabel: string; toLabel: string }>;
  external_alignment?: Array<{ source: string; id: string }>;
}

export interface OntologyEdgeTypeUpdate {
  description?: string;
  usage_example?: string;
  endpoints?: Array<{ fromLabel: string; toLabel: string }>;
  external_alignment?: Array<{ source: string; id: string }>;
  deprecated_at?: string | null;
}

// KPI/SLA management types (KPI-SLA-01 through KPI-SLA-12)
export interface KPI {
  id: string;
  name: string;
  description: string | null;
  category: "efficiency" | "quality" | "customer_satisfaction" | "cost" | "time" | "compliance" | "other";
  unit: string;
  target_value: number;
  target_direction: "higher_is_better" | "lower_is_better" | "target_is_exact";
  warning_threshold: number | null;
  critical_threshold: number | null;
  measurement_frequency: "realtime" | "hourly" | "daily" | "weekly" | "monthly" | "quarterly";
  owner_role: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface KPICreate {
  name: string;
  description?: string;
  category: KPI["category"];
  unit: string;
  target_value: number;
  target_direction: KPI["target_direction"];
  warning_threshold?: number;
  critical_threshold?: number;
  measurement_frequency: KPI["measurement_frequency"];
  owner_role?: string;
  domain_id?: string;
}

// Persona management types (US-PER-01 through US-PER-13)
export interface Persona {
  id: string;
  name: string;
  description: string;
  attributes: PersonaAttributes;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface PersonaAttributes {
  roleType?: "strategic" | "operational" | "tactical" | "support";
  contactEmail?: string | null;
  contactPhone?: string | null;
  authorityLevel?: "full" | "partial" | "advisory" | "none";
  authorityScope?: string[];
  monetaryApprovalLimit?: number;
  isPrimary?: boolean;
  allocationPercentage?: number;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  skills?: Array<{
    name: string;
    category: string;
    proficiencyLevel: "beginner" | "intermediate" | "advanced" | "expert";
    isRequired: boolean;
  }>;
  responsibilities?: Array<{
    title: string;
    category: "strategic" | "operational" | "tactical";
    priority: "high" | "medium" | "low";
    linkedKpiId?: string;
    timeExpectation?: "daily" | "weekly" | "monthly" | "quarterly";
  }>;
  supervisorPersonaId?: string;
  peerPersonaIds?: string[];
  collaborationPersonaIds?: string[];
  isTemplate?: boolean;
  templateId?: string;
  templateVersion?: string;
  notes?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface PersonaCreate {
  name: string;
  description?: string;
  attributes?: PersonaAttributes;
}

export interface PersonaUpdate {
  name?: string;
  description?: string;
  attributes?: Partial<PersonaAttributes>;
}

export interface PersonaDomain {
  id: string;
  name: string;
  isPrimary: boolean;
  allocationPercentage: number;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
}

export interface PersonaAssignment {
  id: string;
  personaId: string;
  domainId: string;
  isPrimary: boolean;
  allocationPercentage: number;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  notes: string;
  createdAt: string;
}

export interface PersonaAssignmentCreate {
  personaId: string;
  domainId: string;
  isPrimary?: boolean;
  allocationPercentage?: number;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  notes?: string | null;
}

export interface PersonaAssignmentRow {
  persona: Persona;
  assignment: PersonaAssignment;
}

export interface KPIUpdate {
  name?: string;
  description?: string;
  category?: KPI["category"];
  unit?: string;
  target_value?: number;
  target_direction?: KPI["target_direction"];
  warning_threshold?: number;
  critical_threshold?: number;
  measurement_frequency?: KPI["measurement_frequency"];
  owner_role?: string;
}

export interface KPIAuditRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  action: string;
  user_id: string;
  timestamp: string;
}

export interface KPIAlignment {
  kpi_id: string;
  target_type: "journey" | "activity";
  target_id: string;
  weight: number;
  attribution_type: "direct" | "indirect" | "leading" | "lagging";
  alignment_notes: string | null;
  created_at: string;
}

export interface KPIAlignmentCreate {
  kpi_id: string;
  target_type: "journey" | "activity" | "domain";
  target_id: string;
  weight: number;
  attribution_type: "direct" | "indirect" | "leading" | "lagging";
  alignment_notes?: string;
}

export interface KPIAlignmentRow {
  alignment_id: string | null;
  kpi_id: string;
  kpi_name: string;
  kpi_category: string;
  kpi_unit: string;
  kpi_target_value: number;
  weight: number | null;
  attribution_type: string | null;
  alignment_notes: string | null;
  created_at: string | null;
}

export interface KPIMeasurement {
  id: string;
  kpi_id: string;
  measured_at: string;
  value: number;
  context: Record<string, unknown> | null;
  source: string | null;
  created_at: string;
}

export interface KPIMeasurementCreate {
  kpi_id: string;
  measured_at: string;
  value: number;
  context?: Record<string, unknown>;
  source?: string;
}

export interface SLA {
  id: string;
  name: string;
  description: string | null;
  service_type: "response_time" | "availability" | "throughput" | "accuracy" | "resolution_time" | "other";
  target_value: number;
  target_unit: string;
  measurement_window: "p50" | "p90" | "p95" | "p99" | "average" | "min" | "max";
  window_duration: string;
  penalty_type: "credit" | "service_credit" | "monetary" | "escalation" | "none" | null;
  penalty_amount: number | null;
  compliance_threshold: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface SLACreate {
  name: string;
  description?: string;
  service_type: SLA["service_type"];
  target_value: number;
  target_unit: string;
  measurement_window: SLA["measurement_window"];
  window_duration: string;
  penalty_type?: SLA["penalty_type"];
  penalty_amount?: number;
  compliance_threshold: number;
}

export interface SLAUpdate {
  name?: string;
  description?: string;
  service_type?: SLA["service_type"];
  target_value?: number;
  target_unit?: string;
  measurement_window?: SLA["measurement_window"];
  window_duration?: string;
  penalty_type?: SLA["penalty_type"];
  penalty_amount?: number;
  compliance_threshold?: number;
}

export interface SLAAuditRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  action: string;
  user_id: string;
  timestamp: string;
}

export interface SLAAlignment {
  sla_id: string;
  target_type: "journey" | "activity";
  target_id: string;
  is_critical: boolean;
  alignment_notes: string | null;
  created_at: string;
}

export interface SLAAlignmentCreate {
  sla_id: string;
  target_type: "journey" | "activity" | "domain";
  target_id: string;
  is_critical?: boolean;
  alignment_notes?: string;
}

export interface SLAAlignmentRow {
  sla_id: string;
  sla_name: string;
  service_type: string;
  target_value: number;
  target_unit: string;
  is_critical: boolean;
}

// OKR types
export interface OKRDirective {
  id: string;
  name: string;
  description: string;
  attributes: {
    cycle_name: string;
    cycle_start: string;
    cycle_end: string;
    domain_id: string;
    status: "draft" | "active" | "review" | "closed";
    review_cadence: "weekly" | "monthly" | "quarterly";
  };
  createdAt: string;
  updatedAt: string;
}

export interface OKRDirectiveCreate {
  name: string;
  description: string;
  attributes: {
    cycle_name: string;
    cycle_start: string;
    cycle_end: string;
    domain_id: string;
    status: "draft" | "active" | "review" | "closed";
    review_cadence: "weekly" | "monthly" | "quarterly";
  };
}

export interface KeyResult {
  id: string;
  name: string;
  description: string;
  attributes: {
    baseline_value: number;
    target_value: number;
    current_value: number;
    unit: string;
    direction: "higher_is_better" | "lower_is_better";
    progress: number;
    status: "not_started" | "in_progress" | "achieved" | "at_risk" | "missed";
  };
  createdAt: string;
  updatedAt: string;
}

export interface KeyResultCreate {
  name: string;
  description: string;
  attributes: {
    baseline_value: number;
    target_value: number;
    current_value: number;
    unit: string;
    direction: "higher_is_better" | "lower_is_better";
    progress: number;
    status: "not_started" | "in_progress" | "achieved" | "at_risk" | "missed";
  };
}

export interface KeyResultUpdate {
  name?: string;
  description?: string;
  attributes?: Partial<KeyResult["attributes"]>;
}

export interface OKRPerformance {
  directive: string;
  keyResult: string;
  keyResultAttrs: KeyResult["attributes"];
  kpi: string;
  kpiAttrs: Record<string, unknown>;
}

export interface SLABreach {
  id: string;
  sla_id: string;
  breach_at: string;
  actual_value: number;
  target_value: number;
  severity: "minor" | "major" | "critical";
  impact_description: string | null;
  root_cause: string | null;
  resolution_status: "open" | "investigating" | "resolved" | "mitigated";
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
}

export interface SLABreachCreate {
  sla_id: string;
  breach_at: string;
  actual_value: number;
  target_value: number;
  severity: "minor" | "major" | "critical";
  impact_description?: string;
  root_cause?: string;
}

export interface SLABreachUpdate {
  resolution_status?: "open" | "investigating" | "resolved" | "mitigated";
  resolved_at?: string;
  resolution_notes?: string;
  severity?: "minor" | "major" | "critical";
  impact_description?: string;
  root_cause?: string;
}

// OKR API functions
export const okr = {
  // kpi-okr-governance FR-10c/FR-15 — unfiltered top-level directive
  // list ({rows:[mapped]}, createdAt DESC); replaces the OkrManagement
  // cypher call. The filtered getDirectives keeps its bare-array shape.
  listDirectives: () =>
    json<{ rows: OKRDirective[] }>("/api/v1/okr-directives"),

  createDirective: (data: OKRDirectiveCreate) =>
    json<OKRDirective>("/api/v1/okr-directives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  getDirectives: (domainId: string) =>
    json<OKRDirective[]>(`/api/v1/okr-directives?domain_id=${domainId}`),

  patchDirective: (id: string, data: Partial<OKRDirectiveCreate>) =>
    json<OKRDirective>(`/api/v1/okr-directives/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  deleteDirective: (id: string) =>
    json<{ success: boolean }>(`/api/v1/okr-directives/${id}`, {
      method: "DELETE",
    }),

  createKeyResult: (data: KeyResultCreate) =>
    json<KeyResult>("/api/v1/key-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  getKeyResults: (directiveId: string) =>
    json<KeyResult[]>(`/api/v1/key-results?directive_id=${directiveId}`),

  patchKeyResult: (id: string, data: Partial<KeyResultCreate>) =>
    json<KeyResult>(`/api/v1/key-results/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  deleteKeyResult: (id: string) =>
    json<{ success: boolean }>(`/api/v1/key-results/${id}`, {
      method: "DELETE",
    }),

  getPerformance: (domainId: string) =>
    json<OKRPerformance>(`/api/v1/okr-performance?domain_id=${domainId}`),
};

// ---------------------------------------------------------------------------
// model-workspace-core T-19 (design §4.9, FR-16) — business-model client.
// Typed against the shared T-01 zod schemas. No instantiate method here:
// instance AUTHORING is downstream (design §3.4); listInstances backs
// the read-only instance count/detail surfaces.
// ---------------------------------------------------------------------------

import type {
  ModelRead,
  ModelCreateInput,
  ModelPatchInput,
  InstanceRead,
} from "@companygraph/shared/schema/model-workspace";

export type { ModelRead, InstanceRead };

export const models = {
  list: (signal?: AbortSignal) => json<ModelRead[]>("/api/v1/models", withSignal(signal)),

  get: (id: string, signal?: AbortSignal) =>
    json<ModelRead>(`/api/v1/models/${encodeURIComponent(id)}`, withSignal(signal)),

  create: (data: ModelCreateInput) =>
    json<ModelRead>("/api/v1/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  patch: (id: string, data: ModelPatchInput) =>
    json<ModelRead>(`/api/v1/models/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  archive: (id: string) =>
    json<ModelRead>(`/api/v1/models/${encodeURIComponent(id)}/archive`, { method: "POST" }),

  remove: async (id: string): Promise<void> => {
    const res = await fetch(`/api/v1/models/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      let detail = "";
      try { detail = JSON.stringify(await res.json()); } catch { /* */ }
      throw new Error(`${res.status} ${res.statusText} /api/v1/models/${id} ${detail}`);
    }
  },

  listInstances: (modelId: string, signal?: AbortSignal) =>
    json<InstanceRead[]>(
      `/api/v1/models/${encodeURIComponent(modelId)}/module-instances`,
      withSignal(signal),
    ),
};
