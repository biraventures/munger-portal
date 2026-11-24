-- Projects in the department's "3 Years Report" format: every step from technical approval to completion, with
-- physical / financial progress. City-wide works have no ward. A cancelled stage for tenders / schemes dropped.

ALTER TABLE projects ALTER COLUMN ward_id DROP NOT NULL;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS ta_sent_date            DATE,
  ADD COLUMN IF NOT EXISTS ta_date                 DATE,
  ADD COLUMN IF NOT EXISTS ts_sent_date            DATE,
  ADD COLUMN IF NOT EXISTS ts_date                 DATE,
  ADD COLUMN IF NOT EXISTS boq_approval_date       DATE,
  ADD COLUMN IF NOT EXISTS tech_bid_opening_date   DATE,
  ADD COLUMN IF NOT EXISTS cs_to_ee_date           DATE,
  ADD COLUMN IF NOT EXISTS cs_to_se_date           DATE,
  ADD COLUMN IF NOT EXISTS cs_to_ce_date           DATE,
  ADD COLUMN IF NOT EXISTS cs_to_eic_date          DATE,
  ADD COLUMN IF NOT EXISTS tech_bid_disposal_date  DATE,
  ADD COLUMN IF NOT EXISTS bidder_claim            TEXT,
  ADD COLUMN IF NOT EXISTS claim_disposal_date     DATE,
  ADD COLUMN IF NOT EXISTS fin_bid_opening_date    DATE,
  ADD COLUMN IF NOT EXISTS fin_bid_to_ee_date      DATE,
  ADD COLUMN IF NOT EXISTS fin_bid_to_se_date      DATE,
  ADD COLUMN IF NOT EXISTS fin_bid_to_ce_date      DATE,
  ADD COLUMN IF NOT EXISTS fin_bid_to_eic_date     DATE,
  ADD COLUMN IF NOT EXISTS work_awarded_date       DATE,
  ADD COLUMN IF NOT EXISTS agreement_date          DATE,
  ADD COLUMN IF NOT EXISTS component_progress_pct  NUMERIC(5,2) CHECK (component_progress_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS physical_progress_pct   NUMERIC(5,2) CHECK (physical_progress_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS financial_progress_pct  NUMERIC(5,2) CHECK (financial_progress_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS eot_reason              TEXT,
  ADD COLUMN IF NOT EXISTS eot_date                DATE,
  -- The "Name of Work & Estimate Cost" cell exactly as it was entered (name has the cost text removed).
  ADD COLUMN IF NOT EXISTS name_as_entered         TEXT;

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_stage_check;
ALTER TABLE projects ADD CONSTRAINT projects_stage_check CHECK (stage IN (
  'approved', 'tendered', 'tender_finalised', 'work_order_issued', 'in_progress',
  'completed', 'payment_done', 'past_completed', 'cancelled'
));

CREATE INDEX IF NOT EXISTS idx_projects_fy ON projects (financial_year);
