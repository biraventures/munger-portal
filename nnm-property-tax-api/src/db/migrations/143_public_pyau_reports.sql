-- Citizens can report a non-working submersible (pyau) from the public site, identified by a holding number and the
-- mobile registered on it (same check as the public streetlight reports). A public report has no staff login, so
-- reported_by_user_id becomes optional and the report carries the citizen's mobile, holding and the problem seen.
ALTER TABLE pyau_issues ALTER COLUMN reported_by_user_id DROP NOT NULL;
ALTER TABLE pyau_issues
  ADD COLUMN IF NOT EXISTS reported_by_type VARCHAR(16) NOT NULL DEFAULT 'staff' CHECK (reported_by_type IN ('staff', 'public')),
  ADD COLUMN IF NOT EXISTS reporter_phone VARCHAR(15),
  ADD COLUMN IF NOT EXISTS reporter_holding_no VARCHAR(32),
  ADD COLUMN IF NOT EXISTS reported_problem VARCHAR(24)
    CHECK (reported_problem IS NULL OR reported_problem IN ('no_water','motor_not_running','starter_switch','pipe_leak','tap_broken','tank_overflow','other')),
  ADD COLUMN IF NOT EXISTS reported_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE pyau_issues ADD CONSTRAINT pyau_issues_reporter_check
  CHECK (reported_by_type <> 'staff' OR reported_by_user_id IS NOT NULL) NOT VALID;
CREATE INDEX IF NOT EXISTS idx_pyau_issues_reporter_phone ON pyau_issues (reporter_phone, reported_at) WHERE reporter_phone IS NOT NULL;
