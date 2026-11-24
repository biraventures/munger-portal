-- Property discrepancy reports: a photo of the holding owner (required, with the Aadhaar card photo, when the owner's
-- name changes). The site photo is required when the area, a floor's area or usage, or the solid waste user type changes.
ALTER TABLE property_discrepancy_requests ADD COLUMN IF NOT EXISTS owner_photo_path TEXT;
