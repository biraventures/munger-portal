-- Complaints from the public website (non-working streetlight / High Mast / submersible) are first verified by the City
-- Manager (Asset Management login). Until then they live only here: no light_faults / pyau_issues row exists, so the
-- contractor does not see them, the 72-hour repair clock and penalties do not start and the dashboards still count the
-- asset as working. Approval creates the ordinary fault / issue (assigned to the ward's contractor) and links it here;
-- rejection records the reason, which the citizen sees under "My reports".
CREATE TABLE IF NOT EXISTS public_asset_reports (
  id                    BIGSERIAL PRIMARY KEY,
  asset_type            VARCHAR(8)  NOT NULL CHECK (asset_type IN ('light', 'pyau')),
  light_id              BIGINT REFERENCES lights(id) ON DELETE CASCADE,
  pyau_id               BIGINT REFERENCES pyaus(id) ON DELETE CASCADE,
  ward_id               BIGINT NOT NULL REFERENCES attendance_wards(id) ON DELETE CASCADE,
  reporter_phone        VARCHAR(15) NOT NULL,
  reporter_holding_no   VARCHAR(32) NOT NULL,
  non_functional_since  DATE NOT NULL,
  -- Streetlight / High Mast: the switch status the citizen saw. Submersible: the problem seen.
  switch_status         VARCHAR(16) CHECK (switch_status IS NULL OR switch_status IN ('working','not_working','automatic','joint','unknown')),
  problem               VARCHAR(24) CHECK (problem IS NULL OR problem IN ('no_water','motor_not_running','starter_switch','pipe_leak','tap_broken','tank_overflow','other')),
  remarks               TEXT,
  status                VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reported_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by_user_id   BIGINT REFERENCES attendance_users(id),
  verified_at           TIMESTAMPTZ,
  verification_remarks  TEXT,
  light_fault_id        BIGINT REFERENCES light_faults(id) ON DELETE SET NULL,
  pyau_issue_id         BIGINT REFERENCES pyau_issues(id) ON DELETE SET NULL,
  CONSTRAINT public_asset_reports_asset_check CHECK (
    (asset_type = 'light' AND light_id IS NOT NULL AND pyau_id IS NULL) OR
    (asset_type = 'pyau'  AND pyau_id IS NOT NULL AND light_id IS NULL)
  ),
  CONSTRAINT public_asset_reports_reject_reason CHECK (status <> 'rejected' OR verification_remarks IS NOT NULL)
);
-- At most one complaint per asset waiting for the City Manager.
CREATE UNIQUE INDEX IF NOT EXISTS uq_public_reports_pending_light ON public_asset_reports (light_id) WHERE status = 'pending' AND light_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_public_reports_pending_pyau ON public_asset_reports (pyau_id) WHERE status = 'pending' AND pyau_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_public_reports_status ON public_asset_reports (status, reported_at);
CREATE INDEX IF NOT EXISTS idx_public_reports_phone ON public_asset_reports (reporter_phone, reported_at);
