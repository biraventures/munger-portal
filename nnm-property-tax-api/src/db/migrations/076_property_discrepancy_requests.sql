-- A Tax Collector, during field collection, may find that a holding's
-- recorded details (floors, area, use, owner, etc.) don't match what's
-- actually there. property_resurvey_flags already lets them note this
-- with remarks, but that's purely informational - it doesn't let them
-- submit what they actually found, and nothing acts on it. This adds
-- that: the Tax Collector submits the complete corrected property
-- details (same shape as a normal property edit - all floors plus
-- every other field), which then must be approved in order by a Tax
-- Surveyor (who can verify it in the field), the Tax Daroga, the City
-- Manager, and finally the Deputy Commissioner - only then is the
-- change actually applied to the property record. A rejection at any
-- stage stops the chain there; nothing is applied.
CREATE TABLE property_discrepancy_requests (
  id                  BIGSERIAL PRIMARY KEY,
  holding_no          VARCHAR(32) NOT NULL REFERENCES properties(holding_no),
  reported_by_username VARCHAR(64) NOT NULL,
  reported_by_display_name VARCHAR(255) NOT NULL,
  reported_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  discrepancy_notes   TEXT NOT NULL,
  proposed_data       JSONB NOT NULL,
  status              VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  current_stage       VARCHAR(32) NOT NULL DEFAULT 'tax_surveyor'
    CHECK (current_stage IN ('tax_surveyor', 'tax_daroga', 'city_manager', 'deputy_commissioner')),
  final_decided_at    TIMESTAMPTZ,
  reviewed_by         VARCHAR(255),
  reviewed_role       VARCHAR(32),
  reviewed_at         TIMESTAMPTZ,
  review_notes        TEXT
);
CREATE INDEX idx_pdr_holding_no ON property_discrepancy_requests (holding_no);
CREATE INDEX idx_pdr_status ON property_discrepancy_requests (status);
CREATE INDEX idx_pdr_current_stage ON property_discrepancy_requests (current_stage);

-- Per-stage sign-off log - mirrors change_request_approvals, one row
-- per officer's decision at their stage.
CREATE TABLE property_discrepancy_approvals (
  id                    BIGSERIAL PRIMARY KEY,
  discrepancy_request_id BIGINT NOT NULL REFERENCES property_discrepancy_requests(id) ON DELETE CASCADE,
  stage                 VARCHAR(32) NOT NULL
    CHECK (stage IN ('tax_surveyor', 'tax_daroga', 'city_manager', 'deputy_commissioner')),
  decision              VARCHAR(16) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  admin_username        VARCHAR(64) NOT NULL,
  admin_display_name    VARCHAR(255) NOT NULL,
  notes                 TEXT,
  decided_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pda_discrepancy_request_id ON property_discrepancy_approvals (discrepancy_request_id);
