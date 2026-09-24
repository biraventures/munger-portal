-- Adds three standard Indian land-record identifiers to each holding
-- - khesra (plot) number, survey sheet number, and khata (account)
-- number - for more comprehensive record-keeping alongside the
-- existing holding/PID identifiers. All optional/nullable: these are
-- reference data, not required to create or maintain a holding, and
-- most existing holdings won't have them recorded yet.
ALTER TABLE properties ADD COLUMN khesra_no VARCHAR(64);
ALTER TABLE properties ADD COLUMN survey_sheet_no VARCHAR(64);
ALTER TABLE properties ADD COLUMN khata_no VARCHAR(64);
