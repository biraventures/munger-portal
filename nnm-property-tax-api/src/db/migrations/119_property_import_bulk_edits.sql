-- Record of bulk corrections made to a staged (not yet integrated) holding during review,
-- e.g. the City Manager setting the solid waste user charge type to "Residential House" for
-- holdings whose floors are all residential. Each entry: {field, from, to, by, at, reason}.
ALTER TABLE property_import_staging ADD COLUMN IF NOT EXISTS bulk_edits JSONB NOT NULL DEFAULT '[]'::jsonb;
