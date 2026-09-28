-- One-time backfill for the reprint "only shows summary" gap: any
-- payment collected before migrations 024/025 introduced the frozen
-- arv/current_year_tax_net/previous_years_tax_base/total_fine_amount/
-- other_charges/arrear_stages_paid columns on transactions has those
-- columns sitting NULL, so getReceiptForReprint() correctly returns
-- breakdown: null and an empty arrearStagesPaid - the reprint then
-- shows only the bare total, by design (never inventing figures).
--
-- Where a transaction is linked to a demand notice (demand_no), the
-- exact figures it was collected against are still sitting untouched
-- on that demand_notices row (arv/current_year_tax_net/etc. have been
-- NOT NULL there since the very first schema migration), so those can
-- be safely copied across. This is a one-time UPDATE, not a live join
-- at read time - once run, the values are frozen on the transaction
-- row exactly like a payment made today, and this migration never
-- runs again. WHERE t.arv IS NULL guards against ever overwriting a
-- value that was itself already frozen (whether by migration 024's
-- original code path or by a previous run of this backfill).
--
-- Transactions with no demand_no (or a demand_no that no longer
-- resolves to a demand_notices row) are left untouched - there is
-- nothing on file to safely copy from, and it would be worse to
-- fabricate a figure than to leave the reprint showing only the total
-- it always showed. arrear_stages_paid (the structured per-period
-- table) also cannot be reconstructed after the fact and is
-- deliberately left NULL here; the pre-existing free-text
-- arrear_periods_paid column (on transactions since the original
-- schema) is exposed separately on the reprint as a fallback for
-- these older receipts - see getReceiptForReprint().
UPDATE transactions t
SET
  arv = dn.arv,
  current_year_tax_net = dn.current_year_tax_net,
  previous_years_tax_base = dn.previous_years_tax_base,
  total_fine_amount = dn.total_fine_amount,
  other_charges = dn.other_charges
FROM demand_notices dn
WHERE t.demand_no = dn.demand_no
  AND t.arv IS NULL;
