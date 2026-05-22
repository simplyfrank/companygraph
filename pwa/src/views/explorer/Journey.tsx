import { useState } from "react";
import type { Route } from "../../route";
import { api, type DomainRow } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { BoundList } from "../../components/BoundList";
import { KeyValueList } from "../../components/KeyValueList";
import { Pill } from "../../components/Pill";
import { Button } from "../../components/Button";
import { ViewHeader, Loading, ErrorState, SecLabel } from "../_shared";
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
      {domain.status === "ok" && domain.data.rows[0] && (
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

interface RoleBinding { id: string; name: string; team_id?: string; team_name?: string; team_color?: string }
interface ActivityRolesRow { aId: string; roleId: string; roleName: string; roleAttrs: string }

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
  // FR-20: read the journey's full attributes_json so the header can
  // render the `"Verified by '<role>' on <date>"` line from
  // `attributes._verification`. getJourney's response shape doesn't
  // include attributes, so we fan out a tiny one-row cypher.
  const journeyAttrs = useFetch(
    () =>
      api.cypher(
        `MATCH (j:UserJourney {id:$id}) RETURN j.attributes_json AS attrs`,
        { id: journeyId },
      ),
    [journeyId],
  );
  const neighbors = useFetch(() => api.neighbors(journeyId, 2), [journeyId]);

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
  const row = journey.data.rows[0];
  if (!row) return <ErrorState message="journey not found" />;

  const activities = row.activities ?? [];

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

  return (
    <>
      <ViewHeader title={row.name} lede={row.description} />
      <div className={styles.titleActions}>
        <Button tone="primary" href={`#/explorer/journey-graph?journey=${encodeURIComponent(journeyId)}`}>
          View as graph →
        </Button>
        <Button tone="ghost" href="#/explorer/journey-detail">All journeys</Button>
      </div>

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
                        {aRoles.length === 0 && (
                          <span className={styles.stepId}>—</span>
                        )}
                        {aRoles.map((r) => (
                          <TeamRolePill key={r.id} role={r} />
                        ))}
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
      title={activity.status === "ok" ? activity.data.rows[0]?.name ?? "Activity" : "Activity"}
      actions={
        <a className={styles.closeBtn} href={`#/explorer/journey-detail?id=${encodeURIComponent(journeyId)}`}>×</a>
      }
    >
      {activity.status === "loading" && <Loading what="activity" />}
      {activity.status === "error" && <ErrorState message={activity.error} />}
      {activity.status === "ok" && activity.data.rows[0] && (
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

function uniqueTeams(roles: RoleBinding[]): Array<{ team_id: string; team_name: string; team_color?: string; count: number }> {
  const map = new Map<string, { team_id: string; team_name: string; team_color?: string; count: number }>();
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
