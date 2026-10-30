-- A holding that has already paid for the current year must never be billed or charged for it again.
--
-- 1. Year columns are compared as 'YYYY-YYYY' text (e.g. tax_paid_till_year < assessment_year). Values imported in
--    other shapes ('2025-26', '2025/26', '2025 - 2026') broke those comparisons and the paid-till year was read as
--    "never paid", so notices were raised again. They are normalised here and on every later write.
-- 2. properties.assessment_year (the year a demand notice charges as "current") was only set when a holding was saved,
--    so it stayed on an old year after 1 April. It now never lags the real financial year (Indian time, April-March):
--    rolled forward here, by the trigger on every write, and at the start of every monthly demand refresh.
-- 3. Unpaid notices raised for an earlier financial year are stale (they charge the wrong year) and are superseded.
-- 4. tax_paid_till_year is brought up to the year actually paid by a settled notice whose receipt is still valid, in
--    case it was ever left behind (e.g. by an import). Every change is logged in paid_till_repair_log.

CREATE OR REPLACE FUNCTION normalize_fy_label(v TEXT) RETURNS TEXT AS $$
DECLARE
  m TEXT[];
BEGIN
  IF v IS NULL OR btrim(v) = '' THEN
    RETURN NULL;
  END IF;
  m := regexp_match(btrim(v), '^(\d{4})\s*[-/–]\s*(\d{2}|\d{4})$');
  IF m IS NULL THEN
    RETURN btrim(v);
  END IF;
  RETURN m[1] || '-' || (m[1]::int + 1)::text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Current financial year, Indian time: 'YYYY-YYYY' starting 1 April.
CREATE OR REPLACE FUNCTION current_fy_label() RETURNS TEXT AS $$
  SELECT y::text || '-' || (y + 1)::text
    FROM (SELECT EXTRACT(YEAR FROM ((now() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '3 months'))::int AS y) t
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION trg_property_year_columns() RETURNS TRIGGER AS $$
BEGIN
  NEW.assessment_year := normalize_fy_label(NEW.assessment_year);
  NEW.tax_paid_till_year := normalize_fy_label(NEW.tax_paid_till_year);
  NEW.solid_waste_paid_till_year := normalize_fy_label(NEW.solid_waste_paid_till_year);
  NEW.holding_creation_year := normalize_fy_label(NEW.holding_creation_year);
  IF NEW.assessment_year IS NULL OR NEW.assessment_year < current_fy_label() THEN
    NEW.assessment_year := current_fy_label();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS properties_year_columns ON properties;
CREATE TRIGGER properties_year_columns
  BEFORE INSERT OR UPDATE OF assessment_year, tax_paid_till_year, solid_waste_paid_till_year, holding_creation_year ON properties
  FOR EACH ROW EXECUTE FUNCTION trg_property_year_columns();

-- 1 + 2 (the trigger does both)
UPDATE properties
   SET assessment_year = assessment_year
 WHERE assessment_year IS DISTINCT FROM normalize_fy_label(assessment_year)
    OR assessment_year < current_fy_label()
    OR tax_paid_till_year IS DISTINCT FROM normalize_fy_label(tax_paid_till_year)
    OR solid_waste_paid_till_year IS DISTINCT FROM normalize_fy_label(solid_waste_paid_till_year)
    OR holding_creation_year IS DISTINCT FROM normalize_fy_label(holding_creation_year);

UPDATE demand_notices SET assessment_year = normalize_fy_label(assessment_year)
 WHERE assessment_year IS DISTINCT FROM normalize_fy_label(assessment_year);
UPDATE demand_notices SET paid_through_year = normalize_fy_label(paid_through_year)
 WHERE paid_through_year IS DISTINCT FROM normalize_fy_label(paid_through_year);

-- 3
UPDATE demand_notices
   SET superseded = TRUE
 WHERE NOT settled AND NOT cancelled AND NOT superseded AND NOT on_hold
   AND assessment_year IS NOT NULL AND assessment_year < current_fy_label();

-- 4
CREATE TABLE IF NOT EXISTS paid_till_repair_log (
  id            BIGSERIAL PRIMARY KEY,
  holding_no    VARCHAR(32) NOT NULL,
  previous_year VARCHAR(9),
  new_year      VARCHAR(9) NOT NULL,
  demand_no     VARCHAR(32),
  receipt_no    VARCHAR(32),
  repaired_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

WITH paid AS (
  SELECT DISTINCT ON (n.holding_no)
         n.holding_no, n.demand_no, n.settled_receipt_no,
         CASE WHEN n.part_payment AND n.paid_through_year IS NOT NULL THEN n.paid_through_year ELSE n.assessment_year END AS paid_year
    FROM demand_notices n
    JOIN transactions t ON t.receipt_no = n.settled_receipt_no
   WHERE n.settled AND NOT n.cancelled AND NOT COALESCE(t.cancelled, FALSE) AND t.status = 'success'
     AND (CASE WHEN n.part_payment AND n.paid_through_year IS NOT NULL THEN n.paid_through_year ELSE n.assessment_year END) ~ '^\d{4}-\d{4}$'
   ORDER BY n.holding_no, (CASE WHEN n.part_payment AND n.paid_through_year IS NOT NULL THEN n.paid_through_year ELSE n.assessment_year END) DESC
), fix AS (
  SELECT p.holding_no, p.tax_paid_till_year AS previous_year, paid.paid_year, paid.demand_no, paid.settled_receipt_no
    FROM properties p JOIN paid ON paid.holding_no = p.holding_no
   WHERE p.tax_paid_till_year IS NULL OR p.tax_paid_till_year < paid.paid_year
), logged AS (
  INSERT INTO paid_till_repair_log (holding_no, previous_year, new_year, demand_no, receipt_no)
  SELECT holding_no, previous_year, paid_year, demand_no, settled_receipt_no FROM fix
  RETURNING holding_no, new_year
)
UPDATE properties p SET tax_paid_till_year = logged.new_year FROM logged WHERE logged.holding_no = p.holding_no;
