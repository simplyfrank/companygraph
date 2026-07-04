// kpi-okr-governance T-16 (FR-15, FR-16) — KpiManagement on the REST
// contract: api.kpi.list() + api.domains.list() replace the two raw
// cypher-passthrough calls; rows read snake_case created_at (the KPI
// nodes never had createdAt — the as-built mismatch this fixes). Catalog
// components only; tokens-only CSS module; the app shell provides the
// <main> landmark (pwa/src/App.tsx) — this view does NOT render its own.

import { useState, useEffect, type FormEvent } from "react";
import { api, type KPI, type DomainRow } from "../../api";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { DataTable } from "../../components/DataTable";
import styles from "./KpiManagement.module.css";

type Tab = "list" | "assignments";

interface CreateFormState {
  name: string;
  category: KPI["category"];
  unit: string;
  target_value: string;
  target_direction: KPI["target_direction"];
  measurement_frequency: KPI["measurement_frequency"];
  owner_role: string;
  domain_id: string;
}

const EMPTY_FORM: CreateFormState = {
  name: "",
  category: "efficiency",
  unit: "",
  target_value: "",
  target_direction: "higher_is_better",
  measurement_frequency: "daily",
  owner_role: "",
  domain_id: "",
};

export function ExecKpiManagement() {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("list");
  const [selectedKpi, setSelectedKpi] = useState<KPI | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [kpiData, domainData] = await Promise.all([
        api.kpi.list(),
        api.domains.list(),
      ]);
      setKpis(kpiData.rows);
      setDomains(domainData.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await api.kpi.create({
        name: form.name,
        category: form.category,
        unit: form.unit,
        target_value: Number(form.target_value),
        target_direction: form.target_direction,
        measurement_frequency: form.measurement_frequency,
        ...(form.owner_role ? { owner_role: form.owner_role } : {}),
        ...(form.domain_id ? { domain_id: form.domain_id } : {}),
      });
      setShowCreateModal(false);
      setForm(EMPTY_FORM);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create KPI");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading what="KPI management" />;
  if (error) return <ErrorState message={error} />;

  const field = (key: keyof CreateFormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <ViewHeader
        title="KPI Management"
        lede="Define and manage organizational KPIs, assign to domains with contribution weights"
      />

      <div className={styles.tabs} role="tablist" aria-label="KPI management sections">
        <span className={styles.tab} role="tab" aria-selected={activeTab === "list"}>
          <Button tone={activeTab === "list" ? "primary" : "default"} onClick={() => setActiveTab("list")}>
            KPI List
          </Button>
        </span>
        <span className={styles.tab} role="tab" aria-selected={activeTab === "assignments"}>
          <Button tone={activeTab === "assignments" ? "primary" : "default"} onClick={() => setActiveTab("assignments")}>
            Domain Assignments
          </Button>
        </span>
      </div>

      {activeTab === "list" && (
        <Card>
          <div className={styles.toolbar}>
            <h2 className={styles.sectionTitle}>Organizational KPIs</h2>
            <Button tone="primary" onClick={() => setShowCreateModal(true)}>
              + Create KPI
            </Button>
          </div>

          {kpis.length === 0 ? (
            <div className={styles.empty} data-testid="empty-state">
              <p>No KPIs defined yet — create the first one.</p>
              <Button tone="primary" onClick={() => setShowCreateModal(true)}>
                + Create KPI
              </Button>
            </div>
          ) : (
            <DataTable
              columns={[
                { id: "name", label: "Name" },
                { id: "category", label: "Category" },
                { id: "target", label: "Target" },
                { id: "direction", label: "Direction" },
                { id: "frequency", label: "Frequency" },
                { id: "owner", label: "Owner" },
                { id: "created", label: "Created" },
                { id: "actions", label: "Actions" },
              ]}
              rows={kpis.map((kpi) => ({
                name: kpi.name,
                category: <Pill tone="neutral">{kpi.category}</Pill>,
                target: `${kpi.target_value} ${kpi.unit}`,
                direction: kpi.target_direction,
                frequency: kpi.measurement_frequency,
                owner: kpi.owner_role || "-",
                // FR-15 — dates derive from snake_case created_at (the
                // as-built view read a createdAt that never existed).
                created: kpi.created_at ? new Date(kpi.created_at).toLocaleDateString() : "-",
                actions: (
                  <Button
                    tone="ghost"
                    onClick={() => {
                      setSelectedKpi(kpi);
                      setActiveTab("assignments");
                    }}
                  >
                    Assign
                  </Button>
                ),
              }))}
            />
          )}
        </Card>
      )}

      {activeTab === "assignments" && selectedKpi && (
        <Card>
          <div className={styles.toolbar}>
            <h2 className={styles.sectionTitle}>Domain Assignments: {selectedKpi.name}</h2>
            <Button onClick={() => setSelectedKpi(null)}>Back to List</Button>
          </div>

          <div className={styles.meta}>
            <strong>Target:</strong> {selectedKpi.target_value} {selectedKpi.unit} |{" "}
            <strong>Direction:</strong> {selectedKpi.target_direction}
          </div>

          <DataTable
            columns={[
              { id: "domain", label: "Domain" },
              { id: "weight", label: "Weight (%)" },
              { id: "target", label: "Domain Target" },
              { id: "status", label: "Status" },
            ]}
            rows={domains.map((domain) => ({
              domain: domain.name,
              weight: (
                <input
                  type="number"
                  min="0"
                  max="100"
                  className={styles.assignInput}
                  placeholder="0"
                  aria-label={`Weight for ${domain.name}`}
                />
              ),
              target: (
                <input
                  type="number"
                  className={styles.assignInput}
                  placeholder={String(selectedKpi.target_value)}
                  aria-label={`Target for ${domain.name}`}
                />
              ),
              status: <Pill tone="neutral">Not assigned</Pill>,
            }))}
          />

          <div className={styles.hint}>
            <strong>Total Weight:</strong> 0% (must sum to 100%)
          </div>
        </Card>
      )}

      {activeTab === "assignments" && !selectedKpi && (
        <Card>
          <p className={styles.empty}>Select a KPI from the list to view domain assignments</p>
        </Card>
      )}

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create KPI">
        <form className={styles.form} onSubmit={submitCreate}>
          <label className={styles.field}>
            <span className={styles.label}>Name</span>
            <input className={styles.input} value={form.name} onChange={field("name")} required />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Category</span>
            <select className={styles.input} value={form.category} onChange={field("category")}>
              {["efficiency", "quality", "customer_satisfaction", "cost", "time", "compliance", "other"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Unit</span>
            <input className={styles.input} value={form.unit} onChange={field("unit")} required />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Target value</span>
            <input
              className={styles.input}
              type="number"
              value={form.target_value}
              onChange={field("target_value")}
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Direction</span>
            <select className={styles.input} value={form.target_direction} onChange={field("target_direction")}>
              {["higher_is_better", "lower_is_better", "target_is_exact"].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Frequency</span>
            <select className={styles.input} value={form.measurement_frequency} onChange={field("measurement_frequency")}>
              {["realtime", "hourly", "daily", "weekly", "monthly", "quarterly"].map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Owner role (optional)</span>
            <input className={styles.input} value={form.owner_role} onChange={field("owner_role")} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Domain (optional)</span>
            <select className={styles.input} value={form.domain_id} onChange={field("domain_id")}>
              <option value="">— none —</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          {formError && <p className={styles.formError} role="alert">{formError}</p>}
          <div className={styles.formActions}>
            <Button onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button tone="primary" type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create KPI"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
