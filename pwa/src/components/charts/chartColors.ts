/**
 * Unified color palette for all dashboard charts.
 * Use these constants so every surface stays visually consistent.
 */

export const CHART_COLORS = {
  accent:  "var(--accent)",
  success: "#22c55e",
  info:    "#3b82f6",
  warning: "#f59e0b",
  danger:  "#ef4444",
  purple:  "#8b5cf6",
  teal:    "#14b8a6",
  gray:    "#64748b",
} as const;

export const ENTITY_COLORS: Record<string, string> = {
  Domain:        CHART_COLORS.accent,
  UserJourney:   CHART_COLORS.success,
  Activity:      CHART_COLORS.info,
  System:        CHART_COLORS.warning,
  Role:          CHART_COLORS.purple,
  SLA:           CHART_COLORS.danger,
  Persona:       CHART_COLORS.teal,
  Location:      CHART_COLORS.gray,
};

export const STATUS_COLORS: Record<string, string> = {
  open:       CHART_COLORS.warning,
  mitigating: CHART_COLORS.info,
  accepted:   CHART_COLORS.purple,
  resolved:   CHART_COLORS.success,
  planning:   CHART_COLORS.gray,
  "in-flight": CHART_COLORS.info,
  "at-risk":  CHART_COLORS.danger,
  done:       CHART_COLORS.success,
};

export const SEVERITY_COLORS: Record<string, string> = {
  low:    CHART_COLORS.success,
  medium: CHART_COLORS.info,
  high:   CHART_COLORS.warning,
  critical: CHART_COLORS.danger,
};
