-- High Mast bulk upload: "Number of functional lamps" - how many of the lamps mounted on the tower (no_of_lights)
-- are working. NULL when the source did not say.
ALTER TABLE lights ADD COLUMN IF NOT EXISTS no_of_functional_lights INTEGER CHECK (no_of_functional_lights IS NULL OR no_of_functional_lights >= 0);
