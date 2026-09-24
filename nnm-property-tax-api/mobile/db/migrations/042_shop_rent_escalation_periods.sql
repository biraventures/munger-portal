-- A shop's rent history as a sequence of dated periods, mirroring the
-- existing tax_history_stages pattern used for property tax (see
-- src/types/property.types.ts's TaxHistoryStageRow and
-- arrears.service.ts's header comment for that precedent). Each row
-- is one "chapter": a base rent that applied from a start date,
-- optionally escalating by a fixed percentage every N years, until
-- either superseded by the next period or still ongoing
-- (period_end_date IS NULL - the same convention Floors already use
-- for closing_year on a floor that hasn't been demolished/replaced).
--
-- This is ADDITIVE to the existing rent_pre_2019 / rent_2019_20 /
-- rent_2020_21_onwards fields on shop_agreements, not a replacement -
-- those stay as the record of the old municipality-wide revision.
-- Escalation periods only get entered for a shop once someone
-- actually reviews its paper agreement and knows its real terms; a
-- shop with no periods on file simply falls back to the old fixed
-- formula (see rentCalculation.service.ts). This lets shops be
-- "upgraded" to accurate per-agreement calculation one at a time
-- rather than requiring an all-at-once migration.
--
-- Deliberately no auto-generation of these rows (unlike
-- tax_history_stages, which the system can derive automatically in
-- some cases) - every agreement's escalation terms are unique and
-- need a human to read the actual paper agreement, so these are
-- always manually entered.
CREATE TABLE shop_rent_escalation_periods (
  id                          BIGSERIAL PRIMARY KEY,
  shop_no                     VARCHAR(32) NOT NULL REFERENCES shops(shop_no),
  period_start_date           DATE NOT NULL,
  period_end_date             DATE,
  base_rent                   NUMERIC(10,2) NOT NULL,
  -- Both nullable and BOTH must be set together or both left unset -
  -- an unresolved escalation rule is recorded as "we know the base
  -- rent starting this date, but not yet how/whether it escalates"
  -- rather than guessing, per NNM's explicit instruction not to
  -- default to any percentage.
  escalation_percent          NUMERIC(5,2),
  escalation_interval_years   INTEGER,
  source_note                 TEXT NOT NULL,
  added_by                    VARCHAR(255) NOT NULL,
  added_date                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end_date IS NULL OR period_end_date > period_start_date),
  CHECK ((escalation_percent IS NULL) = (escalation_interval_years IS NULL))
);
CREATE INDEX idx_shop_rent_escalation_periods_shop_no ON shop_rent_escalation_periods (shop_no, period_start_date);
