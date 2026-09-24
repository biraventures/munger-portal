-- New role: the Establishment Clerk enters every employee record.
-- Verification stays with the existing city_manager role - the
-- Commissioner is who checks overall progress (see
-- employeeDatabaseProgress.service.ts).
ALTER TABLE admins DROP CONSTRAINT admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('tax_daroga', 'tax_surveyor', 'tax_collector', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner', 'stall_prabhari', 'city_manager', 'trade_license_nodal', 'assistant_town_planning_supervisor', 'assistant_architect', 'je_mechanical', 'ae_mechanical', 'establishment_clerk'));

-- One row per municipal employee/officer. Created directly by the
-- Establishment Clerk (not a proposed change to an existing record,
-- since this is first-time data entry) and sits at
-- pending_verification until the City Manager verifies it - no
-- multi-stage chain, per what was asked for ("each entry verified by
-- city manager"). years_of_service isn't stored - it's computed on
-- read from date_of_appointment minus unauthorised_absence_days (see
-- employee.types.ts's calculateYearsOfService), since it changes
-- every day and storing it would just mean it goes stale.
CREATE TABLE employees (
  id                          BIGSERIAL PRIMARY KEY,
  name                        VARCHAR(255) NOT NULL,
  father_name                 VARCHAR(255),
  husband_name                VARCHAR(255),
  home_district               VARCHAR(100) NOT NULL,
  date_of_birth               DATE NOT NULL,
  aadhaar_number               VARCHAR(12) NOT NULL,
  pan_number                  VARCHAR(10),
  reservation_category        VARCHAR(30) NOT NULL
    CHECK (reservation_category IN ('scheduled_caste', 'scheduled_tribe', 'other_backward_class', 'extremely_backward_class', 'backward_class_women', 'divyang', 'general')),
  educational_qualification   VARCHAR(20) NOT NULL
    CHECK (educational_qualification IN ('below_matric', 'matriculation', 'intermediate', 'diploma_degree')),
  date_of_appointment         DATE NOT NULL,
  appointment_order_file_data BYTEA,
  appointment_order_file_name VARCHAR(255),
  appointing_authority        VARCHAR(30) NOT NULL CHECK (appointing_authority IN ('government_of_bihar', 'munger_municipal_corporation')),
  employment_type             VARCHAR(20) NOT NULL CHECK (employment_type IN ('permanent', 'contractual', 'daily_wage')),
  epf_uan                     VARCHAR(20),
  unauthorised_absence_days   INTEGER NOT NULL DEFAULT 0 CHECK (unauthorised_absence_days >= 0),
  status                      VARCHAR(20) NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'verified')),
  created_by                  VARCHAR(255) NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by                 VARCHAR(255),
  verified_at                 TIMESTAMPTZ
);
CREATE INDEX idx_employees_status ON employees (status);
