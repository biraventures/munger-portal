-- A street segment can have zero lights currently installed - the
-- segment record still exists so lights can be added later without
-- re-entering the street's basic details. Only negative counts are
-- actually invalid.
ALTER TABLE street_segments DROP CONSTRAINT street_segments_light_count_check;
ALTER TABLE street_segments ADD CONSTRAINT street_segments_light_count_check CHECK (light_count >= 0);
