-- Holdings that have no total area or no floor details cannot be assessed, so tax must not be collected on
-- them until a surveyor has re-surveyed them. This extends the existing survey workflow (survey_status,
-- migration 057): a flagged holding is put on the 'to_be_surveyed' worklist AND blocked from demand notices
-- and payment (counter, online, QR) until the survey is recorded and the missing details are in.
--
--   resurvey_required   TRUE while collection is blocked
--   resurvey_reason     what is missing (shown to staff)
--   resurvey_flagged_at when it was flagged
ALTER TABLE properties ADD COLUMN IF NOT EXISTS resurvey_required   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS resurvey_reason     TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS resurvey_flagged_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_properties_resurvey_required ON properties (holding_no) WHERE resurvey_required;

-- What is missing for a holding, or NULL when it is complete. A vacant plot (vacant area recorded, no built
-- floor) legitimately has no floors, so it is not treated as incomplete.
CREATE OR REPLACE FUNCTION holding_incomplete_reason(h VARCHAR) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN COALESCE(p.vacant_area_sqft, 0) > 0 AND NOT x.has_floor THEN NULL
    WHEN COALESCE(p.area_sqft, 0) <= 0 AND NOT x.has_floor THEN 'Total area and floor details are missing'
    WHEN COALESCE(p.area_sqft, 0) <= 0 THEN 'Total area is missing'
    WHEN NOT x.has_floor THEN 'Floor details are missing'
    ELSE NULL
  END
  FROM properties p,
       LATERAL (SELECT EXISTS (SELECT 1 FROM floors f WHERE f.holding_no = p.holding_no AND f.buildup_sqft > 0) AS has_floor) x
  WHERE p.holding_no = h
$$;

-- Flags every incomplete holding (or only the given ones) for resurvey. Holdings already in the survey
-- workflow (survey_status set, e.g. partially-known entries) are left alone. Returns how many were flagged.
CREATE OR REPLACE FUNCTION flag_incomplete_holdings_for_resurvey(only_holdings TEXT[] DEFAULT NULL) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE properties p
     SET resurvey_required = TRUE,
         resurvey_reason = r.reason,
         resurvey_flagged_at = now(),
         survey_status = 'to_be_surveyed'
    FROM (SELECT q.holding_no, holding_incomplete_reason(q.holding_no) AS reason
            FROM properties q
           WHERE (only_holdings IS NULL OR q.holding_no = ANY (only_holdings))) r
   WHERE p.holding_no = r.holding_no
     AND r.reason IS NOT NULL
     AND NOT p.resurvey_required
     AND p.survey_status IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- One-time: holdings already integrated.
DO $$
DECLARE n INTEGER;
BEGIN
  n := flag_incomplete_holdings_for_resurvey();
  RAISE NOTICE 'Holdings flagged for resurvey (missing area and/or floors): %', n;
END $$;
