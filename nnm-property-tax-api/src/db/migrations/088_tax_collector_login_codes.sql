-- Auto-generated TC code for each real Tax Collector LOGIN account
-- (role = 'tax_collector' on admins - see migration 060 and
-- scripts/create-admin.ts, which now generates this code at account
-- creation time). This is what citizens/operators enter on the
-- payment flow going forward, verified against an active login
-- account rather than the free-standing directory below.
ALTER TABLE admins ADD COLUMN tax_collector_code VARCHAR(8) UNIQUE;

-- Drop the old, free-standing "tax collector" directory (migration
-- 016) - a reference/tracking list with no login attached, built
-- before the real login-based Tax Collector role existed (migration
-- 060). It had no purpose beyond payment-attribution codes, which the
-- column above now covers directly on the real account, so it's
-- removed rather than kept unused. Its ward-tag table (migration 017)
-- depends on it and goes first; the login-based equivalent
-- (tax_collector_login_wards, migration 077) is untouched.
-- transactions.tax_collector_code / tax_collector_name are historical
-- snapshots of past payments and are untouched too - they simply stop
-- being fed from this table going forward.
DROP TABLE IF EXISTS tax_collector_wards;
DROP TABLE IF EXISTS tax_collectors;
