-- A trade licence application that comes in after a Tax Collector's notice to that business is credited to that
-- Tax Collector (it counts in his collection); any other application is an "automatic" one, credited to no one.
ALTER TABLE trade_license_applications
  ADD COLUMN IF NOT EXISTS tl_survey_id INTEGER REFERENCES trade_license_surveys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tl_notice_no VARCHAR(40),
  ADD COLUMN IF NOT EXISTS credited_collector_username VARCHAR(64),
  ADD COLUMN IF NOT EXISTS credited_collector_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS source VARCHAR(12) NOT NULL DEFAULT 'automatic';

ALTER TABLE trade_license_applications DROP CONSTRAINT IF EXISTS trade_license_applications_source_check;
ALTER TABLE trade_license_applications ADD CONSTRAINT trade_license_applications_source_check CHECK (source IN ('notice', 'automatic'));

-- One application per notice visit.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tl_applications_survey ON trade_license_applications (tl_survey_id) WHERE tl_survey_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tl_applications_credited ON trade_license_applications (credited_collector_username);

-- Applications already received: link each to a notice visit on the same holding whose first notice was issued on or
-- before the application (within a year) - the business-name match first, then the latest notice; each visit once.
WITH cand AS (
  SELECT a.id AS app_id, s.id AS survey_id, a.requested_at,
         (lower(regexp_replace(s.business_name, '[^[:alnum:]]', '', 'g')) = lower(regexp_replace(a.entity_name, '[^[:alnum:]]', '', 'g'))) AS name_match,
         n.first_issued
    FROM trade_license_applications a
    JOIN trade_license_surveys s ON s.holding_no = a.holding_no
    JOIN LATERAL (SELECT min(issued_on) AS first_issued FROM trade_license_notices WHERE survey_id = s.id) n ON n.first_issued IS NOT NULL
   WHERE a.tl_survey_id IS NULL AND a.holding_no IS NOT NULL
     AND n.first_issued <= (a.requested_at AT TIME ZONE 'Asia/Kolkata')::date
     AND n.first_issued >= (a.requested_at AT TIME ZONE 'Asia/Kolkata')::date - 365
),
per_app AS (
  SELECT DISTINCT ON (app_id) app_id, survey_id, requested_at FROM cand ORDER BY app_id, name_match DESC, first_issued DESC
),
per_survey AS (
  SELECT DISTINCT ON (survey_id) app_id, survey_id FROM per_app ORDER BY survey_id, requested_at
)
UPDATE trade_license_applications a
   SET tl_survey_id = ps.survey_id, source = 'notice',
       credited_collector_username = s.recorded_by_username, credited_collector_name = s.recorded_by_name,
       tl_notice_no = (SELECT notice_no FROM trade_license_notices WHERE survey_id = s.id ORDER BY level LIMIT 1)
  FROM per_survey ps JOIN trade_license_surveys s ON s.id = ps.survey_id
 WHERE a.id = ps.app_id;
