-- Trade licence notices are printed (and signed) by the Trade Licence Prabhari or the City Manager, or printed by the
-- Tax Collector for the City Manager's signature. The printing login's role decides the signatory on the sheet, and
-- is kept so a reprint carries the same signatory.
ALTER TABLE trade_license_notices ADD COLUMN IF NOT EXISTS printed_by_role VARCHAR(32);
