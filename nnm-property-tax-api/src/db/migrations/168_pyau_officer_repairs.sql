-- Submersible (pyau) dashboard for AE / JE - Mechanical (admin portal):
--   * agency names (who built / executes the pyau), a per-pyau maintenance contractor (one of the pyau contractor
--     logins), and a simple "under maintenance by the builder" checkbox in place of the old 2-year date rule;
--   * a fault is marked by the AE / JE with its date and 4 photos; the repair is closed with its date, the items
--     replaced with their cost (entered one by one) and 4 more photos; the ward parshad's application for the repair
--     (with its date) is attached; every step is recorded in an audit trail.

CREATE TABLE IF NOT EXISTS pyau_agencies (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  created_by  VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pyau_agencies_name ON pyau_agencies (lower(btrim(name)));

ALTER TABLE pyaus ADD COLUMN IF NOT EXISTS agency_id BIGINT REFERENCES pyau_agencies(id);
ALTER TABLE pyaus ADD COLUMN IF NOT EXISTS maintenance_contractor_id BIGINT REFERENCES attendance_users(id);
ALTER TABLE pyaus ADD COLUMN IF NOT EXISTS under_builder_maintenance BOOLEAN NOT NULL DEFAULT FALSE;
-- Pyaus inside the old 2-year builder-warranty window keep that status as the checkbox.
UPDATE pyaus SET under_builder_maintenance = TRUE
 WHERE installed_date IS NOT NULL AND installed_date + INTERVAL '2 years' > now() AND NOT under_builder_maintenance;

-- A fault can now also be marked by an officer of the admin portal (AE / JE - Mechanical).
ALTER TABLE pyau_issues DROP CONSTRAINT IF EXISTS pyau_issues_reported_by_type_check;
ALTER TABLE pyau_issues ADD CONSTRAINT pyau_issues_reported_by_type_check CHECK (reported_by_type IN ('staff', 'public', 'officer'));
ALTER TABLE pyau_issues
  ADD COLUMN IF NOT EXISTS reported_by_officer_username VARCHAR(64),
  ADD COLUMN IF NOT EXISTS reported_by_officer_name TEXT,
  ADD COLUMN IF NOT EXISTS repaired_by_officer_username VARCHAR(64),
  ADD COLUMN IF NOT EXISTS repaired_by_officer_name TEXT,
  ADD COLUMN IF NOT EXISTS under_builder_maintenance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS parshad_application_path TEXT,
  ADD COLUMN IF NOT EXISTS parshad_application_mime VARCHAR(64),
  ADD COLUMN IF NOT EXISTS parshad_application_date DATE;

CREATE TABLE IF NOT EXISTS pyau_issue_photos (
  id           BIGSERIAL PRIMARY KEY,
  issue_id     BIGINT NOT NULL REFERENCES pyau_issues(id) ON DELETE CASCADE,
  stage        VARCHAR(8) NOT NULL CHECK (stage IN ('fault', 'repair')),
  slot         SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 4),
  photo_path   TEXT NOT NULL,
  uploaded_by  TEXT NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issue_id, stage, slot)
);

CREATE TABLE IF NOT EXISTS pyau_issue_items (
  id                BIGSERIAL PRIMARY KEY,
  issue_id          BIGINT NOT NULL REFERENCES pyau_issues(id) ON DELETE CASCADE,
  item_name         TEXT NOT NULL,
  quantity          NUMERIC(10,2),
  cost              NUMERIC(12,2) NOT NULL CHECK (cost >= 0),
  added_by_username VARCHAR(64) NOT NULL,
  added_by_name     TEXT NOT NULL,
  added_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Removing an item (only while the repair is open) keeps the row for the audit trail.
  removed_at        TIMESTAMPTZ,
  removed_by_name   TEXT
);
CREATE INDEX IF NOT EXISTS idx_pyau_issue_items_issue ON pyau_issue_items (issue_id);

CREATE TABLE IF NOT EXISTS pyau_audit_log (
  id            BIGSERIAL PRIMARY KEY,
  pyau_id       BIGINT,
  issue_id      BIGINT,
  action        VARCHAR(40) NOT NULL,
  details       JSONB,
  by_username   VARCHAR(64),
  by_name       TEXT NOT NULL,
  by_role       VARCHAR(64),
  at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pyau_audit_log_pyau ON pyau_audit_log (pyau_id, at);
CREATE INDEX IF NOT EXISTS idx_pyau_audit_log_at ON pyau_audit_log (at);
