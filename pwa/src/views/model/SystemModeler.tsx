// ddd-system-modeling T-13 (design §4.10, §6, DD-13, DD-15, FR-12/
// FR-13/FR-14) — #/model/systems (route VERBATIM from the blueprint
// View Tree; the tab itself was registered by model-workspace-core —
// this spec only swaps the VIEWS dispatch target).
//
// Reads the active BusinessModel from the shell-owned useActiveModel()
// (never re-implements model selection), keys its THREE fetches
// (capabilities list / system-model gaps / context map) on
// activeModel.id (switch/reload → refetch for the persisted model,
// FR-14/AC-19), and renders ALL FOUR states (UX-01):
//   loading — skeleton via _shared Loading (AC-14)
//   empty   — no capabilities → Card offering "New capability" and,
//             when the model has activities/stories, a hint to start
//             mapping (AC-15)
//   error   — _shared ErrorState PLUS a sibling catalog Button for
//             retry (ErrorState has no retry control; AC-16)
//   ready   — three panels (AC-10/11/12): capability list, support-gap
//             panel (4 FR-07 categories + augmentation mix; step items
//             surface describingStories links — DD-15), context-map
//             panel (grouped LIST, not a drag-canvas — requirements
//             Risk 4; relationships deep-linked via targetId — DD-07).
//
// Detail + mapping editing (AC-13): selecting a capability opens the
// catalog Modal (focus-trap + Escape reused, not re-implemented) with
// edit (PATCH), add/remove needed-by source, add/remove supporting
// system, set/clear context (all FR-05 routes), delete. A mapping
// whose read-model detached[] entry matches shows the "detached"
// indicator (DD-13 — driven by the read-model field).
//
// systemKind is conveyed by Pill TEXT via SYSTEM_KIND_LABELS (imported
// vocabulary — never a re-declared literal, NFR-03/AC-20; the kinds
// are iterated from SYSTEM_KINDS). Tokens-only styling via
// SystemModeler.module.css (NFR-06); catalog components first (Card,
// Pill, Modal, Button, _shared).

import { useCallback, useEffect, useState } from "react";
import type { Route } from "../../route";
import { useActiveModel } from "../../context/ActiveModelContext";
import {
  api,
  type CapabilityRead,
  type GapsResult,
  type ContextMapResult,
  type GapStepItem,
  type KindCounts,
} from "../../api";
import {
  SYSTEM_KINDS,
  SYSTEM_KIND_LABELS,
} from "@companygraph/shared/schema/system-kind";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Modal } from "../../components/Modal";
import { Pill } from "../../components/Pill";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./SystemModeler.module.css";

type ViewState = "loading" | "empty" | "error" | "ready";

// Render one Pill per kind with a non-zero count — kinds iterated from
// the ONE vocabulary; the `unknown` bucket renders defensively (only
// when populated).
function KindPills({ counts, testId }: { counts: KindCounts; testId: string }) {
  return (
    <span className={styles.pillRow} data-testid={testId}>
      {SYSTEM_KINDS.map((kind) =>
        counts[kind] > 0 ? (
          <Pill key={kind} tone="accent">
            {SYSTEM_KIND_LABELS[kind]} ×{counts[kind]}
          </Pill>
        ) : null,
      )}
      {counts.unknown > 0 && (
        <Pill tone="warn">Unknown kind ×{counts.unknown}</Pill>
      )}
    </span>
  );
}

