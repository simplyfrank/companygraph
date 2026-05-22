import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./JourneyCanvas.module.css";

// =====================================================================
//   Public data shape — built by views/explorer/JourneyGraph.tsx from
//   the graph-core Cypher reads. The canvas is layout-only; it does
//   not fetch.
// =====================================================================
export interface ActivityNode { id: string; name: string; column: number; }
export interface RoleNode {
  id: string; name: string;
  team_id?: string; team_name?: string; team_color?: string;
  columns: number[];                        // activity columns this role executes
  durations: Record<number, number>;        // column → minutes
}
export interface SystemNode {
  id: string; name: string; kind?: string;
  usages: Array<{ column: number; target_ms?: number; actual_ms?: number }>;
}
export interface LocationNode { id: string; name: string; columns: number[]; }
export interface PrecedesEdge {
  from_col: number; to_col: number;
  target_ms?: number; actual_ms?: number;
}
export interface JourneyData {
  activities: ActivityNode[];
  roles: RoleNode[];
  systems: SystemNode[];
  locations: LocationNode[];
  precedes: PrecedesEdge[];
}

export type LayoutMode = "chain" | "radial";

export interface VisibleLayers {
  roles: boolean;
  systems: boolean;
  locations: boolean;
}

export type SelectedRef =
  | { kind: "activity";  id: string }
  | { kind: "role";      id: string }
  | { kind: "system";    id: string }
  | { kind: "location";  id: string }
  | null;

export interface SlaSummary {
  ok: number;
  warn: number;
  breach: number;
  total: number;
  slowest?: { label: string; ratio: number };
}

interface Props {
  data: JourneyData;
  layoutMode: LayoutMode;
  visibleLayers: VisibleLayers;
  selected: SelectedRef;
  onSelect: (s: SelectedRef) => void;
  onReorder?: (newActivityIds: string[]) => void;
  zoomCommand?: { action: "in" | "out" | "reset" | "fit"; nonce: number } | null;
  onZoomChange?: (pct: number) => void;
}

// =====================================================================
//   Layout constants
// =====================================================================
const CHAIN = {
  colWidth:  200,
  padX:       80,
  yRole:     110,
  yActivity: 290,
  ySystem:   470,
  yLocation: 580,
  height:    660,
};

const RADIAL = {
  cx: 540, cy: 380,
  rActivity: 140,
  rRole:     240,
  rSystem:   330,
  rLocation: 410,
};

// =====================================================================
//   SLA + style helpers
// =====================================================================
type Tone = "good" | "warn" | "breach";
function slaStatus(target?: number, actual?: number): Tone | null {
  if (target == null || actual == null) return null;
  if (actual <= target) return "good";
  if (actual <= target * 1.5) return "warn";
  return "breach";
}
function teamColorVar(color?: string): string {
  switch (color) {
    case "accent": return "var(--accent)";
    case "good":   return "var(--good)";
    case "warn":   return "var(--warn)";
    case "danger": return "var(--danger)";
    default:       return "var(--muted-2)";
  }
}

export function computeSlaSummary(d: JourneyData): SlaSummary {
  let ok = 0, warn = 0, breach = 0;
  let slowest: { label: string; ratio: number } | undefined;
  const consider = (label: string, target?: number, actual?: number): void => {
    const s = slaStatus(target, actual);
    if (!s) return;
    if (s === "good") ok++;
    else if (s === "warn") warn++;
    else breach++;
    if (target && actual) {
      const r = actual / target;
      if (!slowest || r > slowest.ratio) slowest = { label, ratio: r };
    }
  };
  for (const p of d.precedes) consider(`p.${p.from_col}→${p.to_col}`, p.target_ms, p.actual_ms);
  for (const s of d.systems) for (const u of s.usages) consider(`${s.name}@${u.column}`, u.target_ms, u.actual_ms);
  return { ok, warn, breach, total: ok + warn + breach, slowest };
}

