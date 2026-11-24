-- The shop's GPS location is required whenever a trade licence notice is issued (to find the business again);
-- the accuracy the phone reported is kept with it.
ALTER TABLE trade_license_surveys ADD COLUMN IF NOT EXISTS gps_accuracy_m NUMERIC(8,1);
