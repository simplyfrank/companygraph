-- Change requests table
CREATE TABLE IF NOT EXISTS change_requests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'released')),
  draft_snapshot JSONB NOT NULL,
  base_snapshot JSONB NOT NULL,
  diff JSONB NOT NULL,
  dependency_impacts JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  change_request_id TEXT NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  reviewer TEXT NOT NULL,
  reviewer_role TEXT NOT NULL CHECK (reviewer_role IN ('entity_manager', 'domain_manager', 'technical_lead')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested')),
  comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Sign-offs table
CREATE TABLE IF NOT EXISTS sign_offs (
  id TEXT PRIMARY KEY,
  change_request_id TEXT NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  signer TEXT NOT NULL,
  signer_role TEXT NOT NULL CHECK (signer_role IN ('entity_manager', 'domain_manager')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'signed', 'declined')),
  signed_at TIMESTAMP WITH TIME ZONE,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_change_requests_author ON change_requests(author);
CREATE INDEX IF NOT EXISTS idx_change_requests_status ON change_requests(status);
CREATE INDEX IF NOT EXISTS idx_change_requests_created_at ON change_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_change_request_id ON reviews(change_request_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews(reviewer);
CREATE INDEX IF NOT EXISTS idx_sign_offs_change_request_id ON sign_offs(change_request_id);
CREATE INDEX IF NOT EXISTS idx_sign_offs_signer ON sign_offs(signer);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-update updated_at
CREATE TRIGGER update_change_requests_updated_at
  BEFORE UPDATE ON change_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
