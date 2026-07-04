-- KPI Measurements table
CREATE TABLE IF NOT EXISTS kpi_measurements (
  id TEXT PRIMARY KEY,
  kpi_id TEXT NOT NULL,
  measured_at TIMESTAMP WITH TIME ZONE NOT NULL,
  value NUMERIC NOT NULL,
  context JSONB,
  source TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_kpi_measurements_kpi_id ON kpi_measurements(kpi_id);
CREATE INDEX IF NOT EXISTS idx_kpi_measurements_measured_at ON kpi_measurements(measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_measurements_kpi_measured ON kpi_measurements(kpi_id, measured_at DESC);
