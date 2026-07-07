// cross-function-exec-rollup T-12 (design §7) — the #/insights/operator operator
// cockpit: a read-only cross-function rollup (KPI health, risk heatmap,
// funnel status, SLA rollup) over the SaaS-Operator root, sliceable by
// function. PURE RENDERER: every aggregate is computed server-side by the
// /api/v1/analytics/operator/* reads (XD-08); this view is display +
// link-out only — no create/edit/write control.
//
// URL-first slice state (FR-11, UX-06): the active function comes from
// route.params.function (central hash parse); the slicer rewrites
// location.hash. Unknown/absent → all six functions (DD-13).
//
// The app shell provides the <main> landmark (pwa/src/App.tsx); each panel
// is wrapped in a ViewRegion (ARIA region landmark, AC-17).

import { useState } from "react";
import {
  operatorFunctionEnum,
  type OperatorFunction,
} from "@companygraph/shared/schema/operator";
import {
  api,
  type OperatorOverviewResponse,
  type OperatorKpisResponse,
  type OperatorRisksResponse,
  type OperatorFunnelsResponse,
  type OperatorSlasResponse,
} from "../../api";
import { useFetch } from "../../useFetch";
import type { Route } from "../../route";
import { toHash } from "../../route";
import { useActiveModel } from "../../context/ActiveModelContext";
import { ViewHeader, ViewRegion, Loading, EmptyState, ErrorState } from "../_shared";
import styles from "./OperatorCockpit.module.css";

const FUNCTION_LABELS: Record<OperatorFunction, string> = {
  marketing: "Marketing",
  sales: "Sales",
  finance_accounting: "Finance & Accounting",
  customer_success: "Customer Success",
  product_delivery: "Product & Delivery",
  platform_ops: "Platform Ops",
};
const FUNCTION_ORDER = operatorFunctionEnum.options as readonly OperatorFunction[];

