import { useMemo, useState } from "react";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { ViewHeader, SecLabel } from "../_shared";
import styles from "./Risk.module.css";

// Static risk register — placeholder shape that mirrors what
// cto-analytics will surface once the schema lands. Each row carries a
// likelihood (1-5) and an impact (1-5); the heatmap is just the
// projection of the register onto that 5x5 grid.
interface RiskRow {
  id: string;
  name: string;
  owner: string;
  domain: string;
  likelihood: 1 | 2 | 3 | 4 | 5;
  impact: 1 | 2 | 3 | 4 | 5;
  status: "open" | "mitigating" | "accepted" | "resolved";
  trend: "up" | "flat" | "down";
}

const RISKS: RiskRow[] = [
  { id: "r-01", name: "Single-vendor lock on OMS",                       owner: "VP Ops",      domain: "Logistics",       likelihood: 3, impact: 4, status: "mitigating", trend: "down" },
  { id: "r-02", name: "Label printer SLA breach (1500 ms p95)",          owner: "VP Ops",      domain: "Logistics",       likelihood: 4, impact: 3, status: "open",       trend: "up"   },
  { id: "r-03", name: "Pricing System ↔ POS coupling tight",             owner: "CTO",         domain: "Merchandising",   likelihood: 3, impact: 3, status: "open",       trend: "flat" },
  { id: "r-04", name: "Manual vendor-shipment paperwork",                owner: "Head of SC",  domain: "Supply Chain",    likelihood: 4, impact: 2, status: "mitigating", trend: "flat" },
  { id: "r-05", name: "CRM PII export not encrypted-at-rest",            owner: "Security",    domain: "Customer/CRM",    likelihood: 2, impact: 5, status: "open",       trend: "flat" },
  { id: "r-06", name: "POS terminal boot time > 5 min on Friday open",   owner: "Store Lead",  domain: "Store Operations",likelihood: 3, impact: 2, status: "accepted",   trend: "flat" },
  { id: "r-07", name: "Cash-drawer reconciliation manual",               owner: "Finance",     domain: "Store Operations",likelihood: 2, impact: 2, status: "mitigating", trend: "down" },
  { id: "r-08", name: "DC inbound truck slot overflow during peak",      owner: "Head of SC",  domain: "Supply Chain",    likelihood: 5, impact: 3, status: "open",       trend: "up"   },
  { id: "r-09", name: "Loyalty-tier upgrade fraud vector",               owner: "Security",    domain: "Customer/CRM",    likelihood: 2, impact: 3, status: "mitigating", trend: "down" },
  { id: "r-10", name: "Markdown rollback path untested",                 owner: "Pricing",     domain: "Merchandising",   likelihood: 2, impact: 4, status: "open",       trend: "flat" },
  { id: "r-11", name: "Courier API rate-limit (last-mile)",              owner: "VP Ops",      domain: "Logistics",       likelihood: 3, impact: 4, status: "open",       trend: "up"   },
  { id: "r-12", name: "ERP year-end close compute spike",                owner: "Finance",     domain: "Supply Chain",    likelihood: 5, impact: 5, status: "open",       trend: "flat" },
];

const STATUS_TONE: Record<RiskRow["status"], "good" | "accent" | "warn" | "neutral"> = {
  resolved: "good",
  mitigating: "accent",
  open: "warn",
  accepted: "neutral",
};

const TREND_GLYPH: Record<RiskRow["trend"], string> = {
  up: "↗",
  flat: "→",
  down: "↘",
};

function severity(r: RiskRow): number {
  return r.likelihood * r.impact;
}

function severityTone(score: number): "good" | "warn" | "danger" {
  if (score >= 16) return "danger";
  if (score >= 9)  return "warn";
  return "good";
}

