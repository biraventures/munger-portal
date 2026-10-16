-- Trade licence application: documents uploaded with the application (instead of "attached" ticks), BPL yes/no, GST
-- registration, business category from the holding use types, Nagar Nigam stall/shop, and the licence's validity.
ALTER TABLE trade_license_applications
  ADD COLUMN IF NOT EXISTS is_bpl            BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_gst_registered BOOLEAN,
  ADD COLUMN IF NOT EXISTS firm_pan_number   VARCHAR(20),
  -- One of the holding use types (constants/tradeLicenseBusinessTypes.ts) or 'Others' - kept to the same wording as the
  -- property records so licences can later be matched to holdings; type_of_business holds the free-text description.
  ADD COLUMN IF NOT EXISTS business_category VARCHAR(255),
  ADD COLUMN IF NOT EXISTS is_nnm_shop       BOOLEAN,
  ADD COLUMN IF NOT EXISTS nnm_shop_no       VARCHAR(50),
  -- Set on final approval: valid from the date of issue for the duration applied for.
  ADD COLUMN IF NOT EXISTS license_issued_on  DATE,
  ADD COLUMN IF NOT EXISTS license_valid_till DATE;

-- Files are uploaded first (application_id NULL, claimed with a one-time token) and attached when the application is
-- submitted, so the form can be filled in one go.
CREATE TABLE IF NOT EXISTS trade_license_application_documents (
  id                BIGSERIAL PRIMARY KEY,
  application_id    INTEGER REFERENCES trade_license_applications(id),
  doc_type          VARCHAR(30) NOT NULL CHECK (doc_type IN ('holding_receipt', 'bpl_proof', 'gstr_3b', 'pan_applicant', 'pan_firm', 'shop_photo')),
  file_path         TEXT NOT NULL,
  mime_type         VARCHAR(40) NOT NULL,
  size_bytes        BIGINT NOT NULL,
  file_name         VARCHAR(255) NOT NULL,
  upload_token_hash VARCHAR(64) NOT NULL,
  created_ip        VARCHAR(64),
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tl_app_docs_app ON trade_license_application_documents (application_id);

-- Field check by the Tax Collector: is the business in a Nagar Nigam stall/shop?
ALTER TABLE trade_license_surveys
  ADD COLUMN IF NOT EXISTS is_nnm_shop BOOLEAN,
  ADD COLUMN IF NOT EXISTS nnm_shop_no VARCHAR(50);
