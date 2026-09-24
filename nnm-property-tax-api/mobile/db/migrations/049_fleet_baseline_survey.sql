-- Fleet Baseline Survey - the comprehensive "opening entry" for each
-- asset's logbook, per the JE-led survey of the vehicle/equipment
-- fleet. Builds directly on the existing fleet foundation (migration
-- 028's assets table, 032's asset_logbook for ongoing daily
-- readings) rather than a parallel system - this migration extends
-- what's there and adds what's genuinely new.
--
-- Frozen architecture (see design discussion): one authoritative home
-- per field, no duplication across modules. Common/master fields live
-- directly on assets. Asset-type-specific technical fields (17
-- different technical modules - Road Vehicle, Tipping Body, Refuse
-- Compactor, Hydraulic Excavator, Crane, etc., each with a different
-- field set) are NOT modeled as 17 separate SQL tables - they're
-- stored as structured JSONB (technical_data) driven by an
-- application-level field-definition registry that also powers the
-- dynamic survey form (select Asset Category -> Asset Type -> only
-- relevant fields shown). This trades some raw SQL queryability on
-- the technical fields for the ability to evolve the field list
-- without a constant stream of migrations, given how much this list
-- was refined over the course of design.

-- ---------------------------------------------------------------------
-- assets: common/master fields (Module 01 - Identification & Ownership,
-- Module 02 - Common Technical Information)
-- ---------------------------------------------------------------------

-- asset_category is the new top-level classification (Road Vehicle,
-- Tractor, Trailer, Mobile Construction Equipment, Waste
-- Processing/Collection Equipment, Water Management Equipment,
-- Sewer/Drain Cleaning Equipment, Road Sweeping Equipment, Robotic
-- Equipment, Material Handling Equipment, Workshop/Support Equipment,
-- Other Municipal Equipment) - deliberately a plain VARCHAR, not a
-- CHECK constraint, since this list may still be refined; validated
-- at the application layer against the field-definition registry
-- instead, which is the single source of truth for both categories
-- and types.
--
-- asset_type_detail is the specific technical type within that
-- category (e.g. "Hydraulic Excavator", "Water Tanker") - distinct
-- from the existing coarse asset_type column (vehicle/tricycle/
-- hand_cart), which stays as-is since it's still used by the
-- attendance/driver-assignment side of this system.
ALTER TABLE assets ADD COLUMN asset_category VARCHAR(64);
ALTER TABLE assets ADD COLUMN asset_type_detail VARCHAR(64);
ALTER TABLE assets ADD COLUMN excavator_class VARCHAR(16); -- Mini/Compact/Medium/Large - only meaningful for Hydraulic Excavator, left null otherwise

ALTER TABLE assets ADD COLUMN registration_number VARCHAR(32);
ALTER TABLE assets ADD COLUMN engine_number VARCHAR(64);
ALTER TABLE assets ADD COLUMN manufacturer VARCHAR(128);
ALTER TABLE assets ADD COLUMN model VARCHAR(128);
ALTER TABLE assets ADD COLUMN variant VARCHAR(128);
ALTER TABLE assets ADD COLUMN year_of_manufacture SMALLINT;
ALTER TABLE assets ADD COLUMN date_of_purchase DATE;
ALTER TABLE assets ADD COLUMN date_of_commissioning DATE;

ALTER TABLE assets ADD COLUMN ownership_status VARCHAR(32); -- Owned / Leased / Hired / On-loan etc. - registry-validated, not a hard CHECK, same reasoning as asset_category
ALTER TABLE assets ADD COLUMN owner VARCHAR(128); -- who legally owns it (Municipal Corporation / State Government / Other) - distinct from manufacturer
ALTER TABLE assets ADD COLUMN current_service_provider VARCHAR(128); -- who currently maintains it, if anyone specific - optional

ALTER TABLE assets ADD COLUMN present_location_yard VARCHAR(255);
ALTER TABLE assets ADD COLUMN department_section VARCHAR(128);
ALTER TABLE assets ADD COLUMN assigned_ward_zone VARCHAR(128);

-- Module 02 - Common Technical Information (the handful of fields
-- genuinely universal across every asset category, per the frozen
-- architecture - everything else lives in technical_data below).
ALTER TABLE assets ADD COLUMN fuel_energy_type VARCHAR(32);
ALTER TABLE assets ADD COLUMN operating_weight NUMERIC(10,2);
ALTER TABLE assets ADD COLUMN asset_length_mm NUMERIC(10,2);
ALTER TABLE assets ADD COLUMN asset_width_mm NUMERIC(10,2);
ALTER TABLE assets ADD COLUMN asset_height_mm NUMERIC(10,2);

