-- Freezes the floor-wise breakdown (the per-floor table already shown
-- on the ORIGINAL demand notice / receipt, via notice-view.tsx and
-- receipt-view.tsx) onto the row at generation/payment time, following
-- the exact same "compute once, never re-derive on reprint" pattern as
-- migration 024's scalar totals: a later edit to a property's floors
-- must never change what a reprint of an already-issued document shows.
--
-- Nullable, same reasoning as migration 024 - existing demand notices
-- and receipts issued before this column existed have nothing to
-- backfill this from (the per-floor detail was computed at the time
-- but never persisted anywhere), so they will continue to show no
-- floor-wise table on reprint, same as they do today.
ALTER TABLE demand_notices ADD COLUMN floor_breakdown JSONB;
ALTER TABLE transactions ADD COLUMN floor_breakdown JSONB;
