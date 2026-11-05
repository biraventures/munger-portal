-- A Tax Collector can now also CORRECT a holding's solid waste user type (not only enter a missing one) from the
-- Tax Collector page. The type on record when the request was made is kept for the audit trail.
ALTER TABLE solid_waste_type_requests ADD COLUMN IF NOT EXISTS previous_type TEXT;
