-- Job-function role tags for field_staff - a worker can hold multiple
-- roles at once (e.g. "Door-2-Door Collection" AND "Hand Cart
-- Handler" - a "twin role", explicitly requested). A lookup table
-- rather than a hardcoded CHECK-constraint list, matching how
-- attendance_wards/attendance_shifts already work in this schema, so
-- new roles can be added later without another migration.

CREATE TABLE staff_job_roles (
  id          BIGSERIAL PRIMARY KEY,
  role_name   VARCHAR(64) UNIQUE NOT NULL
);

INSERT INTO staff_job_roles (role_name) VALUES
  ('Supervisor'),
  ('Road Sweeper'),
  ('Door-2-Door Collection'),
  ('Official Deputation'),
  ('Drain Cleaner'),
  ('E-Rickshaw Driver'),
  ('Tractor Driver'),
  ('Dumper Driver'),
  ('Magic Driver'),
  ('JCB Driver'),
  ('Poclain Driver'),
  ('Robot Driver'),
  ('Tri-Cycle Driver'),
  ('Hand Cart Handler'),
  ('Driver Assistant');

-- Many-to-many: a staff member can hold several roles simultaneously.
CREATE TABLE field_staff_job_roles (
  staff_id  BIGINT NOT NULL REFERENCES field_staff(id) ON DELETE CASCADE,
  role_id   BIGINT NOT NULL REFERENCES staff_job_roles(id),
  PRIMARY KEY (staff_id, role_id)
);
