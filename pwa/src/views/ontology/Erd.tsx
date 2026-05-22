import { useState } from "react";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { KeyValueList } from "../../components/KeyValueList";
import { ViewHeader, Loading, ErrorState, SecLabel } from "../_shared";
import styles from "./Erd.module.css";

// Fixed positions — readable retail-process layout (not a force sim).
// Domains at top, Journeys mid-top, Activities centre, Roles left,
// Systems right, Locations bottom.
const POS: Record<string, { x: number; y: number }> = {
  Domain:      { x: 380, y:  60 },
  UserJourney: { x: 380, y: 175 },
  Activity:    { x: 380, y: 305 },
  Role:        { x: 130, y: 305 },
  System:      { x: 630, y: 305 },
  Location:    { x: 380, y: 440 },
};

const SIZE = { w: 140, h: 70 };

const EDGES: Array<{ from: string; to: string; type: string; curve?: "self" }> = [
  { from: "UserJourney", to: "Domain",      type: "PART_OF" },
  { from: "Activity",    to: "UserJourney", type: "PART_OF" },
  { from: "Role",        to: "Activity",    type: "EXECUTES" },
  { from: "Activity",    to: "System",      type: "USES_SYSTEM" },
  { from: "Activity",    to: "Location",    type: "AT_LOCATION" },
  { from: "Activity",    to: "Activity",    type: "PRECEDES",   curve: "self" },
  { from: "System",      to: "System",      type: "INTEGRATES_WITH", curve: "self" },
  { from: "Location",    to: "Location",    type: "PART_OF",    curve: "self" },
];

const TONE: Record<string, "accent" | "good" | "warn" | "danger" | "neutral"> = {
  Domain: "accent",
  UserJourney: "good",
  Activity: "neutral",
  Role: "warn",
  System: "danger",
  Location: "neutral",
};

export function OntologyErd() {
  const stats = useFetch(() => api.stats(), []);
  const [hover, setHover] = useState<string | null>(null);

  return (
    <>
      <ViewHeader
        title="ERD canvas"
        lede="The graph-core schema — 6 node labels and 6 edge types. Domain/Journey/Activity is the spine; Role, System, Location attach at the Activity layer. Click a box to drill in."
      />
      <div className={styles.layout}>
        <Card>
          <svg viewBox="0 0 760 540" className={styles.svg} preserveAspectRatio="xMidYMid meet">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-strong)" />
              </marker>
              <marker id="arrowAccent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
              </marker>
            </defs>

            {/* Edges */}
            {EDGES.map((e, i) => {
              const isHover = hover === e.from || hover === e.to;
              if (e.curve === "self") {
                const p = POS[e.from];
                if (!p) return null;
                const cx = p.x + SIZE.w / 2 + 50;
                const cy = p.y + SIZE.h / 2;
                return (
                  <g key={i}>
                    <path
                      d={`M ${p.x + SIZE.w} ${p.y + 20} C ${cx + 30} ${p.y + 10}, ${cx + 30} ${p.y + SIZE.h - 10}, ${p.x + SIZE.w} ${p.y + SIZE.h - 20}`}
                      fill="none"
                      stroke={isHover ? "var(--accent)" : "var(--border-strong)"}
                      strokeWidth={isHover ? 1.5 : 1}
                      markerEnd={isHover ? "url(#arrowAccent)" : "url(#arrow)"}
                    />
                    <text x={cx + 14} y={cy + 4} className={styles.edgeLabel}>{e.type}</text>
                  </g>
                );
              }
              const a = POS[e.from];
              const b = POS[e.to];
              if (!a || !b) return null;
              // Edge midpoint for label.
              const ax = a.x + SIZE.w / 2;
              const ay = a.y + SIZE.h;
              const bx = b.x + SIZE.w / 2;
              const by = b.y;
              const mx = (ax + bx) / 2;
              const my = (ay + by) / 2;
              // Horizontal? Connect side-to-side.
              const horizontal = Math.abs(a.y - b.y) < 30;
              const fromX = horizontal ? (a.x < b.x ? a.x + SIZE.w : a.x) : ax;
              const fromY = horizontal ? a.y + SIZE.h / 2 : ay;
              const toX = horizontal ? (a.x < b.x ? b.x : b.x + SIZE.w) : bx;
              const toY = horizontal ? b.y + SIZE.h / 2 : by;
              return (
                <g key={i}>
                  <line
                    x1={fromX} y1={fromY} x2={toX} y2={toY}
                    stroke={isHover ? "var(--accent)" : "var(--border-strong)"}
                    strokeWidth={isHover ? 1.5 : 1}
                    markerEnd={isHover ? "url(#arrowAccent)" : "url(#arrow)"}
                  />
                  <text
                    x={mx} y={my - 4}
                    className={styles.edgeLabel}
                    textAnchor="middle"
                  >
                    {e.type}
                  </text>
                </g>
              );
            })}

            {/* Node boxes */}
            {Object.entries(POS).map(([label, p]) => {
              const count = stats.status === "ok"
                ? stats.data.nodes[label as keyof typeof stats.data.nodes] ?? 0
                : 0;
              return (
                <g
                  key={label}
                  transform={`translate(${p.x} ${p.y})`}
                  className={styles.node}
                  data-hover={hover === label ? "true" : undefined}
                  onMouseEnter={() => setHover(label)}
                  onMouseLeave={() => setHover((h) => (h === label ? null : h))}
                  onClick={() => { window.location.hash = `#/explorer/${label === "Domain" || label === "UserJourney" || label === "Activity" ? "domains" : label === "System" ? "systems" : "graph"}`; }}
                >
                  <rect width={SIZE.w} height={SIZE.h} rx={6} className={styles.box} />
                  <text x={SIZE.w / 2} y={28} textAnchor="middle" className={styles.title}>{label}</text>
                  <text x={SIZE.w / 2} y={50} textAnchor="middle" className={styles.count}>{count}</text>
                </g>
              );
            })}
          </svg>
        </Card>

        <aside className={styles.panel}>
          <Card title={hover ? hover : "Label"}>
            <SecLabel>{hover ? "Hovered" : "Hover a box"}</SecLabel>
            {hover && stats.status === "ok" && (
              <>
                <KeyValueList rows={[
                  { label: "tone", value: <Pill tone={TONE[hover] ?? "neutral"}>{hover}</Pill> },
                  { label: "instances", value: stats.data.nodes[hover as keyof typeof stats.data.nodes] ?? 0 },
                ]} />
                <SecLabel>Touches</SecLabel>
                <ul className={styles.edgeList}>
                  {EDGES.filter((e) => e.from === hover || e.to === hover).map((e, i) => (
                    <li key={i}>
                      <code>{e.from}</code> <span style={{ color: "var(--muted)" }}>—{e.type}—&gt;</span> <code>{e.to}</code>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
          {stats.status === "loading" && <Loading what="counts" />}
          {stats.status === "error" && <ErrorState message={stats.error} />}
        </aside>
      </div>
    </>
  );
}
