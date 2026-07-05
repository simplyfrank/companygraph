// key-activity-optimizer T-14 + T-20 (design §4.10, §6, DD-11, FR-12/
// FR-13/FR-14) — #/model/key-activities (route VERBATIM from the
// blueprint View Tree; the tab itself was registered by
// model-workspace-core — this spec only swaps the VIEWS dispatch
// target).
//
// Reads the active BusinessModel from the shell-owned useActiveModel()
// (never re-implements model selection), keys its fetch on
// activeModel.id (switch/reload → refetch for the persisted model,
// FR-14/AC-16), and renders ALL FOUR states (UX-01):
//   loading — skeleton via _shared Loading (AC-11)
//   empty   — meta.activityCount === 0 → Card pointing at authoring
//             (#/model/canvas); no ranking table. Reachable for every
//             existing model incl. a brand-new 0-domain one — the
//             server returns 200 rows:[], never 404 (cold-pass B-01,
//             AC-12)
//   error   — _shared ErrorState PLUS a separate sibling catalog
//             Button for retry (design C-02 — ErrorState has no retry
//             control; AC-13)
//   ready   — ranking rendered through the extended catalog DataTable
//             (DD-11, Δ3 — supersedes DD-10's in-view table). Sort
//             LOGIC/STATE stay HERE: sortColumn/sortDir state,
//             client-side stable sort (default composite desc = server
//             rank order); the DataTable renders the controlled
//             aria-sort headers and reports clicks via onSort;
//             getRowKey keeps row identity stable under re-sort. No
//             re-fetch on sort (AC-09, NFR-05).
// A meta.truncated / meta.hasCycle flag renders a NON-BLOCKING banner
// above the still-rendered ranking (AC-13, FR-03).
//
// Mark/unmark (FR-13, AC-10): optimistic-with-rollback-on-error — the
// row's key toggles immediately; only a REJECTED promise reverts (a
// successful 204 unmark must NOT roll back — final-review C-01: the
// api.keyActivities.unmark client rides raw fetch, never json<T>).
// Selecting a row opens a catalog Modal with the score evidence
// (explainable, descriptive-only — XD-11) plus, when marked,
// markedAt/scoreSnapshot/rank so live-vs-snapshot drift is visible.
//
// Tokens-only styling via KeyActivityBoard.module.css (NFR-07);
// catalog components first (Card, Button, Modal, _shared).

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Route } from "../../route";
import { useActiveModel } from "../../context/ActiveModelContext";
import { api, type ActivityScoreRow, type KeyActivityScores } from "../../api";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Modal } from "../../components/Modal";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./KeyActivityBoard.module.css";

type ViewState = "loading" | "empty" | "error" | "ready";

type SortColumn = "rank" | "name" | "journey" | "composite" | "centrality" | "criticalPath" | "handoff";
type SortDir = "asc" | "desc";

// Column plan for the extended catalog DataTable (T-20, DD-11): the
// seven score columns are sortable; the Key column is not. Numeric
// columns use the catalog's kind:"num" cell styling + right-aligned
// headers.
const COLUMNS: Array<{
  id: SortColumn | "key";
  label: string;
  align?: "left" | "right";
  kind?: "text" | "num" | "id";
  sortable?: boolean;
}> = [
  { id: "rank", label: "Rank", align: "right", kind: "num", sortable: true },
  { id: "name", label: "Activity", sortable: true },
  { id: "journey", label: "Journey", sortable: true },
  { id: "composite", label: "Composite", align: "right", kind: "num", sortable: true },
  { id: "centrality", label: "Centrality", align: "right", kind: "num", sortable: true },
  { id: "criticalPath", label: "Critical path", align: "right", kind: "num", sortable: true },
  { id: "handoff", label: "Handoff", align: "right", kind: "num", sortable: true },
  { id: "key", label: "Key", align: "right" },
];

function sortValue(row: ActivityScoreRow, column: SortColumn): string | number {
  switch (column) {
    case "rank":
      return row.rank;
    case "name":
      return row.name;
    case "journey":
      return row.journeyName ?? "";
    case "composite":
      return row.composite;
    case "centrality":
      return row.scores.centrality;
    case "criticalPath":
      return row.scores.criticalPath;
    case "handoff":
      return row.scores.handoff;
  }
}

const fmt = (n: number) => n.toFixed(2);

