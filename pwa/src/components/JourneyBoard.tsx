import { useState, useMemo, useEffect } from "react";
import styles from "./JourneyBoard.module.css";
import type {
  PortfolioJourney,
  PortfolioCrossEdge,
  JourneyPortfolio,
  PortfolioDomain,
  PortfolioSubdomain,
} from "../lib/journeyPortfolio";

interface Props {
  portfolio: JourneyPortfolio;
  badgeMap: Record<string, { slaBreach: number; slaWarn: number; handoffs: number; sod: number }>;
  onOpenJourney: (journeyId: string) => void;
  onJourneySelect?: (journeyId: string) => void;
}

export function JourneyBoard({ portfolio, badgeMap, onOpenJourney, onJourneySelect }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsedDomains, setCollapsedDomains] = useState<Set<string>>(new Set());
  const [collapsedSubdomains, setCollapsedSubdomains] = useState<Set<string>>(new Set());

  // Reset selection when portfolio changes
  useEffect(() => {
    setSelected(null);
  }, [portfolio]);

  // Group inbound / outbound cross-edges per journey.
  const inbound = useMemo(() => {
    const map = new Map<string, PortfolioCrossEdge[]>();
    for (const e of portfolio.crossEdges) {
      const arr = map.get(e.toJourneyId) || [];
      arr.push(e);
      map.set(e.toJourneyId, arr);
    }
    return map;
  }, [portfolio.crossEdges]);

  const outbound = useMemo(() => {
    const map = new Map<string, PortfolioCrossEdge[]>();
    for (const e of portfolio.crossEdges) {
      const arr = map.get(e.fromJourneyId) || [];
      arr.push(e);
      map.set(e.fromJourneyId, arr);
    }
    return map;
  }, [portfolio.crossEdges]);

  const toggleDomain = (domainId: string) => {
    setCollapsedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domainId)) next.delete(domainId);
      else next.add(domainId);
      return next;
    });
  };

  const toggleSubdomain = (domainId: string, subdomainName: string) => {
    setCollapsedSubdomains((prev) => {
      const key = `${domainId}:${subdomainName}`;
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className={styles.board}>
      {portfolio.domains.map((domain) => (
        <DomainSection
          key={domain.id}
          domain={domain}
          isCollapsed={collapsedDomains.has(domain.id)}
          onToggle={() => toggleDomain(domain.id)}
          badgeMap={badgeMap}
          collapsedSubdomains={collapsedSubdomains}
          onToggleSubdomain={(subdomainName) => toggleSubdomain(domain.id, subdomainName)}
          onOpenJourney={onOpenJourney}
          onSelect={onJourneySelect}
          selectedJourney={selected}
          inbound={inbound}
          outbound={outbound}
        />
      ))}
    </div>
  );
}

function DomainSection({
  domain,
  isCollapsed,
  onToggle,
  badgeMap,
  collapsedSubdomains,
  onToggleSubdomain,
  onOpenJourney,
  onSelect,
  selectedJourney,
  inbound,
  outbound,
}: {
  domain: PortfolioDomain;
  isCollapsed: boolean;
  onToggle: () => void;
  badgeMap: Record<string, { slaBreach: number; slaWarn: number; handoffs: number; sod: number }>;
  collapsedSubdomains: Set<string>;
  onToggleSubdomain: (subdomainName: string) => void;
  onOpenJourney: (journeyId: string) => void;
  onSelect: ((journeyId: string) => void) | undefined;
  selectedJourney: string | null;
  inbound: Map<string, PortfolioCrossEdge[]>;
  outbound: Map<string, PortfolioCrossEdge[]>;
}) {
  const domainBadges = useMemo(() => {
    let slaBreach = 0, slaWarn = 0, handoffs = 0, sod = 0;
    for (const subdomain of domain.subdomains) {
      for (const journey of subdomain.journeys) {
        const badges = badgeMap[journey.id];
        if (badges) {
          slaBreach += badges.slaBreach;
          slaWarn += badges.slaWarn;
          handoffs += badges.handoffs;
          sod += badges.sod;
        }
      }
    }
    return { slaBreach, slaWarn, handoffs, sod };
  }, [domain.subdomains, badgeMap]);

  return (
    <div className={styles.domainSection}>
      <div className={styles.domainHeader} onClick={onToggle}>
        <span className={styles.domainToggle}>{isCollapsed ? "▶" : "▼"}</span>
        <span className={styles.domainName}>{domain.name}</span>
        <span className={styles.domainStats}>{domain.journeyCount} journeys · {domain.totalActivities} activities</span>
        {(domainBadges.slaBreach > 0 || domainBadges.slaWarn > 0 || domainBadges.handoffs > 0 || domainBadges.sod > 0) && (
          <div className={styles.domainBadges}>
            {domainBadges.slaBreach > 0 && <span className={`${styles.badge} ${styles.badgeBreach}`}>{domainBadges.slaBreach} breach</span>}
            {domainBadges.slaWarn > 0 && <span className={`${styles.badge} ${styles.badgeWarn}`}>{domainBadges.slaWarn} warn</span>}
            {domainBadges.handoffs > 0 && <span className={styles.badge}>{domainBadges.handoffs} hand-off</span>}
            {domainBadges.sod > 0 && <span className={`${styles.badge} ${styles.badgeSod}`}>{domainBadges.sod} SoD</span>}
          </div>
        )}
      </div>
      {!isCollapsed && (
        <div className={styles.subdomains}>
          {domain.subdomains.map((subdomain) => (
            <SubdomainSection
              key={subdomain.name}
              subdomain={subdomain}
              domainId={domain.id}
              isCollapsed={collapsedSubdomains.has(`${domain.id}:${subdomain.name}`)}
              onToggle={() => onToggleSubdomain(subdomain.name)}
              badgeMap={badgeMap}
              onOpenJourney={onOpenJourney}
              onSelect={onSelect ?? undefined}
              selectedJourney={selectedJourney}
              inbound={inbound}
              outbound={outbound}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubdomainSection({
  subdomain,
  domainId,
  isCollapsed,
  onToggle,
  badgeMap,
  onOpenJourney,
  onSelect,
  selectedJourney,
  inbound,
  outbound,
}: {
  subdomain: PortfolioSubdomain;
  domainId: string;
  isCollapsed: boolean;
  onToggle: () => void;
  badgeMap: Record<string, { slaBreach: number; slaWarn: number; handoffs: number; sod: number }>;
  onOpenJourney: (journeyId: string) => void;
  onSelect: ((journeyId: string) => void) | undefined;
  selectedJourney: string | null;
  inbound: Map<string, PortfolioCrossEdge[]>;
  outbound: Map<string, PortfolioCrossEdge[]>;
}) {
  const subdomainBadges = useMemo(() => {
    let slaBreach = 0, slaWarn = 0, handoffs = 0, sod = 0;
    for (const journey of subdomain.journeys) {
      const badges = badgeMap[journey.id];
      if (badges) {
        slaBreach += badges.slaBreach;
        slaWarn += badges.slaWarn;
        handoffs += badges.handoffs;
        sod += badges.sod;
      }
    }
    return { slaBreach, slaWarn, handoffs, sod };
  }, [subdomain.journeys, badgeMap]);

  // Deduplicate journeys by ID to prevent duplicate key warnings
  const uniqueJourneys = useMemo(() => {
    const seen = new Set<string>();
    return subdomain.journeys.filter((j) => {
      if (seen.has(j.id)) return false;
      seen.add(j.id);
      return true;
    });
  }, [subdomain.journeys]);

  return (
    <div className={styles.subdomainSection}>
      <div className={styles.subdomainHeader} onClick={onToggle}>
        <span className={styles.subdomainToggle}>{isCollapsed ? "▶" : "▼"}</span>
        <span className={styles.subdomainName}>{subdomain.name}</span>
        <span className={styles.subdomainStats}>{subdomain.journeyCount} journeys · {subdomain.totalActivities} activities</span>
        {(subdomainBadges.slaBreach > 0 || subdomainBadges.slaWarn > 0 || subdomainBadges.handoffs > 0 || subdomainBadges.sod > 0) && (
          <div className={styles.subdomainBadges}>
            {subdomainBadges.slaBreach > 0 && <span className={`${styles.badge} ${styles.badgeBreach}`}>{subdomainBadges.slaBreach} breach</span>}
            {subdomainBadges.slaWarn > 0 && <span className={`${styles.badge} ${styles.badgeWarn}`}>{subdomainBadges.slaWarn} warn</span>}
            {subdomainBadges.handoffs > 0 && <span className={styles.badge}>{subdomainBadges.handoffs} hand-off</span>}
            {subdomainBadges.sod > 0 && <span className={`${styles.badge} ${styles.badgeSod}`}>{subdomainBadges.sod} SoD</span>}
          </div>
        )}
      </div>
      {!isCollapsed && (
        <div className={styles.journeyCards}>
          {uniqueJourneys.map((j) => (
            <JourneyCard
              key={j.id}
              journey={j}
              badges={badgeMap[j.id]}
              isSelected={selectedJourney === j.id}
              onOpen={() => onOpenJourney(j.id)}
              onSelect={() => {
                onSelect?.(j.id);
              }}
              inbound={inbound.get(j.id) || []}
              outbound={outbound.get(j.id) || []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function JourneyCard({
  journey,
  badges,
  isSelected,
  onOpen,
  onSelect,
  inbound,
  outbound,
}: {
  journey: PortfolioJourney;
  badges: { slaBreach: number; slaWarn: number; handoffs: number; sod: number } | undefined;
  isSelected: boolean;
  onOpen: () => void;
  onSelect: (() => void) | undefined;
  inbound: PortfolioCrossEdge[];
  outbound: PortfolioCrossEdge[];
}) {
  const hasCross = inbound.length > 0 || outbound.length > 0;

  // Domain color mapping (simplified - would be from domain data in real implementation)
  const domainColors: Record<string, string> = {
    "Customer Acquisition": "var(--accent)",
    "Order Fulfillment": "var(--good)",
    "Inventory & Merch": "var(--warn)",
    "Customer Service": "var(--danger)",
  };
  const domainColor = domainColors[journey.domainName] || "var(--accent)";

  return (
    <div className={styles.card} data-selected={isSelected} onClick={onSelect}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.cardTitle}>
          <span className={styles.domainDot} style={{ background: domainColor }} />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            title="Open journey graph"
            style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', flex: 1 }}
          >
            {journey.name}
          </button>
        </div>
        <div className={styles.cardMeta}>
          {journey.startActivity?.name && journey.endActivity?.name
            ? `${journey.startActivity.name} → ${journey.endActivity.name}`
            : "Journey activities"}
        </div>
      </div>

      {/* Stats rows (wireframe pattern) */}
      <div className={styles.statRow}>
        <span>activities</span>
        <strong>{journey.activityCount}</strong>
      </div>
      {badges && badges.slaBreach > 0 && (
        <div className={styles.statRow}>
          <span>SLA breaches</span>
          <strong style={{ color: "var(--danger)" }}>{badges.slaBreach}</strong>
        </div>
      )}
      {badges && badges.handoffs > 0 && (
        <div className={styles.statRow}>
          <span>hand-offs</span>
          <strong>{badges.handoffs}</strong>
        </div>
      )}
      <div className={styles.statRow}>
        <span>domain</span>
        <strong>{journey.domainName}</strong>
      </div>

      {/* Cross-journey connections */}
      {hasCross && (
        <div className={styles.crossSection}>
          {inbound.map((e, i) => (
            <span key={`in${i}`} className={styles.crossChip}>
              ← {e.fromJourneyName}
            </span>
          ))}
          {outbound.map((e, i) => (
            <span key={`out${i}`} className={styles.crossChip}>
              → {e.toJourneyName}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
