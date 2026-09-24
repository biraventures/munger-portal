-- Tax Collector - a dedicated login for field tax collection: search
-- a holding by number, see its pendency, generate a demand notice,
-- collect payment, issue a receipt - the same core flow operators
-- already have, extended to this role (see the requireOperatorOrAdmin
-- + role-check pattern in payment.controller.ts and
-- demandNotice.controller.ts) rather than duplicating it.
ALTER TABLE admins DROP CONSTRAINT admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('tax_daroga', 'tax_surveyor', 'tax_collector', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner', 'stall_prabhari', 'city_manager', 'trade_license_nodal', 'assistant_town_planning_supervisor', 'assistant_architect'));

-- A Tax Collector's on-the-ground note that a holding's recorded
-- details don't match what they found during collection - e.g. the
-- construction, owner, or use looks different from what's on file.
-- Purely a flag-and-remarks record for now: it doesn't itself trigger
-- a re-survey workflow, it's the data trail a reviewer (Tax Daroga,
-- Commissioner) uses to decide whether one is needed.
CREATE TABLE property_resurvey_flags (
  id                  BIGSERIAL PRIMARY KEY,
  holding_no          VARCHAR(32) NOT NULL REFERENCES properties(holding_no),
  flagged_by_username VARCHAR(100) NOT NULL,
  flagged_by_display_name VARCHAR(200) NOT NULL,
  remarks             TEXT NOT NULL,
  flagged_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  status              VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  reviewed_by_username VARCHAR(100),
  reviewed_by_display_name VARCHAR(200),
  reviewed_at         TIMESTAMPTZ,
  review_notes        TEXT
);
CREATE INDEX idx_property_resurvey_flags_holding ON property_resurvey_flags (holding_no, flagged_at DESC);
CREATE INDEX idx_property_resurvey_flags_status ON property_resurvey_flags (status);
