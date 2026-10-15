-- Notional ARV of vacant land (vacant-land tax x 100/9), stored separately from
-- the built-up ARV in `arv` so the two can be shown and reported on their own.
-- Existing rows get 0 / NULL: properties pick the figure up on their next save
-- (or via the backfill script), frozen notices and receipts keep what was issued.
ALTER TABLE properties     ADD COLUMN IF NOT EXISTS vacant_arv NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE demand_notices ADD COLUMN IF NOT EXISTS vacant_arv NUMERIC(14,2);
ALTER TABLE transactions   ADD COLUMN IF NOT EXISTS vacant_arv NUMERIC(14,2);
