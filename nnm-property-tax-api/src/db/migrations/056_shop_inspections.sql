-- A City Manager or Deputy Commissioner's on-the-ground inspection of
-- a shop - selects which irregularities (if any) were found from a
-- fixed checklist, plus their own free-text comments. irregularities
-- is a plain text array rather than a join table since the checklist
-- is fixed and short (see IRREGULARITY_OPTIONS in
-- shopInspection.controller.ts) - not an open-ended, growing list
-- like staff job roles, so a lookup table would be unnecessary
-- machinery here.
CREATE TABLE shop_inspections (
  id                BIGSERIAL PRIMARY KEY,
  shop_no           VARCHAR(32) NOT NULL REFERENCES shops(shop_no),
  irregularities    TEXT[] NOT NULL DEFAULT '{}',
  comments          TEXT,
  inspected_by      VARCHAR(255) NOT NULL,
  inspected_role    VARCHAR(30) NOT NULL,
  inspected_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shop_inspections_shop_no ON shop_inspections (shop_no, inspected_at DESC);
