-- Adds the tax_surveyor role - a dedicated login for the person who
-- physically walks a migrated holding and submits the survey
-- themselves, replacing the earlier design where the Tax Daroga just
-- typed the surveyor's name/ID as free text and any operator entered
-- the details on their behalf.
ALTER TABLE admins DROP CONSTRAINT admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('tax_daroga', 'tax_surveyor', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner', 'stall_prabhari', 'city_manager', 'trade_license_nodal', 'assistant_town_planning_supervisor', 'assistant_architect'));

-- The Tax Daroga now assigns the holding to one specific tax_surveyor
-- account (rather than just recording a name/ID as free text) - that
-- surveyor logs in themselves and submits the entered details, which
-- then land in the existing operator_entered_by/operator_entered_at
-- columns (renamed in meaning, not in schema, since a tax_surveyor
-- submission is functionally the same kind of event an operator's
-- was). A submission the Tax Daroga finds wrong can be reverted -
-- back to the same or a different surveyor - which clears the
-- surveyor-assignment/submission columns and bumps revision_count,
-- with the full before/after captured in
-- migrated_holding_survey_events below rather than being overwritten
-- and lost.
ALTER TABLE migrated_holding_surveys ADD COLUMN assigned_to_tax_surveyor_username VARCHAR(100);
ALTER TABLE migrated_holding_surveys ADD COLUMN assigned_to_tax_surveyor_display_name VARCHAR(200);
ALTER TABLE migrated_holding_surveys ADD COLUMN assigned_to_tax_surveyor_at TIMESTAMPTZ;
ALTER TABLE migrated_holding_surveys ADD COLUMN revision_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE migrated_holding_surveys DROP CONSTRAINT migrated_holding_surveys_status_check;
ALTER TABLE migrated_holding_surveys ADD CONSTRAINT migrated_holding_surveys_status_check
  CHECK (status IN (
    'pending_assignment', 'assigned_to_surveyor', 'assigned_to_tax_surveyor', 'forwarded_to_operator',
    'pending_verification', 'verified_by_tax_daroga', 'finalized'
  ));

-- A complete, append-only event log for every migrated-holding
-- survey - one row per state transition (created, assigned to Tax
-- Daroga, assigned to a surveyor, submitted, reverted, verified,
-- finalized). This is the "complete data trail" a Commissioner can
-- export: unlike the single mutable status row on
-- migrated_holding_surveys, nothing here is ever overwritten, so a
-- revert doesn't erase what the first surveyor actually submitted.
CREATE TABLE migrated_holding_survey_events (
  id                BIGSERIAL PRIMARY KEY,
  holding_no        VARCHAR(32) NOT NULL REFERENCES properties(holding_no),
  event_type        VARCHAR(40) NOT NULL,
  actor_username    VARCHAR(100),
  actor_display_name VARCHAR(200),
  actor_role        VARCHAR(30),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_migrated_holding_survey_events_holding ON migrated_holding_survey_events (holding_no, created_at);
