-- An assistant's effective supervisor is always their driver's
-- supervisor - stored directly here (rather than only computed via a
-- join through field_drivers) so a driver_supervisor's "who do I
-- supervise" query is a direct lookup, not a join, and so the roster
-- list can display it without an extra query per row. Kept in sync by
-- the application layer whenever a driver's supervisor changes or an
-- assistant is (re)assigned to a driver - see
-- fieldAssistantRoster.service.ts's propagateSupervisorToAssistants().
ALTER TABLE field_assistants ADD COLUMN supervisor_id BIGINT REFERENCES attendance_users(id);
