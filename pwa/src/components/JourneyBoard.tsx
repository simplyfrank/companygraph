import { useState, useMemo, useEffect } from "react";
import styles from "./JourneyBoard.module.css";
import type {
  PortfolioJourney,
  PortfolioCrossEdge,
  JourneyPortfolio,
} from "../lib/journeyPortfolio";

interface Props {
  portfolio: JourneyPortfolio;
  badgeMap: Record<string, { slaBreach: number; slaWarn: number; handoffs: number; sod: number }>;
  onOpenJourney: (journeyId: string) => void;
  onJourneySelect?: (journeyId: string) => void;
}

export function JourneyBoard({ portfolio, badgeMap, onOpenJourney, onJourneySelect }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

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

  return (
    <div className={styles.board}>
      {portfolio.journeys.map((j) => (
        <JourneyCard
          key={j.id}
          journey={j}
          badges={badgeMap[j.id]}
          isSelected={selected === j.id}
          onOpen={() => onOpenJourney(j.id)}
          onSelect={() => {
            setSelected(j.id);
            onJourneySelect?.(j.id);
          }}
          inbound={inbound.get(j.id) || []}
          outbound={outbound.get(j.id) || []}
        />
      ))}
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
  badges?: { slaBreach: number; slaWarn: number; handoffs: number; sod: number };
  isSelected: boolean;
  onOpen: () => void;
  onSelect?: () => void;
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
      {badges?.slaBreach > 0 && (
        <div className={styles.statRow}>
          <span>SLA breaches</span>
          <strong style={{ color: "var(--danger)" }}>{badges.slaBreach}</strong>
        </div>
      )}
      {badges?.handoffs > 0 && (
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
