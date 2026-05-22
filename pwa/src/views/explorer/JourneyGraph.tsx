import { useEffect, useMemo, useState } from "react";
import type { Route } from "../../route";
import { api, type DomainRow } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { KeyValueList } from "../../components/KeyValueList";
import {
  JourneyCanvas,
  computeSlaSummary,
  type JourneyData,
  type ActivityNode,
  type RoleNode,
  type SystemNode,
  type LocationNode,
  type PrecedesEdge,
} from "../../components/JourneyCanvas";
import { ViewHeader, Loading, ErrorState, SecLabel } from "../_shared";
import styles from "./JourneyGraph.module.css";

const TEAM_TONE: Record<string, "accent" | "good" | "warn" | "danger"> = {
  customer_service: "danger",
  warehouse: "accent",
  dc_operations: "good",
  last_mile: "warn",
};


interface RawRow {
  aId: string; aName: string; aPos: number;
  toCol?: string; toMs?: number; targetMs?: number;
}

// Architecture: params come from route.params (parsed centrally in parseHash)
// instead of a local useQuery() hook. No per-view hashchange listeners needed.
export function ExplorerJourneyGraph({ route }: { route: Route }) {
  const explicitJourney = route.params["journey"] ?? null;
  const domainFilter = route.params["domain"] ?? null;
  const subdomainFilter = route.params["subdomain"] ?? null;
  const layoutMode: "chain" | "radial" = route.params["layout"] === "radial" ? "radial" : "chain";
  const domains = useFetch(() => api.listDomains(), []);

  // Read subdomain attributes off the selected domain.
  const domainDetail = useFetch(
    async () => domainFilter ? await fetch(`/api/v1/nodes/Domain/${encodeURIComponent(domainFilter)}`).then((r) => r.ok ? r.json() : null) : null,
    [domainFilter],
  );
  const subdomains: string[] = domainDetail.status === "ok" && domainDetail.data?.attributes?.subdomains
    ? (domainDetail.data.attributes.subdomains as string[])
    : [];

  const journeys = useFetch(
    () =>
      api.cypher(
        `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)
         RETURN j.id AS id, j.name AS name, d.id AS domainId, d.name AS domainName
         ORDER BY j.name`,
      ),
    [],
  );

  const journeyList = journeys.status === "ok"
    ? (journeys.data.rows as unknown as Array<{ id: string; name: string; domainId: string; domainName: string }>)
        .filter((j) => !domainFilter || j.domainId === domainFilter)
    : [];

  const orderFulfillment = journeyList.find((j) => j.name === "Order fulfillment");
  const activeJourney = explicitJourney
    ? journeyList.find((j) => j.id === explicitJourney)
    : orderFulfillment ?? journeyList[0];

  const [selected, setSelected] = useState<{ kind: "role" | "activity" | "system" | "location"; id: string } | null>(null);

  // Reset selection when journey changes.
  useEffect(() => { setSelected(null); }, [activeJourney?.id]);

  const journeyData = useFetch(
    async () => activeJourney ? loadJourneyData(activeJourney.id) : null,
    [activeJourney?.id],
  );

  return (
    <div className={styles.shell}>
      <Filters
        domains={domains.status === "ok" ? domains.data.rows : []}
        domainFilter={domainFilter}
        subdomains={subdomains}
        subdomainFilter={subdomainFilter}
        journeys={journeyList}
        activeJourneyId={activeJourney?.id ?? null}
        layoutMode={layoutMode}
      />

      <div className={styles.layout}>
        <div className={styles.canvasWrap}>
          {journeyData.status === "loading" && <Loading what="journey graph" />}
          {journeyData.status === "error" && <ErrorState message={journeyData.error} />}
          {journeyData.status === "ok" && journeyData.data && (
            <>
              {layoutMode === "chain" ? (
                <JourneyCanvas
                  data={journeyData.data}
                  selected={selected}
                  onSelect={setSelected}
                />
              ) : (
                <RadialStub activityCount={journeyData.data.activities.length} />
              )}
              <Legend />
              <HintCard />
              <CrossLink journeyId={activeJourney?.id ?? ""} />
            </>
          )}
          {journeyData.status === "ok" && !journeyData.data && (
            <p style={{ color: "var(--muted)", padding: 24 }}>Pick a journey above.</p>
          )}
        </div>

        <aside className={styles.rail}>
          {activeJourney && journeyData.status === "ok" && journeyData.data && (
            <CompositionPanel
              journey={activeJourney}
              data={journeyData.data}
            />
          )}
        </aside>
      </div>

      {journeyData.status === "ok" && journeyData.data && activeJourney && (
        <StatusBar journey={activeJourney} data={journeyData.data} />
      )}
    </div>
  );
}

