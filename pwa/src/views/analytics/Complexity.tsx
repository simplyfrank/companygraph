import { useRef, useState } from "react";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { BarChartCard } from "../../components/charts";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import { AnalyticsSettings, COMPLEXITY_WEIGHT_DEFAULTS } from "./Settings";
import styles from "./Complexity.module.css";

// cto-analytics FR-04 / T-10 — canonical weighted complexity score (RD-2).
//
// score = depth·w_d × distinctSystems·w_s × distinctRoles·w_r
//   • depth           = longest acyclic PRECEDES chain among the journey's
//                       activities (bounded PRECEDES*0..19, matching the server
//                       engine `api/src/analytics/complexity.ts` depth cap),
//   • distinctSystems = distinct System nodes the activities USES_SYSTEM,
//   • distinctRoles   = distinct Role nodes that EXECUTES the activities.
//
// Weights are code-default constants (all 1.0, RD-6 §10.2) — the tunable
// settings subsystem is deferred to `cto-analytics-reporting`. This replaces
// the interim DD-04 proxy (`activities + fanOut + fanIn`).
//
// Data source (DD-01, mirrors SingleSystem T-11 / Consolidation T-09 / Matrix
// T-08): the view rides the ratified `POST /api/v1/query/cypher` passthrough
// client-side. The server-side FR-04 engine backs `GET /api/v1/analytics/
// complexity` and is covered by the engine's own unit tests.
//
// AC-04: hovering (mouse) or long-pressing (touch — 500 ms, the FR-04 Native
// Conflicts suppression this task owns) a score reveals the formula + the three
// component sub-scores.
//
// RD-5: chart colors are `var(--…)` tokens (the monochromatic accent ramp),
// never hardcoded hex.

interface ComplexRow {
  journey: { id: string; name: string };
  depth: number;
  systems: number;
  roles: number;
}

const W = COMPLEXITY_WEIGHT_DEFAULTS;

// Weighted canonical score for a row (RD-2). Kept in one place so the table,
// histogram, and popover agree.
function scoreOf(r: ComplexRow): number {
  return (
    r.depth * W.depth_weight *
    r.systems * W.system_weight *
    r.roles * W.role_weight
  );
}

// Four ordered severity buckets, colored with the monochromatic accent ramp
// (RD-5 — no hardcoded hex; shades-of-the-accent per the project color rule).
const BUCKETS = [
  { label: "low (≤2)",       max: 2,        color: "var(--accent-300)" },
  { label: "med (3-6)",      max: 6,        color: "var(--accent-500)" },
  { label: "high (7-12)",    max: 12,       color: "var(--accent-700)" },
  { label: "very high (>12)", max: Infinity, color: "var(--accent-900)" },
] as const;

function bucketOf(score: number): (typeof BUCKETS)[number] {
  return BUCKETS.find((b) => score <= b.max) ?? BUCKETS[BUCKETS.length - 1]!;
}

const LONG_PRESS_MS = 500;

