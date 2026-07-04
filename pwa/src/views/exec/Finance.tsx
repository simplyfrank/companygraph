import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { GroupedBarChartCard, KpiCard, CHART_COLORS } from "../../components/charts";
import { ViewHeader, Loading, ErrorState, SecLabel } from "../_shared";
import styles from "./Finance.module.css";

interface DomainSpendRow {
  domainId: string;
  domainName: string;
  journeyCount: number;
  totalRunsPerMonth: number;
  totalCostPerMonth: number;
}

// Stable per-domain budget — keyed by name. Real cost-tracking will land
// when finance attributes ship through ontology-manager schema editor.
const BUDGETS: Record<string, number> = {
  "Customer/CRM": 180_000,
  "Logistics": 220_000,
  "Merchandising": 150_000,
  "Store Operations": 120_000,
  "Supply Chain": 200_000,
};

const DEFAULT_COST_PER_RUN_USD = 4.20;     // when journey lacks attribute
const DEFAULT_RUNS_PER_MONTH = 1200;        // when journey lacks attribute

export function ExecFinance() {
  // Per-domain spend computed from journey attributes when present;
  // falls back to a default for journeys without finance metadata.
  const spend = useFetch(
    () =>
      api.cypher(
        `MATCH (d:Domain)
         OPTIONAL MATCH (j:UserJourney)-[:PART_OF]->(d)
         WITH d, j
         WITH d,
              count(j) AS journeyCount,
              sum(coalesce(
                CASE WHEN j.attributes_json IS NULL THEN null
                     ELSE apoc.convert.fromJsonMap(j.attributes_json).runs_per_month
                END,
                ${DEFAULT_RUNS_PER_MONTH}
              )) AS totalRunsPerMonth,
              sum(coalesce(
                CASE WHEN j.attributes_json IS NULL THEN null
                     ELSE apoc.convert.fromJsonMap(j.attributes_json).runs_per_month *
                          apoc.convert.fromJsonMap(j.attributes_json).cost_per_run_usd
                END,
                ${DEFAULT_RUNS_PER_MONTH} * ${DEFAULT_COST_PER_RUN_USD}
              )) AS totalCostPerMonth
         RETURN d.id AS domainId, d.name AS domainName,
                journeyCount, totalRunsPerMonth, totalCostPerMonth
         ORDER BY totalCostPerMonth DESC`,
      ).catch(async () => {
        // APOC may not be available — fall back to per-domain journey-count
        // baseline. Still produces a usable preview.
        const r = await api.cypher(
          `MATCH (d:Domain)
           OPTIONAL MATCH (j:UserJourney)-[:PART_OF]->(d)
           RETURN d.id AS domainId, d.name AS domainName,
                  count(j) AS journeyCount,
                  count(j) * ${DEFAULT_RUNS_PER_MONTH} AS totalRunsPerMonth,
                  count(j) * ${DEFAULT_RUNS_PER_MONTH} * ${DEFAULT_COST_PER_RUN_USD} AS totalCostPerMonth
           ORDER BY count(j) DESC`,
        );
        return r;
      }),
    [],
  );

  return (
    <>
      <ViewHeader
        title="Finance"
        lede="Per-domain spend. Computed live from journey attributes (runs_per_month × cost_per_run_usd) where present, falls back to a 1200 × $4.20 baseline otherwise. Owned by cto-analytics — this is the graph-core read."
      />

      {spend.status === "loading" && <Loading what="spend" />}
      {spend.status === "error" && <ErrorState message={spend.error} />}
      {spend.status === "ok" && (
        <>
          <KPITiles rows={spend.data.rows as unknown as DomainSpendRow[]} />
          <div style={{ height: 24 }} />
          <div className={styles.dashboardGrid}>
            <GroupedBarChartCard
              title="Spend vs budget"
              data={(spend.data.rows as unknown as DomainSpendRow[]).map((r) => ({
                label: r.domainName,
                spend: Math.round(r.totalCostPerMonth),
                budget: BUDGETS[r.domainName] ?? 0,
              }))}
              bars={[
                { dataKey: "budget", color: CHART_COLORS.gray, label: "Budget" },
                { dataKey: "spend", color: CHART_COLORS.accent, label: "Spend" },
              ]}
              yLabel="USD / mo"
            />
          </div>
          <div style={{ height: 24 }} />
          <Card title="Per-domain budget vs spend">
            <BudgetTable rows={spend.data.rows as unknown as DomainSpendRow[]} />
          </Card>
        </>
      )}
    </>
  );
}

