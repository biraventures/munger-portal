-- Slum-area flag. The 100% holding-tax relief for holdings below 250 sq ft
-- is given ONLY when the holding is in a slum area AND is below 250 sq ft.
-- Existing holdings default to FALSE (not in a slum), so they stop
-- receiving the relief until they are marked as slum holdings.
ALTER TABLE properties ADD COLUMN is_slum BOOLEAN NOT NULL DEFAULT FALSE;
