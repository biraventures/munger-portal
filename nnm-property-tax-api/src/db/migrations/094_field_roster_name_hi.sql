-- Adds an optional, manually-set Hindi display name to field_staff,
-- field_drivers, and field_assistants. The attendance UI's Hindi mode
-- auto-transliterates the English name on the fly (see
-- lib/hindi-name-transliterate.ts in the frontend) when this column
-- is NULL, which covers common Bihar name patterns well but can't
-- resolve vowel-length ambiguity for every name. name_hi is the
-- override: once attendance_admin/sanitation_officer/apswmo/
-- sanitation_prabhari corrects a wrong auto-guess here, that
-- correction is used instead, permanently, for that record.
ALTER TABLE field_staff ADD COLUMN name_hi VARCHAR(255);
ALTER TABLE field_drivers ADD COLUMN name_hi VARCHAR(255);
ALTER TABLE field_assistants ADD COLUMN name_hi VARCHAR(255);
