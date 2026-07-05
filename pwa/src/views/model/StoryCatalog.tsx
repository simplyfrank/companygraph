// story-spec-core T-14 (design §4.10, §6, FR-12/FR-13/FR-14) —
// #/model/stories (route VERBATIM from the blueprint View Tree; the
// tab itself was registered by model-workspace-core — this spec only
// swaps the VIEWS dispatch target).
//
// Reads the active BusinessModel from the shell-owned useActiveModel()
// (never re-implements model selection), keys its fetch on
// activeModel.id (switch/reload → refetch for the persisted model,
// AC-17), and renders ALL FOUR states (UX-01):
//   loading — skeleton via _shared Loading (AC-12)
//   empty   — Card offering "Generate from graph" + manual Create;
//             a {created:0, skipped:0} bootstrap adds the DD-09
//             fork-first hint (AC-13)
//   error   — _shared ErrorState PLUS a local retry Button rendered
//             HERE (ErrorState renders no retry itself; AC-14)
//   ready   — DataTable rows: narrative (null-safe `narrative ?? name`
//             per the C-07 pin), activity, role, AC count; "derived" /
//             "detached" badges (AC-10)
// Detail + edit (AC-11): a catalog Modal with the narrative,
// activity/role, ACs as Given/When/Then triples; edit story (PATCH),
// add/edit/delete/REORDER ACs (up/down buttons → PATCH {ordinal} —
// keyboard-reachable, no drag handler per Native Conflicts), delete
// story, per-story "Generate from graph" ({activityIds:[activityId]}).
// Tokens-only styling via StoryCatalog.module.css (NFR-06); catalog
// components first (Card, DataTable, Modal, Button, _shared).

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Route } from "../../route";
import { useActiveModel } from "../../context/ActiveModelContext";
import { stories as storiesApi, type StoryRead, type AcRead } from "../../api";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Modal } from "../../components/Modal";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./StoryCatalog.module.css";

type ViewState = "loading" | "empty" | "error" | "ready";

const FORK_FIRST_HINT =
  "no materialized activities — if this model uses pinned modules, fork the module first, then generate";

function DerivedBadge() {
  return (
    <span className={`${styles.badge} ${styles.badgeDerived}`} data-testid="derived-badge">
      derived
    </span>
  );
}

function DetachedBadge() {
  return (
    <span className={`${styles.badge} ${styles.badgeDetached}`} data-testid="detached-badge">
      detached
    </span>
  );
}

// ---------------------------------------------------------------------------
// AC row (detail panel): GWT triple + edit form + reorder + delete.
// ---------------------------------------------------------------------------

