-- Every change made by `npm run repair-paid-till` (blank tax-paid-till years of migrated holdings) is recorded here:
-- which year field changed, from what, to what, and why.
CREATE TABLE IF NOT EXISTS holding_year_repair_log (
  id              BIGSERIAL PRIMARY KEY,
  holding_no      VARCHAR(32) NOT NULL,
  field           TEXT NOT NULL,
  previous_value  TEXT,
  new_value       TEXT,
  reason          TEXT NOT NULL,
  run_by          TEXT,
  repaired_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_holding_year_repair_log_holding ON holding_year_repair_log (holding_no);
