-- Penalty and Outstanding Demand — fold directly into the current year's
-- net tax before rebate/late-fee timing, same as Code.gs's
-- computeTotals_(): netCurrentBeforeTiming = CurrentTax - Rebate +
-- Penalty + ODmd. Distinct from penal_charge (a flat "other charge"
-- added after timing, unaffected by rebate/late-fee).
ALTER TABLE properties ADD COLUMN penalty NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN outstanding_demand NUMERIC(12,2) NOT NULL DEFAULT 0;