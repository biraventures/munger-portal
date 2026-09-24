-- Adds the holding owner's Aadhaar number - a standard 12-digit
-- identifier. For non-individual owners (trust, society, company)
-- who don't have a personal Aadhaar number, the placeholder
-- "999999999999" is used instead (also 12 digits, so the same
-- validation applies uniformly rather than needing a separate
-- "not applicable" case). Optional/nullable: existing holdings won't
-- have this recorded yet, and it isn't required to create or edit a
-- holding.
ALTER TABLE properties ADD COLUMN aadhaar_number VARCHAR(12);
ALTER TABLE properties ADD CONSTRAINT chk_properties_aadhaar_number CHECK (aadhaar_number IS NULL OR aadhaar_number ~ '^[0-9]{12}$');
