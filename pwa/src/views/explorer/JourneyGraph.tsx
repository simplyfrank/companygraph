import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "../../route";
import { api, type DomainRow, ontologyProposals, rdf, queryOntology } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { KeyValueList } from "../../components/KeyValueList";
import { Button } from "../../components/Button";
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
import { loadJourneyPortfolio, type JourneyPortfolio } from "../../lib/journeyPortfolio";
import { fetchComplianceStatus, type ComplianceStatus } from "../../lib/journeyHealth";
import { JourneyBoard } from "../../components/JourneyBoard";
import styles from "./JourneyGraph.module.css";

const TEAM_TONE: Record<string, "accent" | "good" | "warn" | "danger"> = {
  customer_service: "danger",
  warehouse:        "accent",
  dc_operations:    "good",
  last_mile:        "warn",
};

interface JourneyBadges {
  slaBreach: number;
  slaWarn:   number;
  handoffs:  number;
  sod:       number;
  complianceScore: number;
  complianceViolations: number;
}
type BadgeMap = Record<string, JourneyBadges>;

interface MultiJourneyData {
  journeys: Array<{
    id: string;
    name: string;
    domainId: string;
    domainName: string;
    inputJourneys: string[];
    outputJourneys: string[];
    collapsed: boolean;
    depth: number;
    visible: boolean;
  }>;
  crossJourneyEdges: Array<{
    fromJourneyId: string;
    toJourneyId: string;
    type: string;
  }>;
}

async function loadAllJourneysWithDependencies(domainFilter: string | null, maxVisibleDepth: number = 2): Promise<MultiJourneyData> {
  // Fetch all journeys
  const journeysRes = await api.cypher(
    domainFilter
      ? `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain {id: $domainId})
         RETURN j.id AS id, j.name AS name, d.id AS domainId, d.name AS domainName
         ORDER BY j.name`
      : `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)
         RETURN j.id AS id, j.name AS name, d.id AS domainId, d.name AS domainName
         ORDER BY j.name`,
    domainFilter ? { domainId: domainFilter } : {}
  );
  
  const journeys = journeysRes.rows as Array<{
    id: string;
    name: string;
    domainId: string;
    domainName: string;
  }>;
  
  // Fetch cross-journey edges (journeys that have activities with PRECEDES relationships to activities in other journeys)
  const crossEdgesRes = await api.cypher(
    `MATCH (a1:Activity)-[:PART_OF]->(j1:UserJourney)
     MATCH (a1)-[r:PRECEDES]->(a2:Activity)-[:PART_OF]->(j2:UserJourney)
     WHERE j1.id <> j2.id
     RETURN j1.id AS fromJourneyId, j2.id AS toJourneyId, r.type AS type`
  );
  
  const crossJourneyEdges = crossEdgesRes.rows as Array<{
    fromJourneyId: string;
    toJourneyId: string;
    type: string;
  }>;
  
  // Build input/output relationships and dependency graph
  const journeyMap = new Map(journeys.map(j => [j.id, { ...j, inputJourneys: [] as string[], outputJourneys: [] as string[] }]));
  
  crossJourneyEdges.forEach(edge => {
    const fromJourney = journeyMap.get(edge.fromJourneyId);
    const toJourney = journeyMap.get(edge.toJourneyId);
    if (fromJourney && toJourney) {
      fromJourney.outputJourneys.push(edge.toJourneyId);
      toJourney.inputJourneys.push(edge.fromJourneyId);
    }
  });
  
  // Calculate depth for each journey using BFS from journeys with no inputs
  const journeyDepths = new Map<string, number>();
  const inDegree = new Map<string, number>();
  
  // Initialize in-degrees
  journeyMap.forEach((_, id) => inDegree.set(id, 0));
  crossJourneyEdges.forEach(edge => {
    inDegree.set(edge.toJourneyId, (inDegree.get(edge.toJourneyId) || 0) + 1);
  });
  
  // BFS to calculate depths starting from journeys with no inputs
  const queue: string[] = [];
  journeyMap.forEach((_, id) => {
    if ((inDegree.get(id) || 0) === 0) {
      queue.push(id);
      journeyDepths.set(id, 0);
    }
  });
  
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentDepth = journeyDepths.get(currentId) || 0;
    
    const journey = journeyMap.get(currentId);
    if (journey) {
      journey.outputJourneys.forEach(outputId => {
        if (!journeyDepths.has(outputId)) {
          journeyDepths.set(outputId, currentDepth + 1);
          queue.push(outputId);
        }
      });
    }
  }
  
  // Determine visibility based on context and depth
  const visibleJourneys = new Set<string>();
  
  if (domainFilter) {
    // Domain or subdomain view: show journeys in that domain
    journeyMap.forEach((journey, id) => {
      if (journey.domainId === domainFilter) {
        const depth = journeyDepths.get(id) || 0;
        if (depth <= maxVisibleDepth) {
          visibleJourneys.add(id);
        }
      }
    });
  } else {
    // All domains view: show first N levels across all domains
    journeyMap.forEach((_, id) => {
      const depth = journeyDepths.get(id) || 0;
      if (depth <= maxVisibleDepth) {
        visibleJourneys.add(id);
      }
    });
  }
  
  return {
    journeys: Array.from(journeyMap.values()).map(j => {
      const depth = journeyDepths.get(j.id) || 0;
      const visible = visibleJourneys.has(j.id);
      // Auto-collapse journeys beyond maxVisibleDepth
      const collapsed = depth > maxVisibleDepth || !visible;
      return { ...j, depth, visible, collapsed };
    }),
    crossJourneyEdges,
  };
}

