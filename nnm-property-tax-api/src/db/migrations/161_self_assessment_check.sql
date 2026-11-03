-- New holding field report: the Tax Surveyor confirms whether every detail in the applicant's self-assessment form is
-- correct, photographs its 4 pages, and takes exactly 2 photos of the holding with its owner.
ALTER TABLE field_reports ADD COLUMN IF NOT EXISTS self_assessment_correct BOOLEAN;
ALTER TABLE field_report_photos ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'site';
ALTER TABLE field_report_photos ADD COLUMN IF NOT EXISTS page_no SMALLINT;
DO $$ BEGIN
  ALTER TABLE field_report_photos ADD CONSTRAINT field_report_photos_kind_check CHECK (kind IN ('site', 'holding_owner', 'sa_form'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
