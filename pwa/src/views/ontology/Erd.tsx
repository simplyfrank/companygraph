import { useState, useRef, useMemo, useEffect } from "react";
import { api, rdf } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Button } from "../../components/Button";
import { ViewHeader, Loading, ErrorState, SecLabel } from "../_shared";
import { useOntologyGraph } from "./useOntologyGraph";
import { useErdLayout, saveErdLayout } from "./useErdLayout";
import { hierarchicalLayout } from "./hierarchicalLayout";
import { compareLayoutAgainstTarget, formatComparisonResult } from "./layoutComparison";
import { buildGraph, betweennessCentrality, findAllCycles, findSCCs } from "./graphLib";
import type { ErdLayout } from "./useErdLayout";
import styles from "./Erd.module.css";

const BOX_W = 160;
const BOX_HEADER_H = 46;   // title + count
const ATTR_ROW_H = 14;      // each attribute row
const ATTR_PADDING = 8;     // top + bottom padding inside box


const TONE: Record<string, "accent" | "good" | "warn" | "danger" | "neutral"> = {
  Domain: "accent",
};

// Bounded context groupings — each context encloses a set of entity labels.
// Colors reference CSS custom properties so they theme correctly.
const DEFAULT_BOUNDED_CONTEXTS: Array<{
  name: string;
  labels: string[];
  color: string;
}> = [];

const ZONE_PAD = 24; // padding around nodes inside a zone rect

/** Return which bounded context owns a given label, or null. */
function contextOf(label: string, contexts: Array<{ name: string; labels: string[] }>): string | null {
  return contexts.find((c) => c.labels.includes(label))?.name ?? null;
}

/**
 * For a given context, derive its "public API" — the cross-context edges
 * where one endpoint is inside this context and the other is outside it.
 * Each entry is: { edgeType, direction: 'publishes'|'consumes', remoteLabel, remoteContext }
 */
