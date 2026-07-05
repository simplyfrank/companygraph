// requirements-export T-08/T-10 (FR-08, FR-09, FR-03, FR-10, NFR-06,
// UX-01/02/05) — #/model/export. Reads the active BusinessModel from
// useActiveModel() (does NOT re-implement model selection), fetches
// the assembled spec document (Markdown preview + JSON meta for chips),
// and renders all four states: loading, empty, error, ready.
//
// Download controls (FR-09): "Download Markdown" and "Download JSON"
// trigger client-side Blob downloads — no server file storage.
// Degraded banner (FR-03): when meta.degraded is non-empty, a
// non-blocking banner renders above the preview.
//
// Keyboard (AC-11, UX-05): Tab reaches Download Markdown → Download
// JSON → retry (in error state) in DOM order; the preview is a labeled
// scrollable region. The view exposes an ARIA landmark.

import { useCallback, useEffect, useState } from "react";
import { useActiveModel } from "../../context/ActiveModelContext";
import { specExport as specExportApi } from "../../api";
import { Button } from "../../components/Button";
import { ViewHeader, ErrorState, Loading } from "../_shared";
import type { SpecDocument } from "@companygraph/shared/schema/spec-export";
import styles from "./SpecExport.module.css";

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; doc: SpecDocument; markdown: string }
  | { kind: "empty" };

function isAllZero(counts: SpecDocument["meta"]["counts"]): boolean {
  return (
    counts.stories === 0 &&
    counts.acceptanceCriteria === 0 &&
    counts.keyActivities === 0 &&
    counts.kpiLinks === 0 &&
    counts.gaps === 0 &&
    counts.capabilities === 0
  );
}

function download(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function SpecExport() {
  const { activeModel, status: modelStatus } = useActiveModel();
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  const fetchData = useCallback(async (modelId: string) => {
    setState({ kind: "loading" });
    try {
      const [doc, markdown] = await Promise.all([
        specExportApi.json<SpecDocument>(modelId),
        specExportApi.markdown(modelId),
      ]);
      if (isAllZero(doc.meta.counts)) {
        setState({ kind: "empty" });
      } else {
        setState({ kind: "ready", doc, markdown });
      }
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    if (activeModel?.id) {
      void fetchData(activeModel.id);
    }
  }, [activeModel?.id, fetchData]);

  const modelName = activeModel?.name ?? "model";
  const safeName = modelName.replace(/[^a-zA-Z0-9_-]/g, "_");

  if (modelStatus === "loading") {
    return (
      <section className={styles.view} aria-label="Spec export" data-testid="spec-export">
        <ViewHeader title="Export" lede="Assemble and download the business specification." />
        <Loading what="model" />
      </section>
    );
  }

  if (!activeModel) {
    return (
      <section className={styles.view} aria-label="Spec export" data-testid="spec-export">
        <ViewHeader title="Export" lede="Assemble and download the business specification." />
        <p className={styles.empty}>No active model selected.</p>
      </section>
    );
  }

  return (
    <section className={styles.view} aria-label="Spec export" data-testid="spec-export">
      <ViewHeader title="Export" lede="Assemble and download the business specification." />

      {state.kind === "loading" && (
        <div data-testid="spec-export-loading">
          <Loading what="specification" />
        </div>
      )}

      {state.kind === "error" && (
        <div data-testid="spec-export-error">
          <ErrorState message={state.message} />
          <div className={styles.actions}>
            <Button onClick={() => void fetchData(activeModel.id)}>Retry</Button>
          </div>
        </div>
      )}

      {state.kind === "empty" && (
        <div className={styles.empty} data-testid="spec-export-empty">
          <p>This model has no authored content yet. Use the authoring, optimize, and measure tabs to add stories, key activities, KPI links, and capabilities.</p>
          <div className={styles.emptyActions}>
            <Button tone="ghost" onClick={() => { window.location.hash = "#/model/canvas"; }}>Canvas</Button>
            <Button tone="ghost" onClick={() => { window.location.hash = "#/model/key-activities"; }}>Key Activities</Button>
            <Button tone="ghost" onClick={() => { window.location.hash = "#/model/kpi-impact"; }}>KPI Impact</Button>
            <Button tone="ghost" onClick={() => { window.location.hash = "#/model/systems"; }}>Systems</Button>
          </div>
        </div>
      )}

      {state.kind === "ready" && (
        <>
          {/* Degraded banner (FR-03/AC-09) */}
          {state.doc.meta.degraded && Object.keys(state.doc.meta.degraded).length > 0 && (
            <div className={styles.banner} data-testid="spec-export-degraded-banner">
              Some sections were unavailable and exported empty: {Object.keys(state.doc.meta.degraded).join(", ")}
            </div>
          )}

          {/* Download controls (FR-09) */}
          <div className={styles.actions} data-testid="spec-export-actions">
            <Button
              tone="primary"
              onClick={() => download(`${safeName}-spec.md`, state.markdown, "text/markdown")}
              data-testid="download-markdown"
            >
              Download Markdown
            </Button>
            <Button
              tone="default"
              onClick={() => download(`${safeName}-spec.json`, JSON.stringify(state.doc, null, 2), "application/json")}
              data-testid="download-json"
            >
              Download JSON
            </Button>
          </div>

          {/* Section-count chips from meta.counts */}
          <div className={styles.chips} data-testid="spec-export-chips">
            <span className={styles.chip}>Stories: <span className={styles.chipValue}>{state.doc.meta.counts.stories}</span></span>
            <span className={styles.chip}>ACs: <span className={styles.chipValue}>{state.doc.meta.counts.acceptanceCriteria}</span></span>
            <span className={styles.chip}>Key Activities: <span className={styles.chipValue}>{state.doc.meta.counts.keyActivities}</span></span>
            <span className={styles.chip}>KPI Links: <span className={styles.chipValue}>{state.doc.meta.counts.kpiLinks}</span></span>
            <span className={styles.chip}>Gaps: <span className={styles.chipValue}>{state.doc.meta.counts.gaps}</span></span>
            <span className={styles.chip}>Capabilities: <span className={styles.chipValue}>{state.doc.meta.counts.capabilities}</span></span>
          </div>

          {/* Markdown preview (labeled scrollable region, AC-11) */}
          <div
            className={styles.preview}
            aria-label="Markdown preview"
            role="region"
            tabIndex={0}
            data-testid="spec-export-preview"
          >
            {state.markdown}
          </div>
        </>
      )}
    </section>
  );
}
