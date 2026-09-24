-- =============================================================================
-- NNM Property Tax — initial schema
-- Mirrors the 7 active Google Sheets tabs from Code.gs (the "Arrears" tab is
-- explicitly legacy/unused in the source system and is not migrated).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- properties  (was: "Master" sheet — one row per property/holding)
-- ---------------------------------------------------------------------------
CREATE TABLE properties (
  holding_no                    VARCHAR(32) PRIMARY KEY,
  old_holding_no                VARCHAR(32),
  old_pid                       VARCHAR(32),

  owner_name                    VARCHAR(255) NOT NULL,
  relation_type                 VARCHAR(8) CHECK (relation_type IN ('S/O','D/O','W/O','C/O')),
  relation_name                 VARCHAR(255),
  mobile_no                     VARCHAR(15),

  area_sqft                     NUMERIC(12,2) NOT NULL DEFAULT 0,
  address                       TEXT NOT NULL,
  ward                          VARCHAR(16),
  zone                          VARCHAR(16),
  pincode                       VARCHAR(10),

  assessment_year               VARCHAR(9) NOT NULL,          -- "YYYY-YYYY"
  road_type                     VARCHAR(3) NOT NULL CHECK (road_type IN ('PMR','MR','OR')),
  vacant_area_sqft              NUMERIC(12,2) NOT NULL DEFAULT 0,

  rain_water_harvesting         BOOLEAN NOT NULL DEFAULT FALSE,
  solar_rooftop                 BOOLEAN NOT NULL DEFAULT FALSE, -- FROZEN: stored for history only, never applied

  arrear_tax                    NUMERIC(12,2) NOT NULL DEFAULT 0,

  solid_waste_charge_type       VARCHAR(128),
  solid_waste_months            SMALLINT NOT NULL DEFAULT 12,
  solid_waste_charge            NUMERIC(12,2) NOT NULL DEFAULT 0, -- derived; recomputed on write, cached for reporting

  penal_charge                  NUMERIC(12,2) NOT NULL DEFAULT 0,
  water_charge                  NUMERIC(12,2) NOT NULL DEFAULT 0,
  boring_charge                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  form_fee                      NUMERIC(12,2) NOT NULL DEFAULT 0,

  misc_cost                     NUMERIC(12,2) NOT NULL DEFAULT 0,
  misc_cost_reason              TEXT,
  misc_rebate                   NUMERIC(12,2) NOT NULL DEFAULT 0,
  misc_rebate_reason            TEXT,

  arv                           NUMERIC(14,2) NOT NULL DEFAULT 0, -- derived; recomputed on write, cached for reporting
  tax_payable                   NUMERIC(14,2) NOT NULL DEFAULT 0, -- derived; recomputed on write, cached for reporting

  holding_creation_year         VARCHAR(9) NOT NULL,           -- "YYYY-YYYY"
  tax_paid_till_year            VARCHAR(9),                    -- "YYYY-YYYY"
  present_holding_name          VARCHAR(255),
  present_category               VARCHAR(64),

  created_by                    VARCHAR(64) NOT NULL,
  created_date                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_modified_by              VARCHAR(64),
  last_modified_date            TIMESTAMPTZ,

  CONSTRAINT chk_solid_waste_months CHECK (solid_waste_months BETWEEN 1 AND 12)
);

CREATE INDEX idx_properties_owner_name  ON properties USING gin (to_tsvector('simple', owner_name));
CREATE INDEX idx_properties_old_holding ON properties (old_holding_no);
CREATE INDEX idx_properties_ward        ON properties (ward);
CREATE INDEX idx_properties_zone        ON properties (zone);

-- ---------------------------------------------------------------------------
-- floors  (was: "Floors" sheet — one row per floor/area on a property)
-- ---------------------------------------------------------------------------
CREATE TABLE floors (
  id                 BIGSERIAL PRIMARY KEY,
  holding_no         VARCHAR(32) NOT NULL REFERENCES properties(holding_no) ON DELETE CASCADE,
  floor_label        VARCHAR(64) NOT NULL,     -- e.g. "Ground Floor - 0"
  buildup_sqft       NUMERIC(12,2) NOT NULL DEFAULT 0,
  const_type         VARCHAR(16) NOT NULL CHECK (const_type IN ('RCC','Asbestos','Other')),
  usage_type         VARCHAR(255) NOT NULL,    -- must match USE_TYPE_MULTIPLIER keys — see src/constants/taxRates.ts
  occupancy          VARCHAR(8) NOT NULL DEFAULT 'self' CHECK (occupancy IN ('self','rented')),
  year_built         VARCHAR(9),               -- "YYYY-YYYY"; NULL = existed since holding_creation_year
  closing_year       VARCHAR(9),               -- "YYYY-YYYY"; NULL = still standing
  floor_arv          NUMERIC(14,2) NOT NULL DEFAULT 0, -- derived; recomputed on write, cached for reporting
  floor_tax          NUMERIC(14,2) NOT NULL DEFAULT 0  -- derived; recomputed on write, cached for reporting
);

