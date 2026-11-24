-- Trade licence notice receiving copies: uploaded by the Tax Collector who raised the notice, the Trade Licence
-- Prabhari (nodal) or the City Manager - as a photo or a PDF. Once uploaded a receiving copy is removed only with the
-- DMC's approval: a removal is requested with a reason, the DMC approves or rejects it. A removed copy is kept here
-- (file and who / when / why), never deleted.
ALTER TABLE trade_license_notices
  ADD COLUMN IF NOT EXISTS receiving_removal_reason         TEXT,
  ADD COLUMN IF NOT EXISTS receiving_removal_requested_by   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS receiving_removal_requested_at   TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS trade_license_notice_receiving_log (
  id               BIGSERIAL PRIMARY KEY,
  notice_id        BIGINT NOT NULL REFERENCES trade_license_notices(id),
  action           VARCHAR(20) NOT NULL CHECK (action IN ('uploaded', 'removal_requested', 'removal_rejected', 'removed')),
  photo_path       TEXT,          -- the copy concerned (kept for a removed copy)
  reason           TEXT,
  by_username      VARCHAR(64),
  by_name          VARCHAR(255),
  at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tl_receiving_log_notice ON trade_license_notice_receiving_log (notice_id, at);
CREATE INDEX IF NOT EXISTS idx_tl_notices_removal_pending ON trade_license_notices (receiving_removal_requested_at)
  WHERE receiving_removal_requested_at IS NOT NULL;

-- Receiving copies uploaded before this log existed.
INSERT INTO trade_license_notice_receiving_log (notice_id, action, photo_path, by_username, by_name, at)
SELECT n.id, 'uploaded', n.receiving_photo_path, n.receiving_uploaded_by_username, n.receiving_uploaded_by_name, n.receiving_uploaded_at
  FROM trade_license_notices n
 WHERE n.receiving_photo_path IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM trade_license_notice_receiving_log l WHERE l.notice_id = n.id);
