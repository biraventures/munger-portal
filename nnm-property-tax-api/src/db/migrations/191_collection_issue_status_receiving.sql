-- Collection issues get a status: open (reported) -> notice_issued (City Manager generated a notice) -> resolved.
-- Resolved automatically when the holding's demand is paid after the issue was reported (resolved_how = 'paid'), or by
-- the City Manager with a note (resolved_how = 'manual'); the City Manager can reopen.
ALTER TABLE collection_issues
  ADD COLUMN IF NOT EXISTS status          VARCHAR(16) NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolved_how    VARCHAR(8),
  ADD COLUMN IF NOT EXISTS resolved_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS resolution_note TEXT;
DO $$ BEGIN
  ALTER TABLE collection_issues ADD CONSTRAINT collection_issues_status CHECK (status IN ('open', 'notice_issued', 'resolved'));
  ALTER TABLE collection_issues ADD CONSTRAINT collection_issues_resolved_how CHECK (resolved_how IS NULL OR resolved_how IN ('paid', 'manual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE collection_issues ci SET status = 'notice_issued'
 WHERE status = 'open' AND EXISTS (SELECT 1 FROM collection_issue_notices n WHERE n.collection_issue_id = ci.id);
CREATE INDEX IF NOT EXISTS idx_collection_issues_status ON collection_issues (status);

-- Receiving copies of collection issue notices - as for trade licence notices (migration 190): uploaded by the Tax
-- Collector who reported the issue, the Tax Daroga or the City Manager (photo or PDF); removed only with the DMC's
-- approval; a removed copy is kept in the log.
ALTER TABLE collection_issue_notices
  ADD COLUMN IF NOT EXISTS receiving_photo_path             TEXT,
  ADD COLUMN IF NOT EXISTS receiving_uploaded_by_username   VARCHAR(64),
  ADD COLUMN IF NOT EXISTS receiving_uploaded_by_name       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS receiving_uploaded_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receiving_removal_reason         TEXT,
  ADD COLUMN IF NOT EXISTS receiving_removal_requested_by   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS receiving_removal_requested_at   TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS collection_issue_notice_receiving_log (
  id           BIGSERIAL PRIMARY KEY,
  notice_id    BIGINT NOT NULL REFERENCES collection_issue_notices(id),
  action       VARCHAR(20) NOT NULL CHECK (action IN ('uploaded', 'removal_requested', 'removal_rejected', 'removed')),
  photo_path   TEXT,
  reason       TEXT,
  by_username  VARCHAR(64),
  by_name      VARCHAR(255),
  at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ci_receiving_log_notice ON collection_issue_notice_receiving_log (notice_id, at);
