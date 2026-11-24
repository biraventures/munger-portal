-- Historical part payments on old holdings (historicalPayment.service.ts). Some old holdings carry large arrears though
-- the owner paid in parts over the years - amounts of the payer's choosing, not the annual tax. The Tax Daroga records
-- each old payment (date, amount, old receipt / register reference, proof); the payments are settled against the tax
-- year by year from the earliest pending year; the City Manager approves. Approval moves tax_paid_till_year to the
-- last year fully covered and leaves only the unpaid balance as the tax of a year paid in part (a one-year override
-- stage), so demand notices and payments then work as usual. Recorded in the holding history and payment history.
CREATE TABLE IF NOT EXISTS historical_payment_settlements (
  id                         BIGSERIAL PRIMARY KEY,
  holding_no                 VARCHAR(32) NOT NULL REFERENCES properties(holding_no) ON UPDATE CASCADE,
  status                     VARCHAR(12) NOT NULL DEFAULT 'pending',
  -- The holding as it stood when entered: approval refuses if it has changed since.
  previous_tax_paid_till_year VARCHAR(9),
  start_year                 SMALLINT NOT NULL,
  total_paid                 NUMERIC(14, 2) NOT NULL,
  -- Year-by-year settlement: [{year, tax, paid, balance, from: [{paymentId, amount}]}]
  statement                  JSONB NOT NULL,
  paid_till_year_after       VARCHAR(9),
  partial_year               SMALLINT,
  partial_paid               NUMERIC(14, 2),
  partial_balance            NUMERIC(14, 2),
  remarks                    TEXT,
  entered_by_username        VARCHAR(64) NOT NULL,
  entered_by_name            VARCHAR(255),
  entered_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by_username        VARCHAR(64),
  decided_by_name            VARCHAR(255),
  decided_at                 TIMESTAMPTZ,
  decision_remarks           TEXT,
  override_stage_id          BIGINT,
  CONSTRAINT hps_status_check CHECK (status IN ('pending', 'approved', 'returned'))
);
-- One open settlement per holding.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hps_one_pending ON historical_payment_settlements (holding_no) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_hps_holding ON historical_payment_settlements (holding_no, entered_at DESC);

CREATE TABLE IF NOT EXISTS historical_payments (
  id             BIGSERIAL PRIMARY KEY,
  settlement_id  BIGINT NOT NULL REFERENCES historical_payment_settlements(id) ON DELETE CASCADE,
  holding_no     VARCHAR(32) NOT NULL REFERENCES properties(holding_no) ON UPDATE CASCADE,
  paid_on        DATE NOT NULL,
  amount         NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  reference      VARCHAR(200) NOT NULL,
  remarks        TEXT,
  proof_path     TEXT
);
CREATE INDEX IF NOT EXISTS idx_historical_payments_holding ON historical_payments (holding_no, paid_on);

-- An approved settlement and its payments are permanent.
CREATE OR REPLACE FUNCTION hps_lock() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'approved' THEN RAISE EXCEPTION 'historical payment settlement %: approved, cannot be deleted', OLD.id; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'approved' THEN RAISE EXCEPTION 'historical payment settlement %: approved, cannot be changed', OLD.id; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_hps_lock ON historical_payment_settlements;
CREATE TRIGGER trg_hps_lock BEFORE UPDATE OR DELETE ON historical_payment_settlements FOR EACH ROW EXECUTE FUNCTION hps_lock();

CREATE OR REPLACE FUNCTION historical_payments_lock() RETURNS trigger AS $$
DECLARE st TEXT;
BEGIN
  SELECT status INTO st FROM historical_payment_settlements WHERE id = COALESCE(OLD.settlement_id, NEW.settlement_id);
  IF st = 'approved' THEN RAISE EXCEPTION 'historical payment: its settlement is approved, cannot be changed'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_historical_payments_lock ON historical_payments;
CREATE TRIGGER trg_historical_payments_lock BEFORE UPDATE OR DELETE ON historical_payments FOR EACH ROW EXECUTE FUNCTION historical_payments_lock();
