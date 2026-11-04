-- Old-holding (MUNG-MIG) Excel upload: rows that could not be imported - a "Needs Review" note in the sheet, or a
-- problem such as a missing owner name / bad ward - are kept here with every value from the row and the reason, so
-- they can be corrected and imported (or discarded) one by one instead of being lost.
CREATE TABLE IF NOT EXISTS migrated_import_review_rows (
  id                BIGSERIAL PRIMARY KEY,
  uploaded_by       VARCHAR(150) NOT NULL,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_name         VARCHAR(255),
  source_row        INTEGER NOT NULL,
  kind              VARCHAR(20) NOT NULL CHECK (kind IN ('needs_review', 'error')),
  reason            TEXT NOT NULL,
  data              JSONB NOT NULL,
  data_hash         CHAR(32) NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'imported', 'discarded')),
  resolved_by       VARCHAR(150),
  resolved_at       TIMESTAMPTZ,
  resolution_note   TEXT,
  holding_no        VARCHAR(32)
);
-- The same row uploaded again while still pending is not queued twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_migrated_review_pending ON migrated_import_review_rows (data_hash) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_migrated_review_status ON migrated_import_review_rows (status, uploaded_at);
