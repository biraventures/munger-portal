-- Bulk holding uploads are held here for review (Tax Daroga / City Manager) before they go live.
-- Nothing in these tables affects the live property data until a batch (or some of its holdings) is integrated.
CREATE TABLE IF NOT EXISTS property_import_batches (
  id                 SERIAL PRIMARY KEY,
  data_source_name   TEXT NOT NULL,
  file_name          TEXT,
  uploaded_by        TEXT NOT NULL,
  uploaded_by_role   TEXT NOT NULL,
  uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'discarded')),
  total_holdings     INTEGER NOT NULL DEFAULT 0,
  upload_errors      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- rows that could not be staged (missing holding no, duplicates, orphans)
  integrating_since  TIMESTAMPTZ,                          -- set while an integration run is in progress
  last_run_summary   JSONB,                                -- result of the latest integration run
  last_run_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS property_import_staging (
  id            BIGSERIAL PRIMARY KEY,
  batch_id      INTEGER NOT NULL REFERENCES property_import_batches(id) ON DELETE CASCADE,
  holding_no    TEXT NOT NULL,
  owner_name    TEXT,
  ward          TEXT,
  area_sqft     NUMERIC,
  floors_count  INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'excluded', 'integrated', 'failed')),
  exclude_reason TEXT,
  issues        JSONB NOT NULL DEFAULT '[]'::jsonb,        -- [{severity: 'block'|'warn', message}]
  has_blocker   BOOLEAN NOT NULL DEFAULT FALSE,
  master        JSONB,                                      -- the Master row; cleared once integrated or discarded
  sheets        JSONB,                                      -- the other sheets' rows for this holding
  error         TEXT,
  integrated_at TIMESTAMPTZ,
  integrated_by TEXT,
  UNIQUE (batch_id, holding_no)
);
CREATE INDEX IF NOT EXISTS idx_property_import_staging_batch_status ON property_import_staging (batch_id, status);
