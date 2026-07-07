// saas-metric-library T-09 (design §6.3, §6.4, §6.5 + review-design.md C-01 —
// FR-10, FR-11, FR-13; AC-12, AC-13, AC-14, AC-15, AC-17 tsx half). The live
// canonical metric catalog at #/insights/metrics. Read-only v1 (OQ-6): browse +
// filter, no in-view editor.
//
// Subject — consumes useActiveModel() for header context only (never
// re-implemented); the catalog is model-independent (§4/FR-05), so the view
// lists ALL MetricDefinition nodes regardless of active model.
//
// Read — ONE api.cypher(...) call (the §5.5 statement, mirroring FunctionMap's
// single-read pattern). C-01 pin: the view fetches ONLY the metric list — no
// second MATCH (k:KPI)-[:MEASURES]->(m) read, and no per-metric KPI list ships
// in v1 (the seed carries zero MEASURES edges).
//
// States (UX-01, catalog-first) — Loading / EmptyState / ErrorState / ready
// grid, all from _shared.tsx; the root is the catalog ViewRegion landmark. The
// category filter and each metric row are keyboard-reachable in DOM order
// (native controls, no focus trap, no gesture handler) — AC-17.

import { useState, useCallback, useEffect, useMemo } from "react";
import { api } from "../../api";
import { useActiveModel } from "../../context/ActiveModelContext";
import { ViewRegion, ViewHeader, Loading, EmptyState, ErrorState } from "../_shared";
import styles from "./MetricLibrary.module.css";

// §5.5 catalog list read — mirrors api/src/seed/metric-catalog.ts
// METRIC_CATALOG_LIST_QUERY (kept aligned so server + view read the same shape).
const METRIC_CATALOG_LIST_QUERY = `MATCH (m:MetricDefinition)
RETURN m.id AS id, m.name AS name, m.description AS description,
       m.attributes_json AS attributes_json
ORDER BY m.name`;

const ALL_CATEGORIES = "all";

interface MetricRow {
  id: string;
  name: string;
  description: string;
  formula: string;
  unit: string;
  category: string;
  benchmark: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; rows: MetricRow[] }
  | { status: "error"; message: string };

function parseAttributes(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

export function MetricLibrary() {
  const { status: modelStatus } = useActiveModel();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await api.cypher(METRIC_CATALOG_LIST_QUERY, {});
      const rows: MetricRow[] = res.rows.map((r) => {
        const attrs = parseAttributes(r.attributes_json);
        return {
          id: String(r.id),
          name: String(r.name ?? ""),
          description: String(r.description ?? ""),
          formula: String(attrs.formula ?? ""),
          unit: String(attrs.unit ?? ""),
          category: String(attrs.category ?? ""),
          benchmark: String(attrs.benchmark ?? ""),
        };
      });
      setState({ status: "ready", rows });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => {
    if (state.status !== "ready") return [];
    return Array.from(new Set(state.rows.map((m) => m.category).filter(Boolean))).sort();
  }, [state]);

  const visibleRows = useMemo(() => {
    if (state.status !== "ready") return [];
    if (category === ALL_CATEGORIES) return state.rows;
    return state.rows.filter((m) => m.category === category);
  }, [state, category]);

  return (
    <ViewRegion label="Metric library">
      <ViewHeader
        title="Metrics"
        lede="The canonical SaaS/finance metric definitions operator KPIs measure. Filter by category to browse formula, unit, and benchmark."
      />
      {(modelStatus === "loading" || state.status === "loading") && <Loading what="metrics" />}
      {state.status === "error" && (
        <ErrorState message={state.message} onRetry={() => void load()} />
      )}
      {state.status === "ready" && state.rows.length === 0 && (
        <div data-testid="metric-library-empty">
          <EmptyState what="metric definitions" />
          <p className={styles.description}>
            Run <code>bun run seed:saas-metric-library</code> to seed the
            canonical metric catalog.
          </p>
        </div>
      )}
      {state.status === "ready" && state.rows.length > 0 && (
        <>
          <div className={styles.filterBar}>
            <label className={styles.filterLabel} htmlFor="metric-category-filter">
              Category
            </label>
            <select
              id="metric-category-filter"
              className={styles.filterSelect}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              data-testid="metric-category-filter"
            >
              <option value={ALL_CATEGORIES}>All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.grid} data-testid="metric-library-grid">
            {visibleRows.map((m) => (
              <article
                key={m.id}
                className={styles.card}
                data-testid="metric-card"
                data-category={m.category}
                tabIndex={0}
                aria-label={`${m.name} — ${m.category} metric`}
              >
                <div className={styles.cardHead}>
                  <span className={styles.name}>{m.name}</span>
                  <span className={styles.badges}>
                    <span className={styles.badge} data-testid="metric-category">
                      {m.category}
                    </span>
                    <span className={styles.badge} data-testid="metric-unit">
                      {m.unit}
                    </span>
                  </span>
                </div>
                {m.description && <p className={styles.description}>{m.description}</p>}
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Formula</span>
                  <p className={styles.formula} data-testid="metric-formula">
                    {m.formula}
                  </p>
                </div>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Benchmark</span>
                  <p className={styles.benchmark} data-testid="metric-benchmark">
                    {m.benchmark}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </ViewRegion>
  );
}
