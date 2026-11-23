-- Trade licence notices: the 14 days run from the date the notice is served (entered with its receiving copy), not
-- from a fixed date printed on it - a notice printed but not served no longer runs out. due_on is set when served.
-- Notices can be reissued (fresh number and date, e.g. not served / lost); the old one is kept, marked reissued.
ALTER TABLE trade_license_notices
  ADD COLUMN IF NOT EXISTS served_on          DATE,
  ADD COLUMN IF NOT EXISTS superseded_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by      VARCHAR(255),
  ADD COLUMN IF NOT EXISTS reissue_reason     TEXT,
  ADD COLUMN IF NOT EXISTS reissue_of         BIGINT REFERENCES trade_license_notices(id);
ALTER TABLE trade_license_notices ALTER COLUMN due_on DROP NOT NULL;

-- One live notice per level (a reissued one steps aside).
ALTER TABLE trade_license_notices DROP CONSTRAINT IF EXISTS trade_license_notices_survey_id_level_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tl_notice_live_level ON trade_license_notices (survey_id, level) WHERE superseded_at IS NULL;

-- Served = its receiving copy is uploaded (until now the only record of service): the upload date.
UPDATE trade_license_notices SET served_on = (receiving_uploaded_at AT TIME ZONE 'Asia/Kolkata')::date
 WHERE served_on IS NULL AND receiving_uploaded_at IS NOT NULL;

-- Live notices still running: 14 days from service; not served yet -> no last date (it does not run out).
UPDATE trade_license_notices n SET due_on = CASE WHEN n.served_on IS NULL THEN NULL ELSE n.served_on + 14 END
  FROM trade_license_surveys s
 WHERE s.id = n.survey_id AND n.superseded_at IS NULL
   AND ((n.level = 1 AND s.status = 'notice_1') OR (n.level = 2 AND s.status = 'notice_2'));
