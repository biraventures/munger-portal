-- Two new admins-side roles: JE-Mechanical and AE-Mechanical, who
-- (along with the existing tax_surveyor, tax_collector, tax_daroga,
-- and stall_prabhari roles) can report a streetlight fault while out
-- in the field on their regular property-tax work. Distinct from the
-- existing streetlight_je/streetlight_ae roles in attendance_users,
-- which are dedicated streetlight department staff.
ALTER TABLE admins DROP CONSTRAINT admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('tax_daroga', 'tax_surveyor', 'tax_collector', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner', 'stall_prabhari', 'city_manager', 'trade_license_nodal', 'assistant_town_planning_supervisor', 'assistant_architect', 'je_mechanical', 'ae_mechanical'));

-- A street segment: one street's worth of lights from ONE agency
-- within one ward (a street with both NN and EESL lights gets two
-- segment rows, matching how the source spreadsheets are already
-- kept separate). GPS belongs to the segment's two endpoints, not to
-- individual lights - the whole point of going street-wise instead of
-- tagging each light - and is meant to be filled in after the initial
-- bulk import, hence nullable.
CREATE TABLE street_segments (
  id                  BIGSERIAL PRIMARY KEY,
  ward_id             BIGINT NOT NULL REFERENCES attendance_wards(id),
  installation_agency_id BIGINT NOT NULL REFERENCES installation_agencies(id),
  start_point         VARCHAR(255) NOT NULL,
  intermediate_point  VARCHAR(255),
  end_point           VARCHAR(255),
  light_count         INTEGER NOT NULL CHECK (light_count > 0),
  start_gps_lat       NUMERIC(10,7),
  start_gps_lng       NUMERIC(10,7),
  end_gps_lat         NUMERIC(10,7),
  end_gps_lng         NUMERIC(10,7),
  created_by          VARCHAR(255) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_street_segments_ward ON street_segments (ward_id);

-- Each light on a street-wise segment still gets its own row in the
-- existing lights registry (so light_faults.light_id keeps working
-- unchanged), linked back to the segment it belongs to.
-- light_serial_seq is its 1-based position from the start point -
-- what "the 3rd light from the start" means for the numbering
-- format. latitude/longitude were per-light before; a segment-linked
-- light instead carries its GPS on the segment, so they're now
-- nullable.
ALTER TABLE lights ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE lights ALTER COLUMN longitude DROP NOT NULL;
ALTER TABLE lights ADD COLUMN segment_id BIGINT REFERENCES street_segments(id);
ALTER TABLE lights ADD COLUMN light_serial_seq INTEGER;
CREATE INDEX idx_lights_segment ON lights (segment_id);

-- Faults can now also come from an admins-side reporter (Tax
-- Surveyor, Tax Collector, Tax Daroga, Stall Prabhari, JE/AE-
-- Mechanical), alongside the existing attendance staff and public
-- channels - all landing in the same light_faults table/workflow.
ALTER TABLE light_faults DROP CONSTRAINT light_faults_reported_by_type_check;
ALTER TABLE light_faults ADD CONSTRAINT light_faults_reported_by_type_check
  CHECK (reported_by_type IN ('staff', 'public', 'admin'));
ALTER TABLE light_faults ADD COLUMN reported_by_admin_username VARCHAR(100) REFERENCES admins(username);

-- Singleton: which attendance_users city_manager the Commissioner has
-- assigned to handle streetlight faults - a single, task-level
-- assignment (not per-reporter, unlike the Tax Collector -> City
-- Manager mapping used for cancellation requests).
CREATE TABLE streetlight_city_manager_assignment (
  id                          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  assigned_city_manager_id    BIGINT REFERENCES attendance_users(id),
  assigned_by                 VARCHAR(255),
  assigned_at                 TIMESTAMPTZ
);
INSERT INTO streetlight_city_manager_assignment (id) VALUES (1);
