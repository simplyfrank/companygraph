// Three-lane journey-graph SVG canvas.
//
// Layout:
//   ROLE lane         (top)     y = 60   — coloured circles with team stripe
//   ACTIVITY lane     (middle)  y = 260  — numbered black boxes
//   SYSTEM lane       (bottom)  y = 440  — rectangles
//   LOCATION lane     (bottom)  y = 540  — diamonds
//
// One column per activity. Roles align above the (left-most) activity
// they execute; systems align below the activities that use them;
// locations align below their AT_LOCATION activity.
//
// Edges:
//   PRECEDES     — solid blue between adjacent activities, with SLA chip
//   EXECUTES     — solid green role → activity, with duration label
//   USES_SYSTEM  — dashed blue activity → system, with latency pill (SLA-toned)
//   AT_LOCATION  — dashed orange activity → location

import type { CSSProperties, ReactNode } from "react";
import styles from "./JourneyCanvas.module.css";

export interface ActivityNode { id: string; name: string; column: number }
export interface RoleNode {
  id: string;
  name: string;
  team_id?: string;
  team_name?: string;
  team_color?: string;       // "accent" | "good" | "warn" | "danger"
  columns: number[];         // which activity columns this role executes
  durations: Record<number, number>;  // column → duration_min
}
export interface SystemNode {
  id: string;
  name: string;
  kind?: string;
  usages: Array<{ column: number; target_ms?: number; actual_ms?: number }>;
}
export interface LocationNode {
  id: string;
  name: string;
  columns: number[];
}
export interface PrecedesEdge {
  from_col: number;
  to_col: number;
  target_ms?: number;
  actual_ms?: number;
}

export interface JourneyData {
  activities: ActivityNode[];
  roles: RoleNode[];
  systems: SystemNode[];
  locations: LocationNode[];
  precedes: PrecedesEdge[];
}

export interface SlaSummary {
  ok: number;
  warn: number;
  breach: number;
  total: number;
  slowest?: { label: string; ratio: number };
}

const COL_W = 200;
const PAD_X = 80;
const Y_ROLE = 90;
const Y_ACTIVITY = 290;
const Y_SYSTEM = 470;
const Y_LOCATION = 560;
const H = 640;

const SLA_TONE: Record<"ok" | "warn" | "breach", "good" | "warn" | "danger"> = {
  ok: "good",
  warn: "warn",
  breach: "danger",
};

