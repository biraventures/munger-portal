-- The plinth-area / rain-water-harvesting rebate (see
-- taxCalculation.service.ts's calc.rebate / calc.rebateReason) was
-- already being subtracted correctly when computing the current
-- year's tax - it was just never shown as its own line anywhere on
-- the demand notice, so the floorwise table's "before rebate" total
-- never visibly reconciled with the final "Tax Amount - Current Year"
-- figure a few lines below it (reported against demand notice
-- 817/Demand/29/09/2026: floorwise total 13656.40 vs Current Year Tax
-- 12973.58, a silent 682.82 = 5% rain-water-harvesting rebate). The
-- live receipt already showed this correctly (payment.service.ts's
-- totals.rebate); the demand notice never captured it at all.
--
-- Frozen here on both documents (same "compute once, never re-derive
-- on reprint" principle as migrations 024/086) so a reprint later
-- shows the exact same rebate line the original document did.
ALTER TABLE demand_notices ADD COLUMN area_rebate NUMERIC(12,2);
ALTER TABLE demand_notices ADD COLUMN area_rebate_reason TEXT;
ALTER TABLE transactions ADD COLUMN area_rebate NUMERIC(12,2);
ALTER TABLE transactions ADD COLUMN area_rebate_reason TEXT;
