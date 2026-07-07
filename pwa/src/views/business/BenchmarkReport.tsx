// function-benchmark-scoring T-09 (design §4.7 — FR-10, FR-11, FR-12,
// NFR-07, UX-01/02/05/06; AC-10..AC-15). The read-only per-function
// maturity report at #/business/benchmarks.
//
// Built on the FunctionMap.tsx precedent: consumes useActiveModel() (never
// re-implemented) for header context; the report itself is root-fixed
// server-side (FR-07), so this view just fetches api.benchmarkReport().
//
// Four states from the catalog (_shared): loading / empty / error / ready
// (UX-01). Descriptive-only (XD-11): scores + evidence, NO recommendation
// UI. Tokens-only + catalog-first (UX-02, NFR-07). Keyboard-activatable
// drill-down (<button aria-expanded>) + native deep-link anchors (FR-12).

import { useState, useCallback, useEffect } from "react";
import type { Route } from "../../route";
import { toHash } from "../../route";
import { api } from "../../api";
import { useActiveModel } from "../../context/ActiveModelContext";
import { ViewRegion, ViewHeader, Loading, EmptyState, ErrorState } from "../_shared";
import type { BenchmarkReport as BenchmarkReportData } from "@companygraph/shared/schema/function-benchmark";
import { SYSTEM_KINDS, SYSTEM_KIND_LABELS } from "@companygraph/shared/schema/system-kind";
import styles from "./BenchmarkReport.module.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; report: BenchmarkReportData }
  | { status: "error"; message: string };

function pct(v: number | null): string {
  return v === null ? "n/a" : `${Math.round(v * 100)}%`;
}

export function BenchmarkReport(_props: { route: Route }) {
  const { status: modelStatus } = useActiveModel();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const report = await api.benchmarkReport();
      setState({ status: "ready", report });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback((seedKey: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(seedKey)) next.delete(seedKey);
      else next.add(seedKey);
      return next;
    });
  }, []);

  return (
    <ViewRegion label="Benchmark report">
      <ViewHeader
        title="Function benchmarks"
        lede="Descriptive maturity scores for the six operator functions: metric-vs-benchmark, key-activity coverage, and system-augmentation level. Read-only."
      />

      {(modelStatus === "loading" || state.status === "loading") && (
        <Loading what="benchmark report" />
      )}

      {modelStatus !== "loading" && state.status === "error" && (
        <ErrorState message={state.message} onRetry={() => void load()} />
      )}

      {modelStatus !== "loading" &&
        state.status === "ready" &&
        state.report.meta.functionCount === 0 && (
          <div data-testid="benchmark-empty">
            <EmptyState what="function benchmarks" />
            <p className={styles.hint}>
              Run <code>bun run seed:saas-operator</code> to seed the operator
              functions, then reload.
            </p>
          </div>
        )}

      {modelStatus !== "loading" &&
        state.status === "ready" &&
        state.report.meta.functionCount > 0 && (
          <div className={styles.grid} data-testid="benchmark-grid">
            {state.report.functions.map((fn) => {
              const isOpen = expanded.has(fn.seedKey);
              const panelId = `bench-panel-${fn.seedKey}`;
              return (
                <section key={fn.seedKey} className={styles.card} data-testid="benchmark-card">
                  <div className={styles.cardHead}>
                    <a
                      className={styles.name}
                      href={toHash({
                        surface: "explorer",
                        tab: "domain-detail",
                        entityId: fn.domainId,
                      })}
                      data-testid="benchmark-domain-link"
                    >
                      {fn.name}
                    </a>
                    <span className={styles.composite} data-testid="benchmark-composite">
                      {pct(fn.composite)}
                    </span>
                  </div>

                  <dl className={styles.subScores}>
                    <div className={styles.subScore}>
                      <dt className={styles.subLabel}>Metric vs benchmark</dt>
                      <dd className={styles.subValue}>
                        {fn.metricBenchmark.metricGrounded ? pct(fn.metricBenchmark.score) : "n/a"}
                        {!fn.metricBenchmark.metricGrounded && (
                          <span className={styles.flag}> not grounded</span>
                        )}
                      </dd>
                    </div>
                    <div className={styles.subScore}>
                      <dt className={styles.subLabel}>Coverage</dt>
                      <dd className={styles.subValue}>
                        {pct(fn.coverage.score)}
                        {fn.coverage.unmodeled && <span className={styles.flag}> unmodeled</span>}
                      </dd>
                    </div>
                    <div className={styles.subScore}>
                      <dt className={styles.subLabel}>Automation</dt>
                      <dd className={styles.subValue}>{pct(fn.automation.score)}</dd>
                    </div>
                  </dl>

                  <button
                    type="button"
                    className={styles.expander}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(fn.seedKey)}
                    data-testid="benchmark-expander"
                  >
                    {isOpen ? "Hide evidence" : "Show evidence"}
                  </button>

                  {isOpen && (
                    <div id={panelId} className={styles.evidence} data-testid="benchmark-evidence">
                      <h4 className={styles.evLabel}>Metric-grounded KPIs</h4>
                      {fn.metricBenchmark.kpis.length === 0 ? (
                        <p className={styles.muted}>No metric-grounded KPIs.</p>
                      ) : (
                        <ul className={styles.kpiList}>
                          {fn.metricBenchmark.kpis.map((k) => (
                            <li key={k.kpi_id} className={styles.kpiRow}>
                              <a
                                className={styles.kpiLink}
                                href={toHash({
                                  surface: "explorer",
                                  tab: "domain-detail",
                                  entityId: k.kpi_id,
                                })}
                                data-testid="benchmark-kpi-link"
                              >
                                {k.name}
                              </a>
                              <span className={styles.verdict}>{k.verdict}</span>
                              {k.benchmarkProse && (
                                <span className={styles.prose}>{k.benchmarkProse}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      <h4 className={styles.evLabel}>Coverage ratios</h4>
                      <ul className={styles.ratioList}>
                        <li>Role: {pct(fn.coverage.roleRatio)}</li>
                        <li>System: {pct(fn.coverage.systemRatio)}</li>
                        <li>KPI: {pct(fn.coverage.kpiRatio)}</li>
                        <li>
                          Marked-key:{" "}
                          {fn.coverage.keyMarked
                            ? pct(fn.coverage.markedKeyCoveredRatio)
                            : "n/a (none marked)"}
                        </li>
                      </ul>

                      <h4 className={styles.evLabel}>Augmentation by system kind</h4>
                      <ul className={styles.ratioList}>
                        {SYSTEM_KINDS.map((kind) => (
                          <li key={kind}>
                            {SYSTEM_KIND_LABELS[kind]}: {fn.automation.byKind[kind] ?? 0}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
    </ViewRegion>
  );
}
