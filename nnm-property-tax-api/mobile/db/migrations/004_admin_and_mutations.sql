-- Admin accounts (3-tier hierarchy) and the property-mutation approval
-- workflow.

CREATE TABLE admins (
  id            BIGSERIAL PRIMARY KEY,
  username      VARCHAR(64) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  VARCHAR(255) NOT NULL,
  role          VARCHAR(32) NOT NULL CHECK (role IN ('tax_daroga', 'deputy_commissioner', 'commissioner')),
  active        BOOLEAN NOT NULL DEFAULT TRUE
);

-- Edits to an EXISTING holding go through this queue instead of applying
-- immediately — an admin must approve before the change lands on the
-- live property record. Creating a brand-new holding (any of the three
-- entry modes) is NOT a mutation and is unaffected — still immediate.
CREATE TABLE property_change_requests (
  id                BIGSERIAL PRIMARY KEY,
  holding_no        VARCHAR(32) NOT NULL REFERENCES properties(holding_no),
  requested_by      VARCHAR(255) NOT NULL,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status            VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  change_basis      VARCHAR(64) NOT NULL,
  change_reference  TEXT NOT NULL,
  proposed_data     JSONB NOT NULL,
  reviewed_by       VARCHAR(255),
  reviewed_role     VARCHAR(32),
  reviewed_at       TIMESTAMPTZ,
  review_notes      TEXT
);

CREATE INDEX idx_pcr_holding_no ON property_change_requests (holding_no);
CREATE INDEX idx_pcr_status ON property_change_requests (status);