-- Distinguishes rows this system derives automatically from Floors data
-- (year_built/closing_year per floor) from rows that were migrated from
-- the original spreadsheet or manually entered (e.g. the "partially
-- known" holding flow's operator-supplied ARV). Only auto_generated=TRUE
-- rows are ever replaced by the automatic regeneration — manually
-- entered/migrated historical data is never touched by it.
ALTER TABLE tax_history_stages ADD COLUMN auto_generated BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_tax_history_stages_auto ON tax_history_stages (holding_no, auto_generated);