function slaStatus(target?: number, actual?: number): "ok" | "warn" | "breach" {
  if (target === undefined || actual === undefined) return "ok";
  if (actual <= target) return "ok";
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

interface Props {
  data: JourneyData;
  selected?: { kind: "role" | "activity" | "system" | "location"; id: string } | null;
  onSelect?: (sel: { kind: "role" | "activity" | "system" | "location"; id: string } | null) => void;
}

export function JourneyCanvas({ data, selected, onSelect }: Props) {
  const N = data.activities.length;
  const W = Math.max(N * COL_W + PAD_X * 2, 900);
  const colX = (col: number): number => PAD_X + col * COL_W + COL_W / 2;

  const sel = (kind: "role" | "activity" | "system" | "location", id: string): void => {
    onSelect?.(selected && selected.kind === kind && selected.id === id ? null : { kind, id });
  };
  const isSelected = (kind: "role" | "activity" | "system" | "location", id: string): boolean =>
    !!selected && selected.kind === kind && selected.id === id;
  const isDimmed = (kind: "role" | "activity" | "system" | "location", id: string): boolean =>
    !!selected && !isSelected(kind, id) &&
    !isConnected(selected, kind, id, data);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={styles.canvas}
      preserveAspectRatio="xMinYMid meet"
    >
      {/* PRECEDES edges between activity columns */}
      {data.precedes.map((e, i) => {
        const x1 = colX(e.from_col) + 60;   // activity box right edge offset
        const x2 = colX(e.to_col) - 60;     // activity box left edge offset
        const y = Y_ACTIVITY;
        const status = slaStatus(e.target_ms, e.actual_ms);
        const tone = SLA_TONE[status];
        const label = formatSla(e.target_ms);
        return (
          <g key={`p-${i}`}>
            <line
              x1={x1} y1={y} x2={x2} y2={y}
              className={`${styles.precedes} ${styles[`tone-${tone}`]}`}
              data-status={status}
              strokeDasharray={status === "breach" ? "6 4" : undefined}
            />
            <g transform={`translate(${(x1 + x2) / 2} ${y - 26})`}>
              <SlaChip tone={tone} label={label} />
            </g>
          </g>
        );
      })}

      {/* EXECUTES edges (role → activity) */}
      {data.roles.flatMap((r) =>
        r.columns.map((col) => {
          const x = colX(col);
          const y1 = Y_ROLE + 36;
          const y2 = Y_ACTIVITY - 20;
          const dim = isDimmed("role", r.id) || isDimmed("activity", data.activities[col]?.id ?? "");
          return (
            <g key={`e-${r.id}-${col}`} className={dim ? styles.dim : ""}>
              <line x1={x} y1={y1} x2={x} y2={y2} className={`${styles.executes}`} />
              <text
                x={x + 8} y={(y1 + y2) / 2 + 4}
                className={styles.timing}
                textAnchor="start"
              >
                {r.durations[col] !== undefined ? `${r.durations[col]}m` : ""}
              </text>
            </g>
          );
        }),
      )}

      {/* USES_SYSTEM edges (activity → system), dashed */}
      {data.systems.flatMap((s, si) =>
        s.usages.map((u, ui) => {
          const x = colX(u.column);
          const y1 = Y_ACTIVITY + 24;
          const y2 = Y_SYSTEM - 6;
          const status = slaStatus(u.target_ms, u.actual_ms);
          const tone = SLA_TONE[status];
          const dim = isDimmed("system", s.id) || isDimmed("activity", data.activities[u.column]?.id ?? "");
          return (
            <g key={`u-${si}-${ui}`} className={dim ? styles.dim : ""}>
              <line
                x1={x} y1={y1} x2={x} y2={y2}
                className={`${styles.usesSystem} ${styles[`tone-${tone}`]}`}
              />
              {u.actual_ms !== undefined && (
                <g transform={`translate(${x} ${(y1 + y2) / 2})`}>
                  <SlaChip tone={tone} label={`${u.actual_ms}ms`} compact />
                </g>
              )}
            </g>
          );
        }),
      )}

      {/* AT_LOCATION edges (activity → location), dashed orange */}
      {data.locations.flatMap((l) =>
        l.columns.map((col) => {
          const x = colX(col);
          const y1 = Y_SYSTEM + 36;
          const y2 = Y_LOCATION - 6;
          return (
            <line
              key={`al-${l.id}-${col}`}
              x1={x} y1={y1} x2={x} y2={y2}
              className={styles.atLocation}
            />
          );
        }),
      )}

      {/* Role lane */}
      {data.roles.map((r) => {
        const col = r.columns[0] ?? 0;
        const x = colX(col);
        const stripe = teamColorVar(r.team_color);
        const dim = isDimmed("role", r.id);
        const focused = isSelected("role", r.id);
        return (
          <g
            key={`role-${r.id}`}
            transform={`translate(${x} ${Y_ROLE})`}
            className={`${styles.node} ${dim ? styles.dim : ""} ${focused ? styles.focused : ""}`}
            onClick={() => sel("role", r.id)}
          >
            <text x={0} y={-32} className={styles.laneLabel} textAnchor="middle">ROLE</text>
            <line x1={-18} y1={-22} x2={18} y2={-22} stroke={stripe} strokeWidth={3} strokeLinecap="round" />
            <circle r={28} className={styles.roleCircle} />
            <text x={0} y={4} className={styles.roleName} textAnchor="middle">{r.name}</text>
            <text x={0} y={56} className={styles.subtle} textAnchor="middle">{r.team_name ?? ""}</text>
          </g>
        );
      })}

      {/* Activity lane */}
      {data.activities.map((a, i) => {
        const x = colX(a.column);
        const focused = isSelected("activity", a.id);
        const dim = isDimmed("activity", a.id);
        return (
          <g
            key={`a-${a.id}`}
            transform={`translate(${x} ${Y_ACTIVITY})`}
            className={`${styles.node} ${dim ? styles.dim : ""} ${focused ? styles.focused : ""}`}
            onClick={() => sel("activity", a.id)}
          >
            <rect x={-72} y={-22} width={144} height={44} rx={6} className={styles.activityBox} />
            <rect x={-72} y={-22} width={26} height={26} className={styles.activityBadge} />
            <text x={-59} y={-3} className={styles.activityBadgeText} textAnchor="middle">{i + 1}</text>
            <text x={-36} y={4} className={styles.activityName} textAnchor="start">{a.name}</text>
          </g>
        );
      })}

      {/* System lane */}
      {data.systems.map((s) => {
        // Place system at its first usage column.
        const col = s.usages[0]?.column ?? 0;
        const x = colX(col);
        const focused = isSelected("system", s.id);
        const dim = isDimmed("system", s.id);
        return (
          <g
            key={`s-${s.id}`}
            transform={`translate(${x} ${Y_SYSTEM})`}
            className={`${styles.node} ${dim ? styles.dim : ""} ${focused ? styles.focused : ""}`}
            onClick={() => sel("system", s.id)}
          >
            <text x={0} y={-12} className={styles.laneLabel} textAnchor="middle">SYSTEM</text>
            <rect x={-64} y={0} width={128} height={36} rx={4} className={styles.systemBox} />
            <text x={0} y={22} className={styles.systemName} textAnchor="middle">{s.name}</text>
          </g>
        );
      })}

      {/* Location lane */}
      {data.locations.map((l) => {
        const col = l.columns[0] ?? 0;
        const x = colX(col);
        const focused = isSelected("location", l.id);
        const dim = isDimmed("location", l.id);
        return (
          <g
            key={`l-${l.id}`}
            transform={`translate(${x} ${Y_LOCATION})`}
            className={`${styles.node} ${dim ? styles.dim : ""} ${focused ? styles.focused : ""}`}
            onClick={() => sel("location", l.id)}
          >
            <polygon
              points="0,-12 56,0 0,12 -56,0"
              className={styles.locationBox}
            />
            <text x={0} y={4} className={styles.locationName} textAnchor="middle">{l.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

interface SlaChipProps { tone: "good" | "warn" | "danger"; label: string; compact?: boolean }
function SlaChip({ tone, label, compact }: SlaChipProps) {
  // Render an HTML-ish chip inside SVG via foreignObject — easier than
  // re-implementing pill styling in pure SVG primitives.
  const w = compact ? 56 : 64;
  return (
    <foreignObject x={-w / 2} y={-12} width={w} height={22}>
      <div className={`${styles.chip} ${styles[`chip-${tone}`]}`} style={{ width: "100%" }}>
        {label}
      </div>
    </foreignObject>
  );
}

function formatSla(ms?: number): string {
  if (ms === undefined) return "—";
  if (ms < 1000) return `≤${ms}ms`;
  if (ms < 60_000) return `≤${Math.round(ms / 1000)}s`;
  return `≤${Math.round(ms / 60_000)}m`;
}

function isConnected(
  sel: { kind: "role" | "activity" | "system" | "location"; id: string } | null | undefined,
  kind: "role" | "activity" | "system" | "location",
  id: string,
  data: JourneyData,
): boolean {
  if (!sel) return true;
  if (sel.kind === kind && sel.id === id) return true;
  // Resolve sel to its activity columns, then check if (kind, id) shares one.
  const selCols = activityColumns(sel, data);
  const myCols = activityColumns({ kind, id }, data);
  return selCols.some((c) => myCols.includes(c));
}

function activityColumns(
  sel: { kind: "role" | "activity" | "system" | "location"; id: string },
  data: JourneyData,
): number[] {
  if (sel.kind === "activity") {
    const a = data.activities.find((x) => x.id === sel.id);
    return a ? [a.column] : [];
  }
  if (sel.kind === "role") {
    const r = data.roles.find((x) => x.id === sel.id);
    return r ? r.columns : [];
  }
  if (sel.kind === "system") {
    const s = data.systems.find((x) => x.id === sel.id);
    return s ? s.usages.map((u) => u.column) : [];
  }
  if (sel.kind === "location") {
    const l = data.locations.find((x) => x.id === sel.id);
    return l ? l.columns : [];
  }
  return [];
}

// Helper used by the view to compute the SLA distribution shown in the
// composition rail (10 ok / 2 warn / 1 breach style).
export function computeSlaSummary(data: JourneyData): SlaSummary {
  let ok = 0, warn = 0, breach = 0;
  let slowest: { label: string; ratio: number } | undefined;
  for (const p of data.precedes) {
    const s = slaStatus(p.target_ms, p.actual_ms);
    if (s === "ok") ok++; else if (s === "warn") warn++; else breach++;
  }
  for (const sys of data.systems) {
    for (const u of sys.usages) {
      const s = slaStatus(u.target_ms, u.actual_ms);
      if (s === "ok") ok++; else if (s === "warn") warn++; else breach++;
      if (u.target_ms && u.actual_ms) {
        const ratio = u.actual_ms / u.target_ms;
        if (!slowest || ratio > slowest.ratio) {
          slowest = { label: sys.name, ratio };
        }
      }
    }
  }
  return { ok, warn, breach, total: ok + warn + breach, slowest };
}

export { styles as canvasStyles };
