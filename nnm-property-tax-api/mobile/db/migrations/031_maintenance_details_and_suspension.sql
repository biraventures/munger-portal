-- Adds the specific fields requested for maintenance log entries -
-- amount spent, the work order's letter number, and the date the
-- complaint was received - alongside the existing log_type/log_date/
-- notes. All nullable since not every log entry (e.g. a plain status
-- update or note) will have all of these.
ALTER TABLE asset_maintenance_log ADD COLUMN amount_spent NUMERIC(12,2);
ALTER TABLE asset_maintenance_log ADD COLUMN work_order_letter_no VARCHAR(64);
ALTER TABLE asset_maintenance_log ADD COLUMN complaint_received_date DATE;

-- Field staff suspension - deliberately separate from the existing
-- active/inactive flag. Deactivation means someone has left; a
-- suspension is temporary/disciplinary, keeps the worker visible on
-- the roster (so it can be lifted later), and records why. A
-- suspended worker cannot have attendance marked while suspended -
-- enforced in fieldStaffAttendance.service.ts.
ALTER TABLE field_staff ADD COLUMN suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE field_staff ADD COLUMN suspended_reason TEXT;
ALTER TABLE field_staff ADD COLUMN suspended_at TIMESTAMPTZ;

-- Assets already have an active flag (added in migration 028) - used
-- directly as the archive mechanism (active = false means archived),
-- so no schema change needed there. The frontend/backend now filter
-- on it explicitly (archived hidden by default) rather than just
-- toggling a button label, which is the only behavioral change.
