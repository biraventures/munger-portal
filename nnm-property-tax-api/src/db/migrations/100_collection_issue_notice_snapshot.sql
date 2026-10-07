-- A frozen copy of exactly what was shown when a collection-issue
-- notice was generated (property details, attached demand notice,
-- body text, date), so a later reprint is the same notice rather than
-- a fresh one built from whatever the records say now - e.g. after the
-- owner's name was mutated or the demand was settled. Notices issued
-- before this column existed have NULL here and are rebuilt on reprint
-- from their stored notice number, language, issue and demand number.
ALTER TABLE collection_issue_notices ADD COLUMN snapshot JSONB;
