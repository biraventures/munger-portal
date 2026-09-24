-- A Tax Collector LOGIN account (admins.role = 'tax_collector') can be
-- tagged to one or more wards for their field collection work -
-- alongside their existing assigned City Manager (who reviews their
-- cancellation requests, a separate concern), on the same Tax
-- Collector Assignments page (Commissioner-only).
--
-- Deliberately a different table from tax_collector_wards (migration
-- 017), which tags wards to the older, separate tax_collectors
-- payment-attribution records (code + name, not a login) - these are
-- two different "Tax Collector" concepts in this schema. Ward is
-- stored as free text matching properties.ward, same reasoning as
-- migration 017: there is no canonical ward list elsewhere in this
-- schema.
CREATE TABLE tax_collector_login_wards (
  tax_collector_username VARCHAR(64) NOT NULL REFERENCES admins(username) ON DELETE CASCADE,
  ward                    VARCHAR(16) NOT NULL,
  PRIMARY KEY (tax_collector_username, ward)
);
CREATE INDEX idx_tax_collector_login_wards_ward ON tax_collector_login_wards (ward);