function HintCard() {
  return (
    <div className={styles.hint}>
      <span>scroll · zoom</span>
      <span className={styles.hintSep}>·</span>
      <span>drag · pan</span>
      <span className={styles.hintSep}>·</span>
      <span>click · select</span>
    </div>
  );
}

function CrossLink({ journeyId }: { journeyId: string }) {
  if (!journeyId) return null;
  return (
    <a
      className={styles.crossLink}
      href={`#/explorer/journey-detail?id=${encodeURIComponent(journeyId)}`}
      title="Open this journey in the list-based detail view"
    >
      Open in list view →
    </a>
  );
}

function RadialStub({ activityCount }: { activityCount: number }) {
  // Lightweight radial fallback — activities arranged on a circle. Not
  // wired to roles/systems yet (Chain remains the canonical layout).
  const R = 200;
  return (
    <svg viewBox="0 0 600 540" className={styles.radial} preserveAspectRatio="xMidYMid meet">
      <circle cx={300} cy={270} r={R} fill="none" stroke="var(--border)" />
      {Array.from({ length: activityCount }).map((_, i) => {
        const a = (i / activityCount) * Math.PI * 2 - Math.PI / 2;
        const x = 300 + R * Math.cos(a);
        const y = 270 + R * Math.sin(a);
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <circle r={20} fill="var(--surface)" stroke="var(--fg)" strokeWidth={1.2} />
            <text textAnchor="middle" y={4} fontFamily="var(--font-mono)" fontSize={11} fontWeight={600}>{i + 1}</text>
          </g>
        );
      })}
      <text x={300} y={500} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={11} fill="var(--muted)">
        radial layout — preview only · roles + systems land later
      </text>
    </svg>
  );
}

