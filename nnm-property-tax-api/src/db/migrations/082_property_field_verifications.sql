-- Field verification capture for an ORDINARY collection/survey visit
-- (not only when flagging a property discrepancy - see
-- property_discrepancy_requests for that separate flow). A Tax
-- Collector or Tax Surveyor, while at a holding, can record the GPS
-- location, a photo of the holding, the owner's Aadhaar number and a
-- photo of their Aadhaar card, a photo of the previous year's tax
-- receipt, and a photo of any land-related document.
--
-- This is deliberately a pure evidence/audit log: it never mutates
-- the property record itself. The only path that changes a property
-- record stays the existing discrepancy approval chain
-- (property_discrepancy_requests) - a field verification capture
-- sits alongside that, available on every visit, not just when
-- something looks wrong.
CREATE TABLE property_field_verifications (
  id                              BIGSERIAL PRIMARY KEY,
  holding_no                      VARCHAR(32) NOT NULL REFERENCES properties(holding_no),
  gps_lat                         NUMERIC(10,6),
  gps_lng                         NUMERIC(10,6),
  holding_photo_path              VARCHAR(500),
  aadhaar_number                  VARCHAR(12),
  aadhaar_photo_path              VARCHAR(500),
  previous_receipt_photo_path     VARCHAR(500),
  land_document_photo_path        VARCHAR(500),
  captured_by_username            VARCHAR(64) NOT NULL,
  captured_by_display_name        VARCHAR(255) NOT NULL,
  captured_by_role                VARCHAR(32) NOT NULL,
  captured_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_pfv_aadhaar_number CHECK (aadhaar_number IS NULL OR aadhaar_number ~ '^[0-9]{12}$')
);
CREATE INDEX idx_property_field_verifications_holding_no ON property_field_verifications (holding_no);
CREATE INDEX idx_property_field_verifications_captured_at ON property_field_verifications (captured_at);
