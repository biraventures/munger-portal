-- Old-holdings (MUNG-MIG) bulk upload runs in the background (migratedHoldingImport.service.ts): a sheet of 14,000+
-- rows takes longer than the web server waits for an answer, so the upload returns at once and the page follows the
-- progress here. The old-record year fields keep whatever the register says (reference only), so they are text.
CREATE TABLE IF NOT EXISTS migrated_upload_jobs (
  id           BIGSERIAL PRIMARY KEY,
  file_name    TEXT,
  status       VARCHAR(10) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  total_rows   INTEGER NOT NULL DEFAULT 0,
  processed    INTEGER NOT NULL DEFAULT 0,
  result       JSONB,
  error        TEXT,
  created_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);

ALTER TABLE migrated_holding_surveys ALTER COLUMN old_last_payment_year TYPE TEXT;
ALTER TABLE migrated_holding_surveys ALTER COLUMN old_holding_creation_year TYPE TEXT;
