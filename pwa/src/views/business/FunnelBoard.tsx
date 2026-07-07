// funnel-pipeline-modeling T-09 (design §6.3–§6.6, §4.5, §4.6 + review-design
// C-01/N-01 — FR-11, FR-13, FR-14, FR-15; AC-11 view half, AC-12/13/14/15/19 tsx
// halves, AC-10 client-filter half). The live interactive stage board.
//
// Canonical route: #/insights/funnels (the nav-IA restructure folded the former
// #/business surface into #/insights). The orchestrator owns route.ts /
// views/index.tsx and wires `funnels: (r) => <FunnelBoard route={r} />` — this
// file only CREATES the component.
//
// Subject — consumes useActiveModel() (never re-implemented) and resolves the
// SaaS-Operator root by the OQ-1 marker (name:"SaaS Operator" +
// attributes.saasOperatorRoot:true), defaulting to it even when the active model
// is something else (FR-13, same pattern as FunctionMap.tsx).
//
// Reads — two api.cypher(...) passthrough reads (§4.5): a listing read on mount
// (funnel picker), and a composition read on funnel-select (ordered stages +
// transitions). C-06/C-01 pin: the listing CONTAINS $rootIdNeedle is a coarse
// prefilter; the AUTHORITATIVE scope filter is the client-side
// modelId === operatorRootId check here.
//
// Reorder (FR-14, OQ-3) — pointer drag (pointer events + setPointerCapture, NOT
// HTML5 DnD) AND explicit per-card move-up/move-down buttons (no arrow-key
// capture). Both persist via PATCH /api/v1/nodes/Stage/:id then re-read.
//
// States (UX-01, catalog-first) — Loading / EmptyState / ErrorState / ready, all
// from _shared.tsx; the root is the catalog ViewRegion landmark (AC-19).

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { Route } from "../../route";
import { api } from "../../api";
import { useActiveModel } from "../../context/ActiveModelContext";
import { ViewRegion, ViewHeader, Loading, EmptyState, ErrorState } from "../_shared";
import { Button } from "../../components/Button";
import { overallConversion, NA } from "../../lib/funnelAnalytics";
import styles from "./FunnelBoard.module.css";

const OPERATOR_ROOT_NAME = "SaaS Operator";
const OPERATOR_ROOT_MARKER = "saasOperatorRoot";

// §4.5 listing read — CONTAINS is a coarse index-free prefilter; the view does
// the authoritative modelId parse-and-filter client-side (C-06/C-01).
const FUNNEL_LIST_QUERY = `MATCH (f:Funnel)
WHERE f.attributes_json CONTAINS $rootIdNeedle
OPTIONAL MATCH (f)-[:HAS_STAGE]->(s:Stage)
WITH f, count(s) AS stageCount
RETURN f.id AS id, f.name AS name, f.description AS description,
       f.attributes_json AS attributes_json, stageCount
ORDER BY f.name`;

// §4.5 composition read — anchored on the funnel id (globally-unique UUIDv7 →
// cannot cross models, AC-09a). Returns funnel + ordered stages + CONVERTS_TO
// transitions with their conversionRate/dropOffRate (in attributes_json).
const FUNNEL_COMPOSITION_QUERY = `MATCH (f:Funnel {id:$funnelId})
OPTIONAL MATCH (f)-[:HAS_STAGE]->(s:Stage)
WITH f, s ORDER BY s.stageOrder
OPTIONAL MATCH (s)-[c:CONVERTS_TO]->(s2:Stage)
RETURN f.id AS funnelId, f.name AS funnelName,
       s.id AS stageId, s.name AS stageName, s.attributes_json AS stageAttrs,
       c.attributes_json AS transitionAttrs, s2.id AS toStageId
ORDER BY s.stageOrder`;

interface FunnelListItem {
  id: string;
  name: string;
  description: string;
  stageCount: number;
}

interface StageNode {
  id: string;
  name: string;
  stageOrder: number;
  // Full parsed attributes map — preserved so a reorder PATCH (replace-the-whole-
  // map semantics) never clobbers other stage attributes when it bumps stageOrder.
  attrs: Record<string, unknown>;
}

interface Transition {
  fromStageId: string;
  toStageId: string;
  conversionRate: number;
  dropOffRate: number;
}

interface Composition {
  funnelId: string;
  funnelName: string;
  stages: StageNode[];
  transitions: Transition[];
}