// DD-13: validate route.params.function against the six seedKeys; unknown →
// undefined (all six).
export function functionFromRoute(route: Route): OperatorFunction | undefined {
  const raw = route.params.function;
  const parsed = operatorFunctionEnum.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

type SignalErr = { error: true };
function isErr(v: unknown): v is SignalErr {
  return typeof v === "object" && v !== null && (v as { error?: unknown }).error === true;
}

export function OperatorCockpit({ route }: { route: Route }) {
  const slice = functionFromRoute(route);
  // Header context (default SaaS-Operator root) — consumed, never re-implemented.
  const { activeModel } = useActiveModel();
  const [drill, setDrill] = useState<null | "kpis" | "risks" | "funnels" | "slas">(null);
  // Retry affordance (AC-15): a bump forces the overview fetch to re-run
  // (useFetch re-runs when a dep changes — the hook exposes no reload seam).
  const [reloadKey, setReloadKey] = useState(0);
  const refetch = () => setReloadKey((k) => k + 1);

  const overviewFetch = useFetch<OperatorOverviewResponse>(
    (s) => api.operator.overview(slice, s),
    [slice, reloadKey],
  );

  // URL-first slice rewrite (FR-11/AC-18) — hash change, no full navigation.
  const setSlice = (fn: OperatorFunction | null) => {
    const params: Record<string, string> = {};
    if (fn) params.function = fn;
    // Canonical route is #/insights/operator (nav-IA restructure 2026-07-07);
    // the former #/exec/operator is a redirect alias only.
    location.hash = toHash({ surface: "insights", tab: "operator" }, params);
  };

  if (overviewFetch.status === "loading") {
    return (
      <>
        <Header modelName={activeModel?.name} />
        <Loading what="operator cockpit" />
      </>
    );
  }
  if (overviewFetch.status === "error") {
    return (
      <>
        <Header modelName={activeModel?.name} />
        <ErrorState message={overviewFetch.error} onRetry={refetch} />
      </>
    );
  }

  const overview = overviewFetch.data;
  const rows = overview.functions;
  const allEmpty =
    rows.length === 0 ||
    rows.every(
      (r) =>
        !isErr(r.kpiHealth) &&
        r.kpiHealth.on_target + r.kpiHealth.warning + r.kpiHealth.breach + r.kpiHealth.no_data === 0 &&
        !isErr(r.riskHeatmap) &&
        r.riskHeatmap.low + r.riskHeatmap.medium + r.riskHeatmap.high + r.riskHeatmap.critical === 0 &&
        !isErr(r.funnelCount) &&
        r.funnelCount === 0 &&
        !isErr(r.slaHealth) &&
        r.slaHealth.within_target + r.slaHealth.at_risk + r.slaHealth.breached === 0,
    );

  if (allEmpty) {
    return (
      <>
        <Header modelName={activeModel?.name} />
        <div className={styles.emptyWrap} data-testid="cockpit-empty">
          <EmptyState what="cross-function content" />
          <p className={styles.emptyHint}>
            Seed the operator model with <code>bun run seed:saas-operator</code> plus the six
            content seeds to populate cross-function health.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header modelName={activeModel?.name} />

      {/* Function slicer (FR-11) — URL-first, standard controls, no drag. */}
      <div className={styles.slicer} role="group" aria-label="Filter by function">
        <button
          type="button"
          className={styles.sliceBtn}
          aria-pressed={slice === undefined}
          data-active={slice === undefined}
          onClick={() => setSlice(null)}
        >
          All functions
        </button>
        {FUNCTION_ORDER.map((fn) => (
          <button
            key={fn}
            type="button"
            className={styles.sliceBtn}
            aria-pressed={slice === fn}
            data-active={slice === fn}
            onClick={() => setSlice(fn)}
          >
            {FUNCTION_LABELS[fn]}
          </button>
        ))}
      </div>

      {/* KPI health panel */}
      <ViewRegion label="KPI health">
        <PanelHead title="KPI health" />
        <div className={styles.grid} data-testid="panel-kpis">
          {rows.map((r) => (
            <div key={r.function} className={styles.cell}>
              <a className={styles.cellHead} href="#/insights/performance" tabIndex={0}>
                {r.name}
              </a>
              {isErr(r.kpiHealth) ? (
                <InlinePanelError signal="kpis" onRetry={refetch} />
              ) : (
                <div className={styles.tally}>
                  <Tag tone="good" label="On target" n={r.kpiHealth.on_target} />
                  <Tag tone="warn" label="Warning" n={r.kpiHealth.warning} />
                  <Tag tone="danger" label="Breach" n={r.kpiHealth.breach} />
                  <Tag tone="muted" label="No data" n={r.kpiHealth.no_data} />
                </div>
              )}
            </div>
          ))}
        </div>
      </ViewRegion>

      {/* Risk heatmap panel */}
      <ViewRegion label="Risk heatmap">
        <PanelHead title="Risk heatmap" />
        <div className={styles.grid} data-testid="panel-risks">
          {rows.map((r) => (
            <div key={r.function} className={styles.cell}>
              <span className={styles.cellHead}>{r.name}</span>
              {isErr(r.riskHeatmap) ? (
                <InlinePanelError signal="risks" onRetry={refetch} />
              ) : (
                <div className={styles.tally}>
                  <Tag tone="muted" label="Low" n={r.riskHeatmap.low} />
                  <Tag tone="warn" label="Medium" n={r.riskHeatmap.medium} />
                  <Tag tone="danger" label="High" n={r.riskHeatmap.high} />
                  <Tag tone="danger" label="Critical" n={r.riskHeatmap.critical} />
                </div>
              )}
            </div>
          ))}
        </div>
      </ViewRegion>

      {/* Funnel status panel */}
      <ViewRegion label="Funnel status">
        <PanelHead title="Funnel status" />
        <div className={styles.grid} data-testid="panel-funnels">
          {rows.map((r) => (
            <div key={r.function} className={styles.cell}>
              <a className={styles.cellHead} href="#/insights/funnels" tabIndex={0}>
                {r.name}
              </a>
              {isErr(r.funnelCount) ? (
                <InlinePanelError signal="funnels" onRetry={refetch} />
              ) : (
                <span className={styles.metric}>{r.funnelCount} funnel(s)</span>
              )}
            </div>
          ))}
        </div>
      </ViewRegion>

      {/* SLA rollup panel */}
      <ViewRegion label="SLA rollup">
        <PanelHead title="SLA rollup" />
        <div className={styles.grid} data-testid="panel-slas">
          {rows.map((r) => (
            <div key={r.function} className={styles.cell}>
              <span className={styles.cellHead}>{r.name}</span>
              {isErr(r.slaHealth) ? (
                <InlinePanelError signal="slas" onRetry={refetch} />
              ) : (
                <div className={styles.tally}>
                  <Tag tone="good" label="Within target" n={r.slaHealth.within_target} />
                  <Tag tone="warn" label="At risk" n={r.slaHealth.at_risk} />
                  <Tag tone="danger" label="Breached" n={r.slaHealth.breached} />
                </div>
              )}
            </div>
          ))}
        </div>
      </ViewRegion>

      {/* Drill-in detail (unattributed groups surface here). */}
      <DrillIn slice={slice} drill={drill} setDrill={setDrill} />
    </>
  );
}

function DrillIn({
  slice,
  drill,
  setDrill,
}: {
  slice: OperatorFunction | undefined;
  drill: null | "kpis" | "risks" | "funnels" | "slas";
  setDrill: (d: null | "kpis" | "risks" | "funnels" | "slas") => void;
}) {
  return (
    <div className={styles.drillBar} role="group" aria-label="Drill-in detail">
      <span className={styles.drillLabel}>Detail:</span>
      {(["kpis", "risks", "funnels", "slas"] as const).map((d) => (
        <button
          key={d}
          type="button"
          className={styles.sliceBtn}
          aria-pressed={drill === d}
          data-active={drill === d}
          onClick={() => setDrill(drill === d ? null : d)}
        >
          {d}
        </button>
      ))}
      {drill === "funnels" && <FunnelDetail slice={slice} />}
      {drill === "slas" && <SlaDetail slice={slice} />}
      {drill === "kpis" && <KpiDetail slice={slice} />}
      {drill === "risks" && <RiskDetail slice={slice} />}
    </div>
  );
}

function KpiDetail({ slice }: { slice: OperatorFunction | undefined }) {
  const [k, setK] = useState(0);
  const fetchState = useFetch<OperatorKpisResponse>((s) => api.operator.kpis(slice, s), [slice, k]);
  if (fetchState.status === "loading") return <Loading what="KPI detail" />;
  if (fetchState.status === "error")
    return <ErrorState message={fetchState.error} onRetry={() => setK((x) => x + 1)} />;
  return (
    <div className={styles.detail} data-testid="detail-kpis">
      {fetchState.data.functions.map((fn) => (
        <div key={fn.function}>
          <strong>{fn.name}</strong>
          <ul>
            {fn.kpis.map((k) => (
              <li key={k.kpi_id}>
                {k.name} — {k.status}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function RiskDetail({ slice }: { slice: OperatorFunction | undefined }) {
  const [k, setK] = useState(0);
  const fetchState = useFetch<OperatorRisksResponse>((s) => api.operator.risks(slice, s), [slice, k]);
  if (fetchState.status === "loading") return <Loading what="risk detail" />;
  if (fetchState.status === "error")
    return <ErrorState message={fetchState.error} onRetry={() => setK((x) => x + 1)} />;
  return (
    <div className={styles.detail} data-testid="detail-risks">
      {fetchState.data.functions.map((fn) => (
        <div key={fn.function}>
          <strong>{fn.name}</strong>
          <ul>
            {fn.heatmap.rows.map((row) => (
              <li key={row.id}>
                {row.name} — L{row.likelihood}×I{row.impact} ({row.status})
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FunnelDetail({ slice }: { slice: OperatorFunction | undefined }) {
  const [k, setK] = useState(0);
  const fetchState = useFetch<OperatorFunnelsResponse>(
    (s) => api.operator.funnels(slice, s),
    [slice, k],
  );
  if (fetchState.status === "loading") return <Loading what="funnel detail" />;
  if (fetchState.status === "error")
    return <ErrorState message={fetchState.error} onRetry={() => setK((x) => x + 1)} />;
  const data = fetchState.data;
  return (
    <div className={styles.detail} data-testid="detail-funnels">
      {data.functions.map((fn) => (
        <div key={fn.function}>
          <strong>{fn.name}</strong>
          <ul>
            {fn.funnels.map((f) => (
              <li key={f.funnel_id}>
                <a href="#/insights/funnels">{f.name}</a> — {f.stageCount} stages, conversion{" "}
                {f.overallConversion === "n/a" ? "n/a" : `${Math.round(f.overallConversion * 100)}%`}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {/* N-02: unattributed as a trailing labelled group (all-functions view). */}
      {data.unattributed.length > 0 && (
        <div data-testid="funnel-unattributed">
          <strong>Unattributed</strong>
          <ul>
            {data.unattributed.map((f) => (
              <li key={f.funnel_id}>{f.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SlaDetail({ slice }: { slice: OperatorFunction | undefined }) {
  const [k, setK] = useState(0);
  const fetchState = useFetch<OperatorSlasResponse>((s) => api.operator.slas(slice, s), [slice, k]);
  if (fetchState.status === "loading") return <Loading what="SLA detail" />;
  if (fetchState.status === "error")
    return <ErrorState message={fetchState.error} onRetry={() => setK((x) => x + 1)} />;
  const data = fetchState.data;
  return (
    <div className={styles.detail} data-testid="detail-slas">
      {data.functions.map((fn) => (
        <div key={fn.function}>
          <strong>{fn.name}</strong>
          <ul>
            {fn.slas.map((s) => (
              <li key={s.sla_id}>
                {s.name} — {s.health}, {s.breachCount} breach(es)
              </li>
            ))}
          </ul>
        </div>
      ))}
      {data.unattributed.length > 0 && (
        <div data-testid="sla-unattributed">
          <strong>Unattributed</strong>
          <ul>
            {data.unattributed.map((s) => (
              <li key={s.sla_id}>{s.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PanelHead({ title }: { title: string }) {
  return <h2 className={styles.panelTitle}>{title}</h2>;
}

function InlinePanelError({ signal, onRetry }: { signal: string; onRetry: () => void }) {
  return (
    <div className={styles.panelErr} role="alert" data-testid={`panel-error-${signal}`}>
      <span>This signal is unavailable.</span>
      <button type="button" className={styles.retry} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

function Tag({
  tone,
  label,
  n,
}: {
  tone: "good" | "warn" | "danger" | "muted";
  label: string;
  n: number;
}) {
  return (
    <span className={styles.tag} data-tone={tone}>
      <span className={styles.tagLabel}>{label}</span>
      <span className={styles.tagNum}>{n}</span>
    </span>
  );
}

function Header({ modelName }: { modelName?: string }) {
  return (
    <ViewHeader
      title="Operator cockpit"
      lede={`Cross-function health across the SaaS-Operator functions${
        modelName ? ` — ${modelName}` : ""
      }: KPI status, risk heatmap, funnel status, and SLA rollup. Read-only — sliceable by function.`}
    />
  );
}
