-- Garden entry tickets (garden.service.ts). Gardens with a paid entry (fee per person): the counter sells a ticket for
-- a number of persons (cash or the bank POS), the public can buy one by scanning the garden's QR code (online payment
-- through the garden's own gateway - kept apart from the property tax agency), and the gatekeeper scans the ticket's
-- QR once to admit. Garden counter staff have their own login role, with no access to anything else.

ALTER TABLE admins DROP CONSTRAINT admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('tax_daroga', 'tax_surveyor', 'tax_collector', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner', 'stall_prabhari', 'city_manager', 'trade_license_nodal', 'assistant_town_planning_supervisor', 'assistant_architect', 'je_mechanical', 'ae_mechanical', 'establishment_clerk', 'agency_team_leader', 'agency_project_manager', 'abhilekh_prabhari', 'agency_operator', 'map_section_nodal_clerk', 'garden_counter'));

CREATE TABLE IF NOT EXISTS gardens (
  id                      SERIAL PRIMARY KEY,
  name                    VARCHAR(150) NOT NULL UNIQUE,
  name_hi                 VARCHAR(150),
  -- In the public QR link (/garden/<code>); random so gardens cannot be guessed.
  code                    VARCHAR(16) NOT NULL UNIQUE,
  fee_per_person          NUMERIC(8, 2) NOT NULL CHECK (fee_per_person >= 0),
  max_persons_per_ticket  SMALLINT NOT NULL DEFAULT 50 CHECK (max_persons_per_ticket BETWEEN 1 AND 500),
  active                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_by              VARCHAR(64),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which garden a counter login works at (one garden per login).
CREATE TABLE IF NOT EXISTS garden_staff (
  admin_username  VARCHAR(64) PRIMARY KEY REFERENCES admins(username) ON UPDATE CASCADE ON DELETE CASCADE,
  garden_id       INT NOT NULL REFERENCES gardens(id),
  assigned_by     VARCHAR(64),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS garden_ticket_seq;

CREATE TABLE IF NOT EXISTS garden_tickets (
  id                BIGSERIAL PRIMARY KEY,
  ticket_no         VARCHAR(24) NOT NULL UNIQUE,
  garden_id         INT NOT NULL REFERENCES gardens(id),
  -- Valid on this Indian calendar date only.
  visit_date        DATE NOT NULL,
  persons           SMALLINT NOT NULL CHECK (persons BETWEEN 1 AND 500),
  fee_per_person    NUMERIC(8, 2) NOT NULL,
  amount            NUMERIC(10, 2) NOT NULL,
  channel           VARCHAR(10) NOT NULL CHECK (channel IN ('counter', 'online')),
  payment_mode      VARCHAR(10) NOT NULL CHECK (payment_mode IN ('cash', 'pos_card', 'pos_upi', 'online')),
  -- The bank POS slip's approval code / RRN, for a counter sale on the POS.
  pos_reference     VARCHAR(60),
  status            VARCHAR(16) NOT NULL DEFAULT 'paid' CHECK (status IN ('pending_payment', 'paid', 'failed', 'cancelled')),
  mobile            VARCHAR(10),
  sold_by_username  VARCHAR(64),
  sold_by_name      VARCHAR(255),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at           TIMESTAMPTZ,
  gateway_order_id  VARCHAR(80) UNIQUE,
  gateway_txn_id    VARCHAR(80),
  gateway_response  JSONB,
  used_at           TIMESTAMPTZ,
  used_by_username  VARCHAR(64),
  used_by_name      VARCHAR(255),
  cancelled_at      TIMESTAMPTZ,
  cancelled_by      VARCHAR(255),
  cancel_reason     TEXT,
  CONSTRAINT garden_ticket_pos_ref CHECK (payment_mode NOT IN ('pos_card', 'pos_upi') OR pos_reference IS NOT NULL),
  CONSTRAINT garden_ticket_amount CHECK (amount = round(persons * fee_per_person, 2))
);
CREATE INDEX IF NOT EXISTS idx_garden_tickets_day ON garden_tickets (garden_id, visit_date);
CREATE INDEX IF NOT EXISTS idx_garden_tickets_seller ON garden_tickets (sold_by_username, visit_date);
