-- Adds the second, market-scoped shop number (the "2 types of shop
-- numbers" - one within the market, one overall - discussed earlier
-- this session). The overall shop_no is derived from this value: for
-- market code "PBSM" and market_shop_number "15", shop_no is
-- "PBSM-15". This isn't enforced by a database constraint (market
-- codes live in application code, in constants/marketCodes.ts, not
-- the database), but shopCsvImport.service.ts and the single-shop
-- creation flow both derive shop_no this way going forward.
--
-- Nullable, since existing shops created before this migration don't
-- have a recorded market-scoped number even though their shop_no
-- already encodes one (e.g. "PBSM-15" implies market number 15) -
-- backfilled below by parsing the existing shop_no where it cleanly
-- splits on the last hyphen, rather than left blank for every
-- pre-existing shop.
ALTER TABLE shops ADD COLUMN market_shop_number VARCHAR(20);

UPDATE shops
SET market_shop_number = substring(shop_no from '-([^-]+)$')
WHERE shop_no ~ '-[^-]+$';
