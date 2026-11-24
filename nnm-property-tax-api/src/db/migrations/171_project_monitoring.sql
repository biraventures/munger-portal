-- Project monitoring (Asset Management portal).
--  * Single engineer logins by discipline - JE (Civil), JE (Mechanical), AE (Civil), AE (Mechanical) - who work in the
--    wards the Municipal Commissioner assigns them; and a Yojana Prabhari who enters projects (one by one or by Excel).
--  * Projects move approved -> tendered -> tender finalised -> work order -> work in progress -> completed -> payment
--    done ('past_completed' = finished before this portal, for the record). The ward's JE / AE of the project's
--    discipline (civil, mechanical or both) monitor it unless the Commissioner names another for that project.
--  * Monitors upload the estimate and BOQ, milestone photos (day -1, day 0, day 1, 10/20/50/75/90 %), and mark the
--    start and end GPS points. Every change is in project_audit.

ALTER TABLE attendance_users DROP CONSTRAINT attendance_users_role_check;
ALTER TABLE attendance_users ADD CONSTRAINT attendance_users_role_check
  CHECK (role IN (
    'jamadar', 'driver_supervisor', 'sanitation_officer', 'sanitation_prabhari', 'attendance_admin',
    'junior_engineer', 'assistant_engineer_mechanical', 'maintenance_nodal_clerk',
    'streetlight_contractor', 'streetlight_je', 'streetlight_ae', 'streetlight_nodal_clerk',
    'city_manager', 'deputy_municipal_commissioner', 'municipal_commissioner',
    'pyau_je', 'pyau_ae', 'pyau_contractor', 'apswmo',
    'ward_parshad', 'mayor', 'deputy_mayor',
    'encroachment_staff', 'mobile_court_staff',
    'je_civil', 'je_mechanical', 'ae_civil', 'ae_mechanical', 'yojana_prabhari'
  ));

-- One engineer of each kind per ward (the Commissioner's assignment).
CREATE TABLE IF NOT EXISTS engineer_wards (
  ward_id      BIGINT NOT NULL REFERENCES attendance_wards(id),
  role         VARCHAR(32) NOT NULL CHECK (role IN ('je_civil', 'je_mechanical', 'ae_civil', 'ae_mechanical')),
  user_id      BIGINT NOT NULL REFERENCES attendance_users(id),
  assigned_by  TEXT,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ward_id, role)
);
CREATE INDEX IF NOT EXISTS idx_engineer_wards_user ON engineer_wards (user_id);

CREATE TABLE IF NOT EXISTS projects (
  id                      BIGSERIAL PRIMARY KEY,
  project_code            VARCHAR(32) UNIQUE NOT NULL,
  name                    TEXT NOT NULL,
  ward_id                 BIGINT NOT NULL REFERENCES attendance_wards(id),
  location_text           TEXT,
  scheme_name             TEXT,
  category                VARCHAR(32) NOT NULL,
  discipline              VARCHAR(12) NOT NULL CHECK (discipline IN ('civil', 'mechanical', 'both')),
  financial_year          VARCHAR(9),
  estimated_cost          NUMERIC(14,2),
  approval_no             TEXT,
  approval_date           DATE,
  tender_no               TEXT,
  tender_date             DATE,
  tender_finalised_date   DATE,
  agency_name             TEXT,
  work_order_no           TEXT,
  work_order_date         DATE,
  work_order_amount       NUMERIC(14,2),
  target_completion_date  DATE,
  actual_start_date       DATE,
  actual_completion_date  DATE,
  payment_amount          NUMERIC(14,2),
  payment_date            DATE,
  stage                   VARCHAR(24) NOT NULL DEFAULT 'approved' CHECK (stage IN (
                            'approved', 'tendered', 'tender_finalised', 'work_order_issued', 'in_progress',
                            'completed', 'payment_done', 'past_completed')),
  remarks                 TEXT,
  site_notes              TEXT,
  start_lat               NUMERIC(10,7),
  start_lng               NUMERIC(10,7),
  start_gps_by            TEXT,
  start_gps_at            TIMESTAMPTZ,
  end_lat                 NUMERIC(10,7),
  end_lng                 NUMERIC(10,7),
  end_gps_by              TEXT,
  end_gps_at              TIMESTAMPTZ,
  -- The Commissioner may name a different monitor for this project (else the ward's engineer of that kind).
  je_civil_id             BIGINT REFERENCES attendance_users(id),
  je_mechanical_id        BIGINT REFERENCES attendance_users(id),
  ae_civil_id             BIGINT REFERENCES attendance_users(id),
  ae_mechanical_id        BIGINT REFERENCES attendance_users(id),
  created_by              TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_ward ON projects (ward_id);
CREATE INDEX IF NOT EXISTS idx_projects_stage ON projects (stage);

CREATE TABLE IF NOT EXISTS project_documents (
  id           BIGSERIAL PRIMARY KEY,
  project_id   BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind         VARCHAR(16) NOT NULL CHECK (kind IN ('estimate', 'boq', 'other')),
  file_path    TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  mime_type    VARCHAR(128) NOT NULL,
  uploaded_by  TEXT NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents (project_id);

CREATE TABLE IF NOT EXISTS project_photos (
  id           BIGSERIAL PRIMARY KEY,
  project_id   BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone    VARCHAR(16) NOT NULL CHECK (milestone IN ('day_minus_1', 'day_0', 'day_1', 'pct_10', 'pct_20', 'pct_50', 'pct_75', 'pct_90')),
  photo_path   TEXT NOT NULL,
  lat          NUMERIC(10,7),
  lng          NUMERIC(10,7),
  uploaded_by  TEXT NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_photos_project ON project_photos (project_id, milestone);

CREATE TABLE IF NOT EXISTS project_audit (
  id          BIGSERIAL PRIMARY KEY,
  project_id  BIGINT,
  action      VARCHAR(40) NOT NULL,
  details     JSONB,
  by_name     TEXT NOT NULL,
  by_role     VARCHAR(40),
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_audit_project ON project_audit (project_id, at);
