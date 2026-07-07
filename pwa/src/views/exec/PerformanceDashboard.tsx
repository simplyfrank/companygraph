// kpi-okr-performance-dashboards T-14 (design §6) — the #/insights/performance
// executive performance-control surface (blueprint round-4 View Tree,
// verbatim). PURE RENDERER: every verdict is computed server-side by the
// /api/v1/analytics/performance/* aggregates (DD-02); this view is
// display + link-out only — commit/approve/reject stay in RollDown.tsx.
//
// URL-first slice state (FR-04, UX-06): the active domain/journey/kind
// come from route.params (central hash parse); slice changes rewrite
// location.hash via toHash — the same pattern #/explorer/systems?kind=
// uses. Unknown/absent params fall back to `All` on that axis.
//
// N-04 (pinned): /okr's ?domain narrows DIRECTIVES only — the per-domain
// assignment columns are consumed as-is, never re-filtered client-side.
//
// The app shell provides the <main> landmark (pwa/src/App.tsx) — this
// view does NOT render its own (AC-11 manual leg checks the landmark).

import { useState } from "react";
import {
  SYSTEM_KINDS,
  SYSTEM_KIND_LABELS,
  type SystemKind,
} from "@companygraph/shared/schema/system-kind";
import {
  api,
  type KpiStatusResponse,
  type OkrPerformanceResponse,
  type JourneyAxisResponse,
  type DomainRow,
} from "../../api";
import { useFetch } from "../../useFetch";
import type { Route } from "../../route";
import { toHash } from "../../route";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Pill } from "../../components/Pill";
import { KpiCard, LineChartCard } from "../../components/charts";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./PerformanceDashboard.module.css";

type KpiStatusValue = "on_target" | "warning" | "breach" | "no_data";

// Status is text + tone, never color alone (AC-11/UX-05).
const STATUS_LABELS: Record<KpiStatusValue, string> = {
  on_target: "On target",
  warning: "Warning",
  breach: "Breach",
  no_data: "No data",
};
const STATUS_TONES: Record<KpiStatusValue, "good" | "warn" | "danger" | "neutral"> = {
  on_target: "good",
  warning: "warn",
  breach: "danger",
  no_data: "neutral",
};

// FR-03: display mapping ONLY — the stored/tested contract stays the
// four as-built literals (pending|committed|approved|rejected);
// `pending` MAY display as "Awaiting".
const ASSIGNMENT_LABELS: Record<string, string> = {
  pending: "Awaiting",
  committed: "Committed",
  approved: "Approved",
  rejected: "Rejected",
};
const ASSIGNMENT_TONES: Record<string, "good" | "warn" | "danger" | "neutral" | "accent"> = {
  pending: "neutral",
  committed: "accent",
  approved: "good",
  rejected: "danger",
};

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Unknown/absent params → `All` on that axis (design §6). Malformed
// domain/journey ids are treated as absent so a bad deep link never
// turns into a hard-validated 400 from the aggregates.
function sliceFromRoute(route: Route): { domain?: string; journey?: string; kind?: SystemKind } {
  const out: { domain?: string; journey?: string; kind?: SystemKind } = {};
  if (route.params.domain && UUID_RE.test(route.params.domain)) out.domain = route.params.domain;
  if (route.params.journey && UUID_RE.test(route.params.journey)) out.journey = route.params.journey;
  if ((SYSTEM_KINDS as readonly string[]).includes(route.params.kind ?? "")) {
    out.kind = route.params.kind as SystemKind;
  }
  return out;
}

interface TrendResponse {
  measurements: Array<{ id: string; measured_at: string; value: number }>;
}

const KIND_OPTIONS: ReadonlyArray<{ kind: SystemKind | null; label: string }> = [
  { kind: null, label: "All" },
  ...SYSTEM_KINDS.map((k) => ({ kind: k as SystemKind, label: SYSTEM_KIND_LABELS[k] })),
];

