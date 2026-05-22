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
  type SelectedRef,
  type VisibleLayers,
  type LayoutMode,
} from "../../components/JourneyCanvas";
import { Loading, ErrorState, SecLabel } from "../_shared";
import { loadJourneyData, parseAttrs } from "../../lib/journeyData";
import styles from "./JourneyGraph.module.css";

const TEAM_TONE: Record<string, "accent" | "good" | "warn" | "danger"> = {
  customer_service: "danger",
  warehouse:        "accent",
  dc_operations:    "good",
  last_mile:        "warn",
};

// =====================================================================
//   Top-level view
// =====================================================================
export function ExplorerJourneyGraph({ route }: { route: Route }) {
  // URL-driven state
  const explicitJourney = route.params["journey"] ?? null;
  const domainFilter    = route.params["domain"] ?? null;
  const subdomainFilter = route.params["subdomain"] ?? null;
  const layoutMode: LayoutMode = route.params["layout"] === "radial" ? "radial" : "chain";
  const visibleLayers: VisibleLayers = {
    roles:     route.params["roles"]     !== "0",
    systems:   route.params["systems"]   !== "0",
    locations: route.params["locations"] !== "0",
  };

  const domains = useFetch(() => api.listDomains(), []);
  const domainDetail = useFetch(
    async () => domainFilter
      ? await fetch(`/api/v1/nodes/Domain/${encodeURIComponent(domainFilter)}`).then((r) => r.ok ? r.json() : null)
      : null,
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

  // Selection (lifted from the canvas to share with the right rail)
  const [selected, setSelected] = useState<SelectedRef>(null);
  useEffect(() => { setSelected(null); }, [activeJourney?.id]);

  // Manual reorder (transient)
  const [manualOrder, setManualOrder] = useState<string[] | null>(null);
  useEffect(() => { setManualOrder(null); }, [activeJourney?.id]);

  // Zoom command bus (toolbar → canvas)
  const [zoomCmd, setZoomCmd] = useState<{ action: "in" | "out" | "reset" | "fit"; nonce: number } | null>(null);
  const [zoomPct, setZoomPct] = useState(100);

  const journeyData = useFetch(
    async () => activeJourney ? loadJourneyData(activeJourney.id) : null,
    [activeJourney?.id],
  );

  // Apply manual order on top of the loaded data
  const renderedData = useMemo(() => {
    if (journeyData.status !== "ok" || !journeyData.data) return null;
    if (!manualOrder || manualOrder.length === 0) return journeyData.data;
    return applyManualOrder(journeyData.data, manualOrder);
  }, [journeyData, manualOrder]);

  // Initiative — simple heuristic: when a system has any breach, surface an in-flight initiative banner.
  const initiative = useMemo(() => {
    if (!renderedData) return null;
    const breach = renderedData.systems.find((s) => s.usages.some((u) => u.target_ms != null && u.actual_ms != null && u.actual_ms > (u.target_ms ?? 0) * 1.5));
    if (!breach) return null;
    const affected = breach.usages.length;
    return {
      name: `${breach.name} latency remediation`,
      affectedActivities: affected,
      status: "in_progress" as const,
    };
  }, [renderedData]);

  return (
    <div className={styles.shell}>
      <Toolbar
        domains={domains.status === "ok" ? domains.data.rows : []}
        domainFilter={domainFilter}
        subdomains={subdomains}
        subdomainFilter={subdomainFilter}
        journeys={journeyList}
        activeJourneyId={activeJourney?.id ?? null}
        layoutMode={layoutMode}
        visibleLayers={visibleLayers}
        zoomPct={zoomPct}
        onZoom={(action) => setZoomCmd({ action, nonce: Math.random() })}
        hasManualOrder={manualOrder !== null}
        onResetOrder={() => setManualOrder(null)}
      />

      <div className={styles.layout}>
        <div className={styles.canvasWrap}>
          {journeyData.status === "loading" && <Loading what="journey graph" />}
          {journeyData.status === "error" && <ErrorState message={journeyData.error} />}
          {journeyData.status === "ok" && renderedData && (
            <>
              <JourneyCanvas
                data={renderedData}
                layoutMode={layoutMode}
                visibleLayers={visibleLayers}
                selected={selected}
                onSelect={setSelected}
                onReorder={setManualOrder}
                zoomCommand={zoomCmd}
                onZoomChange={setZoomPct}
              />
              {initiative && <InitiativeBanner i={initiative} />}
              <Legend visibleLayers={visibleLayers} />
              <HintCard />
              <CrossLink journeyId={activeJourney?.id ?? ""} />
            </>
          )}
          {journeyData.status === "ok" && !renderedData && (
            <p style={{ color: "var(--muted)", padding: 24 }}>Pick a journey above.</p>
          )}
        </div>

        <aside className={styles.rail}>
          {activeJourney && renderedData && (
            <RailContent
              journey={activeJourney}
              data={renderedData}
              selected={selected}
              onClearSelected={() => setSelected(null)}
            />
          )}
        </aside>
      </div>

      {renderedData && activeJourney && (
        <StatusBar journey={activeJourney} data={renderedData} selected={selected} zoomPct={zoomPct} />
      )}
    </div>
  );
}

// =====================================================================
//   Toolbar (filter cascade + layout + bind toggles + zoom)
// =====================================================================
function Toolbar({
  domains, domainFilter, subdomains, subdomainFilter,
  journeys, activeJourneyId,
  layoutMode, visibleLayers,
  zoomPct, onZoom,
  hasManualOrder, onResetOrder,
}: {
  domains: DomainRow[];
  domainFilter: string | null;
  subdomains: string[];
  subdomainFilter: string | null;
  journeys: Array<{ id: string; name: string; domainId: string; domainName: string }>;
  activeJourneyId: string | null;
  layoutMode: LayoutMode;
  visibleLayers: VisibleLayers;
  zoomPct: number;
  onZoom: (action: "in" | "out" | "reset" | "fit") => void;
  hasManualOrder: boolean;
  onResetOrder: () => void;
}) {
  const hasAnyFilter = Boolean(domainFilter || subdomainFilter || activeJourneyId);

  const updateHash = (mut: (p: URLSearchParams) => void): void => {
    const params = new URLSearchParams();
    if (domainFilter)            params.set("domain", domainFilter);
    if (subdomainFilter)         params.set("subdomain", subdomainFilter);
    if (activeJourneyId)         params.set("journey", activeJourneyId);
    if (layoutMode === "radial") params.set("layout", "radial");
    if (!visibleLayers.roles)     params.set("roles", "0");
    if (!visibleLayers.systems)   params.set("systems", "0");
    if (!visibleLayers.locations) params.set("locations", "0");
    mut(params);
    window.location.hash = `#/explorer/journey-graph${params.toString() ? `?${params.toString()}` : ""}`;
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.crumb}>
        <span className={styles.crumbSurface}>Process Explorer</span>
        <span className={styles.crumbSep}>·</span>
        <a href="#/explorer/journey-graph" className={styles.crumbLink}>journeys</a>
        <span className={styles.crumbSep}>·</span>
        <strong className={styles.crumbActive}>
          {activeJourneyId ? journeys.find((j) => j.id === activeJourneyId)?.name : "—"}
        </strong>
      </div>

      <div className={styles.toolbarSep} />

      {/* Filter cascade */}
      <div className={styles.filterGroup}>
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
        {hasAnyFilter && (
          <button
            type="button"
            className={styles.filterReset}
            title="Clear all filters"
            aria-label="Clear all filters"
            onClick={() => { window.location.hash = "#/explorer/journey-graph"; }}
          >×</button>
        )}
      </div>

      <div className={styles.toolbarSep} />

      {/* Layout toggle */}
      <div className={styles.segGroup} role="tablist" aria-label="Layout">
        <button
          type="button"
          role="tab"
          aria-selected={layoutMode === "chain"}
          className={`${styles.segBtn} ${layoutMode === "chain" ? styles.segActive : ""}`}
          onClick={() => updateHash((p) => p.delete("layout"))}
          title="Linear chain — activities backbone, binds above/below"
        >Chain</button>
        <button
          type="button"
          role="tab"
          aria-selected={layoutMode === "radial"}
          className={`${styles.segBtn} ${layoutMode === "radial" ? styles.segActive : ""}`}
          onClick={() => updateHash((p) => p.set("layout", "radial"))}
          title="Radial — activities on a ring, bindings on outer arcs"
        >Radial</button>
      </div>

      <div className={styles.toolbarSep} />

      {/* Bind-type toggles */}
      <div className={styles.segGroup} role="group" aria-label="Show bind types">
        {(["roles", "systems", "locations"] as const).map((layer) => {
          const on = visibleLayers[layer];
          return (
            <button
              key={layer}
              type="button"
              aria-pressed={on}
              className={`${styles.segBtn} ${on ? styles.segActive : ""}`}
              onClick={() => updateHash((p) => {
                if (on) p.set(layer, "0");
                else    p.delete(layer);
              })}
              title={`Show ${layer}`}
            >{layer === "roles" ? "Roles" : layer === "systems" ? "Systems" : "Locations"}</button>
          );
        })}
      </div>

      <div className={styles.spacer} />

      {hasManualOrder && (
        <button type="button" className={styles.manualOrderPill} onClick={onResetOrder} title="Reset to PRECEDES-defined order">
          manual order · reset
        </button>
      )}

      {/* Zoom controls */}
      <div className={styles.segGroup} role="group" aria-label="Zoom">
        <button type="button" className={styles.segBtn} onClick={() => onZoom("out")}  title="Zoom out">−</button>
        <button type="button" className={`${styles.segBtn} ${styles.zoomPct}`} onClick={() => onZoom("reset")} title="Reset (100%)">{zoomPct}%</button>
        <button type="button" className={styles.segBtn} onClick={() => onZoom("in")}   title="Zoom in">+</button>
        <button type="button" className={styles.segBtn} onClick={() => onZoom("fit")}  title="Fit to canvas">⤢</button>
      </div>
    </div>
  );
}

