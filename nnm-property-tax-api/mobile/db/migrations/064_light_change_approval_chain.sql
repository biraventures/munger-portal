-- Soft delete for lights - a hard DELETE would orphan any existing
-- light_faults history referencing it (light_faults.light_id has no
-- ON DELETE behavior specified, so it would simply fail once a fault
-- exists). deleted_at keeps the row and its fault history intact
-- while removing it from the active registry.
ALTER TABLE lights ADD COLUMN deleted_at TIMESTAMPTZ;

-- Adding a light, changing its functionality status (switch_status),
-- deactivating/reactivating it, or deleting it now requires a
-- 3-stage approval: the requester (streetlight_je, streetlight_ae,
-- streetlight_nodal_clerk, or streetlight_contractor) proposes the
-- change, city_manager approves first, then
-- deputy_municipal_commissioner, then municipal_commissioner
-- finalizes it - at which point the change is actually applied to
-- the lights table. Any stage may reject instead, ending the
-- request. proposed_data holds what's needed per action_type: full
-- light details for 'add', {switchStatus} for 'status_change', and
-- nothing (just reason) for 'deactivate'/'reactivate'/'delete'.
CREATE TABLE light_change_requests (
  id                  BIGSERIAL PRIMARY KEY,
  action_type         VARCHAR(20) NOT NULL CHECK (action_type IN ('add', 'status_change', 'deactivate', 'reactivate', 'delete')),
  light_id            BIGINT REFERENCES lights(id),
  proposed_data        JSONB,
  reason              TEXT NOT NULL,
  requested_by_user_id BIGINT NOT NULL REFERENCES attendance_users(id),
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  current_stage       VARCHAR(32) NOT NULL DEFAULT 'city_manager' CHECK (current_stage IN ('city_manager', 'deputy_municipal_commissioner', 'municipal_commissioner')),
  final_decided_at    TIMESTAMPTZ,
  reviewed_by_user_id BIGINT REFERENCES attendance_users(id),
  reviewed_at         TIMESTAMPTZ,
  review_notes        TEXT
);
CREATE INDEX idx_light_change_requests_status ON light_change_requests (status, current_stage);
CREATE INDEX idx_light_change_requests_light ON light_change_requests (light_id);

-- Full audit trail - every stage's decision, not just the most recent
-- (which light_change_requests' own reviewed_* columns capture for
-- the CURRENT/final stage only). Mirrors the change_request_approvals
-- pattern already used for property mutations.
CREATE TABLE light_change_approvals (
  id                  BIGSERIAL PRIMARY KEY,
  request_id          BIGINT NOT NULL REFERENCES light_change_requests(id),
  stage               VARCHAR(32) NOT NULL,
  decision            VARCHAR(20) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_by_user_id  BIGINT NOT NULL REFERENCES attendance_users(id),
  decided_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes               TEXT
);
CREATE INDEX idx_light_change_approvals_request ON light_change_approvals (request_id);
