-- Risk Register table
CREATE TABLE IF NOT EXISTS risk_register (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  domain TEXT NOT NULL,
  likelihood INTEGER NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  impact INTEGER NOT NULL CHECK (impact BETWEEN 1 AND 5),
  status TEXT NOT NULL CHECK (status IN ('open', 'mitigating', 'accepted', 'resolved')),
  trend TEXT NOT NULL CHECK (trend IN ('up', 'flat', 'down')),
  description TEXT,
  mitigation_plan TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_risk_register_owner ON risk_register(owner);
CREATE INDEX IF NOT EXISTS idx_risk_register_domain ON risk_register(domain);
CREATE INDEX IF NOT EXISTS idx_risk_register_status ON risk_register(status);
CREATE INDEX IF NOT EXISTS idx_risk_register_severity ON risk_register((likelihood * impact));

-- Trigger to auto-update updated_at
CREATE TRIGGER update_risk_register_updated_at
  BEFORE UPDATE ON risk_register
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
