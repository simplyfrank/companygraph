// saas-operator-foundation T-13 (design §6.4 + C-06/N-04/N-05 — FR-14, FR-15,
// NFR-06; AC-10..AC-15). The live per-function landing map at
// #/insights/functions.
//
// Subject — consumes useActiveModel() (never re-implemented) and resolves the
// SaaS-Operator root by the OQ-1 marker (name:"SaaS Operator" +
// attributes.saasOperatorRoot:true), defaulting to it even when the active
// model is something else (FR-15).
//
// Read — one POST /api/v1/query/cypher (runPassthrough, read-only, C-01)
// fetching the six IN_MODEL domains + a per-domain descendant count filtered
// to journeys/activities (C-03). Any failure maps to the error state (C-04).
//
// States (UX-01, catalog-first N-04/N-05) — Loading / EmptyState / ErrorState
// / ready grid, all from _shared.tsx; the root is the catalog ViewRegion
// landmark (N-04). Native anchors in DOM order → Tab reachable (AC-15).

import { useState, useCallback, useEffect } from "react";
import type { Route } from "../../route";
import { toHash } from "../../route";
import { api } from "../../api";
import { useActiveModel } from "../../context/ActiveModelContext";
import { ViewRegion, ViewHeader, Loading, EmptyState, ErrorState } from "../_shared";
import styles from "./FunctionMap.module.css";

const OPERATOR_ROOT_NAME = "SaaS Operator";
const OPERATOR_ROOT_MARKER = "saasOperatorRoot";

interface FunctionRow {
  id: string;
  name: string;
  description: string;
  journeyActivityCount: number;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; rows: FunctionRow[] }
  | { status: "error"; message: string };

const FUNCTION_QUERY = `
  MATCH (m:BusinessModel {id:$operatorRootId})
  MATCH (d:Domain)-[:IN_MODEL]->(m)
  OPTIONAL MATCH (d)<-[:PART_OF*1..]-(desc)
  WHERE desc:UserJourney OR desc:Activity
  WITH d, count(DISTINCT desc) AS journeyActivityCount
  RETURN d.id AS id, d.name AS name, d.description AS description,
         journeyActivityCount
  ORDER BY d.name`;

// Neo4j integer columns come back as {low, high} or number depending on the
// driver serialization; coerce defensively.
function toCount(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "low" in (v as Record<string, unknown>)) {
    return Number((v as { low: number }).low);
  }
  return Number(v ?? 0);
}

export function FunctionMap(_props: { route: Route }) {
  const { models, status: modelStatus } = useActiveModel();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  // Resolve the operator root from the shell model list by the OQ-1 marker
  // (default-to-operator regardless of the active model, FR-15).
  const operatorRoot =
    models.find(
      (m) =>
        m.name === OPERATOR_ROOT_NAME &&
        (m.attributes as Record<string, unknown>)?.[OPERATOR_ROOT_MARKER] === true,
    ) ?? null;

  const load = useCallback(async (rootId: string) => {
    setState({ status: "loading" });
    try {
      const res = await api.cypher(FUNCTION_QUERY, { operatorRootId: rootId });
      const rows: FunctionRow[] = res.rows.map((r) => ({
        id: String(r.id),
        name: String(r.name ?? ""),
        description: String(r.description ?? ""),
        journeyActivityCount: toCount(r.journeyActivityCount),
      }));
      setState({ status: "ready", rows });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    if (modelStatus !== "ready") return;
    if (!operatorRoot) {
      // The SaaS-Operator model has not been seeded yet — empty state prompt.
      setState({ status: "ready", rows: [] });
      return;
    }
    void load(operatorRoot.id);
  }, [modelStatus, operatorRoot, load]);

  return (
    <ViewRegion label="Function map">
      <ViewHeader
        title="Functions"
        lede="The six operator functions of the SaaS-Operator model. Open a function to explore its domain in Explorer."
      />
      {modelStatus === "loading" && <Loading what="functions" />}
      {modelStatus === "error" && (
        <ErrorState message="Could not load the model list." onRetry={undefined} />
      )}
      {modelStatus === "ready" && state.status === "loading" && <Loading what="functions" />}
      {modelStatus === "ready" && state.status === "error" && (
        <ErrorState
          message={state.message}
          onRetry={operatorRoot ? () => void load(operatorRoot.id) : undefined}
        />
      )}
      {modelStatus === "ready" && state.status === "ready" && state.rows.length === 0 && (
        <div data-testid="function-map-empty">
          <EmptyState what="function domains" />
          <p className={styles.description}>
            Run <code>bun run seed:saas-operator</code> to seed the operator
            functions.
          </p>
        </div>
      )}
      {modelStatus === "ready" && state.status === "ready" && state.rows.length > 0 && (
        <div className={styles.grid} data-testid="function-map-grid">
          {state.rows.map((fn) => (
            <a
              key={fn.id}
              className={styles.card}
              href={toHash({ surface: "explorer", tab: "domain-detail", entityId: fn.id })}
              data-testid="function-card"
            >
              <span className={styles.name}>{fn.name}</span>
              <span className={styles.description}>{fn.description}</span>
              <span className={styles.count}>
                <span className={styles.countValue} data-testid="function-count">
                  {fn.journeyActivityCount}
                </span>
                journeys &amp; activities
                {fn.journeyActivityCount === 0 && (
                  <span className={styles.countQualifier}> · not seeded yet</span>
                )}
              </span>
            </a>
          ))}
        </div>
      )}
    </ViewRegion>
  );
}
