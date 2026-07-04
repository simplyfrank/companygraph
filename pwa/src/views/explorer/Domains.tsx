import { useState, useRef, useEffect, useCallback } from "react";
import type { Route } from "../../route";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { DomainCard, DomainDetailContent } from "../../components/DomainCard";
import { DomainComparisonModal } from "../../components/DomainComparisonModal";
import { useSelectionStore } from "../../store/selectionStore";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import { DomainDetail } from "./DomainDetail";
import styles from "./Domains.module.css";

interface DomainStatRow {
  id: string;
  name: string;
  description: string;
  journeys: number;
  activities: number;
  sla_breach_rate?: number;
  handoff_complexity?: number;
  sod_conflicts?: number;
  initiative_completion?: number;
}

const CARD_MIN_WIDTH = 280;
const GAP = 14;

export function ExplorerDomains({ route }: { route: Route }) {
  const select = useSelectionStore((s) => s.select);
  const selectedEntityId = useSelectionStore((s) => s.selectedEntityId);
  const selectedEntityLabel = useSelectionStore((s) => s.selectedEntityLabel);
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [showComparison, setShowComparison] = useState(false);
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [cols, setCols] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  const calcCols = useCallback(() => {
    if (!gridRef.current) return;
    const w = gridRef.current.clientWidth;
    const c = Math.max(1, Math.floor((w + GAP) / (CARD_MIN_WIDTH + GAP)));
    setCols(c);
  }, []);

  useEffect(() => {
    calcCols();
    window.addEventListener("resize", calcCols);
    return () => window.removeEventListener("resize", calcCols);
  }, [calcCols]);

  // Pull domains with their journey + activity counts and health metrics in one shot.
  // Must be called before any early return to maintain hook order
  const domains = useFetch(
    () =>
      api.cypher(
        `MATCH (d:Domain)
         OPTIONAL MATCH (j:UserJourney)-[:PART_OF]->(d)
         OPTIONAL MATCH (a:Activity)-[:PART_OF]->(j)
         OPTIONAL MATCH (s:SLA)-[:ALIGNED_TO]->(d)
         OPTIONAL MATCH (b:SLABreach)-[:FOR]->(s)
         WITH d, count(DISTINCT j) AS journeys, count(DISTINCT a) AS activities,
              count(DISTINCT b) AS total_breaches, count(DISTINCT s) AS total_slas
         RETURN d.id AS id, d.name AS name, d.description AS description,
                journeys, activities,
                CASE WHEN total_slas > 0 THEN toFloat(total_breaches) / total_slas ELSE 0 END AS sla_breach_rate,
                0 AS handoff_complexity,
                0 AS sod_conflicts,
                0.85 AS initiative_completion
         ORDER BY d.name`,
      ),
    [],
  );

  // Support detail mode via route.entityId (T-08 pattern)
  // Must be after all hooks to avoid "Rendered fewer hooks than expected" error
  if (route.entityId) {
    return <DomainDetail route={route} />;
  }

  const toggleDomainSelection = (domainId: string) => {
    setSelectedDomains((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(domainId)) {
        next.delete(domainId);
      } else {
        next.add(domainId);
      }
      return next;
    });
  };

  const toggleExpand = (domainId: string) => {
    setExpandedDomain((prev) => (prev === domainId ? null : domainId));
  };

  const handleCompare = () => {
    if (selectedDomains.size >= 2) {
      setShowComparison(true);
    }
  };

  return (
    <>
      <ViewHeader
        title="Domains"
        lede="Top-level business domains in the retail-process graph. Click a card to drop into its first journey's 3-lane graph."
      />
      {selectedDomains.size > 0 && (
        <div className={styles.selectionBar}>
          <span className={styles.selectionCount}>
            {selectedDomains.size} domain{selectedDomains.size !== 1 ? "s" : ""} selected
          </span>
          <button
            className={styles.compareButton}
            onClick={handleCompare}
            disabled={selectedDomains.size < 2}
          >
            Compare ({selectedDomains.size})
          </button>
          <button
            className={styles.clearButton}
            onClick={() => setSelectedDomains(new Set())}
          >
            Clear
          </button>
        </div>
      )}
      {domains.status === "loading" && <Loading what="domains" />}
      {domains.status === "error" && <ErrorState message={domains.error} />}
      {domains.status === "ok" && (
        <div className={styles.grid} ref={gridRef}>
          {(domains.data.rows as unknown as DomainStatRow[]).map((d, i) => {
            const rows = domains.data.rows as unknown as DomainStatRow[];
            const isExpanded = expandedDomain === d.id;
            const selectedIdx = expandedDomain
              ? rows.findIndex((r) => r.id === expandedDomain)
              : -1;
            const originalRow = Math.floor(i / cols) + 1;
            const selectedRow = selectedIdx >= 0 ? Math.floor(selectedIdx / cols) + 1 : -1;
            const isBelow = originalRow > selectedRow;
            const row = isBelow ? originalRow + 1 : originalRow;
            const col = (i % cols) + 1;

            return (
              <div
                key={d.id}
                className={styles.domainWrapper}
                style={{
                  gridColumn: `${col} / ${col + 1}`,
                  gridRow: row,
                }}
              >
                <DomainCard
                  domain={d}
                  onSelect={(id) => select(id, "Domain")}
                  selected={selectedEntityId === d.id && selectedEntityLabel === "Domain"}
                  comparisonSelected={selectedDomains.has(d.id)}
                  onToggleComparison={toggleDomainSelection}
                  expanded={isExpanded}
                  onToggleExpand={toggleExpand}
                  counts={[
                    { label: "journeys",   value: d.journeys },
                    { label: "activities", value: d.activities },
                    { label: "id",         value: d.id.slice(0, 8) + "…" },
                  ]}
                />
              </div>
            );
          })}
          {expandedDomain && (() => {
            const rows = domains.data.rows as unknown as DomainStatRow[];
            const selectedIdx = rows.findIndex((r) => r.id === expandedDomain);
            const detailRow = Math.floor(selectedIdx / cols) + 1 + 1;
            const domain = rows.find((r) => r.id === expandedDomain)!;
            return (
              <div
                className={`${styles.domainWrapper} ${styles.detailWrapper}`}
                style={{
                  gridColumn: "1 / -1",
                  gridRow: detailRow,
                }}
              >
                <DomainDetailContent domain={domain} />
              </div>
            );
          })()}
        </div>
      )}
      {showComparison && (
        <DomainComparisonModal
          domainIds={Array.from(selectedDomains)}
          onClose={() => setShowComparison(false)}
        />
      )}
    </>
  );
}
