-- Lets the Commissioner or City Manager, while reviewing a shop's full
-- report (details + agreement history + edit-request log), flag
-- something for Stall Prabhari to correct or justify - same
-- open/resolved review pattern as property_resurvey_flags (migration
-- 060), just for the shop side. Deliberately a single fixed-role
-- destination (Stall Prabhari is the one role that owns shop-level
-- field corrections - see shop_edit_requests' 3-stage chain, which
-- also starts there) rather than a configurable assignee.
CREATE TABLE shop_flags (
  id                        BIGSERIAL PRIMARY KEY,
  shop_no                   VARCHAR(32) NOT NULL REFERENCES shops(shop_no),
  flagged_by_username       VARCHAR(100) NOT NULL,
  flagged_by_display_name   VARCHAR(200) NOT NULL,
  flagged_by_role           VARCHAR(32) NOT NULL,
  remarks                   TEXT NOT NULL,
  flagged_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  status                    VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by_username      VARCHAR(100),
  resolved_by_display_name  VARCHAR(200),
  resolved_at               TIMESTAMPTZ,
  resolution_notes          TEXT
);
CREATE INDEX idx_shop_flags_shop_no ON shop_flags (shop_no, flagged_at DESC);
CREATE INDEX idx_shop_flags_status ON shop_flags (status);
