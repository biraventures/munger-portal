-- Old (MUNG-MIG-) holdings entered by the Tax Collector (the "Old Holdings Survey" page) go through the property
-- discrepancy chain - Tax Surveyor of the ward, Tax Daroga, City Manager, Deputy Commissioner - and then the Municipal
-- Commissioner, whose approval applies the entries and moves the holding to its MNN- number. Other discrepancy reports
-- still end with the Deputy Commissioner.
ALTER TABLE property_discrepancy_requests DROP CONSTRAINT IF EXISTS property_discrepancy_requests_current_stage_check;
ALTER TABLE property_discrepancy_requests ADD CONSTRAINT property_discrepancy_requests_current_stage_check
  CHECK (current_stage IN ('tax_surveyor', 'tax_daroga', 'city_manager', 'deputy_commissioner', 'commissioner'));
ALTER TABLE property_discrepancy_approvals DROP CONSTRAINT IF EXISTS property_discrepancy_approvals_stage_check;
ALTER TABLE property_discrepancy_approvals ADD CONSTRAINT property_discrepancy_approvals_stage_check
  CHECK (stage IN ('tax_collector', 'tax_surveyor', 'tax_daroga', 'city_manager', 'deputy_commissioner', 'commissioner'));
ALTER TABLE migrated_holding_surveys DROP CONSTRAINT IF EXISTS migrated_holding_surveys_final_verified_by_role_check;
ALTER TABLE migrated_holding_surveys ADD CONSTRAINT migrated_holding_surveys_final_verified_by_role_check
  CHECK (final_verified_by_role IS NULL OR final_verified_by_role IN ('deputy_commissioner', 'city_manager', 'commissioner'));

-- Repair: an old-holdings upload that failed part-way on a row (Excel dates in Last Payment Year, before migration 183)
-- created the holding but not its survey record, so it was missing from the survey worklists and could not be
-- finalized. Give every such MUNG-MIG- holding its record back; uploading the sheet again fills in the old figures.
INSERT INTO migrated_holding_surveys (holding_no, ward, created_by)
SELECT p.holding_no, p.ward, 'System repair (migration 184)'
  FROM properties p
 WHERE p.holding_no LIKE 'MUNG-MIG-%'
   AND NOT EXISTS (SELECT 1 FROM migrated_holding_surveys s WHERE s.holding_no = p.holding_no);
INSERT INTO migrated_holding_survey_events (holding_no, event_type, actor_display_name, notes)
SELECT s.holding_no, 'created', s.created_by, 'Survey record restored - the holding was created by an upload that failed part-way on this row.'
  FROM migrated_holding_surveys s
 WHERE s.created_by = 'System repair (migration 184)'
   AND NOT EXISTS (SELECT 1 FROM migrated_holding_survey_events e WHERE e.holding_no = s.holding_no);

-- The old record a holding came from, as it was in the sheet (ward, owner, old holding no., old PID, relative). A
-- re-upload recognises the holding by this even after a survey corrected the owner's name or it moved to an MNN-
-- number - otherwise it would be created a second time.
CREATE OR REPLACE FUNCTION migrated_import_key(ward TEXT, owner TEXT, old_holding TEXT, old_pid TEXT, relative TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT concat_ws('|', upper(btrim(COALESCE(ward, ''))), upper(btrim(COALESCE(owner, ''))), upper(btrim(COALESCE(old_holding, ''))),
                   upper(btrim(COALESCE(old_pid, ''))), upper(btrim(COALESCE(relative, ''))))
$$;
ALTER TABLE migrated_holding_surveys ADD COLUMN IF NOT EXISTS import_key TEXT;
-- From the holding as the upload created it (its first history entry), which a later survey has not touched ...
UPDATE migrated_holding_surveys s
   SET import_key = migrated_import_key(normalize_ward(h.snapshot->'property'->>'ward'), h.snapshot->'property'->>'ownerName',
                                        h.snapshot->'property'->>'oldHoldingNo', h.snapshot->'property'->>'oldPid',
                                        h.snapshot->'property'->>'relationName')
  FROM property_history h
 WHERE h.holding_no = s.holding_no AND h.action = 'Created' AND s.import_key IS NULL
   AND h.version = (SELECT min(version) FROM property_history x WHERE x.holding_no = s.holding_no);
-- ... else, for a holding not surveyed yet, from its current details (still the uploaded ones).
UPDATE migrated_holding_surveys s
   SET import_key = migrated_import_key(normalize_ward(p.ward), p.owner_name, p.old_holding_no, p.old_pid, p.relation_name)
  FROM properties p
 WHERE p.holding_no = s.holding_no AND s.import_key IS NULL AND s.status <> 'finalized';
CREATE INDEX IF NOT EXISTS idx_migrated_holding_surveys_import_key ON migrated_holding_surveys (import_key);
