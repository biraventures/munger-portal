-- Electric crematorium tickets (crematorium.service.ts) and community hall bookings (communityHall.service.ts).
--
-- Crematorium: each Crematorium Counter login cuts a ticket per cremation - deceased, informant, relation, address,
-- phone, date and time - for the fee the Municipal Commissioner sets, paid in cash or on the bank POS. The Crematorium
-- Prabhari monitors all tickets and counters.
--
-- Community halls: the Municipal Commissioner sets each hall's daily rent and refundable security deposit. The public
-- applies for whole days; the Community Hall Prabhari (or the Commissioner) approves; the applicant then pays (online
-- through the halls' own gateway once it is set up, or at the office) and the booking is confirmed. The deposit is
-- settled after the function.

ALTER TABLE admins DROP CONSTRAINT admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('tax_daroga', 'tax_surveyor', 'tax_collector', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner', 'stall_prabhari', 'city_manager', 'trade_license_nodal', 'assistant_town_planning_supervisor', 'assistant_architect', 'je_mechanical', 'ae_mechanical', 'establishment_clerk', 'agency_team_leader', 'agency_project_manager', 'abhilekh_prabhari', 'agency_operator', 'map_section_nodal_clerk', 'garden_counter', 'crematorium_counter', 'crematorium_prabhari', 'community_hall_prabhari'));

-- ---------- crematorium ----------

-- The fee per cremation, as set by the Municipal Commissioner over time (the latest row is the current fee).
CREATE TABLE IF NOT EXISTS crematorium_fees (
  id             SERIAL PRIMARY KEY,
  amount         NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  remarks        TEXT,
  set_by         VARCHAR(64) NOT NULL,
  set_by_name    VARCHAR(255),
  set_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS crematorium_ticket_seq;

CREATE TABLE IF NOT EXISTS crematorium_tickets (
  id                  BIGSERIAL PRIMARY KEY,
  ticket_no           VARCHAR(24) NOT NULL UNIQUE,
  deceased_name       VARCHAR(150) NOT NULL,
  informant_name      VARCHAR(150) NOT NULL,
  informant_relation  VARCHAR(60) NOT NULL,
  informant_address   TEXT NOT NULL,
  informant_phone     VARCHAR(10) NOT NULL CHECK (informant_phone ~ '^[6-9][0-9]{9}$'),
  cremation_date      DATE NOT NULL,
  cremation_time      TIME NOT NULL,
  remarks             TEXT,
  amount              NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  payment_mode        VARCHAR(10) NOT NULL CHECK (payment_mode IN ('cash', 'pos_card', 'pos_upi')),
  -- The bank POS slip's approval code / RRN.
  pos_reference       VARCHAR(60),
  status              VARCHAR(10) NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled')),
  issued_by           VARCHAR(64) NOT NULL,
  issued_by_name      VARCHAR(255),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at        TIMESTAMPTZ,
  cancelled_by        VARCHAR(64),
  cancelled_by_name   VARCHAR(255),
  cancel_reason       TEXT,
  CONSTRAINT crematorium_ticket_pos_ref CHECK (payment_mode = 'cash' OR pos_reference IS NOT NULL),
  CONSTRAINT crematorium_ticket_cancel CHECK (status <> 'cancelled' OR (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_crematorium_tickets_date ON crematorium_tickets (cremation_date);
CREATE INDEX IF NOT EXISTS idx_crematorium_tickets_issued ON crematorium_tickets (issued_by, created_at);

-- ---------- community halls ----------

CREATE TABLE IF NOT EXISTS community_halls (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(150) NOT NULL UNIQUE,
  name_hi           VARCHAR(150),
  address           TEXT,
  capacity          INTEGER CHECK (capacity IS NULL OR capacity > 0),
  facilities        TEXT,
  daily_rent        NUMERIC(10, 2) NOT NULL CHECK (daily_rent >= 0),
  security_deposit  NUMERIC(10, 2) NOT NULL CHECK (security_deposit >= 0),
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        VARCHAR(64),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS hall_booking_seq;

CREATE TABLE IF NOT EXISTS hall_bookings (
  id                  BIGSERIAL PRIMARY KEY,
  booking_no          VARCHAR(24) NOT NULL UNIQUE,
  hall_id             INTEGER NOT NULL REFERENCES community_halls(id),
  from_date           DATE NOT NULL,
  to_date             DATE NOT NULL,
  days                INTEGER NOT NULL CHECK (days BETWEEN 1 AND 15),
  applicant_name      VARCHAR(150) NOT NULL,
  applicant_phone     VARCHAR(10) NOT NULL CHECK (applicant_phone ~ '^[6-9][0-9]{9}$'),
  applicant_address   TEXT NOT NULL,
  purpose             VARCHAR(200) NOT NULL,
  expected_guests     INTEGER CHECK (expected_guests IS NULL OR expected_guests > 0),
  -- Rent and deposit as they were when applied (the Commissioner may change the rates later).
  daily_rent          NUMERIC(10, 2) NOT NULL,
  rent_amount         NUMERIC(10, 2) NOT NULL,
  deposit_amount      NUMERIC(10, 2) NOT NULL,
  total_amount        NUMERIC(10, 2) NOT NULL,
  -- applied -> approved (pay by payment_due_date) -> confirmed; or rejected / cancelled / expired (not paid in time).
  status              VARCHAR(12) NOT NULL DEFAULT 'applied'
                      CHECK (status IN ('applied', 'approved', 'confirmed', 'rejected', 'cancelled', 'expired')),
  decided_at          TIMESTAMPTZ,
  decided_by          VARCHAR(64),
  decided_by_name     VARCHAR(255),
  decision_remarks    TEXT,
  payment_due_date    DATE,
  paid_at             TIMESTAMPTZ,
  payment_channel     VARCHAR(8) CHECK (payment_channel IN ('office', 'online')),
  payment_mode        VARCHAR(10) CHECK (payment_mode IN ('cash', 'pos_card', 'pos_upi', 'dd', 'online')),
  payment_reference   VARCHAR(80),
  payment_recorded_by VARCHAR(255),
  gateway_order_id    VARCHAR(80) UNIQUE,
  gateway_txn_id      VARCHAR(80),
  gateway_response    JSONB,
  cancelled_at        TIMESTAMPTZ,
  cancelled_by_name   VARCHAR(255),
  cancel_reason       TEXT,
  -- The security deposit after the function: held until settled - refunded in full, or with a deduction (reason kept).
  deposit_status      VARCHAR(10) NOT NULL DEFAULT 'none' CHECK (deposit_status IN ('none', 'held', 'settled')),
  deposit_refunded    NUMERIC(10, 2),
  deposit_deducted    NUMERIC(10, 2),
  deposit_remarks     TEXT,
  deposit_settled_at  TIMESTAMPTZ,
  deposit_settled_by  VARCHAR(255),
  -- [{at, action, by, role, note}] - every step, for the audit trail.
  events              JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hall_booking_dates CHECK (to_date >= from_date AND days = (to_date - from_date) + 1),
  CONSTRAINT hall_booking_amounts CHECK (rent_amount = round(daily_rent * days, 2) AND total_amount = rent_amount + deposit_amount),
  CONSTRAINT hall_booking_deposit CHECK (deposit_status <> 'settled' OR (deposit_refunded + deposit_deducted = deposit_amount))
);
CREATE INDEX IF NOT EXISTS idx_hall_bookings_hall_dates ON hall_bookings (hall_id, from_date, to_date);
CREATE INDEX IF NOT EXISTS idx_hall_bookings_status ON hall_bookings (status);
CREATE INDEX IF NOT EXISTS idx_hall_bookings_phone ON hall_bookings (applicant_phone);
