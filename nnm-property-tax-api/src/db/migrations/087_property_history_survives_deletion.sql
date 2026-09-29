-- property_history exists specifically to be a durable audit trail of
-- every property/floor change "for future reference" - but until now,
-- deleting a holding (propertyDelete.service.ts, or the bulk spaced-
-- holding cleanup in propertyBulkCleanup.service.ts) deleted its
-- property_history rows right along with everything else, because the
-- FK below forced it to (a properties row can't be deleted while
-- property_history rows still reference it). That silently destroyed
-- the exact audit trail the table exists to keep, for every deleted
-- holding.
--
-- Dropping the FK lets property_history keep rows for a holding_no
-- that no longer has a live properties row - an audit log is allowed
-- to outlive the thing it audited. The (holding_no, version) unique
-- constraint and the holding_no index are untouched, so history is
-- still fully queryable/exportable per holding after deletion.
ALTER TABLE property_history DROP CONSTRAINT property_history_holding_no_fkey;

-- Widened so the deletion itself can be recorded as a final history
-- row (action = 'Deleted') rather than just vanishing along with the
-- property - see propertyDelete.service.ts / propertyBulkCleanup.service.ts.
ALTER TABLE property_history DROP CONSTRAINT property_history_action_check;
ALTER TABLE property_history ADD CONSTRAINT property_history_action_check
  CHECK (action IN ('Created', 'Updated', 'Deleted'));
