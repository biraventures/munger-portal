-- Abhilekh Prabhari: uploads scanned khatian (record-of-rights) PDFs, identified by survey ward (A-F), survey sheet
-- number and part number. Each upload is reviewed by the Deputy Municipal Commissioner (approve / return with remarks);
-- a returned or not-yet-reviewed khatian can be uploaded again, an approved one cannot. Every uploaded file is kept.
ALTER TABLE admins DROP CONSTRAINT admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('tax_daroga', 'tax_surveyor', 'tax_collector', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner', 'stall_prabhari', 'city_manager', 'trade_license_nodal', 'assistant_town_planning_supervisor', 'assistant_architect', 'je_mechanical', 'ae_mechanical', 'establishment_clerk', 'agency_team_leader', 'agency_project_manager', 'abhilekh_prabhari'));

CREATE TABLE IF NOT EXISTS khatian_records (
  id                   BIGSERIAL PRIMARY KEY,
  survey_ward          CHAR(1) NOT NULL CHECK (survey_ward IN ('A', 'B', 'C', 'D', 'E', 'F')),
  survey_sheet_no      VARCHAR(20) NOT NULL,
  part_no              VARCHAR(20) NOT NULL,
  status               VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'returned')),
  version              INT NOT NULL DEFAULT 1,
  -- The current file (earlier ones stay in khatian_record_files).
  file_path            TEXT NOT NULL,
  file_name            VARCHAR(255) NOT NULL,
  size_bytes           BIGINT NOT NULL,
  uploaded_by_username VARCHAR(64) NOT NULL,
  uploaded_by_name     VARCHAR(100) NOT NULL,
  uploaded_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by_username VARCHAR(64),
  reviewed_by_name     VARCHAR(100),
  reviewed_at          TIMESTAMPTZ,
  review_remarks       VARCHAR(500),
  UNIQUE (survey_ward, survey_sheet_no, part_no)
);
CREATE INDEX IF NOT EXISTS idx_khatian_records_status ON khatian_records (status, uploaded_at);

CREATE TABLE IF NOT EXISTS khatian_record_files (
  id                   BIGSERIAL PRIMARY KEY,
  khatian_id           BIGINT NOT NULL REFERENCES khatian_records(id) ON DELETE CASCADE,
  version              INT NOT NULL,
  file_path            TEXT NOT NULL,
  file_name            VARCHAR(255) NOT NULL,
  size_bytes           BIGINT NOT NULL,
  uploaded_by_username VARCHAR(64) NOT NULL,
  uploaded_by_name     VARCHAR(100) NOT NULL,
  uploaded_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The review this version got, copied here when it is reviewed.
  review_status        VARCHAR(16),
  reviewed_by_name     VARCHAR(100),
  reviewed_at          TIMESTAMPTZ,
  review_remarks       VARCHAR(500),
  UNIQUE (khatian_id, version)
);
