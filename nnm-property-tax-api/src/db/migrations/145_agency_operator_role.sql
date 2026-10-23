-- Agency Operator: a login for the private tax collection agency's counter. It may only search holdings (all wards),
-- receive holding tax payments against existing demand notices, print the ward-wise demand notices NNM has already
-- generated, and view the tax collector reports and trade licence data. It can never create a demand notice or start
-- any change / mutation. The server enforces this with an allowlist (middleware/agencyOperatorScope.ts).
ALTER TABLE admins DROP CONSTRAINT admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('tax_daroga', 'tax_surveyor', 'tax_collector', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner', 'stall_prabhari', 'city_manager', 'trade_license_nodal', 'assistant_town_planning_supervisor', 'assistant_architect', 'je_mechanical', 'ae_mechanical', 'establishment_clerk', 'agency_team_leader', 'agency_project_manager', 'abhilekh_prabhari', 'agency_operator'));
