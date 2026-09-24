-- Removes the last few mandatory fields from shop/agreement data
-- entry. This was directly causing final-approval failures: a shop
-- created without a location (e.g. via a path that didn't collect
-- it) caused a NOT NULL violation only at the very last approval
-- step, when the agreement finally gets written - by then the
-- request had already gone through every other reviewer, wasting
-- everyone's time on a rejection that should have been possible to
-- avoid entirely.
--
-- The new principle: nothing is mandatory at data-entry time.
-- Completeness is instead checked at the point a specific output
-- actually needs specific fields - e.g. generating a rent demand
-- notice needs to know the rent and who the tenant is, so THAT
-- action checks and tells the user exactly what's still missing,
-- rather than the system blocking data entry/approval speculatively
-- for every possible future use of the data.
ALTER TABLE shops ALTER COLUMN location DROP NOT NULL;
ALTER TABLE shop_agreements ALTER COLUMN holder_name DROP NOT NULL;
ALTER TABLE shop_agreements ALTER COLUMN base_monthly_rent DROP NOT NULL;