function Filters({
  domains,
  domainFilter,
  subdomains,
  subdomainFilter,
  journeys,
  activeJourneyId,
  layoutMode,
}: {
  domains: DomainRow[];
  domainFilter: string | null;
  subdomains: string[];
  subdomainFilter: string | null;
  journeys: Array<{ id: string; name: string; domainId: string; domainName: string }>;
  activeJourneyId: string | null;
  layoutMode: "chain" | "radial";
}) {
  const updateHash = (mut: (p: URLSearchParams) => void): void => {
    const params = new URLSearchParams();
    if (domainFilter) params.set("domain", domainFilter);
    if (subdomainFilter) params.set("subdomain", subdomainFilter);
    if (activeJourneyId) params.set("journey", activeJourneyId);
    if (layoutMode === "radial") params.set("layout", "radial");
    mut(params);
    window.location.hash = `#/explorer/journey-graph${params.toString() ? `?${params.toString()}` : ""}`;
  };

  return (
    <div className={styles.filters}>
      <span className={styles.surfaceLabel}>Surface · Process Explorer</span>
      <span className={styles.crumbSep}>·</span>
      <a href="#/explorer/journey-graph" className={styles.crumbLink}>journeys</a>
      <span className={styles.crumbSep}>·</span>
      <span className={styles.crumbActive}>
        {activeJourneyId ? journeys.find((j) => j.id === activeJourneyId)?.name : "—"}
      </span>

      <div className={styles.filtersRight}>
        <label className={styles.filter}>
          <span className={styles.filterLabel}>DOMAIN</span>
          <select
            value={domainFilter ?? ""}
            onChange={(e) => updateHash((p) => {
              p.delete("domain"); p.delete("subdomain"); p.delete("journey");
              if (e.currentTarget.value) p.set("domain", e.currentTarget.value);
            })}
          >
            <option value="">All domains</option>
            {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className={styles.filter}>
          <span className={styles.filterLabel}>SUBDOMAIN</span>
          <select
            value={subdomainFilter ?? ""}
            disabled={!domainFilter || subdomains.length === 0}
            onChange={(e) => updateHash((p) => {
              p.delete("subdomain");
              if (e.currentTarget.value) p.set("subdomain", e.currentTarget.value);
            })}
          >
            <option value="">
              {!domainFilter
                ? "— pick a domain first"
                : subdomains.length === 0
                  ? "— (no subdomains)"
                  : "All subdomains"}
            </option>
            {subdomains.map((sd) => <option key={sd} value={sd}>{sd}</option>)}
          </select>
        </label>
        <label className={styles.filter}>
          <span className={styles.filterLabel}>JOURNEY</span>
          <select
            value={activeJourneyId ?? ""}
            onChange={(e) => updateHash((p) => {
              p.delete("journey");
              if (e.currentTarget.value) p.set("journey", e.currentTarget.value);
            })}
          >
            <option value="" disabled>pick a journey</option>
            {journeys.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
        </label>
        <div className={styles.layoutToggle} role="tablist" aria-label="Layout">
          <button
            type="button"
            role="tab"
            aria-selected={layoutMode === "chain"}
            className={`${styles.toggleBtn} ${layoutMode === "chain" ? styles.toggleActive : ""}`}
            onClick={() => updateHash((p) => p.delete("layout"))}
          >
            Chain
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={layoutMode === "radial"}
            className={`${styles.toggleBtn} ${layoutMode === "radial" ? styles.toggleActive : ""}`}
            onClick={() => updateHash((p) => p.set("layout", "radial"))}
          >
            Radial
          </button>
        </div>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className={styles.legend}>
      <div className={styles.legendBlock}>
        <Glyph kind="activity" /> <span>ACTIVITY</span>
      </div>
      <div className={styles.legendBlock}>
        <Glyph kind="role" /> <span>ROLE</span>
      </div>
      <div className={styles.legendBlock}>
        <Glyph kind="system" /> <span>SYSTEM</span>
      </div>
      <div className={styles.legendBlock}>
        <Glyph kind="location" /> <span>LOCATION</span>
      </div>
      <div className={styles.legendDivider} />
      <div className={styles.legendBlock}>
        <span className={`${styles.lline} ${styles.linePrecedes}`} /> <span>PRECEDES</span>
      </div>
      <div className={styles.legendBlock}>
        <span className={`${styles.lline} ${styles.lineExecutes}`} /> <span>EXECUTES</span>
      </div>
      <div className={styles.legendBlock}>
        <span className={`${styles.lline} ${styles.lineUsesSystem}`} /> <span>USES_SYSTEM</span>
      </div>
      <div className={styles.legendBlock}>
        <span className={`${styles.lline} ${styles.lineAtLocation}`} /> <span>AT_LOCATION</span>
      </div>
      <div className={styles.legendDivider} />
      <div className={styles.legendBlock}><span className={`${styles.slaSwatch} ${styles.slaOk}`} /> <span>SLA · OK</span></div>
      <div className={styles.legendBlock}><span className={`${styles.slaSwatch} ${styles.slaWarn}`} /> <span>SLA · WARN</span></div>
      <div className={styles.legendBlock}><span className={`${styles.slaSwatch} ${styles.slaBreach}`} /> <span>SLA · BREACH</span></div>
      <div className={styles.legendDivider} />
      <div className={styles.legendBlock}><strong>TEAMS</strong></div>
      <div className={styles.legendBlock}><span className={`${styles.teamSwatch}`} style={{ background: "var(--danger)" }} /> <span>CUSTOMER SERVICE</span></div>
      <div className={styles.legendBlock}><span className={`${styles.teamSwatch}`} style={{ background: "var(--accent)" }} /> <span>WAREHOUSE</span></div>
      <div className={styles.legendBlock}><span className={`${styles.teamSwatch}`} style={{ background: "var(--good)" }} /> <span>DC OPERATIONS</span></div>
      <div className={styles.legendBlock}><span className={`${styles.teamSwatch}`} style={{ background: "var(--warn)" }} /> <span>LAST-MILE</span></div>
    </div>
  );
}

function Glyph({ kind }: { kind: "activity" | "role" | "system" | "location" }) {
  if (kind === "activity") return <span className={styles.gActivity} />;
  if (kind === "role")     return <span className={styles.gRole} />;
  if (kind === "system")   return <span className={styles.gSystem} />;
  return <span className={styles.gLocation} />;
}

function CompositionPanel({
  journey,
  data,
}: {
  journey: { id: string; name: string; domainId?: string; domainName?: string };
  data: JourneyData;
}) {
  const sla = computeSlaSummary(data);
  const accountable = "VP Operations";   // hardcoded — would come from ACCOUNTABLE edge in a future schema
  const cost = 8.5;
  const runs = 12_400;
  return (
    <>
      <Card title="Journey">
        <SecLabel>JOURNEY · {journey.domainName?.toUpperCase() ?? "—"}</SecLabel>
        <div className={styles.bigTitle}>{journey.name}</div>
        <code className={styles.id}>{journey.id}</code>
      </Card>
      <Card title="Composition">
        <KeyValueList rows={[
          { label: "activities",    value: data.activities.length },
          { label: "roles",         value: data.roles.length },
          { label: "systems",       value: data.systems.length },
          { label: "locations",     value: data.locations.length },
          { label: "edges",         value: countEdges(data) },
          { label: "critical path", value: `${Math.round(data.precedes.reduce((s, e) => s + (e.target_ms ?? 0), 0) / 1000)}s` },
        ]} />
      </Card>
      <Card title="Cost / Run">
        <KeyValueList rows={[
          { label: "USD / run",   value: `$${cost.toFixed(2)}` },
          { label: "runs / month", value: runs.toLocaleString() },
          { label: "USD / month", value: `$${(cost * runs).toLocaleString()}` },
        ]} />
      </Card>
      <Card title="SLA rollup">
        <div className={styles.slaRow}>
          <Pill tone="good">{sla.ok} ok</Pill>
          <Pill tone="warn">{sla.warn} warn</Pill>
          <Pill tone="danger">{sla.breach} breach</Pill>
        </div>
        {sla.slowest && (
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
            slowest · <strong style={{ color: "var(--fg)" }}>{sla.slowest.label}</strong>
            {" "}({Math.round(sla.slowest.ratio * 100)}% of SLA)
          </div>
        )}
      </Card>
      <Card title="Accountable">
        <KeyValueList rows={[
          { label: "role",  value: accountable },
          { label: "id",    value: <code className={styles.id}>r_vp_ops</code> },
        ]} />
      </Card>
      <div className={styles.tip}>
        Click a <strong>node</strong> to focus it in the canvas — connected
        edges dim out unrelated nodes.
      </div>
    </>
  );
}

function StatusBar({ journey, data }: { journey: { id: string; name: string }; data: JourneyData }) {
  const sla = computeSlaSummary(data);
  const nodes = data.activities.length + data.roles.length + data.systems.length + data.locations.length;
  const edges = countEdges(data);
  // SoD pairs heuristic: how many activities share the same role across
  // the chain? We treat that as the number of activities where the role
  // also appears for a different activity (toy version).
  const sod = data.roles.filter((r) => r.columns.length > 1).length;
  // "hand-offs": distinct adjacent role boundaries — count PRECEDES edges
  // where the upstream and downstream roles differ.
  const handoffs = countHandoffs(data);
  return (
    <div className={styles.statusbar}>
      <span><strong>{nodes}</strong> nodes</span>
      <span>·</span>
      <span><strong>{edges}</strong> edges</span>
      <span>·</span>
      <span><strong>{sla.total}</strong> SLA-bearing (<span style={{ color: "var(--good-text)" }}>{sla.ok} ok</span> · <span style={{ color: "var(--warn-text)" }}>{sla.warn} warn</span> · <span style={{ color: "var(--danger-text)" }}>{sla.breach} breach</span>)</span>
      <span>·</span>
      <span>read-only ✓</span>
      <span>·</span>
      <span><strong>{handoffs}</strong> hand-offs</span>
      <span>·</span>
      <span><strong>{sod}</strong> SoD pairs</span>
      <span className={styles.spacer} />
      <span>journey · <code>{journey.id.slice(0, 12)}…</code></span>
    </div>
  );
}

function countEdges(d: JourneyData): number {
  return d.precedes.length
    + d.roles.reduce((s, r) => s + r.columns.length, 0)
    + d.systems.reduce((s, sy) => s + sy.usages.length, 0)
    + d.locations.reduce((s, l) => s + l.columns.length, 0);
}

function countHandoffs(d: JourneyData): number {
  // For each PRECEDES, find the roles of from-activity and to-activity;
  // if any role of from differs from all roles of to, count one handoff.
  let n = 0;
  for (const p of d.precedes) {
    const fromRoles = d.roles.filter((r) => r.columns.includes(p.from_col)).map((r) => r.id).sort().join(",");
    const toRoles   = d.roles.filter((r) => r.columns.includes(p.to_col)).map((r) => r.id).sort().join(",");
    if (fromRoles !== toRoles) n++;
  }
  return n;
}

async function loadJourneyData(journeyId: string): Promise<JourneyData> {
  // Single Cypher passthrough — flat rows we group client-side.
  // Pulls activities + their PRECEDES + EXECUTES + USES_SYSTEM + AT_LOCATION.
  const [precedesRes, executesRes, usesRes, locsRes, activitiesRes] = await Promise.all([
    api.cypher(
      `MATCH (j:UserJourney {id:$id})
       MATCH (a:Activity)-[:PART_OF]->(j)
       MATCH (a)-[p:PRECEDES]->(b:Activity)-[:PART_OF]->(j)
       RETURN a.id AS fromId, b.id AS toId, p.attributes_json AS attrs`,
      { id: journeyId },
    ),
    api.cypher(
      `MATCH (j:UserJourney {id:$id})
       MATCH (a:Activity)-[:PART_OF]->(j)
       MATCH (r:Role)-[e:EXECUTES]->(a)
       RETURN r.id AS roleId, r.name AS roleName, r.attributes_json AS roleAttrs,
              a.id AS aId, e.attributes_json AS attrs`,
      { id: journeyId },
    ),
    api.cypher(
      `MATCH (j:UserJourney {id:$id})
       MATCH (a:Activity)-[:PART_OF]->(j)
       MATCH (a)-[u:USES_SYSTEM]->(s:System)
       RETURN a.id AS aId, s.id AS sysId, s.name AS sysName,
              s.attributes_json AS sysAttrs, u.attributes_json AS attrs`,
      { id: journeyId },
    ),
    api.cypher(
      `MATCH (j:UserJourney {id:$id})
       MATCH (a:Activity)-[:PART_OF]->(j)
       MATCH (a)-[:AT_LOCATION]->(l:Location)
       RETURN a.id AS aId, l.id AS locId, l.name AS locName`,
      { id: journeyId },
    ),
    api.getJourney(journeyId),
  ]);

  const journeyActivities = activitiesRes.rows[0]?.activities ?? [];

  // Topologically order activities by PRECEDES.
  const precedesRaw = (precedesRes.rows as unknown as Array<{ fromId: string; toId: string; attrs: string }>);
  const succ = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const a of journeyActivities) { indeg.set(a.id, 0); succ.set(a.id, []); }
  for (const p of precedesRaw) {
    succ.get(p.fromId)?.push(p.toId);
    indeg.set(p.toId, (indeg.get(p.toId) ?? 0) + 1);
  }
  const ordered: Array<{ id: string; name: string }> = [];
  const queue = journeyActivities.filter((a) => (indeg.get(a.id) ?? 0) === 0);
  while (queue.length > 0) {
    const a = queue.shift()!;
    ordered.push(a);
    for (const next of succ.get(a.id) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, d);
      if (d === 0) {
        const found = journeyActivities.find((x) => x.id === next);
        if (found) queue.push(found);
      }
    }
  }
  // Append any activities not reached (disconnected).
  for (const a of journeyActivities) {
    if (!ordered.find((x) => x.id === a.id)) ordered.push(a);
  }

  const colOf = new Map<string, number>();
  ordered.forEach((a, i) => colOf.set(a.id, i));

  const activities: ActivityNode[] = ordered.map((a, i) => ({ id: a.id, name: a.name, column: i }));

  const precedes: PrecedesEdge[] = precedesRaw.map((p) => {
    const attrs = parseAttrs(p.attrs);
    return {
      from_col: colOf.get(p.fromId) ?? 0,
      to_col: colOf.get(p.toId) ?? 0,
      target_ms: attrs.target_ms as number | undefined,
      actual_ms: attrs.actual_ms as number | undefined,
    };
  });

  // Roles
  const roleMap = new Map<string, RoleNode>();
  for (const r of executesRes.rows as unknown as Array<{ roleId: string; roleName: string; roleAttrs: string; aId: string; attrs: string }>) {
    const col = colOf.get(r.aId);
    if (col === undefined) continue;
    const rAttrs = parseAttrs(r.roleAttrs);
    const eAttrs = parseAttrs(r.attrs);
    let node = roleMap.get(r.roleId);
    if (!node) {
      node = {
        id: r.roleId,
        name: r.roleName,
        team_id: rAttrs.team_id as string | undefined,
        team_name: rAttrs.team_name as string | undefined,
        team_color: rAttrs.team_color as string | undefined,
        columns: [],
        durations: {},
      };
      roleMap.set(r.roleId, node);
    }
    node.columns.push(col);
    if (typeof eAttrs.duration_min === "number") node.durations[col] = eAttrs.duration_min;
  }

  // Systems
  const sysMap = new Map<string, SystemNode>();
  for (const u of usesRes.rows as unknown as Array<{ aId: string; sysId: string; sysName: string; sysAttrs: string; attrs: string }>) {
    const col = colOf.get(u.aId);
    if (col === undefined) continue;
    const sAttrs = parseAttrs(u.sysAttrs);
    const uAttrs = parseAttrs(u.attrs);
    let node = sysMap.get(u.sysId);
    if (!node) {
      node = {
        id: u.sysId,
        name: u.sysName,
        kind: sAttrs.kind as string | undefined,
        usages: [],
      };
      sysMap.set(u.sysId, node);
    }
    node.usages.push({
      column: col,
      target_ms: uAttrs.target_ms as number | undefined,
      actual_ms: uAttrs.actual_ms as number | undefined,
    });
  }

  // Locations
  const locMap = new Map<string, LocationNode>();
  for (const l of locsRes.rows as unknown as Array<{ aId: string; locId: string; locName: string }>) {
    const col = colOf.get(l.aId);
    if (col === undefined) continue;
    let node = locMap.get(l.locId);
    if (!node) {
      node = { id: l.locId, name: l.locName, columns: [] };
      locMap.set(l.locId, node);
    }
    node.columns.push(col);
  }

  return {
    activities,
    roles: [...roleMap.values()],
    systems: [...sysMap.values()],
    locations: [...locMap.values()],
    precedes,
  };
}

function parseAttrs(json: string | undefined | null): Record<string, unknown> {
  if (!json || typeof json !== "string") return {};
  try { return JSON.parse(json) as Record<string, unknown>; } catch { return {}; }
}

// Re-export for views/index.tsx registration.
export { TEAM_TONE };
