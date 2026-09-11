-- Assistant Architect - a view-only role for the GIS map (sees every
-- holding's assigned coordinates on one map, for town planning
-- purposes) but does not capture or edit coordinates themselves -
-- that stays with the ATPS and Commissioner. "assistant_architect" is
-- 18 characters, comfortably within the VARCHAR(64) already in place
-- from migration 051.
ALTER TABLE admins DROP CONSTRAINT admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('tax_daroga', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner', 'stall_prabhari', 'city_manager', 'trade_license_nodal', 'assistant_town_planning_supervisor', 'assistant_architect'));