// =====================================================================
//   Position computation — returns absolute (x, y) per node + edge
//   endpoints. Single source of truth so chain/radial share renderers.
// =====================================================================
interface NodePos {
  id: string;
  kind: "activity" | "role" | "system" | "location";
  x: number; y: number;
  name: string;
  data: unknown;
}
interface EdgeSeg {
  fromX: number; fromY: number; toX: number; toY: number;
  tone?: Tone;
  kind: "precedes" | "executes" | "uses_system" | "at_location";
}
interface ComputedLayout {
  nodes: NodePos[];
  edges: EdgeSeg[];
  chips: Array<{ x: number; y: number; tone: Tone; text: string }>;
  width: number;
  height: number;
}

function computeChainLayout(d: JourneyData, vis: VisibleLayers): ComputedLayout {
  const n = d.activities.length;
  const width = CHAIN.padX * 2 + Math.max(1, n - 1) * CHAIN.colWidth;
  const colX = (c: number): number => CHAIN.padX + c * CHAIN.colWidth;

  const nodes: NodePos[] = [];
  const edges: EdgeSeg[] = [];
  const chips: ComputedLayout["chips"] = [];

  for (const a of d.activities) {
    nodes.push({ id: a.id, kind: "activity", x: colX(a.column), y: CHAIN.yActivity, name: a.name, data: a });
  }

  for (const p of d.precedes) {
    const tone = slaStatus(p.target_ms, p.actual_ms) ?? undefined;
    const fromX = colX(p.from_col) + 60;
    const toX = colX(p.to_col) - 60;
    edges.push({ fromX, fromY: CHAIN.yActivity, toX, toY: CHAIN.yActivity, tone, kind: "precedes" });
    if (p.target_ms != null) {
      chips.push({
        x: (fromX + toX) / 2,
        y: CHAIN.yActivity - 24,
        tone: tone ?? "good",
        text: `${formatMs(p.actual_ms ?? p.target_ms)}/${formatMs(p.target_ms)}`,
      });
    }
  }

  if (vis.roles) {
    for (const r of d.roles) {
      const x = colX(avg(r.columns));
      const y = CHAIN.yRole;
      nodes.push({ id: r.id, kind: "role", x, y, name: r.name, data: r });
      for (const col of r.columns) {
        edges.push({
          fromX: colX(col), fromY: CHAIN.yActivity - 30,
          toX: x, toY: y + 32,
          kind: "executes",
        });
      }
    }
  }

  if (vis.systems) {
    for (const s of d.systems) {
      const cols = s.usages.map((u) => u.column);
      const x = colX(avg(cols));
      const y = CHAIN.ySystem;
      nodes.push({ id: s.id, kind: "system", x, y, name: s.name, data: s });
      for (const u of s.usages) {
        const tone = slaStatus(u.target_ms, u.actual_ms) ?? undefined;
        edges.push({
          fromX: colX(u.column), fromY: CHAIN.yActivity + 30,
          toX: x, toY: y - 22,
          tone, kind: "uses_system",
        });
        if (u.target_ms != null) {
          chips.push({
            x: (colX(u.column) + x) / 2,
            y: (CHAIN.yActivity + 30 + y - 22) / 2,
            tone: tone ?? "good",
            text: `${formatMs(u.actual_ms ?? u.target_ms)}/${formatMs(u.target_ms)}`,
          });
        }
      }
    }
  }

  if (vis.locations) {
    for (const l of d.locations) {
      const x = colX(avg(l.columns));
      const y = CHAIN.yLocation;
      nodes.push({ id: l.id, kind: "location", x, y, name: l.name, data: l });
      for (const col of l.columns) {
        edges.push({
          fromX: colX(col), fromY: CHAIN.yActivity + 30,
          toX: x, toY: y - 18,
          kind: "at_location",
        });
      }
    }
  }

  return { nodes, edges, chips, width, height: CHAIN.height };
}

