-- Mutation: land-record details, the Tax Daroga's area verification, applicant edits and a per-case audit trail.

-- Survey ward of the holding's land (khatian survey wards A-F); khata, khesra and survey sheet are already on properties.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS survey_ward CHAR(1) CHECK (survey_ward IN ('A', 'B', 'C', 'D', 'E', 'F'));

-- Online application: land-record details as the applicant gives them (optional - the Tax Daroga records the verified
-- ones), and the applicant's own edits after submission.
ALTER TABLE mutation_applications
  ADD COLUMN IF NOT EXISTS khata_no              VARCHAR(64),
  ADD COLUMN IF NOT EXISTS khesra_no             VARCHAR(64),
  ADD COLUMN IF NOT EXISTS survey_sheet_no       VARCHAR(64),
  ADD COLUMN IF NOT EXISTS survey_ward           CHAR(1) CHECK (survey_ward IN ('A', 'B', 'C', 'D', 'E', 'F')),
  ADD COLUMN IF NOT EXISTS edit_token_hash       VARCHAR(64),
  ADD COLUMN IF NOT EXISTS edit_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edit_count            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_edited_at        TIMESTAMPTZ;

-- Recorded by the Tax Daroga before forwarding a mutation: the three areas (sq ft) must agree, or the difference is
-- explained; plus the land-record identifiers, which go onto the holding when the mutation is finally approved.
CREATE TABLE IF NOT EXISTS mutation_area_verifications (
  id                   BIGSERIAL PRIMARY KEY,
  change_request_id    BIGINT NOT NULL REFERENCES property_change_requests(id),
  jamabandi_area_sqft  NUMERIC(12,2) NOT NULL CHECK (jamabandi_area_sqft > 0),
  document_area_sqft   NUMERIC(12,2) NOT NULL CHECK (document_area_sqft > 0),
  holding_area_sqft    NUMERIC(12,2) NOT NULL CHECK (holding_area_sqft > 0),
  areas_match          BOOLEAN NOT NULL,
  khata_no             VARCHAR(64) NOT NULL,
  khesra_no            VARCHAR(64) NOT NULL,
  survey_sheet_no      VARCHAR(64) NOT NULL,
  survey_ward          CHAR(1) NOT NULL CHECK (survey_ward IN ('A', 'B', 'C', 'D', 'E', 'F')),
  remarks              TEXT,
  verified_by          VARCHAR(255) NOT NULL,
  verified_by_username VARCHAR(64) NOT NULL,
  verified_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (areas_match OR length(btrim(coalesce(remarks, ''))) >= 5)
);
CREATE INDEX IF NOT EXISTS idx_mutation_area_verifications_cr ON mutation_area_verifications (change_request_id, verified_at DESC);

-- Audit events that the approval log and the revert log do not already hold.
CREATE TABLE IF NOT EXISTS mutation_audit_events (
  id                BIGSERIAL PRIMARY KEY,
  change_request_id BIGINT REFERENCES property_change_requests(id),
  application_id    BIGINT REFERENCES mutation_applications(id),
  event             VARCHAR(30) NOT NULL CHECK (event IN ('applicant_edited', 'applicant_resubmitted', 'area_verified')),
  stage             VARCHAR(32),
  actor             VARCHAR(255) NOT NULL,
  actor_role        VARCHAR(32),
  comment           TEXT,
  details           JSONB,
  at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (change_request_id IS NOT NULL OR application_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_mutation_audit_events_cr ON mutation_audit_events (change_request_id, at);
CREATE INDEX IF NOT EXISTS idx_mutation_audit_events_app ON mutation_audit_events (application_id, at);
