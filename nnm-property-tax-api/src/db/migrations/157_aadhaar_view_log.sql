-- Aadhaar numbers recorded by Tax Collectors are shown masked (XXXX XXXX 1234). An authorised officer (Tax Daroga,
-- agency Team Leader / Project Manager, City Manager, DMC, Commissioner) can open the full number; every such view
-- is logged here.
CREATE TABLE IF NOT EXISTS aadhaar_view_log (
  id                    BIGSERIAL PRIMARY KEY,
  field_verification_id BIGINT NOT NULL,
  holding_no            VARCHAR(32) NOT NULL,
  viewed_by_username    VARCHAR(100) NOT NULL,
  viewed_by_role        VARCHAR(64) NOT NULL,
  viewed_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aadhaar_view_log_holding ON aadhaar_view_log (holding_no, viewed_at DESC);
