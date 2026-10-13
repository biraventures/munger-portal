-- Two enforcement modules sharing media storage and fines:
--   * Encroachment removal (City Manager): temporary encroachments (24-hour notice, then fine) and permanent
--     encroachments (a numbered case with notice, Amin measurement report and a final order).
--   * Mobile court (APSWMO): notice to waste-management violators, then fines for repeat violations.
-- Both log in through the attendance login (city_manager / apswmo already exist there). Two field-staff
-- roles are added so each officer can have staff who capture cases and evidence; only the officer imposes fines.

ALTER TABLE attendance_users DROP CONSTRAINT attendance_users_role_check;
ALTER TABLE attendance_users ADD CONSTRAINT attendance_users_role_check
  CHECK (role IN (
    'jamadar', 'driver_supervisor', 'sanitation_officer', 'sanitation_prabhari', 'attendance_admin',
    'junior_engineer', 'assistant_engineer_mechanical', 'maintenance_nodal_clerk',
    'streetlight_contractor', 'streetlight_je', 'streetlight_ae', 'streetlight_nodal_clerk',
    'city_manager', 'deputy_municipal_commissioner', 'municipal_commissioner',
    'pyau_je', 'pyau_ae', 'pyau_contractor', 'apswmo',
    'ward_parshad', 'mayor', 'deputy_mayor',
    'encroachment_staff', 'mobile_court_staff'
  ));

