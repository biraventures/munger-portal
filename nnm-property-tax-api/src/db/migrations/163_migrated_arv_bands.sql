-- The old-holding (MUNG-MIG) sheet's full column set: ARV in six bands, and the holding's creation year.
-- Reference-only like the other old_* figures (never used in a live tax calculation); the creation year is also set on
-- the holding itself.
ALTER TABLE migrated_holding_surveys ADD COLUMN IF NOT EXISTS old_arv_1997_2000 NUMERIC(14,2);
ALTER TABLE migrated_holding_surveys ADD COLUMN IF NOT EXISTS old_arv_2000_2011 NUMERIC(14,2);
ALTER TABLE migrated_holding_surveys ADD COLUMN IF NOT EXISTS old_arv_2011_2017 NUMERIC(14,2);
ALTER TABLE migrated_holding_surveys ADD COLUMN IF NOT EXISTS old_arv_2017_2021 NUMERIC(14,2);
ALTER TABLE migrated_holding_surveys ADD COLUMN IF NOT EXISTS old_arv_2021_onwards NUMERIC(14,2);
ALTER TABLE migrated_holding_surveys ADD COLUMN IF NOT EXISTS old_holding_creation_year VARCHAR(9);
