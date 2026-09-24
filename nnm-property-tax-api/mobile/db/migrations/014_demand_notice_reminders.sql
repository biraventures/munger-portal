-- Adds reminder-notice tracking to demand_notices. Operators had been
-- re-generating notices for holdings that never paid, effectively as
-- reminders — but nothing recorded that relationship, so a holding
-- could end up with several "unsettled" notices piling up with no
-- indication they represented the same escalating debt.
--
-- reminder_number: 0 for an original notice, 1 for the first reminder
-- generated after it, 2 for the second, and so on.
--
-- superseded: TRUE once a later reminder has been generated for the
-- same holding. A superseded notice is deliberately NOT the same as a
-- settled one — it was never paid, it was just replaced by a newer
-- notice covering the same (or larger) debt. Kept as its own boolean
-- rather than folded into `settled` so the two remain unambiguous:
-- settled = paid, superseded = replaced, and a notice is never both.
-- Superseded notices stay visible in document history for a full
-- audit trail; they're just excluded from the payment counter's
-- unsettled-notice picker (see demandNotice.repository.ts).
--
-- previous_unsettled_demand_nos: comma-separated demand numbers this
-- notice is reminding about — display-only, for printing "Previous
-- unsettled notice(s): ..." on the reminder notice itself.
ALTER TABLE demand_notices ADD COLUMN reminder_number INTEGER NOT NULL DEFAULT 0;
ALTER TABLE demand_notices ADD COLUMN superseded BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE demand_notices ADD COLUMN previous_unsettled_demand_nos TEXT;