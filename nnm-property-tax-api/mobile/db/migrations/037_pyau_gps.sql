-- Adds GPS coordinates to the pyau registry - unlike the street light
-- module, pyaus never had a location beyond a text address, since GPS
-- wasn't part of the original spec for this module. Nullable, since
-- existing entries (including anything already bulk-imported) won't
-- have this yet.
ALTER TABLE pyaus ADD COLUMN latitude NUMERIC(10,6);
ALTER TABLE pyaus ADD COLUMN longitude NUMERIC(10,6);
