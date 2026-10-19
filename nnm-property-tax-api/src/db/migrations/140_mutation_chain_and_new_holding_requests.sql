-- Mutation and new-holding chain (Tax Daroga -> Tax Surveyor field report -> Mutation Nodal / Tax Daroga -> DMC ->
-- Commissioner), floor-wise mutation, and requests from the public to create a holding for a property never assessed.
--
-- New holding requests:
--   draft            - being filled in (documents uploading); not visible to staff
--   submitted        - with the Tax Daroga; the applicant can still correct it
--   returned         - sent back to the applicant for correction; resubmitting makes it 'submitted' again
--   at_surveyor      - Tax Daroga checked the demand register, gave the old holding number and assigned a Tax Surveyor
--   daroga_review    - field report in; the Tax Daroga records his comments (and corrections)
--   at_dmc           - with the Deputy Municipal Commissioner
--   at_commissioner  - with the Municipal Commissioner
--   created          - approved by the Commissioner: the holding was created with an MMC- number (new_holding_no) and
--                      the register's number as its old holding number
--   rejected         - not accepted (for example, the property already has a holding: duplicate_of_holding)
CREATE TABLE IF NOT EXISTS new_holding_requests (
  id                     BIGSERIAL PRIMARY KEY,
  application_no         VARCHAR(24) UNIQUE,
  status                 VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'returned', 'at_surveyor', 'daroga_review', 'at_dmc', 'at_commissioner', 'created', 'rejected')),
  -- Owner and applicant
  owner_name             VARCHAR(255) NOT NULL,
  relation_type          VARCHAR(4),
  relation_name          VARCHAR(255),
  owner_mobile           VARCHAR(10) NOT NULL,
  owner_aadhaar          VARCHAR(12) NOT NULL,
  owner_email            VARCHAR(120),
  applicant_name         VARCHAR(255) NOT NULL,
  applicant_mobile       VARCHAR(10) NOT NULL,
  -- Property
  address                TEXT NOT NULL,
  landmark               VARCHAR(255),
  ward                   VARCHAR(16) NOT NULL,
  pincode                VARCHAR(6),
  ownership_basis        VARCHAR(30) NOT NULL,
  khata_no               VARCHAR(64),
  khesra_no              VARCHAR(64),
  survey_sheet_no        VARCHAR(64),
  survey_ward            VARCHAR(1),
  plot_area_sqft         NUMERIC(12,2) NOT NULL,
  road_type              VARCHAR(3) NOT NULL CHECK (road_type IN ('PMR', 'MR', 'OR')),
  rain_water_harvesting  BOOLEAN NOT NULL DEFAULT FALSE,
  construction_year      VARCHAR(9) NOT NULL,
  floors                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  latitude               NUMERIC(10,7),
  longitude              NUMERIC(10,7),
  gps_accuracy_m         NUMERIC(10,1),
  -- Access
  upload_token_hash      VARCHAR(64) NOT NULL,
  edit_token_hash        VARCHAR(64),
  edit_token_expires_at  TIMESTAMPTZ,
  edit_count             INT NOT NULL DEFAULT 0,
  last_edited_at         TIMESTAMPTZ,
  created_ip             VARCHAR(64),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at           TIMESTAMPTZ,
  -- Office
  handled_by             VARCHAR(100),
  handled_at             TIMESTAMPTZ,
  handling_remarks       VARCHAR(500),
  duplicate_of_holding   VARCHAR(32),
  register_old_holding_no VARCHAR(32),
  assigned_surveyor_username VARCHAR(100),
  assigned_surveyor_name VARCHAR(150),
  -- Set by the Tax Daroga after the field report: corrected property details and the user charge type / slum flag.
  verified_details       JSONB,
  stage_since            TIMESTAMPTZ,
  new_holding_no         VARCHAR(32) REFERENCES properties(holding_no)
);
CREATE INDEX IF NOT EXISTS idx_new_holding_requests_status ON new_holding_requests (status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_new_holding_requests_mobiles ON new_holding_requests (owner_mobile, applicant_mobile);
CREATE SEQUENCE IF NOT EXISTS new_holding_request_seq;

CREATE TABLE IF NOT EXISTS new_holding_request_documents (
  id             BIGSERIAL PRIMARY KEY,
  request_id     BIGINT NOT NULL REFERENCES new_holding_requests(id) ON DELETE CASCADE,
  doc_type       VARCHAR(30) NOT NULL CHECK (doc_type IN (
                   'ownership_proof', 'jamabandi', 'aadhaar', 'photo_front', 'photo_other', 'building_plan',
                   'electricity_bill', 'other_1', 'other_2')),
  label          VARCHAR(100),
  file_path      TEXT NOT NULL,
  mime_type      VARCHAR(40) NOT NULL,
  size_bytes     BIGINT NOT NULL,
  file_name      VARCHAR(255) NOT NULL,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_new_holding_request_documents_req ON new_holding_request_documents (request_id);

-- Audit trail: every step, who took it and when.
CREATE TABLE IF NOT EXISTS new_holding_request_events (
  id          BIGSERIAL PRIMARY KEY,
  request_id  BIGINT NOT NULL REFERENCES new_holding_requests(id) ON DELETE CASCADE,
  event       VARCHAR(30) NOT NULL CHECK (event IN (
                'submitted', 'applicant_edited', 'resubmitted', 'assigned', 'field_report', 'daroga_forwarded', 'dmc_forwarded',
                'returned', 'sent_back_to_daroga', 'rejected', 'created')),
  stage       VARCHAR(30),
  actor       VARCHAR(150) NOT NULL,
  actor_role  VARCHAR(40),
  remarks     VARCHAR(500),
  details     JSONB,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_new_holding_request_events_req ON new_holding_request_events (request_id, at);

-- ------------------------------------------------------------------------------------------------ mutation chain
-- The Tax Surveyor's field report comes after the Tax Daroga for a mutation (other edits skip it).
ALTER TABLE property_change_requests DROP CONSTRAINT IF EXISTS property_change_requests_current_stage_check;
ALTER TABLE property_change_requests ADD CONSTRAINT property_change_requests_current_stage_check
  CHECK (current_stage IN ('tax_daroga', 'tax_surveyor', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner'));
ALTER TABLE change_request_approvals DROP CONSTRAINT IF EXISTS change_request_approvals_stage_check;
ALTER TABLE change_request_approvals ADD CONSTRAINT change_request_approvals_stage_check
  CHECK (stage IN ('tax_daroga', 'tax_surveyor', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner'));
ALTER TABLE property_change_requests
  ADD COLUMN IF NOT EXISTS assigned_surveyor_username VARCHAR(100),
  ADD COLUMN IF NOT EXISTS assigned_surveyor_name VARCHAR(150),
  -- Old holding number from the demand register for the new holding a partial (area / floor-wise) mutation creates.
  ADD COLUMN IF NOT EXISTS register_old_holding_no VARCHAR(32);

-- Floor-wise mutation: the floors being transferred (floor labels); NULL = every floor.
ALTER TABLE mutation_applications ADD COLUMN IF NOT EXISTS mutate_floors JSONB;
ALTER TABLE mutation_area_verifications ADD COLUMN IF NOT EXISTS mutate_floors JSONB;

ALTER TABLE mutation_audit_events DROP CONSTRAINT IF EXISTS mutation_audit_events_event_check;
ALTER TABLE mutation_audit_events ADD CONSTRAINT mutation_audit_events_event_check
  CHECK (event IN ('applicant_edited', 'applicant_resubmitted', 'area_verified', 'returned_to_applicant', 'surveyor_assigned', 'field_report'));

-- Tax Surveyor's field report, for a mutation (change request) or a new holding request.
CREATE TABLE IF NOT EXISTS field_reports (
  id                     BIGSERIAL PRIMARY KEY,
  entity_type            VARCHAR(20) NOT NULL CHECK (entity_type IN ('mutation', 'new_holding')),
  entity_id              BIGINT NOT NULL,
  surveyor_username      VARCHAR(100) NOT NULL,
  surveyor_name          VARCHAR(150) NOT NULL,
  visited_on             DATE NOT NULL,
  site_matches           BOOLEAN NOT NULL,
  measured_plot_area_sqft NUMERIC(12,2),
  measured_builtup_sqft  NUMERIC(12,2),
  remarks                TEXT NOT NULL,
  latitude               NUMERIC(10,7),
  longitude              NUMERIC(10,7),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_field_reports_entity ON field_reports (entity_type, entity_id, created_at);

CREATE TABLE IF NOT EXISTS field_report_photos (
  id          BIGSERIAL PRIMARY KEY,
  report_id   BIGINT NOT NULL REFERENCES field_reports(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  mime_type   VARCHAR(40) NOT NULL,
  size_bytes  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_field_report_photos_report ON field_report_photos (report_id);

-- Lineage of a floor-wise mutation: which floors went to the new holding.
ALTER TABLE holding_lineage ADD COLUMN IF NOT EXISTS floors JSONB;