function computeRadialLayout(d: JourneyData, vis: VisibleLayers): ComputedLayout {
  const n = d.activities.length;
  const { cx, cy, rActivity, rRole, rSystem, rLocation } = RADIAL;
  const width = 1080;
  const height = 760;

  const angleAt = (col: number): number =>
    n === 0 ? 0 : -Math.PI / 2 + (col / n) * Math.PI * 2;

  const nodes: NodePos[] = [];
  const edges: EdgeSeg[] = [];
  const chips: ComputedLayout["chips"] = [];

  for (const a of d.activities) {
    const θ = angleAt(a.column);
    nodes.push({
      id: a.id, kind: "activity",
      x: cx + rActivity * Math.cos(θ),
      y: cy + rActivity * Math.sin(θ),
      name: a.name, data: a,
    });
  }

  for (const p of d.precedes) {
    const θ1 = angleAt(p.from_col);
    const θ2 = angleAt(p.to_col);
    const tone = slaStatus(p.target_ms, p.actual_ms) ?? undefined;
    edges.push({
      fromX: cx + (rActivity - 4) * Math.cos(θ1),
      fromY: cy + (rActivity - 4) * Math.sin(θ1),
      toX:   cx + (rActivity - 4) * Math.cos(θ2),
      toY:   cy + (rActivity - 4) * Math.sin(θ2),
      tone, kind: "precedes",
    });
    if (p.target_ms != null) {
      const midθ = (θ1 + θ2) / 2;
      const r = rActivity * 0.55;
      chips.push({
        x: cx + r * Math.cos(midθ),
        y: cy + r * Math.sin(midθ),
        tone: tone ?? "good",
        text: `${formatMs(p.actual_ms ?? p.target_ms)}/${formatMs(p.target_ms)}`,
      });
    }
  }

  if (vis.roles) {
    for (const r of d.roles) {
      const θ = avgAngle(r.columns.map(angleAt));
      const x = cx + rRole * Math.cos(θ);
      const y = cy + rRole * Math.sin(θ);
      nodes.push({ id: r.id, kind: "role", x, y, name: r.name, data: r });
      for (const col of r.columns) {
        const θa = angleAt(col);
        edges.push({
          fromX: cx + (rActivity + 6) * Math.cos(θa),
          fromY: cy + (rActivity + 6) * Math.sin(θa),
          toX:   x - 26 * Math.cos(θ),
          toY:   y - 26 * Math.sin(θ),
          kind: "executes",
        });
      }
    }
  }

  if (vis.systems) {
    for (const s of d.systems) {
      const θ = avgAngle(s.usages.map((u) => angleAt(u.column)));
      const x = cx + rSystem * Math.cos(θ);
      const y = cy + rSystem * Math.sin(θ);
      nodes.push({ id: s.id, kind: "system", x, y, name: s.name, data: s });
      for (const u of s.usages) {
        const θa = angleAt(u.column);
        const tone = slaStatus(u.target_ms, u.actual_ms) ?? undefined;
        edges.push({
          fromX: cx + (rActivity + 6) * Math.cos(θa),
          fromY: cy + (rActivity + 6) * Math.sin(θa),
          toX:   x - 46 * Math.cos(θ),
          toY:   y - 18 * Math.sin(θ),
          tone, kind: "uses_system",
        });
      }
    }
  }

  if (vis.locations) {
    for (const l of d.locations) {
      const θ = avgAngle(l.columns.map(angleAt));
      const x = cx + rLocation * Math.cos(θ);
      const y = cy + rLocation * Math.sin(θ);
      nodes.push({ id: l.id, kind: "location", x, y, name: l.name, data: l });
      for (const col of l.columns) {
        const θa = angleAt(col);
        edges.push({
          fromX: cx + (rActivity + 6) * Math.cos(θa),
          fromY: cy + (rActivity + 6) * Math.sin(θa),
          toX:   x - 20 * Math.cos(θ),
          toY:   y - 20 * Math.sin(θ),
          kind: "at_location",
        });
      }
    }
  }

  return { nodes, edges, chips, width, height };
}

