import { describe, expect, test } from "bun:test";
import { metrics } from "../src/metrics";

// kpi-measurement-alignment AC-11 — KPI-specific Prometheus metrics
// are registered and exported.

describe("unit: KPI Prometheus metrics (AC-11)", () => {
  test("all 4 KPI metrics appear in the export", () => {
    const exportText = metrics.export();

    // FR-15 — 4 new KPI metrics
    expect(exportText).toContain("kpi_measurements_ingested_total");
    expect(exportText).toContain("kpi_measurement_write_duration_ms");
    expect(exportText).toContain("kpi_reconciliation_runs_total");
    expect(exportText).toContain("kpi_reconciliation_bindings_active");

    // Verify types
    expect(exportText).toContain("# TYPE kpi_measurements_ingested_total counter");
    expect(exportText).toContain("# TYPE kpi_measurement_write_duration_ms histogram");
    expect(exportText).toContain("# TYPE kpi_reconciliation_runs_total counter");
    expect(exportText).toContain("# TYPE kpi_reconciliation_bindings_active gauge");
  });

  test("kpi_measurements_ingested_total increments with source label", () => {
    metrics.increment("kpi_measurements_ingested_total", { source: "rest" });
    metrics.increment("kpi_measurements_ingested_total", { source: "kafka" });
    metrics.increment("kpi_measurements_ingested_total", { source: "rest" });

    const exportText = metrics.export();
    // Should have entries for both source labels
    expect(exportText).toContain('source="rest"');
    expect(exportText).toContain('source="kafka"');
  });

  test("kpi_reconciliation_runs_total increments", () => {
    const before = metrics.export();
    metrics.increment("kpi_reconciliation_runs_total");
    const after = metrics.export();

    // The counter should have increased
    const beforeLine = before.match(/kpi_reconciliation_runs_total (\d+)/);
    const afterLine = after.match(/kpi_reconciliation_runs_total (\d+)/);
    const beforeVal = beforeLine ? parseInt(beforeLine[1]) : 0;
    const afterVal = afterLine ? parseInt(afterLine[1]) : 0;
    expect(afterVal).toBeGreaterThan(beforeVal);
  });
});
