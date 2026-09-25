-- Inserting a light between two existing ones used to shift every
-- later light's serial number up by one. Now it doesn't: the new
-- light gets the preceding light's base number plus the next unused
-- letter (4 -> 4A -> 4B -> 4C ...), and nothing else changes. See
-- lightInsert.service.ts.
ALTER TABLE lights ADD COLUMN light_serial_suffix VARCHAR(1);
