import type { Route } from "../../route";
import { api, type KPIAlignmentRow, type SLAAlignmentRow } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Button } from "../../components/Button";
import { DataTable } from "../../components/DataTable";
import { ViewHeader, Loading, ErrorState, SecLabel } from "../_shared";
import { NotFoundPanel } from "../_shared";
import { listRoles, getRole } from "../../data/cypher-queries";

// FR-06: list mode and detail mode for Roles. URL-first state via route.entityId.

export function ExplorerRoles({ route }: { route: Route }) {
  if (route.entityId) return <RoleDetail id={route.entityId} />;
  return <RoleList />;
}

interface RoleListRow { id: string; name: string; description: string; activityCount: number }

function RoleList() {
  const rows = useFetch(
    () => api.cypher(listRoles, {}),
    [],
  );

  return (
    <>
      <ViewHeader
        title="Roles"
        lede="Browse all roles and their associated activity counts."
      />

      {rows.status === "loading" && <Loading what="roles" />}
      {rows.status === "error" && <ErrorState message={rows.error} />}
      {rows.status === "ok" && (
        <Card>
          {rows.data.rows.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)" }}>
              No roles found.
            </p>
          ) : (
            <>
              {rows.data.rows.length === 1001 && (
                <div data-testid="result-truncated" style={{ marginBottom: 12, color: "var(--warn)" }}>
                  More than 1000 roles match — showing first 1000.
                </div>
              )}
              <DataTable
                columns={[
                  { id: "name", label: "Name" },
                  { id: "description", label: "Description" },
                  { id: "activityCount", label: "Activities", align: "right", kind: "num" },
                ]}
                rows={(rows.data.rows as unknown as RoleListRow[]).slice(0, 1000).map((r) => ({
                  name: (
                    <a
                      data-testid="role-row"
                      href={`#/explorer/roles/${encodeURIComponent(r.id)}`}
                      style={{ fontWeight: 500 }}
                    >
                      {r.name}
                    </a>
                  ),
                  description: r.description || <span style={{ color: "var(--muted)" }}>—</span>,
                  activityCount: r.activityCount,
                }))}
              />
            </>
          )}
        </Card>
      )}
    </>
  );
}

interface NeighborRow {
  node: { id: string; name: string };
  label: string;
}

interface RoleDetailRow { id: string; name: string; description: string }

function RoleDetail({ id }: { id: string }) {
  const role = useFetch(() => api.cypher(getRole, { id }), [id]);
  const neighbors = useFetch(() => api.neighbors(id, 1), [id]);
  const kpiAlignments = useFetch(() => api.kpi.getAlignments("role", id), [id]);
  const slaAlignments = useFetch(() => api.sla.getAlignments("role", id), [id]);

  if (role.status === "loading") return <Loading what="role" />;
  if (role.status === "error") {
    if (/\b404\b/.test(role.error)) {
      return <NotFoundPanel route={{ surface: "explorer", tab: "roles", entityId: id, params: {} }} />;
    }
    return <ErrorState message={role.error} />;
  }

  const row = role.data?.rows?.[0] as RoleDetailRow | undefined;
  if (!row) {
    return <NotFoundPanel route={{ surface: "explorer", tab: "roles", entityId: id, params: {} }} />;
  }

  const all = neighbors.status === "ok" ? (neighbors.data.rows as unknown as NeighborRow[]) : [];
  const activities = all.filter((n) => n.label === "Activity");

  const kpiData = kpiAlignments.status === "ok" ? kpiAlignments.data?.rows || [] : [];
  const slaData = slaAlignments.status === "ok" ? slaAlignments.data?.rows || [] : [];

  return (
    <>
      <ViewHeader title={row.name} lede={row.description} />
      <div style={{ marginBottom: 12 }}>
        <Button tone="ghost" href="#/explorer/roles">← All roles</Button>
      </div>

      <BoundCard testId="role-activities" title="Activities (EXECUTES)" items={activities} tone="warn" />
      <KpiSlaCard kpiAlignments={kpiData} slaAlignments={slaData} />
    </>
  );
}

function BoundCard({
  testId,
  title,
  items,
  tone,
}: {
  testId: string;
  title: string;
  items: NeighborRow[];
  tone: "warn" | "danger" | "accent" | "good";
}) {
  return (
    <Card title={title}>
      <div data-testid={testId}>
        {items.length === 0 ? (
          <SecLabel>None bound</SecLabel>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((n) => (
              <li key={n.node.id} style={{ padding: "4px 0", display: "flex", justifyContent: "space-between" }}>
                <span>{n.node.name}</span>
                <Pill tone={tone}>{n.label}</Pill>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function KpiSlaCard({ kpiAlignments, slaAlignments }: { kpiAlignments: KPIAlignmentRow[]; slaAlignments: SLAAlignmentRow[] }) {
  if (kpiAlignments.length === 0 && slaAlignments.length === 0) {
    return null;
  }

  return (
    <Card title="KPIs & SLAs">
      {kpiAlignments.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 600 }}>Aligned KPIs</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {kpiAlignments.map((kpi) => (
              <li key={kpi.kpi_id} style={{ padding: "4px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>{kpi.kpi_name}</strong>
                  <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>{kpi.kpi_category}</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12 }}>{kpi.kpi_target_value} {kpi.kpi_unit}</span>
                  {kpi.weight != null && <Pill tone="warn">{(kpi.weight * 100).toFixed(0)}%</Pill>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {slaAlignments.length > 0 && (
        <div>
          <h4 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 600 }}>Aligned SLAs</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {slaAlignments.map((sla) => (
              <li key={sla.sla_id} style={{ padding: "4px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>{sla.sla_name}</strong>
                  <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>{sla.service_type}</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12 }}>{sla.target_value} {sla.target_unit}</span>
                  {sla.is_critical && <Pill tone="danger">Critical</Pill>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
