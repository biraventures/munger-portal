-- Where a holding's record came from (e.g. "Ward 12 field survey 2025 - Excel"), entered by the
-- Commissioner on the bulk upload. Also written to the holding's audit trail (property_history,
-- change_reference) as its 'Created' entry.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS data_source TEXT;
