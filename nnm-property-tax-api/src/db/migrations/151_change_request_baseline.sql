-- "Before" snapshot on every change request, so each desk in the chain (and anyone looking later, after the change
-- was applied) can compare the proposal against the record exactly as it stood when the request was made.
-- Taken by triggers - no application code can forget it:
--   * when the request is created, and
--   * again when a reverted request is resubmitted (the record may have changed meanwhile).
-- baseline_data = { "taken_at": ..., "property": <properties row>, "floors": [<floors rows>] }   (holding requests)
--               = { "taken_at": ..., "shop": <shops row>, "agreement": <shop_agreements row or null> } (shop requests)

ALTER TABLE property_change_requests      ADD COLUMN IF NOT EXISTS baseline_data JSONB;
ALTER TABLE property_discrepancy_requests ADD COLUMN IF NOT EXISTS baseline_data JSONB;
ALTER TABLE shop_agreement_change_requests ADD COLUMN IF NOT EXISTS baseline_data JSONB;
ALTER TABLE shop_edit_requests            ADD COLUMN IF NOT EXISTS baseline_data JSONB;

CREATE OR REPLACE FUNCTION holding_snapshot(h VARCHAR) RETURNS JSONB AS $$
  SELECT jsonb_build_object(
           'taken_at', now(),
           'property', to_jsonb(p),
           'floors', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM floors f WHERE f.holding_no = p.holding_no), '[]'::jsonb))
    FROM properties p WHERE p.holding_no = h
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION shop_snapshot(s VARCHAR, agreement INTEGER) RETURNS JSONB AS $$
  SELECT jsonb_build_object(
           'taken_at', now(),
           'shop', (SELECT to_jsonb(sh) FROM shops sh WHERE sh.shop_no = s),
           'agreement', COALESCE(
             (SELECT to_jsonb(a) FROM shop_agreements a WHERE a.id = agreement),
             (SELECT to_jsonb(a) FROM shop_agreements a WHERE a.shop_no = s AND a.status = 'active' ORDER BY a.id DESC LIMIT 1)))
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION set_holding_baseline() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (OLD.status = 'reverted' AND NEW.status = 'pending') THEN
    NEW.baseline_data := holding_snapshot(NEW.holding_no);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_shop_agreement_baseline() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (OLD.status = 'reverted' AND NEW.status = 'pending') THEN
    NEW.baseline_data := shop_snapshot(NEW.shop_no, NEW.agreement_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_shop_edit_baseline() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (OLD.status = 'reverted' AND NEW.status = 'pending') THEN
    NEW.baseline_data := shop_snapshot(NEW.shop_no, NULL);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pcr_baseline ON property_change_requests;
CREATE TRIGGER trg_pcr_baseline BEFORE INSERT OR UPDATE OF status ON property_change_requests
  FOR EACH ROW EXECUTE FUNCTION set_holding_baseline();
DROP TRIGGER IF EXISTS trg_pdr_baseline ON property_discrepancy_requests;
CREATE TRIGGER trg_pdr_baseline BEFORE INSERT OR UPDATE OF status ON property_discrepancy_requests
  FOR EACH ROW EXECUTE FUNCTION set_holding_baseline();
DROP TRIGGER IF EXISTS trg_sacr_baseline ON shop_agreement_change_requests;
CREATE TRIGGER trg_sacr_baseline BEFORE INSERT OR UPDATE OF status ON shop_agreement_change_requests
  FOR EACH ROW EXECUTE FUNCTION set_shop_agreement_baseline();
DROP TRIGGER IF EXISTS trg_ser_baseline ON shop_edit_requests;
CREATE TRIGGER trg_ser_baseline BEFORE INSERT OR UPDATE OF status ON shop_edit_requests
  FOR EACH ROW EXECUTE FUNCTION set_shop_edit_baseline();

-- Requests still open have not changed the record yet, so today's record is their "before".
UPDATE property_change_requests      SET baseline_data = holding_snapshot(holding_no) WHERE baseline_data IS NULL AND status IN ('pending', 'reverted');
UPDATE property_discrepancy_requests SET baseline_data = holding_snapshot(holding_no) WHERE baseline_data IS NULL AND status IN ('pending', 'reverted');
UPDATE shop_agreement_change_requests SET baseline_data = shop_snapshot(shop_no, agreement_id) WHERE baseline_data IS NULL AND status IN ('pending', 'reverted');
UPDATE shop_edit_requests            SET baseline_data = shop_snapshot(shop_no, NULL) WHERE baseline_data IS NULL AND status = 'pending';

-- Streetlight / High Mast change requests: the light as it stood when the request was made.
ALTER TABLE light_change_requests ADD COLUMN IF NOT EXISTS baseline_data JSONB;
CREATE OR REPLACE FUNCTION set_light_baseline() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.light_id IS NOT NULL THEN
    NEW.baseline_data := (SELECT jsonb_build_object('taken_at', now(), 'light', to_jsonb(l)) FROM lights l WHERE l.id = NEW.light_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_lcr_baseline ON light_change_requests;
CREATE TRIGGER trg_lcr_baseline BEFORE INSERT ON light_change_requests FOR EACH ROW EXECUTE FUNCTION set_light_baseline();
UPDATE light_change_requests r SET baseline_data = jsonb_build_object('taken_at', now(), 'light', to_jsonb(l))
  FROM lights l WHERE l.id = r.light_id AND r.baseline_data IS NULL AND r.status = 'pending';
