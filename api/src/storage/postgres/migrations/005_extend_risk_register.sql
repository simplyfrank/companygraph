-- Extend risk register for organizational aggregation
ALTER TABLE risk_register 
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS risk_type TEXT CHECK (risk_type IN ('strategic', 'operational', 'financial', 'compliance', 'security', 'technical')),
  ADD COLUMN IF NOT EXISTS linked_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS linked_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS risk_owner_id TEXT,
  ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 1 CHECK (escalation_level BETWEEN 1 AND 5);

-- Add indexes for aggregation
CREATE INDEX IF NOT EXISTS idx_risk_register_category ON risk_register(category);
CREATE INDEX IF NOT EXISTS idx_risk_register_risk_type ON risk_register(risk_type);
CREATE INDEX IF NOT EXISTS idx_risk_register_linked_entity ON risk_register(linked_entity_type, linked_entity_id);
CREATE INDEX IF NOT EXISTS idx_risk_register_escalation ON risk_register(escalation_level);

-- Add comments for documentation
COMMENT ON COLUMN risk_register.category IS 'Risk category for aggregation (e.g., "Supply Chain", "Technology", "Compliance")';
COMMENT ON COLUMN risk_register.risk_type IS 'Standardized risk type classification';
COMMENT ON COLUMN risk_register.linked_entity_type IS 'Type of linked entity (e.g., "domain", "journey", "system")';
COMMENT ON COLUMN risk_register.linked_entity_id IS 'ID of the linked entity';
COMMENT ON COLUMN risk_register.risk_owner_id IS 'Reference to person responsible for the risk';
COMMENT ON COLUMN risk_register.escalation_level IS 'Escalation level for organizational reporting (1=team, 5=executive)';
