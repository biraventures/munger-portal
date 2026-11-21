-- Community halls: several rate options per hall (small hall, big hall, garden only, hall + garden ...), each with its
-- full-day rent, an optional half-day rent (morning or evening slot) and its own security deposit.
-- Different options of a hall may be booked on the same date - such bookings are flagged for the approving officer;
-- the same option cannot be held twice for the same slot.

CREATE TABLE IF NOT EXISTS hall_rate_options (
  id                SERIAL PRIMARY KEY,
  hall_id           INTEGER NOT NULL REFERENCES community_halls(id),
  name              VARCHAR(100) NOT NULL,
  name_hi           VARCHAR(100),
  full_day_rent     NUMERIC(10, 2) NOT NULL CHECK (full_day_rent >= 0),
  half_day_rent     NUMERIC(10, 2) CHECK (half_day_rent IS NULL OR half_day_rent >= 0),
  security_deposit  NUMERIC(10, 2) NOT NULL CHECK (security_deposit >= 0),
  sort_order        INTEGER NOT NULL DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hall_rate_option_name ON hall_rate_options (hall_id, lower(name)) WHERE active;

-- Every existing hall gets one option with its current rent and deposit.
INSERT INTO hall_rate_options (hall_id, name, full_day_rent, security_deposit)
SELECT h.id, 'Full hall', h.daily_rent, h.security_deposit
  FROM community_halls h
 WHERE NOT EXISTS (SELECT 1 FROM hall_rate_options o WHERE o.hall_id = h.id);

ALTER TABLE hall_bookings ADD COLUMN IF NOT EXISTS rate_option_id INTEGER REFERENCES hall_rate_options(id);
ALTER TABLE hall_bookings ADD COLUMN IF NOT EXISTS option_name VARCHAR(100);
-- full_day, or a half-day slot (one date only): morning / evening.
ALTER TABLE hall_bookings ADD COLUMN IF NOT EXISTS slot VARCHAR(8) NOT NULL DEFAULT 'full_day';
DO $$ BEGIN
  ALTER TABLE hall_bookings ADD CONSTRAINT hall_booking_slot
    CHECK (slot IN ('full_day', 'morning', 'evening') AND (slot = 'full_day' OR days = 1));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE hall_bookings b SET rate_option_id = o.id, option_name = o.name
  FROM hall_rate_options o WHERE o.hall_id = b.hall_id AND b.rate_option_id IS NULL;

COMMENT ON COLUMN hall_bookings.daily_rent IS 'Rent per day for a full-day booking; the half-day rent for a half-day (slot) booking.';
