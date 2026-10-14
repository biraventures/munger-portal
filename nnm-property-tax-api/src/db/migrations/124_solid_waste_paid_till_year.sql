-- Solid waste user charge: how far it has been paid. NULL = unknown, which is treated as "paid till 2025-2026",
-- so the charge is calculated automatically from 2026-2027 onwards. When a year is entered, the annual charge is due
-- for every year after it up to the current assessment year. The number of months is no longer used (annual charge).
ALTER TABLE properties ADD COLUMN IF NOT EXISTS solid_waste_paid_till_year VARCHAR(9);

-- One row per full payment that advanced the user-charge paid-till year, so cancelling the receipt can restore it.
CREATE TABLE IF NOT EXISTS solid_waste_payment_log (
  id              BIGSERIAL PRIMARY KEY,
  receipt_no      TEXT NOT NULL,
  holding_no      VARCHAR(32) NOT NULL REFERENCES properties(holding_no) ON DELETE CASCADE,
  previous_paid_till_year VARCHAR(9),
  new_paid_till_year      VARCHAR(9) NOT NULL,
  amount          NUMERIC(14,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_swpl_receipt ON solid_waste_payment_log (receipt_no);
