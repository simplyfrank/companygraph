import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import styles from "./Settings.module.css";

// cto-analytics FR-04 / FR-11 (T-10) — analytics settings pane.
//
// Read-only display of the complexity-score weights. Per RD-6 §10.2 the
// runtime-tunable `analytics_settings` subsystem (`GET`/`PATCH /settings` +
// audit) is DEFERRED with FR-11 to the follow-up spec `cto-analytics-reporting`.
// Until then the weights are **code-default constants** (all 1.0), served
// read-only by T-14's scaffold at `GET /api/v1/analytics/config` and mirrored
// here. This pane renders them so the operator can see exactly what the
// canonical `depth × distinct-systems × distinct-roles` score (T-10) is
// computed with — it does NOT let the operator change them yet.
//
// These constants MUST stay in step with `api/src/analytics/routes.ts`
// `ANALYTICS_COMPLEXITY_WEIGHTS` (design §10.2). They are duplicated (not
// fetched) so this pane is a pure, self-contained view: the values are frozen
// code-defaults, not runtime state.

/** The code-default complexity weights (RD-6 §10.2 — all 1.0). */
export const COMPLEXITY_WEIGHT_DEFAULTS = {
  depth_weight: 1.0,
  system_weight: 1.0,
  role_weight: 1.0,
} as const;

interface WeightRow {
  key: string;
  factor: string;
  value: number;
}

const WEIGHT_ROWS: WeightRow[] = [
  { key: "depth_weight", factor: "PRECEDES chain depth", value: COMPLEXITY_WEIGHT_DEFAULTS.depth_weight },
  { key: "system_weight", factor: "distinct systems (USES_SYSTEM)", value: COMPLEXITY_WEIGHT_DEFAULTS.system_weight },
  { key: "role_weight", factor: "distinct roles (EXECUTES)", value: COMPLEXITY_WEIGHT_DEFAULTS.role_weight },
];

export function AnalyticsSettings() {
  return (
    <div className={styles.pane} data-testid="analytics-settings">
      <Card title="Complexity score weights">
        <p className={styles.note}>
          Each per-journey complexity score is{" "}
          <code className={styles.formula}>
            depth·w<sub>d</sub> × systems·w<sub>s</sub> × roles·w<sub>r</sub>
          </code>
          . The three weights below default to{" "}
          <span data-testid="weights-default">1.0</span> each.
        </p>
        <DataTable
          columns={[
            { id: "factor", label: "factor", kind: "text" },
            { id: "key", label: "key", kind: "id" },
            { id: "value", label: "weight", kind: "num", align: "right" },
          ]}
          rows={WEIGHT_ROWS.map((w) => ({
            factor: w.factor,
            key: <span data-weight-key={w.key}>{w.key}</span>,
            value: (
              <span data-testid={`weight-${w.key}`}>
                <Pill tone="accent">{w.value.toFixed(1)}</Pill>
              </span>
            ),
          }))}
        />
        <p className={styles.deferred} data-testid="weights-readonly-notice">
          Weights are read-only in this release. Runtime tuning + an audit trail
          land with the analytics settings subsystem in the follow-up spec{" "}
          <code>cto-analytics-reporting</code>.
        </p>
      </Card>
    </div>
  );
}
