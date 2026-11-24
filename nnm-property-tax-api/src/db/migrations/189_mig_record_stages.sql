-- Old records (MIG): approval of uploaded rows in steps - the Operator verifies, the Tax Daroga reviews and forwards,
-- the City Manager approves (the MIG- number is given then). Records awaiting approval carry the step they are at.
ALTER TABLE mig_records ADD COLUMN IF NOT EXISTS stage VARCHAR(16) NOT NULL DEFAULT 'operator';
DO $$ BEGIN
  ALTER TABLE mig_records ADD CONSTRAINT mig_records_stage CHECK (stage IN ('operator', 'tax_daroga', 'city_manager'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- The last send-back note, shown to the step it went back to.
ALTER TABLE mig_records ADD COLUMN IF NOT EXISTS sent_back_note TEXT;
CREATE INDEX IF NOT EXISTS idx_mig_records_stage ON mig_records (stage) WHERE status = 'pending';
