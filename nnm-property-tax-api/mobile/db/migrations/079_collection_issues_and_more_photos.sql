-- Two more photos a Tax Collector attaches alongside the holding
-- photo when reporting a discrepancy: the previous year's tax
-- payment receipt (produced by the taxpayer) and the holding owner's
-- Aadhaar card.
ALTER TABLE property_discrepancy_requests ADD COLUMN previous_receipt_photo_path VARCHAR(500);
ALTER TABLE property_discrepancy_requests ADD COLUMN aadhaar_photo_path VARCHAR(500);

-- A Tax Collector's report that a taxpayer is creating a problem
-- during collection - refusing to pay, disputing an amount, not
-- available, etc. Purely a log for oversight (Tax Daroga,
-- Commissioner); it doesn't itself trigger a workflow the way a
-- discrepancy report does.
CREATE TABLE collection_issues (
  id                       BIGSERIAL PRIMARY KEY,
  holding_no               VARCHAR(32) NOT NULL REFERENCES properties(holding_no),
  issue_type               VARCHAR(32) NOT NULL CHECK (issue_type IN (
    'refused_to_pay', 'disputes_tax_amount', 'disputes_solid_waste_amount',
    'absent_door_locked', 'under_construction', 'disputes_measurement'
  )),
  notes                    TEXT,
  reported_by_username     VARCHAR(64) NOT NULL,
  reported_by_display_name VARCHAR(255) NOT NULL,
  reported_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_collection_issues_holding_no ON collection_issues (holding_no);
CREATE INDEX idx_collection_issues_reported_at ON collection_issues (reported_at);
