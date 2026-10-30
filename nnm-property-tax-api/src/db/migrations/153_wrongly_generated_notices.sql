-- Demand notices raised by mistake for a holding that had ALREADY paid the year the notice demands.
-- They are marked "wrongly generated" and cancelled, so no payment can ever be taken against them (counter, Tax
-- Collector, agency, online, QR) and every reprint carries the CANCELLED watermark with the reason.
--
-- 1. Holdings that paid in this financial year against a notice that still carried the old year (the stale
--    assessment_year fixed in migration 152) paid the previous year as arrears AND one more year's tax as "current".
--    That second year is the current financial year, so their tax-paid-till year is moved up to it.
-- 2. Wrongly generated = still unsettled, not a part-payment notice, and the year it demands was already paid when it
--    was generated: the holding is paid till that year, and no valid payment was made AFTER the notice was raised (if
--    one was, the year may have been paid only then - the notice was replaced by that payment, not a mistake).

ALTER TABLE demand_notices ADD COLUMN IF NOT EXISTS wrongly_generated BOOLEAN NOT NULL DEFAULT FALSE;

-- 1
WITH stale_paid AS (
  SELECT DISTINCT ON (n.holding_no)
         n.holding_no, n.demand_no, n.settled_receipt_no,
         EXTRACT(YEAR FROM ((n.notice_date AT TIME ZONE 'Asia/Kolkata') - INTERVAL '3 months'))::int AS fy
    FROM demand_notices n
    JOIN transactions t ON t.receipt_no = n.settled_receipt_no
   WHERE n.settled AND NOT n.cancelled AND NOT COALESCE(n.part_payment, FALSE)
     AND NOT COALESCE(t.cancelled, FALSE) AND t.status = 'success'
     AND n.assessment_year ~ '^\d{4}-\d{4}$'
     AND LEFT(n.assessment_year, 4)::int
         < EXTRACT(YEAR FROM ((n.notice_date AT TIME ZONE 'Asia/Kolkata') - INTERVAL '3 months'))::int
     -- the notice also carried the arrears up to the year before (so its "current" amount was a second year)
     AND COALESCE(n.snapshot #>> '{totals,arrearsPeriod,toYear}', '') ~ '^\d{4}'
     AND LEFT(n.snapshot #>> '{totals,arrearsPeriod,toYear}', 4)::int
         = EXTRACT(YEAR FROM ((n.notice_date AT TIME ZONE 'Asia/Kolkata') - INTERVAL '3 months'))::int - 1
   ORDER BY n.holding_no, n.notice_date DESC
), fix AS (
  SELECT p.holding_no, p.tax_paid_till_year AS previous_year, s.fy::text || '-' || (s.fy + 1)::text AS new_year,
         s.demand_no, s.settled_receipt_no
    FROM properties p JOIN stale_paid s ON s.holding_no = p.holding_no
   WHERE p.tax_paid_till_year IS NULL OR p.tax_paid_till_year < s.fy::text || '-' || (s.fy + 1)::text
), logged AS (
  INSERT INTO paid_till_repair_log (holding_no, previous_year, new_year, demand_no, receipt_no)
  SELECT holding_no, previous_year, new_year, demand_no, settled_receipt_no FROM fix
  RETURNING holding_no, new_year
)
UPDATE properties p SET tax_paid_till_year = logged.new_year FROM logged WHERE logged.holding_no = p.holding_no;

-- 2
UPDATE demand_notices n
   SET wrongly_generated = TRUE,
       cancelled = TRUE,
       cancelled_at = now(),
       cancelled_reason = 'Wrongly generated: tax of this holding was already paid till ' || p.tax_paid_till_year
                          || ' when this notice was issued. Not payable.'
  FROM properties p
 WHERE p.holding_no = n.holding_no
   AND NOT n.settled AND NOT n.cancelled AND NOT n.on_hold
   AND NOT COALESCE(n.part_payment, FALSE)
   AND n.assessment_year ~ '^\d{4}-\d{4}$'
   AND p.tax_paid_till_year ~ '^\d{4}-\d{4}$'
   AND p.tax_paid_till_year >= n.assessment_year
   AND NOT EXISTS (
     SELECT 1 FROM demand_notices m
       JOIN transactions t ON t.receipt_no = m.settled_receipt_no
      WHERE m.holding_no = n.holding_no AND m.settled AND NOT m.cancelled
        AND NOT COALESCE(t.cancelled, FALSE) AND t.status = 'success'
        AND t.txn_date >= n.notice_date);

CREATE INDEX IF NOT EXISTS idx_demand_notices_wrongly_generated ON demand_notices (holding_no) WHERE wrongly_generated;