export function KeyActivityBoard({ route }: { route: Route }) {
  void route; // dispatch passes it; the view keys on the active model instead
  const { activeModel, status: modelStatus } = useActiveModel();
  const modelId = activeModel?.id ?? null;

  const [state, setState] = useState<ViewState>("loading");
  const [data, setData] = useState<KeyActivityScores | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  // In-view sort layer (DD-10/design B-01) — default composite desc =
  // the server's DD-09 rank order. No re-fetch on sort (NFR-05).
  const [sortColumn, setSortColumn] = useState<SortColumn>("composite");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Detail panel (catalog Modal — focus-trap + Escape reused, not
  // re-implemented).
  const [detailId, setDetailId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!modelId) return;
    setState("loading");
    setError(null);
    try {
      const scores = await api.keyActivities.list(modelId);
      setData(scores);
      setState(scores.meta.activityCount === 0 ? "empty" : "ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }, [modelId]);

  // Keyed on activeModel.id — model switch (shell context) and reload
  // both refetch for the persisted model (FR-14 / AC-16).
  useEffect(() => {
    setDetailId(null);
    setRowError(null);
    void refetch();
  }, [refetch]);

  const onSort = useCallback(
    (column: SortColumn) => {
      if (column === sortColumn) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(column);
        // Score columns read best high-first; text columns asc.
        setSortDir(column === "name" || column === "journey" ? "asc" : "desc");
      }
    },
    [sortColumn],
  );

  const sortedRows = useMemo(() => {
    const rows = data?.rows ?? [];
    const dir = sortDir === "asc" ? 1 : -1;
    // Stable: decorate with the server index, compare it last.
    return rows
      .map((row, i) => ({ row, i }))
      .sort((a, b) => {
        const va = sortValue(a.row, sortColumn);
        const vb = sortValue(b.row, sortColumn);
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return a.i - b.i;
      })
      .map((x) => x.row);
  }, [data, sortColumn, sortDir]);

  const detailRow = detailId ? (data?.rows.find((r) => r.id === detailId) ?? null) : null;

  // Optimistic-with-rollback-on-error (FR-13, AC-10, final-review
  // C-01): toggle the row's key immediately; revert ONLY on a rejected
  // promise. A successful 204 unmark resolves void — no rollback.
  const toggleMark = useCallback(
    async (row: ActivityScoreRow) => {
      if (!modelId || !data) return;
      setRowError(null);
      const wasMarked = row.key !== null;
      const previous = data;

      const patchRow = (rows: ActivityScoreRow[], key: ActivityScoreRow["key"]) =>
        rows.map((r) => (r.id === row.id ? { ...r, key } : r));

      if (wasMarked) {
        setData({ ...data, rows: patchRow(data.rows, null) });
        try {
          await api.keyActivities.unmark(modelId, row.id);
        } catch (err) {
          setData(previous); // rollback
          setRowError(err instanceof Error ? err.message : String(err));
        }
      } else {
        // Provisional optimistic mark; replaced by the server row.
        const optimistic: NonNullable<ActivityScoreRow["key"]> = {
          marked: true,
          markedAt: new Date().toISOString(),
          scoreSnapshot: { ...row.scores, composite: row.composite },
          rank: row.rank,
        };
        setData({ ...data, rows: patchRow(data.rows, optimistic) });
        try {
          const serverRow = await api.keyActivities.mark(modelId, row.id);
          setData((cur) =>
            cur ? { ...cur, rows: cur.rows.map((r) => (r.id === row.id ? serverRow : r)) } : cur,
          );
        } catch (err) {
          setData(previous); // rollback
          setRowError(err instanceof Error ? err.message : String(err));
        }
      }
    },
    [modelId, data],
  );

  // ── shell-context states ──────────────────────────────────────────
  if (modelStatus === "loading") {
    return (
      <section className={styles.view} aria-label="Key activities">
        <Loading what="the active model" />
      </section>
    );
  }
  if (!modelId) {
    return (
      <section className={styles.view} aria-label="Key activities">
        <ErrorState message="no active business model" />
      </section>
    );
  }

  const meta = data?.meta ?? null;
  const showBanner = state === "ready" && meta !== null && (meta.truncated === true || meta.hasCycle);

  return (
    <section className={styles.view} aria-label="Key activities" data-testid="key-activity-board">
      <ViewHeader
        title="Key activities"
        lede={`Descriptive graph scores over ${activeModel!.name} — centrality, critical-path position, handoff density`}
      />

      {rowError && (
        <p className={styles.actionError} role="alert" data-testid="row-error">
          {rowError}
        </p>
      )}

      {state === "loading" && <Loading what="key-activity scores" />}

      {state === "error" && (
        <div className={styles.errorWrap}>
          <ErrorState message={error ?? "failed to load key-activity scores"} />
          {/* design C-02 — the retry lives HERE, not in ErrorState. */}
          <Button onClick={() => void refetch()}>Retry</Button>
        </div>
      )}

      {state === "empty" && (
        <Card title="No activities to score">
          <p className={styles.emptyLede} data-testid="empty-state">
            This model has no activities to score yet. Author domains, journeys and activities on
            the <a href="#/model/canvas">model canvas</a>, then come back to rank them.
          </p>
        </Card>
      )}

      {showBanner && meta !== null && (
        <div className={styles.banner} role="status" data-testid="score-banner">
          {meta.hasCycle && (
            <span>
              The PRECEDES flow contains a cycle — critical-path scores use the longest acyclic
              sub-chain.
            </span>
          )}
          {meta.truncated === true && (
            <span>
              Scoring was truncated ({meta.truncationReason ?? "budget"}) — ranks reflect the
              longest partial explored.
            </span>
          )}
        </div>
      )}

      {state === "ready" && data !== null && (
        <Card title="Ranking">
          {/* T-20 (Δ3, DD-11): ranking rendered through the extended
              catalog DataTable. Sort state + comparators live in THIS
              view (no re-fetch on sort, NFR-05); the table renders the
              controlled aria-sort headers and reports onSort clicks;
              getRowKey keeps row identity stable under re-sort. */}
          <div data-testid="ranking-table">
            <DataTable
              columns={COLUMNS}
              rows={sortedRows.map((row) => ({
                rank: row.rank,
                name: (
                  <button
                    type="button"
                    className={styles.rowButton}
                    data-testid={`ka-detail-${row.id}`}
                    onClick={() => setDetailId(row.id)}
                  >
                    {row.name}
                  </button>
                ),
                journey: row.journeyName ?? "—",
                composite: fmt(row.composite),
                centrality: fmt(row.scores.centrality),
                criticalPath: fmt(row.scores.criticalPath),
                handoff: fmt(row.scores.handoff),
                key: (
                  <div className={styles.keyCell}>
                    {row.key && (
                      <span className={styles.keyBadge} data-testid={`key-badge-${row.id}`}>
                        key
                      </span>
                    )}
                    <Button
                      tone={row.key ? "ghost" : "default"}
                      pressed={row.key !== null}
                      onClick={() => void toggleMark(row)}
                    >
                      {row.key ? "Unmark" : "Mark key"}
                    </Button>
                  </div>
                ),
              }))}
              sort={{ column: sortColumn, dir: sortDir }}
              onSort={(columnId) => onSort(columnId as SortColumn)}
              getRowKey={(_row, i) => sortedRows[i]!.id}
            />
          </div>
        </Card>
      )}

      {detailRow && (
        <Modal isOpen title={detailRow.name} onClose={() => setDetailId(null)}>
          <div className={styles.detail} data-testid="ka-detail-panel">
            <dl className={styles.meta}>
              <dt>Journey</dt>
              <dd>{detailRow.journeyName ?? "—"}</dd>
              <dt>Rank</dt>
              <dd>{detailRow.rank}</dd>
              <dt>Composite</dt>
              <dd data-testid="detail-composite">{fmt(detailRow.composite)}</dd>
            </dl>

            <h3 className={styles.secTitle}>Centrality — {fmt(detailRow.scores.centrality)}</h3>
            <dl className={styles.meta}>
              <dt>Raw betweenness</dt>
              <dd data-testid="detail-betweenness">{detailRow.evidence.centrality.betweenness}</dd>
              <dt>In-degree</dt>
              <dd>{detailRow.evidence.centrality.inDegree}</dd>
              <dt>Out-degree</dt>
              <dd>{detailRow.evidence.centrality.outDegree}</dd>
            </dl>

            <h3 className={styles.secTitle}>
              Critical path — {fmt(detailRow.scores.criticalPath)}
            </h3>
            <dl className={styles.meta}>
              <dt>On critical path</dt>
              <dd>{detailRow.evidence.criticalPath.onCriticalPath ? "yes" : "no"}</dd>
              <dt>Longest chain depth</dt>
              <dd>{detailRow.evidence.criticalPath.longestChainDepth}</dd>
              <dt>Critical path length</dt>
              <dd>{detailRow.evidence.criticalPath.criticalPathLength}</dd>
            </dl>

            <h3 className={styles.secTitle}>Handoff — {fmt(detailRow.scores.handoff)}</h3>
            <dl className={styles.meta}>
              <dt>Handoff count</dt>
              <dd>{detailRow.evidence.handoff.handoffCount}</dd>
              <dt>Role handoffs</dt>
              <dd>{detailRow.evidence.handoff.roleHandoffs}</dd>
              <dt>System handoffs</dt>
              <dd>{detailRow.evidence.handoff.systemHandoffs}</dd>
            </dl>

            {detailRow.key && (
              <>
                <h3 className={styles.secTitle}>Marked key</h3>
                <dl className={styles.meta} data-testid="detail-mark">
                  <dt>Marked at</dt>
                  <dd>{detailRow.key.markedAt}</dd>
                  <dt>Rank at mark</dt>
                  <dd>{detailRow.key.rank}</dd>
                  <dt>Snapshot composite</dt>
                  <dd data-testid="detail-snapshot-composite">
                    {fmt(detailRow.key.scoreSnapshot.composite)}
                  </dd>
                  <dt>Snapshot sub-scores</dt>
                  <dd>
                    c {fmt(detailRow.key.scoreSnapshot.centrality)} · p{" "}
                    {fmt(detailRow.key.scoreSnapshot.criticalPath)} · h{" "}
                    {fmt(detailRow.key.scoreSnapshot.handoff)}
                  </dd>
                </dl>
              </>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
