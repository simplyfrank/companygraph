import { useMemo, useState, useEffect } from "react";
import type { Route } from "../../route";
import { api, type DomainRow, type JourneyDetailRow } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { BoundList } from "../../components/BoundList";
import { KeyValueList } from "../../components/KeyValueList";
import { Pill } from "../../components/Pill";
import { Button } from "../../components/Button";
import { ViewHeader, Loading, ErrorState, SecLabel } from "../_shared";
import { SLAchip } from "../../components/SLAchip";
import { FlagForReviewButton } from "../../components/FlagForReviewButton";
import { useTitleStore } from "../../store/titleStore";
import { orderJourneyActivities } from "../../lib/journeyOrder";
import { loadJourneyData } from "../../lib/journeyData";
import { fetchComplianceStatus, type ComplianceStatus } from "../../lib/journeyHealth";
import {
  JourneyCanvas,
  type LayoutMode,
  type VisibleLayers,
  type SelectedRef,
} from "../../components/JourneyCanvas";
import styles from "./Journey.module.css";

// Architecture: params come from route.params (parsed centrally in parseHash)
// instead of a local useQuery() hook. No per-view hashchange listeners needed.
// T-08: also honours `route.entityId` for the new 3-segment deep-link
// form `#/explorer/journey-detail/<journey-id>` while staying
// back-compatible with the legacy `?id=` query-param links.
export function ExplorerJourney({ route }: { route: Route }) {
  const journeyId = route.entityId ?? route.params["id"] ?? null;
  const activityId = route.params["activity"] ?? null;
  const domainId = route.params["domain"] ?? null;
  
  // Must call useFetch before any early return to maintain hook order
  const domains = useFetch(() => api.listDomains(), []);

  if (journeyId) {
    return <JourneyDetail journeyId={journeyId} activeActivityId={activityId} />;
  }
  return (
    <JourneyPicker
      domains={domains.status === "ok" ? domains.data.rows : []}
      domainId={domainId}
    />
  );
}