function AcRow({
  ac,
  isFirst,
  isLast,
  onEdit,
  onDelete,
  onMove,
  busy,
}: {
  ac: AcRead;
  isFirst: boolean;
  isLast: boolean;
  onEdit: (acId: string, patch: { given?: string; when?: string; then?: string }) => Promise<void>;
  onDelete: (acId: string) => Promise<void>;
  onMove: (acId: string, direction: -1 | 1) => Promise<void>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [given, setGiven] = useState(ac.given);
  const [when, setWhen] = useState(ac.when);
  const [then, setThen] = useState(ac.then);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    await onEdit(ac.id, { given, when, then });
    setEditing(false);
  };

  return (
    <li className={styles.acRow} data-testid={`ac-row-${ac.id}`}>
      {editing ? (
        <form className={styles.acForm} onSubmit={save}>
          <label className={styles.clauseLabel}>
            Given
            <input value={given} onChange={(e) => setGiven(e.target.value)} required />
          </label>
          <label className={styles.clauseLabel}>
            When
            <input value={when} onChange={(e) => setWhen(e.target.value)} required />
          </label>
          <label className={styles.clauseLabel}>
            Then
            <input value={then} onChange={(e) => setThen(e.target.value)} required />
          </label>
          <div className={styles.acActions}>
            <Button type="submit" tone="primary" disabled={busy}>
              Save AC
            </Button>
            <Button tone="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className={styles.acClauses}>
            <span className={styles.ordinal}>#{ac.ordinal}</span>
            <span>
              <strong>Given</strong> {ac.given} <strong>When</strong> {ac.when}{" "}
              <strong>Then</strong> {ac.then}
            </span>
            {ac.derived && <DerivedBadge />}
          </div>
          <div className={styles.acActions}>
            {/* Reorder: keyboard-reachable up/down buttons (no drag
                handler — Native Conflicts). Textual labels double as
                the accessible names (the catalog Button forwards no
                aria-label). */}
            <Button
              tone="ghost"
              disabled={busy || isFirst}
              onClick={() => void onMove(ac.id, -1)}
            >
              Move up
            </Button>
            <Button
              tone="ghost"
              disabled={busy || isLast}
              onClick={() => void onMove(ac.id, 1)}
            >
              Move down
            </Button>
            <Button tone="ghost" disabled={busy} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button tone="danger" disabled={busy} onClick={() => void onDelete(ac.id)}>
              Delete
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// The view.
// ---------------------------------------------------------------------------

export function StoryCatalog({ route }: { route: Route }) {
  void route; // dispatch passes it; the view keys on the active model instead
  const { activeModel, status: modelStatus } = useActiveModel();
  const modelId = activeModel?.id ?? null;

  const [state, setState] = useState<ViewState>("loading");
  const [rows, setRows] = useState<StoryRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [forkHint, setForkHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Detail panel.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StoryRead | null>(null);
  const [editingStory, setEditingStory] = useState(false);
  const [storyForm, setStoryForm] = useState({ persona: "", action: "", benefit: "" });
  const [newAc, setNewAc] = useState({ given: "", when: "", then: "" });

  // Create modal.
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    persona: "",
    action: "",
    benefit: "",
    activityId: "",
  });

  const refetch = useCallback(async () => {
    if (!modelId) return;
    setState("loading");
    setError(null);
    try {
      const list = await storiesApi.list(modelId);
      setRows(list);
      setState(list.length === 0 ? "empty" : "ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }, [modelId]);

  // Keyed on activeModel.id — model switch (shell context) and reload
  // both refetch for the persisted model (FR-14 / AC-17).
  useEffect(() => {
    setForkHint(false);
    setSelectedId(null);
    setDetail(null);
    void refetch();
  }, [refetch]);

  const openDetail = useCallback(
    async (storyId: string) => {
      if (!modelId) return;
      setSelectedId(storyId);
      setEditingStory(false);
      try {
        const d = await storiesApi.get(modelId, storyId);
        setDetail(d);
        setStoryForm({
          persona: d.persona ?? "",
          action: d.action ?? "",
          benefit: d.benefit ?? "",
        });
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      }
    },
    [modelId],
  );

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setEditingStory(false);
  }, []);

  const run = useCallback(
    async (work: () => Promise<void>) => {
      setBusy(true);
      setActionError(null);
      try {
        await work();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const bootstrap = useCallback(
    async (activityIds?: string[]) => {
      if (!modelId) return;
      await run(async () => {
        const result = await storiesApi.bootstrap(
          modelId,
          activityIds ? { activityIds } : undefined,
        );
        // DD-09: a pinned-only model bootstraps to {0,0} → fork-first hint.
        setForkHint(result.created === 0 && result.skipped === 0);
        await refetch();
        if (selectedId) await openDetail(selectedId);
      });
    },
    [modelId, run, refetch, selectedId, openDetail],
  );

  const createStory = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!modelId) return;
      await run(async () => {
        await storiesApi.create(modelId, {
          persona: createForm.persona,
          action: createForm.action,
          benefit: createForm.benefit,
          activityId: createForm.activityId,
        });
        setCreateOpen(false);
        setCreateForm({ persona: "", action: "", benefit: "", activityId: "" });
        await refetch();
      });
    },
    [modelId, run, createForm, refetch],
  );

  const saveStory = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!modelId || !detail) return;
      await run(async () => {
        const patched = await storiesApi.patch(modelId, detail.id, storyForm);
        setEditingStory(false);
        // The PATCH response's derived:false re-renders the badge away.
        setDetail({ ...detail, ...patched });
        await refetch();
      });
    },
    [modelId, detail, storyForm, run, refetch],
  );

  const deleteStory = useCallback(async () => {
    if (!modelId || !detail) return;
    await run(async () => {
      await storiesApi.remove(modelId, detail.id);
      closeDetail();
      await refetch();
    });
  }, [modelId, detail, run, closeDetail, refetch]);

  const addAc = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!modelId || !detail) return;
      await run(async () => {
        await storiesApi.acs.create(modelId, detail.id, newAc);
        setNewAc({ given: "", when: "", then: "" });
        await openDetail(detail.id);
      });
    },
    [modelId, detail, newAc, run, openDetail],
  );

  const editAc = useCallback(
    async (acId: string, patch: { given?: string; when?: string; then?: string }) => {
      if (!modelId || !detail) return;
      await run(async () => {
        await storiesApi.acs.patch(modelId, detail.id, acId, patch);
        await openDetail(detail.id);
      });
    },
    [modelId, detail, run, openDetail],
  );

  const deleteAc = useCallback(
    async (acId: string) => {
      if (!modelId || !detail) return;
      await run(async () => {
        await storiesApi.acs.remove(modelId, detail.id, acId);
        await openDetail(detail.id);
      });
    },
    [modelId, detail, run, openDetail],
  );

  // Reorder = up/down buttons → PATCH {ordinal} (swap with the
  // neighbor). Keyboard-reachable; no drag handler (Native Conflicts).
  const moveAc = useCallback(
    async (acId: string, direction: -1 | 1) => {
      if (!modelId || !detail?.acceptanceCriteria) return;
      const acs = detail.acceptanceCriteria;
      const idx = acs.findIndex((ac) => ac.id === acId);
      const neighbor = acs[idx + direction];
      if (idx === -1 || !neighbor) return;
      const self = acs[idx]!;
      await run(async () => {
        await storiesApi.acs.patch(modelId, detail.id, self.id, { ordinal: neighbor.ordinal });
        await storiesApi.acs.patch(modelId, detail.id, neighbor.id, { ordinal: self.ordinal });
        await openDetail(detail.id);
      });
    },
    [modelId, detail, run, openDetail],
  );

  // ── shell-context states ──────────────────────────────────────────
  if (modelStatus === "loading") {
    return (
      <section className={styles.view} aria-label="User stories">
        <Loading what="the active model" />
      </section>
    );
  }
  if (!modelId) {
    return (
      <section className={styles.view} aria-label="User stories">
        <ErrorState message="no active business model" />
      </section>
    );
  }

  const generateButton = (
    <Button tone="primary" disabled={busy} onClick={() => void bootstrap()}>
      Generate from graph
    </Button>
  );
  const createButton = (
    <Button disabled={busy} onClick={() => setCreateOpen(true)}>
      Create story
    </Button>
  );

  return (
    <section className={styles.view} aria-label="User stories" data-testid="story-catalog">
      <ViewHeader
        title="Stories"
        lede={`User stories + acceptance criteria for ${activeModel!.name}`}
      />

      {actionError && <p className={styles.actionError} role="alert">{actionError}</p>}

      {state === "loading" && <Loading what="stories" />}

      {state === "error" && (
        <div className={styles.errorWrap}>
          <ErrorState message={error ?? "failed to load stories"} />
          {/* AC-14 — the retry lives HERE, not in ErrorState. */}
          <Button onClick={() => void refetch()}>Retry</Button>
        </div>
      )}

      {state === "empty" && (
        <Card title="No stories yet">
          <p className={styles.emptyLede}>
            Derive candidate stories from the model's activities, roles and journeys — then edit
            them like any hand-written story.
          </p>
          {forkHint && (
            <p className={styles.hint} data-testid="fork-first-hint">
              {FORK_FIRST_HINT}
            </p>
          )}
          <div className={styles.emptyActions}>
            {generateButton}
            {createButton}
          </div>
        </Card>
      )}

      {state === "ready" && (
        <Card
          title="Story catalog"
          actions={
            <div className={styles.headActions}>
              {generateButton}
              {createButton}
            </div>
          }
        >
          <DataTable
            columns={[
              { id: "narrative", label: "Story" },
              { id: "activity", label: "Activity" },
              { id: "role", label: "Role" },
              { id: "acs", label: "ACs", align: "right", kind: "num" },
              { id: "flags", label: "" },
            ]}
            rows={rows.map((s) => ({
              narrative: (
                <button
                  type="button"
                  className={styles.rowButton}
                  onClick={() => void openDetail(s.id)}
                  data-testid={`story-row-${s.id}`}
                >
                  {s.narrative ?? s.name /* C-07 null-safe fallback */}
                </button>
              ),
              activity: s.activityName ?? "—",
              role: s.roleName ?? "—",
              acs: s.acCount,
              flags: (
                <span className={styles.flags}>
                  {s.derived && <DerivedBadge />}
                  {s.detached && <DetachedBadge />}
                </span>
              ),
            }))}
          />
        </Card>
      )}

      {/* ── Create modal (manual affordance, AC-13) ── */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create story">
        <form className={styles.form} onSubmit={createStory}>
          <label className={styles.clauseLabel}>
            Persona
            <input
              value={createForm.persona}
              onChange={(e) => setCreateForm({ ...createForm, persona: e.target.value })}
              required
            />
          </label>
          <label className={styles.clauseLabel}>
            Action
            <input
              value={createForm.action}
              onChange={(e) => setCreateForm({ ...createForm, action: e.target.value })}
              required
            />
          </label>
          <label className={styles.clauseLabel}>
            Benefit
            <input
              value={createForm.benefit}
              onChange={(e) => setCreateForm({ ...createForm, benefit: e.target.value })}
              required
            />
          </label>
          <label className={styles.clauseLabel}>
            Activity id
            <input
              value={createForm.activityId}
              onChange={(e) => setCreateForm({ ...createForm, activityId: e.target.value })}
              required
            />
          </label>
          <div className={styles.acActions}>
            <Button type="submit" tone="primary" disabled={busy}>
              Create
            </Button>
            <Button tone="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Detail + edit (AC-11) — catalog Modal (focus-trap + Escape reused) ── */}
      <Modal
        isOpen={selectedId !== null && detail !== null}
        onClose={closeDetail}
        title="Story detail"
      >
        {detail && (
          <div className={styles.detail} data-testid="story-detail">
            <p className={styles.narrative}>
              {detail.narrative ?? detail.name}
              {detail.derived && <DerivedBadge />}
              {detail.detached && <DetachedBadge />}
            </p>
            <dl className={styles.meta}>
              <dt>Activity</dt>
              <dd>{detail.activityName ?? (detail.detached ? "(deleted — re-point or delete)" : "—")}</dd>
              <dt>Role</dt>
              <dd>{detail.roleName ?? "—"}</dd>
            </dl>

            {editingStory ? (
              <form className={styles.form} onSubmit={saveStory}>
                <label className={styles.clauseLabel}>
                  Persona
                  <input
                    value={storyForm.persona}
                    onChange={(e) => setStoryForm({ ...storyForm, persona: e.target.value })}
                    required
                  />
                </label>
                <label className={styles.clauseLabel}>
                  Action
                  <input
                    value={storyForm.action}
                    onChange={(e) => setStoryForm({ ...storyForm, action: e.target.value })}
                    required
                  />
                </label>
                <label className={styles.clauseLabel}>
                  Benefit
                  <input
                    value={storyForm.benefit}
                    onChange={(e) => setStoryForm({ ...storyForm, benefit: e.target.value })}
                    required
                  />
                </label>
                <div className={styles.acActions}>
                  <Button type="submit" tone="primary" disabled={busy}>
                    Save story
                  </Button>
                  <Button tone="ghost" onClick={() => setEditingStory(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className={styles.detailActions}>
                <Button disabled={busy} onClick={() => setEditingStory(true)}>
                  Edit story
                </Button>
                {detail.activityId && (
                  <Button
                    tone="ghost"
                    disabled={busy}
                    onClick={() => void bootstrap([detail.activityId!])}
                  >
                    Generate from graph
                  </Button>
                )}
                <Button tone="danger" disabled={busy} onClick={() => void deleteStory()}>
                  Delete story
                </Button>
              </div>
            )}

            <h3 className={styles.acHeading}>Acceptance criteria</h3>
            <ul className={styles.acList}>
              {(detail.acceptanceCriteria ?? []).map((ac, i, all) => (
                <AcRow
                  key={ac.id}
                  ac={ac}
                  isFirst={i === 0}
                  isLast={i === all.length - 1}
                  onEdit={editAc}
                  onDelete={deleteAc}
                  onMove={moveAc}
                  busy={busy}
                />
              ))}
            </ul>

            <form className={styles.acForm} onSubmit={addAc} data-testid="add-ac-form">
              <label className={styles.clauseLabel}>
                Given
                <input
                  value={newAc.given}
                  onChange={(e) => setNewAc({ ...newAc, given: e.target.value })}
                  required
                />
              </label>
              <label className={styles.clauseLabel}>
                When
                <input
                  value={newAc.when}
                  onChange={(e) => setNewAc({ ...newAc, when: e.target.value })}
                  required
                />
              </label>
              <label className={styles.clauseLabel}>
                Then
                <input
                  value={newAc.then}
                  onChange={(e) => setNewAc({ ...newAc, then: e.target.value })}
                  required
                />
              </label>
              <Button type="submit" disabled={busy}>
                Add AC
              </Button>
            </form>
          </div>
        )}
      </Modal>
    </section>
  );
}