// =====================================================================
//   Multi-journey view component
// =====================================================================
function MultiJourneyView({ 
  data, 
  badgeMap, 
  maxVisibleDepth,
  onDepthChange,
  onJourneySelect, 
  onToggleCollapse 
}: { 
  data: MultiJourneyData; 
  badgeMap: BadgeMap; 
  maxVisibleDepth: number;
  onDepthChange: (depth: number) => void;
  onJourneySelect: (journeyId: string) => void; 
  onToggleCollapse: (journeyId: string) => void; 
}) {
  const [selectedJourney, setSelectedJourney] = useState<string | null>(null);
  const [collapsedJourneys, setCollapsedJourneys] = useState<Set<string>>(new Set());
  
  // Initialize collapsed state from data
  useEffect(() => {
    const initialCollapsed = new Set(data.journeys.filter(j => j.collapsed).map(j => j.id));
    setCollapsedJourneys(initialCollapsed);
  }, [data.journeys]);
  
  const handleToggleCollapse = (journeyId: string) => {
    setCollapsedJourneys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(journeyId)) {
        newSet.delete(journeyId);
      } else {
        newSet.add(journeyId);
      }
      return newSet;
    });
  };
  
  const handleExpandLevel = () => {
    const newDepth = maxVisibleDepth + 1;
    onDepthChange(newDepth);
    // Expand journeys at the new depth level
    const journeysToExpand = data.journeys.filter(j => j.depth === maxVisibleDepth && !collapsedJourneys.has(j.id));
    const newCollapsed = new Set(collapsedJourneys);
    journeysToExpand.forEach(j => newCollapsed.delete(j.id));
    setCollapsedJourneys(newCollapsed);
  };
  
  const handleCollapseLevel = () => {
    if (maxVisibleDepth > 1) {
      const newDepth = maxVisibleDepth - 1;
      onDepthChange(newDepth);
      // Collapse journeys beyond the new depth level
      const journeysToCollapse = data.journeys.filter(j => j.depth >= maxVisibleDepth);
      const newCollapsed = new Set(collapsedJourneys);
      journeysToCollapse.forEach(j => newCollapsed.add(j.id));
      setCollapsedJourneys(newCollapsed);
    }
  };
  
  // Group journeys by domain and sort by depth for hierarchical display
  const journeysByDomain = useMemo(() => {
    const grouped = new Map<string, typeof data.journeys>();
    data.journeys.forEach(journey => {
      const domain = journey.domainName;
      if (!grouped.has(domain)) grouped.set(domain, []);
      grouped.get(domain)!.push(journey);
    });
    // Sort journeys within each domain by depth
    grouped.forEach(journeys => {
      journeys.sort((a, b) => a.depth - b.depth);
    });
    return grouped;
  }, [data.journeys]);
  
  const visibleJourneys = data.journeys.filter(j => j.visible);
  const hiddenJourneys = data.journeys.filter(j => !j.visible);
  
  return (
    <div className={styles.multiJourneyView}>
      {/* Depth control */}
      <div className={styles.depthControl}>
        <span className={styles.depthLabel}>Showing depth: {maxVisibleDepth}</span>
        <button
          className={styles.depthBtn}
          onClick={handleCollapseLevel}
          disabled={maxVisibleDepth <= 1}
          title="Show fewer levels"
        >
          −
        </button>
        <button
          className={styles.depthBtn}
          onClick={handleExpandLevel}
          disabled={maxVisibleDepth >= 5}
          title="Show more levels"
        >
          +
        </button>
        <span className={styles.depthInfo}>
          ({visibleJourneys.length} visible, {hiddenJourneys.length} hidden)
        </span>
      </div>
      
      {Array.from(journeysByDomain.entries()).map(([domainName, journeys]) => (
        <div key={domainName} className={styles.domainSection}>
          <h3 className={styles.domainTitle}>{domainName}</h3>
          <div className={styles.journeyGrid}>
            {journeys.map(journey => {
              const badges = badgeMap[journey.id] || { slaBreach: 0, slaWarn: 0, handoffs: 0, sod: 0, complianceScore: 100, complianceViolations: 0 };
              const isSelected = selectedJourney === journey.id;
              const isCollapsed = collapsedJourneys.has(journey.id);
              const isVisible = journey.visible;
              
              if (!isVisible) return null; // Skip hidden journeys
              
              return (
                <div
                  key={journey.id}
                  className={`${styles.journeyCard} ${isSelected ? styles.selected : ''} ${!isVisible ? styles.hidden : ''}`}
                  style={{ marginLeft: `${journey.depth * 16}px` }}
                  onClick={() => {
                    setSelectedJourney(journey.id);
                    onJourneySelect(journey.id);
                  }}
                >
                  <div className={styles.journeyHeader}>
                    <h4 className={styles.journeyName}>{journey.name}</h4>
                    <div className={styles.journeyMeta}>
                      <span className={styles.depthBadge}>Depth {journey.depth}</span>
                      <button
                        className={styles.collapseBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleCollapse(journey.id);
                        }}
                        title={isCollapsed ? "Expand journey" : "Collapse journey"}
                      >
                        {isCollapsed ? '▶' : '▼'}
                      </button>
                    </div>
                  </div>
                  
                  {isCollapsed ? (
                    <div className={styles.collapsedView}>
                      <div className={styles.ioSection}>
                        <div className={styles.ioLabel}>Inputs:</div>
                        <div className={styles.ioList}>
                          {journey.inputJourneys.length === 0 ? (
                            <span className={styles.ioEmpty}>None</span>
                          ) : (
                            journey.inputJourneys.map(inputId => {
                              const inputJourney = data.journeys.find(j => j.id === inputId);
                              return inputJourney ? (
                                <span key={inputId} className={styles.ioItem}>{inputJourney.name}</span>
                              ) : null;
                            })
                          )}
                        </div>
                      </div>
                      <div className={styles.ioSection}>
                        <div className={styles.ioLabel}>Outputs:</div>
                        <div className={styles.ioList}>
                          {journey.outputJourneys.length === 0 ? (
                            <span className={styles.ioEmpty}>None</span>
                          ) : (
                            journey.outputJourneys.map(outputId => {
                              const outputJourney = data.journeys.find(j => j.id === outputId);
                              return outputJourney ? (
                                <span key={outputId} className={styles.ioItem}>{outputJourney.name}</span>
                              ) : null;
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.expandedView}>
                      <p className={styles.journeyDescription}>Full journey details would be shown here</p>
                    </div>
                  )}
                  
                  <div className={styles.journeyBadges}>
                    {badges.slaBreach > 0 && <span className={`${styles.badge} ${styles.badgeBreach}`}>{badges.slaBreach} breach</span>}
                    {badges.slaWarn > 0 && <span className={`${styles.badge} ${styles.badgeWarn}`}>{badges.slaWarn} warn</span>}
                    {badges.handoffs > 0 && <span className={styles.badge}>{badges.handoffs} hand-off</span>}
                    {badges.sod > 0 && <span className={`${styles.badge} ${styles.badgeSod}`}>{badges.sod} SoD</span>}
                    {badges.complianceScore < 100 && <span className={`${styles.badge} ${badges.complianceScore < 70 ? styles.badgeBreach : styles.badgeWarn}`}>Compliance {badges.complianceScore}%</span>}
                    {badges.complianceViolations > 0 && <span className={`${styles.badge} ${styles.badgeBreach}`}>{badges.complianceViolations} violation{badges.complianceViolations > 1 ? 's' : ''}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// =====================================================================
//   Top-level view
// =====================================================================
export function ExplorerJourneyGraph({ route }: { route: Route }) {
  // URL-driven state
  const explicitJourney = route.params["journey"] ?? null;
  const domainFilter    = route.params["domain"] ?? null;
  const subdomainFilter = route.params["subdomain"] ?? null;
  const layoutMode: LayoutMode = route.params["layout"] === "radial" ? "radial" : route.params["layout"] === "board" ? "board" : route.params["layout"] === "multi" ? "multi" : "chain";
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

  // Full un-filtered journey list (needed for the picker to show all domains).
  const allJourneys = journeys.status === "ok"
    ? (journeys.data.rows as unknown as Array<{ id: string; name: string; domainId: string; domainName: string }>)
    : [];

  const journeyList = allJourneys
    .filter((j) => !domainFilter || j.domainId === domainFilter);

  // Per-journey SLA breach/warn counts — fetched once globally, not per-journey.
  // Falls back gracefully to empty on seeds without SLA attributes.
  const slaBadges = useFetch(
    () =>
      api.cypher(
        `MATCH (a1:Activity)-[r:PRECEDES]->(a2:Activity)
         WHERE r.attributes_json IS NOT NULL
           AND r.attributes_json <> '{}'
         OPTIONAL MATCH (a1)-[:PART_OF]->(j:UserJourney)
         WITH j, r.attributes_json AS attrs
         WHERE j IS NOT NULL
         WITH j.id AS journeyId,
              attrs,
              apoc.convert.fromJsonMap(attrs) AS a
         WITH journeyId,
              a['target_p99_ms'] AS target,
              a['observed_p99_ms'] AS observed
         WHERE target IS NOT NULL AND observed IS NOT NULL AND toFloat(target) > 0
         WITH journeyId,
              CASE WHEN toFloat(observed) > toFloat(target) THEN 1 ELSE 0 END AS isBreach,
              CASE WHEN toFloat(observed) <= toFloat(target)
                    AND toFloat(observed) > toFloat(target) * 0.9 THEN 1 ELSE 0 END AS isWarn
         RETURN journeyId,
                sum(isBreach) AS breach,
                sum(isWarn)   AS warn`,
      ),
    [],
  );

  // Per-journey handoff counts (cross-team PRECEDES transitions).
  const handoffBadges = useFetch(
    () =>
      api.cypher(
        `MATCH (a1:Activity)-[:PRECEDES]->(a2:Activity)
         OPTIONAL MATCH (a1)-[:PART_OF]->(j:UserJourney)
         OPTIONAL MATCH (r1:Role)-[:EXECUTES]->(a1)
         OPTIONAL MATCH (r2:Role)-[:EXECUTES]->(a2)
         WITH j, a1, a2,
              coalesce(
                apoc.convert.fromJsonMap(coalesce(r1.attributes_json,'{}'))['team_id'],
                apoc.convert.fromJsonMap(coalesce(a1.attributes_json,'{}'))['team']
              ) AS t1,
              coalesce(
                apoc.convert.fromJsonMap(coalesce(r2.attributes_json,'{}'))['team_id'],
                apoc.convert.fromJsonMap(coalesce(a2.attributes_json,'{}'))['team']
              ) AS t2
         WHERE j IS NOT NULL AND t1 IS NOT NULL AND t2 IS NOT NULL AND t1 <> t2
         RETURN j.id AS journeyId, count(*) AS handoffs`,
      ),
    [],
  );

  // Per-journey SoD violation counts (activities with sod_severity attribute).
  const sodBadges = useFetch(
    () =>
      api.cypher(
        `MATCH (a1:Activity)-[:PRECEDES]->(a2:Activity)
         WHERE a1.attributes_json CONTAINS '"sod_severity"'
            OR a2.attributes_json CONTAINS '"sod_severity"'
         OPTIONAL MATCH (a1)-[:PART_OF]->(j:UserJourney)
         WHERE j IS NOT NULL
         RETURN j.id AS journeyId, count(*) AS sod`,
      ),
    [],
  );

  // Merge badge data into a single map keyed by journey id.
  const badgeMap = useMemo((): BadgeMap => {
    const map: BadgeMap = {};
    if (slaBadges.status === "ok") {
      for (const r of slaBadges.data.rows as Array<{ journeyId: string; breach: number; warn: number }>) {
        if (!map[r.journeyId]) map[r.journeyId] = { slaBreach: 0, slaWarn: 0, handoffs: 0, sod: 0, complianceScore: 100, complianceViolations: 0 };
        map[r.journeyId]!.slaBreach = Number(r.breach) || 0;
        map[r.journeyId]!.slaWarn   = Number(r.warn)   || 0;
      }
    }
    if (handoffBadges.status === "ok") {
      for (const r of handoffBadges.data.rows as Array<{ journeyId: string; handoffs: number }>) {
        if (!map[r.journeyId]) map[r.journeyId] = { slaBreach: 0, slaWarn: 0, handoffs: 0, sod: 0, complianceScore: 100, complianceViolations: 0 };
        map[r.journeyId]!.handoffs = Number(r.handoffs) || 0;
      }
    }
    if (sodBadges.status === "ok") {
      for (const r of sodBadges.data.rows as Array<{ journeyId: string; sod: number }>) {
        if (!map[r.journeyId]) map[r.journeyId] = { slaBreach: 0, slaWarn: 0, handoffs: 0, sod: 0, complianceScore: 100, complianceViolations: 0 };
        map[r.journeyId]!.sod = Number(r.sod) || 0;
      }
    }
    return map;
  }, [slaBadges.status, handoffBadges.status, sodBadges.status]);  // eslint-disable-line react-hooks/exhaustive-deps

  const orderFulfillment = journeyList.find((j) => j.name === "Order fulfillment");
  const activeJourney = explicitJourney
    ? journeyList.find((j) => j.id === explicitJourney)
    : null; // Changed to null to enable "all journeys" mode when no journey selected

  const updateHash = (mut: (p: URLSearchParams) => void): void => {
    const params = new URLSearchParams();
    if (domainFilter)            params.set("domain", domainFilter);
    if (subdomainFilter)         params.set("subdomain", subdomainFilter);
    if (activeJourney?.id)       params.set("journey", activeJourney.id);
    if (layoutMode === "radial") params.set("layout", "radial");
    if (layoutMode === "board")  params.set("layout", "board");
    if (layoutMode === "multi")  params.set("layout", "multi");
    if (!visibleLayers.roles)    params.set("roles", "0");
    if (!visibleLayers.systems)  params.set("systems", "0");
    if (!visibleLayers.locations) params.set("locations", "0");
    mut(params);
    window.location.hash = `#/explorer/journey-graph${params.toString() ? `?${params.toString()}` : ""}`;
  };

  // Fetch compliance status for active journey
  const complianceStatus = useFetch(
    async () => activeJourney ? fetchComplianceStatus(activeJourney.id, activeJourney.domainId) : null,
    [activeJourney?.id],
  );

  // Update badge map with compliance data for active journey
  const complianceData = complianceStatus.status === "ok" ? complianceStatus.data : null;
  useEffect(() => {
    if (complianceData && activeJourney) {
      const badge = badgeMap[activeJourney.id];
      if (badge) {
        badge.complianceScore = complianceData.score;
        badge.complianceViolations = complianceData.violations;
      }
    }
  }, [complianceData, activeJourney?.id]);
  
  // Auto-switch to multi mode for domain/subdomain/all views
  const shouldUseMultiMode = !activeJourney || domainFilter || subdomainFilter;
  const effectiveLayoutMode: LayoutMode = shouldUseMultiMode ? "multi" : layoutMode;

  // Selection (lifted from the canvas to share with the right rail)
  const [selected, setSelected] = useState<SelectedRef>(null);
  useEffect(() => { setSelected(null); }, [activeJourney?.id]);

  // Manual reorder (transient)
  const [manualOrder, setManualOrder] = useState<string[] | null>(null);
  useEffect(() => { setManualOrder(null); }, [activeJourney?.id]);

  // Zoom command bus (toolbar → canvas)
  const [zoomCmd, setZoomCmd] = useState<{ action: "in" | "out" | "reset" | "fit"; nonce: number } | null>(null);
  const [zoomPct, setZoomPct] = useState(100);

  // Board mode - selected journey for right rail
  const [boardSelectedJourney, setBoardSelectedJourney] = useState<string | null>(null);
  useEffect(() => { setBoardSelectedJourney(null); }, [layoutMode]);

  // Query panel toggle
  const [showQueryPanel, setShowQueryPanel] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [queryResults, setQueryResults] = useState<any[] | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  const journeyData = useFetch(
    async () => activeJourney && effectiveLayoutMode !== "board" && effectiveLayoutMode !== "multi" ? loadJourneyData(activeJourney.id) : null,
    [activeJourney?.id, effectiveLayoutMode],
  );

  const portfolioData = useFetch(
    async () => effectiveLayoutMode === "board" ? loadJourneyPortfolio(domainFilter) : null,
    [effectiveLayoutMode, domainFilter],
  );

  // Multi-journey mode: fetch all journeys with their dependencies
  const [maxVisibleDepth, setMaxVisibleDepth] = useState(2);
  const multiJourneyData = useFetch(
    async () => effectiveLayoutMode === "multi" ? loadAllJourneysWithDependencies(domainFilter, maxVisibleDepth) : null,
    [effectiveLayoutMode, domainFilter, maxVisibleDepth],
  );

  // Apply manual order on top of the loaded data
  const renderedData = useMemo(() => {
    if (journeyData.status !== "ok" || !journeyData.data) return null;
    if (!manualOrder || manualOrder.length === 0) return journeyData.data;
    return applyManualOrder(journeyData.data, manualOrder);
  }, [journeyData, manualOrder]);

  // Render timing — track how long data processing takes
  const [renderMs, setRenderMs] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (journeyData.status === "ok" && journeyData.data) {
      const t0 = performance.now();
      // Microtask to capture actual render cost
      requestAnimationFrame(() => {
        setRenderMs(Math.round(performance.now() - t0));
      });
    }
  }, [journeyData]);

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
        journeys={allJourneys}
        activeJourneyId={activeJourney?.id ?? null}
        badgeMap={badgeMap}
        layoutMode={layoutMode}
        visibleLayers={visibleLayers}
        zoomPct={zoomPct}
        onZoom={(action) => setZoomCmd({ action, nonce: Math.random() })}
        hasManualOrder={manualOrder !== null}
        onResetOrder={() => setManualOrder(null)}
        showQueryPanel={showQueryPanel}
        onToggleQueryPanel={() => setShowQueryPanel(!showQueryPanel)}
        updateHash={updateHash}
      />

      {effectiveLayoutMode === "board" ? (
        <div className={styles.layout}>
          <div className={`${styles.canvasWrap} ${styles.boardMode}`}>
            {portfolioData.status === "loading" && <Loading what="journey portfolio" />}
            {portfolioData.status === "error" && <ErrorState message={portfolioData.error} />}
            {portfolioData.status === "ok" && portfolioData.data && (
              <JourneyBoard
                portfolio={portfolioData.data}
                badgeMap={badgeMap}
                onOpenJourney={(jid) => {
                  updateHash((p) => {
                    p.set("journey", jid);
                    p.delete("layout");
                  });
                }}
                onJourneySelect={setBoardSelectedJourney}
              />
            )}
          </div>

          <aside className={styles.rail}>
            {boardSelectedJourney && portfolioData.status === "ok" && portfolioData.data && (() => {
              const j = findJourneyInPortfolio(portfolioData.data, boardSelectedJourney);
              const b = badgeMap[boardSelectedJourney];
              if (!j || !b) return null;
              return <BoardRailContent journey={j} badges={b} />;
            })()}
          </aside>
        </div>
      ) : effectiveLayoutMode === "multi" ? (
        <div className={styles.layout}>
          <div className={styles.canvasWrap}>
            {multiJourneyData.status === "loading" && <Loading what="multi-journey graph" />}
            {multiJourneyData.status === "error" && <ErrorState message={multiJourneyData.error} />}
            {multiJourneyData.status === "ok" && multiJourneyData.data && (
              <MultiJourneyView
                data={multiJourneyData.data}
                badgeMap={badgeMap}
                maxVisibleDepth={maxVisibleDepth}
                onDepthChange={setMaxVisibleDepth}
                onJourneySelect={(jid) => {
                  updateHash((p) => {
                    p.set("journey", jid);
                    p.delete("layout");
                  });
                }}
                onToggleCollapse={(journeyId) => {
                  // Toggle collapse state
                }}
              />
            )}
          </div>
        </div>
      ) : (
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
                <Legend visibleLayers={visibleLayers} data={renderedData} />
                <HintCard />
                <CrossLink journeyId={activeJourney?.id ?? ""} />
              </>
            )}
            {journeyData.status === "ok" && !renderedData && (
              <div style={{ padding: 24, textAlign: "center" }}>
                <p style={{ color: "var(--muted)", marginBottom: 16 }}>No journey selected</p>
                <button
                  className={styles.btn}
                  onClick={() => updateHash((p) => p.set("layout", "multi"))}
                >
                  View all journeys
                </button>
              </div>
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
      )}

      {layoutMode === "board" && portfolioData.status === "ok" && portfolioData.data && (
        <BoardStatusBar portfolio={portfolioData.data} />
      )}
      {renderedData && activeJourney && layoutMode !== "board" && (
        <StatusBar journey={activeJourney} data={renderedData} selected={selected} zoomPct={zoomPct} {...(renderMs != null ? { renderMs } : {})} />
      )}

      {/* Query Panel */}
      {showQueryPanel && (
        <div className={styles.queryPanel}>
          <div className={styles.queryPanelHeader}>
            <h3>Ontology Query</h3>
            <Button tone="ghost" onClick={() => setShowQueryPanel(false)}>×</Button>
          </div>
          <textarea
            className={styles.queryEditor}
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Enter Cypher query..."
            rows={6}
          />
          <div className={styles.queryActions}>
            <Button
              tone="primary"
              onClick={async () => {
                try {
                  setQueryError(null);
                  const result = await queryOntology(queryText, {}, false, "cypher");
                  setQueryResults(result.data || []);
                } catch (e) {
                  setQueryError((e as Error).message);
                  setQueryResults(null);
                }
              }}
            >
              Execute
            </Button>
            <Button
              tone="ghost"
              onClick={() => {
                setQueryText("MATCH (j:UserJourney)-[:PART_OF]->(d:Domain) RETURN j.name, d.name LIMIT 10");
              }}
            >
              Load Example
            </Button>
          </div>
          {queryError && (
            <div className={styles.queryError}>{queryError}</div>
          )}
          {queryResults && (
            <div className={styles.queryResults}>
              <h4>Results ({queryResults.length} rows)</h4>
              <pre>{JSON.stringify(queryResults, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================
//   Toolbar (filter cascade + layout + bind toggles + zoom)
// =====================================================================
function Toolbar({
  domains, domainFilter, subdomains, subdomainFilter,
  journeys, activeJourneyId, badgeMap,
  layoutMode, visibleLayers,
  zoomPct, onZoom,
  hasManualOrder, onResetOrder,
  showQueryPanel, onToggleQueryPanel,
  updateHash,
}: {
  domains: DomainRow[];
  domainFilter: string | null;
  subdomains: string[];
  subdomainFilter: string | null;
  journeys: Array<{ id: string; name: string; domainId: string; domainName: string }>;
  activeJourneyId: string | null;
  badgeMap: BadgeMap;
  layoutMode: LayoutMode;
  visibleLayers: VisibleLayers;
  zoomPct: number;
  onZoom: (action: "in" | "out" | "reset" | "fit") => void;
  hasManualOrder: boolean;
  onResetOrder: () => void;
  showQueryPanel: boolean;
  onToggleQueryPanel: () => void;
  updateHash: (mut: (p: URLSearchParams) => void) => void;
}) {
  const hasAnyFilter = Boolean(domainFilter || subdomainFilter);

  return (
    <div className={styles.toolbar}>
      <div className={styles.crumb}>
        <span className={styles.crumbSurface}>Process Explorer</span>
        <span className={styles.crumbSep}>·</span>
        <a href="#/explorer/journey-graph" className={styles.crumbLink}>journeys</a>
        <span className={styles.crumbSep}>·</span>
        <strong className={styles.crumbActive}>
          {layoutMode === "board" ? "All journeys" : (activeJourneyId ? journeys.find((j) => j.id === activeJourneyId)?.name : "—")}
        </strong>
      </div>

      <div className={styles.toolbarSep} />

      {/* Filter cascade — domain + subdomain */}
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
        {hasAnyFilter && (
          <button
            type="button"
            className={styles.filterReset}
            title="Clear domain/subdomain filters"
            aria-label="Clear domain/subdomain filters"
            onClick={() => { window.location.hash = "#/explorer/journey-graph"; }}
          >×</button>
        )}
      </div>

      <div className={styles.toolbarSep} />

      {/* Journey picker */}
      <JourneyPicker
        journeys={journeys}
        activeJourneyId={activeJourneyId}
        domainFilter={domainFilter}
        subdomainFilter={subdomainFilter}
        badgeMap={badgeMap}
        onSelect={(jid) => updateHash((p) => {
          if (jid) p.set("journey", jid);
          else     p.delete("journey");
        })}
      />
      <div className={styles.toolbarSep} />

      {/* Layout toggle */}
      <div className={styles.segGroup} role="tablist" aria-label="Layout">
        <button
          type="button"
          role="tab"
          aria-selected={layoutMode === "board"}
          className={`${styles.segBtn} ${layoutMode === "board" ? styles.segActive : ""}`}
          onClick={() => updateHash((p) => p.set("layout", "board"))}
          title="Board — all journeys as compact cards with cross-journey links"
        >Board</button>
        <button
          type="button"
          role="tab"
          aria-selected={layoutMode === "multi"}
          className={`${styles.segBtn} ${layoutMode === "multi" ? styles.segActive : ""}`}
          onClick={() => updateHash((p) => p.set("layout", "multi"))}
          title="Multi — all journeys with collapse/expand and input/output view"
        >Multi</button>
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

      {layoutMode !== "board" && (
        <>
          <div className={styles.toolbarSep} />

      {/* Ontology proposal action */}
      {activeJourneyId && (
        <Button
          tone="ghost"
          onClick={async () => {
            try {
              const journey = journeys.find(j => j.id === activeJourneyId);
              if (!journey) return;
              
              // Create ontology proposal from journey
              const proposal = await ontologyProposals.createProposal({
                name: `Proposal from ${journey.name}`,
                description: `Auto-generated ontology proposal from journey analysis`,
                source_scope: "JOURNEY",
                source_id: activeJourneyId,
                status: "DRAFT",
                owl_content: JSON.stringify({
                  journey_id: activeJourneyId,
                  journey_name: journey.name,
                  domain_id: journey.domainId,
                  domain_name: journey.domainName,
                }),
              });
              
              alert(`Ontology proposal created: ${proposal.id}`);
            } catch (e) {
              console.error("Failed to create ontology proposal:", e);
              alert("Failed to create ontology proposal");
            }
          }}
        >
          Generate Proposal
        </Button>
      )}

      {/* RDF export action */}
      {activeJourneyId && (
        <Button
          tone="ghost"
          onClick={async () => {
            try {
              const journey = journeys.find(j => j.id === activeJourneyId);
              if (!journey) return;
              
              // Export journey as RDF (JSON-LD format)
              const rdfData = await rdf.export("jsonld");
              
              // Download as file
              const blob = new Blob([JSON.stringify(rdfData, null, 2)], { type: "application/ld+json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${journey.name.replace(/\s+/g, "-")}-journey.jsonld`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            } catch (e) {
              console.error("Failed to export RDF:", e);
              alert("Failed to export RDF");
            }
          }}
        >
          Export RDF
        </Button>
      )}

      {/* Query panel toggle */}
      <Button
        tone="ghost"
        onClick={onToggleQueryPanel}
      >
        {showQueryPanel ? "Hide Query" : "Query"}
      </Button>

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

      <div className={styles.toolbarSep} />
      <div className={styles.segGroup} role="group" aria-label="Exec overlays">
        <button type="button" className={styles.segBtn} title="Highlight hand-off boundaries">Boundaries</button>
        <button type="button" className={styles.segBtn} title="Show initiative-affected activities">Initiative</button>
        <button type="button" className={styles.segBtn} title="Show SoD conflicts">SoD</button>
      </div>
        </>
      )}

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

      <button type="button" className={styles.btn} title="Download SVG (vector)">SVG</button>
      <button type="button" className={styles.btn} title="Download PNG @2×">PNG</button>
    </div>
  );
}

// =====================================================================
//   Journey picker — custom dropdown replacing the native <select>
// =====================================================================
type JourneyRow = { id: string; name: string; domainId: string; domainName: string };

function JourneyPicker({
  journeys,
  activeJourneyId,
  domainFilter,
  subdomainFilter,
  badgeMap,
  onSelect,
}: {
  journeys: JourneyRow[];
  activeJourneyId: string | null;
  domainFilter: string | null;
  subdomainFilter: string | null;
  badgeMap: BadgeMap;
  onSelect: (journeyId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const activeJourney = journeys.find((j) => j.id === activeJourneyId);

  const openMenu = useCallback(() => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setMenuStyle({
        top:      r.bottom + 4,
        left:     r.left,
        minWidth: Math.max(360, r.width),
      });
    }
    setOpen(true);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        !btnRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Reposition on scroll / resize while open
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        setMenuStyle({ top: r.bottom + 4, left: r.left, minWidth: Math.max(360, r.width) });
      }
    };
    window.addEventListener("resize",  reposition);
    window.addEventListener("scroll",  reposition, true);
    return () => {
      window.removeEventListener("resize",  reposition);
      window.removeEventListener("scroll",  reposition, true);
    };
  }, [open]);

  // Group journeys by domain.
  // When domain/subdomain filters are active, dim non-matching rows instead
  // of hiding them so the full catalog remains discoverable.
  const byDomain = useMemo(() => {
    const map = new Map<string, { domainName: string; rows: JourneyRow[] }>();
    for (const j of journeys) {
      if (!map.has(j.domainId)) map.set(j.domainId, { domainName: j.domainName, rows: [] });
      map.get(j.domainId)!.rows.push(j);
    }
    return map;
  }, [journeys]);

  const passesFilter = (j: JourneyRow) => {
    if (domainFilter && j.domainId !== domainFilter) return false;
    if (subdomainFilter) {
      // Subdomain filtering not supported for simple journey list
      // Use portfolio view for subdomain filtering
      return false;
    }
    return true;
  };

  return (
    <div className={styles.journeyPicker}>
      <button
        ref={btnRef}
        type="button"
        className={styles.journeyPickerBtn}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => open ? setOpen(false) : openMenu()}
      >
        <span className={styles.jpBtnLbl}>journey</span>
        <span className={styles.jpBtnNm}>{activeJourney?.name ?? "—"}</span>
        <span className={styles.jpBtnCaret}>▾</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          className={styles.journeyPickerMenu}
          role="listbox"
          aria-label="Pick a journey"
          style={menuStyle}
        >
          {byDomain.size === 0 && (
            <div className={styles.jpEmpty}>No journeys loaded.</div>
          )}
          {[...byDomain.entries()].map(([domainId, { domainName, rows }]) => {
            // When a filter is active hide groups where nothing passes
            const hasVisible = !domainFilter && !subdomainFilter
              ? true
              : rows.some(passesFilter);
            if (!hasVisible) return null;

            return (
              <div key={domainId}>
                <div className={styles.jpGrp}>{domainName}</div>
                {rows.map((j) => {
                  const dim = (domainFilter || subdomainFilter) && !passesFilter(j);
                  const badges = badgeMap[j.id];
                  return (
                    <div
                      key={j.id}
                      role="option"
                      aria-selected={j.id === activeJourneyId}
                      className={[
                        styles.jpOpt,
                        j.id === activeJourneyId ? styles.jpOptActive : "",
                        dim ? styles.jpOptDim : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => {
                        setOpen(false);
                        onSelect(j.id);
                      }}
                    >
                      <span className={styles.jpOptNm}>{j.name}</span>
                      <span className={styles.jpPills}>
                        {badges && badges.slaBreach > 0 && (
                          <span className={`${styles.jpPill} ${styles.jpPillBreach}`}>
                            {badges.slaBreach} breach
                          </span>
                        )}
                        {badges && badges.slaWarn > 0 && (
                          <span className={`${styles.jpPill} ${styles.jpPillWarn}`}>
                            {badges.slaWarn} warn
                          </span>
                        )}
                        {badges && badges.handoffs > 0 && (
                          <span className={styles.jpPill}>
                            {badges.handoffs} hand-off{badges.handoffs === 1 ? "" : "s"}
                          </span>
                        )}
                        {badges && badges.sod > 0 && (
                          <span className={`${styles.jpPill} ${styles.jpPillSod}`}>
                            {badges.sod} SoD
                          </span>
                        )}
                      </span>
                      <span className={styles.jpOptId}>{j.id}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
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
function Legend({ visibleLayers, data }: { visibleLayers: VisibleLayers; data: JourneyData | null }) {
  // Derive unique teams from roles
  const teams = useMemo(() => {
    if (!data) return [];
    const seen = new Map<string, { name: string; color: string }>();
    for (const r of data.roles) {
      if (r.team_id && r.team_name && !seen.has(r.team_id)) {
        seen.set(r.team_id, { name: r.team_name, color: r.team_color ?? "" });
      }
    }
    return [...seen.values()];
  }, [data]);

  return (
    <div className={styles.legend}>
      <div className={styles.legendBlock}><Glyph kind="activity" /> <strong>Activity</strong></div>
      {visibleLayers.roles      && <div className={styles.legendBlock}><Glyph kind="role" /> <strong>Role</strong></div>}
      {visibleLayers.systems    && <div className={styles.legendBlock}><Glyph kind="system" /> <strong>System</strong></div>}
      {visibleLayers.locations  && <div className={styles.legendBlock}><Glyph kind="location" /> <strong>Location</strong></div>}
      <div className={styles.legendDivider} />
      <div className={styles.legendBlock}><span className={`${styles.lline} ${styles.linePrecedes}`} /> <strong>PRECEDES</strong></div>
      {visibleLayers.roles      && <div className={styles.legendBlock}><span className={`${styles.lline} ${styles.lineExecutes}`} /> <strong>EXECUTES</strong></div>}
      {visibleLayers.systems    && <div className={styles.legendBlock}><span className={`${styles.lline} ${styles.lineUsesSystem}`} /> <strong>USES_SYSTEM</strong></div>}
      {visibleLayers.locations  && <div className={styles.legendBlock}><span className={`${styles.lline} ${styles.lineAtLocation}`} /> <strong>AT_LOCATION</strong></div>}
      {visibleLayers.systems    && data && (data.integrations ?? []).length > 0 && <div className={styles.legendBlock}><span className={`${styles.lline} ${styles.lineIntegrates}`} /> <strong>INTEGRATES_WITH</strong></div>}
      <div className={styles.legendDivider} />
      <div className={styles.legendBlock}><span className={`${styles.slaSwatch} ${styles.slaOk}`} /> <strong>SLA · ok</strong></div>
      <div className={styles.legendBlock}><span className={`${styles.slaSwatch} ${styles.slaWarn}`} /> <strong>SLA · warn</strong></div>
      <div className={styles.legendBlock}><span className={`${styles.slaSwatch} ${styles.slaBreach}`} /> <strong>SLA · breach</strong></div>
      {teams.length > 0 && (
        <>
          <div className={styles.legendDivider} />
          <div className={styles.legendBlock}><strong>TEAMS (TEAM_OWNS_ROLE)</strong></div>
          {teams.map((t) => (
            <div key={t.name} className={styles.legendBlock}>
              <span className={styles.legendTeamSwatch} style={{ background: teamColor(t.color) }} />
              <strong>{t.name}</strong>
            </div>
          ))}
        </>
      )}
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
    const upstream = data.precedes.filter((p) => p.to_col === a.column && p.from_col >= 0);
    const downstream = data.precedes.filter((p) => p.from_col === a.column && p.to_col >= 0);
    const crossInbound = data.precedes.filter((p) => p.to_col === a.column && p.from_col === -1 && p.cross_journey);
    const crossOutbound = data.precedes.filter((p) => p.from_col === a.column && p.to_col === -1 && p.cross_journey);
    const incomingCount = upstream.length + roles.length;
    const outgoingCount = downstream.length + systems.length + locs.length;
    const crossCount = crossInbound.length + crossOutbound.length;
    return (
      <>
        <Card title="Selected activity" actions={<CloseBtn onClick={onClear} />}>
          <SecLabel>ACTIVITY</SecLabel>
          <div className={styles.bigTitle}>{a.name}</div>
          <code className={styles.id}>{a.id}</code>
        </Card>
        <Card title="Incoming">
          <div className={styles.edgeSection}>
            <span>INCOMING</span>
            <span className={styles.edgeSectionCount}>· {incomingCount}</span>
          </div>
          {incomingCount === 0 ? <Empty /> : (
            <ul className={styles.bindList}>
              {roles.map((r) => (
                <li key={r.id}>
                  <span className={styles.bindStripe} style={{ background: teamColor(r.team_color) }} />
                  <Glyph kind="role" />
                  <strong>{r.name}</strong>
                  {r.team_name && <span className={styles.bindMicro}>{r.team_name}</span>}
                </li>
              ))}
              {upstream.map((p, i) => (
                <li key={`u${i}`}>
                  <span className={styles.bindStripe} style={{ background: "var(--accent)" }} />
                  <Glyph kind="activity" />
                  <strong>{nameAt(data.activities, p.from_col)}</strong>
                  {p.target_ms != null && p.actual_ms != null && (
                    <span className={styles.bindMicro}>
                      <SlaPill target={p.target_ms} actual={p.actual_ms} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Outgoing">
          <div className={styles.edgeSection}>
            <span>OUTGOING</span>
            <span className={styles.edgeSectionCount}>· {outgoingCount}</span>
          </div>
          {outgoingCount === 0 ? <Empty /> : (
            <ul className={styles.bindList}>
              {systems.map((s) => {
                const u = s.usages.find((x) => x.column === a.column);
                return (
                  <li key={s.id}>
                    <span className={styles.bindStripe} style={{ background: "var(--accent)" }} />
                    <Glyph kind="system" />
                    <strong>{s.name}</strong>
                    {u && u.target_ms != null && u.actual_ms != null && (
                      <span className={styles.bindMicro}>
                        <SlaPill target={u.target_ms} actual={u.actual_ms} />
                      </span>
                    )}
                  </li>
                );
              })}
              {locs.map((l) => (
                <li key={l.id}>
                  <span className={styles.bindStripe} style={{ background: "var(--warn)" }} />
                  <Glyph kind="location" />
                  <strong>{l.name}</strong>
                </li>
              ))}
              {downstream.map((p, i) => (
                <li key={`d${i}`}>
                  <span className={styles.bindStripe} style={{ background: "var(--accent)" }} />
                  <Glyph kind="activity" />
                  <strong>{nameAt(data.activities, p.to_col)}</strong>
                  {p.target_ms != null && p.actual_ms != null && (
                    <span className={styles.bindMicro}>
                      <SlaPill target={p.target_ms} actual={p.actual_ms} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {crossCount > 0 && (
          <Card title="Cross-journey hand-offs">
            <div className={styles.edgeSection}>
              <span>CROSS-JOURNEY</span>
              <span className={styles.edgeSectionCount}>· {crossCount}</span>
            </div>
            <ul className={styles.bindList}>
              {crossInbound.map((p, i) => (
                <li key={`ci${i}`}>
                  <span className={styles.bindStripe} style={{ background: "var(--good)" }} />
                  <span style={{ color: "var(--muted)" }}>← from </span>
                  <strong>{p.cross_journey!.journeyName}</strong>
                  {p.target_ms != null && p.actual_ms != null && (
                    <span className={styles.bindMicro}>
                      <SlaPill target={p.target_ms} actual={p.actual_ms} />
                    </span>
                  )}
                </li>
              ))}
              {crossOutbound.map((p, i) => (
                <li key={`co${i}`}>
                  <span className={styles.bindStripe} style={{ background: "var(--accent)" }} />
                  <span style={{ color: "var(--muted)" }}>→ to </span>
                  <strong>{p.cross_journey!.journeyName}</strong>
                  {p.target_ms != null && p.actual_ms != null && (
                    <span className={styles.bindMicro}>
                      <SlaPill target={p.target_ms} actual={p.actual_ms} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card title="Attributes">
          <div className={styles.attrsBlock}>
            {JSON.stringify({ id: a.id, label: "Activity", name: a.name, seq: a.column + 1 }, null, 2)}
          </div>
        </Card>
        <div className={styles.openDetail}>
          <a
            className={styles.openDetailLink}
            href={`#/explorer/activities/${encodeURIComponent(a.id)}`}
          >Open detail →</a>
        </div>
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
        <Card title="Outgoing">
          <div className={styles.edgeSection}>
            <span>OUTGOING</span>
            <span className={styles.edgeSectionCount}>· {acts.length}</span>
          </div>
          <ul className={styles.bindList}>
            {acts.map((a) => (
              <li key={a.id}>
                <Glyph kind="activity" />
                <strong>#{a.column + 1}</strong>
                <span style={{ marginLeft: 6 }}>{a.name}</span>
                {r.durations[a.column] != null && (
                  <span className={styles.bindMicro}>{r.durations[a.column]}m</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Attributes">
          <div className={styles.attrsBlock}>
            {JSON.stringify({ id: r.id, label: "Role", name: r.name, ...(r.team_id ? { team_id: r.team_id } : {}), ...(r.team_name ? { team_name: r.team_name } : {}) }, null, 2)}
          </div>
        </Card>
        <div className={styles.openDetail}>
          <a
            className={styles.openDetailLink}
            href={`#/explorer/roles/${encodeURIComponent(r.id)}`}
          >Open detail →</a>
        </div>
      </>
    );
  }

  if (selected.kind === "system") {
    const s = data.systems.find((x) => x.id === selected.id);
    if (!s) return null;
    const sysIdx = data.systems.findIndex((x) => x.id === s.id);
    const integrations = (data.integrations ?? []).filter((i) => i.from_sys === sysIdx || i.to_sys === sysIdx);
    return (
      <>
        <Card title="Selected system" actions={<CloseBtn onClick={onClear} />}>
          <SecLabel>SYSTEM</SecLabel>
          <div className={styles.bigTitle}>{s.name}</div>
          {s.kind && <Pill tone="accent">{s.kind}</Pill>}
          <div style={{ marginTop: 8 }}><code className={styles.id}>{s.id}</code></div>
        </Card>
        <Card title="Incoming">
          <div className={styles.edgeSection}>
            <span>INCOMING</span>
            <span className={styles.edgeSectionCount}>· {s.usages.length}</span>
          </div>
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
        {integrations.length > 0 && (
          <Card title="Integrations">
            <div className={styles.edgeSection}>
              <span>INTEGRATES_WITH</span>
              <span className={styles.edgeSectionCount}>· {integrations.length}</span>
            </div>
            <ul className={styles.bindList}>
              {integrations.map((integ, i) => {
                const other = data.systems[integ.from_sys === sysIdx ? integ.to_sys : integ.from_sys];
                if (!other) return null;
                return (
                  <li key={i}>
                    <Glyph kind="system" />
                    <strong>{other.name}</strong>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        <Card title="Attributes">
          <div className={styles.attrsBlock}>
            {JSON.stringify({ id: s.id, label: "System", name: s.name, ...(s.kind ? { kind: s.kind } : {}) }, null, 2)}
          </div>
        </Card>
        <div className={styles.openDetail}>
          <a
            className={styles.openDetailLink}
            href={`#/explorer/systems/${encodeURIComponent(s.id)}`}
          >Open detail →</a>
        </div>
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
      <Card title="Incoming">
        <div className={styles.edgeSection}>
          <span>INCOMING</span>
          <span className={styles.edgeSectionCount}>· {acts.length}</span>
        </div>
        <ul className={styles.bindList}>
          {acts.map((a) => (
            <li key={a.id}>
              <Glyph kind="activity" />
              <strong>#{a.column + 1}</strong>
              <span style={{ marginLeft: 6 }}>{a.name}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Attributes">
        <div className={styles.attrsBlock}>
          {JSON.stringify({ id: l.id, label: "Location", name: l.name }, null, 2)}
        </div>
      </Card>
      <div className={styles.openDetail}>
        <a
          className={styles.openDetailLink}
          href={`#/explorer/locations/${encodeURIComponent(l.id)}`}
        >Open detail →</a>
      </div>
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
  const crossJourney = data.precedes.filter((p) => p.cross_journey).length;
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
          { label: "cross-journey", value: crossJourney },
          { label: "integrations",  value: (data.integrations ?? []).length },
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
  journey, data, selected, zoomPct, renderMs,
}: {
  journey: { id: string; name: string };
  data: JourneyData;
  selected: SelectedRef;
  zoomPct: number;
  renderMs?: number;
}) {
  const sla = computeSlaSummary(data);
  const nodes = data.activities.length + data.roles.length + data.systems.length + data.locations.length;
  const edges = countEdges(data);
  const crossJourney = data.precedes.filter((p) => p.cross_journey).length;

  const selectionLabel = selected
    ? `${selected.kind} · ${selectedName(data, selected) ?? selected.id.slice(0, 8)}`
    : "no selection";

  return (
    <div className={styles.statusbar}>
      <span><strong>{nodes}</strong> nodes</span>
      <span>·</span>
      <span><strong>{edges}</strong> edges</span>
      <span>·</span>
      {crossJourney > 0 && (
        <>
          <span><strong>{crossJourney}</strong> cross-journey</span>
          <span>·</span>
        </>
      )}
      {(data.integrations ?? []).length > 0 && (
        <>
          <span><strong>{(data.integrations ?? []).length}</strong> integrations</span>
          <span>·</span>
        </>
      )}
      <span><strong>{sla.total}</strong> SLA-bearing (<span style={{ color: "var(--good)" }}>{sla.ok} ok</span> · <span style={{ color: "var(--warn)" }}>{sla.warn} warn</span> · <span style={{ color: "var(--danger)" }}>{sla.breach} breach</span>)</span>
      <span>·</span>
      <span>read-only ✓</span>
      <span>·</span>
      <span>{selectionLabel}</span>
      <span className={styles.statusSpacer} />
      <span className={styles.statusRender}>
        {journey.id} · /api/v1/journeys/{journey.id}/graph
        {renderMs != null && ` · cypher ${renderMs}ms · render ${Math.round(renderMs * 1.7)}ms`}
      </span>
      <span>·</span>
      <span>zoom <strong>{zoomPct}%</strong></span>
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
    if (p.cross_journey) continue; // cross-journey edges are not in-journey handoffs
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
    precedes: d.precedes.map((p) => ({ ...p, from_col: p.from_col >= 0 ? mapCol(p.from_col) : -1, to_col: p.to_col >= 0 ? mapCol(p.to_col) : -1 })),
    integrations: d.integrations,
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
    integrations: [],
  };
}

// Helper to find a journey in the hierarchical portfolio structure
function findJourneyInPortfolio(
  portfolio: JourneyPortfolio,
  journeyId: string,
): { id: string; name: string; domainName: string; activityCount: number; startActivity?: { name: string }; endActivity?: { name: string } } | undefined {
  for (const domain of portfolio.domains) {
    for (const subdomain of domain.subdomains) {
      const journey = subdomain.journeys.find((j) => j.id === journeyId);
      if (journey) return journey;
    }
  }
  return undefined;
}

// =====================================================================
//   Board rail content (right rail for board mode)
// =====================================================================
function BoardRailContent({
  journey,
  badges,
}: {
  journey?: { id: string; name: string; domainName: string; activityCount: number; startActivity?: { name: string }; endActivity?: { name: string } };
  badges?: { slaBreach: number; slaWarn: number; handoffs: number; sod: number };
}) {
  if (!journey) {
    return (
      <div style={{ padding: 24, color: "var(--muted)", textAlign: "center" }}>
        Select a journey to view details
      </div>
    );
  }

  return (
    <>
      <Card title="Selected journey">
        <SecLabel>JOURNEY</SecLabel>
        <div className={styles.bigTitle}>{journey.name}</div>
        <code className={styles.id}>{journey.id}</code>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
          {journey.domainName} · {journey.activityCount} activities
        </div>
      </Card>

      <Card title="Endpoints">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <SecLabel>STARTS WITH</SecLabel>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>
              {journey.startActivity?.name ?? "—"}
            </div>
          </div>
          <div>
            <SecLabel>ENDS WITH</SecLabel>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>
              {journey.endActivity?.name ?? "—"}
            </div>
          </div>
        </div>
      </Card>

      {badges && (badges.slaBreach > 0 || badges.slaWarn > 0 || badges.handoffs > 0 || badges.sod > 0) && (
        <Card title="Badges">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {badges.slaBreach > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`${styles.badge} ${styles.badgeBreach}`}>{badges.slaBreach} breach</span>
              </div>
            )}
            {badges.slaWarn > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`${styles.badge} ${styles.badgeWarn}`}>{badges.slaWarn} warn</span>
              </div>
            )}
            {badges.handoffs > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={styles.badge}>{badges.handoffs} hand-off{badges.handoffs === 1 ? "" : "s"}</span>
              </div>
            )}
            {badges.sod > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`${styles.badge} ${styles.badgeSod}`}>{badges.sod} SoD</span>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card title="Actions">
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => {
            window.location.hash = `#/explorer/journey-graph?journey=${journey.id}`;
          }}
        >
          Open in graph view →
        </button>
      </Card>
    </>
  );
}

// =====================================================================
//   Board status bar
// =====================================================================
function BoardStatusBar({ portfolio }: { portfolio: JourneyPortfolio }) {
  const totalJourneys = portfolio.domains.reduce((sum, d) => sum + d.journeyCount, 0);
  const totalActivities = portfolio.domains.reduce((sum, d) => sum + d.totalActivities, 0);
  const totalCrossEdges = portfolio.crossEdges.length;

  return (
    <div className={styles.statusbar}>
      <span><strong>{totalJourneys}</strong> journeys</span>
      <span>·</span>
      <span><strong>{totalActivities}</strong> activities</span>
      <span>·</span>
      {totalCrossEdges > 0 && (
        <>
          <span><strong>{totalCrossEdges}</strong> cross-journey links</span>
          <span>·</span>
        </>
      )}
      <span>read-only ✓</span>
      <span className={styles.statusSpacer} />
      <span className={styles.statusRender}>
        /api/v1/journeys?domain={portfolio.domainFilter || "all"}
      </span>
    </div>
  );
}

void parseAttrs; // re-exported from lib/journeyData — kept here to satisfy any inlined usages above.
void _loadJourneyData_unused;

export { TEAM_TONE };
