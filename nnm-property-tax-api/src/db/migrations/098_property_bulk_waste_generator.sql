-- Bulk Waste Generator (BWG) flag. Some holding owners have registered
-- as a Bulk Waste Generator on the SPCB website and undertaken to
-- manage their own waste, so the solid waste user charge must not be
-- levied on them. When TRUE, calculateSolidWasteCharge() returns 0, so
-- the charge drops out of the property page, demand notices, receipts
-- and the payable total (see charges.service.ts).
ALTER TABLE properties ADD COLUMN is_bwg BOOLEAN NOT NULL DEFAULT FALSE;