export function AnalyticsComplexity() {
  const data = useFetch(
    () =>
      api.cypher(`
        MATCH (j:UserJourney)
        OPTIONAL MATCH (a:Activity)-[:PART_OF]->(j)
        WITH j, collect(DISTINCT a) AS acts
        // depth: longest acyclic PRECEDES chain length among the journey's
        // activities (bounded 0..19; +1 so a lone activity has depth 1).
        CALL {
          WITH j, acts
          UNWIND acts AS a
          OPTIONAL MATCH p = (a)-[:PRECEDES*0..19]->(b:Activity)
          WHERE a IN acts AND b IN acts AND all(n IN nodes(p) WHERE n IN acts)
          RETURN coalesce(max(length(p)), 0) + 1 AS depth
        }
        // distinct systems + roles across the journey's activities.
        CALL {
          WITH acts
          UNWIND acts AS a
          OPTIONAL MATCH (a)-[:USES_SYSTEM]->(s:System)
          RETURN count(DISTINCT s) AS systems
        }
        CALL {
          WITH acts
          UNWIND acts AS a
          OPTIONAL MATCH (r:Role)-[:EXECUTES]->(a)
          RETURN count(DISTINCT r) AS roles
        }
        WITH j, CASE WHEN size(acts) = 0 THEN 0 ELSE depth END AS depth, systems, roles
        RETURN j{.id, .name} AS journey, depth, systems, roles
        ORDER BY depth * systems * roles DESC, j.name
        LIMIT 1001
      `),
    [],
  );

  // The sub-score popover (AC-04): open on hover (mouse) or long-press (touch).
  const [openId, setOpenId] = useState<string | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLongPress = (id: string) => {
    if (longPress.current) clearTimeout(longPress.current);
    longPress.current = setTimeout(() => setOpenId(id), LONG_PRESS_MS);
  };
  const cancelLongPress = () => {
    if (longPress.current) {
      clearTimeout(longPress.current);
      longPress.current = null;
    }
  };

  const rows = data.status === "ok" ? (data.data.rows as unknown as ComplexRow[]) : [];

  const histogram = BUCKETS.map((b) => ({
    label: b.label,
    value: rows.filter((r) => bucketOf(scoreOf(r)) === b).length,
    color: b.color,
  }));

  return (
    <>
      <ViewHeader
        title="Journey complexity"
        lede="Canonical complexity score per journey — PRECEDES chain depth × distinct systems × distinct roles (weights default 1.0). Hover or long-press a score to see the formula and its three components."
      />

      <div className={styles.dashboardGrid}>
        <BarChartCard
          title="Complexity distribution"
          data={histogram}
          yLabel="journeys"
        />
      </div>

      <div style={{ height: 24 }} />

      <Card>
        {data.status === "loading" && <Loading what="complexity" />}
        {data.status === "error" && <ErrorState message={data.error} />}
        {data.status === "ok" && (
          <DataTable
            columns={[
              { id: "name",    label: "journey", kind: "text" },
              { id: "depth",   label: "depth", kind: "num", align: "right" },
              { id: "systems", label: "systems", kind: "num", align: "right" },
              { id: "roles",   label: "roles", kind: "num", align: "right" },
              { id: "score",   label: "score", kind: "text" },
              { id: "id",      label: "id", kind: "id" },
            ]}
            rows={rows.map((r) => {
              const score = scoreOf(r);
              const tone = score > 12 ? "danger" : score > 6 ? "warn" : score > 2 ? "accent" : "good";
              const id = r.journey.id;
              return {
                name: r.journey.name,
                depth: r.depth,
                systems: r.systems,
                roles: r.roles,
                score: (
                  <span
                    className={styles.scoreCell}
                    data-testid="complexity-score"
                    data-journey-id={id}
                    tabIndex={0}
                    onMouseEnter={() => setOpenId(id)}
                    onMouseLeave={() => setOpenId((cur) => (cur === id ? null : cur))}
                    onFocus={() => setOpenId(id)}
                    onBlur={() => setOpenId((cur) => (cur === id ? null : cur))}
                    onTouchStart={() => startLongPress(id)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                  >
                    <Pill tone={tone}>{score}</Pill>
                    {openId === id && (
                      <span className={styles.popover} role="tooltip" data-testid="complexity-popover">
                        <span className={styles.formula}>
                          depth × systems × roles
                        </span>
                        <span className={styles.sub} data-testid="popover-depth">
                          depth {r.depth} × w<sub>d</sub> {W.depth_weight.toFixed(1)}
                        </span>
                        <span className={styles.sub} data-testid="popover-systems">
                          systems {r.systems} × w<sub>s</sub> {W.system_weight.toFixed(1)}
                        </span>
                        <span className={styles.sub} data-testid="popover-roles">
                          roles {r.roles} × w<sub>r</sub> {W.role_weight.toFixed(1)}
                        </span>
                        <span className={styles.total} data-testid="popover-total">
                          = {score}
                        </span>
                      </span>
                    )}
                  </span>
                ),
                id: id.slice(0, 8) + "…",
              };
            })}
          />
        )}
      </Card>

      <div style={{ height: 24 }} />

      {/* FR-04 / FR-11 read-only weights pane (RD-6 §10.2). Embedded here
          because the `#/analytics/settings` tab registration lives in files
          owned by other tasks; the pane is still reachable and shows the
          code-default weights the score above is computed with. */}
      <AnalyticsSettings />
    </>
  );
}
