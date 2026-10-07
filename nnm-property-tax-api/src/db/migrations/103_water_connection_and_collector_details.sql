-- Details a Tax Collector records during collection: whether the holding has a
-- tap water connection (needed by the Municipal Commissioner), plus an audit
-- stamp for the collector-entered solid waste user type.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS water_connection_status TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS water_connection_count INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS collector_details_by TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS collector_details_at TIMESTAMPTZ;

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_water_connection_status_check;
ALTER TABLE properties ADD CONSTRAINT properties_water_connection_status_check
  CHECK (water_connection_status IS NULL OR water_connection_status IN
    ('multiple', 'single_wtp', 'single_submersible', 'connected_no_water', 'none'));

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_water_connection_count_check;
ALTER TABLE properties ADD CONSTRAINT properties_water_connection_count_check
  CHECK (water_connection_count IS NULL OR water_connection_count >= 2);
