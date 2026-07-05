// kpi-impact-mapping T-14 (design §4.10, §6, DD-12, FR-12/FR-13/FR-14,
// UX-01/02/05/06) — #/model/kpi-impact view.
//
// Reads the active BusinessModel from useActiveModel(), keys its fetch
// on activeModel.id, and renders all four states (loading/empty/error/ready).
// The ready state shows the activity×KPI grid with directional-weight chips,
// a gaps strip above the grid, a link editor (Modal), and a roll-up panel.

import { useCallback, useEffect, useState } from "react";
import type { Route } from "../../route";
import { useActiveModel } from "../../context/ActiveModelContext";
import { api, type KpiImpactMatrix, type KpiImpactRollup } from "../../api";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Modal } from "../../components/Modal";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./KpiImpactMatrix.module.css";

type ViewState = "loading" | "empty" | "error" | "ready";

interface LinkEditorState {
  activityId: string;
  activityName: string;
  kpiId: string | undefined;
  direction: "increases" | "decreases" | undefined;
  weight: number | undefined;
  linkId: string | undefined;
}

interface RollupState {
  kpiId: string;
  kpiName: string;
}

export function KpiImpactMatrix({ route: _route }: { route: Route }) {
  const { activeModel, status } = useActiveModel();
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [matrix, setMatrix] = useState<KpiImpactMatrix | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [linkEditor, setLinkEditor] = useState<LinkEditorState | null>(null);
  const [rollupPanel, setRollupPanel] = useState<RollupState | null>(null);
  const [rollupData, setRollupData] = useState<KpiImpactRollup | null>(null);

  const fetchMatrix = useCallback(async () => {
    if (!activeModel) return;
    setViewState("loading");
    try {
      const data = await api.kpiImpact.matrix(activeModel.id);
      setMatrix(data);
      if (data.meta.activityCount === 0 || data.meta.linkedCellCount === 0) {
        setViewState("empty");
      } else {
        setViewState("ready");
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load matrix");
      setViewState("error");
    }
  }, [activeModel]);

  useEffect(() => {
    if (status === "ready" && activeModel) {
      fetchMatrix();
    }
  }, [status, activeModel, fetchMatrix]);

  // Roll-up panel fetch
  useEffect(() => {
    if (!rollupPanel || !activeModel) return;
    api.kpiImpact.rollup(activeModel.id).then((data) => {
      setRollupData(data);
    }).catch(() => {
      setRollupData(null);
    });
  }, [rollupPanel, activeModel]);

  const handleCellClick = (activityId: string, activityName: string, colIndex: number) => {
    const kpi = matrix?.columns[colIndex];
    const cell = matrix?.cells[matrix.rows.findIndex(r => r.id === activityId)]?.[colIndex];
    setLinkEditor({
      activityId,
      activityName,
      kpiId: kpi?.id,
      direction: cell?.direction ?? undefined,
      weight: cell?.weight ?? 0.5,
      linkId: cell ? "existing" : undefined,
    });
  };

  const handleGapLink = (activityId: string, activityName: string) => {
    setLinkEditor({
      activityId,
      activityName,
      kpiId: undefined,
      direction: undefined,
      weight: 0.5,
      linkId: undefined,
    });
  };

  const handleLinkSubmit = async (editor: LinkEditorState) => {
    if (!activeModel || !editor.kpiId || !editor.direction) return;
    try {
      await api.kpiImpact.createActivityLink(activeModel.id, {
        activityId: editor.activityId,
        kpiId: editor.kpiId,
        direction: editor.direction,
        weight: editor.weight ?? 0.5,
      });
      setLinkEditor(null);
      await fetchMatrix();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to save link");
    }
  };

  const handleLinkDelete = async (linkId: string) => {
    if (!activeModel) return;
    try {
      await api.kpiImpact.deleteActivityLink(activeModel.id, linkId);
      setLinkEditor(null);
      await fetchMatrix();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to delete link");
    }
  };

  if (status === "loading") {
    return (
      <div data-testid="kpi-impact-matrix">
        <Loading what="model" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div data-testid="kpi-impact-matrix">
        <ErrorState message="Failed to load active model" />
      </div>
    );
  }

  if (viewState === "loading") {
    return (
      <div data-testid="kpi-impact-matrix">
        <Loading what="matrix" />
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div data-testid="kpi-impact-matrix">
        <ErrorState message={errorMsg} />
        <Button onClick={fetchMatrix} tone="default">Retry</Button>
      </div>
    );
  }

  if (viewState === "empty" || !matrix) {
    return (
      <div data-testid="kpi-impact-matrix" className={styles.view}>
        <ViewHeader title="KPI Impact Matrix" />
        <Card>
          <p>No activities or impact links found for this model.</p>
          <p>Mark key activities in <a href="#/model/key-activities">Key Activities</a> and create impact links to populate the matrix.</p>
        </Card>
      </div>
    );
  }

  const colCount = matrix.columns.length;

  return (
    <div data-testid="kpi-impact-matrix" className={styles.view} role="region" aria-label="KPI Impact Matrix">
      <ViewHeader title="KPI Impact Matrix" />

      {/* Gaps strip (AC-11, FR-13) — above the grid */}
      {matrix.gaps.length > 0 && (
        <div className={styles.gapsStrip} data-testid="gaps-strip" role="status" aria-label="Measurability gaps">
          {matrix.gaps.map((gap) => (
            <div key={gap.activityId} className={styles.gapItem}>
              <span>{gap.activityName}</span>
              <Button
                tone="default"
                onClick={() => handleGapLink(gap.activityId, gap.activityName)}
              >
                Link a KPI
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Activity × KPI grid (AC-08) */}
      <div role="grid" aria-label="Activity KPI impact matrix" className={styles.grid}>
        {/* Header row */}
        <div className={styles.gridHeader} role="row" style={{ gridTemplateColumns: `200px repeat(${colCount}, 1fr)` }}>
          <div role="columnheader">Activity</div>
          {matrix.columns.map((col) => (
            <div
              key={col.id}
              role="columnheader"
              style={{ cursor: "pointer" }}
              onClick={() => setRollupPanel({ kpiId: col.id, kpiName: col.name })}
            >
              {col.name}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {matrix.rows.map((row, rowIdx) => (
          <div
            key={row.id}
            className={styles.gridRow}
            role="row"
            style={{ gridTemplateColumns: `200px repeat(${colCount}, 1fr)` }}
          >
            <div role="rowheader" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {row.name}
              {row.isKeyActivity && <span title="Key activity" aria-label="Key activity">★</span>}
              {matrix.gaps.some(g => g.activityId === row.id) && (
                <span title="Gap: no KPI linked" aria-label="Gap">⚠</span>
              )}
            </div>
            {matrix.cells[rowIdx]!.map((cell, colIdx) => (
              <div
                key={colIdx}
                role="gridcell"
                className={`${styles.cell} ${cell ? styles.cellLinked : styles.cellEmpty}`}
                onClick={() => handleCellClick(row.id, row.name, colIdx)}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") handleCellClick(row.id, row.name, colIdx); }}
              >
                {cell && (
                  <span className={styles.chip}>
                    {cell.direction === "increases" ? "↑" : cell.direction === "decreases" ? "↓" : "—"}
                    {" "}
                    {cell.weight != null ? cell.weight.toFixed(2) : ""}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Link editor modal */}
      <Modal
        isOpen={linkEditor !== null}
        onClose={() => setLinkEditor(null)}
        title={`Link KPI — ${linkEditor?.activityName ?? ""}`}
      >
        {linkEditor && (
          <LinkEditor
            editor={linkEditor}
            columns={matrix.columns}
            onSubmit={handleLinkSubmit}
            onDelete={handleLinkDelete}
            onCancel={() => setLinkEditor(null)}
          />
        )}
      </Modal>

      {/* Roll-up panel modal */}
      <Modal
        isOpen={rollupPanel !== null}
        onClose={() => { setRollupPanel(null); setRollupData(null); }}
        title={`Roll-up — ${rollupPanel?.kpiName ?? ""}`}
      >
        {rollupData && (
          <div className={styles.rollupPanel}>
            {rollupData.rows
              .filter(r => r.kpiId === rollupPanel?.kpiId)
              .map((row) => (
                <div key={row.kpiId} className={styles.rollupRow}>
                  <span>Latest: {row.latestValue != null ? row.latestValue.toFixed(2) : "—"}</span>
                  <span className={`${styles.statusBadge} ${
                    row.status === "on_track" ? styles.statusOnTrack :
                    row.status === "warning" ? styles.statusWarning :
                    row.status === "critical" ? styles.statusCritical :
                    styles.statusNoData
                  }`}>
                    {row.status.replace("_", " ")}
                  </span>
                  <span>Links: {row.impactLinkCount}</span>
                  <span>Weight: {row.aggregateImpactWeight.toFixed(2)}</span>
                </div>
              ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Link editor sub-component ─────────────────────────────────────────

function LinkEditor({
  editor,
  columns,
  onSubmit,
  onDelete,
  onCancel,
}: {
  editor: LinkEditorState;
  columns: Array<{ id: string; name: string }>;
  onSubmit: (editor: LinkEditorState) => void;
  onDelete: (linkId: string) => void;
  onCancel: () => void;
}) {
  const [kpiId, setKpiId] = useState(editor.kpiId ?? "");
  const [direction, setDirection] = useState<"increases" | "decreases">(editor.direction ?? "increases");
  const [weight, setWeight] = useState(editor.weight ?? 0.5);

  return (
    <div className={styles.linkEditor}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="kpi-select">KPI</label>
        <select
          id="kpi-select"
          className={styles.select}
          value={kpiId}
          onChange={(e) => setKpiId(e.target.value)}
        >
          <option value="">Select a KPI…</option>
          {columns.map((col) => (
            <option key={col.id} value={col.id}>{col.name}</option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Direction</span>
        <div className={styles.toggleGroup}>
          <Button
            tone={direction === "increases" ? "primary" : "default"}
            onClick={() => setDirection("increases")}
            pressed={direction === "increases"}
          >
            ↑ Increases
          </Button>
          <Button
            tone={direction === "decreases" ? "primary" : "default"}
            onClick={() => setDirection("decreases")}
            pressed={direction === "decreases"}
          >
            ↓ Decreases
          </Button>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="weight-range">
          Weight: {weight.toFixed(2)}
        </label>
        <input
          id="weight-range"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={weight}
          onChange={(e) => setWeight(parseFloat(e.target.value))}
          className={styles.range}
          aria-valuenow={weight}
          aria-valuemin={0}
          aria-valuemax={1}
        />
      </div>

      <div style={{ display: "flex", gap: "var(--space-sm)", justifyContent: "flex-end" }}>
        {editor.linkId && (
          <Button
            tone="danger"
            onClick={() => onDelete(editor.linkId!)}
          >
            Delete
          </Button>
        )}
        <Button tone="ghost" onClick={onCancel}>Cancel</Button>
        <Button
          tone="primary"
          onClick={() => onSubmit({ ...editor, kpiId, direction, weight })}
          disabled={!kpiId}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
