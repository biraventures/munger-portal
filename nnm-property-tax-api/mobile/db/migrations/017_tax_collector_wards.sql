-- Ward tagging for tax collectors. A collector can only be used for
-- payments on properties in wards they've been explicitly tagged for -
-- tagging itself is managed exclusively by the Tax Daroga role (see
-- requireAdminRole("tax_daroga") on the tagging endpoint). Untagged
-- collectors can be created by any admin, but can't actually be used
-- for a payment until Tax Daroga assigns them at least one ward.

CREATE TABLE tax_collector_wards (
  id                BIGSERIAL PRIMARY KEY,
  tax_collector_id  BIGINT NOT NULL REFERENCES tax_collectors(id) ON DELETE CASCADE,
  -- Matches properties.ward's type exactly (VARCHAR(16), free text -
  -- there is no canonical ward list elsewhere in this schema).
  ward              VARCHAR(16) NOT NULL,
  UNIQUE (tax_collector_id, ward)
);

CREATE INDEX idx_tax_collector_wards_collector ON tax_collector_wards (tax_collector_id);