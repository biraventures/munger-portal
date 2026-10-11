-- Holding tax exemption (government order, religious institution, etc.).
--
-- An exempt holding pays NO holding tax from tax_exempt_from_year onward;
-- years before that stay payable as arrears. The solid waste user charge is
-- NOT affected - it is still charged exactly as for any other holding.
--
-- Marked or removed only through the property change request chain (same
-- route as the slum flag), with the order details and a scanned copy of the
-- order. The order copy is kept in property_exemption_orders.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS is_tax_exempt BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS tax_exempt_category VARCHAR(60);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS tax_exempt_order_no VARCHAR(100);
-- Kept as text (YYYY-MM-DD) so it never shifts a day through time-zone conversion.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS tax_exempt_order_date VARCHAR(10);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS tax_exempt_from_year VARCHAR(9);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS tax_exempt_remarks TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS tax_exempt_order_doc_id BIGINT;

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_tax_exempt_details_check;
ALTER TABLE properties ADD CONSTRAINT properties_tax_exempt_details_check CHECK (
  NOT is_tax_exempt OR (
    tax_exempt_category IS NOT NULL
    AND tax_exempt_order_no IS NOT NULL
    AND tax_exempt_order_date ~ '^\d{4}-\d{2}-\d{2}$'
    AND tax_exempt_from_year ~ '^\d{4}-\d{4}$'
    AND tax_exempt_order_doc_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_properties_tax_exempt ON properties (is_tax_exempt) WHERE is_tax_exempt;

-- Scanned exemption orders. holding_no is a plain matching string (no FK), like
-- trade_license_applications, so deleting or renumbering a holding is never
-- blocked by it; both of those paths handle this table explicitly.
CREATE TABLE IF NOT EXISTS property_exemption_orders (
  id           BIGSERIAL PRIMARY KEY,
  holding_no   VARCHAR(32) NOT NULL,
  file_name    VARCHAR(255) NOT NULL,
  mime_type    VARCHAR(100) NOT NULL,
  file_size    INTEGER NOT NULL,
  file_data    BYTEA NOT NULL,
  uploaded_by  VARCHAR(150) NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_property_exemption_orders_holding ON property_exemption_orders (holding_no);
