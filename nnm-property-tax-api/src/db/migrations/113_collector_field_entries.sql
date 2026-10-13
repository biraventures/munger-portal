-- Tax Collector field work:
--   1) Houses found on the ground that are in neither the holding
--      database nor the MUNG-MIG- data: recorded as "not yet surveyed /
--      not in demand register" with GPS, photo, ward, locality, house
--      number and landmark. Read-only register for Tax Daroga, City
--      Manager, Deputy Commissioner and Commissioner.
--   2) The collector's signed receiving copy of a printed demand
--      notice: at most 2 per notice, and once uploaded can never be
--      changed or removed (enforced by a trigger, so it holds even for
--      direct database edits made through the application's login).

CREATE TABLE unsurveyed_houses (
  id                        BIGSERIAL PRIMARY KEY,
  ward                      VARCHAR(16)  NOT NULL,
  locality                  VARCHAR(255) NOT NULL,
  address                   TEXT         NOT NULL,
  house_no                  VARCHAR(64),
  landmark                  TEXT,
  owner_name                VARCHAR(255),
  notes                     TEXT,
  latitude                  NUMERIC(10,6) NOT NULL,
  longitude                 NUMERIC(10,6) NOT NULL,
  photo_path                TEXT         NOT NULL,
  status                    VARCHAR(30)  NOT NULL DEFAULT 'not_yet_surveyed' CHECK (status IN ('not_yet_surveyed')),
  recorded_by_username      VARCHAR(100) NOT NULL,
  recorded_by_display_name  VARCHAR(255) NOT NULL,
  recorded_at               TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_unsurveyed_houses_ward ON unsurveyed_houses (ward);
CREATE INDEX idx_unsurveyed_houses_recorded_by ON unsurveyed_houses (recorded_by_username);

CREATE TABLE demand_notice_receiving_copies (
  id                          BIGSERIAL PRIMARY KEY,
  demand_no                   VARCHAR(32) NOT NULL REFERENCES demand_notices(demand_no),
  copy_no                     SMALLINT    NOT NULL CHECK (copy_no IN (1, 2)),
  photo_path                  TEXT        NOT NULL,
  latitude                    NUMERIC(10,6),
  longitude                   NUMERIC(10,6),
  uploaded_by_username        VARCHAR(100) NOT NULL,
  uploaded_by_display_name    VARCHAR(255) NOT NULL,
  uploaded_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (demand_no, copy_no)
);
CREATE INDEX idx_notice_receiving_copies_uploader ON demand_notice_receiving_copies (uploaded_by_username);

CREATE OR REPLACE FUNCTION forbid_receiving_copy_change() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'A receiving copy cannot be changed or removed once uploaded';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_receiving_copy_immutable
  BEFORE UPDATE OR DELETE ON demand_notice_receiving_copies
  FOR EACH ROW
  EXECUTE FUNCTION forbid_receiving_copy_change();