export function ExecRisk() {
  const [highlightedCell, setHighlightedCell] = useState<{ l: number; i: number } | null>(null);
  const [activeOwner, setActiveOwner] = useState<string | null>(null);

  const filtered = useMemo(() =>
    activeOwner ? RISKS.filter((r) => r.owner === activeOwner) : RISKS,
    [activeOwner],
  );

  const cellRisks = useMemo(() => {
    const map = new Map<string, RiskRow[]>();
    for (const r of filtered) {
      const key = `${r.likelihood}|${r.impact}`;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return map;
  }, [filtered]);

  const owners = useMemo(() => [...new Set(RISKS.map((r) => r.owner))].sort(), []);

  return (
    <>
      <ViewHeader
        title="Risk"
        lede="Risk register projected onto a likelihood × impact heatmap. Hover a cell to spotlight the rows it covers; click an owner pill to filter."
      />

      <div className={styles.layout}>
        <Card title="Heatmap" actions={activeOwner ? <Pill tone="accent">filter · {activeOwner}</Pill> : null}>
          <Heatmap
            cellRisks={cellRisks}
            highlighted={highlightedCell}
            onHover={setHighlightedCell}
          />
        </Card>

        <Card title="Owners">
          <div className={styles.ownerList}>
            <button
              type="button"
              className={`${styles.ownerBtn} ${activeOwner === null ? styles.ownerActive : ""}`}
              onClick={() => setActiveOwner(null)}
            >
              All <span className={styles.ownerCount}>{RISKS.length}</span>
            </button>
            {owners.map((o) => {
              const n = RISKS.filter((r) => r.owner === o).length;
              return (
                <button
                  key={o}
                  type="button"
                  className={`${styles.ownerBtn} ${activeOwner === o ? styles.ownerActive : ""}`}
                  onClick={() => setActiveOwner(o === activeOwner ? null : o)}
                >
                  {o} <span className={styles.ownerCount}>{n}</span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div style={{ height: 24 }} />

      <Card title="Risk register">
        <table className={styles.registerTable}>
          <thead>
            <tr>
              <th>Id</th>
              <th>Risk</th>
              <th>Domain</th>
              <th>Owner</th>
              <th className={styles.num}>L</th>
              <th className={styles.num}>I</th>
              <th className={styles.num}>Score</th>
              <th>Status</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const score = severity(r);
              const tone = severityTone(score);
              const isHighlighted = highlightedCell?.l === r.likelihood && highlightedCell?.i === r.impact;
              return (
                <tr
                  key={r.id}
                  className={isHighlighted ? styles.rowHighlight : undefined}
                  onMouseEnter={() => setHighlightedCell({ l: r.likelihood, i: r.impact })}
                  onMouseLeave={() => setHighlightedCell(null)}
                >
                  <td className={styles.id}>{r.id}</td>
                  <td>{r.name}</td>
                  <td>{r.domain}</td>
                  <td>{r.owner}</td>
                  <td className={styles.num}>{r.likelihood}</td>
                  <td className={styles.num}>{r.impact}</td>
                  <td className={styles.num}>
                    <Pill tone={tone}>{score}</Pill>
                  </td>
                  <td>
                    <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill>
                  </td>
                  <td className={styles.trendCell}>
                    <span className={r.trend === "up" ? styles.trendUp : r.trend === "down" ? styles.trendDown : styles.trendFlat}>
                      {TREND_GLYPH[r.trend]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function Heatmap({
  cellRisks,
  highlighted,
  onHover,
}: {
  cellRisks: Map<string, RiskRow[]>;
  highlighted: { l: number; i: number } | null;
  onHover: (c: { l: number; i: number } | null) => void;
}) {
  return (
    <div className={styles.heatmapWrap}>
      <SecLabel>Likelihood →</SecLabel>
      <table className={styles.heatmap}>
        <thead>
          <tr>
            <th className={styles.heatmapCorner}></th>
            {[1, 2, 3, 4, 5].map((l) => <th key={l} className={styles.heatmapAxis}>{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {[5, 4, 3, 2, 1].map((i) => (
            <tr key={i}>
              <th className={styles.heatmapAxis}>{i}</th>
              {[1, 2, 3, 4, 5].map((l) => {
                const cell = cellRisks.get(`${l}|${i}`) ?? [];
                const score = l * i;
                const tone = severityTone(score);
                const isHL = highlighted?.l === l && highlighted?.i === i;
                return (
                  <td
                    key={l}
                    className={`${styles.heatCell} ${styles[`heat-${tone}`]} ${isHL ? styles.heatCellHL : ""}`}
                    onMouseEnter={() => onHover({ l, i })}
                    onMouseLeave={() => onHover(null)}
                    title={cell.map((r) => r.name).join("\n") || "no risks"}
                  >
                    <span className={styles.heatCellScore}>{score}</span>
                    {cell.length > 0 && (
                      <span className={styles.heatCellDots}>
                        {Array.from({ length: Math.min(cell.length, 5) }).map((_, idx) => (
                          <span key={idx} className={styles.heatCellDot} />
                        ))}
                        {cell.length > 5 && <span className={styles.heatCellMore}>+{cell.length - 5}</span>}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.heatmapYLabel}><SecLabel>Impact ↑</SecLabel></div>
    </div>
  );
}
