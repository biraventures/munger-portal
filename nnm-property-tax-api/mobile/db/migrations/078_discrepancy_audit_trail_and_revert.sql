-- Extends the property discrepancy workflow (migration 076) with:
--  1. GPS coordinates + a photo of the holding, captured once at the
--     Tax Collector's submission.
--  2. A "reverted" status, so any stage can send the request back to
--     the Tax Collector for correction instead of only approving or
--     rejecting - mirrors property_change_requests' revert-to-operator
--     mechanism (migration 062) and feeds the same unified
--     entry_revert_events audit table.
--  3. A full audit trail: property_discrepancy_approvals now also
--     records the Tax Collector's own initial submission (stage
--     'tax_collector', decision 'submitted') and a data_snapshot on
--     every row, so exactly what was forwarded at each step - Tax
--     Collector, Tax Surveyor, Tax Daroga, City Manager, DMC - is
--     preserved even when a later stage edits the proposed data
--     before passing it on.

ALTER TABLE property_discrepancy_requests ADD COLUMN gps_lat NUMERIC(10,6);
ALTER TABLE property_discrepancy_requests ADD COLUMN gps_lng NUMERIC(10,6);
ALTER TABLE property_discrepancy_requests ADD COLUMN photo_path VARCHAR(500);

ALTER TABLE property_discrepancy_requests DROP CONSTRAINT property_discrepancy_requests_status_check;
ALTER TABLE property_discrepancy_requests ADD CONSTRAINT property_discrepancy_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'reverted'));

-- Latest-revert fields for quick display on the request itself (same
-- dual approach as property_change_requests: this holds the most
-- recent revert, entry_revert_events holds the full history since a
-- request can be reverted and resubmitted more than once).
ALTER TABLE property_discrepancy_requests ADD COLUMN reverted_by VARCHAR(255);
ALTER TABLE property_discrepancy_requests ADD COLUMN reverted_by_role VARCHAR(32);
ALTER TABLE property_discrepancy_requests ADD COLUMN reverted_from_stage VARCHAR(32);
ALTER TABLE property_discrepancy_requests ADD COLUMN reverted_at TIMESTAMPTZ;
ALTER TABLE property_discrepancy_requests ADD COLUMN revert_comment TEXT;

-- The approval log now also records the Tax Collector's own initial
-- submission, so the full chain (collector -> surveyor -> daroga ->
-- city manager -> DMC) lives in one table.
ALTER TABLE property_discrepancy_approvals DROP CONSTRAINT property_discrepancy_approvals_stage_check;
ALTER TABLE property_discrepancy_approvals ADD CONSTRAINT property_discrepancy_approvals_stage_check
  CHECK (stage IN ('tax_collector', 'tax_surveyor', 'tax_daroga', 'city_manager', 'deputy_commissioner'));

-- Widened from VARCHAR(16): 'edited_and_forwarded' (21 chars) doesn't fit 16.
ALTER TABLE property_discrepancy_approvals ALTER COLUMN decision TYPE VARCHAR(24);
ALTER TABLE property_discrepancy_approvals DROP CONSTRAINT property_discrepancy_approvals_decision_check;
ALTER TABLE property_discrepancy_approvals ADD CONSTRAINT property_discrepancy_approvals_decision_check
  CHECK (decision IN ('submitted', 'approved', 'edited_and_forwarded', 'rejected', 'reverted'));

-- What was actually forwarded at this step - the proposed property
-- data as it stood when this stage acted (identical to the previous
-- stage's snapshot unless this stage edited it first).
ALTER TABLE property_discrepancy_approvals ADD COLUMN data_snapshot JSONB;

-- Extend the unified revert-audit table (migration 062) to also cover
-- this workflow, same as property_mutation and shop_agreement.
ALTER TABLE entry_revert_events DROP CONSTRAINT entry_revert_events_entry_type_check;
ALTER TABLE entry_revert_events ADD CONSTRAINT entry_revert_events_entry_type_check
  CHECK (entry_type IN ('property_mutation', 'shop_agreement', 'property_discrepancy'));
