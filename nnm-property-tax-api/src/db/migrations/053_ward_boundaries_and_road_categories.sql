-- Ward boundaries - one polygon per ward, primarily populated via KML
-- import (a municipal ward's official boundary already exists as a
-- KML in most GIS workflows) rather than manual point-by-point
-- capture, though the same coordinates JSONB shape as holdings/lines
-- is used throughout for consistency, and nothing here stops adding
-- one by hand later if needed.
CREATE TABLE ward_boundaries (
  id                BIGSERIAL PRIMARY KEY,
  ward_number       VARCHAR(16) NOT NULL,
  coordinates       JSONB NOT NULL,
  source_file_name  VARCHAR(255),
  created_by        VARCHAR(255) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_modified_by  VARCHAR(255),
  last_modified_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_ward_boundaries_ward_number ON ward_boundaries (ward_number);

-- Road classification, reusing the same PMR/Principal Main Road, MR/
-- Main Road, OR/Other Road categories already used for a property's
-- road_type (src/types/property.types.ts RoadType) rather than
-- introducing a second, inconsistent classification scheme. Only
-- meaningful when line_type = 'road' - left NULL for drains/canals.
ALTER TABLE infrastructure_lines ADD COLUMN road_category VARCHAR(8) CHECK (road_category IS NULL OR road_category IN ('PMR', 'MR', 'OR'));

-- Where a line came from a KML import, same as ward_boundaries above.
ALTER TABLE infrastructure_lines ADD COLUMN source_file_name VARCHAR(255);
