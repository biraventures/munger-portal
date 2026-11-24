-- Passport size photograph of the staff member, required with the other identity documents (staffKyc.service.ts).
-- A record approved before this can have the photograph added once; after that it is locked like the rest.
ALTER TABLE staff_kyc ADD COLUMN IF NOT EXISTS photo_path TEXT;

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
       OR (OLD.photo_path IS NOT NULL AND NEW.photo_path IS DISTINCT FROM OLD.photo_path)
       OR (OLD.police_application_path IS NOT NULL AND NEW.police_application_path IS DISTINCT FROM OLD.police_application_path)
       OR (OLD.police_certificate_path IS NOT NULL AND NEW.police_certificate_path IS DISTINCT FROM OLD.police_certificate_path) THEN
      RAISE EXCEPTION 'staff_kyc: an approved record cannot be changed (only a blank photograph / police verification document can be added)';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
