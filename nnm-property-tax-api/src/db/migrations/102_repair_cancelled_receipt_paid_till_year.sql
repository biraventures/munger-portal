-- One-time repair for receipts cancelled BEFORE the cancellation fix of
-- migration 097 was deployed. Those cancellations reopened the demand
-- notice but left the property's tax_paid_till_year advanced, so the
-- holding showed "no dues" (e.g. on the public search) while an unsettled
-- demand notice was pending against it.
--
-- A holding is repaired only when it is unambiguously inconsistent:
--   * its latest cancelled receipt was linked to a demand notice,
--   * tax_paid_till_year still equals that notice's assessment_year,
--   * no valid (non-cancelled) receipt was issued at or after it, and
--   * no other live settled notice already covers that year or later.
-- tax_paid_till_year is then wound back to the value just before the
-- cancelled receipt: the snapshot saved on the receipt if there is one,
-- otherwise the year before the earliest period the receipt covered.
WITH latest_cancelled AS (
  SELECT DISTINCT ON (t.holding_no)
    t.holding_no,
    t.receipt_no,
    t.previous_tax_paid_till_year AS snapshot,
    n.demand_no,
    n.assessment_year,
    CAST(LEFT(n.assessment_year, 4) AS INTEGER) AS notice_start,
    t.arrear_stages_paid,
    t.arrear_periods_paid
  FROM transactions t
  JOIN demand_notices n ON n.demand_no = t.demand_no
  JOIN properties p ON p.holding_no = t.holding_no
  WHERE t.cancelled = TRUE
    AND n.assessment_year ~ '^[0-9]{4}-[0-9]{4}$'
    AND p.tax_paid_till_year = n.assessment_year
    AND NOT EXISTS (
      SELECT 1 FROM transactions t2
      WHERE t2.holding_no = t.holding_no AND t2.cancelled = FALSE AND t2.txn_date >= t.txn_date
    )
    AND NOT EXISTS (
      SELECT 1 FROM demand_notices n2
      WHERE n2.holding_no = t.holding_no AND n2.demand_no <> n.demand_no
        AND n2.settled = TRUE AND n2.cancelled = FALSE
        AND n2.assessment_year ~ '^[0-9]{4}-[0-9]{4}$'
        AND CAST(LEFT(n2.assessment_year, 4) AS INTEGER) >= CAST(LEFT(n.assessment_year, 4) AS INTEGER)
    )
  ORDER BY t.holding_no, t.txn_date DESC
),
resolved AS (
  SELECT
    holding_no,
    assessment_year,
    COALESCE(
      snapshot,
      (
        SELECT CAST(first_year - 1 AS TEXT) || '-' || CAST(first_year AS TEXT)
        FROM (
          SELECT LEAST(
            notice_start,
            COALESCE(
              (SELECT MIN(CAST(LEFT(s->>'period', 4) AS INTEGER))
               FROM jsonb_array_elements(CASE WHEN jsonb_typeof(arrear_stages_paid) = 'array' THEN arrear_stages_paid ELSE '[]'::jsonb END) s
               WHERE (s->>'period') ~ '^[0-9]{4}'),
              CASE WHEN arrear_periods_paid ~ '^[0-9]{4}' THEN CAST(LEFT(arrear_periods_paid, 4) AS INTEGER) END,
              notice_start
            )
          ) AS first_year
        ) f
      )
    ) AS restore_to
  FROM latest_cancelled
)
UPDATE properties p
SET tax_paid_till_year = r.restore_to
FROM resolved r
WHERE p.holding_no = r.holding_no
  AND p.tax_paid_till_year = r.assessment_year
  AND r.restore_to IS NOT NULL;
