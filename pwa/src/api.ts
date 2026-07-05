import type {
  Health,
  Stats,
  ChatEnvelope,
  ChatRequest,
  ProgressSnapshot,
} from "@companygraph/shared/types";
import type { GlossaryCollectionRead, GlossaryTermRead, OntologyProposalRead, ComplianceRuleRead, ComplianceRuleCreate, ComplianceRulePatch } from "@companygraph/shared/schema/ontology";
// key-activity-optimizer T-13 — types inferred from the shared T-01
// zod schemas (shared/src/schema/key-activity.ts).
import type {
  KeyActivityScores,
  ActivityScoreRow,
} from "@companygraph/shared/schema/key-activity";
// kpi-okr-performance-dashboards T-12 — aggregate response types from
// the shared zod contract (shared/src/schema/performance.ts).
import type {
  PerformanceSliceQuery,
  KpiStatusResponse,
  OkrPerformanceResponse,
  JourneyAxisResponse,
} from "@companygraph/shared/schema/performance";
export type {
  PerformanceSliceQuery,
  KpiStatusResponse,
  OkrPerformanceResponse,
  JourneyAxisResponse,
};

export type { KeyActivityScores, ActivityScoreRow };
export type { KeyActivityMark } from "@companygraph/shared/schema/key-activity";
// ddd-system-modeling T-12 — types inferred from the shared T-01 zod
// schemas (shared/src/schema/ddd-system.ts).
import type {
  CapabilityRead,
  GapsResult,
  ContextMapResult,
} from "@companygraph/shared/schema/ddd-system";
export type { CapabilityRead, GapsResult, ContextMapResult };
export type {
  NeededByItem,
  SupportedByItem,
  DetachedItem,
  GapStepItem,
  AugmentationMix,
  KindCounts,
} from "@companygraph/shared/schema/ddd-system";

