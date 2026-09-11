-- Assistant Town Planning Supervisor (ATPS) - a new admin role whose
-- job is to walk holdings and assign GPS coordinates to them, plus
-- map municipal infrastructure (roads/drains/canals). Search/edit
-- scoped to this purpose only - no financial or approval-chain
-- authority, matching how Tax Daroga/Tax Collector-style roles are
-- scoped.
--
-- "assistant_town_planning_supervisor" itself is 34 characters,
-- exceeding the existing VARCHAR(32) - widened here rather than
-- shortening the role name, since this column is otherwise unrelated
-- to the fixed-length approval-chain role columns elsewhere (stage,
-- reviewed_role, etc.) that this role never appears in.
ALTER TABLE admins ALTER COLUMN role TYPE VARCHAR(64);
ALTER TABLE admins DROP CONSTRAINT admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('tax_daroga', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner', 'stall_prabhari', 'city_manager', 'trade_license_nodal', 'assistant_town_planning_supervisor'));

-- ---------------------------------------------------------------------
-- Holding geometry - a point for smaller holdings, a full boundary
-- polygon for larger ones. The point/polygon threshold itself lives
-- in application code (not enforced here), since the ATPS may
-- reasonably need to override it for an irregularly-shaped plot -
-- this column only records which geometry type was actually used,
-- not which one the threshold would have suggested.
--
-- Coordinates are stored as JSONB rather than a PostGIS geometry
-- column, since this system has no PostGIS extension enabled and
-- doesn't otherwise need spatial queries (nearest-neighbor, contains,
-- intersects) - only capture, display, and flat-file export. A point
-- is {"lat": ..., "lng": ...}; a polygon is an ordered array of the
-- same shape tracing the boundary.
-- ---------------------------------------------------------------------
ALTER TABLE properties ADD COLUMN geometry_type VARCHAR(10) CHECK (geometry_type IS NULL OR geometry_type IN ('point', 'polygon'));
ALTER TABLE properties ADD COLUMN geometry_coordinates JSONB;
ALTER TABLE properties ADD COLUMN geometry_captured_by VARCHAR(255);
ALTER TABLE properties ADD COLUMN geometry_captured_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------
-- Municipal infrastructure lines - roads, drains, and canals mapped
-- by the ATPS, independent of any specific holding. A line is an
-- ordered array of {"lat","lng"} points, same shape as a polygon's
-- coordinates above but not closed into a loop.
-- ---------------------------------------------------------------------
CREATE TABLE infrastructure_lines (
  id                BIGSERIAL PRIMARY KEY,
  name              VARCHAR(255) NOT NULL,
  line_type         VARCHAR(16) NOT NULL CHECK (line_type IN ('road', 'drain', 'canal')),
  coordinates       JSONB NOT NULL,
  created_by        VARCHAR(255) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_modified_by  VARCHAR(255),
  last_modified_at  TIMESTAMPTZ
);
CREATE INDEX idx_infrastructure_lines_type ON infrastructure_lines (line_type);
