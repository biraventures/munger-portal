-- A real record in the bulk-imported backup has two mobile numbers
-- for one owner ("7979719254, 7979703137"), which doesn't fit the
-- original VARCHAR(15) sized for a single 10-digit number. Widened
-- generously rather than truncating and losing one of the numbers.
ALTER TABLE properties ALTER COLUMN mobile_no TYPE VARCHAR(64);