// =====================================================================
//   Component
// =====================================================================
export function JourneyCanvas({
  data,
  layoutMode,
  visibleLayers,
  selected,
  onSelect,
  onReorder,
  zoomCommand,
  onZoomChange,
}: Props) {
  const layout = useMemo(
    () => (layoutMode === "chain"
      ? computeChainLayout(data, visibleLayers)
      : computeRadialLayout(data, visibleLayers)),
    [data, layoutMode, visibleLayers],
  );

  // =================================
  //   Pan + zoom state
  // =================================
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);
  const [panning, setPanning] = useState(false);

  // External zoom commands (toolbar buttons).
  useEffect(() => {
    if (!zoomCommand) return;
    setView((prev) => {
      if (zoomCommand.action === "reset") return { x: 0, y: 0, scale: 1 };
      if (zoomCommand.action === "in")    return clampZoom({ ...prev, scale: prev.scale * 1.2 });
      if (zoomCommand.action === "out")   return clampZoom({ ...prev, scale: prev.scale / 1.2 });
      if (zoomCommand.action === "fit") {
        const svg = svgRef.current;
        if (!svg) return prev;
        const rect = svg.getBoundingClientRect();
        const sx = (rect.width - 40) / layout.width;
        const sy = (rect.height - 40) / layout.height;
        return clampZoom({ x: 0, y: 0, scale: Math.min(sx, sy, 2) });
      }
      return prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomCommand?.nonce]);

  useEffect(() => { onZoomChange?.(Math.round(view.scale * 100)); }, [view.scale, onZoomChange]);

  // Wheel zoom around the cursor position. Non-passive handler so
  // preventDefault works.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      setView((prev) => {
        const newScale = clampZoom({ ...prev, scale: prev.scale * factor }).scale;
        const wx = (px - prev.x) / prev.scale;
        const wy = (py - prev.y) / prev.scale;
        return { x: px - wx * newScale, y: py - wy * newScale, scale: newScale };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>): void => {
    if ((e.target as Element).closest("[data-node]") || (e.target as Element).closest("[data-handle]")) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y };
    setPanning(true);
  };
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    if (!dragRef.current) return;
    const { startX, startY, viewX, viewY } = dragRef.current;
    setView((v) => ({ ...v, x: viewX + (e.clientX - startX), y: viewY + (e.clientY - startY) }));
  };
  const handleMouseUp = (): void => { dragRef.current = null; setPanning(false); };

  // =================================
  //   Activity reorder (chain only)
  // =================================
  const reorderRef = useRef<{ id: string; startX: number; startCol: number } | null>(null);
  const [dragGhost, setDragGhost] = useState<{ id: string; col: number } | null>(null);

  const startReorder = (e: React.MouseEvent<SVGGElement>, activityId: string, currentCol: number): void => {
    if (layoutMode !== "chain" || !onReorder) return;
    e.stopPropagation();
    reorderRef.current = { id: activityId, startX: e.clientX, startCol: currentCol };
    setDragGhost({ id: activityId, col: currentCol });
  };

  useEffect(() => {
    if (!dragGhost) return;
    const onMove = (e: MouseEvent): void => {
      if (!reorderRef.current) return;
      const dx = e.clientX - reorderRef.current.startX;
      const ghostCol = reorderRef.current.startCol + dx / (CHAIN.colWidth * view.scale);
      setDragGhost({ id: reorderRef.current.id, col: ghostCol });
    };
    const onUp = (): void => {
      if (!reorderRef.current || !dragGhost || !onReorder) {
        reorderRef.current = null;
        setDragGhost(null);
        return;
      }
      const targetCol = Math.max(0, Math.min(data.activities.length - 1, Math.round(dragGhost.col)));
      const draggedIdx = data.activities.findIndex((a) => a.id === reorderRef.current!.id);
      if (draggedIdx === -1 || targetCol === reorderRef.current.startCol) {
        reorderRef.current = null;
        setDragGhost(null);
        return;
      }
      const newOrder = data.activities.map((a) => a.id);
      const [moved] = newOrder.splice(draggedIdx, 1);
      newOrder.splice(targetCol, 0, moved);
      onReorder(newOrder);
      reorderRef.current = null;
      setDragGhost(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragGhost, data.activities, onReorder, view.scale]);

  // =================================
  //   Selection-aware dimming
  // =================================
  const connectedIds = useMemo<Set<string>>(() => {
    if (!selected) return new Set();
    const set = new Set<string>([selected.id]);
    const relevantCols = new Set<number>();
    if (selected.kind === "activity") {
      const a = data.activities.find((x) => x.id === selected.id);
      if (a) relevantCols.add(a.column);
    } else if (selected.kind === "role") {
      const r = data.roles.find((x) => x.id === selected.id);
      r?.columns.forEach((c) => relevantCols.add(c));
    } else if (selected.kind === "system") {
      const s = data.systems.find((x) => x.id === selected.id);
      s?.usages.forEach((u) => relevantCols.add(u.column));
    } else if (selected.kind === "location") {
      const l = data.locations.find((x) => x.id === selected.id);
      l?.columns.forEach((c) => relevantCols.add(c));
    }
    for (const a of data.activities) if (relevantCols.has(a.column)) set.add(a.id);
    for (const r of data.roles)      if (r.columns.some((c) => relevantCols.has(c))) set.add(r.id);
    for (const s of data.systems)    if (s.usages.some((u) => relevantCols.has(u.column))) set.add(s.id);
    for (const l of data.locations)  if (l.columns.some((c) => relevantCols.has(c))) set.add(l.id);
    return set;
  }, [selected, data]);

  const isDim = (id: string): boolean => selected !== null && !connectedIds.has(id);
  const isConn = (id: string): boolean => selected !== null && connectedIds.has(id) && id !== selected?.id;

  return (
    <svg
      ref={svgRef}
      className={`${styles.canvas} ${panning ? styles.panning : ""}`}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMid meet"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <defs>
        <marker id="jc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="oklch(36% 0.12 250)" />
        </marker>
      </defs>

      <g className={styles.pan} transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
        {layoutMode === "chain" && (
          <>
            <text className={styles.laneLabel} x={CHAIN.padX - 50} y={CHAIN.yRole - 40}>ROLES</text>
            <text className={styles.laneLabel} x={CHAIN.padX - 50} y={CHAIN.yActivity - 60}>ACTIVITIES</text>
            <text className={styles.laneLabel} x={CHAIN.padX - 50} y={CHAIN.ySystem - 40}>SYSTEMS</text>
            <text className={styles.laneLabel} x={CHAIN.padX - 50} y={CHAIN.yLocation - 22}>LOCATIONS</text>
          </>
        )}
        {layoutMode === "radial" && (
          <>
            <circle cx={RADIAL.cx} cy={RADIAL.cy} r={RADIAL.rActivity} className={styles.ringGuide} />
            {visibleLayers.roles      && <circle cx={RADIAL.cx} cy={RADIAL.cy} r={RADIAL.rRole}     className={styles.ringGuide} />}
            {visibleLayers.systems    && <circle cx={RADIAL.cx} cy={RADIAL.cy} r={RADIAL.rSystem}   className={styles.ringGuide} />}
            {visibleLayers.locations  && <circle cx={RADIAL.cx} cy={RADIAL.cy} r={RADIAL.rLocation} className={styles.ringGuide} />}
            <text className={styles.ringLabel} x={RADIAL.cx + RADIAL.rActivity + 8} y={RADIAL.cy - 4}>ACTIVITIES</text>
            {visibleLayers.roles      && <text className={styles.ringLabel} x={RADIAL.cx + RADIAL.rRole     + 8} y={RADIAL.cy - 4}>ROLES</text>}
            {visibleLayers.systems    && <text className={styles.ringLabel} x={RADIAL.cx + RADIAL.rSystem   + 8} y={RADIAL.cy - 4}>SYSTEMS</text>}
            {visibleLayers.locations  && <text className={styles.ringLabel} x={RADIAL.cx + RADIAL.rLocation + 8} y={RADIAL.cy - 4}>LOCATIONS</text>}
          </>
        )}

        {/* g-edges */}
        <g className={styles.edges}>
          {layout.edges.map((e, i) => {
            const tone = e.tone;
            const kind = e.kind;
            const cls = [styles.edge, styles[`edge-${kind}`], tone ? styles[`tone-${tone}`] : ""].join(" ");
            return (
              <line key={`e${i}`} x1={e.fromX} y1={e.fromY} x2={e.toX} y2={e.toY}
                    className={cls}
                    markerEnd={kind === "precedes" ? "url(#jc-arrow)" : undefined} />
            );
          })}
        </g>

        {/* g-chips (SLA values inline) */}
        <g className={styles.chips}>
          {layout.chips.map((c, i) => (
            <g key={`c${i}`} transform={`translate(${c.x} ${c.y})`} className={`${styles.chip} ${styles[`tone-${c.tone}`]}`}>
              <rect x={-28} y={-9} width={56} height={18} rx={9} />
              <text x={0} y={4} textAnchor="middle">{c.text}</text>
            </g>
          ))}
        </g>

        {/* g-nodes */}
        <g className={styles.nodes}>
          {layout.nodes.map((node) => {
            const isSelected = selected?.id === node.id;
            const wrapCls = [
              styles.nodeWrap,
              isDim(node.id) ? styles.dim : "",
              isConn(node.id) ? styles.connected : "",
              isSelected ? styles.selected : "",
              dragGhost?.id === node.id ? styles.dragging : "",
            ].join(" ");
            const ref: SelectedRef =
              node.kind === "activity" ? { kind: "activity", id: node.id } :
              node.kind === "role"     ? { kind: "role",     id: node.id } :
              node.kind === "system"   ? { kind: "system",   id: node.id } :
              { kind: "location", id: node.id };

            // Apply transient drag position (chain only).
            const x = (layoutMode === "chain" && dragGhost?.id === node.id)
              ? CHAIN.padX + dragGhost.col * CHAIN.colWidth
              : node.x;
            const y = node.y;

            return (
              <g key={node.id} className={wrapCls} data-node={node.kind}
                 transform={`translate(${x} ${y})`}
                 onClick={(e) => { e.stopPropagation(); onSelect(isSelected ? null : ref); }}>
                {renderNode(node, layoutMode, onReorder !== undefined, startReorder)}
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
}

// =====================================================================
//   Node renderers
// =====================================================================
function renderNode(
  node: NodePos,
  layout: LayoutMode,
  reorderable: boolean,
  startReorder: (e: React.MouseEvent<SVGGElement>, id: string, col: number) => void,
): React.JSX.Element {
  if (node.kind === "activity") {
    const a = node.data as ActivityNode;
    const dragHandle = layout === "chain" && reorderable ? (
      <g className={styles.dragHandle} data-handle
         onMouseDown={(e) => startReorder(e, node.id, a.column)}>
        <rect x={-46} y={-22} width={9} height={44} rx={2} />
        {[-15, -9, -3, 3, 9, 15].map((dy) => (
          <line key={dy} x1={-43} y1={dy} x2={-40} y2={dy} />
        ))}
      </g>
    ) : null;
    return (
      <>
        {dragHandle}
        <rect className={styles.activityBox} x={-50} y={-26} width={100} height={52} rx={6} />
        <text className={styles.activitySeq} x={-44} y={-14}>{a.column + 1}</text>
        <text className={styles.activityName} x={0} y={4} textAnchor="middle">{shortName(a.name, 14)}</text>
      </>
    );
  }
  if (node.kind === "role") {
    const r = node.data as RoleNode;
    const stripe = teamColorVar(r.team_color);
    return (
      <>
        <circle className={styles.roleCircle} r={26} />
        <rect className={styles.teamStripe} x={-18} y={-26} width={36} height={3} rx={1} fill={stripe} />
        <text className={styles.roleName} x={0} y={5} textAnchor="middle">{shortName(r.name, 12)}</text>
      </>
    );
  }
  if (node.kind === "system") {
    const s = node.data as SystemNode;
    return (
      <>
        <rect className={styles.systemBox} x={-46} y={-18} width={92} height={36} rx={4} />
        <text className={styles.systemName} x={0} y={5} textAnchor="middle">{shortName(s.name, 14)}</text>
        {s.kind && <text className={styles.systemKind} x={0} y={-22} textAnchor="middle">{s.kind}</text>}
      </>
    );
  }
  const l = node.data as LocationNode;
  return (
    <>
      <rect className={styles.locationDiamond} x={-16} y={-16} width={32} height={32} transform="rotate(45)" />
      <text className={styles.locationName} x={0} y={32} textAnchor="middle">{shortName(l.name, 16)}</text>
    </>
  );
}

// =====================================================================
//   Helpers
// =====================================================================
function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function avgAngle(angles: number[]): number {
  if (angles.length === 0) return 0;
  const sx = angles.reduce((s, a) => s + Math.cos(a), 0);
  const sy = angles.reduce((s, a) => s + Math.sin(a), 0);
  return Math.atan2(sy, sx);
}
function clampZoom(v: { x: number; y: number; scale: number }): typeof v {
  return { ...v, scale: Math.max(0.4, Math.min(3.0, v.scale)) };
}
function shortName(s: string, max = 14): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}
