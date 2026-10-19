-- Demand notices record the period they demand and whether they are a full or part-payment demand.
--   demand_from_year / demand_upto_year - first and last financial year (YYYY-YYYY) covered by the notice: holding tax
--                                         arrears, the current year (full demand) and the unpaid solid waste user charge.
--   payment_type                        - 'full' or 'part' (part = only the first N unpaid arrear years, migration 106).
ALTER TABLE demand_notices
  ADD COLUMN IF NOT EXISTS demand_from_year VARCHAR(9),
  ADD COLUMN IF NOT EXISTS demand_upto_year VARCHAR(9),
  ADD COLUMN IF NOT EXISTS payment_type VARCHAR(4) GENERATED ALWAYS AS (CASE WHEN part_payment THEN 'part' ELSE 'full' END) STORED;

-- Earlier notices: taken from what was printed on them (the frozen snapshot), where it is available.
WITH p AS (
  SELECT demand_no,
         (SELECT min(y) FROM unnest(ARRAY[
             substr(snapshot->'totals'->'partPayment'->>'fromYear', 1, 4),
             substr(snapshot->'totals'->'arrearsPeriod'->>'fromYear', 1, 4),
             CASE WHEN COALESCE((snapshot->'totals'->'currentYear'->>'included')::boolean, FALSE) THEN substr(snapshot->'totals'->'currentYear'->>'year', 1, 4) END,
             substr(snapshot->'totals'->'solidWaste'->>'fromYear', 1, 4)
           ]) AS y WHERE y ~ '^\d{4}$') AS f,
         (SELECT max(y) FROM unnest(ARRAY[
             substr(snapshot->'totals'->'partPayment'->>'toYear', 1, 4),
             substr(snapshot->'totals'->'arrearsPeriod'->>'toYear', 1, 4),
             CASE WHEN COALESCE((snapshot->'totals'->'currentYear'->>'included')::boolean, FALSE) THEN substr(snapshot->'totals'->'currentYear'->>'year', 1, 4) END,
             substr(snapshot->'totals'->'solidWaste'->>'toYear', 1, 4)
           ]) AS y WHERE y ~ '^\d{4}$') AS t
    FROM demand_notices
   WHERE snapshot IS NOT NULL AND demand_from_year IS NULL
)
UPDATE demand_notices d
   SET demand_from_year = p.f || '-' || (p.f::int + 1),
       demand_upto_year = p.t || '-' || (p.t::int + 1)
  FROM p
 WHERE d.demand_no = p.demand_no AND p.f IS NOT NULL AND p.t IS NOT NULL;

-- Older notices without a snapshot: a part notice ends at its paid-through year, a full one at its assessment year.
UPDATE demand_notices
   SET demand_upto_year = COALESCE(paid_through_year, assessment_year)
 WHERE demand_upto_year IS NULL;