function GapStepList({ items, testId }: { items: GapStepItem[]; testId: string }) {
  if (items.length === 0) return <p className={styles.emptyNote}>None.</p>;
  return (
    <ul className={styles.gapList} data-testid={testId}>
      {items.map((item) => (
        <li key={item.activityId}>
          <a href={`#/explorer/activities/${encodeURIComponent(item.activityId)}`}>
            {item.activityName}
          </a>
          {item.describingStories.length > 0 && (
            <span className={styles.storyLinks}>
              {" — stories: "}
              {item.describingStories.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && ", "}
                  <a
                    href={`#/model/stories/${encodeURIComponent(s.id)}`}
                    data-testid={`story-link-${s.id}`}
                  >
                    {s.name}
                  </a>
                </span>
              ))}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SystemModeler({ route }: { route: Route }) {
  void route; // dispatch passes it; the view keys on the active model instead
  const { activeModel, status: modelStatus } = useActiveModel();
  const modelId = activeModel?.id ?? null;

  const [state, setState] = useState<ViewState>("loading");
  const [caps, setCaps] = useState<CapabilityRead[]>([]);
  const [gapsData, setGapsData] = useState<GapsResult | null>(null);
  const [ctxMap, setCtxMap] = useState<ContextMapResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Create form (Modal).
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");

  // Detail (catalog Modal — focus-trap + Escape reused).
  const [detail, setDetail] = useState<CapabilityRead | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  // Mapping forms.
  const [neededByKind, setNeededByKind] = useState<"activity" | "story">("activity");
  const [neededById, setNeededById] = useState("");
  const [systemIdInput, setSystemIdInput] = useState("");
  const [contextIdInput, setContextIdInput] = useState("");

  const refetch = useCallback(async () => {
    if (!modelId) return;
    setState("loading");
    setError(null);
    try {
      const [list, gaps, contextMap] = await Promise.all([
        api.capabilities.list(modelId),
        api.systemModel.gaps(modelId),
        api.systemModel.contextMap(modelId),
      ]);
      setCaps(list);
      setGapsData(gaps);
      setCtxMap(contextMap);
      setState(list.length === 0 ? "empty" : "ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }, [modelId]);

  // Keyed on activeModel.id — model switch (shell context) and reload
  // both refetch for the persisted model (FR-14 / AC-19).
  useEffect(() => {
    setDetail(null);
    setActionError(null);
    void refetch();
  }, [refetch]);

  const openDetail = useCallback(
    async (capabilityId: string) => {
      if (!modelId) return;
      setActionError(null);
      try {
        const d = await api.capabilities.get(modelId, capabilityId);
        setDetail(d);
        setEditName(d.name);
        setEditDescription(d.description);
        setNeededById("");
        setSystemIdInput("");
        setContextIdInput("");
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      }
    },
    [modelId],
  );

  // Every mapping mutation refreshes the detail from the returned
  // read-model (PUTs) or a fresh GET (DELETEs), then the three panels
  // in the background.
  const runAction = useCallback(
    async (action: () => Promise<CapabilityRead | void>, capabilityId: string | null) => {
      if (!modelId) return;
      setActionError(null);
      try {
        const result = await action();
        if (result) setDetail(result);
        else if (capabilityId) setDetail(await api.capabilities.get(modelId, capabilityId));
        void refetch();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      }
    },
    [modelId, refetch],
  );

  const createCapability = useCallback(async () => {
    if (!modelId || createName.trim().length === 0) return;
    setActionError(null);
    try {
      await api.capabilities.create(modelId, { name: createName.trim() });
      setCreateOpen(false);
      setCreateName("");
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }, [modelId, createName, refetch]);

  // ── shell-context states ──────────────────────────────────────────
  if (modelStatus === "loading") {
    return (
      <section className={styles.view} aria-label="System modeler">
        <Loading what="the active model" />
      </section>
    );
  }
  if (!modelId) {
    return (
      <section className={styles.view} aria-label="System modeler">
        <ErrorState message="no active business model" />
      </section>
    );
  }

  const mixByCapability = new Map(
    (gapsData?.augmentationMix.perCapability ?? []).map((p) => [p.capabilityId, p]),
  );
  const modelHasSteps =
    (gapsData?.unsupportedSteps.length ?? 0) + (gapsData?.capabilityGaps.length ?? 0) > 0;
  const isDetached = (kind: "needed-by" | "supported-by" | "context", targetId: string) =>
    (detail?.detached ?? []).some((d) => d.kind === kind && d.targetId === targetId);

  return (
    <section className={styles.view} aria-label="System modeler" data-testid="system-modeler">
      <ViewHeader
        title="System modeling"
        lede={`Capability layer over ${activeModel!.name} — story/activity → capability → system, bounded contexts, support gaps`}
      />

      <div className={styles.toolbar}>
        <Button onClick={() => setCreateOpen(true)}>New capability</Button>
      </div>

      {actionError && (
        <p className={styles.actionError} role="alert" data-testid="action-error">
          {actionError}
        </p>
      )}

      {state === "loading" && <Loading what="the system model" />}

      {state === "error" && (
        <div className={styles.errorWrap}>
          <ErrorState message={error ?? "failed to load the system model"} />
          {/* the retry lives HERE — ErrorState renders no retry itself (AC-16) */}
          <Button onClick={() => void refetch()}>Retry</Button>
        </div>
      )}

      {state === "empty" && (
        <Card title="No capabilities yet">
          <p className={styles.emptyLede} data-testid="empty-state">
            This model has no capabilities. Create the first one with{" "}
            <strong>New capability</strong> above.
            {modelHasSteps && (
              <span data-testid="empty-mapping-hint">
                {" "}
                The model already has activities and stories — start mapping them to
                capabilities to see support gaps close.
              </span>
            )}
          </p>
        </Card>
      )}

      {state === "ready" && (
        <div className={styles.panels}>
          {/* ── Panel 1: capability list (AC-10) ─────────────────── */}
          <Card title="Capabilities">
            <table className={styles.table} data-testid="capability-list">
              <thead>
                <tr>
                  <th>Capability</th>
                  <th className={styles.num}>Needed by</th>
                  <th>Supporting systems</th>
                  <th>Bounded context</th>
                </tr>
              </thead>
              <tbody>
                {caps.map((cap) => {
                  const mix = mixByCapability.get(cap.id);
                  return (
                    <tr key={cap.id} data-testid={`cap-row-${cap.id}`}>
                      <td>
                        <button
                          type="button"
                          className={styles.rowButton}
                          data-testid={`cap-open-${cap.id}`}
                          onClick={() => void openDetail(cap.id)}
                        >
                          {cap.name}
                        </button>
                      </td>
                      <td className={styles.num} data-testid={`cap-needed-${cap.id}`}>
                        {cap.neededByCount}
                      </td>
                      <td>
                        {cap.supportingSystemCount === 0 || !mix ? (
                          <span className={styles.emptyNote}>none</span>
                        ) : (
                          <KindPills counts={mix.counts} testId={`cap-kinds-${cap.id}`} />
                        )}
                      </td>
                      <td data-testid={`cap-context-${cap.id}`}>
                        {cap.assignedContextName ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* ── Panel 2: support gaps + augmentation mix (AC-11) ── */}
          {gapsData && (
            <Card title="Support gaps">
              <div className={styles.gapGrid} data-testid="gap-panel">
                <section aria-label="Unsupported steps">
                  <h4 className={styles.gapHead}>
                    Unsupported steps{" "}
                    <span data-testid="count-unsupported">
                      ({gapsData.unsupportedSteps.length})
                    </span>
                  </h4>
                  <GapStepList items={gapsData.unsupportedSteps} testId="list-unsupported" />
                </section>
                <section aria-label="Capability gaps">
                  <h4 className={styles.gapHead}>
                    Capability gaps{" "}
                    <span data-testid="count-capability-gaps">
                      ({gapsData.capabilityGaps.length})
                    </span>
                  </h4>
                  <GapStepList items={gapsData.capabilityGaps} testId="list-capability-gaps" />
                </section>
                <section aria-label="Capabilities without a system">
                  <h4 className={styles.gapHead}>
                    Capabilities without a system{" "}
                    <span data-testid="count-without-system">
                      ({gapsData.capabilitiesWithoutSystem.length})
                    </span>
                  </h4>
                  {gapsData.capabilitiesWithoutSystem.length === 0 ? (
                    <p className={styles.emptyNote}>None.</p>
                  ) : (
                    <ul className={styles.gapList} data-testid="list-without-system">
                      {gapsData.capabilitiesWithoutSystem.map((c) => (
                        <li key={c.capabilityId}>
                          <button
                            type="button"
                            className={styles.rowButton}
                            onClick={() => void openDetail(c.capabilityId)}
                          >
                            {c.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section aria-label="Orphan systems">
                  <h4 className={styles.gapHead}>
                    Orphan systems{" "}
                    <span data-testid="count-orphan-systems">
                      ({gapsData.orphanSystems.length})
                    </span>
                  </h4>
                  {gapsData.orphanSystems.length === 0 ? (
                    <p className={styles.emptyNote}>None.</p>
                  ) : (
                    <ul className={styles.gapList} data-testid="list-orphan-systems">
                      {gapsData.orphanSystems.map((s) => (
                        <li key={s.systemId}>
                          <a href={`#/explorer/systems?focus=${encodeURIComponent(s.systemId)}`}>
                            {s.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
              <div className={styles.mixSummary} data-testid="augmentation-mix">
                <h4 className={styles.gapHead}>Augmentation mix (model)</h4>
                <KindPills counts={gapsData.augmentationMix.model} testId="mix-model" />
              </div>
            </Card>
          )}

          {/* ── Panel 3: context map (AC-12) — grouped list, NOT a
                 drag-canvas (requirements Risk 4) ─────────────────── */}
          {ctxMap && (
            <Card title="Context map">
              <div data-testid="context-map">
                {ctxMap.contexts.length === 0 && (
                  <p className={styles.emptyNote}>No capability is assigned to a bounded context yet.</p>
                )}
                {ctxMap.contexts.map((ctx) => (
                  <section
                    key={ctx.id}
                    id={`ctx-${ctx.id}`}
                    className={styles.contextGroup}
                    aria-label={ctx.name}
                    data-testid={`ctx-group-${ctx.id}`}
                  >
                    <h4 className={styles.gapHead}>
                      {ctx.name}
                      <span className={styles.contextMeta}>
                        {ctx.domain ?? "—"} / {ctx.subdomain ?? "—"}
                      </span>
                    </h4>
                    <ul className={styles.gapList}>
                      {ctx.capabilities.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className={styles.rowButton}
                            onClick={() => void openDetail(c.id)}
                          >
                            {c.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {ctx.relationships.length > 0 && (
                      <p className={styles.relRow}>
                        {ctx.relationships.map((r) => (
                          <button
                            key={`${r.type}-${r.targetId}`}
                            type="button"
                            className={styles.relLink}
                            data-target-id={r.targetId}
                            data-testid={`rel-${ctx.id}-${r.targetId}`}
                            onClick={() =>
                              document
                                .getElementById(`ctx-${r.targetId}`)
                                ?.scrollIntoView?.({ block: "nearest" })
                            }
                          >
                            {r.type === "UPSTREAM_OF" ? "upstream of" : "downstream of"}{" "}
                            {r.targetName}
                          </button>
                        ))}
                      </p>
                    )}
                  </section>
                ))}
                <section className={styles.contextGroup} aria-label="Unassigned capabilities">
                  <h4 className={styles.gapHead}>
                    Unassigned{" "}
                    <span data-testid="count-unassigned">({ctxMap.unassigned.length})</span>
                  </h4>
                  {ctxMap.unassigned.length === 0 ? (
                    <p className={styles.emptyNote}>Every capability has a context.</p>
                  ) : (
                    <ul className={styles.gapList} data-testid="list-unassigned">
                      {ctxMap.unassigned.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className={styles.rowButton}
                            onClick={() => void openDetail(c.id)}
                          >
                            {c.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── New capability (AC-15) ─────────────────────────────────── */}
      {createOpen && (
        <Modal isOpen title="New capability" onClose={() => setCreateOpen(false)}>
          <form
            className={styles.form}
            data-testid="create-form"
            onSubmit={(e) => {
              e.preventDefault();
              void createCapability();
            }}
          >
            <label className={styles.field}>
              Name
              <input
                type="text"
                value={createName}
                data-testid="create-name"
                onChange={(e) => setCreateName(e.target.value)}
              />
            </label>
            <Button type="submit">Create</Button>
          </form>
        </Modal>
      )}

      {/* ── Detail + mapping editing (AC-13) ───────────────────────── */}
      {detail && (
        <Modal isOpen title={detail.name} onClose={() => setDetail(null)}>
          <div className={styles.detail} data-testid="cap-detail-panel">
            <p className={styles.detailDescription} data-testid="detail-description">
              {detail.description.length > 0 ? detail.description : "No description."}
            </p>

            <form
              className={styles.form}
              data-testid="edit-form"
              onSubmit={(e) => {
                e.preventDefault();
                void runAction(
                  () =>
                    api.capabilities.patch(modelId, detail.id, {
                      name: editName,
                      description: editDescription,
                    }),
                  detail.id,
                );
              }}
            >
              <label className={styles.field}>
                Name
                <input
                  type="text"
                  value={editName}
                  data-testid="edit-name"
                  onChange={(e) => setEditName(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                Description
                <input
                  type="text"
                  value={editDescription}
                  data-testid="edit-description"
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </label>
              <Button type="submit">Save</Button>
            </form>

            <h3 className={styles.secTitle}>Needed by</h3>
            <ul className={styles.mappingList} data-testid="detail-needed-by">
              {(detail.neededBy ?? []).map((src) => (
                <li key={src.id} data-testid={`needed-by-${src.id}`}>
                  <a
                    href={
                      src.kind === "activity"
                        ? `#/explorer/activities/${encodeURIComponent(src.id)}`
                        : `#/model/stories/${encodeURIComponent(src.id)}`
                    }
                  >
                    {src.name}
                  </a>
                  <span className={styles.kindTag}>({src.kind})</span>
                  <Button
                    tone="ghost"
                    onClick={() =>
                      void runAction(
                        () =>
                          api.capabilities.neededBy.remove(
                            modelId,
                            detail.id,
                            src.kind === "activity" ? { activityId: src.id } : { storyId: src.id },
                          ),
                        detail.id,
                      )
                    }
                  >
                    Remove
                  </Button>
                </li>
              ))}
              {(detail.detached ?? [])
                .filter((d) => d.kind === "needed-by")
                .map((d) => (
                  <li key={d.targetId}>
                    <span className={styles.detached} data-testid={`detached-${d.targetId}`}>
                      detached
                    </span>{" "}
                    {d.targetId}
                  </li>
                ))}
            </ul>
            <form
              className={styles.form}
              data-testid="add-needed-by-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (neededById.trim().length === 0) return;
                void runAction(
                  () =>
                    api.capabilities.neededBy.put(
                      modelId,
                      detail.id,
                      neededByKind === "activity"
                        ? { activityId: neededById.trim() }
                        : { storyId: neededById.trim() },
                    ),
                  detail.id,
                );
                setNeededById("");
              }}
            >
              <label className={styles.field}>
                Source kind
                <select
                  value={neededByKind}
                  data-testid="needed-by-kind"
                  onChange={(e) => setNeededByKind(e.target.value === "story" ? "story" : "activity")}
                >
                  <option value="activity">Activity</option>
                  <option value="story">User story</option>
                </select>
              </label>
              <label className={styles.field}>
                Source id
                <input
                  type="text"
                  value={neededById}
                  data-testid="needed-by-id"
                  onChange={(e) => setNeededById(e.target.value)}
                />
              </label>
              <Button type="submit">Add needed-by</Button>
            </form>

            <h3 className={styles.secTitle}>Supported by</h3>
            <ul className={styles.mappingList} data-testid="detail-supported-by">
              {(detail.supportedBy ?? []).map((sys) => (
                <li key={sys.id} data-testid={`supported-by-${sys.id}`}>
                  <a href={`#/explorer/systems?focus=${encodeURIComponent(sys.id)}`}>{sys.name}</a>
                  <Pill tone="accent">{SYSTEM_KIND_LABELS[sys.systemKind]}</Pill>
                  {isDetached("supported-by", sys.id) && (
                    <span className={styles.detached}>detached</span>
                  )}
                  <Button
                    tone="ghost"
                    onClick={() =>
                      void runAction(
                        () => api.capabilities.supportedBy.remove(modelId, detail.id, sys.id),
                        detail.id,
                      )
                    }
                  >
                    Remove
                  </Button>
                </li>
              ))}
              {(detail.detached ?? [])
                .filter((d) => d.kind === "supported-by")
                .map((d) => (
                  <li key={d.targetId}>
                    <span className={styles.detached} data-testid={`detached-${d.targetId}`}>
                      detached
                    </span>{" "}
                    {d.targetId}
                  </li>
                ))}
            </ul>
            <form
              className={styles.form}
              data-testid="add-supported-by-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (systemIdInput.trim().length === 0) return;
                void runAction(
                  () =>
                    api.capabilities.supportedBy.put(modelId, detail.id, {
                      systemId: systemIdInput.trim(),
                    }),
                  detail.id,
                );
                setSystemIdInput("");
              }}
            >
              <label className={styles.field}>
                System id
                <input
                  type="text"
                  value={systemIdInput}
                  data-testid="supported-by-id"
                  onChange={(e) => setSystemIdInput(e.target.value)}
                />
              </label>
              <Button type="submit">Add system</Button>
            </form>

            <h3 className={styles.secTitle}>Bounded context</h3>
            <p className={styles.mappingList} data-testid="detail-context">
              {detail.assignedContext ? (
                <>
                  {detail.assignedContext.name}
                  <span className={styles.contextMeta}>
                    {detail.assignedContext.domain ?? "—"} /{" "}
                    {detail.assignedContext.subdomain ?? "—"}
                  </span>
                  <Button
                    tone="ghost"
                    onClick={() =>
                      void runAction(
                        () => api.capabilities.context.clear(modelId, detail.id),
                        detail.id,
                      )
                    }
                  >
                    Clear
                  </Button>
                </>
              ) : (
                <>
                  <span className={styles.emptyNote}>unassigned</span>
                  {(detail.detached ?? [])
                    .filter((d) => d.kind === "context")
                    .map((d) => (
                      <span
                        key={d.targetId}
                        className={styles.detached}
                        data-testid={`detached-${d.targetId}`}
                      >
                        detached
                      </span>
                    ))}
                </>
              )}
            </p>
            <form
              className={styles.form}
              data-testid="set-context-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (contextIdInput.trim().length === 0) return;
                void runAction(
                  () =>
                    api.capabilities.context.put(modelId, detail.id, {
                      boundedContextId: contextIdInput.trim(),
                    }),
                  detail.id,
                );
                setContextIdInput("");
              }}
            >
              <label className={styles.field}>
                Bounded context id
                <input
                  type="text"
                  value={contextIdInput}
                  data-testid="context-id"
                  onChange={(e) => setContextIdInput(e.target.value)}
                />
              </label>
              <Button type="submit">Set context</Button>
            </form>

            {mixByCapability.has(detail.id) && (
              <>
                <h3 className={styles.secTitle}>Augmentation mix</h3>
                <KindPills
                  counts={mixByCapability.get(detail.id)!.counts}
                  testId="detail-mix"
                />
              </>
            )}

            <div className={styles.dangerRow}>
              <Button
                tone="ghost"
                onClick={() => {
                  void (async () => {
                    setActionError(null);
                    try {
                      await api.capabilities.remove(modelId, detail.id);
                      setDetail(null);
                      await refetch();
                    } catch (err) {
                      setActionError(err instanceof Error ? err.message : String(err));
                    }
                  })();
                }}
              >
                Delete capability
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
