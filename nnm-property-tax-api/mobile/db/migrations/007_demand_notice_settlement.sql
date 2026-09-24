-- Demand notices become the unit payment is collected against. A notice
-- captures the property's assessment_year at generation time — settling
-- it fully advances tax_paid_till_year to that year, which correctly
-- clears both the arrears AND marks the current year's tax as paid (the
-- two were never actually linked before this).
ALTER TABLE demand_notices ADD COLUMN assessment_year VARCHAR(9);
ALTER TABLE demand_notices ADD COLUMN settled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE demand_notices ADD COLUMN settled_receipt_no VARCHAR(32);
ALTER TABLE demand_notices ADD COLUMN settled_at TIMESTAMPTZ;

CREATE INDEX idx_demand_notices_holding_settled ON demand_notices (holding_no, settled);