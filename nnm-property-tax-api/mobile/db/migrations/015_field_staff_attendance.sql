-- Field Staff Attendance module - fully separate from the property tax /
-- shop rent / trade license system. Its own login table, its own roles,
-- its own data. Nothing here is referenced by or references the
-- properties/shops/trade_license tables.
--
-- Ported from the existing Google Apps Script attendance system
-- (Users/Wards/Shifts/Master_Staff/Attendance/Feedback/DailyPhoto/
-- Master_Drivers/Driver_Attendance sheets), with one deliberate
-- improvement: passwords are bcrypt-hashed here, not stored in plain
-- text as they were in the Sheet.

-- ---------------------------------------------------------------------
-- Logins
-- ---------------------------------------------------------------------
-- role: 'jamadar' and 'driver_supervisor' are ward-scoped (ward_id
-- required); 'sanitation_officer', 'sanitation_prabhari', and
-- 'attendance_admin' are cross-ward (ward_id null - they see every
-- ward). Mirrors the Apps Script system's role list exactly, so nothing
-- about who-can-do-what changes for the people using it day to day.
CREATE TABLE attendance_users (
  id              BIGSERIAL PRIMARY KEY,
  username        VARCHAR(64) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  display_name    VARCHAR(255) NOT NULL,
  role            VARCHAR(32) NOT NULL
                    CHECK (role IN ('jamadar', 'driver_supervisor', 'sanitation_officer', 'sanitation_prabhari', 'attendance_admin')),
  ward_id         BIGINT,  -- FK added below, after attendance_wards exists
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_modified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Wards, shifts
-- ---------------------------------------------------------------------
CREATE TABLE attendance_wards (
  id          BIGSERIAL PRIMARY KEY,
  ward_name   VARCHAR(255) NOT NULL UNIQUE
);

ALTER TABLE attendance_users
  ADD CONSTRAINT fk_attendance_users_ward FOREIGN KEY (ward_id) REFERENCES attendance_wards(id);

CREATE TABLE attendance_shifts (
  id              BIGSERIAL PRIMARY KEY,
  shift_name      VARCHAR(64) NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  grace_minutes   INTEGER NOT NULL DEFAULT 30
);

-- ---------------------------------------------------------------------
-- Field staff (sanitation workers) + their attendance
-- ---------------------------------------------------------------------
CREATE TABLE field_staff (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  ward_id     BIGINT NOT NULL REFERENCES attendance_wards(id),
  shift_id    BIGINT REFERENCES attendance_shifts(id),
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

-- status: 'present', 'half_day', 'absent_informed', 'absent_not_informed',
-- 'absent' (the last one only for older/admin-swept rows with no
-- informed/not-informed distinction recorded - kept for parity with the
-- source system's "Absent" status rather than forcing a guess).
-- One row per staff member per day - enforced here, not just in
-- application code, so a race between two jamadar submissions can't
-- double-book a day.
CREATE TABLE field_staff_attendance (
  id            BIGSERIAL PRIMARY KEY,
  date          DATE NOT NULL,
  staff_id      BIGINT NOT NULL REFERENCES field_staff(id),
  staff_name    VARCHAR(255) NOT NULL,  -- denormalized snapshot, same as the source sheet - survives the staff row's name changing later
  ward_id       BIGINT NOT NULL REFERENCES attendance_wards(id),
  in_time       TIMESTAMPTZ,
  out_time      TIMESTAMPTZ,
  status        VARCHAR(32) NOT NULL
                  CHECK (status IN ('present', 'half_day', 'absent_informed', 'absent_not_informed', 'absent')),
  marked_by     VARCHAR(64) NOT NULL,  -- attendance_users.username of whoever marked it
  remarks       TEXT,
  UNIQUE (staff_id, date)
);

CREATE INDEX idx_field_staff_attendance_date ON field_staff_attendance (date);
CREATE INDEX idx_field_staff_attendance_ward ON field_staff_attendance (ward_id);

-- ---------------------------------------------------------------------
-- Feedback (inspection comments)
-- ---------------------------------------------------------------------
CREATE TABLE field_staff_feedback (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  staff_id      BIGINT NOT NULL REFERENCES field_staff(id),
  staff_name    VARCHAR(255) NOT NULL,
  ward_id       BIGINT NOT NULL REFERENCES attendance_wards(id),
  given_by      VARCHAR(255) NOT NULL,
  given_by_role VARCHAR(32) NOT NULL,
  type          VARCHAR(16) NOT NULL CHECK (type IN ('positive', 'negative')),
  comment       TEXT
);

CREATE INDEX idx_field_staff_feedback_staff ON field_staff_feedback (staff_id);

-- ---------------------------------------------------------------------
-- Daily group photo (one per ward per day)
-- ---------------------------------------------------------------------
CREATE TABLE field_staff_daily_photo (
  id            BIGSERIAL PRIMARY KEY,
  date          DATE NOT NULL,
  ward_id       BIGINT NOT NULL REFERENCES attendance_wards(id),
  uploaded_by   VARCHAR(64) NOT NULL,
  -- Relative path under the configured photo upload directory (see
  -- PHOTO_UPLOAD_DIR in env.ts) - not a full URL. The API builds the
  -- public URL from this at read time, so moving/mounting the storage
  -- location later doesn't require touching stored data.
  photo_path    TEXT NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ward_id, date)
);

-- ---------------------------------------------------------------------
-- Drivers + their attendance (parallel structure to field staff)
-- ---------------------------------------------------------------------
CREATE TABLE field_drivers (
  id                BIGSERIAL PRIMARY KEY,
  name              VARCHAR(255) NOT NULL,
  vehicle_number    VARCHAR(32),
  chassis_number    VARCHAR(64),
  dl_number         VARCHAR(64),
  ward_no           VARCHAR(32),
  ward_id           BIGINT NOT NULL REFERENCES attendance_wards(id),
  shift_id          BIGINT REFERENCES attendance_shifts(id),
  active            BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE field_driver_attendance (
  id            BIGSERIAL PRIMARY KEY,
  date          DATE NOT NULL,
  driver_id     BIGINT NOT NULL REFERENCES field_drivers(id),
  driver_name   VARCHAR(255) NOT NULL,
  ward_id       BIGINT NOT NULL REFERENCES attendance_wards(id),
  in_time       TIMESTAMPTZ,
  out_time      TIMESTAMPTZ,
  status        VARCHAR(32) NOT NULL
                  CHECK (status IN ('present', 'half_day', 'absent_informed', 'absent_not_informed', 'absent')),
  marked_by     VARCHAR(64) NOT NULL,
  remarks       TEXT,
  UNIQUE (driver_id, date)
);

CREATE INDEX idx_field_driver_attendance_date ON field_driver_attendance (date);
CREATE INDEX idx_field_driver_attendance_ward ON field_driver_attendance (ward_id);
