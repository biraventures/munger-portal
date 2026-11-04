-- The Municipal Commissioner gives each ward to one Tax Surveyor. Field work in that ward then goes to that surveyor
-- automatically: remeasurement (property discrepancy) requests on creation, and new holding requests / mutations when
-- the Tax Daroga sends them to the field without naming a surveyor. The Tax Daroga can still move any of them.
CREATE TABLE IF NOT EXISTS tax_surveyor_wards (
  ward               VARCHAR(16) PRIMARY KEY,
  surveyor_username  VARCHAR(100) NOT NULL REFERENCES admins(username) ON UPDATE CASCADE ON DELETE CASCADE,
  assigned_by        VARCHAR(150),
  assigned_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tax_surveyor_wards_surveyor ON tax_surveyor_wards (surveyor_username);
DROP TRIGGER IF EXISTS tax_surveyor_wards_normalize_ward ON tax_surveyor_wards;
CREATE TRIGGER tax_surveyor_wards_normalize_ward BEFORE INSERT OR UPDATE OF ward ON tax_surveyor_wards FOR EACH ROW EXECUTE FUNCTION trg_normalize_ward();

-- The active Tax Surveyor of a ward (NULL when none).
CREATE OR REPLACE FUNCTION ward_surveyor(w TEXT) RETURNS TABLE (username VARCHAR, display_name VARCHAR) AS $$
  SELECT a.username, a.display_name
    FROM tax_surveyor_wards sw JOIN admins a ON a.username = sw.surveyor_username
   WHERE sw.ward = normalize_ward(w) AND a.role = 'tax_surveyor' AND a.active
   LIMIT 1
$$ LANGUAGE sql STABLE;

-- A new remeasurement request goes straight to its ward's surveyor.
CREATE OR REPLACE FUNCTION trg_discrepancy_ward_surveyor() RETURNS TRIGGER AS $$
DECLARE
  s RECORD;
BEGIN
  IF NEW.assigned_surveyor_username IS NULL AND NEW.current_stage = 'tax_surveyor' THEN
    SELECT ws.username, ws.display_name INTO s
      FROM properties p, LATERAL ward_surveyor(p.ward) ws WHERE p.holding_no = NEW.holding_no;
    IF FOUND THEN
      NEW.assigned_surveyor_username := s.username;
      NEW.assigned_surveyor_name := s.display_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_pdr_ward_surveyor ON property_discrepancy_requests;
CREATE TRIGGER trg_pdr_ward_surveyor BEFORE INSERT ON property_discrepancy_requests
  FOR EACH ROW EXECUTE FUNCTION trg_discrepancy_ward_surveyor();
