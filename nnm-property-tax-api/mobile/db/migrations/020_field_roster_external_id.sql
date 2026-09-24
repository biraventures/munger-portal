-- Adds an optional external reference id to field_staff and
-- field_drivers, so a bulk roster upload can be matched against a
-- stable identifier (e.g. the source system's own StaffID like "N1",
-- "D1") instead of relying purely on (name, ward). Name-only matching
-- has two real failure modes: two different real people sharing a
-- name in the same ward would incorrectly collide into one record,
-- and a routine name correction (spelling fix, formatting change)
-- between uploads would be read as a brand-new person - silently
-- fragmenting that person's attendance history under a newly
-- "deactivated" old identity. external_id is nullable and unique only
-- when present, so this stays fully backward compatible for anyone
-- still uploading without it (falls back to name+ward matching).
ALTER TABLE field_staff ADD COLUMN external_id VARCHAR(32);
CREATE UNIQUE INDEX idx_field_staff_external_id ON field_staff (external_id) WHERE external_id IS NOT NULL;

ALTER TABLE field_drivers ADD COLUMN external_id VARCHAR(32);
CREATE UNIQUE INDEX idx_field_drivers_external_id ON field_drivers (external_id) WHERE external_id IS NOT NULL;
