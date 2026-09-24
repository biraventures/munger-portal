-- New role: apswmo, who should be able to log in on the asset
-- management side and report a non-functional streetlight (same as
-- any other attendance role already can - see the streetlight-faults
-- route, which is open to any logged-in attendance user).
ALTER TABLE attendance_users DROP CONSTRAINT attendance_users_role_check;
ALTER TABLE attendance_users ADD CONSTRAINT attendance_users_role_check
  CHECK (role IN (
    'jamadar', 'driver_supervisor', 'sanitation_officer', 'sanitation_prabhari', 'attendance_admin',
    'junior_engineer', 'assistant_engineer_mechanical', 'maintenance_nodal_clerk',
    'streetlight_contractor', 'streetlight_je', 'streetlight_ae', 'streetlight_nodal_clerk',
    'city_manager', 'deputy_municipal_commissioner', 'municipal_commissioner',
    'pyau_je', 'pyau_ae', 'pyau_contractor', 'apswmo'
  ));
