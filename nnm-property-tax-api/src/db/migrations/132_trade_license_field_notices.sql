-- Trade licence field survey by Tax Collectors, and the notices it raises (no licence / licence not for this year).
--   licensed          - licence for the current financial year seen (photo kept)
--   notice_1          - first notice issued: obtain the licence within 14 days
--   notice_2          - second notice issued when the first ran out: another 14 days
--   legal_action_due  - second notice ran out too - for the City Manager to proceed as per law
--   complied          - licence produced after a notice
-- The Tax Collector's name and code are kept here for the record; they are never printed on a notice.
CREATE TABLE IF NOT EXISTS trade_license_surveys (
  id                   BIGSERIAL PRIMARY KEY,
  holding_no           VARCHAR(32) NOT NULL REFERENCES properties(holding_no),
  financial_year       VARCHAR(9) NOT NULL,              -- year the survey (and any notice) is for, e.g. 2026-2027
  has_license          BOOLEAN NOT NULL,
  license_year         VARCHAR(9),                        -- year of the licence shown, when there is one
  license_no           VARCHAR(50),
  license_photo_path   TEXT,
  person_name          VARCHAR(255),
  business_name        VARCHAR(255),
  address              TEXT,
  phone                VARCHAR(10),
  latitude             NUMERIC(10,7),
  longitude            NUMERIC(10,7),
  status               VARCHAR(20) NOT NULL CHECK (status IN ('licensed', 'notice_1', 'notice_2', 'legal_action_due', 'complied')),
  recorded_by_username VARCHAR(64) NOT NULL,
  recorded_by_name     VARCHAR(100) NOT NULL,
  recorded_by_code     VARCHAR(32),
  recorded_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  complied_at          TIMESTAMPTZ,
  complied_by          VARCHAR(100),
  complied_license_year VARCHAR(9),
  complied_license_no  VARCHAR(50),
  complied_photo_path  TEXT,
  CHECK (has_license OR (person_name IS NOT NULL AND business_name IS NOT NULL AND address IS NOT NULL AND phone IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_tl_surveys_status ON trade_license_surveys (status);
CREATE INDEX IF NOT EXISTS idx_tl_surveys_recorded_by ON trade_license_surveys (recorded_by_username, recorded_at);
CREATE INDEX IF NOT EXISTS idx_tl_surveys_holding ON trade_license_surveys (holding_no);

CREATE SEQUENCE IF NOT EXISTS trade_license_notice_seq;

CREATE TABLE IF NOT EXISTS trade_license_notices (
  id             BIGSERIAL PRIMARY KEY,
  survey_id      BIGINT NOT NULL REFERENCES trade_license_surveys(id),
  notice_no      VARCHAR(30) NOT NULL UNIQUE,
  level          SMALLINT NOT NULL CHECK (level IN (1, 2)),
  issued_on      DATE NOT NULL,
  due_on         DATE NOT NULL,
  printed_at     TIMESTAMPTZ,
  printed_by     VARCHAR(100),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (survey_id, level)
);
CREATE INDEX IF NOT EXISTS idx_tl_notices_unprinted ON trade_license_notices (survey_id) WHERE printed_at IS NULL;
