-- The serial number format (agency/ward/street/sequence) with a real
-- street span like "MG Road-Station Chowk" easily exceeds the old
-- 64-character limit, causing "value too long for type character
-- varying(64)" on bulk import. Widened generously since street names
-- vary a lot in length.
ALTER TABLE lights ALTER COLUMN serial_number TYPE VARCHAR(255);
