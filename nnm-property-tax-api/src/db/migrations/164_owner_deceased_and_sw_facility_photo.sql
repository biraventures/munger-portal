-- A Tax Collector / Tax Surveyor can record on a field visit that the holding's original owner has died: the owner's
-- Aadhaar number (and card photo) is then not required for that holding.
ALTER TABLE property_field_verifications ADD COLUMN IF NOT EXISTS owner_deceased BOOLEAN NOT NULL DEFAULT false;

-- The photo of the facility the Tax Collector attaches when proposing a solid waste user type, for the Tax Daroga
-- to decide on.
ALTER TABLE solid_waste_type_requests ADD COLUMN IF NOT EXISTS facility_photo_path TEXT;
