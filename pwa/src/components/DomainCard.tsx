import styles from "./DomainCard.module.css";
import { calculateHealthScore, getHealthTier, getHealthColor } from "../lib/domainHealth";

interface DomainCount {
  label: string;
  value: string | number;
  href?: string;
}

interface DomainCardProps {
  domain: {
    id: string;
    name: string;
    description?: string;
    sla_breach_rate?: number;
    handoff_complexity?: number;
    sod_conflicts?: number;
    initiative_completion?: number;
    verified_at?: string;
  };
  counts: DomainCount[];
  href?: string;
  onSelect: ((id: string) => void) | undefined;
  selected?: boolean;
  comparisonSelected?: boolean;
  onToggleComparison: ((id: string) => void) | undefined;
  expanded?: boolean;
  onToggleExpand: ((id: string) => void) | undefined;
}

export function DomainCard({ domain, counts, href, onSelect, selected, comparisonSelected, onToggleComparison, expanded, onToggleExpand }: DomainCardProps) {
  const healthScore = domain.sla_breach_rate !== undefined 
    ? calculateHealthScore({
        sla_breach_rate: domain.sla_breach_rate,
        handoff_complexity: domain.handoff_complexity || 0,
        sod_conflicts: domain.sod_conflicts || 0,
        initiative_completion: domain.initiative_completion || 0,
      })
    : null;
  const healthTier = healthScore !== null ? getHealthTier(healthScore) : null;
  const healthColor = healthTier !== null ? getHealthColor(healthTier) : null;

  const inner = (
    <>
      <div className={styles.cardHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
          <div 
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "2px",
              background: healthColor || "var(--muted)",
              flexShrink: 0,
            }}
          />
          <h3 className={styles.title}>{domain.name}</h3>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {healthScore !== null && healthColor && (
            <div className={styles.healthBadge} style={{ color: healthColor, borderColor: healthColor }}>
              {healthScore}
            </div>
          )}
          {onToggleExpand && (
            <button
              className={styles.expandButton}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(domain.id);
              }}
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? "−" : "+"}
            </button>
          )}
          {onToggleComparison && (
            <input
              type="checkbox"
              checked={comparisonSelected || false}
              onChange={(e) => {
                e.stopPropagation();
                onToggleComparison(domain.id);
              }}
              className={styles.comparisonCheckbox}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      </div>
      {domain.description && (
        <p className={styles.meta}>{domain.description}</p>
      )}
      
      {/* SLA Overview */}
      {domain.sla_breach_rate !== undefined && (
        <div className={styles.slaOverview}>
          <span className={styles.slaLabel}>SLA Breach Rate:</span>
          <span className={styles.slaValue} style={{ color: domain.sla_breach_rate > 0.1 ? 'var(--danger)' : 'var(--good)' }}>
            {(domain.sla_breach_rate * 100).toFixed(1)}%
          </span>
        </div>
      )}

      <div className={styles.rows}>
        {counts.map((c, i) => (
          <div key={i} className={styles.row}>
            <span>{c.label}</span>
            {c.href ? (
              <a href={c.href}>{c.value}</a>
            ) : (
              <strong>{c.value}</strong>
            )}
          </div>
        ))}
      </div>
    </>
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick(e as any);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (onToggleExpand) {
      onToggleExpand(domain.id);
    } else if (onSelect) {
      onSelect(domain.id);
    }
  };

  return (
    <div 
      className={`${styles.card} ${expanded ? styles.expanded : ''}`} 
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      role="button" 
      tabIndex={0}
    >
      {inner}
    </div>
  );
}

export function DomainDetailContent({ domain }: { domain: any }) {
  const healthScore = domain.sla_breach_rate !== undefined 
    ? calculateHealthScore({
        sla_breach_rate: domain.sla_breach_rate,
        handoff_complexity: domain.handoff_complexity || 0,
        sod_conflicts: domain.sod_conflicts || 0,
        initiative_completion: domain.initiative_completion || 0,
      })
    : 85;
  const healthTier = getHealthTier(healthScore);
  const healthColor = getHealthColor(healthTier);

  const getSlaBreachColor = () => {
    if (!domain.sla_breach_rate) return "var(--success)";
    return domain.sla_breach_rate > 0.1 ? "var(--danger)" : "var(--success)";
  };

  const getInitiativeColor = () => {
    if (!domain.initiative_completion) return "var(--muted)";
    if (domain.initiative_completion > 0.8) return "var(--success)";
    if (domain.initiative_completion > 0.5) return "var(--warn)";
    return "var(--danger)";
  };

  return (
    <div className={styles.detailContent}>
      <div className={styles.detailGrid}>
        <div className={styles.detailSection}>
          <h4 className={styles.detailTitle}>Domain Health</h4>
          <div className={styles.detailMetrics}>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Health Score</span>
              <span className={styles.metricValue} style={{ color: healthColor }}>{healthScore}</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Health Tier</span>
              <span className={styles.metricValue} style={{ color: healthColor, textTransform: "capitalize" }}>{healthTier.replace("-", " ")}</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>SLA Breach Rate</span>
              <span className={styles.metricValue} style={{ color: getSlaBreachColor() }}>
                {domain.sla_breach_rate ? `${(domain.sla_breach_rate * 100).toFixed(1)}%` : "0%"}
              </span>
            </div>
          </div>
        </div>
        <div className={styles.detailSection}>
          <h4 className={styles.detailTitle}>Composition</h4>
          <div className={styles.detailMetrics}>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Journeys</span>
              <span className={styles.metricValue}>{domain.journeys || 0}</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Activities</span>
              <span className={styles.metricValue}>{domain.activities || 0}</span>
            </div>
          </div>
        </div>
        <div className={styles.detailSection}>
          <h4 className={styles.detailTitle}>Initiatives</h4>
          <div className={styles.detailMetrics}>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Completion</span>
              <span className={styles.metricValue} style={{ color: getInitiativeColor() }}>
                {domain.initiative_completion ? `${(domain.initiative_completion * 100).toFixed(0)}%` : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>
      <a
        href={`#/explorer/domain-detail/${encodeURIComponent(domain.id)}`}
        className={styles.viewFullDetail}
      >
        View Full Detail &rarr;
      </a>
    </div>
  );
}
