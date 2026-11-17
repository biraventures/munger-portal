-- Resolving the holdings of a bulk upload that did not go live (importResolution.service.ts): kept out, cannot be
-- imported (blocking issue), failed at integration, or rows of the file that could not be staged at all. The Tax
-- Daroga proposes a resolution - correct the data and import, import as it is, or drop - and it goes up the chain:
-- City Manager, DMC, then the Municipal Commissioner, whose approval carries it out. Anyone up the chain can revert it
-- to the Tax Daroga with a comment.
-- A holding blocked because the same holding number already exists live can instead be MERGED into the live holding:
-- field by field the Tax Daroga keeps the live value or takes the uploaded one, adds the uploaded receipts / notices /
-- tax history / change history; the plan (with every rejected value) is kept here and in the holding history.
CREATE TABLE IF NOT EXISTS import_resolution_cases (
  id               BIGSERIAL PRIMARY KEY,
  batch_id         INTEGER NOT NULL REFERENCES property_import_batches(id) ON DELETE CASCADE,
  -- A staged holding (kept out / blocked / failed), or a row of the file that could not be staged.
  kind             VARCHAR(12) NOT NULL CHECK (kind IN ('staged', 'upload_row')),
  staging_id       BIGINT REFERENCES property_import_staging(id) ON DELETE CASCADE,
  error_index      INTEGER,
  holding_no       TEXT,
  problem          TEXT NOT NULL,
  action           VARCHAR(16) NOT NULL CHECK (action IN ('correct_import', 'import_as_is', 'drop', 'merge')),
  -- The corrected Master row and Floors rows (null = unchanged).
  proposed_master  JSONB,
  proposed_floors  JSONB,
  -- Merge: {plan, comparison} - the choices and both values of every field / row at the time of the proposal.
  proposed_merge   JSONB,
  remarks          TEXT NOT NULL,
  stage            VARCHAR(24) NOT NULL DEFAULT 'city_manager'
                   CHECK (stage IN ('city_manager', 'deputy_commissioner', 'commissioner', 'tax_daroga', 'done')),
  status           VARCHAR(12) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reverted', 'approved', 'failed')),
  outcome          TEXT,
  -- [{stage, action, by, role, at, comment}]
  events           JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by       TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT irc_target CHECK ((kind = 'staged' AND staging_id IS NOT NULL) OR (kind = 'upload_row' AND error_index IS NOT NULL))
);
-- One live case per item (a reverted case is reopened by the Tax Daroga; an approved / failed one is history).
CREATE UNIQUE INDEX IF NOT EXISTS uq_irc_staged_live ON import_resolution_cases (staging_id) WHERE kind = 'staged' AND status IN ('open', 'reverted');
CREATE UNIQUE INDEX IF NOT EXISTS uq_irc_row_live ON import_resolution_cases (batch_id, error_index) WHERE kind = 'upload_row' AND status IN ('open', 'reverted');
CREATE INDEX IF NOT EXISTS idx_irc_batch ON import_resolution_cases (batch_id, status, stage);