function JourneyPicker({ domains, domainId }: { domains: DomainRow[]; domainId: string | null }) {
  const activeDomain = domainId
    ? domains.find((d) => d.id === domainId)
    : domains[0];
  const domain = useFetch(
    async () => activeDomain ? api.getDomain(activeDomain.id) : Promise.resolve({ rows: [] }),
    [activeDomain?.id],
  );

  return (
    <>
      <ViewHeader
        title="Journey detail"
        lede="Tabular view of journeys + activities. For the visual 3-lane representation use Explorer · Journey graph."
      />
      <SecLabel>Domain</SecLabel>
      <div className={styles.domainPicker}>
        {domains.map((d) => (
          <a
            key={d.id}
            className={`${styles.domainBtn} ${d.id === activeDomain?.id ? styles.activeDomain : ""}`}
            href={`#/explorer/journey-detail?domain=${encodeURIComponent(d.id)}`}
          >
            {d.name}
          </a>
        ))}
      </div>
      {domain.status === "loading" && <Loading what="journeys" />}
      {domain.status === "error" && <ErrorState message={domain.error} />}
      {domain.status === "ok" && domain.data?.rows?.[0] && (
        <div className={styles.journeyList}>
          {domain.data.rows[0].journeys.map((j) => (
            <div key={j.id} className={styles.journeyRow}>
              <a
                href={`#/explorer/journey-detail?id=${encodeURIComponent(j.id)}`}
                className={styles.journeyName}
              >
                <strong>{j.name}</strong>
                <code className={styles.id}>{j.id.slice(0, 8)}…</code>
              </a>
              <a
                href={`#/explorer/journey-graph?journey=${encodeURIComponent(j.id)}`}
                className={styles.openGraph}
                title="Open in Journey graph"
              >
                graph →
              </a>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

interface RoleBinding { id: string; name: string; team_id: string | undefined; team_name: string | undefined; team_color: string | undefined }
interface ActivityRolesRow { aId: string; roleId: string; roleName: string; roleAttrs: string }

interface PrecedesRow { aId: string; createdAt: string; nextIds: string[] }

function JourneyDetail({ journeyId, activeActivityId }: { journeyId: string; activeActivityId: string | null }) {
  const journey = useFetch(() => api.getJourney(journeyId), [journeyId]);
  // Per-activity role assignment with team attributes — drives the tinted role pills.
  const roleByActivity = useFetch(
    () =>
      api.cypher(
        `MATCH (j:UserJourney {id:$id})<-[:PART_OF]-(a:Activity)<-[:EXECUTES]-(r:Role)
         RETURN a.id AS aId, r.id AS roleId, r.name AS roleName, r.attributes_json AS roleAttrs`,
        { id: journeyId },
      ),
    [journeyId],
  );
  // FR-03 / AC-02 — PRECEDES order + createdAt tiebreaker for cycle handling.
  const precedes = useFetch(
    () =>
      api.cypher(
        `MATCH (j:UserJourney {id:$id})<-[:PART_OF]-(a:Activity)
         OPTIONAL MATCH (a)-[:PRECEDES]->(b:Activity)-[:PART_OF]->(j)
         WITH a, collect(b.id) AS nextIds
         RETURN a.id AS aId, a.createdAt AS createdAt, nextIds`,
        { id: journeyId },
      ),
    [journeyId],
  );
  const neighbors = useFetch(() => api.neighbors(journeyId, 2), [journeyId]);
  // Compliance status for the journey
  const complianceStatus = useFetch(
    async () => fetchComplianceStatus(journeyId),
    [journeyId],
  );

  // T-15: publish the journey name to the title store so shell chrome
  // (breadcrumbs / document title) can reflect the current entity.
  const journeyName = journey.status === "ok" ? journey.data.rows[0]?.name : undefined;
  useEffect(() => {
    if (journeyId && journeyName) {
      useTitleStore.getState().setTitle(journeyId, journeyName);
    }
  }, [journeyId, journeyName]);

  // FR-03 / AC-02 — reorder activities by PRECEDES; on cycle, fall
  // back to createdAt ASC and surface a warning ribbon.
  //
  // These memos run on every render (including loading/error states)
  // to satisfy the rules of hooks. The early returns below come AFTER
  // every hook has been called.
  const rawActivities: JourneyDetailRow["activities"] =
    journey.status === "ok" ? journey.data.rows[0]?.activities ?? [] : [];

  const order = useMemo(() => {
    if (precedes.status !== "ok") {
      return { orderedIds: rawActivities.map((a) => a.id), cycle: false };
    }
    const orderable = (precedes.data.rows as unknown as PrecedesRow[]).map((r) => ({
      id: r.aId,
      createdAt: r.createdAt ?? "",
    }));
    const edges = (precedes.data.rows as unknown as PrecedesRow[]).flatMap((r) =>
      (r.nextIds ?? []).filter(Boolean).map((toId) => ({ fromId: r.aId, toId })),
    );
    return orderJourneyActivities(orderable, edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precedes.status, precedes.status === "ok" ? precedes.data : null, rawActivities]);

  const activities = useMemo(() => {
    if (!order.orderedIds.length) return rawActivities;
    const byId = new Map(rawActivities.map((a) => [a.id, a] as const));
    const out = order.orderedIds
      .map((id) => byId.get(id))
      .filter((a): a is (typeof rawActivities)[number] => Boolean(a));
    const seen = new Set(out.map((a) => a.id));
    for (const a of rawActivities) if (!seen.has(a.id)) out.push(a);
    return out;
  }, [order, rawActivities]);
  const hasCycle = order.cycle;

  if (journey.status === "loading") return <Loading what="journey" />;
  if (journey.status === "error") {
    // 404 from getJourney → NotFound. The error string carries the
    // status code from json() in api.ts.
    if (/\b404\b/.test(journey.error)) {
      return (
        <ErrorState message={`Journey not found: ${journeyId}`} />
      );
    }
    return <ErrorState message={journey.error} />;
  }
  const row = journey.data?.rows?.[0];
  if (!row) return <ErrorState message="journey not found" />;

  // Build aId → roles[] map with parsed team attributes.
  const rolesByActivity = new Map<string, RoleBinding[]>();
  if (roleByActivity.status === "ok") {
    for (const r of roleByActivity.data.rows as unknown as ActivityRolesRow[]) {
      let attrs: Record<string, unknown> = {};
      try { attrs = JSON.parse(r.roleAttrs ?? "{}") as Record<string, unknown>; } catch { /* empty */ }
      const binding: RoleBinding = {
        id: r.roleId,
        name: r.roleName,
        team_id: attrs.team_id as string | undefined,
        team_name: attrs.team_name as string | undefined,
        team_color: attrs.team_color as string | undefined,
      };
      const list = rolesByActivity.get(r.aId) ?? [];
      if (!list.find((x) => x.id === binding.id)) list.push(binding);
      rolesByActivity.set(r.aId, list);
    }
  }

  const bound = neighbors.status === "ok" ? neighbors.data.rows : [];
  const systems = bound.filter((n) => n.label === "System").slice(0, 8);
  const locations = bound.filter((n) => n.label === "Location").slice(0, 8);
  const uniqueRoles = uniqueBy([...rolesByActivity.values()].flat(), (r) => r.id);

  // verification now comes directly from the getJourney response (no fan-out).
  const verif = row.verification;
  const verification: { by: string; at: string } | null =
    verif?.by && verif.at ? { by: verif.by, at: verif.at } : null;

  return (
    <>
      <ViewHeader title={row.name} lede={row.description} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <FlagForReviewButton label="UserJourney" id={journeyId} />
      </div>
      <JourneyKpiBanner 
        row={row} 
        verification={verification} 
        complianceStatus={complianceStatus.status === "ok" ? complianceStatus.data : null}
      />
      <ProcessFlowPanel journeyId={journeyId} />
      <div className={styles.titleActions}>
        <Button tone="ghost" href={`#/explorer/journey-graph?journey=${encodeURIComponent(journeyId)}`}>
          Open full graph →
        </Button>
        <Button tone="ghost" href="#/explorer/journey-detail">All journeys</Button>
      </div>

      {hasCycle && (
        <div
          role="alert"
          data-testid="cycle-warning"
          style={{
            margin: "12px 0",
            padding: "10px 14px",
            background: "var(--warn-soft)",
            borderLeft: "4px solid var(--warn)",
            color: "var(--warn-text)",
            fontSize: 13,
            borderRadius: 4,
          }}
        >
          <strong>Cycle detected in PRECEDES.</strong>{" "}
          Activities are rendered in <code>createdAt</code> ASC order as a
          tiebreaker so every step is visible. Inspect the chain and resolve
          the cycle in the source data.
        </div>
      )}

      <div className={styles.shell}>
        <Card title="Activity chain">
          <ol className={styles.chain}>
            {activities.map((a, i) => {
              const active = a.id === activeActivityId;
              const params = new URLSearchParams({ id: journeyId, activity: a.id });
              const aRoles = rolesByActivity.get(a.id) ?? [];
              return (
                <li key={a.id} className={styles.step}>
                  <a
                    className={`${styles.stepLink} ${active ? styles.stepActive : ""}`}
                    href={`#/explorer/journey-detail?${params.toString()}`}
                  >
                    <span className={styles.stepN}>{i + 1}</span>
                    <div className={styles.stepBody}>
                      <div className={styles.stepName}>{a.name}</div>
                      <div className={styles.stepMeta}>
                        {aRoles.length === 0 && a.sla_target_hours == null && (
                          <span className={styles.stepId}>—</span>
                        )}
                        {aRoles.map((r) => (
                          <TeamRolePill key={r.id} role={r} />
                        ))}
                        {a.sla_target_hours != null && (
                          <SLAchip tone={slaTone(a.sla_target_hours, a.p95_hours)} label="SLA" value={`${a.sla_target_hours}h`} />
                        )}
                        {a.p95_hours != null && (
                          <SLAchip tone={slaTone(a.sla_target_hours, a.p95_hours)} label="p95" value={`${a.p95_hours}h`} />
                        )}
                      </div>
                    </div>
                    {active && <Pill tone="accent">selected</Pill>}
                  </a>
                </li>
              );
            })}
          </ol>
        </Card>

        <aside className={styles.panel}>
          {activeActivityId && (
            <ActivityDetail
              activityId={activeActivityId}
              journeyId={journeyId}
              roles={rolesByActivity.get(activeActivityId) ?? []}
            />
          )}
          <Card title="Identity">
            <KeyValueList rows={[
              { label: "id",         value: <code className={styles.id}>{row.id}</code> },
              { label: "activities", value: activities.length },
              { label: "roles",      value: uniqueRoles.length },
              ...(row.owner_team ? [{ label: "owner", value: row.owner_team }] : []),
            ]} />
          </Card>
          <Card title="Teams">
            {uniqueTeams(uniqueRoles).length === 0 ? (
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 12.5 }}>
                No team attributes on this journey's roles.
              </p>
            ) : (
              <div className={styles.teamList}>
                {uniqueTeams(uniqueRoles).map((t) => (
                  <div key={t.team_id} className={styles.teamRow}>
                    <span
                      className={styles.teamSwatch}
                      style={{ background: teamColorVar(t.team_color) }}
                    />
                    <span>{t.team_name}</span>
                    <code className={styles.id}>{t.count} role{t.count === 1 ? "" : "s"}</code>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Bound entities">
            <BoundList title="Systems"   items={systems.map((s)   => ({ kind: "uses", label: s.node.name }))} />
            <BoundList title="Locations" items={locations.map((l) => ({ kind: "at",   label: l.node.name }))} />
          </Card>
        </aside>
      </div>
    </>
  );
}

// =====================================================================
//   Inline process-flow panel
// =====================================================================
function ProcessFlowPanel({ journeyId }: { journeyId: string }) {
  const [open, setOpen] = useState(true);
  const [layout, setLayout] = useState<LayoutMode>("chain");
  const [layers, setLayers] = useState<VisibleLayers>({ roles: true, systems: true, locations: false });
  const [selected, setSelected] = useState<SelectedRef>(null);
  const data = useFetch(() => loadJourneyData(journeyId), [journeyId]);

  return (
    <div className={styles.flowPanel} data-testid="process-flow-panel">
      <div className={styles.flowHeader}>
        <button
          className={styles.flowToggle}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className={styles.flowToggleIcon}>{open ? "▾" : "▸"}</span>
          Process flow
          {data.status === "ok" && (
            <span className={styles.flowActivityCount}>
              {data.data.activities.length} step{data.data.activities.length === 1 ? "" : "s"}
            </span>
          )}
        </button>
        {open && (
          <div className={styles.flowControls}>
            <div className={styles.flowSeg}>
              <button
                className={`${styles.flowSegBtn} ${layout === "chain" ? styles.flowSegActive : ""}`}
                onClick={() => setLayout("chain")}
              >chain</button>
              <button
                className={`${styles.flowSegBtn} ${layout === "radial" ? styles.flowSegActive : ""}`}
                onClick={() => setLayout("radial")}
              >radial</button>
            </div>
            <label className={styles.flowLayerToggle}>
              <input type="checkbox" checked={layers.roles} onChange={(e) => setLayers((l) => ({ ...l, roles: e.target.checked }))} />
              Roles
            </label>
            <label className={styles.flowLayerToggle}>
              <input type="checkbox" checked={layers.systems} onChange={(e) => setLayers((l) => ({ ...l, systems: e.target.checked }))} />
              Systems
            </label>
            <label className={styles.flowLayerToggle}>
              <input type="checkbox" checked={layers.locations} onChange={(e) => setLayers((l) => ({ ...l, locations: e.target.checked }))} />
              Locations
            </label>
          </div>
        )}
      </div>
      {open && (
        <div className={styles.flowCanvas}>
          {data.status === "loading" && <Loading what="process flow" />}
          {data.status === "error" && <ErrorState message={data.error} />}
          {data.status === "ok" && (
            <JourneyCanvas
              data={data.data}
              layoutMode={layout}
              visibleLayers={layers}
              selected={selected}
              onSelect={setSelected}
            />
          )}
        </div>
      )}
    </div>
  );
}

// JourneyKpiBanner — the SLA/KPI/verification strip that appears
// directly below the page title, always visible for SLA-bound journeys.
function JourneyKpiBanner({
  row,
  verification,
  complianceStatus,
}: {
  row: JourneyDetailRow;
  verification: { by: string; at: string } | null;
  complianceStatus: ComplianceStatus | null;
}) {
  const hasSla  = row.sla_target_hours != null;
  const hasKpi  = row.kpi_score != null;
  const hasVerif = verification != null;
  const hasCompliance = complianceStatus != null;
  if (!hasSla && !hasKpi && !hasVerif && !hasCompliance) return null;

  const slaToneVal = slaTone(row.sla_target_hours, row.p95_hours);
  const kpiToneVal = row.kpi_score != null ? slaScoreTone(row.kpi_score) : "neutral" as const;
  const complianceToneVal = complianceStatus?.score != null 
    ? (complianceStatus.score >= 90 ? "good" : complianceStatus.score >= 70 ? "warn" : "breach") 
    : "neutral" as const;

  return (
    <div className={styles.kpiBanner} data-testid="journey-kpi-banner">
      {hasSla && (
        <SLAchip
          tone={slaToneVal}
          label="SLA target"
          value={`${row.sla_target_hours}h`}
        />
      )}
      {row.p95_hours != null && (
        <SLAchip
          tone={slaToneVal}
          label="p95 actual"
          value={`${row.p95_hours}h`}
        />
      )}
      {hasKpi && (
        <SLAchip
          tone={kpiToneVal}
          label="KPI score"
          value={`${Math.round(row.kpi_score! * 100)}%`}
        />
      )}
      {hasCompliance && (
        <SLAchip
          tone={complianceToneVal}
          label="Compliance"
          value={`${complianceStatus!.score}%`}
        />
      )}
      {hasCompliance && complianceStatus!.violations > 0 && (
        <SLAchip
          tone="breach"
          label="Violations"
          value={complianceStatus!.violations.toString()}
        />
      )}
      {hasVerif && (
        <VerificationLine roleId={verification!.by} verifiedAt={verification!.at} />
      )}
    </div>
  );
}

function VerificationLine({ roleId, verifiedAt }: { roleId: string; verifiedAt: string }) {
  const role = useFetch(
    () =>
      api.cypher(`MATCH (r:Role {id: $roleId}) RETURN r.name AS name`, { roleId }),
    [roleId],
  );
  const roleName =
    role.status === "ok"
      ? (role.data.rows[0] as { name?: string } | undefined)?.name ?? roleId
      : roleId;
  return (
    <span
      data-testid="verification-line"
      style={{ fontSize: 12, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      Verified by <strong style={{ color: "var(--fg)" }}>&lsquo;{roleName}&rsquo;</strong> on {verifiedAt}
    </span>
  );
}

function slaTone(
  target: number | null | undefined,
  p95: number | null | undefined,
): "good" | "warn" | "breach" | "neutral" {
  if (target == null || p95 == null) return "neutral";
  if (p95 <= target) return "good";
  if (p95 <= target * 1.2) return "warn";
  return "breach";
}

function slaScoreTone(score: number): "good" | "warn" | "breach" | "neutral" {
  if (score >= 0.9) return "good";
  if (score >= 0.7) return "warn";
  return "breach";
}

function ActivityDetail({
  activityId,
  journeyId,
  roles,
}: {
  activityId: string;
  journeyId: string;
  roles: RoleBinding[];
}) {
  const activity = useFetch(() => api.getActivity(activityId), [activityId]);
  const neighbors = useFetch(() => api.neighbors(activityId, 1), [activityId]);

  return (
    <Card
      title={activity.status === "ok" ? activity.data?.rows?.[0]?.name ?? "Activity" : "Activity"}
      actions={
        <a className={styles.closeBtn} href={`#/explorer/journey-detail?id=${encodeURIComponent(journeyId)}`}>×</a>
      }
    >
      {activity.status === "loading" && <Loading what="activity" />}
      {activity.status === "error" && <ErrorState message={activity.error} />}
      {activity.status === "ok" && activity.data?.rows?.[0] && (
        <>
          <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "0 0 12px" }}>
            {activity.data.rows[0].description}
          </p>
          {roles.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
              {roles.map((r) => <TeamRolePill key={r.id} role={r} />)}
            </div>
          )}
          <KeyValueList rows={[
            { label: "id", value: <code className={styles.id}>{activity.data.rows[0].id}</code> },
          ]} />
          {neighbors.status === "ok" && neighbors.data.rows.length > 0 && (
            <>
              <div style={{ marginTop: 12 }}>
                <SecLabel>1-hop neighbours</SecLabel>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12.5 }}>
                {neighbors.data.rows.slice(0, 12).map((n, i) => (
                  <li key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", gap: 8 }}>
                    <span>{n.node.name}</span>
                    <Pill tone={
                      n.label === "Domain" ? "accent" :
                      n.label === "UserJourney" ? "good" :
                      n.label === "Role" ? "warn" :
                      n.label === "System" ? "danger" : "neutral"
                    }>{n.label}</Pill>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Card>
  );
}

function TeamRolePill({ role }: { role: RoleBinding }) {
  return (
    <span className={styles.rolePill}>
      <span className={styles.rolePillStripe} style={{ background: teamColorVar(role.team_color) }} />
      <span className={styles.rolePillName}>{role.name}</span>
      {role.team_name && (
        <span className={styles.rolePillTeam}>{role.team_name}</span>
      )}
    </span>
  );
}

function teamColorVar(color?: string): string {
  switch (color) {
    case "accent": return "var(--accent)";
    case "good":   return "var(--good)";
    case "warn":   return "var(--warn)";
    case "danger": return "var(--danger)";
    default:       return "var(--muted-2)";
  }
}

function uniqueBy<T>(xs: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of xs) {
    const k = key(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function uniqueTeams(roles: RoleBinding[]): Array<{ team_id: string; team_name: string; team_color: string | undefined; count: number }> {
  const map = new Map<string, { team_id: string; team_name: string; team_color: string | undefined; count: number }>();
  for (const r of roles) {
    if (!r.team_id) continue;
    const existing = map.get(r.team_id);
    if (existing) {
      existing.count++;
    } else {
      map.set(r.team_id, {
        team_id: r.team_id,
        team_name: r.team_name ?? r.team_id,
        team_color: r.team_color,
        count: 1,
      });
    }
  }
  return [...map.values()];
}
