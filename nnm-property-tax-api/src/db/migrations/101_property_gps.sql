-- GPS location of the holding (decimal degrees). Nullable - most holdings
-- have none recorded yet. Filled by the bulk upload (Latitude/Longitude
-- columns of the Master sheet) and shown read-only on the property
-- details views.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10,6);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,6);
