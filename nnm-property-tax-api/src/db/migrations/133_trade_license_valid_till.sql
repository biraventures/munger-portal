-- Trade licence field check: the licence's "valid till" year (financial year, e.g. 2026-2027). A licence whose validity
-- ended before the current financial year gets a notice like a business with no licence.
ALTER TABLE trade_license_surveys ADD COLUMN IF NOT EXISTS license_valid_till VARCHAR(9);
ALTER TABLE trade_license_surveys ADD COLUMN IF NOT EXISTS complied_valid_till VARCHAR(9);
