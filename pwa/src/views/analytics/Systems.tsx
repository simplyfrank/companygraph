import { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "../../route";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { KeyValueList } from "../../components/KeyValueList";
import { Button } from "../../components/Button";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./Systems.module.css";

// cto-analytics FR-01 / T-07 — force-directed System / INTEGRATES_WITH map.
//
// Data source: GET /api/v1/analytics/systems (T-14 scaffold → T-20
// `runSystemMap()`), which returns the SystemMap envelope below directly
// (the `ok(map)` helper does not wrap it). Every System carries `degree`
// (total incident edges) and `integrationCount` (incident INTEGRATES_WITH
// edges); nodes are sized by integrationCount and colored by their cluster.
//
// Cluster coloring (AC-01, design §2 Pin-4): systems are ranked by
// integration count and bucketed into five clusters, each painted with one
// stop of the accent-100..900 mono-ramp defined in
// pwa/src/styles/companygraph/tokens.css (T-21). No hardcoded colors — the
// fills are accent ramp custom properties so design-conformance's tokens-only
// rule and the AC-01 ramp assertion both hold.

interface SystemNode {
  id: string;
  name: string;
  degree: number;
  integrationCount: number;
}
interface IntegrationEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}
interface SystemMap {
  systems: SystemNode[];
  integrations: IntegrationEdge[];
}

// The five ramp stops, darkest cluster (most-integrated) first so the visual
// weight tracks integration density. These are CSS custom-property names —
// asserted verbatim by analytics-system-map.test.tsx against tokens.css.
export const CLUSTER_RAMP = [
  "--accent-900",
  "--accent-700",
  "--accent-500",
  "--accent-300",
  "--accent-100",
] as const;
export type ClusterStop = (typeof CLUSTER_RAMP)[number];

/**
 * Assigns each system a cluster ramp stop by its rank in the
 * integration-count ordering (ties broken by degree, then name for
 * determinism). Pure + exported so the ramp assignment is unit-tested
 * without rendering the SVG. Returns a map of system id → ramp custom
 * property name (always one of the five `CLUSTER_RAMP` stops).
 */
export function assignClusters(systems: SystemNode[]): Map<string, ClusterStop> {
  const ordered = [...systems].sort(
    (a, b) =>
      b.integrationCount - a.integrationCount ||
      b.degree - a.degree ||
      a.name.localeCompare(b.name),
  );
  const out = new Map<string, ClusterStop>();
  const n = ordered.length;
  ordered.forEach((s, i) => {
    // Split the ranked list into five equal-ish bands; empty list is a no-op.
    const band = n <= 1 ? 0 : Math.min(CLUSTER_RAMP.length - 1, Math.floor((i / n) * CLUSTER_RAMP.length));
    out.set(s.id, CLUSTER_RAMP[band]!);
  });
  return out;
}

interface Pos { x: number; y: number; vx: number; vy: number }

const WIDTH = 900;
const HEIGHT = 560;

export function AnalyticsSystems({ route: _route }: { route: Route }) {
  const data = useFetch<SystemMap>(
    (signal) =>
      fetch("/api/v1/analytics/systems", { signal }).then(async (res) => {
        if (!res.ok) {
          let detail = "";
          try { detail = JSON.stringify(await res.json()); } catch { /* */ }
          throw new Error(`${res.status} ${res.statusText} ${detail}`);
        }
        return res.json() as Promise<SystemMap>;
      }),
    [],
  );

  // FR-01 Native Conflict suppression (Resolves: C-04): while the system map
  // is mounted, scope a `user-scalable=no` viewport so a two-finger pinch
  // over the canvas drives the map's own zoom rather than the page's. The
  // original meta is restored on unmount so the rest of the PWA keeps
  // pinch-to-zoom accessibility.
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const prev = meta.getAttribute("content");
    meta.setAttribute("content", "width=device-width,initial-scale=1,user-scalable=no");
    return () => {
      if (prev !== null) meta.setAttribute("content", prev);
    };
  }, []);

  return (
    <>
      <ViewHeader
        title="System map"
        lede="Force-directed System / INTEGRATES_WITH map. Node size tracks integration count; cluster shade tracks integration density across the single-accent ramp."
      />
      {data.status === "loading" && <Loading what="the system map" />}
      {data.status === "error" && <ErrorState message={data.error} />}
      {data.status === "ok" && <SystemMapView map={data.data} />}
    </>
  );
}

