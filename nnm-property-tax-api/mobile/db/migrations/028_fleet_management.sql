-- Fleet management foundation: generalizes "vehicles" into a broader
-- assets registry (vehicles, tricycles, hand carts), adds Assistants
-- as a second field-worker role tied to a specific driver (not just
-- an asset - an assistant is assigned to a driver, and inherits that
-- driver's supervisor automatically, per how this was actually
-- described), adds a driver-supervisor assignment (individual, not
-- ward-based, since a driver supervisor here supervises specific
-- drivers rather than a whole ward), a maintenance history log per
-- asset, and three new attendance_users roles for fleet oversight.
--
-- field_drivers had zero real rows in production at the time of this
-- migration (Master_Drivers was confirmed empty during the original
-- roster import work), so this restructures it directly rather than
-- needing a data migration path.

-- New roles for fleet management oversight, alongside the existing attendance roles.
ALTER TABLE attendance_users DROP CONSTRAINT attendance_users_role_check;
ALTER TABLE attendance_users ADD CONSTRAINT attendance_users_role_check
  CHECK (role IN (
    'jamadar', 'driver_supervisor', 'sanitation_officer', 'sanitation_prabhari', 'attendance_admin',
    'junior_engineer', 'assistant_engineer_mechanical', 'maintenance_nodal_clerk'
  ));

-- ---------------------------------------------------------------------
-- Assets (vehicles, tricycles, hand carts)
-- ---------------------------------------------------------------------
CREATE TABLE assets (
  id                    BIGSERIAL PRIMARY KEY,
  asset_type            VARCHAR(32) NOT NULL CHECK (asset_type IN ('vehicle', 'tricycle', 'hand_cart')),
  label                 VARCHAR(255) NOT NULL,
  vehicle_number        VARCHAR(32),
  chassis_number        VARCHAR(64),
  -- Current-state snapshot - "last serviced on"/"last repaired on" are
  -- derived from asset_maintenance_log (MAX log_date per log_type)
  -- rather than duplicated here, so there's one source of truth.
  current_status        VARCHAR(32) NOT NULL DEFAULT 'working'
                           CHECK (current_status IN ('working', 'under_repair', 'not_working')),
  not_working_since     DATE,
  sound_system_status   VARCHAR(64),
  battery_status        VARCHAR(64),
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Many-to-many: the fixed set of wards each asset regularly serves.
CREATE TABLE asset_wards (
  asset_id  BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  ward_id   BIGINT NOT NULL REFERENCES attendance_wards(id),
  PRIMARY KEY (asset_id, ward_id)
);

-- Full running history of every service/repair/status event per asset.
CREATE TABLE asset_maintenance_log (
  id          BIGSERIAL PRIMARY KEY,
  asset_id    BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  log_type    VARCHAR(32) NOT NULL CHECK (log_type IN ('service', 'repair', 'status_update', 'note')),
  log_date    DATE NOT NULL,
  notes       TEXT,
  logged_by   VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_asset_maintenance_log_asset ON asset_maintenance_log (asset_id, log_date DESC);

-- ---------------------------------------------------------------------
-- Restructure field_drivers: link to an asset and an individually
-- assigned supervisor. vehicle_number/chassis_number/ward_no move to
-- the asset (a driver's vehicle details now live on assets, not
-- duplicated per-driver); ward_id stays as the driver's own
-- organizational ward, separate from which wards their asset serves.
-- ---------------------------------------------------------------------
ALTER TABLE field_drivers DROP COLUMN vehicle_number;
ALTER TABLE field_drivers DROP COLUMN chassis_number;
ALTER TABLE field_drivers DROP COLUMN ward_no;
ALTER TABLE field_drivers ADD COLUMN asset_id BIGINT REFERENCES assets(id);
ALTER TABLE field_drivers ADD COLUMN supervisor_id BIGINT REFERENCES attendance_users(id);

-- ---------------------------------------------------------------------
-- Assistants - a second field-worker role, always assigned to a
-- specific driver (not directly to an asset or ward); their effective
-- supervisor is that driver's supervisor, applied automatically by
-- the application layer whenever the assignment is made or changed.
-- ---------------------------------------------------------------------
CREATE TABLE field_assistants (
  id            BIGSERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  external_id   VARCHAR(32),
  driver_id     BIGINT NOT NULL REFERENCES field_drivers(id),
  ward_id       BIGINT NOT NULL REFERENCES attendance_wards(id),
  shift_id      BIGINT REFERENCES attendance_shifts(id),
  active        BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX idx_field_assistants_external_id ON field_assistants (external_id) WHERE external_id IS NOT NULL;

-- Mirrors field_driver_attendance exactly - same shape, same daily marking pattern.
CREATE TABLE field_assistant_attendance (
  id              BIGSERIAL PRIMARY KEY,
  date            DATE NOT NULL,
  assistant_id    BIGINT NOT NULL REFERENCES field_assistants(id),
  assistant_name  VARCHAR(255) NOT NULL,
  ward_id         BIGINT NOT NULL REFERENCES attendance_wards(id),
  in_time         TIMESTAMPTZ,
  out_time        TIMESTAMPTZ,
  status          VARCHAR(32) NOT NULL
                    CHECK (status IN ('present', 'half_day', 'absent_informed', 'absent_not_informed', 'absent')),
  marked_by       VARCHAR(64) NOT NULL,
  remarks         TEXT,
  UNIQUE (assistant_id, date)
);
CREATE INDEX idx_field_assistant_attendance_date ON field_assistant_attendance (date);
