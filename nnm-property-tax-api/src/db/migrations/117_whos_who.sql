-- Who's Who page on the public website.
-- Workflow (mirrors the paper form): an operator enters the official's signed
-- form -> the City Manager verifies it -> the Deputy Municipal Commissioner
-- publishes it. Either reviewer can send an entry back to the operator.
--
-- A change (transfer, new number, end of term) is entered as a NEW row with
-- replaces_id pointing at the published entry; when the new row is published
-- the old one is archived in the same transaction, so the public page never
-- shows a gap or a duplicate.
--
-- Photo and the scanned signed form are stored in the row (bytea), same as
-- public_documents - this app has no separate file storage. The signed form
-- (which carries the official's consent to publish) is never served publicly.
CREATE TABLE whos_who_entries (
  id                    BIGSERIAL PRIMARY KEY,
  designation           TEXT NOT NULL,
  ward_no               SMALLINT,
  area_charge           VARCHAR(150),
  name_en               VARCHAR(150) NOT NULL,
  name_hi               VARCHAR(150),
  date_assumed_office   DATE NOT NULL,
  contact_number        VARCHAR(15) NOT NULL,
  contact_is_personal   BOOLEAN NOT NULL DEFAULT FALSE,
  email                 VARCHAR(200),
  public_message        TEXT,

  photo_mime            VARCHAR(50) NOT NULL,
  photo_data            BYTEA NOT NULL,
  signed_form_name      VARCHAR(255) NOT NULL,
  signed_form_mime      VARCHAR(100) NOT NULL,
  signed_form_data      BYTEA NOT NULL,
  form_no               VARCHAR(50),

  status                TEXT NOT NULL DEFAULT 'pending_verification',
  replaces_id           BIGINT REFERENCES whos_who_entries(id) ON DELETE SET NULL,

  entered_by            VARCHAR(150) NOT NULL,
  entered_by_key        TEXT NOT NULL,
  entered_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by           VARCHAR(150),
  verified_at           TIMESTAMPTZ,
  verification_checks   JSONB,
  published_by          VARCHAR(150),
  published_at          TIMESTAMPTZ,
  returned_by           VARCHAR(150),
  returned_at           TIMESTAMPTZ,
  return_reason         TEXT,
  archived_by           VARCHAR(150),
  archived_at           TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT whos_who_designation_check CHECK (designation IN (
    'mayor', 'deputy_mayor', 'municipal_commissioner', 'deputy_municipal_commissioner',
    'city_manager', 'apswmo', 'assistant_architect', 'assistant_town_planning_supervisor',
    'head_clerk', 'ward_councillor')),
  CONSTRAINT whos_who_status_check CHECK (status IN (
    'pending_verification', 'pending_publication', 'returned', 'published', 'archived')),
  CONSTRAINT whos_who_ward_check CHECK (
    (designation = 'ward_councillor' AND ward_no BETWEEN 1 AND 45)
    OR (designation <> 'ward_councillor' AND ward_no IS NULL)),
  CONSTRAINT whos_who_contact_check CHECK (contact_number ~ '^[0-9]{10,12}$')
);

CREATE INDEX idx_whos_who_status ON whos_who_entries (status);
CREATE INDEX idx_whos_who_entered_by ON whos_who_entries (entered_by_key);

-- One published holder at a time for single-seat posts (each ward counts as its own seat).
CREATE UNIQUE INDEX uq_whos_who_single_seat_published
  ON whos_who_entries (designation, COALESCE(ward_no, 0))
  WHERE status = 'published'
    AND designation IN ('mayor', 'deputy_mayor', 'municipal_commissioner', 'ward_councillor');
