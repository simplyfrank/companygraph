// product-delivery-process-model T-04 (design §4.5, §5.3 + review-design.md
// N-05) — the KPI→metric map (OQ-1 lives here).
//
// The map value is a metric SEEDKEY (B-02) — NOT a node id. The seed step
// resolves it to the metric's real UUIDv7 node id via context.metricNodeIds
// (context.ts step 4) before calling linkKpiToMetric (whose toId must be a real
// node id — passing the seedKey would 4xx).
//
// OQ-1 / OQ-1': only Release Frequency has a canonical metric today
// (metric-deploy-frequency). The other three Product KPIs (Cycle Time, Feature
// Adoption, Spec Throughput) are authored as KPI nodes now (XD-10 depth) but
// their MEASURES link is DEFERRED — uncomment the entry and set the metric-*
// seedKey when saas-metric-library grows that metric, and update AC-06.
export const PRODUCT_KPI_METRIC_MAP: Record<string, string> = {
  "Release Frequency": "metric-deploy-frequency", // seedKey → resolved to 018f0100-…-020
  // "Cycle Time":       "metric-cycle-time",       // OQ-1' — deferred
  // "Feature Adoption": "metric-feature-adoption", // OQ-1' — deferred
  // "Spec Throughput":  "metric-spec-throughput",  // OQ-1' — deferred
};