function SystemMapView({ map }: { map: SystemMap }) {
  const [selected, setSelected] = useState<SystemNode | null>(null);
  const clusters = useMemo(() => assignClusters(map.systems), [map.systems]);
  const maxIntegration = Math.max(1, ...map.systems.map((s) => s.integrationCount));

  const svgRef = useRef<SVGSVGElement>(null);
  const circleRefs = useRef<Map<string, SVGCircleElement | null>>(new Map());
  const labelRefs = useRef<Map<string, SVGTextElement | null>>(new Map());
  const lineRefs = useRef<Map<string, SVGLineElement | null>>(new Map());

  // Seed positions on a circle so the simulation has somewhere to push from.
  const positions = useMemo(() => {
    const m = new Map<string, Pos>();
    const r = Math.min(WIDTH, HEIGHT) * 0.35;
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    map.systems.forEach((s, i) => {
      const a = (i / Math.max(1, map.systems.length)) * Math.PI * 2;
      m.set(s.id, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), vx: 0, vy: 0 });
    });
    return m;
  }, [map.systems]);

  // Verlet-ish layout (mirrors GraphCanvas): mutual repulsion + per-edge
  // spring, written imperatively to refs to avoid re-rendering every tick.
  useEffect(() => {
    let raf = 0;
    const REPULSION = 1600;
    const SPRING_K = 0.02;
    const SPRING_LEN = 110;
    const DAMPING = 0.82;
    const CENTER_PULL = 0.0009;

    const tick = (): void => {
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
      for (const e of map.integrations) {
        const a = positions.get(e.source);
        const b = positions.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const f = SPRING_K * (d - SPRING_LEN);
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
      const cx = WIDTH / 2;
      const cy = HEIGHT / 2;
      for (const p of positions.values()) {
        p.vx += (cx - p.x) * CENTER_PULL;
        p.vy += (cy - p.y) * CENTER_PULL;
        p.vx *= DAMPING; p.vy *= DAMPING;
        p.x += p.vx; p.y += p.vy;
        if (p.x < 28) p.x = 28;
        if (p.x > WIDTH - 28) p.x = WIDTH - 28;
        if (p.y < 28) p.y = 28;
        if (p.y > HEIGHT - 28) p.y = HEIGHT - 28;
      }
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
        t.setAttribute("y", String(p.y - 12));
      }
      for (const [id, l] of lineRefs.current) {
        const e = map.integrations.find((x) => x.id === id);
        if (!e || !l) continue;
        const a = positions.get(e.source);
        const b = positions.get(e.target);
        if (!a || !b) continue;
        l.setAttribute("x1", String(a.x)); l.setAttribute("y1", String(a.y));
        l.setAttribute("x2", String(b.x)); l.setAttribute("y2", String(b.y));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [positions, map.integrations]);

  // FR-01 Native Conflict suppression (Resolves: C-04): a custom double-tap
  // "fit to view" gesture. Because `touch-action: none` disables the native
  // double-tap-to-zoom, we re-seed the layout on a fast double tap so the map
  // recenters and re-spreads (a lightweight "fit to view").
  const lastTapRef = useRef(0);
  const fitToView = (): void => {
    const r = Math.min(WIDTH, HEIGHT) * 0.35;
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    map.systems.forEach((s, i) => {
      const p = positions.get(s.id);
      if (!p) return;
      const a = (i / Math.max(1, map.systems.length)) * Math.PI * 2;
      p.x = cx + r * Math.cos(a); p.y = cy + r * Math.sin(a);
      p.vx = 0; p.vy = 0;
    });
  };
  const onPointerDown = (): void => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) fitToView();
    lastTapRef.current = now;
  };

  const radius = (s: SystemNode): number =>
    7 + Math.round((s.integrationCount / maxIntegration) * 9);

  return (
    <div className={styles.layout}>
      <div className={styles.canvasWrap}>
        <svg
          ref={svgRef}
          className={styles.canvas}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          data-testid="system-map-svg"
          onDoubleClick={fitToView}
          onPointerDown={onPointerDown}
        >
          <g className={styles.edges}>
            {map.integrations.map((e) => (
              <line
                key={e.id}
                ref={(el) => { lineRefs.current.set(e.id, el); }}
                className={styles.edge}
              />
            ))}
          </g>
          <g>
            {map.systems.map((s) => {
              const stop = clusters.get(s.id) ?? "--accent-500";
              return (
                <g
                  key={s.id}
                  className={styles.nodeGroup}
                  data-testid="system-node"
                  data-cluster={stop}
                  onClick={() => setSelected(s)}
                >
                  <circle
                    ref={(el) => { circleRefs.current.set(s.id, el); }}
                    r={radius(s)}
                    fill={`var(${stop})`}
                    stroke="var(--surface)"
                    strokeWidth={1.5}
                  />
                  <text
                    ref={(el) => { labelRefs.current.set(s.id, el); }}
                    className={styles.nodeLabel}
                    textAnchor="middle"
                  >
                    {s.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <aside className={styles.rail}>
        <Card title="Integration density">
          <div className={styles.legend}>
            {CLUSTER_RAMP.map((stop, i) => (
              <div key={stop} className={styles.legendRow}>
                <span className={styles.swatch} style={{ background: `var(${stop})` }} />
                {i === 0 ? "most integrated" : i === CLUSTER_RAMP.length - 1 ? "least integrated" : `band ${i + 1}`}
              </div>
            ))}
          </div>
          <p className={styles.hint}>Double-tap the map to fit to view.</p>
        </Card>

        {selected && (
          <Card
            title={selected.name}
            actions={<Button tone="ghost" onClick={() => setSelected(null)}>×</Button>}
          >
            <KeyValueList rows={[
              { label: "degree", value: selected.degree },
              { label: "integrations", value: selected.integrationCount },
              { label: "id", value: <code className={styles.id}>{selected.id}</code> },
            ]} />
            <div style={{ marginTop: 12 }}>
              <Button href={`#/explorer/systems?system=${encodeURIComponent(selected.id)}`}>
                Open in explorer
              </Button>
            </div>
          </Card>
        )}

        <Card title="Systems">
          <KeyValueList rows={map.systems.map((s) => ({
            label: s.name,
            value: `${s.integrationCount} int · deg ${s.degree}`,
          }))} />
        </Card>
      </aside>
    </div>
  );
}
