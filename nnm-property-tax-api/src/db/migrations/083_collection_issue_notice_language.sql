-- The City Manager can now generate a collection-issue notice
-- (migration 081) in English or Hindi - same statutory notice,
-- worded in the chosen language. Records which one was actually
-- issued, defaulting existing rows to English since that's what they
-- were generated in.
ALTER TABLE collection_issue_notices ADD COLUMN language VARCHAR(2) NOT NULL DEFAULT 'en';
ALTER TABLE collection_issue_notices ADD CONSTRAINT chk_collection_issue_notices_language CHECK (language IN ('en', 'hi'));
