-- Trade licence notices are printed twice on one A4 sheet: the top half for the business, the bottom half signed by
-- the business as received. The Tax Collector photographs that receiving half (camera only) and uploads it here.
-- Once uploaded it is kept as it is (like the demand-notice receiving copies).
ALTER TABLE trade_license_notices
  ADD COLUMN IF NOT EXISTS receiving_photo_path   TEXT,
  ADD COLUMN IF NOT EXISTS receiving_latitude     NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS receiving_longitude    NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS receiving_uploaded_by_username VARCHAR(64),
  ADD COLUMN IF NOT EXISTS receiving_uploaded_by_name     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS receiving_uploaded_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tl_notices_receiving_at ON trade_license_notices (receiving_uploaded_at) WHERE receiving_uploaded_at IS NOT NULL;
