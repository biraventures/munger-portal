-- Identity documents of the collection staff (Tax Collector, Agency Team Leader, Agency Project Manager, Agency
-- Operator). The Tax Daroga uploads them; the City Manager and the DMC each review; when both approve, the login is
-- active for collection. Police verification (the certificate) is optional for activation and can be added later.
-- Once approved, nothing on the record can change - except that a police verification document left blank can be
-- filled in.
CREATE TABLE IF NOT EXISTS staff_kyc (
  admin_username            VARCHAR(64) PRIMARY KEY REFERENCES admins(username) ON UPDATE CASCADE,
  aadhaar_no                CHAR(12),
  pan_no                    CHAR(10),
  aadhaar_path              TEXT,
  pan_path                  TEXT,
  appointment_letter_path   TEXT,
  id_card_path              TEXT,
  police_application_path   TEXT,
  police_certificate_path   TEXT,
  status                    VARCHAR(12) NOT NULL DEFAULT 'draft',
  submitted_at              TIMESTAMPTZ,
  submitted_by_username     VARCHAR(64),
  submitted_by_name         VARCHAR(255),
  cm_reviewed_at            TIMESTAMPTZ,
  cm_reviewed_by_username   VARCHAR(64),
  cm_reviewed_by_name       VARCHAR(255),
  dmc_reviewed_at           TIMESTAMPTZ,
  dmc_reviewed_by_username  VARCHAR(64),
  dmc_reviewed_by_name      VARCHAR(255),
  returned_reason           TEXT,
  approved_at               TIMESTAMPTZ,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_kyc_status_check CHECK (status IN ('draft', 'submitted', 'returned', 'approved')),
  CONSTRAINT staff_kyc_aadhaar_format CHECK (aadhaar_no IS NULL OR aadhaar_no ~ '^[2-9][0-9]{11}$'),
  CONSTRAINT staff_kyc_pan_format CHECK (pan_no IS NULL OR pan_no ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  CONSTRAINT staff_kyc_approved_complete CHECK (
    status <> 'approved' OR (
      aadhaar_no IS NOT NULL AND pan_no IS NOT NULL AND aadhaar_path IS NOT NULL AND pan_path IS NOT NULL
      AND appointment_letter_path IS NOT NULL AND id_card_path IS NOT NULL AND police_application_path IS NOT NULL
      AND cm_reviewed_at IS NOT NULL AND dmc_reviewed_at IS NOT NULL AND approved_at IS NOT NULL))
);

-- One person, one login.
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_kyc_aadhaar ON staff_kyc (aadhaar_no) WHERE aadhaar_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_kyc_pan ON staff_kyc (pan_no) WHERE pan_no IS NOT NULL;

-- Every step, for the record.
CREATE TABLE IF NOT EXISTS staff_kyc_events (
  id              BIGSERIAL PRIMARY KEY,
  admin_username  VARCHAR(64) NOT NULL REFERENCES admins(username) ON UPDATE CASCADE,
  action          VARCHAR(40) NOT NULL,
  remarks         TEXT,
  by_username     VARCHAR(64) NOT NULL,
  by_name         VARCHAR(255),
  by_role         VARCHAR(64),
  at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_kyc_events_user ON staff_kyc_events (admin_username, at);

-- An approved record is locked in the database itself, not only in the API.
CREATE OR REPLACE FUNCTION staff_kyc_lock() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'approved' THEN
      RAISE EXCEPTION 'staff_kyc: an approved record cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'approved' THEN
    IF NEW.admin_username IS DISTINCT FROM OLD.admin_username
       OR NEW.aadhaar_no IS DISTINCT FROM OLD.aadhaar_no OR NEW.pan_no IS DISTINCT FROM OLD.pan_no
       OR NEW.aadhaar_path IS DISTINCT FROM OLD.aadhaar_path OR NEW.pan_path IS DISTINCT FROM OLD.pan_path
       OR NEW.appointment_letter_path IS DISTINCT FROM OLD.appointment_letter_path
       OR NEW.id_card_path IS DISTINCT FROM OLD.id_card_path
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.cm_reviewed_at IS DISTINCT FROM OLD.cm_reviewed_at OR NEW.cm_reviewed_by_username IS DISTINCT FROM OLD.cm_reviewed_by_username
       OR NEW.dmc_reviewed_at IS DISTINCT FROM OLD.dmc_reviewed_at OR NEW.dmc_reviewed_by_username IS DISTINCT FROM OLD.dmc_reviewed_by_username
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR (OLD.police_application_path IS NOT NULL AND NEW.police_application_path IS DISTINCT FROM OLD.police_application_path)
       OR (OLD.police_certificate_path IS NOT NULL AND NEW.police_certificate_path IS DISTINCT FROM OLD.police_certificate_path) THEN
      RAISE EXCEPTION 'staff_kyc: an approved record cannot be changed (only a blank police verification document can be added)';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staff_kyc_lock ON staff_kyc;
CREATE TRIGGER trg_staff_kyc_lock BEFORE UPDATE OR DELETE ON staff_kyc FOR EACH ROW EXECUTE FUNCTION staff_kyc_lock();
