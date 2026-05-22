import { useEffect, useMemo, useRef, useState } from "react";
import type { ExportNode, ExportEdge } from "../api";
import styles from "./GraphCanvas.module.css";

interface Pos { x: number; y: number; vx: number; vy: number }

interface Props {
  nodes: ExportNode[];
  edges: ExportEdge[];
  width?: number;
  height?: number;
  onNodeClick?: (node: ExportNode) => void;
  highlightLabels?: ReadonlySet<string>;
}

const LABEL_COLORS: Record<string, string> = {
  Domain:      "var(--accent)",
  UserJourney: "var(--good)",
  Activity:    "var(--muted)",
  Role:        "var(--warn)",
  System:      "var(--danger)",
  Location:    "var(--muted-2)",
};

// Verlet-ish layout with mutual repulsion and per-edge spring. O(n²) is
// fine for ~60 nodes; we cap at one render-rAF per ~30 ms so we don't
// pin the CPU. No external graph lib.
export function GraphCanvas({
  nodes,
  edges,
  width = 900,
  height = 520,
  onNodeClick,
  highlightLabels,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const positions = useMemo(() => {
    // Seed positions on a circle so the simulation has somewhere to push from.
    const map = new Map<string, Pos>();
    const r = Math.min(width, height) * 0.35;
    const cx = width / 2;
    const cy = height / 2;
    nodes.forEach((n, i) => {
      const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
      map.set(n.id, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), vx: 0, vy: 0 });
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, width, height]);

  // Simulation loop. Writes positions imperatively to refs to avoid
  // React re-renders on every tick.
  const circleRefs = useRef<Map<string, SVGCircleElement | null>>(new Map());
  const labelRefs = useRef<Map<string, SVGTextElement | null>>(new Map());
  const lineRefs = useRef<Map<string, SVGLineElement | null>>(new Map());

  useEffect(() => {
    let raf = 0;
    const REPULSION = 1400;
    const SPRING_K = 0.02;
    const SPRING_LEN = 90;
    const DAMPING = 0.82;
    const CENTER_PULL = 0.0008;

    const tick = (): void => {
      // Repulsion (all pairs).
      const ids = Array.from(positions.keys());
      for (let i = 0; i < ids.length; i++) {
        const a = positions.get(ids[i]!)!;
        for (let j = i + 1; j < ids.length; j++) {
          const b = positions.get(ids[j]!)!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy + 0.1;
          const f = REPULSION / d2;
          const dlen = Math.sqrt(d2);
          const fx = (dx / dlen) * f;
          const fy = (dy / dlen) * f;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
      }
      // Spring (edges).
      for (const e of edges) {
        const a = positions.get(e.fromId);
        const b = positions.get(e.toId);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const f = SPRING_K * (d - SPRING_LEN);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
      // Center pull + damping + apply.
      const cx = width / 2;
      const cy = height / 2;
      for (const p of positions.values()) {
        p.vx += (cx - p.x) * CENTER_PULL;
        p.vy += (cy - p.y) * CENTER_PULL;
        p.vx *= DAMPING;
        p.vy *= DAMPING;
        p.x += p.vx;
        p.y += p.vy;
        // Clamp inside the viewbox.
        if (p.x < 24) p.x = 24;
        if (p.x > width - 24) p.x = width - 24;
        if (p.y < 24) p.y = 24;
        if (p.y > height - 24) p.y = height - 24;
      }
      // Write to DOM imperatively.
      for (const [id, c] of circleRefs.current) {
        const p = positions.get(id);
        if (!p || !c) continue;
        c.setAttribute("cx", String(p.x));
        c.setAttribute("cy", String(p.y));
      }
      for (const [id, t] of labelRefs.current) {
        const p = positions.get(id);
        if (!p || !t) continue;
        t.setAttribute("x", String(p.x));
        t.setAttribute("y", String(p.y - 10));
      }
      for (const [id, l] of lineRefs.current) {
        const e = edges.find((x) => x.id === id);
        if (!e || !l) continue;
        const a = positions.get(e.fromId);
        const b = positions.get(e.toId);
        if (!a || !b) continue;
        l.setAttribute("x1", String(a.x));
        l.setAttribute("y1", String(a.y));
        l.setAttribute("x2", String(b.x));
        l.setAttribute("y2", String(b.y));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [positions, edges, width, height]);

  const isHighlighted = (label: string): boolean =>
    !highlightLabels || highlightLabels.size === 0 || highlightLabels.has(label);

  return (
    <svg
      ref={svgRef}
      className={styles.canvas}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <g className={styles.edges}>
        {edges.map((e) => (
          <line
            key={e.id}
            ref={(el) => { lineRefs.current.set(e.id, el); }}
            className={styles.edge}
            data-dim={
              hoverId && e.fromId !== hoverId && e.toId !== hoverId ? "true" : undefined
            }
          />
        ))}
      </g>
      <g className={styles.nodes}>
        {nodes.map((n) => {
          const dim = !isHighlighted(n.label);
          return (
            <g
              key={n.id}
              className={styles.nodeGroup}
              data-dim={dim ? "true" : undefined}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId((cur) => (cur === n.id ? null : cur))}
              onClick={() => onNodeClick?.(n)}
            >
              <circle
                ref={(el) => { circleRefs.current.set(n.id, el); }}
                r={n.label === "Domain" ? 11 : n.label === "UserJourney" ? 9 : 6}
                fill={LABEL_COLORS[n.label] ?? "var(--muted)"}
                stroke="var(--surface)"
                strokeWidth={1.5}
              />
              <text
                ref={(el) => { labelRefs.current.set(n.id, el); }}
                className={styles.nodeLabel}
                textAnchor="middle"
              >
                {n.name}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
