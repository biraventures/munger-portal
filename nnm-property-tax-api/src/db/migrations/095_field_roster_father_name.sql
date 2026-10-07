-- Father's name for the three field-roster tables, so the unified
-- staff/driver/assistant directory (and the existing per-category
-- manage-* screens) can show and edit it like any other identifying
-- detail. The "Fresh Data - Merged Data" CSV import already carries a
-- "Father Name" column (see staffMergedImport.service.ts) that was
-- previously parsed and discarded for lack of a column to put it in.

ALTER TABLE field_staff ADD COLUMN father_name VARCHAR(255);
ALTER TABLE field_drivers ADD COLUMN father_name VARCHAR(255);
ALTER TABLE field_assistants ADD COLUMN father_name VARCHAR(255);