CREATE INDEX idx_floors_holding_no ON floors (holding_no);

-- ---------------------------------------------------------------------------
-- tax_history_stages  (was: "TaxHistoryStages" sheet — one row per
-- historical rate-phase a holding has existed through; the source of
-- automatic arrear reconstruction)
-- ---------------------------------------------------------------------------
CREATE TABLE tax_history_stages (
  id                       BIGSERIAL PRIMARY KEY,
  holding_no               VARCHAR(32) NOT NULL REFERENCES properties(holding_no) ON DELETE CASCADE,
  period_of_assessment     VARCHAR(64) NOT NULL,   -- one of PERIOD_OF_ASSESSMENT_BUCKETS — see src/constants/taxRates.ts
  start_year_used          SMALLINT NOT NULL,
  closing_year             SMALLINT NOT NULL,
  arv_in_period            NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate_in_period       NUMERIC(6,4) NOT NULL,
  annual_tax_amount        NUMERIC(14,2) NOT NULL,
  years_count              SMALLINT NOT NULL,
  total_amount             NUMERIC(14,2) NOT NULL,
  override_reason          TEXT,
  override_remarks         TEXT,
  added_by                 VARCHAR(64) NOT NULL,
  added_date                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_history_override CHECK (
    (override_reason IS NULL AND override_remarks IS NULL) OR
    (override_reason IS NOT NULL AND override_remarks IS NOT NULL)
  )
);

CREATE INDEX idx_tax_history_holding_no ON tax_history_stages (holding_no);

-- ---------------------------------------------------------------------------
-- operators  (was: "Operators" sheet — counter login accounts)
-- ---------------------------------------------------------------------------
CREATE TABLE operators (
  id              BIGSERIAL PRIMARY KEY,
  username        VARCHAR(64) UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,      -- migrate as a bcrypt/argon2 hash, never the sheet's original hash scheme as-is
  display_name    VARCHAR(255) NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------------
-- transactions  (was: "Transactions" sheet — payment receipts)
-- ---------------------------------------------------------------------------
CREATE TABLE transactions (
  receipt_no            VARCHAR(32) PRIMARY KEY,
  holding_no             VARCHAR(32) NOT NULL REFERENCES properties(holding_no),
  txn_date               TIMESTAMPTZ NOT NULL DEFAULT now(),
  payment_mode           VARCHAR(32) NOT NULL,
  amount_received        NUMERIC(14,2) NOT NULL,
  collected_by            VARCHAR(64) NOT NULL,
  counter                VARCHAR(16),
  demand_no              VARCHAR(32),
  arrear_periods_paid    TEXT
);

CREATE INDEX idx_transactions_holding_no ON transactions (holding_no);
CREATE INDEX idx_transactions_date       ON transactions (txn_date);

-- ---------------------------------------------------------------------------
-- demand_notices  (was: "DemandNotices" sheet)
-- ---------------------------------------------------------------------------
CREATE TABLE demand_notices (
  demand_no                  VARCHAR(32) PRIMARY KEY,
  holding_no                  VARCHAR(32) NOT NULL REFERENCES properties(holding_no),
  notice_date                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by                VARCHAR(64) NOT NULL,
  arv                         NUMERIC(14,2) NOT NULL,
  current_year_tax_net        NUMERIC(14,2) NOT NULL,
  previous_years_tax_base     NUMERIC(14,2) NOT NULL,
  total_fine_amount           NUMERIC(14,2) NOT NULL,
  other_charges                NUMERIC(14,2) NOT NULL,
  total_amount_demanded       NUMERIC(14,2) NOT NULL
);

CREATE INDEX idx_demand_notices_holding_no ON demand_notices (holding_no);

-- ---------------------------------------------------------------------------
-- property_history  (was: "PropertyHistory" sheet — full audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE property_history (
  id                 BIGSERIAL PRIMARY KEY,
  holding_no         VARCHAR(32) NOT NULL REFERENCES properties(holding_no),
  version             INTEGER NOT NULL,
  action              VARCHAR(16) NOT NULL CHECK (action IN ('Created','Updated')),
  change_basis        VARCHAR(64),
  change_reference     TEXT,
  operator_name        VARCHAR(255) NOT NULL,
  ts                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot             JSONB NOT NULL,

  UNIQUE (holding_no, version)
);

CREATE INDEX idx_property_history_holding_no ON property_history (holding_no);