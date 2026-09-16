-- Gates a shop agreement document (the scanned/signed PDF) behind the
-- same 3-stage review already used for shop publication (Stall
-- Prabhari -> City Manager -> Deputy Municipal Commissioner, see
-- SHOP_PUBLICATION_STAGE_ORDER) - separate from that chain since this
-- approves a specific file, not the shop record itself, but reusing
-- the identical stage sequence rather than inventing a new one.
--
-- Uploading (a first document, or a change to an existing one) no
-- longer replaces shop_agreement_documents directly - it creates a
-- pending request here instead. Only once a request clears all three
-- stages does its file become the live document. A rejection at any
-- stage leaves shop_agreement_documents (if anything is already
-- there) untouched; a shop can have at most one pending request at a
-- time, enforced at the application layer (a second upload while one
-- is still pending replaces the pending file rather than queuing a
-- second review).
CREATE TABLE shop_agreement_document_requests (
  id                BIGSERIAL PRIMARY KEY,
  shop_no           VARCHAR(32) NOT NULL REFERENCES shops(shop_no),
  file_data         BYTEA NOT NULL,
  file_name         VARCHAR(255) NOT NULL,
  file_size         INTEGER NOT NULL,
  is_change         BOOLEAN NOT NULL DEFAULT FALSE, -- true when this shop already had an approved document (a "change" upload) vs a first-time upload
  uploaded_by       VARCHAR(255) NOT NULL,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status            VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  current_stage     VARCHAR(30) NOT NULL DEFAULT 'stall_prabhari' CHECK (current_stage IN ('stall_prabhari', 'city_manager', 'deputy_commissioner')),
  decided_at        TIMESTAMPTZ,
  rejected_by       VARCHAR(255),
  rejected_role     VARCHAR(30),
  rejection_reason  TEXT
);
CREATE INDEX idx_shop_agreement_document_requests_shop ON shop_agreement_document_requests (shop_no, status);

CREATE TABLE shop_agreement_document_approvals (
  id                  BIGSERIAL PRIMARY KEY,
  request_id          BIGINT NOT NULL REFERENCES shop_agreement_document_requests(id),
  stage               VARCHAR(30) NOT NULL,
  admin_username      VARCHAR(100) NOT NULL,
  admin_display_name  VARCHAR(200) NOT NULL,
  notes               TEXT,
  decided_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
