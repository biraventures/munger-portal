-- Demo accounts - can log in and view everything (all GET requests
-- work normally) but every mutating request (create/update/delete)
-- is blocked at the auth middleware level. Requested for Operators,
-- Tax Collectors, and Tax Surveyors, but left as a generic flag on
-- both login tables since the mechanism itself is role-agnostic.
ALTER TABLE operators ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE admins ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;
