-- New payment mode: "District Treasury" (property tax and shop rent).
-- Such payments go through the district treasury rather than being
-- collected directly, and are identified by a T.V. (Treasury Voucher)
-- number with its date - both recorded here so a reprint can show
-- exactly what was captured at collection time, same as every other
-- payment detail. Nullable: only present when payment_mode is
-- 'District Treasury', enforced in the application layer rather than
-- a CHECK constraint so the set of modes stays a plain string, as it
-- already was.
ALTER TABLE transactions ADD COLUMN tv_number TEXT;
ALTER TABLE transactions ADD COLUMN tv_date DATE;

ALTER TABLE shop_rent_payments ADD COLUMN tv_number TEXT;
ALTER TABLE shop_rent_payments ADD COLUMN tv_date DATE;
