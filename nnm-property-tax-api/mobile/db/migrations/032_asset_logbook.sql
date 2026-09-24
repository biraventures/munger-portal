-- Daily operations logbook per asset - separate from
-- asset_maintenance_log (which records service/repair EVENTS, not
-- routine daily use). Some assets are tracked by odometer distance
-- (km), others by engine hour-meter (e.g. JCB/Poclain earthmoving
-- equipment, which doesn't travel road distance in the same sense) -
-- tracking_type on the asset itself determines which applies, set
-- once when the asset is registered.
--
-- reading is the absolute odometer/hour-meter value for that day (as
-- read directly off the instrument), not a daily delta - the
-- supervisor enters what they see on the gauge. Daily distance/hours
-- covered is derived by comparing consecutive days' readings, so
-- there's one source of truth and no risk of the delta and the
-- reading disagreeing with each other.
ALTER TABLE assets ADD COLUMN tracking_type VARCHAR(16) CHECK (tracking_type IN ('km', 'hours'));

CREATE TABLE asset_logbook (
  id            BIGSERIAL PRIMARY KEY,
  asset_id      BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  log_date      DATE NOT NULL,
  reading       NUMERIC(12,2) NOT NULL,
  recorded_by   VARCHAR(255) NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, log_date)
);
CREATE INDEX idx_asset_logbook_asset_date ON asset_logbook (asset_id, log_date DESC);
