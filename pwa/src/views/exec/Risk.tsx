import { useMemo, useState } from "react";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { PieChartCard, HorizontalBarChartCard, STATUS_COLORS, SEVERITY_COLORS } from "../../components/charts";
import { ViewHeader, SecLabel, Loading, ErrorState } from "../_shared";
import styles from "./Risk.module.css";

// Risk register row from PostgreSQL
interface RiskRow {
  id: string;
  name: string;
  owner: string;
  domain: string;
  likelihood: 1 | 2 | 3 | 4 | 5;
  impact: 1 | 2 | 3 | 4 | 5;
  status: "open" | "mitigating" | "accepted" | "resolved";
  trend: "up" | "flat" | "down";
  description?: string;
  mitigation_plan?: string;
  created_at: string;
  updated_at: string;
}

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

  // Fetch risks from PostgreSQL
  const risks = useFetch(
    () => fetch('/api/v1/risk-register').then((r) => r.json()).then((data) => data.data),
    []
  );

  const risksData: RiskRow[] = risks.status === 'ok' ? risks.data : [];

  const filtered = useMemo(() =>
    activeOwner ? risksData.filter((r) => r.owner === activeOwner) : risksData,
    [activeOwner, risksData],
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

  const owners = useMemo(() => [...new Set(risksData.map((r) => r.owner))].sort(), [risksData]);

  if (risks.status === 'loading') {
    return (
      <>
        <ViewHeader title="Risk" lede="Risk register projected onto a likelihood × impact heatmap." />
        <Loading what="risks" />
      </>
    );
  }

  if (risks.status === 'error') {
    return (
      <>
        <ViewHeader title="Risk" lede="Risk register projected onto a likelihood × impact heatmap." />
        <ErrorState message={risks.error} />
      </>
    );
  }

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
              All <span className={styles.ownerCount}>{risksData.length}</span>
            </button>
            {owners.map((o) => {
              const n = risksData.filter((r) => r.owner === o).length;
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

      <div className={styles.dashboardGrid}>
        <PieChartCard
          title="Status distribution"
          data={[
            { label: "open", value: filtered.filter((r) => r.status === "open").length, color: STATUS_COLORS.open ?? "#f59e0b" },
            { label: "mitigating", value: filtered.filter((r) => r.status === "mitigating").length, color: STATUS_COLORS.mitigating ?? "#3b82f6" },
            { label: "accepted", value: filtered.filter((r) => r.status === "accepted").length, color: STATUS_COLORS.accepted ?? "#8b5cf6" },
            { label: "resolved", value: filtered.filter((r) => r.status === "resolved").length, color: STATUS_COLORS.resolved ?? "#22c55e" },
          ]}
          donut
        />
        <HorizontalBarChartCard
          title="Risks by owner"
          data={owners.map((o) => ({
            label: o,
            value: filtered.filter((r) => r.owner === o).length,
          }))}
          xLabel="risks"
        />
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
