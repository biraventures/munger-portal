-- Old (offline) holdings records - the MIG stage (migRecord.service.ts).
--
-- The old-holdings sheet no longer creates holdings directly. Every row is kept here - none is rejected - with the
-- problems found in it. The Municipal Commissioner sees every uploaded record and approves it (after correcting a
-- blocking problem: no owner name / no valid ward); approval gives it its MIG- number, and only then is it seen by
-- field staff. When a Tax Collector / Tax Surveyor / Tax Daroga / the Commissioner adds the full details, the record
-- becomes the holding MUNG-MIG-<same number> and goes through the approval chain; final approval gives it its MNN-
-- number as before.

-- One counter for MIG- and MUNG-MIG- numbers, so a MIG- number never collides with a MUNG-MIG- holding made another
-- way. It starts above the highest MUNG-MIG- number already used.
CREATE SEQUENCE IF NOT EXISTS migrated_holding_no_seq;
DO $$
DECLARE m BIGINT;
BEGIN
  SELECT COALESCE(max(substring(holding_no FROM '^MUNG-MIG-(\d+)$')::bigint), 0) INTO m FROM properties WHERE holding_no ~ '^MUNG-MIG-\d+$';
  IF m > 0 AND m >= (SELECT last_value FROM migrated_holding_no_seq) THEN
    PERFORM setval('migrated_holding_no_seq', m, true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS mig_records (
  id                     BIGSERIAL PRIMARY KEY,
  -- Given on the Commissioner's approval, from migrated_holding_no_seq.
  mig_number             BIGINT UNIQUE,
  -- The row as uploaded - a re-upload of the same sheet finds the same record instead of adding it again.
  import_key             TEXT NOT NULL UNIQUE,
  ward                   TEXT,
  old_holding_no         TEXT,
  old_pid                TEXT,
  owner_name             TEXT,
  relation               TEXT,
  relative_name          TEXT,
  arv_pre_1996           NUMERIC(14, 2),
  arv_1997_2010          NUMERIC(14, 2),
  arv_2011_2020          NUMERIC(14, 2),
  arv_1997_2000          NUMERIC(14, 2),
  arv_2000_2011          NUMERIC(14, 2),
  arv_2011_2017          NUMERIC(14, 2),
  arv_2017_2021          NUMERIC(14, 2),
  arv_2021_on            NUMERIC(14, 2),
  holding_creation_year  TEXT,
  last_payment_year      TEXT,
  tax_status             TEXT,
  remarks                TEXT,
  -- The sheet's "Needs Review" note, if any.
  needs_review           TEXT,
  -- Problems found in the row: [{text, blocking}] - a blocking one must be corrected before approval.
  issues                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- pending (uploaded, awaiting approval) -> approved (MIG-) -> taken_up (MUNG-MIG- holding made) -> finalized (MNN-);
  -- or set_aside by the Commissioner (e.g. a duplicate) - still listed, never deleted.
  status                 VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'taken_up', 'finalized', 'set_aside')),
  holding_no             TEXT,
  file_name              TEXT,
  row_no                 INTEGER,
  upload_job_id          BIGINT,
  uploaded_by            TEXT,
  uploaded_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by            TEXT,
  approved_at            TIMESTAMPTZ,
  taken_up_by            TEXT,
  taken_up_at            TIMESTAMPTZ,
  set_aside_reason       TEXT,
  -- [{at, action, by, note}]
  events                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT mig_number_when_approved CHECK (status IN ('pending', 'set_aside') OR mig_number IS NOT NULL OR holding_no IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_mig_records_status_ward ON mig_records (status, ward);
CREATE INDEX IF NOT EXISTS idx_mig_records_holding ON mig_records (holding_no);
CREATE INDEX IF NOT EXISTS idx_mig_records_pid ON mig_records (upper(btrim(old_pid)));

-- The upload job's result now counts records, not holdings.
ALTER TABLE migrated_upload_jobs ADD COLUMN IF NOT EXISTS kind VARCHAR(12) NOT NULL DEFAULT 'holdings';