-- The asset-type-specific technical module fields (Tipping Body,
-- Refuse Compactor, Water Tanker/Sprinkler, Suction/Jetting, Tractor,
-- Excavator Family, Backhoe Loader, Standalone Loader, Crane/Lifting,
-- Forklift, Robotic Cleaning, Road Sweeper, Container Handling, Small
-- Collection/EV, Mobile Workshop) - shape depends entirely on
-- asset_type_detail, resolved against the field-definition registry.
ALTER TABLE assets ADD COLUMN technical_data JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------
-- Meter readings (Module 03) - current-state fields live on assets
-- itself (there's exactly one "current" reading per asset at any
-- time); the historical trail of readings over time already exists
-- as asset_logbook (migration 032) and isn't duplicated here.
-- ---------------------------------------------------------------------
ALTER TABLE assets ADD COLUMN meter_type VARCHAR(16); -- Mechanical / Digital / Not available
ALTER TABLE assets ADD COLUMN meter_functional BOOLEAN;
ALTER TABLE assets ADD COLUMN current_reading_date DATE;
ALTER TABLE assets ADD COLUMN current_reading_verified_by VARCHAR(255);

-- ---------------------------------------------------------------------
-- Condition Assessment (Module 06) + Safety Assessment (Module 07) +
-- Utilisation & Operations (Module 05) + AMC/CMC Assessment (Module 10)
--
-- Modeled as one repeatable "survey event" table rather than fields
-- glued onto assets, since a re-survey should be possible later
-- without losing the history of what was assessed before - the most
-- recent row per asset is the asset's current standing.
-- ---------------------------------------------------------------------
CREATE TABLE asset_baseline_surveys (
  id                          BIGSERIAL PRIMARY KEY,
  asset_id                    BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  survey_date                 DATE NOT NULL DEFAULT CURRENT_DATE,
  surveyed_by                 VARCHAR(255) NOT NULL,

  -- Component Condition (06.A) - per-component 1(Excellent)-5(Non-functional)
  -- scores; which components apply varies by asset type (Mechanical/
  -- Electrical/Structural/Tyres-Tracks groupings from the design), so
  -- stored as JSONB keyed by component name rather than one column per
  -- component.
  component_condition         JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Overall Asset Status (06.B) - derived/confirmed by the surveyor from
  -- the component scores, not purely computed, since judgment can override.
  overall_status               VARCHAR(48), -- Operational-Good / Operational-Minor defects / Operational-Major repair required / Non-operational-Repairable / Beyond Economical Repair-Proposed for Disposal

  -- Safety Status (07) - deliberately independent of mechanical
  -- condition (a mechanically "Fair" asset can still be unsafe due to
  -- one critical defect).
  safety_status                VARCHAR(32), -- Safe for operation / Operation restricted / Unsafe - do not operate

  -- Administrative Disposition - separate from condition, per the
  -- frozen design (e.g. "Awaiting disposal" isn't a condition, it's an
  -- administrative state).
  administrative_disposition   VARCHAR(48),

  -- AMC/CMC Assessment (Module 10) - procurement-facing classification,
  -- kept as its own field per the frozen design (Spare/standby removed
  -- from this list, moved to deployment_status below).
  amc_disposition               VARCHAR(4), -- A/B/C/D/E
  deployment_status             VARCHAR(32), -- Operationally deployed / Standby / Under repair / Awaiting repair / Awaiting disposal / Not deployed / Other

  -- Utilisation & Operations (Module 05) - a snapshot as of this survey,
  -- not a running total; average figures as told to/observed by the
  -- surveyor. Grouped as JSONB since this is a fairly large, cohesive
  -- block (deployment, usage, reliability figures) that's always
  -- captured together and doesn't need individual-column queryability.
  utilisation_data              JSONB NOT NULL DEFAULT '{}'::jsonb,
  utilisation_data_source       VARCHAR(32), -- GPS/telematics / Logbook / Weighbridge / Operator statement / Supervisor estimate / Other / No data available

  notes                         TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_asset_baseline_surveys_asset ON asset_baseline_surveys (asset_id, survey_date DESC);

-- ---------------------------------------------------------------------
-- Defect & Repair Register (Module 08) - the one authoritative,
-- structured, repeatable defect record. Replaces the earlier flat
-- "existing defects"/"pending repairs" fields entirely - those never
-- became separate columns anywhere, so there's nothing to migrate away
-- from.
-- ---------------------------------------------------------------------
CREATE TABLE asset_defects (
  id                            BIGSERIAL PRIMARY KEY,
  asset_id                      BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  survey_id                     BIGINT REFERENCES asset_baseline_surveys(id), -- which survey this defect was recorded during, if any (nullable - a defect can also be logged outside a formal survey)
  component                     VARCHAR(128) NOT NULL,
  sub_component                 VARCHAR(128),
  description                   TEXT NOT NULL,
  severity                      VARCHAR(16) NOT NULL CHECK (severity IN ('Critical', 'Major', 'Moderate', 'Minor')),
  safety_critical                BOOLEAN NOT NULL DEFAULT FALSE,
  operational_despite_defect     BOOLEAN NOT NULL DEFAULT TRUE,
  repair_priority                 VARCHAR(24) CHECK (repair_priority IN ('Immediate', 'Within 7 days', 'Within 30 days', 'Routine', 'Monitor')),
  recommended_action              TEXT,
  spare_part_required              TEXT,
  estimated_repair_cost             NUMERIC(12,2),
  estimated_downtime                VARCHAR(64),
  repair_required_before_deployment  BOOLEAN NOT NULL DEFAULT FALSE,
  repair_status                       VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (repair_status IN ('open', 'in_progress', 'resolved', 'deferred')),
  logged_by                            VARCHAR(255) NOT NULL,
  logged_at                            TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at                          TIMESTAMPTZ,
  resolved_notes                       TEXT
);
CREATE INDEX idx_asset_defects_asset ON asset_defects (asset_id, repair_status);

-- ---------------------------------------------------------------------
-- Maintenance History (Module 09) - extends the EXISTING
-- asset_maintenance_log (migration 028) rather than creating a
-- competing table, per the frozen "one authoritative home" principle.
-- The baseline survey's "last known service" / "last major repair"
-- become the first rows inserted here (log_type='service' /
-- log_type='repair' respectively), with data_confidence reflecting
-- that they're being entered from legacy/undocumented information
-- rather than logged live.
-- ---------------------------------------------------------------------
ALTER TABLE asset_maintenance_log ADD COLUMN meter_reading NUMERIC(12,2);
ALTER TABLE asset_maintenance_log ADD COLUMN work_order_number VARCHAR(64);
ALTER TABLE asset_maintenance_log ADD COLUMN workshop_service_provider VARCHAR(128);
ALTER TABLE asset_maintenance_log ADD COLUMN components_replaced TEXT;
ALTER TABLE asset_maintenance_log ADD COLUMN cost NUMERIC(12,2);
ALTER TABLE asset_maintenance_log ADD COLUMN data_confidence VARCHAR(32); -- Verified documentary record / Workshop record / Operator-logbook record / Verbal information / Estimated / No record

-- ---------------------------------------------------------------------
-- Photographs & Evidence (Module 11) - stored as bytea directly in
-- Postgres, matching the existing pattern used for shop agreement
-- documents (shop_agreement_documents, migration 041) rather than
-- introducing external file storage this system doesn't otherwise have.
-- photo_type covers both the fixed identification set (front/rear/
-- left/right/number_plate/chassis_engine_plate) and ad hoc evidence
-- (defect photos, meter reading photos, supporting documents for a
-- maintenance record).
-- ---------------------------------------------------------------------
CREATE TABLE asset_photos (
  id            BIGSERIAL PRIMARY KEY,
  asset_id      BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  photo_type    VARCHAR(32) NOT NULL CHECK (photo_type IN (
                  'front', 'rear', 'left', 'right', 'number_plate', 'chassis_engine_plate',
                  'defect', 'meter_reading', 'maintenance_document', 'other'
                )),
  defect_id     BIGINT REFERENCES asset_defects(id), -- set when photo_type = 'defect'
  maintenance_log_id BIGINT REFERENCES asset_maintenance_log(id), -- set when photo_type = 'maintenance_document'
  file_data     BYTEA NOT NULL,
  file_name     VARCHAR(255) NOT NULL,
  file_size     INTEGER NOT NULL,
  mime_type     VARCHAR(64) NOT NULL,
  uploaded_by   VARCHAR(255) NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_asset_photos_asset ON asset_photos (asset_id, photo_type);
