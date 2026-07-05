// kpi-impact-mapping T-05/T-06 (design §4.1, §4.4–§4.6, DD-06/DD-07/DD-09/DD-10)
// — pure matrix/gap assembler + roll-up/status assembler.
// Pure: opens no Neo4j session, makes no HTTP call (DD-06).

import type {
  KpiImpactMatrix,
  KpiImpactRollup,
  Gap,
  ImpactDirection,
  MatrixCell,
} from "@companygraph/shared/schema/kpi-impact";
import type {
  MatrixInput,
  MatrixActivity,
  MatrixLink,
  RollupInput,
  RollupKpi,
  RollupLink,
} from "../storage/kpi-impact";

// ─── T-05: assembleMatrix ─────────────────────────────────────────────

export function assembleMatrix(input: MatrixInput): KpiImpactMatrix {
  const { activities, links } = input;

  // Columns = distinct KPIs any scoped activity links to (FR-05)
  const kpiMap = new Map<string, { id: string; name: string; unit: string | null; targetDirection: string | null }>();
  for (const link of links) {
    if (!kpiMap.has(link.kpiId)) {
      kpiMap.set(link.kpiId, {
        id: link.kpiId,
        name: link.kpiName,
        unit: link.kpiUnit,
        targetDirection: link.kpiTargetDirection,
      });
    }
  }
  const columns = Array.from(kpiMap.values()).sort((a, b) => a.id.localeCompare(b.id));
  const colIndex = new Map(columns.map((c, i) => [c.id, i]));

  // Cells = per (activity, kpi): {direction, weight} if ALIGNED_TO exists, else null
  const linkMap = new Map<string, MatrixLink>();
  for (const link of links) {
    linkMap.set(`${link.activityId}::${link.kpiId}`, link);
  }

  const rows = activities.map((a) => ({
    id: a.id,
    name: a.name,
    journeyName: a.journeyName,
    isKeyActivity: a.isKeyActivity,
    storyLinkCount: a.storyLinkCount,
  }));

  // Build cells[row][col]
  const cellGrid: MatrixCell[][] = [];
  let linkedCellCount = 0;

  for (const act of activities) {
    const row: MatrixCell[] = [];
    for (const col of columns) {
      const link = linkMap.get(`${act.id}::${col.id}`);
      if (link) {
        row.push({ direction: (link.direction as ImpactDirection | null), weight: link.weight });
        linkedCellCount++;
      } else {
        row.push(null);
      }
    }
    cellGrid.push(row);
  }

  // Gaps (FR-06, DD-07/DD-09/DD-10):
  // Key activity with zero activity→KPI links with non-null direction → gap.
  // An undirected (direction:null) link does NOT clear a gap (DD-07).
  // storyLinkCount does not alter gaps (DD-09).
  const gaps: Gap[] = [];
  for (const act of activities) {
    if (!act.isKeyActivity) continue;
    const hasDirectionalLink = links.some(
      (l) => l.activityId === act.id && l.direction !== null,
    );
    if (!hasDirectionalLink) {
      gaps.push({
        activityId: act.id,
        activityName: act.name,
        journeyName: act.journeyName,
        reason: "key_activity_no_kpi",
      });
    }
  }

  const keyActivityCount = activities.filter((a) => a.isKeyActivity).length;

  return {
    rows,
    columns: columns.map((c) => ({
      id: c.id,
      name: c.name,
      unit: c.unit,
      targetDirection: c.targetDirection,
    })),
    cells: cellGrid,
    gaps,
    meta: {
      activityCount: activities.length,
      kpiCount: columns.length,
      linkedCellCount,
      keyActivityCount,
      gapCount: gaps.length,
    },
  };
}

// ─── T-06: assembleRollup + status derivation ─────────────────────────

export function deriveStatus(
  kpi: Pick<RollupKpi, "targetDirection" | "targetValue" | "warningThreshold" | "criticalThreshold" | "latestValue">,
): "on_track" | "warning" | "critical" | "no_data" {
  if (kpi.latestValue == null) return "no_data";

  const { targetDirection, targetValue, warningThreshold, criticalThreshold, latestValue } = kpi;

  if (targetDirection === "higher_is_better") {
    if (criticalThreshold != null && latestValue < criticalThreshold) return "critical";
    if (warningThreshold != null && latestValue < warningThreshold) return "warning";
    return "on_track";
  }
  if (targetDirection === "lower_is_better") {
    if (criticalThreshold != null && latestValue > criticalThreshold) return "critical";
    if (warningThreshold != null && latestValue > warningThreshold) return "warning";
    return "on_track";
  }
  if (targetDirection === "target_is_exact" && targetValue != null) {
    const diff = Math.abs(latestValue - targetValue);
    if (criticalThreshold != null && diff > criticalThreshold) return "critical";
    if (warningThreshold != null && diff > warningThreshold) return "warning";
    return "on_track";
  }
  // Fallback: KPI with data + no thresholds → on_track
  return "on_track";
}

export function assembleRollup(input: RollupInput): KpiImpactRollup {
  const { kpis, links, measurementsAvailable } = input;

  // Aggregate weights per KPI
  const weightsByKpi = new Map<string, number[]>();
  for (const link of links) {
    if (!weightsByKpi.has(link.kpiId)) weightsByKpi.set(link.kpiId, []);
    weightsByKpi.get(link.kpiId)!.push(link.weight);
  }

  const rows = kpis.map((kpi) => {
    const weights = weightsByKpi.get(kpi.id) ?? [];
    const impactLinkCount = weights.length;
    const aggregateImpactWeight = Math.min(1.0, weights.reduce((a, b) => a + b, 0));

    return {
      kpiId: kpi.id,
      kpiName: kpi.name,
      unit: kpi.unit,
      targetValue: kpi.targetValue,
      targetDirection: kpi.targetDirection,
      latestValue: kpi.latestValue,
      status: deriveStatus(kpi),
      impactLinkCount,
      aggregateImpactWeight,
    };
  });

  return {
    rows,
    meta: {
      kpiCount: kpis.length,
      measurementsAvailable,
    },
  };
}
