-- An approved khatian is permanent: no login - and no query run through the app or by hand without first removing
-- these triggers - can delete it, change it, or delete/alter any of its uploaded file versions.
-- (The portal never had a delete for khatians; this makes the rule hold in the database itself.)

CREATE OR REPLACE FUNCTION khatian_block_approved_change() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'approved' THEN
    IF TG_OP = 'DELETE' OR NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'Khatian % / % / % is approved and cannot be deleted or changed.', OLD.survey_ward, OLD.survey_sheet_no, OLD.part_no
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_khatian_block_approved_change ON khatian_records;
CREATE TRIGGER trg_khatian_block_approved_change
  BEFORE UPDATE OR DELETE ON khatian_records
  FOR EACH ROW EXECUTE FUNCTION khatian_block_approved_change();

-- Every uploaded version of an approved khatian is kept as well.
CREATE OR REPLACE FUNCTION khatian_file_block_approved_change() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM khatian_records k WHERE k.id = OLD.khatian_id AND k.status = 'approved') THEN
    IF TG_OP = 'DELETE' OR NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'This file belongs to an approved khatian and cannot be deleted or changed.'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_khatian_file_block_approved_change ON khatian_record_files;
CREATE TRIGGER trg_khatian_file_block_approved_change
  BEFORE UPDATE OR DELETE ON khatian_record_files
  FOR EACH ROW EXECUTE FUNCTION khatian_file_block_approved_change();

-- TRUNCATE skips row triggers, so it is refused outright while any khatian is approved.
CREATE OR REPLACE FUNCTION khatian_block_truncate() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM khatian_records WHERE status = 'approved') THEN
    RAISE EXCEPTION 'Approved khatians exist - the khatian tables cannot be truncated.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_khatian_block_truncate ON khatian_records;
CREATE TRIGGER trg_khatian_block_truncate BEFORE TRUNCATE ON khatian_records FOR EACH STATEMENT EXECUTE FUNCTION khatian_block_truncate();
DROP TRIGGER IF EXISTS trg_khatian_file_block_truncate ON khatian_record_files;
CREATE TRIGGER trg_khatian_file_block_truncate BEFORE TRUNCATE ON khatian_record_files FOR EACH STATEMENT EXECUTE FUNCTION khatian_block_truncate();
