-- Face-verified attendance for Safai field staff (field_staff).
-- The face engine is a self-hosted CompreFace on the APP server; faces are stored there as "subjects"
-- (subject name = 'staff-<field_staff.id>'). This schema only tracks who is enrolled, the one-time liveness
-- challenges, and every face punch / manual override for audit and review.

-- One active enrolment per worker. Enrolled by Sanitation Prabhari / APSWMO / Sanitation Officer / Attendance Admin
-- (deliberately not the ward Jamadar, who marks the same worker daily).
CREATE TABLE IF NOT EXISTS face_enrolments (
  id                    BIGSERIAL PRIMARY KEY,
  staff_id              BIGINT NOT NULL REFERENCES field_staff(id) ON DELETE CASCADE,
  subject               VARCHAR(64) NOT NULL,
  image_ids             TEXT[] NOT NULL DEFAULT '{}',   -- CompreFace example ids
  photo_path            TEXT,                           -- front photo kept for display (relative to PHOTO_UPLOAD_DIR)
  consent_recorded      BOOLEAN NOT NULL,
  enrolled_by_username  VARCHAR(64) NOT NULL,
  enrolled_by_role      VARCHAR(32) NOT NULL,
  enrolled_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  removed_by_username   VARCHAR(64),
  removed_at            TIMESTAMPTZ,
  CONSTRAINT face_enrolment_consent CHECK (consent_recorded)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_face_enrolment_active ON face_enrolments (staff_id) WHERE active;

-- Single-use liveness challenge: the server picks the head-turn direction, so a pre-recorded clip or a held-up
-- photo cannot be prepared for it. Expires after 2 minutes.
CREATE TABLE IF NOT EXISTS face_challenges (
  id           UUID PRIMARY KEY,
  username     VARCHAR(64) NOT NULL,
  staff_id     BIGINT NOT NULL REFERENCES field_staff(id) ON DELETE CASCADE,
  purpose      VARCHAR(8) NOT NULL CHECK (purpose IN ('in', 'out', 'enrol')),
  direction    VARCHAR(8) NOT NULL CHECK (direction IN ('left', 'right')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_face_challenges_created ON face_challenges (created_at);

-- Every face attempt and every manual mark of an enrolled worker.
--  verified           face matched + liveness passed -> attendance marked
--  rejected           face did not match / liveness failed -> nothing marked
--  manual_override    enrolled worker marked without face (reason required) -> marked, flagged for review
--  manual_not_enrolled worker had no face enrolled yet -> marked as before (not flagged)
CREATE TABLE IF NOT EXISTS face_punches (
  id                 BIGSERIAL PRIMARY KEY,
  staff_id           BIGINT NOT NULL REFERENCES field_staff(id) ON DELETE CASCADE,
  ward_id            BIGINT,
  attendance_date    DATE NOT NULL,
  action             VARCHAR(8) NOT NULL CHECK (action IN ('in', 'out')),
  outcome            VARCHAR(24) NOT NULL CHECK (outcome IN ('verified', 'rejected', 'manual_override', 'manual_not_enrolled')),
  similarity_front   NUMERIC(6, 4),
  similarity_turn    NUMERIC(6, 4),
  yaw_front          NUMERIC(7, 2),
  yaw_turn           NUMERIC(7, 2),
  challenge_direction VARCHAR(8),
  reject_reason      TEXT,
  override_reason    TEXT,
  photo_path         TEXT,
  marked_by_username VARCHAR(64) NOT NULL,
  marked_by_role     VARCHAR(32) NOT NULL,
  review_status      VARCHAR(12) NOT NULL DEFAULT 'none' CHECK (review_status IN ('none', 'pending', 'accepted', 'rejected')),
  reviewed_by        VARCHAR(64),
  reviewed_at        TIMESTAMPTZ,
  review_remarks     TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_face_punches_date ON face_punches (attendance_date, ward_id);
CREATE INDEX IF NOT EXISTS idx_face_punches_review ON face_punches (review_status) WHERE review_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_face_punches_staff ON face_punches (staff_id, attendance_date);
