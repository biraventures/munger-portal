-- A citizen who cannot find the streetlight / High Mast / submersible in the list reports it by its GPS location
-- (standing at it), with a landmark. The City Manager verifies it: picks the registered asset at that spot (the
-- nearest ones are offered) and only then is the fault / issue created - or rejects it.
ALTER TABLE public_asset_reports
  ADD COLUMN IF NOT EXISTS reported_latitude   NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS reported_longitude  NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS reported_accuracy_m NUMERIC(8,1),
  ADD COLUMN IF NOT EXISTS landmark            TEXT,
  -- For a light reported by location: what the citizen says it is.
  ADD COLUMN IF NOT EXISTS reported_light_kind VARCHAR(12) CHECK (reported_light_kind IS NULL OR reported_light_kind IN ('streetlight', 'high_mast'));

ALTER TABLE public_asset_reports DROP CONSTRAINT IF EXISTS public_asset_reports_asset_check;
ALTER TABLE public_asset_reports ADD CONSTRAINT public_asset_reports_asset_check CHECK (
  (asset_type = 'light' AND pyau_id IS NULL AND (light_id IS NOT NULL OR reported_latitude IS NOT NULL)) OR
  (asset_type = 'pyau'  AND light_id IS NULL AND (pyau_id IS NOT NULL OR reported_latitude IS NOT NULL))
);
-- Approved means the asset was identified.
ALTER TABLE public_asset_reports DROP CONSTRAINT IF EXISTS public_asset_reports_approved_asset;
ALTER TABLE public_asset_reports ADD CONSTRAINT public_asset_reports_approved_asset CHECK (
  status <> 'approved' OR light_id IS NOT NULL OR pyau_id IS NOT NULL
);
