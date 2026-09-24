-- Corrects the original pyaus schema (migration 034) based on the
-- actual field inventory CSV, which revealed several mismatches with
-- what was assumed when that table was first designed:
--
-- - No serial/ID column existed at all - added here, auto-generated
--   ward-sequential (e.g. "W1-01") at import/creation time.
-- - No field for the pyau's physical address/location existed at
--   all, despite this being present and important in the real data.
-- - has_overhead_tank was modeled as boolean, but the real data is a
--   COUNT (0/1/2/3) with a couple of free-text outliers ("0(Ground)",
--   "Only Submersible") - changed to an integer count; the outliers
--   are preserved as remarks rather than forced into a number.
-- - structure_type only had 2 values (room/iron_stand), but the real
--   data has 3 meaningfully different values: PCC (concrete)
--   structure, iron stand, or no structure at all ("Nothing") -
--   renamed to match the real category names and added the missing
--   third value.
-- - Added a remarks field to capture the free-text operational notes
--   seen in the "not working" column of the source data (e.g. "local
--   dispute...", "totally defunct", "Drainage issues") - these are
--   genuinely useful context, not something to discard.
-- - Added tank_stand_type to capture the separate "Tank Stand of
--   Water Kiosk" column (Yes / Through Direct pipe) from the source
--   data - kept distinct from structure_type since it's a different
--   column with different values in the source, though the exact
--   relationship between the two is still worth confirming.
--
-- scheme_name, pump_details, boring_depth_feet, casing_details,
-- installed_date, builder_name, builder_contact are already nullable
-- from migration 034 and needed no change - none of this data exists
-- in the initial import, and will be filled in later per-pyau.

ALTER TABLE pyaus ADD COLUMN serial_number VARCHAR(32) UNIQUE;
ALTER TABLE pyaus ADD COLUMN location_address TEXT;
ALTER TABLE pyaus ADD COLUMN remarks TEXT;
ALTER TABLE pyaus ADD COLUMN tank_stand_type VARCHAR(32);

ALTER TABLE pyaus DROP COLUMN has_overhead_tank;
ALTER TABLE pyaus ADD COLUMN overhead_tank_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pyaus DROP CONSTRAINT pyaus_structure_type_check;
ALTER TABLE pyaus ADD CONSTRAINT pyaus_structure_type_check
  CHECK (structure_type IN ('pcc_structure', 'iron_stand', 'nothing'));
