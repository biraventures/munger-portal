-- Freezes the tax breakdown (ARV, current year tax, arrears base,
-- fine, other charges) directly onto the transaction row at the
-- moment of payment, instead of reconstructing it later by joining to
-- the linked demand notice. The join-based approach was fragile - if
-- that lookup ever failed for any reason, a reprint would silently
-- fall back to a bare summary with no breakdown at all, even though
-- the immediate post-payment receipt (which uses the freshly
-- computed data, not a later lookup) always showed the full detail.
-- Storing a permanent copy at payment time guarantees every future
-- reprint shows exactly what the citizen was actually charged,
-- regardless of what happens to the original demand notice later.
ALTER TABLE transactions ADD COLUMN arv NUMERIC(14,2);
ALTER TABLE transactions ADD COLUMN current_year_tax_net NUMERIC(14,2);
ALTER TABLE transactions ADD COLUMN previous_years_tax_base NUMERIC(14,2);
ALTER TABLE transactions ADD COLUMN total_fine_amount NUMERIC(14,2);
ALTER TABLE transactions ADD COLUMN other_charges NUMERIC(14,2);
