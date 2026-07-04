import type { Route } from "../../route";
import { api, type KPIAlignmentRow, type SLAAlignmentRow } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Button } from "../../components/Button";
import { ViewHeader, Loading, ErrorState, SecLabel } from "../_shared";
import { NotFoundPanel } from "../_shared";
import { activityFilterAnd } from "../../data/cypher-queries";

// FR-04 + FR-09: list mode (multi-filter on system/role/location via URL
// query string) and detail mode (route.entityId) live in the same file
// per tasks.md T-09b. URL-first state: filter chips read from
// `route.params`; clearing a chip rewrites the hash without the slot.

export function ExplorerActivities({ route }: { route: Route }) {
  if (route.entityId) return <ActivityDetail id={route.entityId} />;
  return <ActivityFilterList route={route} />;
}

interface FilterRow { id: string; name: string }

function ActivityFilterList({ route }: { route: Route }) {
  const systemId = route.params["system"] ?? null;
  const roleId = route.params["role"] ?? null;
  const locId = route.params["location"] ?? null;

  // Activities matching the AND-composed filter. The named cypher from
  // T-09c keeps the query string greppable; result_truncated is
  // surfaced when row count > 1000 (graph-core/NFR-09).
  const rows = useFetch(
    () => api.cypher(activityFilterAnd, { systemId, roleId, locId }),
    [systemId, roleId, locId],
  );

  return (
    <>
      <ViewHeader
        title="Activities"
        lede="AND-filter activities by system, role, or location. URL state is shareable and reload-safe."
      />
      <FilterChips systemId={systemId} roleId={roleId} locId={locId} />

      {rows.status === "loading" && <Loading what="activities" />}
      {rows.status === "error" && <ErrorState message={rows.error} />}
      {rows.status === "ok" && (
        <Card>
          {rows.data.rows.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)" }}>
              No activities match the active filters.
            </p>
          ) : (
            <>
              {rows.data.rows.length === 1001 && (
                <div data-testid="result-truncated" style={{ marginBottom: 12, color: "var(--warn)" }}>
                  More than 1000 activities match — narrow your filters.
                </div>
              )}
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {(rows.data.rows as unknown as FilterRow[]).slice(0, 1000).map((a) => (
                  <li key={a.id} style={{ padding: "8px 0", borderTop: "1px solid var(--rule)" }}>
                    <a
                      data-testid="activity-row"
                      href={`#/explorer/activities/${encodeURIComponent(a.id)}`}
                      style={{ fontWeight: 500 }}
                    >
                      {a.name}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
    </>
  );
}

function FilterChips({
  systemId,
  roleId,
  locId,
}: {
  systemId: string | null;
  roleId: string | null;
  locId: string | null;
}) {
  if (!systemId && !roleId && !locId) {
    return (
      <p style={{ color: "var(--muted)", fontSize: 12.5 }}>
        No filters set — showing all activities.
      </p>
    );
  }
  const without = (drop: "system" | "role" | "location"): string => {
    const params = new URLSearchParams();
    if (systemId && drop !== "system") params.set("system", systemId);
    if (roleId && drop !== "role") params.set("role", roleId);
    if (locId && drop !== "location") params.set("location", locId);
    const qs = params.toString();
    return qs ? `#/explorer/activities?${qs}` : "#/explorer/activities";
  };
  return (
    <div data-testid="filter-chip-strip" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      {systemId && (
        <ChipLink data-testid="filter-chip-system" label={`system: ${systemId}`} href={without("system")} />
      )}
      {roleId && (
        <ChipLink data-testid="filter-chip-role" label={`role: ${roleId}`} href={without("role")} />
      )}
      {locId && (
        <ChipLink data-testid="filter-chip-location" label={`location: ${locId}`} href={without("location")} />
      )}
    </div>
  );
}

function ChipLink({
  label,
  href,
  ...rest
}: { label: string; href: string } & Record<string, string>) {
  return (
    <a
      {...rest}
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        background: "var(--chip-bg, #eee)",
        borderRadius: 12,
        fontSize: 12,
        textDecoration: "none",
        color: "inherit",
      }}
      title={`Clear filter: ${label}`}
    >
      <span>{label}</span>
      <span aria-hidden="true">×</span>
    </a>
  );
}

interface NeighborRow {
  node: { id: string; name: string };
  label: string;
}

function ActivityDetail({ id }: { id: string }) {
  const activity = useFetch(() => api.getActivity(id), [id]);
  const neighbors = useFetch(() => api.neighbors(id, 1), [id]);
  const kpiAlignments = useFetch(() => api.kpi.getAlignments("activity", id), [id]);
  const slaAlignments = useFetch(() => api.sla.getAlignments("activity", id), [id]);

  if (activity.status === "loading") return <Loading what="activity" />;
  if (activity.status === "error") {
    // 404 from getActivity is the entity-detail "not found" surface.
    if (/\b404\b/.test(activity.error)) {
      return <NotFoundPanel route={{ surface: "explorer", tab: "activities", entityId: id, params: {} }} />;
    }
    return <ErrorState message={activity.error} />;
  }
  const row = activity.data?.rows?.[0];
  if (!row) {
    return <NotFoundPanel route={{ surface: "explorer", tab: "activities", entityId: id, params: {} }} />;
  }

  const all = neighbors.status === "ok" ? (neighbors.data.rows as unknown as NeighborRow[]) : [];
  const roles = all.filter((n) => n.label === "Role");
  const systems = all.filter((n) => n.label === "System");
  const locations = all.filter((n) => n.label === "Location");
  const adjacentActivities = all.filter((n) => n.label === "Activity");

  const kpiData = kpiAlignments.status === "ok" ? kpiAlignments.data?.rows || [] : [];
  const slaData = slaAlignments.status === "ok" ? slaAlignments.data?.rows || [] : [];

  return (
    <>
      <ViewHeader title={row.name} lede={row.description} />
      <div style={{ marginBottom: 12 }}>
        <Button tone="ghost" href="#/explorer/activities">← All activities</Button>
      </div>

      <BoundCard testId="activity-roles" title="Roles (EXECUTES)" items={roles} tone="warn" />
      <BoundCard testId="activity-systems" title="Systems (USES_SYSTEM)" items={systems} tone="danger" />
      <BoundCard testId="activity-locations" title="Locations (AT_LOCATION)" items={locations} tone="accent" />
      <BoundCard testId="activity-adjacent" title="Adjacent activities (PRECEDES)" items={adjacentActivities} tone="good" />
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
