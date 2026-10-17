-- Mutation: partial mutation (part of a holding transferred -> a new MMC- holding), lineage of holdings created by
-- mutation, two "other document" slots, and online applications sent back to the applicant before the holding is
-- identified.

-- 'returned': sent back to the applicant by the Tax Daroga while the holding was still to be identified.
ALTER TABLE mutation_applications DROP CONSTRAINT IF EXISTS mutation_applications_status_check;
ALTER TABLE mutation_applications ADD CONSTRAINT mutation_applications_status_check
  CHECK (status IN ('draft', 'awaiting_holding', 'returned', 'in_chain', 'rejected'));

-- Area: the holding's total area (from the record, or as the applicant gives it) and the part being mutated.
ALTER TABLE mutation_applications
  ADD COLUMN IF NOT EXISTS holding_area_sqft NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS mutate_area_sqft  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS mutate_entire     BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE mutation_application_documents DROP CONSTRAINT IF EXISTS mutation_application_documents_doc_type_check;
ALTER TABLE mutation_application_documents ADD CONSTRAINT mutation_application_documents_doc_type_check
  CHECK (doc_type IN ('transfer_proof', 'jamabandi_new', 'jamabandi_old', 'shudhi_patra', 'aadhaar', 'holding_photo',
                      'affidavit', 'vanshavali', 'other_1', 'other_2'));
-- Name the applicant gives an "other" document.
ALTER TABLE mutation_application_documents ADD COLUMN IF NOT EXISTS label VARCHAR(100);

-- The Tax Daroga confirms the area being mutated; partial when it is less than the holding's area.
ALTER TABLE mutation_area_verifications
  ADD COLUMN IF NOT EXISTS mutate_area_sqft NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS is_partial       BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE mutation_audit_events DROP CONSTRAINT IF EXISTS mutation_audit_events_event_check;
ALTER TABLE mutation_audit_events ADD CONSTRAINT mutation_audit_events_event_check
  CHECK (event IN ('applicant_edited', 'applicant_resubmitted', 'area_verified', 'returned_to_applicant'));

-- Which holding created which, through mutation - kept for reference.
CREATE TABLE IF NOT EXISTS holding_lineage (
  id                  BIGSERIAL PRIMARY KEY,
  parent_holding_no   VARCHAR(32) NOT NULL REFERENCES properties(holding_no),
  child_holding_no    VARCHAR(32) NOT NULL UNIQUE REFERENCES properties(holding_no),
  kind                VARCHAR(20) NOT NULL DEFAULT 'partial_mutation' CHECK (kind IN ('partial_mutation')),
  change_request_id   BIGINT REFERENCES property_change_requests(id),
  application_id      BIGINT REFERENCES mutation_applications(id),
  area_sqft           NUMERIC(12,2) NOT NULL,
  parent_area_before  NUMERIC(12,2) NOT NULL,
  parent_area_after   NUMERIC(12,2) NOT NULL,
  created_by          VARCHAR(255) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_holding_lineage_parent ON holding_lineage (parent_holding_no);
