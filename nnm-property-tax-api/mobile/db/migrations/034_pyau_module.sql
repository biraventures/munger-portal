-- Submersible Pyau maintenance module - purely internal (no public
-- reporting channel, unlike street lights), no repair deadline/SLA
-- (unlike street lights' 72-hour rule) - just an issue-to-repair log.
-- Dedicated roles (pyau_je/pyau_ae/pyau_contractor), kept separate
-- from the street light module's JE/AE/contractor roles even though
-- the pattern is similar, since these are explicitly different
-- people/logins per what was asked for.

ALTER TABLE attendance_users DROP CONSTRAINT attendance_users_role_check;
ALTER TABLE attendance_users ADD CONSTRAINT attendance_users_role_check
  CHECK (role IN (
    'jamadar', 'driver_supervisor', 'sanitation_officer', 'sanitation_prabhari', 'attendance_admin',
    'junior_engineer', 'assistant_engineer_mechanical', 'maintenance_nodal_clerk',
    'streetlight_contractor', 'streetlight_je', 'streetlight_ae', 'streetlight_nodal_clerk',
    'city_manager', 'deputy_municipal_commissioner', 'municipal_commissioner',
    'pyau_je', 'pyau_ae', 'pyau_contractor'
  ));

-- ---------------------------------------------------------------------
-- Pyau registry (~500 submersible hand pumps/water points).
-- ---------------------------------------------------------------------
CREATE TABLE pyaus (
  id                  BIGSERIAL PRIMARY KEY,
  ward_id             BIGINT NOT NULL REFERENCES attendance_wards(id),
  scheme_name         VARCHAR(255),
  has_overhead_tank   BOOLEAN NOT NULL DEFAULT FALSE,
  houses_served       INTEGER,
  structure_type      VARCHAR(16) CHECK (structure_type IN ('room', 'iron_stand')),
  functional_status   VARCHAR(16) NOT NULL DEFAULT 'functional' CHECK (functional_status IN ('functional', 'non_functional')),
  pump_details        VARCHAR(255),
  boring_depth_feet   NUMERIC(8,2),
  casing_details      VARCHAR(255),
  -- Drives the 2-year builder-warranty rule: while installed_date +
  -- 2 years is in the future, the BUILDER (not one of the 3
  -- maintenance contractors) is responsible - see
  -- pyauIssue.service.ts's isUnderBuilderWarranty(). Nullable since
  -- older/pre-existing pyaus in the initial registry import may not
  -- have a known installation date.
  installed_date      DATE,
  builder_name         VARCHAR(255),
  builder_contact       VARCHAR(20),
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pyaus_ward ON pyaus (ward_id);

-- ---------------------------------------------------------------------
-- Which of the 3 contractors covers each ward - 45 wards split into 3
-- fixed groups, same one-contractor-per-ward pattern as the street
-- light module's contractor_wards (kept as a separate table since
-- these are different contractors entirely).
-- ---------------------------------------------------------------------
CREATE TABLE pyau_contractor_wards (
  ward_id         BIGINT PRIMARY KEY REFERENCES attendance_wards(id),
  contractor_id   BIGINT NOT NULL REFERENCES attendance_users(id)
);

-- ---------------------------------------------------------------------
-- Issue/repair log - "any issue will be marked by JE or AE", and the
-- maintenance log itself (date of issue, date of repair, brief on
-- repair, amount spent) needs to be clearly visible per pyau. No
-- deadline/penalty fields, unlike light_faults - purely a log.
-- ---------------------------------------------------------------------
CREATE TABLE pyau_issues (
  id                      BIGSERIAL PRIMARY KEY,
  pyau_id                 BIGINT NOT NULL REFERENCES pyaus(id),
  date_of_issue           DATE NOT NULL,
  reported_by_user_id     BIGINT NOT NULL REFERENCES attendance_users(id),
  issue_notes             TEXT,
  status                  VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'repaired')),
  date_of_repair          DATE,
  repair_brief            TEXT,
  amount_spent            NUMERIC(10,2),
  repaired_by_user_id     BIGINT REFERENCES attendance_users(id),
  -- The contractor responsible at the time the issue was logged, same
  -- reasoning as light_faults.assigned_contractor_id - a later change
  -- to ward assignment shouldn't retroactively change who was
  -- accountable for an already-open issue. NULL while the pyau is
  -- under builder warranty (see pyaus.installed_date) - the builder
  -- is tracked as plain text on the pyau record, not a login.
  assigned_contractor_id  BIGINT REFERENCES attendance_users(id)
);
CREATE INDEX idx_pyau_issues_pyau ON pyau_issues (pyau_id);
CREATE INDEX idx_pyau_issues_status ON pyau_issues (status);