-- Photos and videos (notices, miking videos, evidence, signed copies, Amin reports). Files live on disk.
CREATE TABLE enforcement_media (
  id                BIGSERIAL PRIMARY KEY,
  module            VARCHAR(16)  NOT NULL CHECK (module IN ('encroachment', 'mobile_court')),
  kind              VARCHAR(8)   NOT NULL CHECK (kind IN ('photo', 'video', 'document')),
  purpose           VARCHAR(40)  NOT NULL,
  file_path         VARCHAR(500) NOT NULL,
  mime_type         VARCHAR(100) NOT NULL,
  size_bytes        BIGINT       NOT NULL,
  latitude          NUMERIC(10,6),
  longitude         NUMERIC(10,6),
  uploaded_by       VARCHAR(100) NOT NULL,
  uploaded_by_name  VARCHAR(255) NOT NULL,
  uploaded_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Running numbers for case / fine numbers, one counter per prefix and financial year.
CREATE TABLE enforcement_counters (
  counter_key  VARCHAR(40) PRIMARY KEY,
  last_value   INTEGER NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------------ Encroachment
CREATE TABLE encroachment_cases (
  id                  BIGSERIAL PRIMARY KEY,
  case_no             VARCHAR(40) NOT NULL UNIQUE,
  kind                VARCHAR(12) NOT NULL CHECK (kind IN ('temporary', 'permanent')),
  status              VARCHAR(24) NOT NULL CHECK (status IN (
    'registered', 'notice_issued', 'notice_served', 'removed', 'fine_imposed',
    'measurement_pending', 'ready_for_order', 'order_passed', 'closed'
  )),
  ward                VARCHAR(16),
  location_text       TEXT NOT NULL,
  description         TEXT NOT NULL,
  latitude            NUMERIC(10,6) NOT NULL,
  longitude           NUMERIC(10,6) NOT NULL,
  encroacher_name     VARCHAR(255) NOT NULL,
  encroacher_phone    VARCHAR(20)  NOT NULL,
  encroacher_address  TEXT,
  photo_media_id      BIGINT REFERENCES enforcement_media(id),
  created_by          VARCHAR(100) NOT NULL,
  created_by_name     VARCHAR(255) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at          TIMESTAMPTZ,
  removal_media_id    BIGINT REFERENCES enforcement_media(id),
  removal_remarks     TEXT
);
CREATE INDEX idx_encroachment_cases_kind_status ON encroachment_cases (kind, status);
CREATE INDEX idx_encroachment_cases_creator ON encroachment_cases (created_by);

-- Temporary: the 24-hour notice (proof = photo of the notice OR video of miking in the area).
-- Permanent: the notice signed by the City Manager, then served (proof = photo of the signed copy).
CREATE TABLE encroachment_notices (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL REFERENCES encroachment_cases(id),
  notice_type     VARCHAR(20) NOT NULL CHECK (notice_type IN ('temporary_24h', 'permanent')),
  notice_text     TEXT,
  proof_mode      VARCHAR(16) CHECK (proof_mode IN ('notice_photo', 'miking_video', 'signed_copy')),
  proof_media_id  BIGINT REFERENCES enforcement_media(id),
  issued_by_name  VARCHAR(255) NOT NULL,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  served_at       TIMESTAMPTZ,
  served_by_name  VARCHAR(255),
  deadline_at     TIMESTAMPTZ
);
CREATE INDEX idx_encroachment_notices_case ON encroachment_notices (case_id);

-- Permanent: the office order asking the Amin for a measurement report, and the report when it comes.
CREATE TABLE encroachment_measurement_orders (
  id                  BIGSERIAL PRIMARY KEY,
  case_id             BIGINT NOT NULL REFERENCES encroachment_cases(id),
  amin_name           VARCHAR(255) NOT NULL,
  order_text          TEXT NOT NULL,
  due_date            DATE,
  issued_by_name      VARCHAR(255) NOT NULL,
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  report_text         TEXT,
  report_media_id     BIGINT REFERENCES enforcement_media(id),
  report_received_at  TIMESTAMPTZ,
  report_recorded_by  VARCHAR(255)
);
CREATE INDEX idx_encroachment_orders_case ON encroachment_measurement_orders (case_id);

-- Permanent: the City Manager's final order.
CREATE TABLE encroachment_final_orders (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL UNIQUE REFERENCES encroachment_cases(id),
  decision        VARCHAR(20) NOT NULL CHECK (decision IN ('removal', 'no_action', 'other')),
  order_text      TEXT NOT NULL,
  order_date      DATE NOT NULL,
  passed_by_name  VARCHAR(255) NOT NULL,
  passed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE encroachment_events (
  id          BIGSERIAL PRIMARY KEY,
  case_id     BIGINT NOT NULL REFERENCES encroachment_cases(id),
  action      VARCHAR(40) NOT NULL,
  detail      TEXT,
  actor_name  VARCHAR(255) NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_encroachment_events_case ON encroachment_events (case_id);

-- ------------------------------------------------------------------ Mobile court
-- Library of miking videos kept for the notices.
CREATE TABLE mobile_court_miking_videos (
  id               BIGSERIAL PRIMARY KEY,
  title            VARCHAR(255) NOT NULL,
  area_text        TEXT NOT NULL,
  ward             VARCHAR(16),
  recorded_on      DATE NOT NULL,
  message_text     TEXT,
  media_id         BIGINT NOT NULL REFERENCES enforcement_media(id),
  uploaded_by_name VARCHAR(255) NOT NULL,
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mobile_court_cases (
  id               BIGSERIAL PRIMARY KEY,
  case_no          VARCHAR(40) NOT NULL UNIQUE,
  status           VARCHAR(20) NOT NULL CHECK (status IN ('recorded', 'noticed', 'complied', 'violated_again', 'fined', 'closed')),
  violator_name    VARCHAR(255) NOT NULL,
  violator_phone   VARCHAR(20)  NOT NULL,
  violator_email   VARCHAR(255) NOT NULL,
  violation_type   VARCHAR(80)  NOT NULL,
  description      TEXT,
  ward             VARCHAR(16),
  location_text    TEXT NOT NULL,
  latitude         NUMERIC(10,6) NOT NULL,
  longitude        NUMERIC(10,6) NOT NULL,
  evidence_media_id BIGINT REFERENCES enforcement_media(id),
  created_by       VARCHAR(100) NOT NULL,
  created_by_name  VARCHAR(255) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mobile_court_cases_status ON mobile_court_cases (status);
CREATE INDEX idx_mobile_court_cases_phone ON mobile_court_cases (violator_phone);
CREATE INDEX idx_mobile_court_cases_creator ON mobile_court_cases (created_by);

CREATE TABLE mobile_court_notices (
  id                BIGSERIAL PRIMARY KEY,
  case_id           BIGINT NOT NULL REFERENCES mobile_court_cases(id),
  notice_text       TEXT NOT NULL,
  rectify_within_days INTEGER NOT NULL CHECK (rectify_within_days BETWEEN 1 AND 90),
  miking_video_id   BIGINT REFERENCES mobile_court_miking_videos(id),
  issued_by_name    VARCHAR(255) NOT NULL,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mobile_court_notices_case ON mobile_court_notices (case_id);

-- Re-inspection after a notice: complied, or violated again (which is what allows a fine).
CREATE TABLE mobile_court_followups (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL REFERENCES mobile_court_cases(id),
  outcome         VARCHAR(16) NOT NULL CHECK (outcome IN ('complied', 'violated_again')),
  remarks         TEXT,
  evidence_media_id BIGINT REFERENCES enforcement_media(id),
  latitude        NUMERIC(10,6),
  longitude       NUMERIC(10,6),
  recorded_by_name VARCHAR(255) NOT NULL,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mobile_court_followups_case ON mobile_court_followups (case_id);

CREATE TABLE mobile_court_events (
  id          BIGSERIAL PRIMARY KEY,
  case_id     BIGINT NOT NULL REFERENCES mobile_court_cases(id),
  action      VARCHAR(40) NOT NULL,
  detail      TEXT,
  actor_name  VARCHAR(255) NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mobile_court_events_case ON mobile_court_events (case_id);

-- ------------------------------------------------------------------ Fines (both modules)
-- The officer types the amount and the legal basis (Act / section) each time. Payment is online only, through
-- the POS machine; until the POS is integrated with the payment gateway the officer records the POS transaction
-- reference by hand (pos_txn_ref). payment_mode can only ever be POS_ONLINE.
CREATE TABLE enforcement_fines (
  id               BIGSERIAL PRIMARY KEY,
  fine_no          VARCHAR(40) NOT NULL UNIQUE,
  module           VARCHAR(16) NOT NULL CHECK (module IN ('encroachment', 'mobile_court')),
  encroachment_case_id BIGINT REFERENCES encroachment_cases(id),
  mobile_court_case_id BIGINT REFERENCES mobile_court_cases(id),
  payer_name       VARCHAR(255) NOT NULL,
  payer_phone      VARCHAR(20)  NOT NULL,
  payer_email      VARCHAR(255),
  violation_type   VARCHAR(120) NOT NULL,
  latitude         NUMERIC(10,6) NOT NULL,
  longitude        NUMERIC(10,6) NOT NULL,
  amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  legal_basis      TEXT NOT NULL,
  reason           TEXT NOT NULL,
  imposed_by_name  VARCHAR(255) NOT NULL,
  imposed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status           VARCHAR(10) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  payment_mode     VARCHAR(12) CHECK (payment_mode = 'POS_ONLINE'),
  pos_txn_ref      VARCHAR(100),
  paid_at          TIMESTAMPTZ,
  payment_recorded_by VARCHAR(255),
  CHECK ((module = 'encroachment' AND encroachment_case_id IS NOT NULL AND mobile_court_case_id IS NULL)
      OR (module = 'mobile_court'  AND mobile_court_case_id IS NOT NULL AND encroachment_case_id IS NULL)),
  CHECK (status = 'unpaid' OR (payment_mode IS NOT NULL AND pos_txn_ref IS NOT NULL AND paid_at IS NOT NULL))
);
-- One fine per case: a second would let the same violation be charged twice.
CREATE UNIQUE INDEX uq_fine_per_encroachment_case ON enforcement_fines (encroachment_case_id) WHERE encroachment_case_id IS NOT NULL;
CREATE UNIQUE INDEX uq_fine_per_mobile_court_case ON enforcement_fines (mobile_court_case_id) WHERE mobile_court_case_id IS NOT NULL;
CREATE UNIQUE INDEX uq_fine_pos_txn_ref ON enforcement_fines (pos_txn_ref) WHERE pos_txn_ref IS NOT NULL;
