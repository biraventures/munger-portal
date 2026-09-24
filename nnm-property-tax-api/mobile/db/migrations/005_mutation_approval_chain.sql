-- Add the Mutation Nodal Clerk tier.
ALTER TABLE admins DROP CONSTRAINT admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('tax_daroga', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner'));

-- Replace single-reviewer approval with a sequential chain — the file
-- moves stage to stage, each stage's approval advancing it to the next;
-- a rejection at any stage stops it there. reviewed_by/reviewed_role/
-- reviewed_at/review_notes now reflect the MOST RECENT stage action
-- (quick-glance convenience); the full step-by-step trail lives in
-- change_request_approvals below.
ALTER TABLE property_change_requests
  ADD COLUMN current_stage VARCHAR(32) NOT NULL DEFAULT 'tax_daroga'
    CHECK (current_stage IN ('tax_daroga', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner')),
  ADD COLUMN final_decided_at TIMESTAMPTZ;

CREATE INDEX idx_pcr_current_stage ON property_change_requests (current_stage);

-- Per-stage sign-off log — mirrors the physical file's movement, one row
-- per officer's action.
CREATE TABLE change_request_approvals (
  id                  BIGSERIAL PRIMARY KEY,
  change_request_id  BIGINT NOT NULL REFERENCES property_change_requests(id) ON DELETE CASCADE,
  stage               VARCHAR(32) NOT NULL
    CHECK (stage IN ('tax_daroga', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner')),
  decision            VARCHAR(16) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  admin_username       VARCHAR(64) NOT NULL,
  admin_display_name   VARCHAR(255) NOT NULL,
  notes                TEXT,
  decided_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cra_change_request_id ON change_request_approvals (change_request_id);