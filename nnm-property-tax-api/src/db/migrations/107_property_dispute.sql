-- Disputed holdings: flagged by Tax Daroga / City Manager / Commissioner after an owner objection.
-- A disputed holding is hidden from the public search, accepts no payment from any login and gets no
-- demand notice until the flag is cleared.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS is_disputed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dispute_remarks TEXT,
  ADD COLUMN IF NOT EXISTS disputed_by TEXT,
  ADD COLUMN IF NOT EXISTS disputed_by_role TEXT,
  ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_properties_disputed ON properties (holding_no) WHERE is_disputed;

CREATE TABLE IF NOT EXISTS property_dispute_log (
  id           BIGSERIAL PRIMARY KEY,
  holding_no   VARCHAR(32) NOT NULL, -- soft reference (repointed when a holding is renumbered)
  action       TEXT NOT NULL CHECK (action IN ('flagged', 'cleared')),
  remarks      TEXT NOT NULL,
  acted_by     TEXT NOT NULL,
  acted_by_role TEXT NOT NULL,
  acted_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_property_dispute_log_holding ON property_dispute_log (holding_no, acted_at DESC);
