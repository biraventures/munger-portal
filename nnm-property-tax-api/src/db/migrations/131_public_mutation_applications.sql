-- Online mutation applications from the public. A submitted application for a verified holding goes straight into the
-- existing mutation chain as a property_change_request at stage 1 (Tax Daroga). One entered by old holding number + ward
-- (holding not found) waits for the Tax Daroga to link it to the right holding first.
--   draft             - being filled in (documents uploading); not yet visible to staff
--   awaiting_holding  - submitted, holding entered manually - Tax Daroga to link it
--   in_chain          - a change request exists (change_request_id); its own status/stage is the progress
--   rejected          - turned down by the Tax Daroga before it entered the chain
CREATE TABLE IF NOT EXISTS mutation_applications (
  id                     BIGSERIAL PRIMARY KEY,
  application_no         VARCHAR(24) UNIQUE,
  status                 VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'awaiting_holding', 'in_chain', 'rejected')),
  -- Holding: either verified (holding_no) or entered by hand.
  holding_no             VARCHAR(32) REFERENCES properties(holding_no),
  entered_old_holding_no VARCHAR(32),
  entered_ward           VARCHAR(16),
  entered_address        TEXT,
  entered_tax_paid_till  VARCHAR(9),
  entered_sw_paid_till   VARCHAR(9),
  -- New owner and applicant
  new_owner_name         VARCHAR(255) NOT NULL,
  new_owner_relation_type VARCHAR(4),
  new_owner_relation_name VARCHAR(255),
  new_owner_mobile       VARCHAR(10) NOT NULL,
  new_owner_aadhaar      VARCHAR(12) NOT NULL,
  new_owner_email        VARCHAR(120),
  applicant_name         VARCHAR(255) NOT NULL,
  applicant_mobile       VARCHAR(10) NOT NULL,
  -- Transfer
  transfer_basis         VARCHAR(30) NOT NULL
    CHECK (transfer_basis IN ('sale_deed', 'partition', 'gift', 'inheritance', 'auction')),
  transfer_date          DATE NOT NULL,
  latitude               NUMERIC(10,7),
  longitude              NUMERIC(10,7),
  gps_accuracy_m         NUMERIC(10,1),
  upload_token_hash      VARCHAR(64) NOT NULL,
  change_request_id      BIGINT REFERENCES property_change_requests(id),
  handled_by             VARCHAR(100),
  handled_at             TIMESTAMPTZ,
  handling_remarks       VARCHAR(500),
  created_ip             VARCHAR(64),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at           TIMESTAMPTZ,
  CHECK (holding_no IS NOT NULL OR (entered_old_holding_no IS NOT NULL AND entered_ward IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_mutation_applications_status ON mutation_applications (status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_mutation_applications_holding ON mutation_applications (holding_no);
CREATE SEQUENCE IF NOT EXISTS mutation_application_seq;

CREATE TABLE IF NOT EXISTS mutation_application_documents (
  id             BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES mutation_applications(id) ON DELETE CASCADE,
  doc_type       VARCHAR(30) NOT NULL CHECK (doc_type IN (
                   'transfer_proof', 'jamabandi_new', 'jamabandi_old', 'shudhi_patra', 'aadhaar',
                   'holding_photo', 'affidavit', 'vanshavali')),
  file_path      TEXT NOT NULL,
  mime_type      VARCHAR(40) NOT NULL,
  size_bytes     BIGINT NOT NULL,
  file_name      VARCHAR(255) NOT NULL,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mutation_application_documents_app ON mutation_application_documents (application_id);

-- Links a change request back to the online application it came from (documents, applicant details).
ALTER TABLE property_change_requests ADD COLUMN IF NOT EXISTS public_application_id BIGINT REFERENCES mutation_applications(id);
