-- Each change request now carries its own approval tier and the stage
-- its chain must reach before being applied — not every edit needs to
-- travel all the way to Commissioner anymore. See
-- changeClassification.service.ts for how the tier is determined.
ALTER TABLE property_change_requests ADD COLUMN approval_tier VARCHAR(20) NOT NULL DEFAULT 'mutation';
ALTER TABLE property_change_requests ADD COLUMN final_stage VARCHAR(30) NOT NULL DEFAULT 'commissioner';

CREATE INDEX idx_change_requests_tier ON property_change_requests (approval_tier);