export function PerformanceDashboard({ route }: { route: Route }) {
  const slice = sliceFromRoute(route);
  const [selectedKpi, setSelectedKpi] = useState<{ id: string; name: string } | null>(null);

  // URL-first slice rewrites (AC-07/AC-12) — hash change, no full
  // navigation; changing domain drops a now-stale journey selection.
  const setAxis = (axis: "domain" | "journey" | "kind", value: string | null) => {
    const params: Record<string, string> = {};
    if (slice.domain) params.domain = slice.domain;
    if (slice.journey) params.journey = slice.journey;
    if (slice.kind) params.kind = slice.kind;
    if (value) params[axis] = value;
    else delete params[axis];
    if (axis === "domain") delete params.journey;
    location.hash = toHash({ surface: "insights", tab: "performance" }, params);
  };

  // DD-08: ready state is O(1) fetches — the three aggregates + the
  // domain axis; the sparkline is lazy (below), no per-KPI fan-out.
  const domainsFetch = useFetch<{ rows: DomainRow[] }>((s) => api.domains.list(s), []);
  const kpisFetch = useFetch<KpiStatusResponse>(
    (s) => api.performance.kpis(slice, s),
    [slice.domain, slice.journey, slice.kind],
  );
  const okrFetch = useFetch<OkrPerformanceResponse>(
    (s) => api.performance.okr(slice.domain, s),
    [slice.domain],
  );
  const journeysFetch = useFetch<JourneyAxisResponse>(
    (s) => (slice.domain ? api.performance.journeys(slice.domain, s) : Promise.resolve({ rows: [] })),
    [slice.domain],
  );

  // Lazy selected-KPI sparkline (DD-08): one kpi-trends fetch on expand.
  const trendFetch = useFetch<TrendResponse | null>(
    async (s) => {
      if (!selectedKpi) return null;
      const res = await fetch(`/api/v1/kpi-trends/${encodeURIComponent(selectedKpi.id)}`, {
        signal: s,
      });
      if (!res.ok) throw new Error(`${res.status} kpi-trends`);
      return (await res.json()) as TrendResponse;
    },
    [selectedKpi?.id],
  );

  const anySliceActive = Boolean(slice.domain || slice.journey || slice.kind);

  // UX-01 states: loading / error / empty variants / ready.
  if (kpisFetch.status === "loading" || okrFetch.status === "loading" || domainsFetch.status === "loading") {
    return (
      <>
        <Header />
        <Loading what="performance" />
      </>
    );
  }
  if (kpisFetch.status === "error") return <><Header /><ErrorState message={kpisFetch.error} /></>;
  if (okrFetch.status === "error") return <><Header /><ErrorState message={okrFetch.error} /></>;
  if (domainsFetch.status === "error") return <><Header /><ErrorState message={domainsFetch.error} /></>;

  const kpiRows = kpisFetch.data.rows;
  const okrRows = okrFetch.data.rows;
  const domains = domainsFetch.data.rows;
  const journeys = journeysFetch.status === "ok" ? journeysFetch.data.rows : [];

  return (
    <>
      <Header />

      {/* Slicer — domain select, journey select (disabled until a domain
          is chosen), systemKind button group (UX-05: native controls,
          focus order = DOM order, active kind exposes aria-pressed). */}
      <div className={styles.slicer}>
        <label className={styles.axis}>
          <span className={styles.axisLabel}>Domain</span>
          <select
            className={styles.select}
            value={slice.domain ?? ""}
            onChange={(e) => setAxis("domain", e.target.value || null)}
          >
            <option value="">All</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className={styles.axis}>
          <span className={styles.axisLabel}>Journey</span>
          <select
            className={styles.select}
            value={slice.journey ?? ""}
            onChange={(e) => setAxis("journey", e.target.value || null)}
            disabled={!slice.domain}
          >
            <option value="">All</option>
            {journeys.map((j) => (
              <option key={j.id} value={j.id}>{j.name}</option>
            ))}
          </select>
        </label>
        <div role="group" aria-label="Filter by system kind" className={styles.kindGroup}>
          {KIND_OPTIONS.map((opt) => {
            const active = (slice.kind ?? null) === opt.kind;
            return (
              <Button
                key={opt.label}
                tone={active ? "primary" : "ghost"}
                pressed={active}
                onClick={() => setAxis("kind", opt.kind)}
              >
                {opt.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* KPI status panel (FR-02/FR-05) */}
      {kpiRows.length === 0 ? (
        anySliceActive ? (
          <Card>
            <div className={styles.empty} data-testid="empty-slice">
              <p>No KPIs match this slice.</p>
              <div className={styles.clearRow}>
                {slice.domain && (
                  <Button onClick={() => setAxis("domain", null)}>Clear domain filter</Button>
                )}
                {slice.journey && (
                  <Button onClick={() => setAxis("journey", null)}>Clear journey filter</Button>
                )}
                {slice.kind && (
                  <Button onClick={() => setAxis("kind", null)}>Clear kind filter</Button>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <div className={styles.empty} data-testid="empty-no-kpis">
              <p>No KPIs yet.</p>
              <p className={styles.emptyHint}>
                Create KPIs under <a href="#/govern/kpi-management">KPI Management</a> to see
                portfolio status here.
              </p>
            </div>
          </Card>
        )
      ) : (
        <section aria-label="KPI status" className={styles.section}>
          <div className={styles.kpiGrid}>
            {kpiRows.map((row) => {
              const status = row.status as KpiStatusValue;
              return (
                <button
                  key={row.kpi_id}
                  type="button"
                  className={styles.kpiButton}
                  onClick={() =>
                    setSelectedKpi(
                      selectedKpi?.id === row.kpi_id ? null : { id: row.kpi_id, name: row.name },
                    )
                  }
                  aria-pressed={selectedKpi?.id === row.kpi_id}
                >
                  <KpiCard
                    label={row.name}
                    value={
                      row.latest_value === null
                        ? "—"
                        : `${row.latest_value}${row.unit ? ` ${row.unit}` : ""}`
                    }
                    caption={row.target_value === null ? undefined : `Target ${row.target_value}`}
                    tone={STATUS_TONES[status]}
                  />
                  <Pill tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Pill>
                </button>
              );
            })}
          </div>

          {/* Lazy trend sparkline for the selected KPI (DD-08) */}
          {selectedKpi && trendFetch.status === "loading" && <Loading what="trend" />}
          {selectedKpi && trendFetch.status === "error" && (
            <ErrorState message={trendFetch.error} />
          )}
          {selectedKpi && trendFetch.status === "ok" && trendFetch.data && (
            <LineChartCard
              title={`Trend — ${selectedKpi.name}`}
              data={trendFetch.data.measurements.map((m) => ({
                label: m.measured_at.slice(0, 10),
                value: m.value,
              }))}
            />
          )}
        </section>
      )}

      {/* OKR roll-down performance panel (FR-03/FR-07) — display +
          link-out only, no mutation. */}
      <section aria-label="OKR roll-down performance" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>OKR roll-down</h2>
          <Button href="#/govern/okr-management">Open OKR Management</Button>
        </div>
        {okrRows.length === 0 ? (
          <Card>
            <div className={styles.empty} data-testid="empty-okr">No OKR directives in scope.</div>
          </Card>
        ) : (
          okrRows.map((dir) => (
            <Card key={dir.directive_id} title={dir.directive_name}>
              <div className={styles.okrBody}>
                {dir.key_results.length > 0 && (
                  <ul className={styles.krList}>
                    {dir.key_results.map((kr) => (
                      <li key={kr.id} className={styles.krRow}>
                        <span>{kr.name}</span>
                        <span className={styles.krProgress}>
                          {kr.progress === null ? "no progress recorded" : `${kr.progress}%`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {dir.domains.length === 0 ? (
                  <p className={styles.emptyHint}>Not rolled down to any domain.</p>
                ) : (
                  <ul className={styles.domainList}>
                    {dir.domains.map((d, i) => (
                      <li key={`${d.domain_id}-${i}`} className={styles.domainRow}>
                        <span>{d.domain_name ?? d.domain_id}</span>
                        <Pill tone={ASSIGNMENT_TONES[d.status] ?? "neutral"}>
                          {ASSIGNMENT_LABELS[d.status] ?? d.status}
                        </Pill>
                        {d.weight !== null && (
                          <span className={styles.weight}>weight {d.weight}</span>
                        )}
                        {d.adjustment_requested && (
                          <Pill tone="warn">Adjustment requested</Pill>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          ))
        )}
      </section>
    </>
  );
}

function Header() {
  return (
    <ViewHeader
      title="Performance"
      lede="KPI target/breach status, trends, and OKR roll-down performance — sliceable by domain, journey, and system kind. Read-only: manage KPIs and OKRs from their management tabs."
    />
  );
}
