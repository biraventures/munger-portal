-- The Tax Collector records the holding's water supply status on EVERY field visit: when uploading the receiving copy
-- of a delivered demand notice and when uploading the holding's documents/photos. What was reported on each visit is
-- kept with that visit; the holding's water_connection_status (migration 103) is updated to the latest report.
ALTER TABLE demand_notice_receiving_copies ADD COLUMN IF NOT EXISTS water_connection_status TEXT;
ALTER TABLE demand_notice_receiving_copies ADD COLUMN IF NOT EXISTS water_connection_count INTEGER;
ALTER TABLE property_field_verifications ADD COLUMN IF NOT EXISTS water_connection_status TEXT;
ALTER TABLE property_field_verifications ADD COLUMN IF NOT EXISTS water_connection_count INTEGER;

DO $$ BEGIN
  ALTER TABLE demand_notice_receiving_copies ADD CONSTRAINT receiving_copies_water_status_check
    CHECK (water_connection_status IS NULL OR water_connection_status IN ('multiple', 'single_wtp', 'single_submersible', 'connected_no_water', 'none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE property_field_verifications ADD CONSTRAINT field_verifications_water_status_check
    CHECK (water_connection_status IS NULL OR water_connection_status IN ('multiple', 'single_wtp', 'single_submersible', 'connected_no_water', 'none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
