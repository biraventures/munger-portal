-- When marking a light damaged/non-functional, the reporter may know
-- it's actually been out since an earlier date than today (they're
-- just the one reporting it now) - non_functional_since captures that
-- claimed start date, and local_source_name who a local resident or
-- other on-the-ground source is that confirms it, for accountability.
-- Both optional: not every report will have this detail.
ALTER TABLE light_faults ADD COLUMN non_functional_since DATE;
ALTER TABLE light_faults ADD COLUMN local_source_name VARCHAR(255);
