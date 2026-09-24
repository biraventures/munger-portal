-- Lets any admin at their own stage of a property mutation or shop
-- agreement approval chain send a request back to the operator for
-- correction, instead of only approve/reject - with a required
-- comment saying what needs fixing. A reverted request sits in the
-- operator's own queue until they correct and resubmit it, at which
-- point it re-enters the chain from its first stage again (the
-- corrected data hasn't been seen by anyone yet, so it goes through
-- the full review, not a resumed one).
ALTER TABLE property_change_requests DROP CONSTRAINT property_change_requests_status_check;
ALTER TABLE property_change_requests ADD CONSTRAINT property_change_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'reverted'));
ALTER TABLE property_change_requests ADD COLUMN reverted_by VARCHAR(255);
ALTER TABLE property_change_requests ADD COLUMN reverted_by_role VARCHAR(32);
ALTER TABLE property_change_requests ADD COLUMN reverted_from_stage VARCHAR(32);
ALTER TABLE property_change_requests ADD COLUMN reverted_at TIMESTAMPTZ;
ALTER TABLE property_change_requests ADD COLUMN revert_comment TEXT;
ALTER TABLE property_change_requests ADD COLUMN revision_count INTEGER NOT NULL DEFAULT 0;

-- shop_agreement_change_requests.status has no CHECK constraint (see
-- migration 010) so 'reverted' just becomes a value the application
-- writes - nothing to alter there.
ALTER TABLE shop_agreement_change_requests ADD COLUMN reverted_by VARCHAR(100);
ALTER TABLE shop_agreement_change_requests ADD COLUMN reverted_by_role VARCHAR(30);
ALTER TABLE shop_agreement_change_requests ADD COLUMN reverted_from_stage VARCHAR(30);
ALTER TABLE shop_agreement_change_requests ADD COLUMN reverted_at TIMESTAMPTZ;
ALTER TABLE shop_agreement_change_requests ADD COLUMN revert_comment TEXT;
ALTER TABLE shop_agreement_change_requests ADD COLUMN revision_count INTEGER NOT NULL DEFAULT 0;

-- A single, unified audit trail across every entry type this applies
-- to - so the Commissioner has one place (and one export) to see
-- every revert-to-operator event, rather than three different
-- screens for three different tables.
CREATE TABLE entry_revert_events (
  id                  BIGSERIAL PRIMARY KEY,
  entry_type          VARCHAR(30) NOT NULL CHECK (entry_type IN ('property_mutation', 'shop_agreement')),
  entry_id            BIGINT NOT NULL,
  reference_no        VARCHAR(32) NOT NULL, -- holding_no or shop_no, for display without a join
  originally_requested_by VARCHAR(255) NOT NULL,
  reverted_by         VARCHAR(255) NOT NULL,
  reverted_by_role    VARCHAR(32) NOT NULL,
  reverted_from_stage VARCHAR(32) NOT NULL,
  comment             TEXT NOT NULL,
  reverted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resubmitted_at      TIMESTAMPTZ
);
CREATE INDEX idx_entry_revert_events_reference ON entry_revert_events (entry_type, reference_no, reverted_at DESC);
