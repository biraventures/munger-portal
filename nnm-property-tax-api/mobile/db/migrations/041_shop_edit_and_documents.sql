-- Two related additions for the shop registry:
--
-- 1. shop_edit_requests / shop_edit_approvals - an operator proposes
--    an edit to an existing shop's details (location, market, ward,
--    area), which only takes effect after Stall Prabhari, City
--    Manager, and Deputy Municipal Commissioner have all approved it,
--    in that fixed order - mirroring the existing property/holding
--    edit pattern (property_change_requests: propose now, apply only
--    at final approval), but with a fixed 3-stage chain rather than
--    the classification-based variable chain holdings use, since
--    every shop edit goes through the same 3 reviewers regardless of
--    what changed. Reuses the same stage values as
--    SHOP_PUBLICATION_STAGE_ORDER (stall_prabhari -> city_manager ->
--    deputy_commissioner) since it's the identical 3-role sequence.
--    shop_edit_approvals is a separate append-only audit trail
--    table (same pattern as shop_agreement_change_approvals) so the
--    full history of who approved what, and when, survives even
--    though the main row's current_stage moves on.
--
-- 2. shop_agreement_documents - the signed agreement PDF for a shop,
--    stored directly in Postgres as bytea rather than on the
--    filesystem or an external object store, since this app has no
--    existing file-upload infrastructure at all and the expected
--    scale (one PDF per shop, a few hundred shops) is well within
--    what Postgres handles comfortably - this also means the PDF is
--    automatically covered by whatever backup strategy already
--    protects the database, rather than needing a second one. One
--    row per shop; re-uploading replaces the previous file rather
--    than keeping version history, since that wasn't asked for.

CREATE TABLE shop_edit_requests (
  id                BIGSERIAL PRIMARY KEY,
  shop_no           VARCHAR(32) NOT NULL REFERENCES shops(shop_no),
  requested_by      VARCHAR(255) NOT NULL,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status            VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  current_stage     VARCHAR(30) NOT NULL DEFAULT 'stall_prabhari'
                      CHECK (current_stage IN ('stall_prabhari', 'city_manager', 'deputy_commissioner')),
  change_reason     TEXT NOT NULL,
  proposed_data     JSONB NOT NULL,
  reviewed_by       VARCHAR(255),
  reviewed_role     VARCHAR(32),
  reviewed_at       TIMESTAMPTZ,
  review_notes      TEXT
);
CREATE INDEX idx_shop_edit_requests_shop_no ON shop_edit_requests (shop_no);
CREATE INDEX idx_shop_edit_requests_status ON shop_edit_requests (status);

CREATE TABLE shop_edit_approvals (
  id                        BIGSERIAL PRIMARY KEY,
  edit_request_id           BIGINT NOT NULL REFERENCES shop_edit_requests(id),
  stage                     VARCHAR(30) NOT NULL,
  decision                  VARCHAR(16) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_by_username       VARCHAR(255) NOT NULL,
  decided_by_display_name   VARCHAR(255) NOT NULL,
  decided_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes                     TEXT
);
CREATE INDEX idx_shop_edit_approvals_request ON shop_edit_approvals (edit_request_id);

CREATE TABLE shop_agreement_documents (
  id            BIGSERIAL PRIMARY KEY,
  shop_no       VARCHAR(32) NOT NULL UNIQUE REFERENCES shops(shop_no),
  file_data     BYTEA NOT NULL,
  file_name     VARCHAR(255) NOT NULL,
  file_size     INTEGER NOT NULL,
  uploaded_by   VARCHAR(255) NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
