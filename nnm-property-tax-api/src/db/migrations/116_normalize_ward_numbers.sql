-- Ward numbers "01" and "1" were being stored as different wards. A ward is
-- now always stored in one canonical form: trimmed, upper-case, with leading
-- zeros removed ("01" -> "1", "007" -> "7", "0" stays "0", "01a" -> "1A").
-- A trigger on every property-side table that stores a ward applies this to
-- every insert/update, whichever screen, import or script wrote the row, and
-- existing rows are fixed below.
CREATE OR REPLACE FUNCTION normalize_ward(w TEXT) RETURNS TEXT AS $$
  SELECT CASE
    WHEN w IS NULL THEN NULL
    WHEN btrim(w) = '' THEN NULL
    ELSE regexp_replace(upper(regexp_replace(btrim(w), '\s+', ' ', 'g')), '^0+(?=.)', '')
  END
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION trg_normalize_ward() RETURNS trigger AS $$
BEGIN
  NEW.ward := normalize_ward(NEW.ward);
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- A collector tagged to both "01" and "1" would collide once normalized: keep one.
DELETE FROM tax_collector_login_wards a
 USING tax_collector_login_wards b
 WHERE a.tax_collector_username = b.tax_collector_username
   AND normalize_ward(a.ward) = normalize_ward(b.ward)
   AND a.ward > b.ward;

UPDATE properties                 SET ward = normalize_ward(ward) WHERE ward IS DISTINCT FROM normalize_ward(ward);
UPDATE migrated_holding_surveys   SET ward = normalize_ward(ward) WHERE ward IS DISTINCT FROM normalize_ward(ward);
UPDATE tax_collector_login_wards  SET ward = normalize_ward(ward) WHERE ward IS DISTINCT FROM normalize_ward(ward);
UPDATE unsurveyed_houses          SET ward = normalize_ward(ward) WHERE ward IS DISTINCT FROM normalize_ward(ward);
UPDATE property_import_staging    SET ward = normalize_ward(ward) WHERE ward IS DISTINCT FROM normalize_ward(ward);

CREATE TRIGGER properties_normalize_ward                BEFORE INSERT OR UPDATE OF ward ON properties                FOR EACH ROW EXECUTE FUNCTION trg_normalize_ward();
CREATE TRIGGER migrated_holding_surveys_normalize_ward  BEFORE INSERT OR UPDATE OF ward ON migrated_holding_surveys  FOR EACH ROW EXECUTE FUNCTION trg_normalize_ward();
CREATE TRIGGER tax_collector_login_wards_normalize_ward BEFORE INSERT OR UPDATE OF ward ON tax_collector_login_wards FOR EACH ROW EXECUTE FUNCTION trg_normalize_ward();
CREATE TRIGGER unsurveyed_houses_normalize_ward         BEFORE INSERT OR UPDATE OF ward ON unsurveyed_houses         FOR EACH ROW EXECUTE FUNCTION trg_normalize_ward();
CREATE TRIGGER property_import_staging_normalize_ward   BEFORE INSERT OR UPDATE OF ward ON property_import_staging   FOR EACH ROW EXECUTE FUNCTION trg_normalize_ward();
