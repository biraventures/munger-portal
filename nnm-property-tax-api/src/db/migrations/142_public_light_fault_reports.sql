-- Public reports of non-working streetlights / High Masts (publicLightFault.service.ts): the citizen identifies
-- himself with a holding number + the mobile number on that holding, and gives the switch status he saw.
ALTER TABLE light_faults
  ADD COLUMN IF NOT EXISTS reporter_holding_no VARCHAR(32),
  ADD COLUMN IF NOT EXISTS reported_switch_status VARCHAR(16)
    CHECK (reported_switch_status IS NULL OR reported_switch_status IN ('working', 'not_working', 'automatic', 'joint', 'unknown'));
CREATE INDEX IF NOT EXISTS idx_light_faults_reporter_phone ON light_faults (reporter_phone, reported_at) WHERE reporter_phone IS NOT NULL;
