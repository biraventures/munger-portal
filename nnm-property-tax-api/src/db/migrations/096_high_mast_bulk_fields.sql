-- Supports the High Mast bulk-upload CSV (Sl no, Ward, Location name,
-- Installed by Agency name, No of lights, Functional status,
-- Maintenance agency, Latitude, Longitude, Remarks) - see
-- highMastBulkImport.service.ts.
--
-- - no_of_lights: how many lamp fixtures are mounted on this one High
--   Mast tower - a count on the row, not a reason to split it into
--   several "lights" records (functional status/maintenance/remarks
--   describe the tower as a unit, not each lamp separately).
-- - maintenance_agency_id: reuses installation_agencies (just a name
--   lookup table) rather than a second near-identical table, since a
--   light's maintenance agency can differ from whoever installed it.
-- - remarks: free-text note carried over from the source sheet.
ALTER TABLE lights ADD COLUMN no_of_lights INTEGER;
ALTER TABLE lights ADD COLUMN maintenance_agency_id BIGINT REFERENCES installation_agencies(id);
ALTER TABLE lights ADD COLUMN remarks TEXT;
