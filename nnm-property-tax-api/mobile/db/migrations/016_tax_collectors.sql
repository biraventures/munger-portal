-- Tax Collector tracking for property tax payments. A tax collector is a
-- field agent who physically collects payment on behalf of the Nigam
-- (as opposed to an operator recording a counter payment, or a citizen
-- paying online themselves). Recording which collector was involved is
-- purely informational/accountability - it does not affect who the
-- payment is recorded as "collected_by" (the operator), and it is
-- always optional since most payments are not collector-mediated.

CREATE TABLE tax_collectors (
  id          BIGSERIAL PRIMARY KEY,
  code        VARCHAR(32) UNIQUE NOT NULL,
  name        VARCHAR(255) NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Denormalized name snapshot alongside the code, same reasoning as
-- staff_name/driver_name elsewhere in this codebase: a receipt should
-- keep showing the collector's name as it was at the time of payment,
-- even if that collector is later renamed or deactivated.
ALTER TABLE transactions ADD COLUMN tax_collector_code VARCHAR(32);
ALTER TABLE transactions ADD COLUMN tax_collector_name VARCHAR(255);