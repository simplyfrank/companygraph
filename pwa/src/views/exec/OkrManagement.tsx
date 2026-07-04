// kpi-okr-governance T-18 (FR-15, FR-16) — OkrManagement on the REST
// contract: okr.listDirectives() (unfiltered GET /api/v1/okr-directives,
// FR-10c) replaces the raw cypher-passthrough call; rows expose the mapped
// camelCase createdAt (REST list returns the mapped shape, design §4.5).
// The unused OkrCrud import is dropped; OkrPerformanceBoard stays on the
// performance tab (it already uses api.okr.getPerformance). Catalog
// components only; tokens-only CSS module; the app shell provides the
// <main> landmark (pwa/src/App.tsx) — no view-level <main>.

import { useState, useEffect, type FormEvent } from "react";
import { okr, type OKRDirective } from "../../api";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { DataTable } from "../../components/DataTable";
import { OkrPerformanceBoard } from "../../components/OkrPerformanceBoard";
import styles from "./OkrManagement.module.css";

type Tab = "cycles" | "performance";

interface CreateFormState {
  name: string;
  description: string;
  cycle_name: string;
  cycle_start: string;
  cycle_end: string;
  status: "draft" | "active" | "review" | "closed";
  review_cadence: "weekly" | "monthly" | "quarterly";
}

const EMPTY_FORM: CreateFormState = {
  name: "",
  description: "",
  cycle_name: "",
  cycle_start: "",
  cycle_end: "",
  status: "draft",
  review_cadence: "monthly",
};

function statusTone(status: string): "accent" | "neutral" | "warn" {
  if (status === "active") return "accent";
  if (status === "review") return "warn";
  return "neutral";
}

export function ExecOkrManagement() {
  const [directives, setDirectives] = useState<OKRDirective[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("cycles");
  const [selectedDirective, setSelectedDirective] = useState<OKRDirective | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDirectives();
  }, []);

  const loadDirectives = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await okr.listDirectives();
      setDirectives(data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load OKR cycles");
    } finally {
      setLoading(false);
    }
  };

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await okr.createDirective({
        name: form.name,
        description: form.description,
        attributes: {
          cycle_name: form.cycle_name,
          cycle_start: form.cycle_start,
          cycle_end: form.cycle_end,
          status: form.status,
          review_cadence: form.review_cadence,
        },
      });
      setShowCreateModal(false);
      setForm(EMPTY_FORM);
      await loadDirectives();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create OKR cycle");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading what="OKR management" />;
  if (error) return <ErrorState message={error} />;

  const field = (key: keyof CreateFormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <ViewHeader
        title="OKR Management"
        lede="Create and manage organizational OKR cycles, objectives, and key results"
      />

      <div className={styles.tabs} role="tablist" aria-label="OKR management sections">
        <span className={styles.tab} role="tab" aria-selected={activeTab === "cycles"}>
          <Button tone={activeTab === "cycles" ? "primary" : "default"} onClick={() => setActiveTab("cycles")}>
            OKR Cycles
          </Button>
        </span>
        <span className={styles.tab} role="tab" aria-selected={activeTab === "performance"}>
          <Button tone={activeTab === "performance" ? "primary" : "default"} onClick={() => setActiveTab("performance")}>
            Performance Board
          </Button>
        </span>
      </div>

      {activeTab === "cycles" && (
        <div className={styles.stack}>
          <Card>
            <div className={styles.toolbar}>
              <h2 className={styles.sectionTitle}>Organizational OKR Cycles</h2>
              <Button tone="primary" onClick={() => setShowCreateModal(true)}>
                + Create OKR Cycle
              </Button>
            </div>

            {directives.length === 0 ? (
              <div className={styles.empty} data-testid="empty-state">
                <p>No OKR cycles yet.</p>
                <Button tone="primary" onClick={() => setShowCreateModal(true)}>
                  + Create OKR Cycle
                </Button>
              </div>
            ) : (
              <DataTable
                columns={[
                  { id: "cycle", label: "Cycle Name" },
                  { id: "status", label: "Status" },
                  { id: "start", label: "Start Date" },
                  { id: "end", label: "End Date" },
                  { id: "cadence", label: "Review Cadence" },
                  { id: "created", label: "Created" },
                  { id: "actions", label: "Actions" },
                ]}
                rows={directives.map((directive) => ({
                  cycle: directive.attributes.cycle_name,
                  status: <Pill tone={statusTone(directive.attributes.status)}>{directive.attributes.status}</Pill>,
                  start: new Date(directive.attributes.cycle_start).toLocaleDateString(),
                  end: new Date(directive.attributes.cycle_end).toLocaleDateString(),
                  cadence: directive.attributes.review_cadence,
                  // Mapped REST shape carries camelCase createdAt (§4.5).
                  created: directive.createdAt ? new Date(directive.createdAt).toLocaleDateString() : "-",
                  actions: (
                    <Button tone="ghost" onClick={() => setSelectedDirective(directive)}>
                      View
                    </Button>
                  ),
                }))}
              />
            )}
          </Card>

          {selectedDirective && (
            <Card>
              <div className={styles.toolbar}>
                <h2 className={styles.sectionTitle}>
                  {selectedDirective.attributes.cycle_name} - Details
                </h2>
                <Button onClick={() => setSelectedDirective(null)}>Close</Button>
              </div>

              <div className={styles.detailGrid}>
                <div>
                  <p className={styles.detailLabel}>Description</p>
                  <p className={styles.detailValue}>{selectedDirective.description}</p>
                </div>
                <div>
                  <p className={styles.detailLabel}>Status</p>
                  <p className={styles.detailValue}>{selectedDirective.attributes.status}</p>
                </div>
                <div>
                  <p className={styles.detailLabel}>Start Date</p>
                  <p className={styles.detailValue}>
                    {new Date(selectedDirective.attributes.cycle_start).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className={styles.detailLabel}>End Date</p>
                  <p className={styles.detailValue}>
                    {new Date(selectedDirective.attributes.cycle_end).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className={styles.detailFooter}>
                Key results for this OKR cycle will be displayed here.
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === "performance" && (
        <Card>
          <h2 className={styles.sectionTitle}>Organizational OKR Performance</h2>
          <OkrPerformanceBoard domainId="" domainName="Organization" />
        </Card>
      )}

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create OKR Cycle">
        <form className={styles.form} onSubmit={submitCreate}>
          <label className={styles.field}>
            <span className={styles.label}>Name</span>
            <input className={styles.input} value={form.name} onChange={field("name")} required />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Description</span>
            <input className={styles.input} value={form.description} onChange={field("description")} required />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Cycle name</span>
            <input className={styles.input} value={form.cycle_name} onChange={field("cycle_name")} required />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Cycle start</span>
            <input className={styles.input} type="date" value={form.cycle_start} onChange={field("cycle_start")} required />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Cycle end</span>
            <input className={styles.input} type="date" value={form.cycle_end} onChange={field("cycle_end")} required />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Status</span>
            <select className={styles.input} value={form.status} onChange={field("status")}>
              {["draft", "active", "review", "closed"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Review cadence</span>
            <select className={styles.input} value={form.review_cadence} onChange={field("review_cadence")}>
              {["weekly", "monthly", "quarterly"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          {formError && <p className={styles.formError} role="alert">{formError}</p>}
          <div className={styles.formActions}>
            <Button onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button tone="primary" type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create OKR Cycle"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