// =====================================================================
//   Initiative banner (top-center overlay)
// =====================================================================
function InitiativeBanner({ i }: { i: { name: string; affectedActivities: number; status: "in_progress" } }) {
  return (
    <div className={styles.initiativeBanner}>
      <span className={styles.initiativeDot} />
      <span>
        <strong>{i.name}</strong>
        <span style={{ marginLeft: 8, color: "color-mix(in oklch, var(--accent) 60%, var(--fg))" }}>
          · {i.status.replace("_", " ")} · affects {i.affectedActivities} activit{i.affectedActivities === 1 ? "y" : "ies"}
        </span>
      </span>
    </div>
  );
}

// =====================================================================
//   Legend (bottom-left)
// =====================================================================
function Legend({ visibleLayers }: { visibleLayers: VisibleLayers }) {
  return (
    <div className={styles.legend}>
      <div className={styles.legendBlock}><Glyph kind="activity" /> <span>ACTIVITY</span></div>
      {visibleLayers.roles      && <div className={styles.legendBlock}><Glyph kind="role" /> <span>ROLE</span></div>}
      {visibleLayers.systems    && <div className={styles.legendBlock}><Glyph kind="system" /> <span>SYSTEM</span></div>}
      {visibleLayers.locations  && <div className={styles.legendBlock}><Glyph kind="location" /> <span>LOCATION</span></div>}
      <div className={styles.legendDivider} />
      <div className={styles.legendBlock}><span className={`${styles.lline} ${styles.linePrecedes}`} /> <span>PRECEDES</span></div>
      {visibleLayers.roles      && <div className={styles.legendBlock}><span className={`${styles.lline} ${styles.lineExecutes}`} /> <span>EXECUTES</span></div>}
      {visibleLayers.systems    && <div className={styles.legendBlock}><span className={`${styles.lline} ${styles.lineUsesSystem}`} /> <span>USES_SYSTEM</span></div>}
      {visibleLayers.locations  && <div className={styles.legendBlock}><span className={`${styles.lline} ${styles.lineAtLocation}`} /> <span>AT_LOCATION</span></div>}
      <div className={styles.legendDivider} />
      <div className={styles.legendBlock}><span className={`${styles.slaSwatch} ${styles.slaOk}`} /> <span>SLA · OK</span></div>
      <div className={styles.legendBlock}><span className={`${styles.slaSwatch} ${styles.slaWarn}`} /> <span>SLA · WARN</span></div>
      <div className={styles.legendBlock}><span className={`${styles.slaSwatch} ${styles.slaBreach}`} /> <span>SLA · BREACH</span></div>
    </div>
  );
}