// kpi-impact-mapping T-13 — types inferred from the shared T-01 zod
// schemas (shared/src/schema/kpi-impact.ts).
import type {
  KpiImpactMatrix,
  KpiImpactRollup,
  ImpactLinkRow,
  ActivityLinkCreate,
  StoryLinkCreate,
} from "@companygraph/shared/schema/kpi-impact";
export type { KpiImpactMatrix, KpiImpactRollup, ImpactLinkRow };

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
    getSharedDomains: async (signal?: AbortSignal) => {
      const data = await json<unknown>("/api/v1/ontology/shared-domains", withSignal(signal));
      return guardArray<SharedDomainRow>(data, "getSharedDomains");
    },
    getNamespaces: async (modelId?: string, signal?: AbortSignal) => {
      const qs = modelId ? `?model_id=${encodeURIComponent(modelId)}` : "";
      const data = await json<unknown>(`/api/v1/ontology/namespaces${qs}`, withSignal(signal));
      return guardArray<NamespaceRow>(data, "getNamespaces");
    },
  },

  // kpi-okr-governance FR-10d/FR-15 — resource-shaped domain list for
  // the exec views (name-ordered; replaces the KpiManagement cypher call).
  domains: {
    list: (signal?: AbortSignal) =>
      json<{ rows: DomainRow[] }>("/api/v1/domains", withSignal(signal)),
  },

  // kpi-okr-performance-dashboards T-12 (design §6 data layer, §4.7) —
  // read-only performance aggregates for the #/exec/performance view.
  // NEW object only (N-02): the per-domain okr.getPerformance below and
  // kpi.list/domains.list are untouched — these methods are additional,
  // not extensions of them. Types come from the shared zod contract.
  performance: {
    kpis: (slice: PerformanceSliceQuery, signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (slice.domain) params.set("domain", slice.domain);
      if (slice.journey) params.set("journey", slice.journey);
      if (slice.kind) params.set("kind", slice.kind);
      const qs = params.toString();
      return json<KpiStatusResponse>(
        `/api/v1/analytics/performance/kpis${qs ? `?${qs}` : ""}`,
        withSignal(signal),
      );
    },
    okr: (domainId?: string, signal?: AbortSignal) =>
      json<OkrPerformanceResponse>(
        `/api/v1/analytics/performance/okr${domainId ? `?domain=${encodeURIComponent(domainId)}` : ""}`,
        withSignal(signal),
      ),
    journeys: (domainId: string, signal?: AbortSignal) =>
      json<JourneyAxisResponse>(
        `/api/v1/analytics/performance/journeys?domain=${encodeURIComponent(domainId)}`,
        withSignal(signal),
      ),
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
    // kpi-measurement-alignment FR-09, FR-11 — param bindings + reconcile
    createParamBinding: (kpiId: string, data: ParamBindingCreate) =>
      json<ParamBinding>(`/api/v1/kpis/${encodeURIComponent(kpiId)}/param-bindings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    getParamBindings: (kpiId: string, signal?: AbortSignal) =>
      json<{ rows: ParamBinding[] }>(`/api/v1/kpis/${encodeURIComponent(kpiId)}/param-bindings`, withSignal(signal)),
    deleteParamBinding: (bindingId: string) =>
      json<{ deleted: true }>(`/api/v1/param-bindings/${encodeURIComponent(bindingId)}`, {
        method: "DELETE",
      }),
    reconcile: (kpiId: string) =>
      json<ReconcileResult>(`/api/v1/kpis/${encodeURIComponent(kpiId)}/reconcile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    reconcileAll: () =>
      json<{ reconciled_kpis: number; total_bindings: number; total_reconciled: number }>(`/api/v1/kpis/reconcile-all`, {
        method: "POST",
        headers: { "content-type": "application/json" },
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

  // key-activity-optimizer T-13 (design §4.11, DD-07, FR-12/FR-13) —
  // key-activity scores + mark/unmark client. Typed against the shared
  // T-01 zod schemas. The BLOCK is exported (via `api`); json<T> stays
  // private (DD-07).
  keyActivities: {
    list: (modelId: string, signal?: AbortSignal) =>
      json<KeyActivityScores>(
        `/api/v1/models/${encodeURIComponent(modelId)}/key-activities`,
        withSignal(signal),
      ),

    // JSON-returning 200 — json<T> is correct here.
    mark: (modelId: string, activityId: string) =>
      json<ActivityScoreRow>(
        `/api/v1/models/${encodeURIComponent(modelId)}/key-activities/${encodeURIComponent(activityId)}/mark`,
        { method: "POST" },
      ),

    // final-review C-01 (pinned): the server returns 204 NO-BODY and
    // json<T> unconditionally calls res.json() on an ok response — it
    // would THROW on every successful unmark and trigger a spurious
    // optimistic rollback. So unmark rides the raw fetch + res.ok
    // pattern of stories.remove (below) — NEVER json<T>, and the
    // shared json<T> helper is not modified (other consumers).
    unmark: async (modelId: string, activityId: string): Promise<void> => {
      const path = `/api/v1/models/${encodeURIComponent(modelId)}/key-activities/${encodeURIComponent(activityId)}/mark`;
      const res = await fetch(path, { method: "DELETE" });
      if (!res.ok) {
        let detail = "";
        try { detail = JSON.stringify(await res.json()); } catch { /* */ }
        throw new Error(`${res.status} ${res.statusText} ${path} ${detail}`);
      }
    },
  },

  // ddd-system-modeling T-12 (design §4.11, DD-11, FR-12/FR-13) —
  // capability + system-model client. Typed against the shared T-01
  // zod schemas. The three PUTs send method:"PUT" (the codebase's
  // first PUT routes). `attributes` passes through UNTYPED — no
  // systemKind reading and no vocabulary import here (rev-2
  // tasks-review N-03); badge rendering via SYSTEM_KIND_LABELS lives
  // in the SystemModeler view. 204-returning DELETEs ride the raw
  // fetch + res.ok pattern (json<T> would throw on an empty body —
  // same pinned rationale as keyActivities.unmark above).
  capabilities: {
    list: (modelId: string, signal?: AbortSignal) =>
      json<CapabilityRead[]>(
        `/api/v1/models/${encodeURIComponent(modelId)}/capabilities`,
        withSignal(signal),
      ),
    get: (modelId: string, capabilityId: string, signal?: AbortSignal) =>
      json<CapabilityRead>(
        `/api/v1/models/${encodeURIComponent(modelId)}/capabilities/${encodeURIComponent(capabilityId)}`,
        withSignal(signal),
      ),
    create: (modelId: string, body: { name: string; description?: string; attributes?: Record<string, unknown> }) =>
      json<CapabilityRead>(`/api/v1/models/${encodeURIComponent(modelId)}/capabilities`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    patch: (modelId: string, capabilityId: string, body: { name?: string; description?: string; attributes?: Record<string, unknown> }) =>
      json<CapabilityRead>(
        `/api/v1/models/${encodeURIComponent(modelId)}/capabilities/${encodeURIComponent(capabilityId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    remove: async (modelId: string, capabilityId: string): Promise<void> => {
      const path = `/api/v1/models/${encodeURIComponent(modelId)}/capabilities/${encodeURIComponent(capabilityId)}`;
      const res = await fetch(path, { method: "DELETE" });
      if (!res.ok) {
        let detail = "";
        try { detail = JSON.stringify(await res.json()); } catch { /* */ }
        throw new Error(`${res.status} ${res.statusText} ${path} ${detail}`);
      }
    },
    neededBy: {
      put: (modelId: string, capabilityId: string, body: { activityId?: string; storyId?: string }) =>
        json<CapabilityRead>(
          `/api/v1/models/${encodeURIComponent(modelId)}/capabilities/${encodeURIComponent(capabilityId)}/needed-by`,
          {
            method: "PUT", // DD-11 — first PUT routes
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        ),
      // Body-carrying DELETE (the source is a two-field union).
      remove: async (
        modelId: string,
        capabilityId: string,
        body: { activityId?: string; storyId?: string },
      ): Promise<void> => {
        const path = `/api/v1/models/${encodeURIComponent(modelId)}/capabilities/${encodeURIComponent(capabilityId)}/needed-by`;
        const res = await fetch(path, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          let detail = "";
          try { detail = JSON.stringify(await res.json()); } catch { /* */ }
          throw new Error(`${res.status} ${res.statusText} ${path} ${detail}`);
        }
      },
    },
    supportedBy: {
      put: (modelId: string, capabilityId: string, body: { systemId: string }) =>
        json<CapabilityRead>(
          `/api/v1/models/${encodeURIComponent(modelId)}/capabilities/${encodeURIComponent(capabilityId)}/supported-by`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        ),
      remove: async (modelId: string, capabilityId: string, systemId: string): Promise<void> => {
        const path = `/api/v1/models/${encodeURIComponent(modelId)}/capabilities/${encodeURIComponent(capabilityId)}/supported-by/${encodeURIComponent(systemId)}`;
        const res = await fetch(path, { method: "DELETE" });
        if (!res.ok) {
          let detail = "";
          try { detail = JSON.stringify(await res.json()); } catch { /* */ }
          throw new Error(`${res.status} ${res.statusText} ${path} ${detail}`);
        }
      },
    },
    context: {
      put: (modelId: string, capabilityId: string, body: { boundedContextId: string }) =>
        json<CapabilityRead>(
          `/api/v1/models/${encodeURIComponent(modelId)}/capabilities/${encodeURIComponent(capabilityId)}/context`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        ),
      clear: async (modelId: string, capabilityId: string): Promise<void> => {
        const path = `/api/v1/models/${encodeURIComponent(modelId)}/capabilities/${encodeURIComponent(capabilityId)}/context`;
        const res = await fetch(path, { method: "DELETE" });
        if (!res.ok) {
          let detail = "";
          try { detail = JSON.stringify(await res.json()); } catch { /* */ }
          throw new Error(`${res.status} ${res.statusText} ${path} ${detail}`);
        }
      },
    },
  },

  systemModel: {
    gaps: (modelId: string, signal?: AbortSignal) =>
      json<GapsResult>(
        `/api/v1/models/${encodeURIComponent(modelId)}/system-model/gaps`,
        withSignal(signal),
      ),
    contextMap: (modelId: string, signal?: AbortSignal) =>
      json<ContextMapResult>(
        `/api/v1/models/${encodeURIComponent(modelId)}/system-model/context-map`,
        withSignal(signal),
      ),
  },

  kpiImpact: {
    matrix: (modelId: string, signal?: AbortSignal) =>
      json<KpiImpactMatrix>(
        `/api/v1/models/${encodeURIComponent(modelId)}/kpi-impact/matrix`,
        withSignal(signal),
      ),
    rollup: (modelId: string, signal?: AbortSignal) =>
      json<KpiImpactRollup>(
        `/api/v1/models/${encodeURIComponent(modelId)}/kpi-impact/rollup`,
        withSignal(signal),
      ),
    listActivityLinks: (modelId: string, filters?: { activityId?: string; kpiId?: string }, signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (filters?.activityId) params.set("activityId", filters.activityId);
      if (filters?.kpiId) params.set("kpiId", filters.kpiId);
      const qs = params.toString();
      return json<{ rows: ImpactLinkRow[] }>(
        `/api/v1/models/${encodeURIComponent(modelId)}/kpi-impact/activity-links${qs ? `?${qs}` : ""}`,
        withSignal(signal),
      );
    },
    createActivityLink: (modelId: string, body: ActivityLinkCreate) =>
      json<ImpactLinkRow>(
        `/api/v1/models/${encodeURIComponent(modelId)}/kpi-impact/activity-links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    deleteActivityLink: (modelId: string, linkId: string) =>
      json<void>(
        `/api/v1/models/${encodeURIComponent(modelId)}/kpi-impact/activity-links/${encodeURIComponent(linkId)}`,
        { method: "DELETE" },
      ),
    listStoryLinks: (modelId: string, filters?: { storyId?: string; kpiId?: string }, signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (filters?.storyId) params.set("storyId", filters.storyId);
      if (filters?.kpiId) params.set("kpiId", filters.kpiId);
      const qs = params.toString();
      return json<{ rows: ImpactLinkRow[] }>(
        `/api/v1/models/${encodeURIComponent(modelId)}/kpi-impact/story-links${qs ? `?${qs}` : ""}`,
        withSignal(signal),
      );
    },
    createStoryLink: (modelId: string, body: StoryLinkCreate) =>
      json<ImpactLinkRow>(
        `/api/v1/models/${encodeURIComponent(modelId)}/kpi-impact/story-links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    deleteStoryLink: (modelId: string, linkId: string) =>
      json<void>(
        `/api/v1/models/${encodeURIComponent(modelId)}/kpi-impact/story-links/${encodeURIComponent(linkId)}`,
        { method: "DELETE" },
      ),
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
  shared_domains: string[];
  namespaces: string[];
}

export interface SharedDomainRow {
  id: string;
  name: string;
  description: string;
  tags: string[];
  bounded_contexts: string[];
}

export interface NamespaceRow {
  id: string;
  name: string;
  description: string;
  model_id: string;
  model_name?: string | null;
  bounded_contexts: string[];
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

// kpi-measurement-alignment FR-09, FR-11 — param binding + reconcile types
export interface ParamBinding {
  binding_id: string;
  kpi_id: string;
  target_type: "journey" | "activity" | "domain" | "system";
  target_id: string;
  target_name: string | null;
  parameter: "target_value" | "warning_threshold" | "critical_threshold";
  attribute_path: string;
  created_at: string;
}

export interface ParamBindingCreate {
  target_type: "journey" | "activity" | "domain" | "system";
  target_id: string;
  parameter: "target_value" | "warning_threshold" | "critical_threshold";
  attribute_path: string;
}

export interface ReconcileResult {
  kpi_id: string;
  reconciled: Array<{
    parameter: string;
    old_value: number;
    new_value: number;
    entity_id: string;
  }>;
  unchanged: string[];
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

// ---------------------------------------------------------------------------
// story-spec-core T-13 (design §4.11, FR-12/FR-13) — stories client.
// Typed against the shared T-01 zod schemas; reuses the json<T>()
// wrapper. Each read accepts an optional AbortSignal.
// ---------------------------------------------------------------------------

import type {
  StoryRead,
  StoryCreateInput,
  StoryPatchInput,
  AcRead,
  AcCreateInput,
  AcPatchInput,
  BootstrapRequest,
  BootstrapResult,
} from "@companygraph/shared/schema/story-spec";

export type { StoryRead, AcRead, BootstrapResult };

const storiesBase = (modelId: string) =>
  `/api/v1/models/${encodeURIComponent(modelId)}/stories`;
const acsBase = (modelId: string, storyId: string) =>
  `${storiesBase(modelId)}/${encodeURIComponent(storyId)}/acceptance-criteria`;

export const stories = {
  list: (modelId: string, signal?: AbortSignal) =>
    json<StoryRead[]>(storiesBase(modelId), withSignal(signal)),

  get: (modelId: string, storyId: string, signal?: AbortSignal) =>
    json<StoryRead>(`${storiesBase(modelId)}/${encodeURIComponent(storyId)}`, withSignal(signal)),

  create: (modelId: string, data: StoryCreateInput) =>
    json<StoryRead>(storiesBase(modelId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  patch: (modelId: string, storyId: string, data: StoryPatchInput) =>
    json<StoryRead>(`${storiesBase(modelId)}/${encodeURIComponent(storyId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  remove: async (modelId: string, storyId: string): Promise<void> => {
    const path = `${storiesBase(modelId)}/${encodeURIComponent(storyId)}`;
    const res = await fetch(path, { method: "DELETE" });
    if (!res.ok) {
      let detail = "";
      try { detail = JSON.stringify(await res.json()); } catch { /* */ }
      throw new Error(`${res.status} ${res.statusText} ${path} ${detail}`);
    }
  },

  bootstrap: (modelId: string, data?: BootstrapRequest) =>
    json<BootstrapResult>(`${storiesBase(modelId)}/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data ?? {}),
    }),

  acs: {
    list: (modelId: string, storyId: string, signal?: AbortSignal) =>
      json<AcRead[]>(acsBase(modelId, storyId), withSignal(signal)),

    create: (modelId: string, storyId: string, data: AcCreateInput) =>
      json<AcRead>(acsBase(modelId, storyId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),

    patch: (modelId: string, storyId: string, acId: string, data: AcPatchInput) =>
      json<AcRead>(`${acsBase(modelId, storyId)}/${encodeURIComponent(acId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),

    remove: async (modelId: string, storyId: string, acId: string): Promise<void> => {
      const path = `${acsBase(modelId, storyId)}/${encodeURIComponent(acId)}`;
      const res = await fetch(path, { method: "DELETE" });
      if (!res.ok) {
        let detail = "";
        try { detail = JSON.stringify(await res.json()); } catch { /* */ }
        throw new Error(`${res.status} ${res.statusText} ${path} ${detail}`);
      }
    },
  },
};

// ---------------------------------------------------------------------------
// requirements-export T-09 (FR-08, FR-09) — spec-export client.
// Reuses the private json<T> wrapper for the JSON fetch; markdown
// uses a raw text fetch (the body is Markdown, not JSON).
// ---------------------------------------------------------------------------

export const specExport = {
  json: <T>(modelId: string, signal?: AbortSignal) =>
    json<T>(
      `/api/v1/models/${encodeURIComponent(modelId)}/spec-export?format=json`,
      withSignal(signal),
    ),

  markdown: async (modelId: string, signal?: AbortSignal): Promise<string> => {
    const path = `/api/v1/models/${encodeURIComponent(modelId)}/spec-export?format=markdown`;
    const res = await fetch(path, withSignal(signal));
    if (!res.ok) {
      let detail = "";
      try { detail = JSON.stringify(await res.json()); } catch { /* */ }
      throw new Error(`${res.status} ${res.statusText} ${path} ${detail}`);
    }
    return res.text();
  },
};

// ---------------------------------------------------------------------------
// business-model-authoring T-06 (design §7) — authoring client + three
// thin wrappers for mwc-owned routes the wizard calls. Consuming, not
// duplicating: no handler logic re-implemented, no existing method
// re-spelled. (TR2-B-01)
// ---------------------------------------------------------------------------

import type {
  AuthoringApply,
  AuthoringApplyResult,
  AuthoringGraph,
  DomainPatch,
} from "@companygraph/shared/schema/authoring";

export type { AuthoringApplyResult, AuthoringGraph };

export const authoring = {
  apply: (modelId: string, body: AuthoringApply) =>
    json<AuthoringApplyResult>(
      `/api/v1/models/${encodeURIComponent(modelId)}/authoring/apply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),

  graph: (modelId: string, signal?: AbortSignal) =>
    json<AuthoringGraph>(
      `/api/v1/models/${encodeURIComponent(modelId)}/authoring/graph`,
      withSignal(signal),
    ),

  patchDomain: (modelId: string, domainId: string, body: DomainPatch) =>
    json<DomainRow>(
      `/api/v1/models/${encodeURIComponent(modelId)}/domains/${encodeURIComponent(domainId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
};

// T-06 wrappers: three thin json<T> calls for mwc-owned routes.
// modules.list → GET /api/v1/modules (new standalone export)
export const modules = {
  list: (signal?: AbortSignal) =>
    json<InstanceRead[]>("/api/v1/modules", withSignal(signal)),
};

// Extend models with createDomain + createInstance (T-06 sanctioned wrappers)
// These are added as methods on the existing `models` object via assignment
// to avoid re-declaring the entire object.
(models as Record<string, unknown>).createDomain = (
  modelId: string,
  data: { name: string; description?: string },
) =>
  json<DomainRow>(
    `/api/v1/models/${encodeURIComponent(modelId)}/domains`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );

(models as Record<string, unknown>).createInstance = (
  modelId: string,
  data: { moduleId: string; targetDomainId: string },
) =>
  json<InstanceRead>(
    `/api/v1/models/${encodeURIComponent(modelId)}/module-instances`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
