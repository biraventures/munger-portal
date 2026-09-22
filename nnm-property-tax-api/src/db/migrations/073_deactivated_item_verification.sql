-- Before a deactivated item is permanently deleted, it needs a
-- field verification by a specific role - different per entity type:
--   vehicles/tricycles/hand carts (assets)  -> Junior Engineer
--   streetlights (lights)                   -> City Manager
--   field staff (attendance_users)          -> APSWMO
-- verified_for_deletion_at/by record that step; the delete endpoint
-- for each entity type requires it to be set first. Deletion itself
-- is a soft delete (deleted_at), consistent with how other entities
-- in this system already preserve history rather than hard-deleting.
ALTER TABLE assets ADD COLUMN verified_for_deletion_by VARCHAR(255);
ALTER TABLE assets ADD COLUMN verified_for_deletion_at TIMESTAMPTZ;
ALTER TABLE assets ADD COLUMN deleted_at TIMESTAMPTZ;

ALTER TABLE lights ADD COLUMN verified_for_deletion_by VARCHAR(255);
ALTER TABLE lights ADD COLUMN verified_for_deletion_at TIMESTAMPTZ;

ALTER TABLE attendance_users ADD COLUMN verified_for_deletion_by VARCHAR(255);
ALTER TABLE attendance_users ADD COLUMN verified_for_deletion_at TIMESTAMPTZ;
ALTER TABLE attendance_users ADD COLUMN deleted_at TIMESTAMPTZ;
