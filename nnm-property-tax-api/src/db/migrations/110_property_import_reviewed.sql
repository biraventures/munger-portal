-- Tax Daroga marks each staged holding as reviewed; the City Manager can only integrate reviewed holdings.
ALTER TABLE property_import_staging
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
