-- The Tax Daroga decides which Tax Surveyor handles each piece of field work: new holding requests, mutations and
-- remeasurement (property discrepancy) requests. Discrepancy requests had no assignee - every surveyor saw every one.
ALTER TABLE property_discrepancy_requests ADD COLUMN IF NOT EXISTS assigned_surveyor_username VARCHAR(100);
ALTER TABLE property_discrepancy_requests ADD COLUMN IF NOT EXISTS assigned_surveyor_name VARCHAR(150);

-- Every assignment / reassignment by the Tax Daroga, for all three kinds of request.
CREATE TABLE IF NOT EXISTS surveyor_assignment_log (
  id                    BIGSERIAL PRIMARY KEY,
  request_type          VARCHAR(20) NOT NULL CHECK (request_type IN ('new_holding', 'mutation', 'remeasurement')),
  request_id            BIGINT NOT NULL,
  previous_surveyor     VARCHAR(150),
  surveyor_username     VARCHAR(100) NOT NULL,
  surveyor_name         VARCHAR(150) NOT NULL,
  assigned_by           VARCHAR(150) NOT NULL,
  remarks               VARCHAR(500),
  assigned_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_surveyor_assignment_log_req ON surveyor_assignment_log (request_type, request_id, assigned_at DESC);
