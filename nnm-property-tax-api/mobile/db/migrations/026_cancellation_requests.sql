-- Cancellation requests for demand notices and payment receipts, both
-- routed through the same tax_daroga approval used elsewhere - an
-- operator requests with a required reason, nothing changes until
-- tax_daroga approves. Deliberately one shared table for both types
-- rather than two, since the review workflow (list pending, approve,
-- reject, record reason) is identical either way.
CREATE TABLE cancellation_requests (
  id              BIGSERIAL PRIMARY KEY,
  request_type    VARCHAR(16) NOT NULL CHECK (request_type IN ('demand_notice', 'receipt')),
  target_id       VARCHAR(32) NOT NULL, -- demand_no or receipt_no, depending on request_type
  holding_no      VARCHAR(32) NOT NULL,
  reason          TEXT NOT NULL,
  requested_by    VARCHAR(255) NOT NULL,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by     VARCHAR(255),
  reviewed_at     TIMESTAMPTZ,
  review_notes    TEXT
);
CREATE INDEX idx_cancellation_requests_status ON cancellation_requests (status);
CREATE INDEX idx_cancellation_requests_holding ON cancellation_requests (holding_no);

-- Cancelled demand notices/receipts are never deleted (financial audit
-- trail) - just flagged, with the reason and who/when preserved.
ALTER TABLE demand_notices ADD COLUMN cancelled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE demand_notices ADD COLUMN cancelled_reason TEXT;
ALTER TABLE demand_notices ADD COLUMN cancelled_at TIMESTAMPTZ;

ALTER TABLE transactions ADD COLUMN cancelled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN cancelled_reason TEXT;
ALTER TABLE transactions ADD COLUMN cancelled_at TIMESTAMPTZ;
