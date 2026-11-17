-- Revert for pre-2011 ARV entries (pre2011Arv.service.ts). An entry waiting for approval can be reverted to the Tax
-- Daroga for correction by the City Manager, DMC or Municipal Commissioner; an approved entry can be reverted by the
-- DMC or Municipal Commissioner - the ARV rows it added to the holding's tax history are removed and the Tax Daroga
-- enters it again. Logged in the unified revert audit trail.
ALTER TABLE pre2011_arv_entries DROP CONSTRAINT pre2011_arv_entries_status_check;
ALTER TABLE pre2011_arv_entries ADD CONSTRAINT pre2011_arv_entries_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'reverted'));

ALTER TABLE pre2011_arv_entries
  ADD COLUMN IF NOT EXISTS stage_ids BIGINT[],
  ADD COLUMN IF NOT EXISTS reverted_from VARCHAR(16),
  ADD COLUMN IF NOT EXISTS reverted_by_username VARCHAR(64),
  ADD COLUMN IF NOT EXISTS reverted_by_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS reverted_by_role VARCHAR(64),
  ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revert_comment TEXT;
ALTER TABLE pre2011_arv_entries DROP CONSTRAINT IF EXISTS pre2011_arv_revert_comment;
ALTER TABLE pre2011_arv_entries ADD CONSTRAINT pre2011_arv_revert_comment CHECK (status <> 'reverted' OR revert_comment IS NOT NULL);

-- The tax history rows each approved entry added (from now on recorded at approval). For entries approved before
-- this, they are found by holding, the "(register ARV)" marker and the approval time.
UPDATE pre2011_arv_entries e
   SET stage_ids = (SELECT array_agg(s.id ORDER BY s.start_year_used)
                      FROM tax_history_stages s
                     WHERE s.holding_no = e.holding_no AND s.auto_generated = FALSE AND s.override_reason IS NULL
                       AND s.added_by LIKE '%(register ARV)%'
                       AND s.added_date BETWEEN e.decided_at - interval '2 minutes' AND e.decided_at + interval '2 minutes')
 WHERE e.status = 'approved' AND e.stage_ids IS NULL;

ALTER TABLE entry_revert_events DROP CONSTRAINT entry_revert_events_entry_type_check;
ALTER TABLE entry_revert_events ADD CONSTRAINT entry_revert_events_entry_type_check
  CHECK (entry_type IN ('property_mutation', 'shop_agreement', 'property_discrepancy', 'pre2011_arv'));
