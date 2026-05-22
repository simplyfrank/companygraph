import type {
  HighlightPayload,
  ToolCall,
  ChatRoleId,
} from "@companygraph/shared";

// Build the highlight payload from the union of every tool call's result ids.
// Design intent (DD-11): the canvas reflects all evidence the agent gathered,
// not just the subset the LLM chose to cite. This matches the wireframe's
// "ask 'show breaches' → all 5 breaches lit, even if narration spotlights the worst".
export function buildHighlight(toolCalls: ToolCall[], _role: ChatRoleId): HighlightPayload {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  const paths: string[][] = [];
  const styleBreach = new Set<string>();
  const styleWarn = new Set<string>();
  const styleSelected = new Set<string>();

  for (const tc of toolCalls) {
    if (tc.error_code) continue;
    // The orchestrator stashes the raw result on the tool call as result_preview's
    // JSON form, but for buildHighlight we want the full data. We re-key on tool_name
    // and inspect a "data" field that the dispatch layer is responsible for emitting.
    // Since ToolCall only carries result_preview (string), the orchestrator passes
    // tool_calls plus a parallel array of full results to this function via the
    // alternative builder below; see buildHighlightFromResults.
    // For ToolCall-only inputs, we extract ids from result_preview if it's JSON.
    if (tc.result_preview) {
      const ids = extractIdsHeuristic(tc.result_preview);
      ids.nodeIds.forEach(id => nodes.add(id));
      ids.edgeIds.forEach(id => edges.add(id));
    }
  }
  return {
    nodes: [...nodes],
    edges: [...edges],
    paths,
    style: {
      breach: [...styleBreach],
      warn: [...styleWarn],
      selected: [...styleSelected],
    },
  };
}

// The orchestrator-friendly entry point with typed results per tool.
// Pass the raw tool result data (not the truncated preview).
export interface ToolCallWithData {
  tool_name: ToolCall["tool_name"];
  data: unknown;
  error_code?: ToolCall["error_code"];
}

export function buildHighlightFromResults(
  callsWithData: ToolCallWithData[],
  _role: ChatRoleId,
): HighlightPayload {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  const paths: string[][] = [];
  const styleBreach = new Set<string>();
  const styleWarn = new Set<string>();

  for (const tc of callsWithData) {
    if (tc.error_code || tc.data == null) continue;
    const d = tc.data as Record<string, unknown>;
    switch (tc.tool_name) {
      case "list_domains":
      case "list_nodes_by_label": {
        const arr = Array.isArray(d) ? d : (d as { rows?: unknown[] }).rows;
        if (Array.isArray(arr)) {
          arr.forEach(row => {
            const id = (row as { id?: string }).id;
            if (id) nodes.add(id);
          });
        }
        break;
      }
      case "get_domain": {
        if (typeof d.id === "string") nodes.add(d.id);
        const journeys = (d.journeys ?? []) as Array<{ id: string }>;
        journeys.forEach(j => nodes.add(j.id));
        break;
      }
      case "get_journey": {
        if (typeof d.id === "string") nodes.add(d.id);
        const acts = (d.activities ?? []) as Array<{ id: string }>;
        acts.forEach(a => nodes.add(a.id));
        const eds = (d.edges ?? []) as Array<{ id: string }>;
        eds.forEach(e => edges.add(e.id));
        break;
      }
      case "get_activity": {
        if (typeof d.id === "string") nodes.add(d.id);
        const roles = (d.roles ?? []) as Array<{ id: string }>;
        roles.forEach(r => nodes.add(r.id));
        const systems = (d.systems ?? []) as Array<{ id: string }>;
        systems.forEach(s => nodes.add(s.id));
        const locations = (d.locations ?? []) as Array<{ id: string }>;
        locations.forEach(l => nodes.add(l.id));
        const preceded = ((d.precedes ?? []) as Array<{ id: string }>);
        preceded.forEach(e => edges.add(e.id));
        const before = ((d.preceded_by ?? []) as Array<{ id: string }>);
        before.forEach(e => edges.add(e.id));
        break;
      }
      case "neighbors": {
        const nodeList = (d.nodes ?? []) as Array<{ id: string }>;
        nodeList.forEach(n => nodes.add(n.id));
        const edgeList = (d.edges ?? []) as Array<{ id: string }>;
        edgeList.forEach(e => edges.add(e.id));
        break;
      }
      case "find_path": {
        const pathsArr = (d.paths ?? []) as string[][];
        pathsArr.forEach(p => {
          paths.push(p);
          p.forEach(id => nodes.add(id));
        });
        const edgesNested = (d.edges ?? []) as Array<Array<{ id: string }>>;
        edgesNested.forEach(arr => arr.forEach(e => edges.add(e.id)));
        break;
      }
      case "sla_hotspots": {
        const arr = Array.isArray(d) ? d : (d as { rows?: unknown[] }).rows ?? [];
        (arr as Array<{ edge_id: string; status?: string }>).forEach(h => {
          edges.add(h.edge_id);
          if (h.status === "breach") styleBreach.add(h.edge_id);
          if (h.status === "warn") styleWarn.add(h.edge_id);
        });
        break;
      }
      case "handoff_matrix": {
        const cells = (d.cells ?? []) as Array<{ journey_ids?: string[] }>;
        cells.forEach(c => (c.journey_ids ?? []).forEach(id => nodes.add(id)));
        break;
      }
      case "sod_register": {
        const arr = Array.isArray(d) ? d : (d as { rows?: unknown[] }).rows ?? [];
        (arr as Array<{ activity_pair_ids?: string[] }>).forEach(s => {
          (s.activity_pair_ids ?? []).forEach(id => nodes.add(id));
        });
        break;
      }
      case "ai_candidates": {
        const arr = Array.isArray(d) ? d : (d as { rows?: unknown[] }).rows ?? [];
        (arr as Array<{ activity_id?: string }>).forEach(c => {
          if (c.activity_id) nodes.add(c.activity_id);
        });
        break;
      }
      case "initiative_impact": {
        const acts = (d.affected_activities ?? []) as string[];
        acts.forEach(id => nodes.add(id));
        break;
      }
      case "aggregate":
      case "cypher":
      case "describe_schema":
        // These tools don't return graph ids in a uniform shape; the LLM
        // narration is the sole channel for these. Highlight stays empty
        // unless other tools in the same turn populate it.
        break;
    }
  }

  return {
    nodes: [...nodes],
    edges: [...edges],
    paths,
    style: {
      breach: [...styleBreach],
      warn: [...styleWarn],
      selected: [],
    },
  };
}

// Extract node/edge ids heuristically from a result_preview JSON string.
// Fallback path when only ToolCall-with-preview is available (not the full data).
function extractIdsHeuristic(jsonString: string): { nodeIds: string[]; edgeIds: string[] } {
  // UUIDv7 ids are 36-char strings of the form 018f0000-XXXX-7XXX-8XXX-XXXXXXXXXXXX.
  // We can't tell node vs edge from id alone — return all as nodes.
  const RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
  const matches = jsonString.match(RE) ?? [];
  return { nodeIds: [...new Set(matches)], edgeIds: [] };
}

// Deep-link generation deferred to design phase per FR-H03 (B-03).
// Returns null until the cross-spec URL grammar with process-explorer-ui is locked.
export function tryBuildDeepLink(_highlight: HighlightPayload, _role: ChatRoleId): string | null {
  return null;
}
