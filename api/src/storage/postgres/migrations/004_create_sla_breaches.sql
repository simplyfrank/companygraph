-- SLA Breaches table
CREATE TABLE IF NOT EXISTS sla_breaches (
  id TEXT PRIMARY KEY,
  sla_id TEXT NOT NULL,
  breach_at TIMESTAMP WITH TIME ZONE NOT NULL,
  actual_value NUMERIC NOT NULL,
  target_value NUMERIC NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('minor', 'major', 'critical')),
  impact_description TEXT,
  root_cause TEXT,
  resolution_status TEXT NOT NULL CHECK (resolution_status IN ('open', 'resolved', 'mitigated')) DEFAULT 'open',
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sla_breaches_sla_id ON sla_breaches(sla_id);
CREATE INDEX IF NOT EXISTS idx_sla_breaches_breach_at ON sla_breaches(breach_at DESC);
CREATE INDEX IF NOT EXISTS idx_sla_breaches_severity ON sla_breaches(severity);
CREATE INDEX IF NOT EXISTS idx_sla_breaches_status ON sla_breaches(resolution_status);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_sla_breaches_updated_at
  BEFORE UPDATE ON sla_breaches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
