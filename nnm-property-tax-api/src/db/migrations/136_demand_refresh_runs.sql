-- Monthly demand refresh (bulk demand notice regeneration) runs - the automatic one on the 1st of every month and any
-- started by hand from Bulk Demand Notice Generation. Progress is written here as the job goes, so the page can show it.
CREATE TABLE IF NOT EXISTS demand_refresh_runs (
  id          BIGSERIAL PRIMARY KEY,
  run_month   CHAR(7) NOT NULL,                       -- IST month the run regenerates for, e.g. 2026-11
  trigger     VARCHAR(10) NOT NULL CHECK (trigger IN ('schedule', 'manual')),
  started_by  VARCHAR(100) NOT NULL,
  status      VARCHAR(12) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'interrupted')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  total       INTEGER,
  processed   INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0,
  errors      JSONB NOT NULL DEFAULT '[]'::jsonb,     -- first 500 failures: [{holdingNo, message}]
  message     TEXT
);
CREATE INDEX IF NOT EXISTS idx_demand_refresh_runs_month ON demand_refresh_runs (run_month, trigger, status);
