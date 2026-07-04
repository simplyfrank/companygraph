// model-workspace-core T-20 (design §6, FR-16, UX-01/02/05) —
// #/model/models. Lists every business model from the single
// GET /api/v1/models the shell-level ActiveModelContext already
// performed (ordinal, name, status, reference badge,
// moduleInstanceCount — no per-model fetch). Actions: create (Modal →
// POST /api/v1/models → context reload), switch active (context +
// localStorage persist), archive (non-reference only). Four states:
// loading (skeleton) / empty (only the reference model) / error
// (ErrorState + retry) / ready. Catalog components first (Button,
// Modal, _shared Loading/ErrorState); tokens-only styling via the
// CSS module (NFR-06 — every var(--…) resolves against
// pwa/src/styles/companygraph/tokens.css).
//
// Keyboard (AC-17): Tab reaches create → switch → archive in DOM
// order; every control is a native <button> so Enter/Space activate;
// the surface exposes an ARIA landmark (<section aria-label>).

import { useState, type FormEvent } from "react";
import { useActiveModel } from "../../context/ActiveModelContext";
import { models as modelsApi, type ModelRead } from "../../api";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { ViewHeader, ErrorState } from "../_shared";
import styles from "./ModelWorkspace.module.css";

function ModelRow({
  model,
  isActive,
  onSwitch,
  onArchive,
  busy,
}: {
  model: ModelRead;
  isActive: boolean;
  onSwitch: (id: string) => void;
  onArchive: (id: string) => void;
  busy: boolean;
}) {
  return (
    <li
      className={isActive ? `${styles.row} ${styles.rowActive}` : styles.row}
      data-testid={`model-row-${model.id}`}
      aria-current={isActive ? "true" : undefined}
    >
      <span className={styles.ordinal} aria-label={`Ordinal ${model.ordinal}`}>
        #{model.ordinal}
      </span>
      <span className={styles.name}>{model.name}</span>
      <span className={styles.meta}>
        {model.isReference && (
          <span className={`${styles.badge} ${styles.badgeReference}`} data-testid="reference-badge">
            reference
          </span>
        )}
        {model.status === "archived" && (
          <span className={`${styles.badge} ${styles.badgeArchived}`}>archived</span>
        )}
        <span className={styles.count} data-testid={`instance-count-${model.id}`}>
          {model.moduleInstanceCount} instance{model.moduleInstanceCount === 1 ? "" : "s"}
        </span>
        <Button
          tone={isActive ? "primary" : "default"}
          pressed={isActive}
          disabled={busy || isActive}
          onClick={() => onSwitch(model.id)}
        >
          {isActive ? "Active" : "Switch"}
        </Button>
        {!model.isReference && model.status !== "archived" && (
          <Button tone="ghost" disabled={busy} onClick={() => onArchive(model.id)}>
            Archive
          </Button>
        )}
      </span>
    </li>
  );
}

export function ModelWorkspace() {
  const { models, activeModel, status, error, setActiveModel, reload } = useActiveModel();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await modelsApi.create({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setCreateOpen(false);
      setName("");
      setDescription("");
      await reload(); // refresh list + context (AC-12)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onArchive = async (id: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await modelsApi.archive(id);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // Empty = the ready list holds nothing but the reference model
  // (AC-14): prompt the first user-model create.
  const onlyReference = status === "ready" && models.every((m) => m.isReference);

  return (
    <section className={styles.workspace} aria-label="Business models" data-testid="model-workspace">
      <ViewHeader
        title="Business Models"
        lede="Each model scopes its own process structure; modules publish, instantiate, fork and upgrade per model."
      />

      {/* Create is FIRST in DOM order so Tab reaches create → switch → archive (AC-17). */}
      <div>
        <Button tone="primary" onClick={() => setCreateOpen(true)} disabled={status !== "ready" || busy}>
          Create model
        </Button>
      </div>

      {actionError && <ErrorState message={actionError} />}

      {status === "loading" && (
        <ul className={styles.list} aria-hidden="true" data-testid="model-skeleton">
          <li className={styles.skeleton} />
          <li className={styles.skeleton} />
          <li className={styles.skeleton} />
        </ul>
      )}

      {status === "error" && (
        <div data-testid="model-error">
          <ErrorState message={error ?? "Failed to load models"} />
          <Button onClick={() => void reload()}>Retry</Button>
        </div>
      )}

      {status === "ready" && onlyReference && (
        <div className={styles.empty} data-testid="model-empty">
          <p>
            Only the reference model exists so far. Create your first business model to start
            composing modules.
          </p>
          <Button tone="primary" onClick={() => setCreateOpen(true)}>
            Create your first business model
          </Button>
        </div>
      )}

      {status === "ready" && (
        <ul className={styles.list} data-testid="model-list">
          {models.map((m) => (
            <ModelRow
              key={m.id}
              model={m}
              isActive={activeModel?.id === m.id}
              onSwitch={setActiveModel}
              onArchive={(id) => void onArchive(id)}
              busy={busy}
            />
          ))}
        </ul>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create business model">
        <form className={styles.form} onSubmit={(e) => void onCreate(e)} data-testid="model-create-form">
          <label className={styles.label}>
            Name
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              data-testid="model-create-name"
            />
          </label>
          <label className={styles.label}>
            Description (optional)
            <input
              className={styles.input}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="model-create-description"
            />
          </label>
          <div className={styles.formActions}>
            <Button tone="ghost" onClick={() => setCreateOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button tone="primary" type="submit" disabled={busy || !name.trim()}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
