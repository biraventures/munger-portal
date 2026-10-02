-- Symmetric to non_functional_since (065_fault_non_functional_since.sql),
-- which records the claimed date a light STOPPED working, separate
-- from reported_at (when the report was actually filed). This adds
-- the mirror image: the claimed date a light STARTED working again
-- once marked repaired, separate from repaired_at (when the mark-
-- repaired action was actually taken). Requested so Mayor/Deputy
-- Mayor/Ward Parshad/City Manager can backdate a repair the same way
-- they can already backdate a fault.
ALTER TABLE light_faults ADD COLUMN functional_since DATE;
