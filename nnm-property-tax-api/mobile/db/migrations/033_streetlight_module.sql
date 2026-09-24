-- Street Light Monitoring module. New roles reuse the attendance_users
-- login system (same pattern as the fleet management roles) rather
-- than a separate auth system, but are given distinct role names
-- (streetlight_je, streetlight_ae, not the existing fleet
-- junior_engineer/assistant_engineer_mechanical) so streetlight staff
-- don't incidentally get fleet-module access or vice versa - these
-- are different departments/people even though the login mechanism
-- is shared infrastructure.
--
-- Design choices worth noting:
-- - One "lights" table with a light_type discriminator ('streetlight'
--   / 'high_mast') rather than two separate tables - the fields
--   (ward, locality, serial, GPS, agency) are identical, so this
--   avoids duplicating schema/logic while still letting the UI
--   present them as two separate lists by filtering on light_type.
-- - Each contractor covers a FIXED SET of wards (not tied to which
--   agency installed a given light) - contractor_wards is the
--   many-to-many mapping that determines fault assignment.
-- - Penalty accrual is stored as explicit daily rows
--   (light_fault_penalties), not computed on the fly - this makes the
--   penalty history auditable (who owed what, for which day, and
--   why) rather than a number that could silently change if the
--   calculation logic changes later.

ALTER TABLE attendance_users DROP CONSTRAINT attendance_users_role_check;
ALTER TABLE attendance_users ADD CONSTRAINT attendance_users_role_check
  CHECK (role IN (
    'jamadar', 'driver_supervisor', 'sanitation_officer', 'sanitation_prabhari', 'attendance_admin',
    'junior_engineer', 'assistant_engineer_mechanical', 'maintenance_nodal_clerk',
    'streetlight_contractor', 'streetlight_je', 'streetlight_ae', 'streetlight_nodal_clerk',
    'city_manager', 'deputy_municipal_commissioner', 'municipal_commissioner'
  ));

-- ---------------------------------------------------------------------
-- Installation agencies - municipal_commissioner manages this list.
-- ---------------------------------------------------------------------
CREATE TABLE installation_agencies (
  id            BIGSERIAL PRIMARY KEY,
  agency_name   VARCHAR(255) UNIQUE NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Lights registry (streetlights and high-mast lights together).
-- ---------------------------------------------------------------------
CREATE TABLE lights (
  id                      BIGSERIAL PRIMARY KEY,
  light_type              VARCHAR(16) NOT NULL CHECK (light_type IN ('streetlight', 'high_mast')),
  ward_id                 BIGINT NOT NULL REFERENCES attendance_wards(id),
  locality_name           VARCHAR(255) NOT NULL,
  serial_number           VARCHAR(64) UNIQUE NOT NULL,
  latitude                NUMERIC(10,6) NOT NULL,
  longitude               NUMERIC(10,6) NOT NULL,
  installation_agency_id  BIGINT REFERENCES installation_agencies(id),
  active                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lights_ward ON lights (ward_id);

-- ---------------------------------------------------------------------
-- Which wards each contractor covers - a ward maps to exactly one
-- responsible contractor at a time (PRIMARY KEY on ward_id alone),
-- since "contractor is responsible for a fixed set of wards" implies
-- unambiguous ownership, not overlapping coverage.
-- ---------------------------------------------------------------------
CREATE TABLE contractor_wards (
  ward_id         BIGINT PRIMARY KEY REFERENCES attendance_wards(id),
  contractor_id   BIGINT NOT NULL REFERENCES attendance_users(id)
);

-- ---------------------------------------------------------------------
-- Fault reports - "non-functional" records. Created either by staff
-- (any logged-in attendance_users role) or directly by a public
-- grievance (no login - phone number + GPS only, per what was asked
-- for). deadline_at is stored explicitly (reported_at + 72 hours)
-- rather than computed at query time, so the 72-hour rule can't
-- silently drift if server timezone/logic changes later.
-- ---------------------------------------------------------------------
CREATE TABLE light_faults (
  id                    BIGSERIAL PRIMARY KEY,
  light_id              BIGINT REFERENCES lights(id),
  -- Public grievances may report a light not yet confirmed to exist
  -- in the registry (wrong/no serial visible) - light_id is therefore
  -- nullable, with the GPS coordinates captured directly on the fault
  -- as a fallback so staff can still locate and later link it to a
  -- registry entry.
  reported_gps_lat      NUMERIC(10,6),
  reported_gps_lng      NUMERIC(10,6),
  reported_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline_at           TIMESTAMPTZ NOT NULL,
  reported_by_type      VARCHAR(16) NOT NULL CHECK (reported_by_type IN ('staff', 'public')),
  reported_by_user_id   BIGINT REFERENCES attendance_users(id),
  reporter_phone        VARCHAR(20),
  reporter_notes        TEXT,
  status                VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'repaired')),
  repaired_at           TIMESTAMPTZ,
  repaired_by_user_id   BIGINT REFERENCES attendance_users(id),
  repair_notes          TEXT,
  -- The contractor responsible at the time the fault was logged
  -- (derived from the light's ward via contractor_wards) - stored
  -- directly so a later change to ward assignment doesn't retroactively
  -- change who was accountable for an already-open fault.
  assigned_contractor_id BIGINT REFERENCES attendance_users(id)
);
CREATE INDEX idx_light_faults_status ON light_faults (status);
CREATE INDEX idx_light_faults_light ON light_faults (light_id);

-- ---------------------------------------------------------------------
-- Daily penalty accrual - one row per (fault, day, party). Generated
-- by a daily accrual job/function once a fault is past its 72-hour
-- deadline and still open; see penaltyAccrual.service.ts.
-- ---------------------------------------------------------------------
CREATE TABLE light_fault_penalties (
  id              BIGSERIAL PRIMARY KEY,
  fault_id        BIGINT NOT NULL REFERENCES light_faults(id),
  penalty_date    DATE NOT NULL,
  party_type      VARCHAR(16) NOT NULL CHECK (party_type IN ('contractor', 'city_manager', 'dmc')),
  party_user_id   BIGINT REFERENCES attendance_users(id),
  amount          NUMERIC(10,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fault_id, penalty_date, party_type)
);
CREATE INDEX idx_light_fault_penalties_fault ON light_fault_penalties (fault_id);