function contextApi(
  ctxLabels: string[],
  edges: import("./useOntologyGraph").ErdEdge[],
  contexts: Array<{ name: string; labels: string[] }>,
) {
  const ctxSet = new Set(ctxLabels);
  const seen = new Set<string>();
  const result: Array<{
    edgeType: string;
    direction: "publishes" | "consumes";
    remoteLabel: string;
    remoteContext: string | null;
  }> = [];

  for (const e of edges) {
    const fromInside = ctxSet.has(e.fromLabel);
    const toInside = ctxSet.has(e.toLabel);
    if (fromInside === toInside) continue; // both in or both out — internal edge

    const key = `${e.type}:${e.fromLabel}:${e.toLabel}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (fromInside) {
      result.push({
        edgeType: e.type,
        direction: "publishes",
        remoteLabel: e.toLabel,
        remoteContext: contextOf(e.toLabel, contexts),
      });
    } else {
      result.push({
        edgeType: e.type,
        direction: "consumes",
        remoteLabel: e.fromLabel,
        remoteContext: contextOf(e.fromLabel, contexts),
      });
    }
  }
  return result;
}

/**
 * Map OpenAPI endpoints to bounded contexts based on entity labels
 * and path/description keywords. Returns the list of operations
 * that belong to the given context.
 */
function contextOpenApiEndpoints(
  ctx: { name: string; labels: string[]; color: string },
  doc: Record<string, unknown>,
): OpenApiPathOp[] {
  if (!doc || typeof doc !== "object") return [];

  const paths = (doc as Record<string, unknown>).paths as Record<string, unknown> | undefined;
  if (!paths || typeof paths !== "object") return [];

  const ctxLabels = new Set(ctx.labels.map((l) => l.toLowerCase()));
  const ctxNameLower = ctx.name.toLowerCase();

  // Build keyword list: entity labels + context name fragments + common synonyms
  const keywords: string[] = [];
  for (const label of ctx.labels) {
    keywords.push(label.toLowerCase());
    // common synonyms
    if (label === "Domain") keywords.push("domains", "listdomains", "getdomain", "domain");
    if (label === "UserJourney") keywords.push("journey", "journeys", "getjourney");
    if (label === "Activity") keywords.push("activity", "activities", "getactivity");
    if (label === "Role") keywords.push("role", "roles", "persona");
    if (label === "System") keywords.push("system", "systems");
    if (label === "Location") keywords.push("location", "locations");
  }
  // Add context-name fragments
  if (ctx.name.includes("Organisational")) keywords.push("domain", "domains", "listdomains", "getdomain");
  if (ctx.name.includes("Journey")) keywords.push("journey", "journeys", "activity", "activities");
  if (ctx.name.includes("Capability")) keywords.push("role", "roles", "system", "systems", "persona", "neighbor");
  if (ctx.name.includes("Physical")) keywords.push("location", "locations", "path", "findpath");

  const result: OpenApiPathOp[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    const methods = ["get", "post", "put", "patch", "delete"] as const;
    for (const method of methods) {
      const op = (pathItem as Record<string, unknown>)[method] as Record<string, unknown> | undefined;
      if (!op || typeof op !== "object") continue;

      const opStr = path.toLowerCase() + " " + method;
      const desc = (op as Record<string, unknown>).description as string | undefined;
      const summary = (op as Record<string, unknown>).summary as string | undefined;
      const requestBody = (op as Record<string, unknown>).requestBody as Record<string, unknown> | undefined;
      const responses = (op as Record<string, unknown>).responses as Record<string, unknown> | undefined;

      // Check if any keyword matches
      const matchesKeyword = keywords.some((kw) => opStr.includes(kw) || (desc?.toLowerCase() ?? "").includes(kw) || (summary?.toLowerCase() ?? "").includes(kw));

      if (matchesKeyword) {
        result.push({
          method,
          path,
          description: desc,
          summary,
          requestBody: requestBody as { content?: Record<string, { schema?: unknown }> } | undefined,
          responses: responses as Record<string, { description: string | undefined; content?: Record<string, { schema?: unknown }> }> | undefined,
        });
      }
    }
  }

  return result;
}

/**
 * Detect suggested bounded contexts using graph clustering.
 * Groups unassigned entities based on their edge interaction patterns.
 * Returns an array of suggested contexts with their entity labels.
 */
function detectSuggestedContexts(
  allLabels: string[],
  edges: import("./useOntologyGraph").ErdEdge[],
  existingContexts: Array<{ name: string; labels: string[] }>,
): Array<{ name: string; labels: string[]; color: string; confidence: number }> {
  // Get unassigned entities
  const assignedLabels = new Set(existingContexts.flatMap(ctx => ctx.labels));
  const unassignedLabels = allLabels.filter(l => !assignedLabels.has(l));
  
  if (unassignedLabels.length === 0) return [];
  
  // Build adjacency graph from edges
  const adjacency = new Map<string, Set<string>>();
  unassignedLabels.forEach(label => adjacency.set(label, new Set()));
  
  edges.forEach(edge => {
    const fromUnassigned = adjacency.has(edge.fromLabel);
    const toUnassigned = adjacency.has(edge.toLabel);
    
    if (fromUnassigned && toUnassigned) {
      // Both unassigned - add bidirectional edge
      adjacency.get(edge.fromLabel)!.add(edge.toLabel);
      adjacency.get(edge.toLabel)!.add(edge.fromLabel);
    }
  });
  
  // Find connected components using BFS
  const visited = new Set<string>();
  const components: string[][] = [];
  
  unassignedLabels.forEach(label => {
    if (visited.has(label)) return;
    
    const component: string[] = [];
    const queue = [label];
    visited.add(label);
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      
      const neighbors = adjacency.get(current) || new Set();
      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      });
    }
    
    if (component.length > 0) {
      components.push(component);
    }
  });
  
  // Filter out singletons (entities with no connections to other unassigned entities)
  const meaningfulComponents = components.filter(c => c.length > 1);
  
  // Generate suggestions
  const colors = ["var(--tone-good)", "var(--tone-warn)", "var(--tone-danger)", "var(--tone-accent)"];
  return meaningfulComponents.map((component, index) => {
    // Generate a name based on the most connected entity or a generic name
    const name = `Suggested Context ${index + 1}`;
    const color = colors[index % colors.length]!;
    
    // Calculate confidence based on edge density
    let edgeCount = 0;
    component.forEach(label => {
      const neighbors = adjacency.get(label) || new Set();
      neighbors.forEach(neighbor => {
        if (component.includes(neighbor)) edgeCount++;
      });
    });
    edgeCount /= 2; // Each edge counted twice
    
    const maxPossibleEdges = (component.length * (component.length - 1)) / 2;
    const confidence = maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;
    
    return { name, labels: component, color, confidence };
  });
}

/** Parse JSON Schema properties into a flat list of { name, type, required }. */
function parseSchemaProperties(
  doc: Record<string, unknown> | null | undefined,
): Array<{ name: string; type: string; required: boolean }> {
  if (!doc || typeof doc !== "object") return [];
  const props = doc.properties as Record<string, unknown> | undefined;
  if (!props || typeof props !== "object") return [];
  const required = new Set<string>(Array.isArray(doc.required) ? doc.required as string[] : []);
  return Object.entries(props).map(([name, def]) => {
    const d = def as Record<string, unknown> | undefined;
    const type = typeof d?.type === "string" ? d.type : "any";
    return { name, type, required: required.has(name) };
  });
}

// Minimal OpenAPI document shape for displaying endpoints per context
interface OpenApiPathOp {
  method: string;
  path: string;
  description: string | undefined;
  summary: string | undefined;
  requestBody: { content?: Record<string, { schema?: unknown }> } | undefined;
  responses: Record<string, { description: string | undefined; content?: Record<string, { schema?: unknown }> }> | undefined;
}

export function OntologyErd() {
  const stats = useFetch(() => api.stats(), []);
  const openapiDoc = useFetch(() => api.openapi(), []);
  const analytics = useFetch(() => api.analytics(), []);
  const [graphRefreshKey, setGraphRefreshKey] = useState(0);
  const [layoutAlgorithm, setLayoutAlgorithm] = useState<"cluster" | "hierarchical">("hierarchical");
  const [exportFormat, setExportFormat] = useState<"jsonld" | "turtle" | "ntriples">("jsonld");
  const [isExporting, setIsExporting] = useState(false);
  const { labels, edgeTypes, edges, labelMap, boundedContexts: bcData, isLoading: graphLoading, error: graphError, refresh } = useOntologyGraph(graphRefreshKey);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await rdf.export(exportFormat);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ontology-erd.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
      alert("Failed to export ontology");
    } finally {
      setIsExporting(false);
    }
  };

  // Convert API bounded contexts to layout format
  const layoutBoundedContexts = useMemo(() => {
    if (!bcData || bcData.length === 0) return undefined;

    // Helper to sanitize entity names to match node labels
    const sanitizeName = (name: string): string => {
      return name
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars (parentheses, hyphens, etc.)
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/^([a-z])/, (_, c) => c.toUpperCase()); // Capitalize first letter
    };

    return bcData.map((bc) => ({
      name: bc.name,
      domain: bc.domain,
      subdomain: bc.subdomain,
      type: bc.type,
      entities: bc.entities.map(sanitizeName),
    }));
  }, [bcData]);

  // Call hooks at top level (Rules of Hooks)
  const clusterLayout = useErdLayout(labels, edges, layoutBoundedContexts);

  // Compute layout based on selected algorithm
  const initialLayout = useMemo(() => {
    if (layoutAlgorithm === "hierarchical" && layoutBoundedContexts && layoutBoundedContexts.length > 0) {
      try {
        const hierarchicalResult = hierarchicalLayout(layoutBoundedContexts, edges);
        console.log("Hierarchical layout metrics:", hierarchicalResult.metrics);

        // Compare against target
        const comparison = compareLayoutAgainstTarget(hierarchicalResult.positions, edges);
        console.log("Hierarchical vs Target:", formatComparisonResult(comparison));

        return {
          positions: hierarchicalResult.positions,
          sizes: {} as ErdLayout["sizes"],
          contextSizes: {} as ErdLayout["contextSizes"],
          collapsedContexts: [] as string[],
          contextExpandedSizes: {} as ErdLayout["contextExpandedSizes"],
        };
      } catch (error) {
        console.error("Hierarchical layout failed, falling back to cluster layout:", error);
        return clusterLayout;
      }
    }

    // Compare cluster layout against target
    const comparison = compareLayoutAgainstTarget(clusterLayout.positions, edges);
    console.log("Cluster vs Target:", formatComparisonResult(comparison));

    return clusterLayout;
  }, [clusterLayout, layoutBoundedContexts, layoutAlgorithm, edges]);

  const initialLayoutRef = useRef(initialLayout);
  initialLayoutRef.current = initialLayout;

  // Track whether we have applied the first real (non-empty) layout yet.
  const didInitRef = useRef(false);

  // Local mutable state for positions and sizes (for drag/resize interactions)
  const [positions, setPositions] = useState<ErdLayout["positions"]>({});
  const [sizes, setSizes] = useState<ErdLayout["sizes"]>({});
  const [contextSizes, setContextSizes] = useState<ErdLayout["contextSizes"]>({});
  const [collapsedContexts, setCollapsedContexts] = useState<Set<string>>(new Set());
  const [contextExpandedSizes, setContextExpandedSizes] = useState<ErdLayout["contextExpandedSizes"]>({});
  const [boundedContexts, setBoundedContexts] = useState(DEFAULT_BOUNDED_CONTEXTS);
  
  // Initialize bounded contexts from API data when available
  useEffect(() => {
    if (bcData && bcData.length > 0) {
      const colors = ["var(--tone-good)", "var(--tone-warn)", "var(--tone-danger)", "var(--tone-accent)"];
      const dynamicContexts = bcData.map((bc, index) => ({
        name: bc.name,
        labels: bc.entities,
        color: colors[index % colors.length] || "var(--tone-neutral)",
      }));
      setBoundedContexts(dynamicContexts);
    }
  }, [bcData]);

  // Sync positions/sizes/contextSizes/collapsedContexts/contextExpandedSizes whenever the graph structure changes (new labels or edges).
  const labelKey = labels.map((l) => l.name).sort().join(",");
  const edgeKey = edges.map((e) => e.id).sort().join(",");
  useEffect(() => {
    if (labelKey === "") return; // still loading — wait
    didInitRef.current = true;
    setPositions(initialLayoutRef.current.positions);
    setSizes(initialLayoutRef.current.sizes);
    setContextSizes(initialLayoutRef.current.contextSizes ?? {});
    setCollapsedContexts(new Set(initialLayoutRef.current.collapsedContexts ?? []));
    setContextExpandedSizes(initialLayoutRef.current.contextExpandedSizes ?? {});
  }, [labelKey, edgeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selection can be a node label or an edge id
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedContext, setSelectedContext] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  
  // Suggested contexts from analysis
  const [suggestedContexts, setSuggestedContexts] = useState<Array<{ name: string; labels: string[]; color: string; confidence: number }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Tooltip state for hover popups
  const [tooltip, setTooltip] = useState<{ 
    type: 'node' | 'edge' | null; 
    id: string | null; 
    x: number; 
    y: number;
  }>({ type: null, id: null, x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  // Multi-select state
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  
  // Bounded context drag state
  const [draggingContext, setDraggingContext] = useState<string | null>(null);
  const [dragContextStart, setDragContextStart] = useState<{ x: number; y: number } | null>(null);
  const [dragContextStartPositions, setDragContextStartPositions] = useState<Record<string, { x: number; y: number }>>({});
  
  // Bounded context resize state
  const [resizingContext, setResizingContext] = useState<string | null>(null);
  const [contextResizeStart, setContextResizeStart] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [contextResizeHandle, setContextResizeHandle] = useState<'se' | 'e' | 's' | null>(null);
  
  // Bounded context collapse toggle
  const toggleContextCollapse = (ctxName: string) => {
    setCollapsedContexts(prev => {
      const next = new Set(prev);
      const isCollapsing = !next.has(ctxName);
      
      if (isCollapsing) {
        // Save current size before collapsing
        const ctx = boundedContexts.find(c => c.name === ctxName);
        if (ctx) {
          const present = ctx.labels.filter((l) => positions[l]);
          if (present.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const l of present) {
              const p = positions[l]!;
              const w = sizes[l]?.width ?? BOX_W;
              const h = sizes[l]?.height ?? BOX_HEADER_H;
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x + w);
              maxY = Math.max(maxY, p.y + h);
            }
            const currentWidth = maxX - minX + ZONE_PAD * 2;
            const currentHeight = maxY - minY + ZONE_PAD * 2 + 18;
            setContextExpandedSizes(prev => ({
              ...prev,
              [ctxName]: { width: currentWidth, height: currentHeight }
            }));
          }
        }
        next.add(ctxName);
      } else {
        next.delete(ctxName);
      }
      
      // Save collapse state to localStorage
      const layout: ErdLayout = { positions, sizes };
      if (contextSizes) layout.contextSizes = contextSizes;
      layout.collapsedContexts = Array.from(next);
      if (contextExpandedSizes) layout.contextExpandedSizes = contextExpandedSizes;
      saveErdLayout(layout);
      return next;
    });
  };
  
  // Selection box state
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  
  // Unified node drag state (single or multi-select)
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [draggedLabel, setDraggedLabel] = useState<string | null>(null);
  const [dragStartPositions, setDragStartPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [dragStartMouse, setDragStartMouse] = useState<{ x: number; y: number } | null>(null);
  
  // Entity resize state
  const [resizingEntity, setResizingEntity] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [resizeHandle, setResizeHandle] = useState<'se' | 'e' | 's' | null>(null);
  
  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const didDragRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgSize, setSvgSize] = useState({ width: 800, height: 600 });
  
  // Full-screen mode
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  // Create entity modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createExample, setCreateExample] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  
  // Create edge type modal
  const [showCreateEdgeModal, setShowCreateEdgeModal] = useState(false);
  const [createEdgeName, setCreateEdgeName] = useState("");
  const [createEdgeDesc, setCreateEdgeDesc] = useState("");
  const [createEdgeExample, setCreateEdgeExample] = useState("");
  const [createEdgeError, setCreateEdgeError] = useState<string | null>(null);
  const [creatingEdge, setCreatingEdge] = useState(false);
  
  // Space key panning
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSvgSize({ width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  
  // Get SVG point from mouse event for tooltips
  const getSVGPoint = (e: React.MouseEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svgRef.current.getScreenCTM()?.inverse());
    return { x: svgP.x, y: svgP.y };
  };

  // Zoom handlers
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.2, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.2, 0.3));
  };

  const handleZoomReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Mouse wheel zoom (passive - preventDefault not allowed in React wheel events)
  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? 0.928 : 1.072;
    setZoom(prev => Math.max(0.3, Math.min(3, prev * delta)));
  };

  // Pan handlers
  const handlePanStart = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && (e.altKey || isSpacePressed))) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handlePanMove = (e: React.MouseEvent) => {
    if (!isPanning || !panStart) return;
    const deltaX = e.clientX - panStart.x;
    const deltaY = e.clientY - panStart.y;
    setPan({ x: pan.x + deltaX, y: pan.y + deltaY });
    setPanStart({ x: e.clientX, y: e.clientY });
  };

  const handlePanEnd = () => {
    setIsPanning(false);
    setPanStart(null);
  };
  
  // Unified node drag — started from per-node onMouseDown
  const handleNodeDragStart = (label: string, e: React.MouseEvent) => {
    if (e.button !== 0 || e.altKey) return;
    e.stopPropagation();
    e.preventDefault();

    // Determine which labels to move: if this node is in a multi-selection, move all; otherwise just this one
    const labelsToMove = selectedEntities.has(label) && selectedEntities.size > 1
      ? Array.from(selectedEntities)
      : [label];

    const startPositions: Record<string, { x: number; y: number }> = {};
    labelsToMove.forEach(l => {
      startPositions[l] = { ...(positions[l] ?? { x: 0, y: 0 }) };
    });

    didDragRef.current = false;
    setIsDraggingNode(true);
    setDraggedLabel(label);
    setDragStartMouse({ x: e.clientX, y: e.clientY });
    setDragStartPositions(startPositions);
  };

  const handleNodeDragMove = (e: React.MouseEvent) => {
    if (!isDraggingNode || !dragStartMouse) return;
    didDragRef.current = true;

    const deltaX = (e.clientX - dragStartMouse.x) / zoom;
    const deltaY = (e.clientY - dragStartMouse.y) / zoom;

    setPositions((prev: ErdLayout["positions"]) => {
      const updated = { ...prev };
      Object.entries(dragStartPositions).forEach(([l, startPos]) => {
        updated[l] = { x: startPos.x + deltaX, y: startPos.y + deltaY };
      });
      return updated;
    });
  };

  const handleNodeDragEnd = () => {
    if (!isDraggingNode) return;
    setIsDraggingNode(false);
    setDraggedLabel(null);
    setDragStartMouse(null);
    setDragStartPositions({});
    
    // Check if any dragged nodes are inside bounded contexts and associate them
    setBoundedContexts(prevContexts => {
      const updated = prevContexts.map(ctx => ({ ...ctx, labels: [...ctx.labels] }));
      
      // For each dragged node, check if it's inside any context
      Object.entries(positions).forEach(([label, p]) => {
        const w = sizes[label]?.width ?? BOX_W;
        const h = sizes[label]?.height ?? BOX_HEADER_H;
        const nodeCenterX = p.x + w / 2;
        const nodeCenterY = p.y + h / 2;
        
        // Find which context contains this node
        let foundContext: string | null = null;
        for (const ctx of updated) {
          const present = ctx.labels.filter((l) => positions[l]);
          if (present.length === 0) continue;
          
          // Calculate context bounds (same logic as rendering)
          const customSize = (contextSizes ?? {})[ctx.name];
          const expandedSize = (contextExpandedSizes ?? {})[ctx.name];
          const isCollapsed = collapsedContexts.has(ctx.name);
          
          let zx, zy, zw, zh;
          if (isCollapsed) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const l of present) {
              const pos = positions[l]!;
              const lw = sizes[l]?.width ?? BOX_W;
              const lh = sizes[l]?.height ?? BOX_HEADER_H;
              minX = Math.min(minX, pos.x);
              minY = Math.min(minY, pos.y);
              maxX = Math.max(maxX, pos.x + lw);
              maxY = Math.max(maxY, pos.y + lh);
            }
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const maxNameLength = Math.max(...present.map(l => l.length));
            const collapsedWidth = Math.max(140, maxNameLength * 7 + 40);
            const collapsedHeight = 30 + present.length * 20;
            zx = centerX - collapsedWidth / 2;
            zy = centerY - collapsedHeight / 2;
            zw = collapsedWidth;
            zh = collapsedHeight;
          } else if (customSize) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const l of present) {
              const pos = positions[l]!;
              const lw = sizes[l]?.width ?? BOX_W;
              const lh = sizes[l]?.height ?? BOX_HEADER_H;
              minX = Math.min(minX, pos.x);
              minY = Math.min(minY, pos.y);
              maxX = Math.max(maxX, pos.x + lw);
              maxY = Math.max(maxY, pos.y + lh);
            }
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            zx = centerX - customSize.width / 2;
            zy = centerY - customSize.height / 2 - 18;
            zw = customSize.width;
            zh = customSize.height;
          } else if (expandedSize) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const l of present) {
              const pos = positions[l]!;
              const lw = sizes[l]?.width ?? BOX_W;
              const lh = sizes[l]?.height ?? BOX_HEADER_H;
              minX = Math.min(minX, pos.x);
              minY = Math.min(minY, pos.y);
              maxX = Math.max(maxX, pos.x + lw);
              maxY = Math.max(maxY, pos.y + lh);
            }
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            zx = centerX - expandedSize.width / 2;
            zy = centerY - expandedSize.height / 2 - 18;
            zw = expandedSize.width;
            zh = expandedSize.height;
          } else {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const l of present) {
              const pos = positions[l]!;
              const lw = sizes[l]?.width ?? BOX_W;
              const lh = sizes[l]?.height ?? BOX_HEADER_H;
              minX = Math.min(minX, pos.x);
              minY = Math.min(minY, pos.y);
              maxX = Math.max(maxX, pos.x + lw);
              maxY = Math.max(maxY, pos.y + lh);
            }
            zx = minX - ZONE_PAD;
            zy = minY - ZONE_PAD - 18;
            zw = maxX - minX + ZONE_PAD * 2;
            zh = maxY - minY + ZONE_PAD * 2 + 18;
          }
          
          // Check if node center is inside context bounds
          if (nodeCenterX >= zx && nodeCenterX <= zx + zw && nodeCenterY >= zy && nodeCenterY <= zy + zh) {
            foundContext = ctx.name;
            break;
          }
        }
        
        // Update context labels
        updated.forEach(ctx => {
          const labelIndex = ctx.labels.indexOf(label);
          if (foundContext === ctx.name) {
            // Add to this context if not already there
            if (labelIndex === -1) {
              ctx.labels.push(label);
            }
          } else {
            // Remove from other contexts
            if (labelIndex !== -1) {
              ctx.labels.splice(labelIndex, 1);
            }
          }
        });
      });
      
      return updated;
    });
    
    saveErdLayout({ positions, sizes });
  };

  // Bounded context drag handlers
  const handleContextDragMove = (e: React.MouseEvent) => {
    if (!draggingContext || !dragContextStart) return;

    const deltaX = (e.clientX - dragContextStart.x) / zoom;
    const deltaY = (e.clientY - dragContextStart.y) / zoom;

    setPositions((prev: ErdLayout["positions"]) => {
      const updated = { ...prev };
      Object.entries(dragContextStartPositions).forEach(([l, startPos]) => {
        updated[l] = { x: startPos.x + deltaX, y: startPos.y + deltaY };
      });
      return updated;
    });
  };

  const handleContextDragEnd = () => {
    if (!draggingContext) return;
    setDraggingContext(null);
    setDragContextStart(null);
    setDragContextStartPositions({});
    saveErdLayout({ positions, sizes });
  };

  // Bounded context resize handlers
  const handleContextResizeStart = (ctxName: string, handle: 'se' | 'e' | 's', e: React.MouseEvent) => {
    e.stopPropagation();
    setResizingContext(ctxName);
    setContextResizeHandle(handle);
    const ctx = boundedContexts.find(c => c.name === ctxName);
    if (!ctx) return;
    setContextResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: (contextSizes ?? {})[ctxName]?.width ?? 300,
      height: (contextSizes ?? {})[ctxName]?.height ?? 200
    });
  };

  const handleContextResizeMove = (e: React.MouseEvent) => {
    if (!resizingContext || !contextResizeStart) return;
    
    const deltaX = (e.clientX - contextResizeStart.x) / zoom;
    const deltaY = (e.clientY - contextResizeStart.y) / zoom;
    
    let newWidth = contextResizeStart.width;
    let newHeight = contextResizeStart.height;
    
    if (contextResizeHandle === 'se' || contextResizeHandle === 'e') {
      newWidth = Math.max(200, contextResizeStart.width + deltaX);
    }
    if (contextResizeHandle === 'se' || contextResizeHandle === 's') {
      newHeight = Math.max(150, contextResizeStart.height + deltaY);
    }
    
    setContextSizes(prev => ({
      ...prev,
      [resizingContext]: { width: newWidth, height: newHeight }
    }));
  };

  const handleContextResizeEnd = () => {
    if (!resizingContext) return;
    setResizingContext(null);
    setContextResizeStart(null);
    setContextResizeHandle(null);
    const layout: ErdLayout = { positions, sizes };
    if (contextSizes) {
      layout.contextSizes = contextSizes;
    }
    saveErdLayout(layout);
  };
  
  // Entity resize handlers
  const handleResizeStart = (entityId: string, handle: 'se' | 'e' | 's', e: React.MouseEvent) => {
    e.stopPropagation();
    setResizingEntity(entityId);
    setResizeHandle(handle);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: sizes[entityId]?.width ?? 160,
      height: sizes[entityId]?.height ?? 100
    });
  };
  
  const handleResizeMove = (e: React.MouseEvent) => {
    if (!resizingEntity || !resizeStart) return;
    
    const deltaX = (e.clientX - resizeStart.x) / zoom;
    const deltaY = (e.clientY - resizeStart.y) / zoom;
    
    let newWidth = resizeStart.width;
    let newHeight = resizeStart.height;
    
    if (resizeHandle === 'se' || resizeHandle === 'e') {
      newWidth = Math.max(120, resizeStart.width + deltaX);
    }
    if (resizeHandle === 'se' || resizeHandle === 's') {
      newHeight = Math.max(80, resizeStart.height + deltaY);
    }
    
    setSizes((prev: ErdLayout["sizes"]) => ({
      ...prev,
      [resizingEntity]: { width: newWidth, height: newHeight }
    }));
  };
  
  const handleResizeEnd = () => {
    setResizingEntity(null);
    setResizeStart(null);
    setResizeHandle(null);
    // Save layout after resize completes
    saveErdLayout({ positions, sizes });
  };

  const activeNode = selectedNode ?? hoverNode;

  // Get nodes at distance 1 from the active node (direct neighbors)
  const neighbors = useMemo(() => {
    if (!activeNode) return new Set<string>();
    const neighborSet = new Set<string>();
    for (const e of edges) {
      if (e.fromLabel === activeNode) neighborSet.add(e.toLabel);
      if (e.toLabel === activeNode) neighborSet.add(e.fromLabel);
    }
    return neighborSet;
  }, [activeNode, edges]);

  // Is an edge dimmed when a node is selected/hovered?
  const edgeDimmed = (e: typeof edges[0]) => {
    if (!activeNode) return false;
    return e.fromLabel !== activeNode && e.toLabel !== activeNode;
  };

  const edgeHighlighted = (e: typeof edges[0]) => {
    if (selectedEdgeId === e.id) return true;
    if (!activeNode) return false;
    return e.fromLabel === activeNode || e.toLabel === activeNode;
  };

  const selectedLabelRow = selectedNode ? labelMap.get(selectedNode) : undefined;
  const selectedEdgeDef = selectedEdgeId ? edges.find(e => e.id === selectedEdgeId) : undefined;

  // Calculate collapsed context bounds and entity row positions for edge routing
  const collapsedContextBounds = useMemo(() => {
    const bounds: Record<string, { zx: number; zy: number; zw: number; zh: number; entityRows: Record<string, { x: number; y: number }> }> = {};
    
    for (const ctx of boundedContexts) {
      if (!collapsedContexts.has(ctx.name)) continue;
      
      const present = ctx.labels.filter((l) => positions[l]);
      if (present.length === 0) continue;

      // Calculate collapsed bounds (same logic as rendering)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const l of present) {
        const p = positions[l]!;
        const w = sizes[l]?.width ?? BOX_W;
        const h = sizes[l]?.height ?? BOX_HEADER_H;
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + w);
        maxY = Math.max(maxY, p.y + h);
      }
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const maxNameLength = Math.max(...present.map(l => l.length));
      const collapsedWidth = Math.max(140, maxNameLength * 7 + 40);
      const collapsedHeight = 30 + present.length * 20;
      const zx = centerX - collapsedWidth / 2;
      const zy = centerY - collapsedHeight / 2;
      const zw = collapsedWidth;
      const zh = collapsedHeight;

      // Calculate entity row positions (center of each row)
      const entityRows: Record<string, { x: number; y: number }> = {};
      present.forEach((label, i) => {
        entityRows[label] = {
          x: zx + zw / 2,
          y: zy + 40 + i * 20 // Center of the row (32 + i*20 is top, +8 for center)
        };
      });

      bounds[ctx.name] = { zx, zy, zw, zh, entityRows };
    }
    
    return bounds;
  }, [positions, sizes, collapsedContexts]);

  // Helper to get effective position for edge routing
  const getEffectivePosition = (label: string) => {
    const ctxName = contextOf(label, boundedContexts);
    if (ctxName && collapsedContexts.has(ctxName) && collapsedContextBounds[ctxName]) {
      const bounds = collapsedContextBounds[ctxName];
      return bounds.entityRows[label] ?? positions[label];
    }
    return positions[label];
  };

  // Calculate diagram bounds for mini-map
  const diagramBounds = useMemo(() => {
    const entries = Object.entries(positions);
    if (entries.length === 0) return { minX: 0, minY: 0, maxX: 1000, maxY: 800, width: 1000, height: 800 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [label, p] of entries) {
      const w = sizes[label]?.width ?? BOX_W;
      const h = sizes[label]?.height ?? BOX_HEADER_H;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + w);
      maxY = Math.max(maxY, p.y + h);
    }
    const width = Math.max(maxX - minX, 100);
    const height = Math.max(maxY - minY, 100);
    return { minX, minY, maxX, maxY, width, height };
  }, [positions, sizes]);

  // Calculate viewport rect in diagram coordinates
  const viewportRect = useMemo(() => {
    const viewW = svgSize.width / zoom;
    const viewH = svgSize.height / zoom;
    const viewX = -pan.x + (svgSize.width / 2) - (viewW / 2);
    const viewY = -pan.y + (svgSize.height / 2) - (viewH / 2);
    return { x: viewX, y: viewY, width: viewW, height: viewH };
  }, [svgSize, zoom, pan]);

  // Mini-map click handler
  const handleMiniMapClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;
    
    // Convert mini-map coordinates to diagram coordinates
    const targetX = diagramBounds.minX + clickX * diagramBounds.width;
    const targetY = diagramBounds.minY + clickY * diagramBounds.height;
    
    // Center viewport on target
    const newPanX = -(targetX - svgSize.width / (2 * zoom)) * zoom;
    const newPanY = -(targetY - svgSize.height / (2 * zoom)) * zoom;
    setPan({ x: newPanX, y: newPanY });
  };

  return (
    <>
      {!isFullScreen && (
        <ViewHeader
          title="ERD canvas"
          lede="Interactive schema diagram — 6 node labels and 6 edge types. Click a box or edge to inspect. Ontology-manager lets you evolve this schema at runtime."
        />
      )}
      <div className={`${styles.layout} ${isFullScreen ? styles.layoutFullScreen : ''}`}>
        <Card>
          {/* Zoom controls */}
          <div className={styles.zoomControls}>
            <button onClick={handleZoomOut} className={styles.zoomBtn} title="Zoom out">−</button>
            <span className={styles.zoomLevel}>{Math.round(zoom * 100)}%</span>
            <button onClick={handleZoomIn} className={styles.zoomBtn} title="Zoom in">+</button>
            <button onClick={handleZoomReset} className={styles.zoomBtn} title="Reset zoom">⟲</button>
            <button
              onClick={() => {
                localStorage.removeItem("companygraph.erd.layout.v1");
                setGraphRefreshKey(k => k + 1);
              }}
              className={styles.zoomBtnText}
              title="Reset layout to auto-position"
            >↺ layout</button>
            <button
              onClick={() => setLayoutAlgorithm(prev => prev === "cluster" ? "hierarchical" : "cluster")}
              className={styles.zoomBtnText}
              title={`Switch to ${layoutAlgorithm === "cluster" ? "hierarchical" : "cluster"} layout`}
            >
              {layoutAlgorithm === "cluster" ? "🔀 Hierarchical" : "📦 Cluster"}
            </button>
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className={styles.zoomBtn}
              title={isFullScreen ? "Exit full screen" : "Full screen"}
            >
              {isFullScreen ? "⛶" : "⛶"}
            </button>
            <select 
              value={exportFormat} 
              onChange={(e) => setExportFormat(e.target.value as any)}
              className={styles.zoomBtnText}
              style={{ padding: 4, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-subtle)" }}
            >
              <option value="jsonld">JSON-LD</option>
              <option value="turtle">Turtle</option>
              <option value="ntriples">N-Triples</option>
            </select>
            <Button 
              onClick={handleExport} 
              disabled={isExporting}
            >
              {isExporting ? "Exporting..." : "Export RDF"}
            </Button>
            <button
              onClick={() => setShowCreateModal(true)}
              className={styles.zoomBtnText}
              title="Create new entity"
              style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--accent)" }}
            >
              + Entity
            </button>
            <button
              onClick={() => setShowCreateEdgeModal(true)}
              className={styles.zoomBtnText}
              title="Create new relationship type"
              style={{ background: "var(--good-soft)", color: "var(--good)", borderColor: "var(--good)" }}
            >
              + Edge
            </button>
            <button
              onClick={() => {
                const allLabels = labels.map(l => l.name);
                const suggestions = detectSuggestedContexts(allLabels, edges, boundedContexts);
                setSuggestedContexts(suggestions);
                setShowSuggestions(suggestions.length > 0);
              }}
              className={styles.zoomBtnText}
              title="Analyze interaction patterns to suggest bounded contexts"
              style={{ background: "var(--warn-soft)", color: "var(--warn)", borderColor: "var(--warn)" }}
            >
              ✨ Suggest Contexts
            </button>
          </div>
          
          {/* Canvas fills container with dynamic coordinate space */}
          <div ref={containerRef} className={styles.canvasContainer}>
          <svg 
            ref={svgRef}
            className={styles.svg} 
            onWheel={handleWheel}
            onMouseDown={(e) => {
              // Click on background deselects everything
              if (e.target === svgRef.current) {
                setSelectedNode(null);
                setSelectedEdgeId(null);
                setSelectedEntities(new Set());
                setHoverNode(null);
              }
              handlePanStart(e);
            }}
            onMouseMove={(e) => {
              handleNodeDragMove(e);
              handleContextDragMove(e);
              handleContextResizeMove(e);
              handlePanMove(e);
              handleResizeMove(e);
            }}
            onMouseUp={() => {
              handleNodeDragEnd();
              handleContextDragEnd();
              handleContextResizeEnd();
              handlePanEnd();
              handleResizeEnd();
            }}
            onMouseLeave={() => {
              handleNodeDragEnd();
              handleContextDragEnd();
              handleContextResizeEnd();
              handlePanEnd();
              handleResizeEnd();
            }}
            style={{
              width: '100%',
              height: '100%',
              overflow: 'visible',
              cursor: resizingEntity ? (resizeHandle === 'se' ? 'se-resize' : resizeHandle === 'e' ? 'e-resize' : 's-resize') : resizingContext ? (contextResizeHandle === 'se' ? 'se-resize' : contextResizeHandle === 'e' ? 'e-resize' : 's-resize') : (isDraggingNode ? 'grabbing' : (isPanning || isSpacePressed ? 'grab' : 'default'))
            }}
          >
            <defs>
              {/* Grid pattern — explicit patternTransform ensures it scales with zoom */}
              <pattern
                id="gridPattern"
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
                patternTransform={`scale(${zoom}) translate(${pan.x}, ${pan.y})`}
              >
                <rect width="20" height="20" fill="transparent" />
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--border)" strokeWidth="0.5" opacity="0.5" />
              </pattern>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-strong)" />
              </marker>
              <marker id="arrowAccent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
              </marker>
              <marker id="arrowDanger" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--danger)" />
              </marker>
            </defs>

            {/* Background grid — fills viewport, pattern scales via patternTransform */}
            <rect 
              x="0" y="0" width="100%" height="100%" 
              fill="url(#gridPattern)" 
              onClick={(e) => {
                e.stopPropagation();
                setSelectedNode(null);
                setSelectedEdgeId(null);
                setSelectedContext(null);
                setSelectedEntities(new Set());
              }}
              style={{ cursor: 'default' }}
            />

            <g transform={`translate(${svgSize.width / 2}, ${svgSize.height / 2}) scale(${zoom}) translate(${-svgSize.width / 2 + pan.x}, ${-svgSize.height / 2 + pan.y})`}>
            
            {/* Suggested context zones — dashed rectangles showing detected groupings */}
            {showSuggestions && suggestedContexts.map((suggestion, index) => {
              const present = suggestion.labels.filter((l) => positions[l]);
              if (present.length === 0) return null;
              
              // Calculate bounds
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              for (const l of present) {
                const p = positions[l]!;
                const w = sizes[l]?.width ?? BOX_W;
                const h = sizes[l]?.height ?? BOX_HEADER_H;
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x + w);
                maxY = Math.max(maxY, p.y + h);
              }
              
              const zx = minX - ZONE_PAD;
              const zy = minY - ZONE_PAD - 18;
              const zw = maxX - minX + ZONE_PAD * 2;
              const zh = maxY - minY + ZONE_PAD * 2 + 18;
              
              return (
                <g key={`suggestion-${index}`}>
                  <rect
                    x={zx}
                    y={zy}
                    width={zw}
                    height={zh}
                    fill={suggestion.color.replace('var(--tone-', 'var(--').replace(')', '-soft)')}
                    stroke={suggestion.color}
                    strokeWidth={2}
                    strokeDasharray="8 4"
                    rx={8}
                    opacity={0.3}
                  />
                  <text
                    x={zx + 12}
                    y={zy + 16}
                    fill={suggestion.color}
                    fontSize={12}
                    fontWeight="bold"
                    opacity={0.8}
                  >
                    {suggestion.name} ({Math.round(suggestion.confidence * 100)}%)
                  </text>
                </g>
              );
            })}

            {/* Bounded context zones — rendered first so they sit behind nodes */}
            {boundedContexts.map((ctx) => {
              const present = ctx.labels.filter((l) => positions[l]);
              if (present.length === 0) return null;

              const isSelected = selectedContext === ctx.name;
              const isResizing = resizingContext === ctx.name;
              const isCollapsed = collapsedContexts.has(ctx.name);

              // Use custom size if set, otherwise auto-calculate from entity positions
              const customSize = (contextSizes ?? {})[ctx.name];
              const expandedSize = (contextExpandedSizes ?? {})[ctx.name];
              let zx, zy, zw, zh;

              if (isCollapsed) {
                // Collapsed: compact size based on entity content
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const l of present) {
                  const p = positions[l]!;
                  const w = sizes[l]?.width ?? BOX_W;
                  const h = sizes[l]?.height ?? BOX_HEADER_H;
                  minX = Math.min(minX, p.x);
                  minY = Math.min(minY, p.y);
                  maxX = Math.max(maxX, p.x + w);
                  maxY = Math.max(maxY, p.y + h);
                }
                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                
                // Calculate width needed for entity names (longest name * 6px per char + padding)
                const maxNameLength = Math.max(...present.map(l => l.length));
                const collapsedWidth = Math.max(140, maxNameLength * 7 + 40); // Minimum 140px, or based on longest name
                const collapsedHeight = 30 + present.length * 20; // Header + entity rows
                
                zx = centerX - collapsedWidth / 2;
                zy = centerY - collapsedHeight / 2;
                zw = collapsedWidth;
                zh = collapsedHeight;
              } else if (customSize) {
                // Custom size: center around the entity bounding box
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const l of present) {
                  const p = positions[l]!;
                  const w = sizes[l]?.width ?? BOX_W;
                  const h = sizes[l]?.height ?? BOX_HEADER_H;
                  minX = Math.min(minX, p.x);
                  minY = Math.min(minY, p.y);
                  maxX = Math.max(maxX, p.x + w);
                  maxY = Math.max(maxY, p.y + h);
                }
                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                zx = centerX - customSize.width / 2;
                zy = centerY - customSize.height / 2 - 18;
                zw = customSize.width;
                zh = customSize.height;
              } else if (expandedSize) {
                // Use saved expanded size: center around the entity bounding box
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const l of present) {
                  const p = positions[l]!;
                  const w = sizes[l]?.width ?? BOX_W;
                  const h = sizes[l]?.height ?? BOX_HEADER_H;
                  minX = Math.min(minX, p.x);
                  minY = Math.min(minY, p.y);
                  maxX = Math.max(maxX, p.x + w);
                  maxY = Math.max(maxY, p.y + h);
                }
                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                zx = centerX - expandedSize.width / 2;
                zy = centerY - expandedSize.height / 2 - 18;
                zw = expandedSize.width;
                zh = expandedSize.height;
              } else {
                // Auto-calculate size from entity positions
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const l of present) {
                  const p = positions[l]!;
                  const w = sizes[l]?.width ?? BOX_W;
                  const h = sizes[l]?.height ?? BOX_HEADER_H;
                  minX = Math.min(minX, p.x);
                  minY = Math.min(minY, p.y);
                  maxX = Math.max(maxX, p.x + w);
                  maxY = Math.max(maxY, p.y + h);
                }
                zx = minX - ZONE_PAD;
                zy = minY - ZONE_PAD - 18;
                zw = maxX - minX + ZONE_PAD * 2;
                zh = maxY - minY + ZONE_PAD * 2 + 18;
              }

              const handleContextMouseDown = (e: React.MouseEvent) => {
                if (e.button !== 0 || e.altKey) return;
                e.stopPropagation();
                e.preventDefault();
                
                // Select context and its entities
                if (!isSelected) {
                  setSelectedContext(ctx.name);
                  setSelectedNode(null);
                  setSelectedEdgeId(null);
                  setSelectedEntities(new Set(ctx.labels.filter((l) => positions[l])));
                }
                
                // Start drag for all entities in context
                const startPositions: Record<string, { x: number; y: number }> = {};
                ctx.labels.forEach(l => {
                  if (positions[l]) {
                    startPositions[l] = { ...positions[l] };
                  }
                });
                
                setDraggingContext(ctx.name);
                setDragContextStart({ x: e.clientX, y: e.clientY });
                setDragContextStartPositions(startPositions);
              };

              return (
                <g 
                  key={ctx.name} 
                  className={styles.boundedContext}
                  data-selected={isSelected ? "true" : undefined}
                  data-dragging={draggingContext === ctx.name ? "true" : undefined}
                  data-resizing={isResizing ? "true" : undefined}
                  onMouseDown={handleContextMouseDown}
                  style={{ cursor: draggingContext === ctx.name ? "grabbing" : "grab" }}
                >
                  {/* Zone background with stronger visual distinction */}
                  <rect
                    x={zx} y={zy} width={zw} height={zh}
                    rx={16}
                    className={styles.boundedContextRect}
                    style={{ 
                      stroke: ctx.color, 
                      strokeWidth: isSelected ? 3 : 2,
                      fill: ctx.color, 
                      fillOpacity: isSelected ? 0.12 : 0.08 
                    }}
                  />
                  
                  {/* Resize handles (only when selected) */}
                  {isSelected && (
                    <>
                      {/* SE corner handle */}
                      <rect
                        x={zx + zw - 12}
                        y={zy + zh - 12}
                        width={12}
                        height={12}
                        rx={3}
                        className={styles.contextResizeHandle}
                        onMouseDown={(e) => handleContextResizeStart(ctx.name, 'se', e)}
                        style={{ cursor: 'se-resize' }}
                      />
                      {/* E edge handle */}
                      <rect
                        x={zx + zw - 6}
                        y={zy + zh / 2 - 6}
                        width={6}
                        height={12}
                        rx={2}
                        className={styles.contextResizeHandle}
                        onMouseDown={(e) => handleContextResizeStart(ctx.name, 'e', e)}
                        style={{ cursor: 'e-resize' }}
                      />
                      {/* S edge handle */}
                      <rect
                        x={zx + zw / 2 - 6}
                        y={zy + zh - 6}
                        width={12}
                        height={6}
                        rx={2}
                        className={styles.contextResizeHandle}
                        onMouseDown={(e) => handleContextResizeStart(ctx.name, 's', e)}
                        style={{ cursor: 's-resize' }}
                      />
                    </>
                  )}
                  {/* Corner accents */}
                  <path
                    d={`M ${zx + 4} ${zy + 12} Q ${zx + 4} ${zy + 4} ${zx + 12} ${zy + 4}`}
                    fill="none"
                    stroke={ctx.color}
                    strokeWidth={2}
                    opacity={0.6}
                  />
                  <path
                    d={`M ${zx + zw - 12} ${zy + 4} Q ${zx + zw - 4} ${zy + 4} ${zx + zw - 4} ${zy + 12}`}
                    fill="none"
                    stroke={ctx.color}
                    strokeWidth={2}
                    opacity={0.6}
                  />
                  <path
                    d={`M ${zx + 4} ${zy + zh - 12} Q ${zx + 4} ${zy + zh - 4} ${zx + 12} ${zy + zh - 4}`}
                    fill="none"
                    stroke={ctx.color}
                    strokeWidth={2}
                    opacity={0.6}
                  />
                  <path
                    d={`M ${zx + zw - 12} ${zy + zh - 4} Q ${zx + zw - 4} ${zy + zh - 4} ${zx + zw - 4} ${zy + zh - 12}`}
                    fill="none"
                    stroke={ctx.color}
                    strokeWidth={2}
                    opacity={0.6}
                  />
                  {/* Context name with background pill */}
                  <rect
                    x={zx + 8}
                    y={zy + 6}
                    width={ctx.name.length * 6 + 28}
                    height={18}
                    rx={9}
                    fill={ctx.color}
                    opacity={0.15}
                  />
                  <text x={zx + 16} y={zy + 18} className={styles.boundedContextLabel} style={{ fill: ctx.color }}>
                    {ctx.name}
                  </text>
                  
                  {/* Context API display - shows publishes/consumes */}
                  {isSelected && bcData && (
                    <g transform={`translate(${zx + 8}, ${zy + 32})`}>
                      {(() => {
                        const bc = bcData.find(b => b.name === ctx.name);
                        if (!bc) return null;
                        
                        const publishes = bc.relationships.filter(r => r.type === 'UPSTREAM_OF');
                        const consumes = bc.relationships.filter(r => r.type === 'DOWNSTREAM_OF');
                        
                        return (
                          <>
                            {publishes.length > 0 && (
                              <g>
                                <text x={0} y={0} fontSize={10} fill={ctx.color} fontWeight="bold">Publishes:</text>
                                {publishes.map((rel, i) => (
                                  <text key={i} x={0} y={12 + i * 12} fontSize={9} fill="var(--text)">
                                    → {rel.target}
                                  </text>
                                ))}
                              </g>
                            )}
                            {consumes.length > 0 && (
                              <g transform={`translate(0, ${publishes.length > 0 ? publishes.length * 12 + 20 : 0})`}>
                                <text x={0} y={0} fontSize={10} fill={ctx.color} fontWeight="bold">Consumes:</text>
                                {consumes.map((rel, i) => (
                                  <text key={i} x={0} y={12 + i * 12} fontSize={9} fill="var(--text)">
                                    ← {rel.target}
                                  </text>
                                ))}
                              </g>
                            )}
                          </>
                        );
                      })()}
                    </g>
                  )}
                  {/* Collapse/expand button */}
                  <g
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleContextCollapse(ctx.name);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle
                      cx={zx + ctx.name.length * 6 + 24}
                      cy={zy + 15}
                      r={7}
                      fill={ctx.color}
                      opacity={0.3}
                    />
                    <text
                      x={zx + ctx.name.length * 6 + 24}
                      y={zy + 19}
                      textAnchor="middle"
                      className={styles.boundedContextLabel}
                      style={{ fill: ctx.color, fontSize: '10px', fontWeight: 'bold' }}
                    >
                      {isCollapsed ? '+' : '−'}
                    </text>
                  </g>
                  {/* Entity count badge */}
                  <text x={zx + zw - 12} y={zy + 18} textAnchor="end" className={styles.boundedContextCount} style={{ fill: ctx.color }}>
                    {present.length}
                  </text>
                  
                  {/* Collapsed entity rows */}
                  {isCollapsed && present.map((label, i) => {
                    const tone = TONE[label] ?? "neutral";
                    return (
                      <g key={label}>
                        <rect
                          x={zx + 12}
                          y={zy + 32 + i * 20}
                          width={zw - 24}
                          height={16}
                          rx={4}
                          fill={`var(--tone-${tone})`}
                          opacity={0.15}
                        />
                        <text
                          x={zx + 20}
                          y={zy + 44 + i * 20}
                          className={styles.boundedContextLabel}
                          style={{ fill: `var(--tone-${tone})`, fontSize: '9px' }}
                        >
                          {label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Edges (drawn first so they sit behind nodes) */}
            {edges.map((e, i) => {
              const isDim = edgeDimmed(e);
              const isHighlight = edgeHighlighted(e);
              const stroke = isHighlight ? "var(--accent)" : isDim ? "var(--border)" : "var(--border-strong)";
              const strokeWidth = isHighlight ? 2 : 1;
              const marker = isHighlight ? "url(#arrowAccent)" : "url(#arrow)";

              // Self-loop edges (same from and to label)
              if (e.fromLabel === e.toLabel) {
                const p = getEffectivePosition(e.fromLabel);
                if (!p) return null;
                const h = sizes[e.fromLabel]?.height ?? BOX_HEADER_H;
                const w = sizes[e.fromLabel]?.width ?? BOX_W;
                const cx = p.x + w / 2 + 55;
                const cy = p.y + h / 2;
                return (
                  <g 
                    key={i} 
                    className={styles.edge} 
                    data-dim={isDim ? "true" : undefined} 
                    data-selected={selectedEdgeId === e.id ? "true" : undefined}
                    onMouseEnter={(evt) => {
                      const pt = getSVGPoint(evt);
                      setTooltip({ type: 'edge', id: e.id, x: pt.x, y: pt.y });
                    }}
                    onMouseMove={(evt) => {
                      if (tooltip.type === 'edge' && tooltip.id === e.id) {
                        const pt = getSVGPoint(evt);
                        setTooltip(prev => ({ ...prev, x: pt.x, y: pt.y }));
                      }
                    }}
                    onMouseLeave={() => {
                      setTooltip(prev => prev.type === 'edge' && prev.id === e.id ? { type: null, id: null, x: 0, y: 0 } : prev);
                    }}
                  >
                    <path
                      d={`M ${p.x + w} ${p.y + 22} C ${cx + 35} ${p.y + 10}, ${cx + 35} ${p.y + h - 10}, ${p.x + w} ${p.y + h - 22}`}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      markerEnd={marker}
                      onClick={() => { setSelectedEdgeId(e.id); setSelectedNode(null); }}
                      style={{ cursor: "pointer" }}
                    />
                    <text x={cx + 16} y={cy + 4} className={styles.edgeLabel}>{e.type}</text>
                  </g>
                );
              }

              const a = getEffectivePosition(e.fromLabel);
              const b = getEffectivePosition(e.toLabel);
              if (!a || !b) return null;
              const ah = sizes[e.fromLabel]?.height ?? BOX_HEADER_H;
              const bh = sizes[e.toLabel]?.height ?? BOX_HEADER_H;
              const aw = sizes[e.fromLabel]?.width ?? BOX_W;
              const bw = sizes[e.toLabel]?.width ?? BOX_W;

              const ax = a.x + aw / 2;
              const ay = a.y + ah;
              const bx = b.x + bw / 2;
              const by = b.y;
              const mx = (ax + bx) / 2;
              const my = (ay + by) / 2;

              // Horizontal? Connect side-to-side.
              const horizontal = Math.abs(a.y - b.y) < 30;
              const fromX = horizontal ? (a.x < b.x ? a.x + aw : a.x) : ax;
              const fromY = horizontal ? a.y + ah / 2 : ay;
              const toX = horizontal ? (a.x < b.x ? b.x : b.x + bw) : bx;
              const toY = horizontal ? b.y + bh / 2 : by;

              return (
                <g 
                  key={i} 
                  className={styles.edge} 
                  data-dim={isDim ? "true" : undefined} 
                  data-selected={selectedEdgeId === e.id ? "true" : undefined}
                  onMouseEnter={(evt) => {
                    const pt = getSVGPoint(evt);
                    setTooltip({ type: 'edge', id: e.id, x: pt.x, y: pt.y });
                  }}
                  onMouseMove={(evt) => {
                    if (tooltip.type === 'edge' && tooltip.id === e.id) {
                      const pt = getSVGPoint(evt);
                      setTooltip(prev => ({ ...prev, x: pt.x, y: pt.y }));
                    }
                  }}
                  onMouseLeave={() => {
                    setTooltip(prev => prev.type === 'edge' && prev.id === e.id ? { type: null, id: null, x: 0, y: 0 } : prev);
                  }}
                >
                  <line
                    x1={fromX} y1={fromY} x2={toX} y2={toY}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    markerEnd={marker}
                    onClick={() => { setSelectedEdgeId(e.id); setSelectedNode(null); }}
                    style={{ cursor: "pointer" }}
                  />
                  <text
                    x={mx} y={my - 6}
                    className={styles.edgeLabel}
                    textAnchor="middle"
                  >
                    {e.type}
                  </text>
                </g>
              );
            })}

            {/* Node boxes */}
            {Object.entries(positions).map(([label, p]) => {
              // Hide nodes in collapsed contexts
              const ctxName = contextOf(label, boundedContexts);
              if (ctxName && collapsedContexts.has(ctxName)) return null;
              
              const schema = labelMap.get(label);
              const count = stats.status === "ok"
                ? (stats.data.nodes[label as keyof typeof stats.data.nodes] ?? 0).toString()
                : stats.status === "loading" ? "…" : "—";
              const props = parseSchemaProperties(schema?.json_schema_doc);
              const dims = sizes[label];
              const w = dims?.width ?? 160;
              const h = dims?.height ?? 100;
              const isSelected = selectedNode === label;
              const isMultiSelected = selectedEntities.has(label);
              const isDim = activeNode !== null && activeNode !== label && !neighbors.has(label) && !selectedEntities.has(label);
              const isResizing = resizingEntity === label;

              const handleNodeClick = (e: React.MouseEvent) => {
                // Suppress selection if we just finished a drag (mouse actually moved)
                if (didDragRef.current) { didDragRef.current = false; return; }
                if (e.shiftKey || e.metaKey || e.ctrlKey) {
                  setSelectedEntities(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(label)) newSet.delete(label);
                    else newSet.add(label);
                    return newSet;
                  });
                } else {
                  setSelectedEntities(new Set());
                  setSelectedNode(label);
                  setSelectedEdgeId(null);
                }
              };

              return (
                <g
                  key={label}
                  transform={`translate(${p.x} ${p.y})`}
                  className={styles.node}
                  data-selected={isSelected ? "true" : undefined}
                  data-multi-selected={isMultiSelected ? "true" : undefined}
                  data-dim={isDim ? "true" : undefined}
                  data-resizing={isResizing ? "true" : undefined}
                  onMouseEnter={(e) => {
                    setHoverNode(label);
                    const pt = getSVGPoint(e);
                    setTooltip({ type: 'node', id: label, x: pt.x, y: pt.y });
                  }}
                  onMouseMove={(e) => {
                    if (tooltip.type === 'node' && tooltip.id === label) {
                      const pt = getSVGPoint(e);
                      setTooltip(prev => ({ ...prev, x: pt.x, y: pt.y }));
                    }
                  }}
                  onMouseLeave={() => {
                    setHoverNode((h) => (h === label ? null : h));
                    setTooltip(prev => prev.type === 'node' && prev.id === label ? { type: null, id: null, x: 0, y: 0 } : prev);
                  }}
                  onMouseDown={(e) => handleNodeDragStart(label, e)}
                  onClick={handleNodeClick}
                  style={{ cursor: isDraggingNode && (draggedLabel === label || selectedEntities.has(label)) ? "grabbing" : "grab" }}
                >
                  {/* Box background */}
                  <rect width={w} height={h} rx={6} className={styles.box} />

                  {/* Header stripe */}
                  <rect
                    width={w - 2}
                    height={20}
                    x={1}
                    y={1}
                    rx={5}
                    className={styles.headerStripe}
                    style={{ fill: `var(--tone-${TONE[label] ?? "neutral"})` }}
                  />

                  {/* Label name */}
                  <text x={w / 2} y={16} textAnchor="middle" className={styles.title}>{label}</text>

                  {/* Count */}
                  <text x={w / 2} y={34} textAnchor="middle" className={styles.count}>{count}</text>

                  {/* CRUD controls */}
                  <g className={styles.cardControls}>
                    {/* Edit button */}
                    <rect
                      x={w - 32}
                      y={6}
                      width={10}
                      height={10}
                      rx={2}
                      className={styles.cardControlBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNode(label);
                      }}
                      style={{ cursor: "pointer" }}
                    />
                    <text x={w - 27} y={13} textAnchor="middle" className={styles.cardControlIcon} style={{ cursor: "pointer", pointerEvents: "none" }}>✎</text>
                    
                    {/* Delete button */}
                    <rect
                      x={w - 18}
                      y={6}
                      width={10}
                      height={10}
                      rx={2}
                      className={styles.cardControlBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete entity "${label}"? This cannot be undone.`)) {
                          api.ontology.deleteLabel(label).then(() => {
                            setGraphRefreshKey(k => k + 1);
                            setSelectedNode(null);
                          }).catch(() => {
                            alert("Delete failed — please try again.");
                          });
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    />
                    <text x={w - 13} y={13} textAnchor="middle" className={styles.cardControlIcon} style={{ cursor: "pointer", pointerEvents: "none", fill: "var(--danger)" }}>×</text>
                  </g>

                  {/* Divider */}
                  <line x1={8} y1={40} x2={w - 8} y2={40} stroke="var(--border)" strokeWidth="0.5" />

                  {/* Attribute rows */}
                  {props.slice(0, Math.floor((h - 50) / ATTR_ROW_H)).map((prop, idx) => (
                    <g key={prop.name} transform={`translate(10 ${44 + idx * ATTR_ROW_H})`}>
                      <circle
                        cx={3}
                        cy={5}
                        r={2.5}
                        className={prop.required ? styles.reqDot : styles.optDot}
                      />
                      <text x={10} y={7} className={styles.attrName}>{prop.name}</text>
                      <text x={w - 14} y={7} textAnchor="end" className={styles.attrType}>{prop.type}</text>
                    </g>
                  ))}
                  {props.length === 0 && (
                    <text x={w / 2} y={52} textAnchor="middle" className={styles.noAttrs}>open schema</text>
                  )}
                  
                  {/* Resize handles */}
                  <g className={styles.resizeHandles}>
                    {/* SE corner handle */}
                    <rect
                      x={w - 12}
                      y={h - 12}
                      width={12}
                      height={12}
                      className={styles.resizeHandleSe}
                      onMouseDown={(e) => handleResizeStart(label, 'se', e)}
                    />
                    {/* E edge handle */}
                    <rect
                      x={w - 6}
                      y={h / 2 - 10}
                      width={6}
                      height={20}
                      className={styles.resizeHandleE}
                      onMouseDown={(e) => handleResizeStart(label, 'e', e)}
                    />
                    {/* S edge handle */}
                    <rect
                      x={w / 2 - 10}
                      y={h - 6}
                      width={20}
                      height={6}
                      className={styles.resizeHandleS}
                      onMouseDown={(e) => handleResizeStart(label, 's', e)}
                    />
                  </g>
                </g>
              );
            })}
            </g>
          </svg>
          
          {/* Mini-map overlay - only render when positions are populated */}
          {Object.keys(positions).length > 0 && (
            <div className={styles.miniMap} onClick={handleMiniMapClick}>
              <svg width="100%" height="100%" viewBox={`0 0 ${diagramBounds.width} ${diagramBounds.height}`} preserveAspectRatio="xMidYMid meet">
                {/* Background */}
                <rect width={diagramBounds.width} height={diagramBounds.height} fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1" />
                
                {/* Node dots */}
                {Object.entries(positions).map(([label, p]) => {
                  const x = Math.max(0, p.x - diagramBounds.minX);
                  const y = Math.max(0, p.y - diagramBounds.minY);
                  const tone = TONE[label] ?? "neutral";
                  // Use solid colors for mini-map to ensure visibility
                  const fillColor = tone === "accent" ? "#0ea5e9" : tone === "good" ? "#22c55e" : tone === "warn" ? "#f59e0b" : tone === "danger" ? "#ef4444" : "#64748b";
                  return (
                    <circle
                      key={label}
                      cx={x}
                      cy={y}
                      r={4}
                      fill={fillColor}
                      opacity={0.8}
                    />
                  );
                })}
                
                {/* Viewport rect */}
                <rect
                  x={Math.max(0, viewportRect.x - diagramBounds.minX)}
                  y={Math.max(0, viewportRect.y - diagramBounds.minY)}
                  width={viewportRect.width}
                  height={viewportRect.height}
                  fill="var(--accent)"
                  fillOpacity={0.15}
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                />
              </svg>
              <div className={styles.miniMapLabel}>{Math.round(zoom * 100)}%</div>
            </div>
          )}
          
          {/* Tooltip overlay */}
          {tooltip.type && tooltip.id && (
            <div 
              ref={tooltipRef}
              className={styles.tooltip}
              style={{
                left: `${tooltip.x}px`,
                top: `${tooltip.y}px`,
                transform: 'translate(-50%, -120%)',
              }}
            >
              {tooltip.type === 'node' && (() => {
                const label = tooltip.id;
                const schema = labelMap.get(label);
                const props = parseSchemaProperties(schema?.json_schema_doc);
                return (
                  <div className={styles.tooltipContent}>
                    <div className={styles.tooltipHeader}>
                      <span className={styles.tooltipStripe} style={{ background: `var(--tone-${TONE[label] ?? "neutral"})` }} />
                      <span className={styles.tooltipTitle}>{label}</span>
                      <span className={styles.tooltipType}>entity</span>
                    </div>
                    {schema?.description && (
                      <p className={styles.tooltipDesc}>{schema.description}</p>
                    )}
                    <div className={styles.tooltipStats}>
                      <span>{props.length} attributes</span>
                      {stats.status === 'ok' && (
                        <span>{stats.data.nodes[label as keyof typeof stats.data.nodes] ?? 0} nodes</span>
                      )}
                    </div>
                  </div>
                );
              })()}
              {tooltip.type === 'edge' && (() => {
                const edge = edges.find(e => e.id === tooltip.id);
                if (!edge) return null;
                return (
                  <div className={styles.tooltipEdgeContent}>
                    <div className={styles.tooltipEdgeTitle}>{edge.type}</div>
                    <div className={styles.tooltipEdgeEndpoints}>
                      <span>{edge.fromLabel}</span>
                      <span className={styles.tooltipEdgeArrow}>→</span>
                      <span>{edge.toLabel}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          </div>
        </Card>

        {/* Create Entity Modal */}
        {showCreateModal && (
          <div className={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h3>Create New Entity</h3>
              <p className={styles.modalSubtitle}>Add a new node label to the ontology</p>
              
              {createError && <div className={styles.validationError}>{createError}</div>}
              
              <div className={styles.modalField}>
                <label>Entity Name</label>
                <input
                  type="text"
                  placeholder="e.g., CustomerOrder"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  autoFocus
                />
              </div>
              
              <div className={styles.modalField}>
                <label>Description</label>
                <textarea
                  rows={3}
                  placeholder="Describe this entity's purpose and role in the domain model"
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                />
              </div>
              
              <div className={styles.modalField}>
                <label>Usage Example</label>
                <input
                  type="text"
                  placeholder="e.g., Represents a customer's purchase order"
                  value={createExample}
                  onChange={(e) => setCreateExample(e.target.value)}
                />
              </div>
              
              <div className={styles.modalActions}>
                <button
                  className={styles.btnSecondary}
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateName("");
                    setCreateDesc("");
                    setCreateExample("");
                    setCreateError(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  className={styles.btnPrimary}
                  onClick={async () => {
                    if (!createName.trim()) {
                      setCreateError("Entity name is required");
                      return;
                    }
                    if (!createDesc.trim()) {
                      setCreateError("Description is required");
                      return;
                    }
                    setCreating(true);
                    setCreateError(null);
                    try {
                      await api.ontology.createLabel({
                        name: createName.trim(),
                        description: createDesc.trim(),
                        usage_example: createExample.trim(),
                        json_schema_doc: {
                          type: "object",
                          properties: {},
                          required: []
                        }
                      });
                      setShowCreateModal(false);
                      setCreateName("");
                      setCreateDesc("");
                      setCreateExample("");
                      setGraphRefreshKey(k => k + 1);
                    } catch (e) {
                      setCreateError("Failed to create entity — please try again.");
                    } finally {
                      setCreating(false);
                    }
                  }}
                  disabled={creating}
                >
                  {creating ? "Creating..." : "Create Entity"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Suggested Contexts Modal */}
        {showSuggestions && (
          <div className={styles.modalOverlay} onClick={() => setShowSuggestions(false)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
              <h3>Suggested Bounded Contexts</h3>
              <p className={styles.modalSubtitle}>
                Based on interaction patterns, we found {suggestedContexts.length} potential context(s) for unassigned entities.
              </p>
              
              {suggestedContexts.length === 0 ? (
                <p style={{ color: "var(--muted)", padding: "20px 0" }}>
                  No suggestions found. All entities are already assigned to contexts or there are no connected groups of unassigned entities.
                </p>
              ) : (
                <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                  {suggestedContexts.map((suggestion, index) => (
                    <div key={index} style={{ 
                      border: "1px solid var(--border)", 
                      borderRadius: "8px", 
                      padding: "16px", 
                      marginBottom: "12px",
                      background: "var(--surface-2)"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <h4 style={{ margin: 0, color: suggestion.color }}>{suggestion.name}</h4>
                        <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                          Confidence: {Math.round(suggestion.confidence * 100)}%
                        </span>
                      </div>
                      <div style={{ marginBottom: "12px" }}>
                        <strong>Entities ({suggestion.labels.length}):</strong>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                          {suggestion.labels.map(label => (
                            <span key={label} style={{
                              background: "var(--surface)",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "12px",
                              border: "1px solid var(--border)"
                            }}>
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          className={styles.btnPrimary}
                          onClick={() => {
                            setBoundedContexts(prev => [
                              ...prev,
                              {
                                name: suggestion.name,
                                labels: suggestion.labels,
                                color: suggestion.color
                              }
                            ]);
                            setShowSuggestions(false);
                            setSuggestedContexts([]);
                          }}
                          style={{ fontSize: "13px", padding: "6px 12px" }}
                        >
                          Create Context
                        </button>
                        <button
                          className={styles.btnSecondary}
                          onClick={() => {
                            setSuggestedContexts(prev => prev.filter((_, i) => i !== index));
                            if (suggestedContexts.length === 1) {
                              setShowSuggestions(false);
                            }
                          }}
                          style={{ fontSize: "13px", padding: "6px 12px" }}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className={styles.modalActions}>
                <button
                  className={styles.btnSecondary}
                  onClick={() => {
                    setShowSuggestions(false);
                    setSuggestedContexts([]);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Edge Type Modal */}
        {showCreateEdgeModal && (
          <div className={styles.modalOverlay} onClick={() => setShowCreateEdgeModal(false)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h3>Create New Relationship Type</h3>
              <p className={styles.modalSubtitle}>Add a new edge type to the ontology</p>
              
              {createEdgeError && <div className={styles.validationError}>{createEdgeError}</div>}
              
              <div className={styles.modalField}>
                <label>Relationship Name</label>
                <input
                  type="text"
                  placeholder="e.g., HAS_MANY"
                  value={createEdgeName}
                  onChange={(e) => setCreateEdgeName(e.target.value)}
                  autoFocus
                />
              </div>
              
              <div className={styles.modalField}>
                <label>Description</label>
                <textarea
                  rows={3}
                  placeholder="Describe this relationship's purpose and when to use it"
                  value={createEdgeDesc}
                  onChange={(e) => setCreateEdgeDesc(e.target.value)}
                />
              </div>
              
              <div className={styles.modalField}>
                <label>Usage Example</label>
                <input
                  type="text"
                  placeholder="e.g., Order HAS_MANY OrderItems"
                  value={createEdgeExample}
                  onChange={(e) => setCreateEdgeExample(e.target.value)}
                />
              </div>
              
              <div className={styles.modalActions}>
                <button
                  className={styles.btnSecondary}
                  onClick={() => {
                    setShowCreateEdgeModal(false);
                    setCreateEdgeName("");
                    setCreateEdgeDesc("");
                    setCreateEdgeExample("");
                    setCreateEdgeError(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  className={styles.btnPrimary}
                  onClick={async () => {
                    if (!createEdgeName.trim()) {
                      setCreateEdgeError("Relationship name is required");
                      return;
                    }
                    if (!createEdgeDesc.trim()) {
                      setCreateEdgeError("Description is required");
                      return;
                    }
                    setCreatingEdge(true);
                    setCreateEdgeError(null);
                    try {
                      await api.ontology.createEdgeType({
                        name: createEdgeName.trim(),
                        description: createEdgeDesc.trim(),
                        usage_example: createEdgeExample.trim(),
                        endpoints: []
                      });
                      setShowCreateEdgeModal(false);
                      setCreateEdgeName("");
                      setCreateEdgeDesc("");
                      setCreateEdgeExample("");
                      setGraphRefreshKey(k => k + 1);
                    } catch (e) {
                      setCreateEdgeError("Failed to create relationship type — please try again.");
                    } finally {
                      setCreatingEdge(false);
                    }
                  }}
                  disabled={creatingEdge}
                >
                  {creatingEdge ? "Creating..." : "Create Relationship"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Right panel — selection-aware details */}
        <aside className={styles.panel}>
          {selectedLabelRow ? (
            <SelectedLabelPanel row={selectedLabelRow} edges={edges} onRefresh={() => setGraphRefreshKey(k => k + 1)} onDeselect={() => setSelectedNode(null)} />
          ) : selectedEdgeDef ? (
            <SelectedEdgePanel edge={selectedEdgeDef} onRefresh={() => setGraphRefreshKey(k => k + 1)} onDeselect={() => setSelectedEdgeId(null)} />
          ) : selectedContext ? (
            <SelectedContextPanel 
              contextName={selectedContext} 
              contexts={boundedContexts}
              edges={edges}
              positions={positions}
              openapiDoc={openapiDoc}
              analytics={analytics}
              onDeselect={() => setSelectedContext(null)}
            />
          ) : (
            <Card title="Schema details">
              <p style={{ color: "var(--muted)", fontSize: 13 }}>
                Click a node, edge, or bounded context zone to inspect details.
              </p>
            </Card>
          )}

          {/* Legend */}
          <Card title="Legend">
            <div className={styles.legend}>
              <div className={styles.legendRow}>
                <span className={styles.legendDot} style={{ background: "var(--accent)" }} />
                <span>Required attribute</span>
              </div>
              <div className={styles.legendRow}>
                <span className={styles.legendDot} style={{ background: "var(--border-strong)", border: "1px solid var(--border-strong)" }} />
                <span>Optional attribute</span>
              </div>
              <div className={styles.legendRow}>
                <span className={styles.legendLine} />
                <span>Relationship</span>
              </div>
              <div className={styles.legendRow}>
                <span className={styles.legendLineActive} />
                <span>Selected / highlighted</span>
              </div>
            </div>
          </Card>

          {stats.status === "loading" && <Loading what="counts" />}
          {stats.status === "error" && <ErrorState message={stats.error} />}
          {graphLoading && <Loading what="ontology graph" />}
          {graphError && <ErrorState message={graphError} />}
        </aside>
      </div>
    </>
  );
}

// ── Right-panel: selected label ─────────────────────────────────

type AttrRow = { name: string; type: string; required: boolean };

function schemaToAttrs(doc: Record<string, unknown>): AttrRow[] {
  const props = doc.properties as Record<string, { type?: string }> | undefined;
  if (!props) return [];
  const req = Array.isArray(doc.required) ? (doc.required as string[]) : [];
  return Object.entries(props).map(([name, def]) => ({
    name,
    type: def.type ?? "string",
    required: req.includes(name),
  }));
}

function attrsToSchema(attrs: AttrRow[], base: Record<string, unknown>): Record<string, unknown> {
  const properties: Record<string, { type: string }> = {};
  const required: string[] = [];
  for (const a of attrs) {
    properties[a.name] = { type: a.type };
    if (a.required) required.push(a.name);
  }
  return { ...base, type: "object", properties, required };
}

function validateAttrs(attrs: AttrRow[]): string | null {
  if (attrs.some((a) => !a.name.trim())) return "Attribute names cannot be empty.";
  const names = attrs.map((a) => a.name.trim());
  if (new Set(names).size !== names.length) return "Attribute names must be unique.";
  return null;
}

function SelectedLabelPanel({
  row,
  edges,
  onRefresh,
  onDeselect,
}: {
  row: import("../../api").OntologyLabelRow;
  edges: import("./useOntologyGraph").ErdEdge[];
  onRefresh: () => void;
  onDeselect: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempDesc, setTempDesc] = useState(row.description);
  const [tempExample, setTempExample] = useState(row.usage_example);
  const [attrs, setAttrs] = useState<AttrRow[]>(() => schemaToAttrs(row.json_schema_doc));
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset local state when the selected row changes
  const prevNameRef = useRef(row.name);
  if (row.name !== prevNameRef.current) {
    prevNameRef.current = row.name;
    setEditing(false);
    setTempDesc(row.description);
    setTempExample(row.usage_example);
    setAttrs(schemaToAttrs(row.json_schema_doc));
    setSaveErr(null);
  }

  const connectedEdges = edges.filter(
    (e) => e.fromLabel === row.name || e.toLabel === row.name,
  );

  const startEdit = () => {
    setTempDesc(row.description);
    setTempExample(row.usage_example);
    setAttrs(schemaToAttrs(row.json_schema_doc));
    setSaveErr(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setSaveErr(null);
    setEditing(false);
  };

  const handleSave = async () => {
    const attrErr = validateAttrs(attrs);
    if (attrErr) { setSaveErr(attrErr); return; }
    setSaving(true);
    setSaveErr(null);
    try {
      await api.ontology.updateLabel(row.name, {
        description: tempDesc,
        usage_example: tempExample,
        json_schema_doc: attrsToSchema(attrs, row.json_schema_doc),
      });
      setEditing(false);
      onRefresh();
    } catch {
      setSaveErr("Save failed — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete entity "${row.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.ontology.deleteLabel(row.name);
      onDeselect();
      onRefresh();
    } catch {
      setSaveErr("Delete failed — please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const addAttr = () =>
    setAttrs((prev) => [...prev, { name: `attr_${prev.length + 1}`, type: "string", required: false }]);

  const updateAttr = (idx: number, patch: Partial<AttrRow>) =>
    setAttrs((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));

  const removeAttr = (idx: number) =>
    setAttrs((prev) => prev.filter((_, i) => i !== idx));

  const tone = TONE[row.name] ?? "neutral";

  return (
    <div className={styles.detailPanel}>
      {/* ── Header ── */}
      <div className={styles.detailHeader}>
        <span className={styles.detailStripe} style={{ background: `var(--tone-${tone})` }} />
        <span className={styles.detailTitle}>{row.name}</span>
        <Pill tone={tone}>entity</Pill>
        <div className={styles.detailActions}>
          {editing ? (
            <>
              <button className={styles.btnIcon} onClick={handleSave} disabled={saving} title="Save">
                {saving ? "…" : "✓"}
              </button>
              <button className={styles.btnIcon} onClick={cancelEdit} title="Cancel">
                ✕
              </button>
            </>
          ) : (
            <>
              <button className={styles.btnIcon} onClick={startEdit} title="Edit">
                ✎
              </button>
              <button
                className={styles.btnIcon}
                onClick={handleDelete}
                disabled={deleting}
                title="Delete entity"
                style={{ color: "var(--danger)" }}
              >
                {deleting ? "…" : "×"}
              </button>
            </>
          )}
        </div>
      </div>

      {saveErr && <div className={styles.detailError}>{saveErr}</div>}

      {/* ── Meta strip ── */}
      <div className={styles.detailMeta}>
        <span>Created {row.created_at.slice(0, 10)}</span>
        <span>·</span>
        <span>Updated {row.updated_at.slice(0, 10)}</span>
        {row.deprecated_at && (
          <>
            <span>·</span>
            <Pill tone="warn">Deprecated</Pill>
          </>
        )}
      </div>

      {/* ── Description ── */}
      <section className={styles.detailSection}>
        <SecLabel>DESCRIPTION</SecLabel>
        {editing ? (
          <textarea
            className={styles.textareaInput}
            rows={3}
            value={tempDesc}
            onChange={(e) => setTempDesc(e.target.value)}
          />
        ) : (
          <p className={styles.detailBody}>{row.description || <em className={styles.muted}>No description</em>}</p>
        )}
      </section>

      {/* ── Usage example ── */}
      <section className={styles.detailSection}>
        <SecLabel>USAGE EXAMPLE</SecLabel>
        {editing ? (
          <input
            type="text"
            className={styles.textareaInput}
            value={tempExample}
            onChange={(e) => setTempExample(e.target.value)}
            placeholder="e.g. (o:Order)"
          />
        ) : (
          <code className={styles.detailCode}>{row.usage_example || <em>—</em>}</code>
        )}
      </section>

      {/* ── Attributes ── */}
      <section className={styles.detailSection}>
        <SecLabel>ATTRIBUTES {editing ? `(${attrs.length})` : `(${attrs.length})`}</SecLabel>
        {editing ? (
          <div className={styles.attrEditTable}>
            {attrs.map((a, idx) => (
              <div key={idx} className={styles.attrEditRow}>
                <input
                  className={styles.attrEditInput}
                  value={a.name}
                  placeholder="name"
                  onChange={(e) => updateAttr(idx, { name: e.target.value })}
                />
                <select
                  className={styles.attrEditSelect}
                  value={a.type}
                  onChange={(e) => updateAttr(idx, { type: e.target.value })}
                >
                  {["string", "number", "boolean", "array", "object"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <label className={styles.attrReqToggle}>
                  <input
                    type="checkbox"
                    checked={a.required}
                    onChange={(e) => updateAttr(idx, { required: e.target.checked })}
                  />
                  req
                </label>
                <button
                  className={styles.attrRemoveBtn}
                  onClick={() => removeAttr(idx)}
                  title="Remove attribute"
                >
                  ×
                </button>
              </div>
            ))}
            <button className={styles.addAttrBtn} onClick={addAttr}>
              + Add attribute
            </button>
          </div>
        ) : attrs.length > 0 ? (
          <table className={styles.attrTable}>
            <tbody>
              {attrs.map((a) => (
                <tr key={a.name} className={styles.attrTableRow}>
                  <td>
                    <span
                      className={styles.attrDot}
                      style={{ background: a.required ? "var(--accent)" : "var(--border-strong)" }}
                      title={a.required ? "required" : "optional"}
                    />
                  </td>
                  <td className={styles.attrName}>{a.name}</td>
                  <td className={styles.attrType}>{a.type}</td>
                  {a.required && <td><span className={styles.attrReqBadge}>req</span></td>}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.muted}>No attributes defined.</p>
        )}
      </section>

      {/* ── Connected edges ── */}
      {connectedEdges.length > 0 && (
        <section className={styles.detailSection}>
          <SecLabel>RELATIONSHIPS ({connectedEdges.length})</SecLabel>
          <div className={styles.relList}>
            {connectedEdges.map((e) => {
              const isFrom = e.fromLabel === row.name;
              return (
                <div key={e.id} className={styles.relRow}>
                  <span className={isFrom ? styles.relSelf : styles.relOther}>
                    {isFrom ? row.name : e.fromLabel}
                  </span>
                  <span className={styles.relArrow}>
                    <span className={styles.relType}>{e.type}</span>
                    →
                  </span>
                  <span className={isFrom ? styles.relOther : styles.relSelf}>
                    {isFrom ? e.toLabel : row.name}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── External alignments ── */}
      {row.external_alignment.length > 0 && (
        <section className={styles.detailSection}>
          <SecLabel>EXTERNAL ALIGNMENTS ({row.external_alignment.length})</SecLabel>
          <div className={styles.alignList}>
            {row.external_alignment.map((a, i) => (
              <div key={i} className={styles.alignRow}>
                <span className={styles.alignSource}>{a.source}</span>
                <code className={styles.alignId}>{a.id}</code>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Right-panel: selected edge ──────────────────────────────────

function SelectedEdgePanel({
  edge,
  onRefresh,
  onDeselect,
}: {
  edge: import("./useOntologyGraph").ErdEdge;
  onRefresh: () => void;
  onDeselect: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempDesc, setTempDesc] = useState(edge.source.description);
  const [tempExample, setTempExample] = useState(edge.source.usage_example);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const prevTypeRef = useRef(edge.type);
  if (edge.type !== prevTypeRef.current) {
    prevTypeRef.current = edge.type;
    setEditing(false);
    setTempDesc(edge.source.description);
    setTempExample(edge.source.usage_example);
    setSaveErr(null);
  }

  const startEdit = () => {
    setTempDesc(edge.source.description);
    setTempExample(edge.source.usage_example);
    setSaveErr(null);
    setEditing(true);
  };

  const cancelEdit = () => { setSaveErr(null); setEditing(false); };

  const handleSave = async () => {
    setSaving(true);
    setSaveErr(null);
    try {
      await api.ontology.updateEdgeType(edge.type, {
        description: tempDesc,
        usage_example: tempExample,
      });
      setEditing(false);
      onRefresh();
    } catch {
      setSaveErr("Save failed — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete edge type "${edge.type}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.ontology.deleteEdgeType(edge.type);
      onDeselect();
      onRefresh();
    } catch {
      setSaveErr("Delete failed — please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const allEndpoints = edge.source.endpoints;

  return (
    <div className={styles.detailPanel}>
      {/* ── Header ── */}
      <div className={styles.detailHeader}>
        <span className={styles.detailStripe} style={{ background: "var(--muted)" }} />
        <span className={styles.detailTitle}>{edge.type}</span>
        <Pill tone="neutral">relationship</Pill>
        <div className={styles.detailActions}>
          {editing ? (
            <>
              <button className={styles.btnIcon} onClick={handleSave} disabled={saving} title="Save">
                {saving ? "…" : "✓"}
              </button>
              <button className={styles.btnIcon} onClick={cancelEdit} title="Cancel">
                ✕
              </button>
            </>
          ) : (
            <>
              <button className={styles.btnIcon} onClick={startEdit} title="Edit">
                ✎
              </button>
              <button
                className={styles.btnIcon}
                onClick={handleDelete}
                disabled={deleting}
                title="Delete relationship"
                style={{ color: "var(--danger)" }}
              >
                {deleting ? "…" : "×"}
              </button>
            </>
          )}
        </div>
      </div>

      {saveErr && <div className={styles.detailError}>{saveErr}</div>}

      {/* ── Meta strip ── */}
      <div className={styles.detailMeta}>
        <span>Created {edge.source.created_at.slice(0, 10)}</span>
        <span>·</span>
        <span>Updated {edge.source.updated_at.slice(0, 10)}</span>
        {edge.source.deprecated_at && (
          <>
            <span>·</span>
            <Pill tone="warn">Deprecated</Pill>
          </>
        )}
      </div>

      {/* ── Description ── */}
      <section className={styles.detailSection}>
        <SecLabel>DESCRIPTION</SecLabel>
        {editing ? (
          <textarea
            className={styles.textareaInput}
            rows={3}
            value={tempDesc}
            onChange={(e) => setTempDesc(e.target.value)}
          />
        ) : (
          <p className={styles.detailBody}>{edge.source.description || <em className={styles.muted}>No description</em>}</p>
        )}
      </section>

      {/* ── Usage example ── */}
      <section className={styles.detailSection}>
        <SecLabel>USAGE EXAMPLE</SecLabel>
        {editing ? (
          <input
            type="text"
            className={styles.textareaInput}
            value={tempExample}
            onChange={(e) => setTempExample(e.target.value)}
            placeholder="e.g. (a)-[:PLACED_BY]->(c)"
          />
        ) : (
          <code className={styles.detailCode}>{edge.source.usage_example || <em>—</em>}</code>
        )}
      </section>

      {/* ── Endpoints ── */}
      <section className={styles.detailSection}>
        <SecLabel>ENDPOINTS ({allEndpoints.length})</SecLabel>
        <div className={styles.relList}>
          {allEndpoints.map((ep, i) => (
            <div key={i} className={styles.relRow}>
              <span className={styles.relOther}>{ep.fromLabel}</span>
              <span className={styles.relArrow}>
                <span className={styles.relType}>{edge.type}</span>→
              </span>
              <span className={styles.relOther}>{ep.toLabel}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── External alignments ── */}
      {(edge.source.external_alignment ?? []).length > 0 && (
        <section className={styles.detailSection}>
          <SecLabel>EXTERNAL ALIGNMENTS ({(edge.source.external_alignment ?? []).length})</SecLabel>
          <div className={styles.alignList}>
            {(edge.source.external_alignment ?? []).map((a, i) => (
              <div key={i} className={styles.alignRow}>
                <span className={styles.alignSource}>{a.source}</span>
                <code className={styles.alignId}>{a.id}</code>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Right-panel: selected bounded context ────────────────────────

function SelectedContextPanel({
  contextName,
  contexts,
  edges,
  positions,
  openapiDoc,
  analytics,
  onDeselect,
}: {
  contextName: string;
  contexts: Array<{ name: string; labels: string[]; color: string }>,
  edges: import("./useOntologyGraph").ErdEdge[];
  positions: Record<string, { x: number; y: number }>;
  openapiDoc: import("../../useFetch").FetchState<Record<string, unknown>>;
  analytics: import("../../useFetch").FetchState<{
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
  }>;
  onDeselect: () => void;
}) {
  const ctx = contexts.find((c) => c.name === contextName);
  if (!ctx) return null;

  const present = ctx.labels.filter((l) => positions[l]);
  const api = contextApi(ctx.labels, edges, contexts);
  const publishes = api.filter((a) => a.direction === "publishes");
  const consumes = api.filter((a) => a.direction === "consumes");

  // ── Per-context analytics (computed from local label-level data) ──
  const ctxLabels = new Set(ctx.labels);

  // Coupling ratio: cross-context edges / total edges touching this context
  const ctxEdgeCount = edges.filter(e => ctxLabels.has(e.fromLabel) || ctxLabels.has(e.toLabel)).length;
  const crossEdgeCount = edges.filter(e => {
    const f = ctxLabels.has(e.fromLabel);
    const t = ctxLabels.has(e.toLabel);
    return f !== t;
  }).length;
  const couplingRatio = ctxEdgeCount > 0 ? crossEdgeCount / ctxEdgeCount : 0;

  // Build flat graph for centrality / cycle / SCC analysis
  const flatG = buildGraph(ctx.labels, edges);
  const bc = betweennessCentrality(flatG);
  const cycles = findAllCycles(flatG);
  const sccs = findSCCs(flatG);

  // Filter metrics to this context
  const contextBetweenness = ctx.labels
    .map((label, i) => ({ label, score: bc[i] ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const cycleLabels = new Set(cycles.flatMap(c => c.cycle));
  const cycleParticipants = ctx.labels.filter(l => cycleLabels.has(l));

  const sccLabels = new Set(sccs.flatMap(s => s.members));
  const sccParticipants = ctx.labels.filter(l => sccLabels.has(l));

  // Derive REST endpoints from the live OpenAPI spec
  const restEndpoints = openapiDoc.status === "ok"
    ? contextOpenApiEndpoints(ctx, openapiDoc.data)
    : [];
  const [expandedEndpoint, setExpandedEndpoint] = useState<number | null>(null);

  return (
    <Card 
      title={ctx.name}
      actions={
        <button className={styles.btnIcon} onClick={onDeselect} title="Close">
          ✕
        </button>
      }
    >
      <div className={styles.contextPanel}>
        {/* Header info */}
        <div className={styles.contextHeader}>
          <span 
            className={styles.contextStripe} 
            style={{ background: ctx.color }}
          />
          <div className={styles.contextMeta}>
            <span className={styles.contextType}>Bounded Context</span>
            <span className={styles.contextCount}>
              {present.length} entity{present.length !== 1 ? "ies" : "y"}
            </span>
          </div>
        </div>

        {/* Entities in this context */}
        <section className={styles.contextSection}>
          <SecLabel>ENTITIES</SecLabel>
          <div className={styles.contextEntityList}>
            {ctx.labels.map((label) => (
              <div 
                key={label} 
                className={`${styles.contextEntity} ${!positions[label] ? styles.contextEntityMissing : ""}`}
              >
                <span 
                  className={styles.contextEntityDot}
                  style={{ background: ctx.color }}
                />
                <span className={styles.contextEntityName}>{label}</span>
                {!positions[label] && (
                  <span className={styles.contextEntityNote}>not in diagram</span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* API Contracts */}
        {api.length > 0 && (
          <section className={styles.contextSection}>
            <SecLabel>API CONTRACTS</SecLabel>
            
            {publishes.length > 0 && (
              <div className={styles.contextApiBlock}>
                <div className={styles.contextApiHeader} style={{ color: ctx.color }}>
                  <span>↑ Publishes</span>
                  <span className={styles.contextApiCount}>{publishes.length}</span>
                </div>
                <div className={styles.contextApiList}>
                  {publishes.map((p, i) => (
                    <div key={i} className={styles.contextApiItem}>
                      <span className={styles.contextApiEdge}>{p.edgeType}</span>
                      <span className={styles.contextApiArrow}>→</span>
                      <span className={styles.contextApiTarget}>{p.remoteLabel}</span>
                      {p.remoteContext && (
                        <span className={styles.contextApiTargetContext}>({p.remoteContext})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {consumes.length > 0 && (
              <div className={styles.contextApiBlock}>
                <div className={styles.contextApiHeader} style={{ color: "var(--muted)" }}>
                  <span>↓ Consumes</span>
                  <span className={styles.contextApiCount}>{consumes.length}</span>
                </div>
                <div className={styles.contextApiList}>
                  {consumes.map((c, i) => (
                    <div key={i} className={styles.contextApiItem}>
                      <span className={styles.contextApiTarget}>{c.remoteLabel}</span>
                      {c.remoteContext && (
                        <span className={styles.contextApiTargetContext}>({c.remoteContext})</span>
                      )}
                      <span className={styles.contextApiArrow}>→</span>
                      <span className={styles.contextApiEdge}>{c.edgeType}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {api.length === 0 && (
          <section className={styles.contextSection}>
            <SecLabel>API CONTRACTS</SecLabel>
            <p className={styles.contextEmpty}>No cross-context relationships. This context is self-contained.</p>
          </section>
        )}

        {/* Analytics Metrics */}
        <section className={styles.contextSection}>
          <SecLabel>METRICS</SecLabel>

          {/* Coupling */}
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Coupling ratio</span>
            <span className={styles.metricValue} style={{
              color: couplingRatio > 0.5 ? "var(--danger)" : couplingRatio > 0.25 ? "var(--warn)" : "var(--good)"
            }}>
              {(couplingRatio * 100).toFixed(0)}%
            </span>
          </div>
          <div className={styles.metricBar}>
            <div className={styles.metricBarFill} style={{
              width: `${couplingRatio * 100}%`,
              background: couplingRatio > 0.5 ? "var(--danger)" : couplingRatio > 0.25 ? "var(--warn)" : "var(--good)"
            }} />
          </div>

          {/* Cycles */}
          {cycleParticipants.length > 0 && (
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Cycle risk</span>
              <span className={styles.metricValue} style={{ color: "var(--warn)" }}>
                {cycleParticipants.length} participant{cycleParticipants.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* SCCs */}
          {sccParticipants.length > 0 && (
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Strong components</span>
              <span className={styles.metricValue} style={{ color: "var(--accent)" }}>
                {sccParticipants.length} node{sccParticipants.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Top bottlenecks in context */}
          {contextBetweenness.length > 0 && (contextBetweenness[0]?.score ?? 0) > 0 && (
            <div className={styles.metricSubSection}>
              <span className={styles.metricSubLabel}>Top bottlenecks</span>
              <div className={styles.metricList}>
                {contextBetweenness.slice(0, 3).map((b) => (
                  <div key={b.label} className={styles.metricItem}>
                    <span className={styles.metricItemName}>{b.label}</span>
                    <span className={styles.metricItemScore}>{b.score.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Global summary from API analytics */}
          {analytics.status === "ok" && (
            <div className={styles.metricSubSection}>
              <span className={styles.metricSubLabel}>Global graph</span>
              <div className={styles.metricList}>
                <div className={styles.metricItem}>
                  <span className={styles.metricItemName}>Density</span>
                  <span className={styles.metricItemScore}>{analytics.data.density.toFixed(3)}</span>
                </div>
                <div className={styles.metricItem}>
                  <span className={styles.metricItemName}>Cycles</span>
                  <span className={styles.metricItemScore}>{analytics.data.cycles.length}</span>
                </div>
                <div className={styles.metricItem}>
                  <span className={styles.metricItemName}>Orphans</span>
                  <span className={styles.metricItemScore}>{analytics.data.orphans.length}</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* REST API Documentation from OpenAPI spec */}
        <section className={styles.contextSection}>
          <SecLabel>REST API</SecLabel>
          {openapiDoc.status === "loading" && (
            <p className={styles.contextEmpty}>Loading API documentation…</p>
          )}
          {openapiDoc.status === "error" && (
            <p className={styles.contextEmpty}>Could not load API docs.</p>
          )}
          {openapiDoc.status === "ok" && restEndpoints.length === 0 && (
            <p className={styles.contextEmpty}>No dedicated REST endpoints for this context.</p>
          )}
          {openapiDoc.status === "ok" && restEndpoints.length > 0 && (
            <div className={styles.restApiList}>
              {restEndpoints.map((ep, i) => {
                const isExpanded = expandedEndpoint === i;
                const methodUpper = ep.method.toUpperCase();
                const methodColor =
                  methodUpper === "GET" ? "var(--tone-good)" :
                  methodUpper === "POST" ? "var(--tone-accent)" :
                  methodUpper === "PATCH" ? "var(--tone-warn)" :
                  methodUpper === "DELETE" ? "var(--tone-danger)" : "var(--muted)";
                return (
                  <div key={i} className={styles.restApiItem}>
                    <button
                      className={styles.restApiSummary}
                      onClick={() => setExpandedEndpoint(isExpanded ? null : i)}
                    >
                      <span className={styles.restApiMethod} style={{ color: methodColor }}>{methodUpper}</span>
                      <span className={styles.restApiPath}>{ep.path}</span>
                      <span className={styles.restApiToggle}>{isExpanded ? "▾" : "▸"}</span>
                    </button>
                    {isExpanded && (
                      <div className={styles.restApiDetail}>
                        {ep.description && <p className={styles.restApiDesc}>{ep.description}</p>}
                        {ep.requestBody && (
                          <div className={styles.restApiSubSection}>
                            <span className={styles.restApiSubLabel}>Request Body</span>
                            <pre className={styles.restApiSchema}>
                              {JSON.stringify(ep.requestBody, null, 2).slice(0, 600)}
                            </pre>
                          </div>
                        )}
                        {ep.responses && (
                          <div className={styles.restApiSubSection}>
                            <span className={styles.restApiSubLabel}>Responses</span>
                            {Object.entries(ep.responses).map(([code, resp]) => (
                              <div key={code} className={styles.restApiResponse}>
                                <span className={styles.restApiCode}>{code}</span>
                                <span className={styles.restApiResponseDesc}>{resp.description ?? ""}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </Card>
  );
}
