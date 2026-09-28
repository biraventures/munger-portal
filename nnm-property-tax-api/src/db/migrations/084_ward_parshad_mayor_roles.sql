-- Three new logins, all restricted to the same single capability every
-- attendance role already has via the streetlight-faults route (open to
-- any logged-in attendance user - see 072_apswmo_role.sql for the same
-- pattern): reporting a non-functional/defunct streetlight or high mast
-- light. ward_parshad is ward-scoped like jamadar/driver_supervisor -
-- their own ward only. mayor and deputy_mayor are cross-ward, like the
-- other oversight roles - they report for any ward, not just one.
ALTER TABLE attendance_users DROP CONSTRAINT attendance_users_role_check;
ALTER TABLE attendance_users ADD CONSTRAINT attendance_users_role_check
  CHECK (role IN (
    'jamadar', 'driver_supervisor', 'sanitation_officer', 'sanitation_prabhari', 'attendance_admin',
    'junior_engineer', 'assistant_engineer_mechanical', 'maintenance_nodal_clerk',
    'streetlight_contractor', 'streetlight_je', 'streetlight_ae', 'streetlight_nodal_clerk',
    'city_manager', 'deputy_municipal_commissioner', 'municipal_commissioner',
    'pyau_je', 'pyau_ae', 'pyau_contractor', 'apswmo',
    'ward_parshad', 'mayor', 'deputy_mayor'
  ));
