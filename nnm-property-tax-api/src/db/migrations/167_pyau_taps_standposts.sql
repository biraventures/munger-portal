-- Two more fields of the submersible (pyau) field survey: how many water taps and how many water standposts.
ALTER TABLE pyaus ADD COLUMN IF NOT EXISTS water_tap_count INTEGER;
ALTER TABLE pyaus ADD COLUMN IF NOT EXISTS standpost_count INTEGER;
