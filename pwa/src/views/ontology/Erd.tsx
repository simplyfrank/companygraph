import { useState } from "react";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { ViewHeader, Loading, ErrorState, SecLabel } from "../_shared";
import styles from "./Erd.module.css";

// Fixed positions — readable retail-process layout.
// Boxes are taller to accommodate attribute rows.
const POS: Record<string, { x: number; y: number }> = {
  Domain:      { x: 360, y:  40 },
  UserJourney: { x: 360, y: 170 },
  Activity:    { x: 360, y: 320 },
  Role:        { x:  80, y: 320 },
  System:      { x: 640, y: 320 },
  Location:    { x: 360, y: 490 },
};

const BOX_W = 160;
const BOX_HEADER_H = 46;   // title + count
const ATTR_ROW_H = 14;      // each attribute row
const ATTR_PADDING = 8;     // top + bottom padding inside box

const EDGES: Array<{
  from: string;
  to: string;
  type: string;
  curve?: "self";
  cardinality?: string;
}> = [
  { from: "UserJourney", to: "Domain",      type: "PART_OF",           cardinality: "n:1" },
  { from: "Activity",    to: "UserJourney", type: "PART_OF",           cardinality: "n:1" },
  { from: "Role",        to: "Activity",    type: "EXECUTES",          cardinality: "n:n" },
  { from: "Activity",    to: "System",      type: "USES_SYSTEM",       cardinality: "n:n" },
  { from: "Activity",    to: "Location",    type: "AT_LOCATION",       cardinality: "n:n" },
  { from: "Activity",    to: "Activity",    type: "PRECEDES",          curve: "self", cardinality: "1:1" },
  { from: "System",      to: "System",      type: "INTEGRATES_WITH",   curve: "self", cardinality: "n:n" },
  { from: "Location",    to: "Location",    type: "PART_OF",           curve: "self", cardinality: "n:1" },
];

const TONE: Record<string, "accent" | "good" | "warn" | "danger" | "neutral"> = {
  Domain: "accent",
  UserJourney: "good",
  Activity: "neutral",
  Role: "warn",
  System: "danger",
  Location: "neutral",
};

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

