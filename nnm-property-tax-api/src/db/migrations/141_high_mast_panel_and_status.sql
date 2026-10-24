-- High Mast survey sheet columns the bulk import did not keep (highMastBulkImport.service.ts):
--   panel_status      - the control panel: working / not working ("OK" in the sheet = working)
--   functional_status - the tower as surveyed: functional / partially functional / non-functional. The working /
--                       not-working shown on the dashboards still comes from open faults; this records the survey.
ALTER TABLE lights
  ADD COLUMN IF NOT EXISTS panel_status VARCHAR(16) CHECK (panel_status IS NULL OR panel_status IN ('working', 'not_working')),
  ADD COLUMN IF NOT EXISTS functional_status VARCHAR(24)
    CHECK (functional_status IS NULL OR functional_status IN ('functional', 'partially_functional', 'non_functional'));
