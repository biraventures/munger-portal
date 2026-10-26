-- One signed receiving copy per demand notice (was up to 2). Copies already on file are left as they are
-- (NOT VALID skips existing rows); every new upload must be copy 1, and UNIQUE (demand_no, copy_no) then
-- allows only one per notice.
ALTER TABLE demand_notice_receiving_copies DROP CONSTRAINT IF EXISTS receiving_copy_single;
ALTER TABLE demand_notice_receiving_copies ADD CONSTRAINT receiving_copy_single CHECK (copy_no = 1) NOT VALID;
