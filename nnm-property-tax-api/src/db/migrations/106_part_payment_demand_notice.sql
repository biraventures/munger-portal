-- Part payment: a demand notice that clears only the first N unpaid (arrear) years. Paying it advances
-- the holding's tax_paid_till_year to paid_through_year (instead of the notice's assessment year).
ALTER TABLE demand_notices
  ADD COLUMN IF NOT EXISTS part_payment BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS paid_through_year TEXT;
