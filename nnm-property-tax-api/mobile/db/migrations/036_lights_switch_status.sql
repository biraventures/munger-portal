-- Adds switch_status, present in the real field-inventory CSV for
-- this module (values: working / not working / automatic / joint)
-- but not part of the original schema. Kept separate from the
-- module's actual functional-status concept, which stays fault-driven
-- (an open light_faults row means non-functional) rather than a
-- direct field here, for consistency with how the rest of this module
-- already works - see pyauCsvImport-style handling in
-- lightCsvImport.service.ts, which creates an initial open fault for
-- any imported light whose CSV row says it isn't currently working.
ALTER TABLE lights ADD COLUMN switch_status VARCHAR(16) CHECK (switch_status IN ('working', 'not_working', 'automatic', 'joint'));
