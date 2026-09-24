-- Adds three related capabilities to shop rent demands and receipts,
-- mirroring the existing property-tax cancellation_requests pattern
-- (migration 026) but for shops, with a different approval chain:
--
-- 1. CANCEL a demand notice or a payment receipt - void it entirely,
--    never deleted (financial audit trail preserved). Cancelling a
--    receipt reverts its linked demand back to unsettled, same as the
--    property-tax version.
--
-- 2. SUPERSEDE a demand notice - when a tenant hasn't paid, a 2nd/3rd/
--    further notice can be issued that references every prior unpaid
--    notice for the same shop (their number and date), states they
--    were issued but not complied with, and warns of agreement
--    termination if not paid immediately. The new notice supersedes
--    the old ones - they're marked superseded (not cancelled - they
--    remain valid historical records, just no longer the active
--    notice), and the new notice records exactly which ones it
--    supersedes via a junction table, since one escalation notice can
--    reference several prior notices at once.
--
-- 3. SETTLE - this already happens automatically whenever a payment is
--    recorded against a demand (see shop_rent_demands.settled,
--    already in migration 010) - nothing new needed here.
--
-- Both cancel and supersede require approval from Stall Prabhari, then
-- City Manager, in that order, before taking effect - an operator can
-- only request either action, never apply it directly.

ALTER TABLE shop_rent_demands ADD COLUMN cancelled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE shop_rent_demands ADD COLUMN cancelled_reason TEXT;
ALTER TABLE shop_rent_demands ADD COLUMN cancelled_at TIMESTAMPTZ;
ALTER TABLE shop_rent_demands ADD COLUMN superseded BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE shop_rent_demands ADD COLUMN superseded_at TIMESTAMPTZ;

ALTER TABLE shop_rent_payments ADD COLUMN cancelled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE shop_rent_payments ADD COLUMN cancelled_reason TEXT;
ALTER TABLE shop_rent_payments ADD COLUMN cancelled_at TIMESTAMPTZ;

-- Which prior demand(s) a new escalation notice supersedes - a
-- many-to-many, since one new notice can reference several unpaid
-- prior notices for the same shop at once.
CREATE TABLE shop_rent_demand_supersessions (
  new_demand_no        VARCHAR(32) NOT NULL REFERENCES shop_rent_demands(demand_no),
  superseded_demand_no VARCHAR(32) NOT NULL REFERENCES shop_rent_demands(demand_no),
  PRIMARY KEY (new_demand_no, superseded_demand_no)
);

CREATE TABLE shop_demand_action_requests (
  id              BIGSERIAL PRIMARY KEY,
  action_type     VARCHAR(20) NOT NULL CHECK (action_type IN ('cancel_demand', 'supersede_demand', 'cancel_receipt')),
  target_id       VARCHAR(32) NOT NULL, -- demand_no or receipt_no, depending on action_type
  shop_no         VARCHAR(32) NOT NULL REFERENCES shops(shop_no),
  reason          TEXT NOT NULL,
  requested_by    VARCHAR(255) NOT NULL,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  current_stage   VARCHAR(30) NOT NULL DEFAULT 'stall_prabhari' CHECK (current_stage IN ('stall_prabhari', 'city_manager')),
  reviewed_by     VARCHAR(255),
  reviewed_role   VARCHAR(32),
  reviewed_at     TIMESTAMPTZ,
  review_notes    TEXT
);
CREATE INDEX idx_shop_demand_action_requests_status ON shop_demand_action_requests (status);
CREATE INDEX idx_shop_demand_action_requests_shop_no ON shop_demand_action_requests (shop_no);

-- Append-only audit trail across both stages, same pattern as
-- shop_edit_approvals - so the full history survives even after
-- current_stage moves on to the next reviewer.
CREATE TABLE shop_demand_action_approvals (
  id                        BIGSERIAL PRIMARY KEY,
  request_id                BIGINT NOT NULL REFERENCES shop_demand_action_requests(id),
  stage                     VARCHAR(30) NOT NULL,
  decision                  VARCHAR(16) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_by_username       VARCHAR(255) NOT NULL,
  decided_by_display_name   VARCHAR(255) NOT NULL,
  decided_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes                     TEXT
);
CREATE INDEX idx_shop_demand_action_approvals_request ON shop_demand_action_approvals (request_id);