function KPITiles({ rows }: { rows: DomainSpendRow[] }) {
  const totalSpend = rows.reduce((s, r) => s + r.totalCostPerMonth, 0);
  const totalRuns = rows.reduce((s, r) => s + r.totalRunsPerMonth, 0);
  const totalBudget = Object.values(BUDGETS).reduce((s, b) => s + b, 0);
  const utilization = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0;
  const avgCostPerRun = totalRuns > 0 ? totalSpend / totalRuns : 0;
  const overBudget = rows.filter(
    (r) => (BUDGETS[r.domainName] ?? 0) > 0 && r.totalCostPerMonth > (BUDGETS[r.domainName] ?? 0),
  ).length;
  return (
    <div className={styles.tiles}>
      <KpiCard label="Total spend / mo" value={fmtUsd(totalSpend)} caption="across all domains" />
      <KpiCard label="Total runs / mo" value={fmtCount(totalRuns)} caption="∑ journey runs" />
      <KpiCard label="Avg cost / run" value={`$${avgCostPerRun.toFixed(2)}`} caption="weighted" />
      <KpiCard
        label="Utilisation"
        value={`${utilization.toFixed(0)}%`}
        caption={utilization > 100 ? "over budget" : "of $" + fmtCount(totalBudget)}
        tone={utilization > 100 ? "danger" : utilization > 85 ? "warn" : "good"}
      />
      <KpiCard
        label="Domains over"
        value={String(overBudget)}
        caption="exceeding budget"
        tone={overBudget > 0 ? "warn" : "good"}
      />
    </div>
  );
}

function BudgetTable({ rows }: { rows: DomainSpendRow[] }) {
  const maxSpend = Math.max(1, ...rows.map((r) => r.totalCostPerMonth));
  return (
    <table className={styles.budgetTable}>
      <thead>
        <tr>
          <th>Domain</th>
          <th className={styles.num}>Journeys</th>
          <th className={styles.num}>Runs / mo</th>
          <th className={styles.num}>Spend / mo</th>
          <th className={styles.num}>Budget</th>
          <th>Utilisation</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const budget = BUDGETS[r.domainName] ?? 0;
          const util = budget > 0 ? r.totalCostPerMonth / budget : 0;
          const tone: "good" | "warn" | "danger" =
            util >= 1.0 ? "danger" : util >= 0.85 ? "warn" : "good";
          return (
            <tr key={r.domainId}>
              <td>
                <strong>{r.domainName}</strong>
              </td>
              <td className={styles.num}>{r.journeyCount}</td>
              <td className={styles.num}>{fmtCount(r.totalRunsPerMonth)}</td>
              <td className={styles.num}>{fmtUsd(r.totalCostPerMonth)}</td>
              <td className={styles.num}>{budget > 0 ? fmtUsd(budget) : "—"}</td>
              <td className={styles.barCell}>
                {budget > 0 ? (
                  <div className={styles.barWrap} title={`${(util * 100).toFixed(0)}% of $${budget}`}>
                    <div
                      className={`${styles.bar} ${styles[`bar-${tone}`]}`}
                      style={{ width: `${Math.min(100, util * 100)}%` }}
                    />
                    <span className={styles.barLabel}>
                      <Pill tone={tone}>{(util * 100).toFixed(0)}%</Pill>
                    </span>
                  </div>
                ) : (
                  <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                    {fmtUsd(r.totalCostPerMonth)} (no budget set)
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toFixed(0);
}