function Glyph({ kind }: { kind: "activity" | "role" | "system" | "location" }) {
  if (kind === "activity") return <span className={styles.gActivity} />;
  if (kind === "role")     return <span className={styles.gRole} />;
  if (kind === "system")   return <span className={styles.gSystem} />;
  return <span className={styles.gLocation} />;
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

// =====================================================================
//   Right rail — selection-aware
// =====================================================================
function RailContent({
  journey,
  data,
  selected,
  onClearSelected,
}: {
  journey: { id: string; name: string; domainName?: string };
  data: JourneyData;
  selected: SelectedRef;
  onClearSelected: () => void;
}) {
  if (selected) {
    return <SelectedNodePanel data={data} selected={selected} onClear={onClearSelected} />;
  }
  return <CompositionPanel journey={journey} data={data} />;
}

function SelectedNodePanel({
  data,
  selected,
  onClear,
}: {
  data: JourneyData;
  selected: NonNullable<SelectedRef>;
  onClear: () => void;
}) {
  if (selected.kind === "activity") {
    const a = data.activities.find((x) => x.id === selected.id);
    if (!a) return null;
    const roles    = data.roles.filter((r) => r.columns.includes(a.column));
    const systems  = data.systems.filter((s) => s.usages.some((u) => u.column === a.column));
    const locs     = data.locations.filter((l) => l.columns.includes(a.column));
    const upstream = data.precedes.filter((p) => p.to_col === a.column);
    const downstream = data.precedes.filter((p) => p.from_col === a.column);
    return (
      <>
        <Card title="Selected activity" actions={<CloseBtn onClick={onClear} />}>
          <SecLabel>ACTIVITY · #{a.column + 1}</SecLabel>
          <div className={styles.bigTitle}>{a.name}</div>
          <code className={styles.id}>{a.id}</code>
        </Card>
        <Card title="Roles executing">
          {roles.length === 0 ? <Empty /> : (
            <ul className={styles.bindList}>
              {roles.map((r) => (
                <li key={r.id}>
                  <span className={styles.bindStripe} style={{ background: teamColor(r.team_color) }} />
                  <strong>{r.name}</strong>
                  {r.team_name && <span className={styles.bindMicro}>{r.team_name}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Systems used">
          {systems.length === 0 ? <Empty /> : (
            <ul className={styles.bindList}>
              {systems.map((s) => {
                const u = s.usages.find((x) => x.column === a.column);
                return (
                  <li key={s.id}>
                    <strong>{s.name}</strong>
                    {u && u.target_ms != null && u.actual_ms != null && (
                      <span className={styles.bindMicro}>
                        <SlaPill target={u.target_ms} actual={u.actual_ms} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Locations">
          {locs.length === 0 ? <Empty /> : (
            <ul className={styles.bindList}>
              {locs.map((l) => <li key={l.id}><strong>{l.name}</strong></li>)}
            </ul>
          )}
        </Card>
        <Card title="Adjacent activities">
          <ul className={styles.bindList}>
            {upstream.length === 0 && downstream.length === 0 && <Empty />}
            {upstream.map((p, i) => (
              <li key={`u${i}`}>
                <span style={{ color: "var(--muted)" }}>← </span>
                <strong>{nameAt(data.activities, p.from_col)}</strong>
                {p.target_ms != null && p.actual_ms != null && (
                  <span className={styles.bindMicro}>
                    <SlaPill target={p.target_ms} actual={p.actual_ms} />
                  </span>
                )}
              </li>
            ))}
            {downstream.map((p, i) => (
              <li key={`d${i}`}>
                <span style={{ color: "var(--muted)" }}>→ </span>
                <strong>{nameAt(data.activities, p.to_col)}</strong>
                {p.target_ms != null && p.actual_ms != null && (
                  <span className={styles.bindMicro}>
                    <SlaPill target={p.target_ms} actual={p.actual_ms} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </>
    );
  }

  if (selected.kind === "role") {
    const r = data.roles.find((x) => x.id === selected.id);
    if (!r) return null;
    const acts = data.activities.filter((a) => r.columns.includes(a.column));
    return (
      <>
        <Card title="Selected role" actions={<CloseBtn onClick={onClear} />}>
          <SecLabel>ROLE</SecLabel>
          <div className={styles.bigTitle}>
            <span className={styles.titleStripe} style={{ background: teamColor(r.team_color) }} />
            {r.name}
          </div>
          {r.team_name && <Pill tone={TEAM_TONE[r.team_id ?? ""] ?? "neutral"}>{r.team_name}</Pill>}
          <div style={{ marginTop: 8 }}><code className={styles.id}>{r.id}</code></div>
        </Card>
        <Card title="Activities executed">
          <ul className={styles.bindList}>
            {acts.map((a) => (
              <li key={a.id}>
                <strong>#{a.column + 1}</strong>
                <span style={{ marginLeft: 6 }}>{a.name}</span>
                {r.durations[a.column] != null && (
                  <span className={styles.bindMicro}>{r.durations[a.column]}m</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </>
    );
  }

  if (selected.kind === "system") {
    const s = data.systems.find((x) => x.id === selected.id);
    if (!s) return null;
    return (
      <>
        <Card title="Selected system" actions={<CloseBtn onClick={onClear} />}>
          <SecLabel>SYSTEM</SecLabel>
          <div className={styles.bigTitle}>{s.name}</div>
          {s.kind && <Pill tone="accent">{s.kind}</Pill>}
          <div style={{ marginTop: 8 }}><code className={styles.id}>{s.id}</code></div>
        </Card>
        <Card title="USES_SYSTEM bindings">
          <table className={styles.usageTable}>
            <thead><tr><th>Activity</th><th>Target</th><th>Actual</th><th>SLA</th></tr></thead>
            <tbody>
              {s.usages.map((u, i) => (
                <tr key={i}>
                  <td>#{u.column + 1} · {nameAt(data.activities, u.column)}</td>
                  <td className={styles.num}>{u.target_ms != null ? `${u.target_ms}ms` : "—"}</td>
                  <td className={styles.num}>{u.actual_ms != null ? `${u.actual_ms}ms` : "—"}</td>
                  <td>{u.target_ms != null && u.actual_ms != null && <SlaPill target={u.target_ms} actual={u.actual_ms} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </>
    );
  }

  // Location
  const l = data.locations.find((x) => x.id === selected.id);
  if (!l) return null;
  const acts = data.activities.filter((a) => l.columns.includes(a.column));
  return (
    <>
      <Card title="Selected location" actions={<CloseBtn onClick={onClear} />}>
        <SecLabel>LOCATION</SecLabel>
        <div className={styles.bigTitle}>{l.name}</div>
        <code className={styles.id}>{l.id}</code>
      </Card>
      <Card title="Activities at this location">
        <ul className={styles.bindList}>
          {acts.map((a) => (
            <li key={a.id}>
              <strong>#{a.column + 1}</strong>
              <span style={{ marginLeft: 6 }}>{a.name}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.closeBtn} onClick={onClick} aria-label="Clear selection">×</button>
  );
}

function Empty() {
  return <span style={{ color: "var(--muted)", fontSize: 12 }}>none</span>;
}

function SlaPill({ target, actual }: { target: number; actual: number }) {
  const tone: "good" | "warn" | "danger" =
    actual <= target ? "good" : actual <= target * 1.5 ? "warn" : "danger";
  return <Pill tone={tone}>{actual}/{target}ms</Pill>;
}

function teamColor(c?: string): string {
  switch (c) {
    case "accent": return "var(--accent)";
    case "good":   return "var(--good)";
    case "warn":   return "var(--warn)";
    case "danger": return "var(--danger)";
    default:       return "var(--muted-2)";
  }
}

function nameAt(activities: ActivityNode[], col: number): string {
  return activities.find((a) => a.column === col)?.name ?? "—";
}

// =====================================================================
//   Composition rail (when nothing is selected)
// =====================================================================
function CompositionPanel({
  journey,
  data,
}: {
  journey: { id: string; name: string; domainName?: string };
  data: JourneyData;
}) {
  const sla = computeSlaSummary(data);
  const accountable = "VP Operations";
  const cost = 8.5;
  const runs = 12_400;
  const handoffs = countHandoffs(data);
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
          { label: "hand-offs",     value: handoffs },
          { label: "critical path", value: `${Math.round(data.precedes.reduce((s, e) => s + (e.target_ms ?? 0), 0) / 1000)}s` },
        ]} />
      </Card>
      <Card title="Cost / Run">
        <KeyValueList rows={[
          { label: "USD / run",    value: `$${cost.toFixed(2)}` },
          { label: "runs / month", value: runs.toLocaleString() },
          { label: "USD / month",  value: `$${(cost * runs).toLocaleString()}` },
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
          { label: "role", value: accountable },
          { label: "id",   value: <code className={styles.id}>r_vp_ops</code> },
        ]} />
      </Card>
      <div className={styles.tip}>
        Click a <strong>node</strong> to focus it · drag the <strong>handle</strong> beside an activity to reorder · scroll to zoom, drag empty space to pan.
      </div>
    </>
  );
}

// =====================================================================
//   Bottom status bar
// =====================================================================
function StatusBar({
  journey, data, selected, zoomPct,
}: {
  journey: { id: string; name: string };
  data: JourneyData;
  selected: SelectedRef;
  zoomPct: number;
}) {
  const sla = computeSlaSummary(data);
  const nodes = data.activities.length + data.roles.length + data.systems.length + data.locations.length;
  const edges = countEdges(data);
  const sod = data.roles.filter((r) => r.columns.length > 1).length;
  const handoffs = countHandoffs(data);

  const selectionLabel = selected
    ? `${selected.kind} · ${selectedName(data, selected) ?? selected.id.slice(0, 8)}`
    : "no selection";

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
      <span>{selectionLabel}</span>
      <span>·</span>
      <span><strong>{handoffs}</strong> hand-offs</span>
      <span>·</span>
      <span><strong>{sod}</strong> SoD pairs</span>
      <span className={styles.statusSpacer} />
      <span>zoom <strong>{zoomPct}%</strong></span>
      <span>·</span>
      <span>journey · <code>{journey.id.slice(0, 12)}…</code></span>
    </div>
  );
}

function selectedName(data: JourneyData, s: NonNullable<SelectedRef>): string | undefined {
  if (s.kind === "activity") return data.activities.find((a) => a.id === s.id)?.name;
  if (s.kind === "role")     return data.roles.find((r) => r.id === s.id)?.name;
  if (s.kind === "system")   return data.systems.find((sy) => sy.id === s.id)?.name;
  return data.locations.find((l) => l.id === s.id)?.name;
}

function countEdges(d: JourneyData): number {
  return d.precedes.length
    + d.roles.reduce((s, r) => s + r.columns.length, 0)
    + d.systems.reduce((s, sy) => s + sy.usages.length, 0)
    + d.locations.reduce((s, l) => s + l.columns.length, 0);
}

function countHandoffs(d: JourneyData): number {
  let n = 0;
  for (const p of d.precedes) {
    const fromRoles = d.roles.filter((r) => r.columns.includes(p.from_col)).map((r) => r.id).sort().join(",");
    const toRoles   = d.roles.filter((r) => r.columns.includes(p.to_col)).map((r) => r.id).sort().join(",");
    if (fromRoles !== toRoles) n++;
  }
  return n;
}

// =====================================================================
//   Manual-reorder application
// =====================================================================
function applyManualOrder(d: JourneyData, order: string[]): JourneyData {
  // order is an array of activity ids in the desired column order.
  const newCol = new Map<string, number>();
  order.forEach((id, idx) => newCol.set(id, idx));
  // Map from old column → new column for activities present in `order`.
  const oldNew = new Map<number, number>();
  for (const a of d.activities) {
    const nc = newCol.get(a.id);
    if (nc !== undefined) oldNew.set(a.column, nc);
  }
  const mapCol = (c: number): number => oldNew.get(c) ?? c;

  return {
    activities: d.activities.map((a) => ({ ...a, column: mapCol(a.column) })),
    roles: d.roles.map((r) => ({
      ...r,
      columns: r.columns.map(mapCol),
      durations: Object.fromEntries(Object.entries(r.durations).map(([k, v]) => [String(mapCol(Number(k))), v])) as Record<number, number>,
    })),
    systems: d.systems.map((s) => ({
      ...s,
      usages: s.usages.map((u) => ({ ...u, column: mapCol(u.column) })),
    })),
    locations: d.locations.map((l) => ({ ...l, columns: l.columns.map(mapCol) })),
    precedes: d.precedes.map((p) => ({ ...p, from_col: mapCol(p.from_col), to_col: mapCol(p.to_col) })),
  };
}

// =====================================================================
//   Data loader — moved to lib/journeyData.ts; re-exported here for
//   any legacy imports, but the canonical source is the shared module.
// =====================================================================
async function _loadJourneyData_unused(journeyId: string): Promise<JourneyData> {
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

  const precedesRaw = precedesRes.rows as unknown as Array<{ fromId: string; toId: string; attrs: string }>;
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

  const roleMap = new Map<string, RoleNode>();
  for (const r of executesRes.rows as unknown as Array<{ roleId: string; roleName: string; roleAttrs: string; aId: string; attrs: string }>) {
    const col = colOf.get(r.aId);
    if (col === undefined) continue;
    const rAttrs = parseAttrs(r.roleAttrs);
    const eAttrs = parseAttrs(r.attrs);
    let node = roleMap.get(r.roleId);
    if (!node) {
      node = {
        id: r.roleId, name: r.roleName,
        team_id:    rAttrs.team_id as string | undefined,
        team_name:  rAttrs.team_name as string | undefined,
        team_color: rAttrs.team_color as string | undefined,
        columns: [], durations: {},
      };
      roleMap.set(r.roleId, node);
    }
    node.columns.push(col);
    if (typeof eAttrs.duration_min === "number") node.durations[col] = eAttrs.duration_min;
  }

  const sysMap = new Map<string, SystemNode>();
  for (const u of usesRes.rows as unknown as Array<{ aId: string; sysId: string; sysName: string; sysAttrs: string; attrs: string }>) {
    const col = colOf.get(u.aId);
    if (col === undefined) continue;
    const sAttrs = parseAttrs(u.sysAttrs);
    const uAttrs = parseAttrs(u.attrs);
    let node = sysMap.get(u.sysId);
    if (!node) {
      node = { id: u.sysId, name: u.sysName, kind: sAttrs.kind as string | undefined, usages: [] };
      sysMap.set(u.sysId, node);
    }
    node.usages.push({
      column: col,
      target_ms: uAttrs.target_ms as number | undefined,
      actual_ms: uAttrs.actual_ms as number | undefined,
    });
  }

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

void parseAttrs; // re-exported from lib/journeyData — kept here to satisfy any inlined usages above.
void _loadJourneyData_unused;

export { TEAM_TONE };