export function OntologyErd() {
  const stats = useFetch(() => api.stats(), []);
  const labels = useFetch(() => api.ontology.listLabels(), []);

  // Selection can be a node label or an edge index
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);

  // Build a map label -> schema row for fast lookup
  const labelMap = labels.status === "ok"
    ? new Map(labels.data.rows.map((r) => [r.name, r]))
    : new Map();

  // Compute dynamic box heights based on attribute count
  const boxHeights: Record<string, number> = {};
  for (const label of Object.keys(POS)) {
    const schema = labelMap.get(label);
    const props = parseSchemaProperties(schema?.json_schema_doc);
    // Header + attributes + padding
    boxHeights[label] = BOX_HEADER_H + Math.max(props.length, 1) * ATTR_ROW_H + ATTR_PADDING;
  }

  const activeNode = selectedNode ?? hoverNode;

  // Is an edge dimmed when a node is selected/hovered?
  const edgeDimmed = (e: typeof EDGES[0]) => {
    if (!activeNode) return false;
    return e.from !== activeNode && e.to !== activeNode;
  };

  const edgeHighlighted = (e: typeof EDGES[0], idx: number) => {
    if (selectedEdge === idx) return true;
    if (!activeNode) return false;
    return e.from === activeNode || e.to === activeNode;
  };

  const selectedLabelRow = selectedNode ? labelMap.get(selectedNode) : undefined;
  const selectedEdgeDef = selectedEdge !== null ? EDGES[selectedEdge] : undefined;

  return (
    <>
      <ViewHeader
        title="ERD canvas"
        lede="Interactive schema diagram — 6 node labels and 6 edge types. Click a box or edge to inspect. Ontology-manager lets you evolve this schema at runtime."
      />
      <div className={styles.layout}>
        <Card>
          {/* ViewBox scales to fit; keep internal coords fixed. */}
          <svg viewBox="0 0 840 620" className={styles.svg} preserveAspectRatio="xMidYMid meet">
            <defs>
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

            {/* Edges (drawn first so they sit behind nodes) */}
            {EDGES.map((e, i) => {
              const isDim = edgeDimmed(e);
              const isHighlight = edgeHighlighted(e, i);
              const stroke = isHighlight ? "var(--accent)" : isDim ? "var(--border)" : "var(--border-strong)";
              const strokeWidth = isHighlight ? 2 : 1;
              const marker = isHighlight ? "url(#arrowAccent)" : "url(#arrow)";

              if (e.curve === "self") {
                const p = POS[e.from];
                if (!p) return null;
                const h = boxHeights[e.from] ?? BOX_HEADER_H;
                const cx = p.x + BOX_W / 2 + 55;
                const cy = p.y + h / 2;
                return (
                  <g key={i} className={styles.edge} data-dim={isDim ? "true" : undefined} data-selected={selectedEdge === i ? "true" : undefined}>
                    <path
                      d={`M ${p.x + BOX_W} ${p.y + 22} C ${cx + 35} ${p.y + 10}, ${cx + 35} ${p.y + h - 10}, ${p.x + BOX_W} ${p.y + h - 22}`}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      markerEnd={marker}
                      onClick={() => { setSelectedEdge(i); setSelectedNode(null); }}
                      style={{ cursor: "pointer" }}
                    />
                    <text x={cx + 16} y={cy + 4} className={styles.edgeLabel}>{e.type}</text>
                    {e.cardinality && (
                      <text x={cx + 16} y={cy + 16} className={styles.edgeCardinality}>{e.cardinality}</text>
                    )}
                  </g>
                );
              }

              const a = POS[e.from];
              const b = POS[e.to];
              if (!a || !b) return null;
              const ah = boxHeights[e.from] ?? BOX_HEADER_H;
              const bh = boxHeights[e.to] ?? BOX_HEADER_H;

              const ax = a.x + BOX_W / 2;
              const ay = a.y + ah;
              const bx = b.x + BOX_W / 2;
              const by = b.y;
              const mx = (ax + bx) / 2;
              const my = (ay + by) / 2;

              // Horizontal? Connect side-to-side.
              const horizontal = Math.abs(a.y - b.y) < 30;
              const fromX = horizontal ? (a.x < b.x ? a.x + BOX_W : a.x) : ax;
              const fromY = horizontal ? a.y + ah / 2 : ay;
              const toX = horizontal ? (a.x < b.x ? b.x : b.x + BOX_W) : bx;
              const toY = horizontal ? b.y + bh / 2 : by;

              return (
                <g key={i} className={styles.edge} data-dim={isDim ? "true" : undefined} data-selected={selectedEdge === i ? "true" : undefined}>
                  <line
                    x1={fromX} y1={fromY} x2={toX} y2={toY}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    markerEnd={marker}
                    onClick={() => { setSelectedEdge(i); setSelectedNode(null); }}
                    style={{ cursor: "pointer" }}
                  />
                  <text
                    x={mx} y={my - 6}
                    className={styles.edgeLabel}
                    textAnchor="middle"
                  >
                    {e.type}
                  </text>
                  {e.cardinality && (
                    <text x={mx} y={my + 8} className={styles.edgeCardinality} textAnchor="middle">
                      {e.cardinality}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Node boxes */}
            {Object.entries(POS).map(([label, p]) => {
              const count = stats.status === "ok"
                ? stats.data.nodes[label as keyof typeof stats.data.nodes] ?? 0
                : 0;
              const schema = labelMap.get(label);
              const props = parseSchemaProperties(schema?.json_schema_doc);
              const h = boxHeights[label] ?? BOX_HEADER_H;
              const isSelected = selectedNode === label;
              const isDim = activeNode !== null && activeNode !== label;

              return (
                <g
                  key={label}
                  transform={`translate(${p.x} ${p.y})`}
                  className={styles.node}
                  data-selected={isSelected ? "true" : undefined}
                  data-dim={isDim ? "true" : undefined}
                  onMouseEnter={() => setHoverNode(label)}
                  onMouseLeave={() => setHoverNode((h) => (h === label ? null : h))}
                  onClick={() => { setSelectedNode(label); setSelectedEdge(null); }}
                >
                  {/* Box background */}
                  <rect width={BOX_W} height={h} rx={6} className={styles.box} />

                  {/* Header stripe */}
                  <rect
                    width={BOX_W - 2}
                    height={20}
                    x={1}
                    y={1}
                    rx={5}
                    className={styles.headerStripe}
                    style={{ fill: `var(--tone-${TONE[label] ?? "neutral"})` }}
                  />

                  {/* Label name */}
                  <text x={BOX_W / 2} y={16} textAnchor="middle" className={styles.title}>{label}</text>

                  {/* Count */}
                  <text x={BOX_W / 2} y={34} textAnchor="middle" className={styles.count}>{count}</text>

                  {/* Divider */}
                  <line x1={8} y1={40} x2={BOX_W - 8} y2={40} stroke="var(--border)" strokeWidth="0.5" />

                  {/* Attribute rows */}
                  {props.map((prop, idx) => (
                    <g key={prop.name} transform={`translate(10 ${44 + idx * ATTR_ROW_H})`}>
                      <circle
                        cx={3}
                        cy={5}
                        r={2.5}
                        className={prop.required ? styles.reqDot : styles.optDot}
                      />
                      <text x={10} y={7} className={styles.attrName}>{prop.name}</text>
                      <text x={BOX_W - 14} y={7} textAnchor="end" className={styles.attrType}>{prop.type}</text>
                    </g>
                  ))}
                  {props.length === 0 && (
                    <text x={BOX_W / 2} y={52} textAnchor="middle" className={styles.noAttrs}>open schema</text>
                  )}
                </g>
              );
            })}
          </svg>
        </Card>

        {/* Right panel — selection-aware details */}
        <aside className={styles.panel}>
          {selectedLabelRow ? (
            <SelectedLabelPanel row={selectedLabelRow} />
          ) : selectedEdgeDef ? (
            <SelectedEdgePanel edge={selectedEdgeDef} />
          ) : (
            <Card title="Schema details">
              <p style={{ color: "var(--muted)", fontSize: 13 }}>
                Click a node or edge in the diagram to inspect its full schema,
                attributes, and relationships.
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
          {labels.status === "loading" && <Loading what="label schemas" />}
          {labels.status === "error" && <ErrorState message={labels.error} />}
        </aside>
      </div>
    </>
  );
}

// ── Right-panel: selected label ─────────────────────────────────

function SelectedLabelPanel({ row }: { row: import("../../api").OntologyLabelRow }) {
  const props = parseSchemaProperties(row.json_schema_doc);
  return (
    <>
      <Card
        title={row.name}
        actions={<Pill tone={TONE[row.name] ?? "neutral"}>{row.name}</Pill>}
      >
        <SecLabel>DESCRIPTION</SecLabel>
        <p style={{ color: "var(--fg)", fontSize: 13, lineHeight: 1.5, margin: "0 0 12px" }}>
          {row.description}
        </p>

        <SecLabel>USAGE EXAMPLE</SecLabel>
        <code className={styles.codeBlock}>{row.usage_example}</code>

        {props.length > 0 && (
          <>
            <SecLabel>ATTRIBUTES ({props.length})</SecLabel>
            <ul className={styles.attrList}>
              {props.map((p) => (
                <li key={p.name} className={styles.attrListRow}>
                  <span className={styles.attrListDot} data-required={p.required} />
                  <span className={styles.attrListName}>{p.name}</span>
                  <span className={styles.attrListType}>{p.type}</span>
                  {p.required && <span className={styles.attrListReq}>required</span>}
                </li>
              ))}
            </ul>
          </>
        )}

        {row.external_alignment.length > 0 && (
          <>
            <SecLabel>EXTERNAL ALIGNMENTS</SecLabel>
            <ul className={styles.alignList}>
              {row.external_alignment.map((a, i) => (
                <li key={i}>{a.source} · <code>{a.id}</code></li>
              ))}
            </ul>
          </>
        )}

        {row.deprecated_at && (
          <Pill tone="warn">Deprecated · {row.deprecated_at}</Pill>
        )}
      </Card>

      <Card title="Connected edges">
        <ul className={styles.edgeList}>
          {EDGES.filter((e) => e.from === row.name || e.to === row.name).map((e, i) => (
            <li key={i}>
              <code>{e.from}</code>
              <span style={{ color: "var(--muted)", margin: "0 4px" }}>—{e.type}→</span>
              <code>{e.to}</code>
              {e.cardinality && <span className={styles.cardBadge}>{e.cardinality}</span>}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

// ── Right-panel: selected edge ──────────────────────────────────

function SelectedEdgePanel({ edge }: { edge: typeof EDGES[0] }) {
  return (
    <Card title={edge.type}>
      <SecLabel>ENDPOINTS</SecLabel>
      <div className={styles.endpointRow}>
        <span className={styles.endpointBox}>{edge.from}</span>
        <span className={styles.endpointArrow}>→</span>
        <span className={styles.endpointBox}>{edge.to}</span>
      </div>
      {edge.cardinality && (
        <>
          <SecLabel>CARDINALITY</SecLabel>
          <Pill tone="accent">{edge.cardinality}</Pill>
        </>
      )}
      <SecLabel>SELF-LOOP</SecLabel>
      <Pill tone={edge.curve === "self" ? "warn" : "neutral"}>
        {edge.curve === "self" ? "Yes" : "No"}
      </Pill>
    </Card>
  );
}