type ListState =
  | { status: "loading" }
  | { status: "ready"; funnels: FunnelListItem[] }
  | { status: "error"; message: string };

type CompState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; comp: Composition }
  | { status: "error"; message: string };

// Neo4j integer columns come back as {low, high} or number; coerce defensively
// (FunctionMap precedent).
function toCount(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "low" in (v as Record<string, unknown>)) {
    return Number((v as { low: number }).low);
  }
  return Number(v ?? 0);
}

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

function toRate(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Derive the branch signal (N-01): a stage with >1 outgoing CONVERTS_TO edge.
// Count OUTGOING CONVERTS_TO (not HAS_STAGE, not incoming) so a detection bug is
// observable. Analytics degrade to "n/a" when branched or single-stage.
function deriveBranched(transitions: Transition[]): boolean {
  const outCounts = new Map<string, number>();
  for (const t of transitions) {
    outCounts.set(t.fromStageId, (outCounts.get(t.fromStageId) ?? 0) + 1);
  }
  for (const n of outCounts.values()) if (n > 1) return true;
  return false;
}

// Overall funnel conversion label (linear chain: product of per-transition
// conversionRates; branch or single-stage → "n/a").
export function overallConversionLabel(comp: Composition): string {
  const branched = deriveBranched(comp.transitions);
  // Order the transition rates along the ordered Stage chain (stageOrder).
  const orderIndex = new Map(comp.stages.map((s, i) => [s.id, i]));
  const linearRates = [...comp.transitions]
    .sort((a, b) => (orderIndex.get(a.fromStageId) ?? 0) - (orderIndex.get(b.fromStageId) ?? 0))
    .map((t) => t.conversionRate);
  const overall = overallConversion(linearRates, { branched });
  return overall === NA ? NA : formatPct(overall);
}

function formatPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function parseComposition(rows: Record<string, unknown>[]): Composition {
  const funnelId = String(rows[0]?.funnelId ?? "");
  const funnelName = String(rows[0]?.funnelName ?? "");
  const stageMap = new Map<string, StageNode>();
  const transitions: Transition[] = [];
  for (const r of rows) {
    const stageId = r.stageId ? String(r.stageId) : "";
    if (stageId && !stageMap.has(stageId)) {
      const attrs = parseAttributes(r.stageAttrs);
      stageMap.set(stageId, {
        id: stageId,
        name: String(r.stageName ?? ""),
        stageOrder: toCount(attrs.stageOrder),
        attrs,
      });
    }
    const toStageId = r.toStageId ? String(r.toStageId) : "";
    if (stageId && toStageId) {
      const tAttrs = parseAttributes(r.transitionAttrs);
      transitions.push({
        fromStageId: stageId,
        toStageId,
        conversionRate: toRate(tAttrs.conversionRate),
        dropOffRate: toRate(tAttrs.dropOffRate),
      });
    }
  }
  const stages = [...stageMap.values()].sort((a, b) => a.stageOrder - b.stageOrder);
  return { funnelId, funnelName, stages, transitions };
}

export function FunnelBoard(_props: { route: Route }) {
  const { models, status: modelStatus } = useActiveModel();
  const [listState, setListState] = useState<ListState>({ status: "loading" });
  const [compState, setCompState] = useState<CompState>({ status: "idle" });
  const [selectedId, setSelectedId] = useState<string>("");
  // Focus restoration after a keyboard move: the moved stage's move-up button.
  const restoreFocusRef = useRef<string | null>(null);

  const operatorRoot =
    models.find(
      (m) =>
        m.name === OPERATOR_ROOT_NAME &&
        (m.attributes as Record<string, unknown>)?.[OPERATOR_ROOT_MARKER] === true,
    ) ?? null;

  // Listing read (§4.5) — coarse CONTAINS prefilter, authoritative client filter.
  const loadList = useCallback(async (rootId: string) => {
    setListState({ status: "loading" });
    try {
      const res = await api.cypher(FUNNEL_LIST_QUERY, { rootIdNeedle: rootId });
      const funnels: FunnelListItem[] = res.rows
        .filter((r) => {
          // Authoritative scope exclusion (C-01/C-06): keep only rows whose
          // parsed modelId === operatorRootId (a retail funnel with a
          // different/absent modelId is dropped here).
          const attrs = parseAttributes(r.attributes_json);
          return attrs.modelId === rootId;
        })
        .map((r) => ({
          id: String(r.id),
          name: String(r.name ?? ""),
          description: String(r.description ?? ""),
          stageCount: toCount(r.stageCount),
        }));
      setListState({ status: "ready", funnels });
    } catch (e) {
      setListState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  // Composition read (§4.5) — id-keyed, scope-isolated by the globally-unique id.
  const loadComposition = useCallback(async (funnelId: string) => {
    setCompState({ status: "loading" });
    try {
      const res = await api.cypher(FUNNEL_COMPOSITION_QUERY, { funnelId });
      setCompState({ status: "ready", comp: parseComposition(res.rows) });
    } catch (e) {
      setCompState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    if (modelStatus !== "ready") return;
    if (!operatorRoot) {
      // The SaaS-Operator model has not been seeded — empty picker.
      setListState({ status: "ready", funnels: [] });
      return;
    }
    void loadList(operatorRoot.id);
  }, [modelStatus, operatorRoot, loadList]);

  const onSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      if (id) void loadComposition(id);
      else setCompState({ status: "idle" });
    },
    [loadComposition],
  );

  // Persist a new stage order: PATCH each MOVED stage's stageOrder (preserving
  // the rest of its attributes map — PATCH is replace-the-whole-map), then
  // re-read. `stages` is the target order; the array index is the new stageOrder.
  const persistOrder = useCallback(
    async (stages: StageNode[]) => {
      const patches = stages
        .map((s, newOrder) => ({ s, newOrder }))
        .filter(({ s, newOrder }) => s.stageOrder !== newOrder);
      try {
        await Promise.all(
          patches.map(({ s, newOrder }) =>
            api.patchNode("Stage", s.id, { ...s.attrs, stageOrder: newOrder }),
          ),
        );
        if (selectedId) await loadComposition(selectedId);
      } catch (e) {
        setCompState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      }
    },
    [selectedId, loadComposition],
  );

  // Swap two stages by index and persist (keyboard move-up/down, AC-18).
  const swap = useCallback(
    (comp: Composition, fromIdx: number, toIdx: number, focusStageId: string) => {
      if (toIdx < 0 || toIdx >= comp.stages.length) return;
      const next = [...comp.stages];
      const tmp = next[fromIdx]!;
      next[fromIdx] = next[toIdx]!;
      next[toIdx] = tmp;
      restoreFocusRef.current = focusStageId;
      void persistOrder(next);
    },
    [persistOrder],
  );

  // Pointer-drag reorder (AC-17) — pointer events + setPointerCapture, no HTML5 DnD.
  const dragFromRef = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, idx: number) => {
      e.preventDefault(); // suppress native text selection during drag
      dragFromRef.current = idx;
      setDraggingIdx(idx);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [],
  );
  const onCardPointerUp = useCallback(
    (comp: Composition, toIdx: number) => {
      const fromIdx = dragFromRef.current;
      dragFromRef.current = null;
      setDraggingIdx(null);
      if (fromIdx === null || fromIdx === toIdx) return;
      const next = [...comp.stages];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved!);
      restoreFocusRef.current = moved!.id;
      void persistOrder(next);
    },
    [persistOrder],
  );

  // Restore focus to the moved stage's move-up button after a re-read.
  useEffect(() => {
    if (compState.status !== "ready" || !restoreFocusRef.current) return;
    const id = restoreFocusRef.current;
    restoreFocusRef.current = null;
    const el = document.querySelector<HTMLButtonElement>(
      `[data-move-up="${CSS.escape(id)}"]`,
    );
    el?.focus();
  }, [compState]);

  // Map fromStageId → transition for annotating between stage cards.
  const transitionByFrom = useMemo(() => {
    if (compState.status !== "ready") return new Map<string, Transition>();
    const m = new Map<string, Transition>();
    for (const t of compState.comp.transitions) {
      if (!m.has(t.fromStageId)) m.set(t.fromStageId, t);
    }
    return m;
  }, [compState]);

  return (
    <ViewRegion label="Funnel board">
      <ViewHeader
        title="Funnels"
        lede="Multi-stage conversion funnels for the SaaS-Operator model. Pick a funnel to see its stages, per-transition conversion/drop-off, and overall conversion."
      />

      {modelStatus === "loading" && <Loading what="funnels" />}
      {modelStatus === "error" && (
        <ErrorState message="Could not load the model list." onRetry={undefined} />
      )}

      {modelStatus === "ready" && listState.status === "loading" && <Loading what="funnels" />}
      {modelStatus === "ready" && listState.status === "error" && (
        <ErrorState
          message={listState.message}
          onRetry={operatorRoot ? () => void loadList(operatorRoot.id) : undefined}
        />
      )}

      {modelStatus === "ready" &&
        listState.status === "ready" &&
        listState.funnels.length === 0 && (
          <div data-testid="funnel-board-empty">
            <EmptyState what="funnels" />
            <p className={styles.hint}>
              Content specs (marketing / sales) seed funnels. Run{" "}
              <code>bun run seed:funnel-pipeline</code> to register the funnel
              constructs, then seed a marketing or sales funnel.
            </p>
          </div>
        )}

      {modelStatus === "ready" && listState.status === "ready" && listState.funnels.length > 0 && (
        <>
          <div className={styles.pickerBar}>
            <label className={styles.pickerLabel} htmlFor="funnel-picker">
              Funnel
            </label>
            <select
              id="funnel-picker"
              className={styles.pickerSelect}
              value={selectedId}
              onChange={(e) => onSelect(e.target.value)}
              data-testid="funnel-picker"
            >
              <option value="">Select a funnel…</option>
              {listState.funnels.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.stageCount} stages)
                </option>
              ))}
            </select>
          </div>

          {compState.status === "loading" && <Loading what="stages" />}
          {compState.status === "error" && (
            <ErrorState
              message={compState.message}
              onRetry={selectedId ? () => void loadComposition(selectedId) : undefined}
            />
          )}

          {compState.status === "ready" && compState.comp.stages.length === 0 && (
            <div data-testid="funnel-board-no-stages">
              <EmptyState what="stages in this funnel" />
            </div>
          )}

          {compState.status === "ready" && compState.comp.stages.length > 0 && (
            <>
              <div className={styles.summary} data-testid="funnel-overall">
                <span className={styles.summaryLabel}>Overall conversion</span>
                <span className={styles.summaryValue} data-testid="funnel-overall-value">
                  {overallConversionLabel(compState.comp)}
                </span>
              </div>

              <ol className={styles.grid} data-testid="funnel-stage-board">
                {compState.comp.stages.map((stage, idx) => {
                  const t = transitionByFrom.get(stage.id);
                  return (
                    <li key={stage.id} className={styles.stageWrap}>
                      <div
                        className={`${styles.card}${draggingIdx === idx ? ` ${styles.dragging}` : ""}`}
                        data-testid="funnel-stage-card"
                        data-stage-id={stage.id}
                        onPointerUp={() =>
                          onCardPointerUp(compState.comp, idx)
                        }
                      >
                        <button
                          type="button"
                          className={styles.handle}
                          aria-label={`Drag to reorder ${stage.name}`}
                          data-testid="funnel-stage-handle"
                          onPointerDown={(e) => onHandlePointerDown(e, idx)}
                        >
                          ⠿
                        </button>
                        <span className={styles.stageName}>{stage.name}</span>
                        <span className={styles.stageOrder}>#{idx + 1}</span>
                        <span className={styles.moveControls}>
                          <button
                            type="button"
                            className={styles.moveBtn}
                            aria-label={`Move ${stage.name} up`}
                            data-testid="funnel-move-up"
                            data-move-up={stage.id}
                            disabled={idx === 0}
                            onClick={() => swap(compState.comp, idx, idx - 1, stage.id)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className={styles.moveBtn}
                            aria-label={`Move ${stage.name} down`}
                            data-testid="funnel-move-down"
                            disabled={idx === compState.comp.stages.length - 1}
                            onClick={() => swap(compState.comp, idx, idx + 1, stage.id)}
                          >
                            ↓
                          </button>
                        </span>
                      </div>
                      {t && (
                        <div className={styles.transition} data-testid="funnel-transition">
                          <span className={styles.transitionMetric}>
                            <span className={styles.transitionLabel}>converts</span>
                            <span
                              className={styles.transitionValue}
                              data-testid="funnel-conversion-rate"
                            >
                              {formatPct(t.conversionRate)}
                            </span>
                          </span>
                          <span className={styles.transitionMetric}>
                            <span className={styles.transitionLabel}>drop-off</span>
                            <span
                              className={styles.transitionValue}
                              data-testid="funnel-dropoff-rate"
                            >
                              {formatPct(t.dropOffRate)}
                            </span>
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </>
      )}
    </ViewRegion>
  );
}
