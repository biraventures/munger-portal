-- Photo of the holding's page in the offline (paper) holding demand register, taken by the Tax Collector. Required -
-- with the other holding documents - before the Tax Collector can collect tax for the holding.
ALTER TABLE property_field_verifications ADD COLUMN IF NOT EXISTS register_photo_path TEXT;
