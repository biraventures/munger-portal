-- Pre-2011 ARV from the old demand register. The system has no rate table before 2011-12, so a holding whose tax was
-- last paid before then has pending years that can only be assessed from the ARV recorded in the offline demand
-- register. The Tax Daroga enters it (per period of assessment, with the register reference); the City Manager
-- approves or rejects. Approval adds manual tax_history_stages rows (auto_generated = FALSE), after which the demand
-- notice includes those years. Until then demand notices and payments for the holding are refused (arrears.service
-- assertNoMissingTaxYears).
CREATE TABLE IF NOT EXISTS pre2011_arv_entries (
  id                       BIGSERIAL PRIMARY KEY,
  holding_no               VARCHAR(32) NOT NULL REFERENCES properties(holding_no) ON DELETE CASCADE ON UPDATE CASCADE,
  -- [{ "period": "2000-2001 to 2010-2011", "arv": 1234.00 }, ...] - periods from PERIOD_OF_ASSESSMENT_BUCKETS before 2011
  entries                  JSONB NOT NULL,
  register_reference       TEXT NOT NULL,
  remarks                  TEXT,
  status                   VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  entered_by_username      VARCHAR(64) NOT NULL,
  entered_by_name          VARCHAR(255) NOT NULL,
  entered_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by_username      VARCHAR(64),
  decided_by_name          VARCHAR(255),
  decided_at               TIMESTAMPTZ,
  decision_remarks         TEXT,
  CONSTRAINT pre2011_arv_reject_reason CHECK (status <> 'rejected' OR decision_remarks IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pre2011_arv_pending ON pre2011_arv_entries (holding_no) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pre2011_arv_status ON pre2011_arv_entries (status, entered_at);
