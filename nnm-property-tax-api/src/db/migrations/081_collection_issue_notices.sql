-- A formal legal notice the City Manager generates against a
-- collection_issues entry (migration 079) - one of six standard
-- formats matching the issue type, citing the relevant provisions of
-- the Bihar Municipal Act, 2007 and the Bihar Property Tax
-- (Assessment, Collection and Recovery) Rules, 2013, and referencing
-- the holding's demand notice (demand_notices, migration 001) that
-- was outstanding when the issue was reported.
CREATE TABLE collection_issue_notices (
  id                        BIGSERIAL PRIMARY KEY,
  collection_issue_id       BIGINT NOT NULL REFERENCES collection_issues(id),
  notice_no                 VARCHAR(64) NOT NULL UNIQUE,
  holding_no                VARCHAR(32) NOT NULL REFERENCES properties(holding_no),
  demand_no                 VARCHAR(32) REFERENCES demand_notices(demand_no),
  issue_type                VARCHAR(32) NOT NULL,
  generated_by_username     VARCHAR(64) NOT NULL,
  generated_by_display_name VARCHAR(255) NOT NULL,
  generated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_collection_issue_notices_issue_id ON collection_issue_notices (collection_issue_id);
CREATE INDEX idx_collection_issue_notices_holding_no ON collection_issue_notices (holding_no);
