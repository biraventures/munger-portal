-- Preference-based shop rental intake - replaces picking one specific
-- vacant shop with expressing acceptable markets + a size range + a
-- bid, so applicants aren't forced to submit one application per shop
-- and the UI doesn't need to render every vacant shop as a button.
-- This sits BEFORE the existing 5-stage approval chain
-- (SHOP_APPROVAL_STAGE_ORDER), not instead of it: once an admin
-- manually allots a specific shop to a preference (see
-- shopRentalPreference.service.ts's allotPreference), that creates a
-- normal shop_rental_applications row via the existing
-- submitRentalApplication flow, which still goes through the full
-- approval chain exactly as before. Nothing about agreement approval
-- changes - this only replaces how the applicant's initial intent is
-- captured before a specific shop is picked for them.

CREATE TABLE shop_rental_preferences (
  id                          BIGSERIAL PRIMARY KEY,
  applicant_name              VARCHAR(200) NOT NULL,
  applicant_relation_type     VARCHAR(50),
  applicant_relation_name     VARCHAR(200),
  applicant_mobile            VARCHAR(20),
  applicant_address           TEXT,
  applicant_id_proof_number   VARCHAR(100),
  applicant_business_name     VARCHAR(200),
  applicant_property_holding_no VARCHAR(50),
  min_area_sqft                NUMERIC(10,2) NOT NULL,
  max_area_sqft                NUMERIC(10,2) NOT NULL,
  bid_amount                   NUMERIC(10,2) NOT NULL,
  status                       VARCHAR(16) NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'allotted', 'rejected', 'withdrawn')),
  -- Set together at the moment of allotment (see allotPreference) -
  -- allotted_shop_no records what was actually picked even if the
  -- resulting application later gets rejected further down the
  -- approval chain, so the allotment decision itself stays visible.
  allotted_shop_no             VARCHAR(32) REFERENCES shops(shop_no),
  allotted_application_id      INTEGER REFERENCES shop_rental_applications(id),
  requested_by                 VARCHAR(200) NOT NULL,
  requested_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by                   VARCHAR(200),
  decided_at                   TIMESTAMPTZ,
  decision_notes                TEXT,
  CHECK (max_area_sqft >= min_area_sqft)
);
CREATE INDEX idx_shop_rental_preferences_status ON shop_rental_preferences (status);

-- Which markets a preference is willing to accept - a true
-- many-to-many, since an applicant can list several. market_name is
-- plain text matching shops.market_name, not a foreign key - markets
-- have no dedicated table anywhere else in this system either (see
-- shopRepository.listDistinctMarketNames / KNOWN_MARKET_CODES).
CREATE TABLE shop_rental_preference_markets (
  preference_id   BIGINT NOT NULL REFERENCES shop_rental_preferences(id),
  market_name     VARCHAR(200) NOT NULL,
  PRIMARY KEY (preference_id, market_name)
);
