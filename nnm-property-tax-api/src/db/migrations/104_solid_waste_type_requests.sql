-- A solid waste user type entered by a Tax Collector is not applied to the
-- holding until it has been verified by the Tax Daroga and then approved by
-- the City Manager (the one the collector is assigned to).
CREATE TABLE IF NOT EXISTS solid_waste_type_requests (
  id                              SERIAL PRIMARY KEY,
  holding_no                      VARCHAR(32) NOT NULL,
  requested_type                  TEXT NOT NULL,
  requested_by_username           VARCHAR(64) NOT NULL,
  requested_by_display_name       TEXT NOT NULL,
  requested_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_city_manager_username  VARCHAR(64),
  stage                           TEXT NOT NULL DEFAULT 'tax_daroga'
                                  CHECK (stage IN ('tax_daroga', 'city_manager', 'approved', 'rejected')),
  daroga_by                       TEXT,
  daroga_at                       TIMESTAMPTZ,
  city_manager_by                 TEXT,
  city_manager_at                 TIMESTAMPTZ,
  rejected_by                     TEXT,
  rejected_at                     TIMESTAMPTZ,
  reject_reason                   TEXT
);
CREATE INDEX IF NOT EXISTS idx_swtr_holding ON solid_waste_type_requests (holding_no);
CREATE UNIQUE INDEX IF NOT EXISTS uq_swtr_open_per_holding ON solid_waste_type_requests (holding_no)
  WHERE stage IN ('tax_daroga', 'city_manager');
