-- Tracks the full survey lifecycle for a holding bulk-imported from
-- old paper/register records under the MUNG-MIG- holding number
-- series (see MIGRATED_HOLDING_NO_PREFIX in constants/taxRates.ts).
-- One row per such holding, moving through:
--
--   pending_assignment    -- just created by bulk import
--   assigned_to_surveyor  -- Deputy Commissioner (odd wards) or City
--                            Manager (even wards) has assigned it to
--                            a specific Tax Daroga
--   forwarded_to_operator -- that Tax Daroga has recorded the
--                            surveyor's name/ID number and survey
--                            date, and forwarded it on
--   pending_verification  -- an operator has entered the real,
--                            floor-wise surveyed details
--   verified_by_tax_daroga -- the assigning Tax Daroga has checked
--                            the entered details
--   finalized              -- the same Deputy Commissioner/City
--                            Manager who made the assignment (ward
--                            parity keeps this consistent throughout)
--                            has given final verification; the
--                            holding's area/floors are now final
--
-- Unlike the existing survey_status columns on properties (used for
-- the simpler, one-off "partially-known" operator-entry flow), this
-- is a dedicated table because this workflow has materially more
-- state: who assigned it and to whom, and a two-person verification
-- step split by ward parity.
CREATE TABLE migrated_holding_surveys (
  id                          BIGSERIAL PRIMARY KEY,
  holding_no                  VARCHAR(32) NOT NULL UNIQUE REFERENCES properties(holding_no),
  ward                        VARCHAR(16),
  status                      VARCHAR(30) NOT NULL DEFAULT 'pending_assignment' CHECK (status IN (
                                 'pending_assignment', 'assigned_to_surveyor', 'forwarded_to_operator',
                                 'pending_verification', 'verified_by_tax_daroga', 'finalized'
                               )),

  -- Reference-only figures carried over from the old paper/register
  -- record (see the data-cleaning pass on the source spreadsheet).
  -- Never used in any live tax calculation - purely informational
  -- until the holding is surveyed and its real area/floors are
  -- entered through the normal flow.
  old_arv_pre_1996             NUMERIC(14,2),
  old_arv_1997_2010            NUMERIC(14,2),
  old_arv_2011_2020            NUMERIC(14,2),
  old_last_payment_year        VARCHAR(9),
  old_tax_status                VARCHAR(32),
  old_remarks                  TEXT,

  assigned_by_username         VARCHAR(100),
  assigned_by_display_name     VARCHAR(200),
  assigned_by_role             VARCHAR(30) CHECK (assigned_by_role IS NULL OR assigned_by_role IN ('deputy_commissioner', 'city_manager')),
  assigned_to_tax_daroga_username     VARCHAR(100),
  assigned_to_tax_daroga_display_name VARCHAR(200),
  assigned_at                  TIMESTAMPTZ,

  surveyor_name                VARCHAR(255),
  surveyor_id_number            VARCHAR(64),
  survey_date                  DATE,
  surveyor_recorded_at         TIMESTAMPTZ,

  operator_entered_by          VARCHAR(200),
  operator_entered_at          TIMESTAMPTZ,

  tax_daroga_verified_by       VARCHAR(200),
  tax_daroga_verified_at       TIMESTAMPTZ,

  final_verified_by_username   VARCHAR(100),
  final_verified_by_display_name VARCHAR(200),
  final_verified_by_role       VARCHAR(30) CHECK (final_verified_by_role IS NULL OR final_verified_by_role IN ('deputy_commissioner', 'city_manager')),
  final_verified_at            TIMESTAMPTZ,

  created_by                   VARCHAR(64) NOT NULL,
  created_date                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_migrated_holding_surveys_status ON migrated_holding_surveys (status);
CREATE INDEX idx_migrated_holding_surveys_ward ON migrated_holding_surveys (ward);
CREATE INDEX idx_migrated_holding_surveys_tax_daroga ON migrated_holding_surveys (assigned_to_tax_daroga_username);
