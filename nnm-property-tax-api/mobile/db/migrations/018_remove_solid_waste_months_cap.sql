-- Removes the 1-12 cap on solid_waste_months. Solid waste charge is
-- meant to also be collectible as part of a property's pending
-- arrears (multiple years owed at once), not just the current year -
-- an operator now enters a larger months value directly (e.g. 36 for
-- 3 pending years) to reflect that, rather than the system trying to
-- work out a per-year breakdown automatically. Still requires a
-- positive value - just no longer capped at a single year.
ALTER TABLE properties DROP CONSTRAINT chk_solid_waste_months;
ALTER TABLE properties ADD CONSTRAINT chk_solid_waste_months CHECK (solid_waste_months >= 1);