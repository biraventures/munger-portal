-- Fixes a pre-existing gap: migration 005 defined admins_role_check
-- with only 4 roles (tax_daroga, mutation_nodal_clerk,
-- deputy_commissioner, commissioner). stall_prabhari, city_manager,
-- and trade_license_nodal were added to the AdminRole type
-- (src/types/admin.types.ts) and to SHOP_APPROVAL_STAGE_ORDER at some
-- point since, but the database constraint was never widened to
-- match - so creating a login with any of those 3 roles has been
-- silently failing at the database level (a 23514 check-constraint
-- violation) despite being valid according to the application code
-- the whole time, until someone actually tried to create one.
ALTER TABLE admins DROP CONSTRAINT admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('tax_daroga', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner', 'stall_prabhari', 'city_manager', 'trade_license_nodal'));
